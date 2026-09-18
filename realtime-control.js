import { canonicalAiSubject, personalAiSubjectCandidates, resolveCanonicalEkodiIdentity } from './personal-ai-bridge.js';
import { entitlementSnapshot, evaluateRealtimeRequest, resolveRealtimeTier } from './src/realtime/entitlement.mjs';
import { planAdaptiveMedia } from './src/realtime/adaptive-media.mjs';
import { realtimeTenant, realtimeTenantAliases, realtimeTenantList } from './realtime-tenant-registry.js';

const PREFIX='/api/realtime';
const PROVIDER_BASE='https://rtc.live.cloudflare.com/v1';
const ADMIN_ROLES=new Set(['owner','admin','tenant_admin','manager','operator']);
const ROLE_ALIASES=Object.freeze({store_owner:'owner',hq_manager:'manager',client_admin:'owner',client_editor:'operator',marketing_manager:'operator'});

function clean(value,max=240){return String(value??'').trim().slice(0,max)}
function slug(value){const v=clean(value,80).toLowerCase();return /^[a-z0-9][a-z0-9-]{0,79}$/.test(v)?v:''}
function uid(prefix){return `${prefix}_${crypto.randomUUID().replaceAll('-','')}`}
function bearer(request){const raw=clean(request.headers.get('authorization'),8192);return raw.toLowerCase().startsWith('bearer ')?raw.slice(7).trim():''}
function originAllowed(request,env){const origin=clean(request.headers.get('origin'),300);if(!origin)return '';const allowed=new Set(clean(env.ALLOWED_ORIGINS,20000).split(',').map(x=>x.trim()).filter(Boolean));return allowed.has(origin)?origin:''}
function cors(request,env){const origin=originAllowed(request,env);const headers={'access-control-allow-methods':'GET, POST, PUT, OPTIONS','access-control-allow-headers':'authorization, content-type, x-ekodi-session-key','access-control-max-age':'86400','vary':'Origin'};if(origin)headers['access-control-allow-origin']=origin;return headers}
function json(request,env,data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...cors(request,env)}})}
async function body(request){try{return await request.json()}catch{return null}}
async function sha256(value){const bytes=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function centralAdminIdentity(token,env){
  if(!env.DB||!token||token.length>256)return null;
  const hash=await sha256(token),now=new Date().toISOString();
  const admin=await env.DB.prepare(`SELECT admins.email,admins.role,sessions.expires_at FROM sessions JOIN admins ON admins.id=sessions.admin_id WHERE sessions.token_hash=? AND sessions.expires_at>?`).bind(hash,now).first().catch(()=>null);
  if(!admin||clean(admin.role,40).toLowerCase()!=='super_admin')return null;
  const email=clean(admin.email,254).toLowerCase();if(!email)return null;
  return {id:`platform-admin:${await sha256(email)}`,authUserId:`platform-admin:${await sha256(email)}`,email,personId:null,ekodiId:null,loginProvider:'ekodi-admin',canonical:false,authorized:true,token,contexts:[],platformAdminRole:'super_admin'};
}
export async function currentIdentity(request,env){
  const token=bearer(request);if(!token)return null;
  const base=clean(env.MY_SUPABASE_URL||env.SUPABASE_URL,500).replace(/\/$/,'');
  const key=clean(env.MY_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY,1000);
  if(!base||!key)return centralAdminIdentity(token,env);
  const auth=await fetch(`${base}/auth/v1/user`,{headers:{apikey:key,authorization:`Bearer ${token}`}}).catch(()=>null);
  if(!auth?.ok)return centralAdminIdentity(token,env);
  const user=await auth.json();
  const email=clean(user?.email,254).toLowerCase();
  if(!user?.id||!email||!user?.email_confirmed_at)return null;
  const identity=await resolveCanonicalEkodiIdentity({token,authUser:{id:String(user.id),email},supabaseUrl:base,publishableKey:key});
  let contexts=[];
  try{
    const response=await fetch(`${base}/rest/v1/rpc/current_site_activity_contexts`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'});
    if(response.ok){const raw=await response.json();contexts=(Array.isArray(raw)?raw:[]).map(row=>({tenantId:clean(row?.tenant_id,120),tenant:slug(row?.tenant),authorizationRole:clean(row?.authorization_role,60).toLowerCase(),activityRole:clean(row?.activity_role,60).toLowerCase()}));}
  }catch(error){console.error('realtime contexts',error?.message||error)}
  return {...identity,token,email,contexts};
}

function normalizeRealtimeRole(role=''){const value=clean(role,60).toLowerCase();return ROLE_ALIASES[value]||value}
function tenantMatches(context,tenant){
  const aliases=realtimeTenantAliases(tenant);
  return aliases.has(context?.tenant)||aliases.has(slug(context?.tenantId));
}
export function authorizationRole(identity,tenant,env){
  if(!identity)return '';
  if(identity.platformAdminRole==='super_admin')return 'owner';
  if(identity.email&&identity.email===clean(env.ADMIN_EMAIL,254).toLowerCase())return 'owner';
  return normalizeRealtimeRole(identity.contexts?.find(context=>tenantMatches(context,tenant))?.authorizationRole||'');
}
async function resolveAuthorizationRole(identity,tenant,env){
  const direct=authorizationRole(identity,tenant,env);if(direct)return direct;
  const config=realtimeTenant(tenant);if(!identity?.email||!env.DB||!config)return '';
  const row=await env.DB.prepare(`SELECT g.role FROM customer_tenants t JOIN customer_access_grants g ON g.tenant_id=t.id WHERE t.slug=? AND t.status='active' AND lower(g.email)=? AND g.enabled=1 LIMIT 1`).bind(config.id,identity.email.toLowerCase()).first().catch(()=>null);
  return normalizeRealtimeRole(row?.role||'');
}
async function mediaSubscription(env,identity){
  if(!env.DB||!identity)return null;
  for(const subject of personalAiSubjectCandidates(identity)){
    const row=await env.DB.prepare(`SELECT plan_id,status,monthly_fee,current_period_end FROM service_subscriptions WHERE subject_type='person' AND subject_key=? AND site='media' ORDER BY updated_at DESC LIMIT 1`).bind(subject).first();
    if(row)return row;
  }
  return null;
}
async function entitlementFor(request,env,tenant){
  const identity=await currentIdentity(request,env);
  const role=await resolveAuthorizationRole(identity,tenant,env);
  const subscription=await mediaSubscription(env,identity);
  const tier=resolveRealtimeTier({authorizationRole:role,subscription,authenticated:Boolean(identity)});
  return {identity,role,subscription,tier,snapshot:entitlementSnapshot({authorizationRole:role,subscription,authenticated:Boolean(identity)})};
}
function safeRoom(row){if(!row)return null;return {id:row.id,tenantId:row.tenant_id,mode:row.mode,securityProfile:row.security_profile,title:row.title,status:row.status,aiEnabled:Boolean(row.ai_enabled),recordingEnabled:Boolean(row.recording_enabled),recordingNoticeEnabled:Boolean(row.recording_notice_enabled),anonymousViewersEnabled:Boolean(row.anonymous_viewers_enabled),createdAt:row.created_at,updatedAt:row.updated_at,endedAt:row.ended_at||null}}
async function roomById(env,id){return env.DB.prepare('SELECT * FROM realtime_rooms WHERE id=?').bind(id).first()}
async function ownerAllowed(request,env,room){
  const access=await entitlementFor(request,env,slug(room.tenant_id));
  const subject=access.identity?canonicalAiSubject(access.identity):'';
  return {access,allowed:Boolean(access.identity&&(room.owner_user_id===subject||ADMIN_ROLES.has(access.role)))};
}
async function providerCall(env,path,{method='POST',payload}={}){
  const appId=clean(env.REALTIME_SFU_APP_ID,80),secret=clean(env.REALTIME_SFU_APP_SECRET,200);
  if(!appId||!secret)throw Object.assign(new Error('realtime_provider_not_configured'),{status:503});
  const init={method,headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'}};
  if(payload!==undefined)init.body=JSON.stringify(payload);
  const response=await fetch(`${PROVIDER_BASE}/apps/${encodeURIComponent(appId)}${path}`,init);
  const data=await response.json().catch(()=>({errorCode:'provider_invalid_response'}));
  if(!response.ok||data?.errorCode)throw Object.assign(new Error(data?.errorDescription||data?.errorCode||`realtime_provider_${response.status}`),{status:502,providerStatus:response.status});
  return data;
}
async function publicRoutes(request,env,url){
  if(request.method!=='GET')return null;
  if(url.pathname===`${PREFIX}/health`){
    const providerConfigured=Boolean(clean(env.REALTIME_SFU_APP_ID,80)&&clean(env.REALTIME_SFU_APP_SECRET,200));
    return json(request,env,{ok:true,service:'ekodi-realtime',provider:'cloudflare-realtime',providerConfigured,adaptiveMedia:true,multitenant:true,tenantCount:realtimeTenantList().length,tenantFirst:'ekodichurch'});
  }
  if(url.pathname===`${PREFIX}/live`){
    const config=realtimeTenant(url.searchParams.get('tenant')||'ekodichurch');
    if(!config)return json(request,env,{ok:false,error:'invalid_tenant'},400);
    const tenant=config.apiTenant;
    const aliases=[config.apiTenant,config.id,...config.aliases];
    const placeholders=aliases.map(()=>'?').join(',');
    const row=await env.DB.prepare(`SELECT * FROM realtime_rooms WHERE tenant_id IN (${placeholders}) AND status='live' ORDER BY updated_at DESC LIMIT 1`).bind(...aliases).first();
    return json(request,env,{ok:true,tenant,canonicalTenant:config.id,live:Boolean(row),room:safeRoom(row)});
  }
  const match=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)$/);
  if(match){
    const room=await roomById(env,decodeURIComponent(match[1]));
    if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    if(!room.anonymous_viewers_enabled){
      const access=await entitlementFor(request,env,slug(room.tenant_id));
      if(!access.identity)return json(request,env,{ok:false,error:'authentication_required'},401);
    }
    const tracks=room.status==='live'?await env.DB.prepare(`SELECT track_name,media_kind,source_type,language_code FROM realtime_media_tracks WHERE room_id=? AND status='active' ORDER BY created_at`).bind(room.id).all():{results:[]};
    return json(request,env,{ok:true,room:safeRoom(room),tracks:tracks.results||[]});
  }
  return null;
}

async function createRoom(request,env,tenant,input){
  const config=realtimeTenant(tenant);
  if(!config)return json(request,env,{ok:false,error:'invalid_tenant'},400);
  const canonicalTenant=config.apiTenant;
  const access=await entitlementFor(request,env,canonicalTenant);
  const loginTarget=`https://ekodi.kr${config.path}`;
  if(!access.identity)return json(request,env,{ok:false,error:'authentication_required',loginUrl:`https://ekodi.kr/auth/?site=${encodeURIComponent(config.authSite)}&return_to=${encodeURIComponent(loginTarget)}`},401);
  if(!ADMIN_ROLES.has(access.role))return json(request,env,{ok:false,error:'tenant_host_permission_required'},403);
  const wanted={tier:access.tier,interactiveParticipants:Number(input.interactiveParticipants||1),languages:Array.isArray(input.languages)?input.languages.length:Number(input.languages||0),durationMinutes:Number(input.durationMinutes||0),recording:input.recording!==false,multistream:Boolean(input.multistream)};
  const decision=evaluateRealtimeRequest(wanted);
  if(!decision.allowed)return json(request,env,{ok:false,error:'realtime_entitlement_exceeded',decision,subscriptionUrl:'https://ekodi.kr/my/?service=media'},decision.requiresSubscription?402:403);
  const id=uid('room'),stamp=new Date().toISOString(),owner=canonicalAiSubject(access.identity);
  const mode=clean(input.mode,40)||config.mode;
  const security=clean(input.securityProfile,30)||'standard';
  const title=clean(input.title,160)||config.title;
  const recording=input.recording!==false,notice=recording!==false;
  await env.DB.prepare(`INSERT INTO realtime_rooms (id,tenant_id,owner_user_id,mode,security_profile,title,status,ai_enabled,recording_enabled,recording_notice_enabled,anonymous_viewers_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?, 'created',?,?,?,?,?,?)`).bind(id,canonicalTenant,owner,mode,security,title,input.ai!==false?1:0,recording?1:0,notice?1:0,input.publicViewers===false?0:1,stamp,stamp).run();
  await env.DB.prepare(`INSERT OR REPLACE INTO realtime_room_members (room_id,tenant_id,user_id,role,joined_at,left_at) VALUES (?,?,?,?,?,NULL)`).bind(id,canonicalTenant,owner,'owner',stamp).run();
  return json(request,env,{ok:true,room:safeRoom(await roomById(env,id)),entitlement:decision,studioUrl:`https://ekodi.kr${config.path}?room=${encodeURIComponent(id)}&mode=studio`},201);
}
async function roomMutation(request,env,url,input){
  const statusMatch=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/status$/);
  if(!statusMatch||request.method!=='POST')return null;
  const room=await roomById(env,decodeURIComponent(statusMatch[1]));
  if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
  const auth=await ownerAllowed(request,env,room);
  if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
  const next=clean(input?.status,20);
  if(!['starting','live','ending','ended'].includes(next))return json(request,env,{ok:false,error:'invalid_room_status'},400);
  const stamp=new Date().toISOString(),ended=next==='ended'?stamp:null;
  await env.DB.prepare(`UPDATE realtime_rooms SET status=?,updated_at=?,ended_at=COALESCE(?,ended_at) WHERE id=?`).bind(next,stamp,ended,room.id).run();
  return json(request,env,{ok:true,room:safeRoom(await roomById(env,room.id))});
}

async function planRoute(request,env,url,input){
  const match=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/plan$/);
  if(!match||request.method!=='POST')return null;
  const room=await roomById(env,decodeURIComponent(match[1]));
  if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
  const usage=await env.DB.prepare(`SELECT COALESCE(SUM(cost_microusd),0) cost FROM realtime_usage_events WHERE room_id=?`).bind(room.id).first();
  const plan=planAdaptiveMedia({mode:room.mode,interactiveUsers:Number(input?.interactiveUsers||1),viewers:Number(input?.viewers||0),recordingEnabled:Boolean(room.recording_enabled),budget:{spent:Number(usage?.cost||0),limit:Number(input?.budgetLimitMicrousd||0)},translation:{sourceLanguage:clean(input?.sourceLanguage,12)||'ko',requestedLanguages:Array.isArray(input?.requestedLanguages)?input.requestedLanguages:[],listenerCounts:input?.listenerCounts||{}}});
  return json(request,env,{ok:true,roomId:room.id,plan});
}

async function createMediaSession(request,env,room,requestedRole){
  const role=clean(requestedRole,30)||'viewer';
  let actorKey=`anon:${crypto.randomUUID()}`;
  if(role!=='viewer'||!room.anonymous_viewers_enabled){
    const access=await entitlementFor(request,env,slug(room.tenant_id));
    if(!access.identity)return json(request,env,{ok:false,error:'authentication_required'},401);
    actorKey=canonicalAiSubject(access.identity);
    if(['owner','cohost','presenter'].includes(role)&&room.owner_user_id!==actorKey&&!ADMIN_ROLES.has(access.role))return json(request,env,{ok:false,error:'publish_permission_required'},403);
  }
  const provider=await providerCall(env,'/sessions/new',{method:'POST'});
  const accessKey=`rts_${crypto.randomUUID().replaceAll('-','')}${crypto.randomUUID().replaceAll('-','')}`;
  const id=uid('ms'),stamp=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO realtime_media_sessions (id,room_id,tenant_id,actor_key,role,provider,provider_session_id,access_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,'cloudflare-realtime',?,?,'active',?,?)`).bind(id,room.id,room.tenant_id,actorKey,role,provider.sessionId,await sha256(accessKey),stamp,stamp).run();
  return json(request,env,{ok:true,session:{id,providerSessionId:provider.sessionId,accessKey,role},iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]});
}
async function mediaSession(env,roomId,sessionId,request){
  const row=await env.DB.prepare(`SELECT * FROM realtime_media_sessions WHERE room_id=? AND id=? AND status='active'`).bind(roomId,sessionId).first();
  if(!row)return null;
  const key=clean(request.headers.get('x-ekodi-session-key'),300);
  if(!key||await sha256(key)!==row.access_hash)return null;
  return row;
}


async function createCameraSourceSession(request,env,room,source){
  const provider=await providerCall(env,'/sessions/new',{method:'POST'});
  const accessKey=`rts_${crypto.randomUUID().replaceAll('-','')}${crypto.randomUUID().replaceAll('-','')}`;
  const id=uid('ms'),stamp=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO realtime_media_sessions (id,room_id,tenant_id,actor_key,role,provider,provider_session_id,access_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,'cloudflare-realtime',?,?,'active',?,?)`).bind(id,room.id,room.tenant_id,`camera-source:${source.id}`,'presenter',provider.sessionId,await sha256(accessKey),stamp,stamp).run();
  await env.DB.prepare(`UPDATE realtime_camera_sources SET status='connected',updated_at=? WHERE id=? AND room_id=?`).bind(stamp,source.id,room.id).run();
  return json(request,env,{ok:true,source:{id:source.id,label:source.label,status:'connected'},session:{id,providerSessionId:provider.sessionId,accessKey,role:'presenter'},iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]});
}
async function cameraSourceRoute(request,env,url,input){
  const inviteMatch=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/camera-sources\/invites$/);
  if(inviteMatch&&request.method==='POST'){
    const room=await roomById(env,decodeURIComponent(inviteMatch[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    const auth=await ownerAllowed(request,env,room);if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
    const active=await env.DB.prepare(`SELECT COUNT(*) count FROM realtime_camera_sources WHERE room_id=? AND status IN ('pending','approved','connected')`).bind(room.id).first();
    if(Number(active?.count||0)>=6)return json(request,env,{ok:false,error:'camera_source_limit_reached',limit:6},409);
    const raw=`rcs_${crypto.randomUUID().replaceAll('-','')}${crypto.randomUUID().replaceAll('-','')}`,id=uid('csi'),stamp=new Date().toISOString();
    const ttl=Math.min(30,Math.max(2,Number(input?.expiresMinutes||10))),expires=new Date(Date.now()+ttl*60000).toISOString();
    await env.DB.prepare(`INSERT INTO realtime_camera_source_invites (id,room_id,tenant_id,token_hash,label,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?,?)`).bind(id,room.id,room.tenant_id,await sha256(raw),clean(input?.label,80)||'모바일 카메라',expires,stamp,stamp).run();
    return json(request,env,{ok:true,invite:{id,label:clean(input?.label,80)||'모바일 카메라',status:'pending',expiresAt:expires,joinUrl:`https://ekodi.kr/ekodichurch/live/camera/?invite=${encodeURIComponent(raw)}`}},201);
  }
  const listMatch=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/camera-sources$/);
  if(listMatch&&request.method==='GET'){
    const room=await roomById(env,decodeURIComponent(listMatch[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    const auth=await ownerAllowed(request,env,room);if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
    const rows=await env.DB.prepare(`SELECT id,label,status,created_at,updated_at FROM realtime_camera_sources WHERE room_id=? ORDER BY created_at`).bind(room.id).all();
    return json(request,env,{ok:true,sources:rows.results||[]});
  }
  if(url.pathname===`${PREFIX}/camera-sources/claim`&&request.method==='POST'){
    const raw=clean(input?.inviteToken,300);if(!raw)return json(request,env,{ok:false,error:'camera_source_invite_required'},400);
    const invite=await env.DB.prepare(`SELECT * FROM realtime_camera_source_invites WHERE token_hash=?`).bind(await sha256(raw)).first();
    if(!invite)return json(request,env,{ok:false,error:'invalid_camera_source_invite'},403);
    if(invite.status==='revoked')return json(request,env,{ok:false,error:'camera_source_invite_revoked'},403);
    if(invite.expires_at<=new Date().toISOString()){await env.DB.prepare(`UPDATE realtime_camera_source_invites SET status='expired',updated_at=? WHERE id=?`).bind(new Date().toISOString(),invite.id).run();return json(request,env,{ok:false,error:'camera_source_invite_expired'},403);}
    const room=await roomById(env,invite.room_id);if(!room||!['created','starting','live'].includes(room.status))return json(request,env,{ok:false,error:'room_not_joinable'},409);
    let source=invite.claimed_source_id?await env.DB.prepare(`SELECT * FROM realtime_camera_sources WHERE id=? AND room_id=?`).bind(invite.claimed_source_id,room.id).first():null;
    if(!source){const sid=uid('camsrc'),stamp=new Date().toISOString();await env.DB.prepare(`INSERT INTO realtime_camera_sources (id,room_id,tenant_id,invite_id,label,status,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?)`).bind(sid,room.id,room.tenant_id,invite.id,invite.label,stamp,stamp).run();await env.DB.prepare(`UPDATE realtime_camera_source_invites SET claimed_source_id=?,updated_at=? WHERE id=?`).bind(sid,stamp,invite.id).run();source=await env.DB.prepare(`SELECT * FROM realtime_camera_sources WHERE id=?`).bind(sid).first();}
    if(source.status==='revoked')return json(request,env,{ok:false,error:'camera_source_revoked'},403);
    if(source.status!=='approved')return json(request,env,{ok:true,waitingApproval:true,source:{id:source.id,label:source.label,status:source.status}},202);
    await env.DB.prepare(`UPDATE realtime_camera_source_invites SET status='used',updated_at=? WHERE id=?`).bind(new Date().toISOString(),invite.id).run();
    return createCameraSourceSession(request,env,room,source);
  }
  const actionMatch=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/camera-sources\/([^/]+)\/(approve|revoke)$/);
  if(actionMatch&&request.method==='POST'){
    const room=await roomById(env,decodeURIComponent(actionMatch[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    const auth=await ownerAllowed(request,env,room);if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
    const source=await env.DB.prepare(`SELECT * FROM realtime_camera_sources WHERE id=? AND room_id=?`).bind(decodeURIComponent(actionMatch[2]),room.id).first();if(!source)return json(request,env,{ok:false,error:'camera_source_not_found'},404);
    const next=actionMatch[3]==='approve'?'approved':'revoked',stamp=new Date().toISOString();
    await env.DB.prepare(`UPDATE realtime_camera_sources SET status=?,updated_at=? WHERE id=? AND room_id=?`).bind(next,stamp,source.id,room.id).run();
    if(next==='revoked')await env.DB.prepare(`UPDATE realtime_camera_source_invites SET status='revoked',updated_at=? WHERE id=?`).bind(stamp,source.invite_id).run();
    return json(request,env,{ok:true,source:{id:source.id,label:source.label,status:next}});
  }
  return null;
}

async function sessionRoute(request,env,url,input){
  const match=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/sessions$/);
  if(!match||request.method!=='POST')return null;
  const room=await roomById(env,decodeURIComponent(match[1]));
  if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
  if(!['created','starting','live'].includes(room.status))return json(request,env,{ok:false,error:'room_not_joinable'},409);
  return createMediaSession(request,env,room,input?.role);
}

async function publishTracks(request,env,room,session,input){
  if(!['owner','cohost','presenter'].includes(session.role))return json(request,env,{ok:false,error:'publish_permission_required'},403);
  const offered=Array.isArray(input?.tracks)?input.tracks:[];
  if(!input?.sessionDescription?.sdp||!offered.length)return json(request,env,{ok:false,error:'session_description_and_tracks_required'},400);
  const tracks=offered.slice(0,12).map((track,index)=>({location:'local',mid:clean(track.mid,20),trackName:clean(track.trackName,120)||`track-${index}`}));
  if(tracks.some(track=>!track.mid||!track.trackName))return json(request,env,{ok:false,error:'invalid_track'},400);
  const response=await providerCall(env,`/sessions/${encodeURIComponent(session.provider_session_id)}/tracks/new`,{payload:{sessionDescription:{type:'offer',sdp:String(input.sessionDescription.sdp)},tracks}});
  const stamp=new Date().toISOString();
  for(let index=0;index<tracks.length;index++){
    const source=clean(offered[index]?.sourceType,30)|| (clean(offered[index]?.kind,10)==='audio'?'microphone':'camera');
    const kind=clean(offered[index]?.kind,10)==='audio'?'audio':'video';
    await env.DB.prepare(`INSERT OR REPLACE INTO realtime_media_tracks (id,room_id,tenant_id,publisher_session_id,track_name,media_kind,source_type,language_code,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'active',?,?)`).bind(uid('track'),room.id,room.tenant_id,session.provider_session_id,tracks[index].trackName,kind,['camera','microphone','screen','program','translation'].includes(source)?source:'camera',clean(offered[index]?.languageCode,12)||null,stamp,stamp).run();
  }
  return json(request,env,{ok:true,provider:response,published:tracks.map(track=>track.trackName)});
}

async function pullTracks(request,env,room,session,input){
  const requested=Array.isArray(input?.tracks)?input.tracks:[];
  const available=await env.DB.prepare(`SELECT publisher_session_id,track_name,media_kind,source_type,language_code FROM realtime_media_tracks WHERE room_id=? AND status='active' ORDER BY created_at`).bind(room.id).all();
  const byName=new Map((available.results||[]).map(row=>[row.track_name,row]));
  const selected=(requested.length?requested.map(item=>clean(item?.trackName,120)):Array.from(byName.keys())).filter(Boolean).slice(0,64);
  const rows=selected.map(name=>byName.get(name)).filter(Boolean);
  if(!rows.length)return json(request,env,{ok:true,provider:null,tracks:[],empty:true});
  const tracks=rows.map(row=>({location:'remote',sessionId:row.publisher_session_id,trackName:row.track_name}));
  const response=await providerCall(env,`/sessions/${encodeURIComponent(session.provider_session_id)}/tracks/new`,{payload:{tracks}});
  return json(request,env,{ok:true,provider:response,tracks:rows.map(row=>({trackName:row.track_name,kind:row.media_kind,sourceType:row.source_type,languageCode:row.language_code||null}))});
}

async function renegotiateSession(request,env,room,session,input){
  if(!input?.sessionDescription?.sdp)return json(request,env,{ok:false,error:'session_description_required'},400);
  const type=clean(input.sessionDescription.type,16)||'answer';
  if(type!=='answer')return json(request,env,{ok:false,error:'renegotiation_answer_required'},400);
  const response=await providerCall(env,`/sessions/${encodeURIComponent(session.provider_session_id)}/renegotiate`,{method:'PUT',payload:{sessionDescription:{type:'answer',sdp:String(input.sessionDescription.sdp)}}});
  return json(request,env,{ok:true,provider:response});
}

async function leaveSession(request,env,room,session){
  const stamp=new Date().toISOString();
  await env.DB.prepare(`UPDATE realtime_media_sessions SET status='closed',updated_at=? WHERE id=? AND room_id=?`).bind(stamp,session.id,room.id).run();
  return json(request,env,{ok:true,closed:true});
}

async function sessionMediaRoute(request,env,url,input){
  const match=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/sessions\/([^/]+)\/(publish|pull|renegotiate|leave)$/);
  if(!match)return null;
  const room=await roomById(env,decodeURIComponent(match[1]));
  if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
  const session=await mediaSession(env,room.id,decodeURIComponent(match[2]),request);
  if(!session)return json(request,env,{ok:false,error:'invalid_or_expired_media_session'},403);
  const action=match[3];
  if(action==='publish'&&request.method==='POST')return publishTracks(request,env,room,session,input);
  if(action==='pull'&&request.method==='POST')return pullTracks(request,env,room,session,input);
  if(action==='renegotiate'&&request.method==='PUT')return renegotiateSession(request,env,room,session,input);
  if(action==='leave'&&request.method==='POST')return leaveSession(request,env,room,session);
  return json(request,env,{ok:false,error:'method_not_allowed'},405);
}

export async function handleRealtimeControl(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith(PREFIX))return null;
  if(request.method==='OPTIONS'){
    const origin=clean(request.headers.get('origin'),300);
    if(origin&&!originAllowed(request,env))return json(request,env,{ok:false,error:'origin_forbidden'},403);
    return new Response(null,{status:204,headers:cors(request,env)});
  }
  const publicResponse=await publicRoutes(request,env,url);
  if(publicResponse)return publicResponse;
  let input=null;
  if(['POST','PUT'].includes(request.method)){
    input=await body(request);
    if(!input)return json(request,env,{ok:false,error:'invalid_json'},400);
  }
  if(url.pathname===`${PREFIX}/rooms`&&request.method==='POST'){
    const config=realtimeTenant(input?.tenant||'ekodichurch');
    if(!config)return json(request,env,{ok:false,error:'invalid_tenant'},400);
    return createRoom(request,env,config.apiTenant,input||{});
  }
  const mutation=await roomMutation(request,env,url,input);if(mutation)return mutation;
  const planned=await planRoute(request,env,url,input);if(planned)return planned;
  const cameraSource=await cameraSourceRoute(request,env,url,input);if(cameraSource)return cameraSource;
  const session=await sessionRoute(request,env,url,input);if(session)return session;
  const media=await sessionMediaRoute(request,env,url,input);if(media)return media;
  return json(request,env,{ok:false,error:'realtime_endpoint_not_found'},404);
}

export const REALTIME_CONTROL_CONTRACT=Object.freeze({
  version:'2026-09-18.1',
  prefix:PREFIX,
  canonicalChurchPath:'https://ekodi.kr/ekodichurch/live/',
  multitenant:true,
  tenantCount:realtimeTenantList().length,
  provider:'cloudflare-realtime',
  browserSecrets:false,
  adaptiveMedia:true,
  anonymousPublicViewing:true,
});
