import { canonicalAiSubject, personalAiSubjectCandidates, resolveCanonicalEkodiIdentity } from './personal-ai-bridge.js';
import { entitlementSnapshot, evaluateRealtimeRequest, resolveRealtimeTier } from './src/realtime/entitlement.mjs';
import { planAdaptiveMedia } from './src/realtime/adaptive-media.mjs';
import { realtimeTenant, realtimeTenantAliases, realtimeTenantList } from './realtime-tenant-registry.js';

const PREFIX='/api/realtime';
const PROVIDER_BASE='https://rtc.live.cloudflare.com/v1';
const ADMIN_ROLES=new Set(['owner','admin','tenant_admin','manager','operator']);
const ROLE_ALIASES=Object.freeze({store_owner:'owner',hq_manager:'manager',client_admin:'owner',client_editor:'operator',marketing_manager:'operator'});

function clean(value,max=240){return String(value??'').trim().slice(0,max)}
function parseJson(value,fallback={}){try{return JSON.parse(String(value||''))}catch{return fallback}}
function slug(value){const v=clean(value,80).toLowerCase();return /^[a-z0-9][a-z0-9-]{0,79}$/.test(v)?v:''}
function uid(prefix){return `${prefix}_${crypto.randomUUID().replaceAll('-','')}`}
function bearer(request){const raw=clean(request.headers.get('authorization'),8192);return raw.toLowerCase().startsWith('bearer ')?raw.slice(7).trim():''}
function originAllowed(request,env){const origin=clean(request.headers.get('origin'),300);if(!origin)return '';const allowed=new Set(clean(env.ALLOWED_ORIGINS,20000).split(',').map(x=>x.trim()).filter(Boolean));return allowed.has(origin)?origin:''}
function cors(request,env){const origin=originAllowed(request,env);const headers={'access-control-allow-methods':'GET, POST, PUT, PATCH, DELETE, OPTIONS','access-control-allow-headers':'authorization, content-type, x-ekodi-session-key, x-ekodi-camera-key','access-control-max-age':'86400','vary':'Origin'};if(origin)headers['access-control-allow-origin']=origin;return headers}
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
function platformOwnerEmails(env={}){
  return new Set([clean(env.ADMIN_EMAIL,254),...clean(env.ADMIN_GOOGLE_BOOTSTRAP_EMAILS,4000).split(',').map(v=>v.trim())].map(v=>v.toLowerCase()).filter(Boolean));
}
export function authorizationRole(identity,tenant,env){
  if(!identity)return '';
  if(identity.platformAdminRole==='super_admin')return 'owner';
  if(identity.email&&platformOwnerEmails(env).has(identity.email.toLowerCase()))return 'owner';
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
function safeManagementCameraPair(row){if(!row)return null;return {id:row.id,roomId:row.room_id,tenantId:row.tenant_id,label:row.label||'관리 카메라',status:row.status,createdAt:row.created_at,requestedAt:row.requested_at||null,approvedAt:row.approved_at||null,connectedAt:row.connected_at||null,expiresAt:row.expires_at}}
async function managementCameraPairByCode(env,code){const hash=await sha256('management-camera:'+clean(code,80));return env.DB.prepare('SELECT * FROM realtime_management_camera_pairs WHERE pairing_hash=? LIMIT 1').bind(hash).first()}
async function managementCameraDeviceAllowed(request,row){const key=clean(request.headers.get('x-ekodi-camera-key'),180);if(!key||!row?.device_key_hash)return false;return await sha256('management-camera-device:'+key)===row.device_key_hash}
async function ensureManagementCameraPairActive(env,row){if(!row)return null;if(Date.parse(row.expires_at)>Date.now()&&!['expired','revoked'].includes(row.status))return row;if(!['expired','revoked'].includes(row.status))await env.DB.prepare("UPDATE realtime_management_camera_pairs SET status='expired' WHERE id=?").bind(row.id).run().catch(()=>{});return {...row,status:row.status==='revoked'?'revoked':'expired'}}

function safeDestination(row,extra={}){
  if(!row)return null;
  return {
    id:row.id,
    roomId:row.room_id,
    tenantId:row.tenant_id,
    type:row.destination_type,
    status:row.status,
    failureCount:Number(row.failure_count||0),
    lastErrorCode:row.last_error_code||null,
    updatedAt:row.updated_at,
    ...extra,
  };
}
function externalDestinationId(value){const raw=clean(value,80);return /^channel:\d+$/.test(raw)?raw:''}
async function destinationCatalogRows(env,tenant){
  const config=realtimeTenant(tenant);if(!config||!env.DB)return [];
  const aliases=[config.apiTenant,config.id,...config.aliases].filter(Boolean);
  const placeholders=aliases.map(()=>'?').join(',');
  let rows=[];
  try{
    const result=await env.DB.prepare(`SELECT id,subject_key,provider,channel_type,display_name,external_account_id,status,config_json,credential_ref,updated_at
      FROM marketing_publish_channels WHERE subject_type='tenant' AND subject_key IN (${placeholders}) ORDER BY updated_at DESC,id DESC`).bind(...aliases).all();
    rows=result.results||[];
  }catch(error){console.warn('realtime destination catalog',error?.message||error)}
  const distributionReady=Boolean(env.LIVE_DISTRIBUTION?.fetch);
  const seen=new Set();
  return rows.filter(row=>{
    const key=`${row.provider}:${row.external_account_id||row.display_name||row.id}`;if(seen.has(key))return false;seen.add(key);return true;
  }).map(row=>{
    const configJson=parseJson(row.config_json,{});
    const connected=row.status==='active'&&Boolean(row.credential_ref);
    const liveConfigured=configJson.liveBroadcastEnabled===true||configJson.liveBroadcastEnabled==='true';
    const supported=['youtube','facebook'].includes(String(row.provider||'').toLowerCase());
    const selectable=connected&&supported&&liveConfigured&&distributionReady;
    const reason=selectable?'ready'
      :!connected?'channel_connection_required'
      :!supported?'live_provider_not_supported'
      :!liveConfigured?'live_permission_required'
      :'distribution_engine_pending';
    return {
      id:`channel:${Number(row.id)}`,
      provider:String(row.provider||'external').toLowerCase(),
      channelType:String(row.channel_type||''),
      label:clean(row.display_name,120)||String(row.provider||'외부 채널'),
      externalAccountId:clean(row.external_account_id,180),
      connected,
      liveConfigured,
      distributionReady,
      selectable,
      reason,
    };
  });
}
async function roomDestinations(env,roomId){
  const result=await env.DB.prepare('SELECT * FROM realtime_destinations WHERE room_id=? ORDER BY updated_at,id').bind(roomId).all();
  return (result.results||[]).map(safeDestination);
}
async function validateDestinationSelection(env,tenant,input){
  const ids=[...new Set((Array.isArray(input?.destinationIds)?input.destinationIds:[]).map(externalDestinationId).filter(Boolean))].slice(0,8);
  if(!ids.length)return {ids:[],selected:[],catalog:[]};
  const catalog=await destinationCatalogRows(env,tenant);
  const map=new Map(catalog.map(item=>[item.id,item]));
  const selected=ids.map(id=>map.get(id)).filter(Boolean);
  const rejected=ids.filter(id=>!map.get(id)?.selectable);
  return {ids,selected,catalog,rejected};
}
async function ownerAllowed(request,env,room){
  const access=await entitlementFor(request,env,slug(room.tenant_id));
  const subject=access.identity?canonicalAiSubject(access.identity):'';
  return {access,allowed:Boolean(access.identity&&(room.owner_user_id===subject||ADMIN_ROLES.has(access.role)))};
}

function safeRecording(row){
  if(!row)return null;
  return {
    id:row.id,
    roomId:row.room_id,
    tenantId:row.tenant_id,
    status:row.status,
    title:row.title||'',
    mimeType:row.mime_type||'video/webm',
    byteSize:Number(row.byte_size||0),
    visibility:row.visibility||'private',
    archiveStatus:row.archive_status||'pending',
    driveFileId:row.drive_file_id||null,
    driveWebViewLink:row.drive_web_view_link||null,
    youtubeStatus:row.youtube_status||'not_requested',
    youtubeVideoId:row.youtube_video_id||null,
    youtubeUrl:row.youtube_url||null,
    retentionUntil:row.retention_until||null,
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    deletedAt:row.deleted_at||null,
  };
}
async function recordingById(env,id){return env.DB.prepare('SELECT * FROM realtime_recordings WHERE id=?').bind(id).first()}
function recordingObjectKey(room,recordingId,mimeType='video/webm'){
  const now=new Date(),year=String(now.getUTCFullYear()),month=String(now.getUTCMonth()+1).padStart(2,'0');
  const ext=String(mimeType).includes('mp4')?'mp4':'webm';
  return `live-recordings/${slug(room.tenant_id)}/${year}/${month}/${room.id}/${recordingId}.${ext}`;
}
function retentionUntil(days=180){
  const n=Number(days);
  if(n===0)return null;
  const safe=Number.isFinite(n)?Math.min(3650,Math.max(1,Math.trunc(n))):180;
  return new Date(Date.now()+safe*86400000).toISOString();
}
async function tenantAdminAccess(request,env,tenant){
  const config=realtimeTenant(tenant);if(!config)return {identity:null,role:'',allowed:false,config:null};
  const access=await entitlementFor(request,env,config.apiTenant);
  return {...access,config,allowed:Boolean(access.identity&&ADMIN_ROLES.has(access.role))};
}
async function archiveRecordingToSharedDrive(env,recording,room,access){
  if(!env.STORAGE?.fetch)return {ok:false,code:'storage_service_not_configured'};
  const stamp=new Date(recording.created_at||Date.now());
  const year=String(stamp.getUTCFullYear()),month=String(stamp.getUTCMonth()+1).padStart(2,'0');
  try{
    const response=await env.STORAGE.fetch(new Request('https://storage.internal/api/storage/v1/archive-r2',{
      method:'POST',
      headers:{'content-type':'application/json','x-request-id':recording.id},
      body:JSON.stringify({
        r2Key:recording.storage_key,
        storageRoute:'media',
        serviceId:'media',
        spaceId:room.tenant_id,
        recordType:'live_recording',
        createdBy:access?.identity?canonicalAiSubject(access.identity):room.owner_user_id,
        retentionClass:recording.retention_until?'business_record':'permanent',
        sourceModuleId:'ekodi-realtime',
        title:recording.title||`${room.title||room.tenant_id}-${recording.id}.webm`,
        mimeType:recording.mime_type||'video/webm',
        subfolderPath:`Live/${room.tenant_id}/${year}/${month}`,
      }),
    }));
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.file?.id)return {ok:false,code:data?.code||`storage_archive_${response.status}`};
    await env.DB.prepare(`UPDATE realtime_recordings SET archive_status='archived',drive_file_id=?,drive_web_view_link=?,updated_at=? WHERE id=?`).bind(String(data.file.id),String(data.file.webViewLink||''),new Date().toISOString(),recording.id).run();
    return {ok:true,file:data.file};
  }catch(error){
    console.error('recording archive',error?.message||error);
    return {ok:false,code:'storage_archive_failed'};
  }
}
async function startRecordingUpload(request,env,room,input){
  if(!env.LIVE_RECORDINGS_BUCKET)return json(request,env,{ok:false,error:'recording_storage_not_configured'},503);
  const auth=await ownerAllowed(request,env,room);
  if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
  if(!room.recording_enabled)return json(request,env,{ok:false,error:'recording_not_enabled'},409);
  const mimeType=clean(input?.mimeType,120)||'video/webm';
  const id=uid('rec'),key=recordingObjectKey(room,id,mimeType),stamp=new Date().toISOString();
  const multipart=await env.LIVE_RECORDINGS_BUCKET.createMultipartUpload(key,{httpMetadata:{contentType:mimeType}});
  const retention=retentionUntil(input?.retentionDays);
  const title=clean(input?.title,180)||room.title||'Live recording';
  await env.DB.prepare(`INSERT INTO realtime_recordings
    (id,room_id,tenant_id,status,storage_key,retention_until,created_at,updated_at,upload_id,mime_type,byte_size,visibility,archive_status,title,created_by)
    VALUES (?,?,?,'recording',?,?,?,?,?,?,0,'private','pending',?,?)`)
    .bind(id,room.id,room.tenant_id,key,retention,stamp,stamp,multipart.uploadId,mimeType,title,auth.access.identity?canonicalAiSubject(auth.access.identity):room.owner_user_id).run();
  return json(request,env,{ok:true,recording:safeRecording(await recordingById(env,id)),partMinBytes:5*1024*1024},201);
}
async function uploadRecordingPart(request,env,url){
  const match=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/recordings\/([^/]+)\/parts\/(\d+)$/);
  if(!match||request.method!=='PUT')return null;
  if(!env.LIVE_RECORDINGS_BUCKET)return json(request,env,{ok:false,error:'recording_storage_not_configured'},503);
  const room=await roomById(env,decodeURIComponent(match[1]));
  if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
  const auth=await ownerAllowed(request,env,room);if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
  const recording=await recordingById(env,decodeURIComponent(match[2]));
  if(!recording||recording.room_id!==room.id)return json(request,env,{ok:false,error:'recording_not_found'},404);
  if(recording.status!=='recording'||!recording.upload_id)return json(request,env,{ok:false,error:'recording_not_uploading'},409);
  const partNumber=Number(match[3]);if(!Number.isInteger(partNumber)||partNumber<1||partNumber>10000)return json(request,env,{ok:false,error:'invalid_part_number'},400);
  if(!request.body)return json(request,env,{ok:false,error:'recording_part_body_required'},400);
  const upload=env.LIVE_RECORDINGS_BUCKET.resumeMultipartUpload(recording.storage_key,recording.upload_id);
  const part=await upload.uploadPart(partNumber,request.body);
  const size=Math.max(0,Number(request.headers.get('content-length')||0));
  await env.DB.prepare(`INSERT INTO realtime_recording_parts(recording_id,part_number,etag,size_bytes,uploaded_at)
    VALUES (?,?,?,?,?) ON CONFLICT(recording_id,part_number) DO UPDATE SET etag=excluded.etag,size_bytes=excluded.size_bytes,uploaded_at=excluded.uploaded_at`)
    .bind(recording.id,part.partNumber,part.etag,size,new Date().toISOString()).run();
  return json(request,env,{ok:true,recordingId:recording.id,partNumber:part.partNumber,etag:part.etag});
}
async function finalizeRecording(request,env,room,recording,auth){
  if(!env.LIVE_RECORDINGS_BUCKET)return json(request,env,{ok:false,error:'recording_storage_not_configured'},503);
  if(recording.status==='ready')return json(request,env,{ok:true,recording:safeRecording(recording),alreadyFinalized:true});
  if(recording.status!=='recording'||!recording.upload_id)return json(request,env,{ok:false,error:'recording_not_uploading'},409);
  const rows=await env.DB.prepare('SELECT part_number,etag,size_bytes FROM realtime_recording_parts WHERE recording_id=? ORDER BY part_number').bind(recording.id).all();
  const parts=(rows.results||[]).map(row=>({partNumber:Number(row.part_number),etag:String(row.etag)}));
  if(!parts.length)return json(request,env,{ok:false,error:'recording_has_no_parts'},409);
  const upload=env.LIVE_RECORDINGS_BUCKET.resumeMultipartUpload(recording.storage_key,recording.upload_id);
  await upload.complete(parts);
  const object=await env.LIVE_RECORDINGS_BUCKET.head(recording.storage_key);
  const stamp=new Date().toISOString();
  await env.DB.prepare(`UPDATE realtime_recordings SET status='ready',upload_id=NULL,byte_size=?,archive_status='pending',updated_at=? WHERE id=?`).bind(Number(object?.size||0),stamp,recording.id).run();
  const ready=await recordingById(env,recording.id);
  const archive=await archiveRecordingToSharedDrive(env,ready,room,auth.access);
  const fresh=await recordingById(env,recording.id);
  return json(request,env,{ok:true,recording:safeRecording(fresh),archive});
}
async function recordingMedia(request,env,url){
  const match=url.pathname.match(/^\/api\/realtime\/recordings\/([^/]+)\/media$/);
  if(!match||request.method!=='GET')return null;
  if(!env.LIVE_RECORDINGS_BUCKET)return json(request,env,{ok:false,error:'recording_storage_not_configured'},503);
  const recording=await recordingById(env,decodeURIComponent(match[1]));
  if(!recording||recording.status==='deleted')return json(request,env,{ok:false,error:'recording_not_found'},404);
  if(recording.visibility!=='public'){
    const access=await tenantAdminAccess(request,env,recording.tenant_id);
    if(!access.allowed)return json(request,env,{ok:false,error:'tenant_host_permission_required'},403);
  }
  const object=await env.LIVE_RECORDINGS_BUCKET.get(recording.storage_key);
  if(!object)return json(request,env,{ok:false,error:'recording_object_not_found'},404);
  const headers=new Headers({'cache-control':'private, no-store','x-content-type-options':'nosniff',...cors(request,env)});
  if(typeof object.writeHttpMetadata==='function')object.writeHttpMetadata(headers);else headers.set('content-type',recording.mime_type||'video/webm');
  headers.set('content-length',String(object.size||recording.byte_size||0));
  const disposition=url.searchParams.get('download')==='1'?'attachment':'inline';
  const ext=String(recording.mime_type||'').includes('mp4')?'mp4':'webm';
  headers.set('content-disposition',`${disposition}; filename="recording-${recording.id}.${ext}"`);
  return new Response(object.body,{status:200,headers});
}
async function recordingRoutes(request,env,url,input){
  if(request.method==='GET'&&url.pathname===`${PREFIX}/recordings/public`){
    const config=realtimeTenant(url.searchParams.get('tenant')||'');if(!config)return json(request,env,{ok:false,error:'invalid_tenant'},400);
    const rows=await env.DB.prepare(`SELECT * FROM realtime_recordings WHERE tenant_id=? AND status='ready' AND visibility='public' ORDER BY created_at DESC LIMIT 100`).bind(config.apiTenant).all();
    return json(request,env,{ok:true,tenant:config.apiTenant,recordings:(rows.results||[]).map(safeRecording)});
  }
  if(request.method==='GET'&&url.pathname===`${PREFIX}/recordings`){
    const config=realtimeTenant(url.searchParams.get('tenant')||'');if(!config)return json(request,env,{ok:false,error:'invalid_tenant'},400);
    const access=await tenantAdminAccess(request,env,config.apiTenant);if(!access.allowed)return json(request,env,{ok:false,error:'tenant_host_permission_required'},403);
    const [rows,rooms]=await Promise.all([
      env.DB.prepare(`SELECT * FROM realtime_recordings WHERE tenant_id=? AND status!='deleted' ORDER BY created_at DESC LIMIT 200`).bind(config.apiTenant).all(),
      env.DB.prepare(`SELECT * FROM realtime_rooms WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200`).bind(config.apiTenant).all()
    ]);
    return json(request,env,{ok:true,tenant:config.apiTenant,recordings:(rows.results||[]).map(safeRecording),broadcasts:(rooms.results||[]).map(safeRoom)});
  }
  const start=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/recordings$/);
  if(start&&request.method==='POST'){
    const room=await roomById(env,decodeURIComponent(start[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    return startRecordingUpload(request,env,room,input||{});
  }
  const action=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/recordings\/([^/]+)\/(finalize|abort)$/);
  if(action&&request.method==='POST'){
    const room=await roomById(env,decodeURIComponent(action[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    const auth=await ownerAllowed(request,env,room);if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
    const recording=await recordingById(env,decodeURIComponent(action[2]));if(!recording||recording.room_id!==room.id)return json(request,env,{ok:false,error:'recording_not_found'},404);
    if(action[3]==='finalize')return finalizeRecording(request,env,room,recording,auth);
    if(recording.upload_id&&env.LIVE_RECORDINGS_BUCKET){await env.LIVE_RECORDINGS_BUCKET.resumeMultipartUpload(recording.storage_key,recording.upload_id).abort().catch(()=>{});}
    await env.DB.prepare(`UPDATE realtime_recordings SET status='failed',archive_status='failed',updated_at=? WHERE id=?`).bind(new Date().toISOString(),recording.id).run();
    return json(request,env,{ok:true,recording:safeRecording(await recordingById(env,recording.id))});
  }
  const item=url.pathname.match(/^\/api\/realtime\/recordings\/([^/]+)$/);
  if(item&&['PATCH','DELETE'].includes(request.method)){
    const recording=await recordingById(env,decodeURIComponent(item[1]));if(!recording||recording.status==='deleted')return json(request,env,{ok:false,error:'recording_not_found'},404);
    const access=await tenantAdminAccess(request,env,recording.tenant_id);if(!access.allowed)return json(request,env,{ok:false,error:'tenant_host_permission_required'},403);
    if(request.method==='PATCH'){
      const visibility=['private','public','unlisted'].includes(String(input?.visibility||''))?String(input.visibility):recording.visibility;
      const retention=input&&Object.prototype.hasOwnProperty.call(input,'retentionDays')?retentionUntil(input.retentionDays):recording.retention_until;
      const title=clean(input?.title,180)||recording.title||'';
      await env.DB.prepare('UPDATE realtime_recordings SET visibility=?,retention_until=?,title=?,updated_at=? WHERE id=?').bind(visibility,retention,title,new Date().toISOString(),recording.id).run();
      return json(request,env,{ok:true,recording:safeRecording(await recordingById(env,recording.id))});
    }
    if(env.LIVE_RECORDINGS_BUCKET&&recording.storage_key)await env.LIVE_RECORDINGS_BUCKET.delete(recording.storage_key).catch(()=>{});
    if(recording.drive_file_id&&env.STORAGE?.fetch){
      await env.STORAGE.fetch(new Request('https://storage.internal/api/storage/v1/delete-file',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileId:recording.drive_file_id})})).catch(()=>null);
    }
    await env.DB.prepare(`UPDATE realtime_recordings SET status='deleted',deleted_at=?,updated_at=? WHERE id=?`).bind(new Date().toISOString(),new Date().toISOString(),recording.id).run();
    return json(request,env,{ok:true,deleted:true,id:recording.id});
  }
  const youtube=url.pathname.match(/^\/api\/realtime\/recordings\/([^/]+)\/youtube$/);
  if(youtube&&request.method==='POST'){
    const recording=await recordingById(env,decodeURIComponent(youtube[1]));if(!recording||recording.status!=='ready')return json(request,env,{ok:false,error:'recording_not_ready'},409);
    const access=await tenantAdminAccess(request,env,recording.tenant_id);if(!access.allowed)return json(request,env,{ok:false,error:'tenant_host_permission_required'},403);
    await env.DB.prepare(`UPDATE realtime_recordings SET youtube_status='connection_required',updated_at=? WHERE id=?`).bind(new Date().toISOString(),recording.id).run();
    return json(request,env,{ok:false,error:'youtube_connection_required',recording:safeRecording(await recordingById(env,recording.id)),connectUrl:'https://ekodi.kr/admin/?route=marketing-channels'},409);
  }
  return null;
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
async function recoverStaleLiveRoom(env,row){
  if(!row||row.status!=='live'||!env.DB)return row;
  const updatedAt=Date.parse(String(row.updated_at||row.created_at||''));
  if(!Number.isFinite(updatedAt)||Date.now()-updatedAt<30*60*1000)return row;
  const sessions=await env.DB.prepare(`SELECT id,provider_session_id FROM realtime_media_sessions WHERE room_id=? AND role IN ('owner','cohost','presenter') AND status='active' ORDER BY updated_at DESC`).bind(row.id).all().catch(()=>({results:[]}));
  let uncertain=false,active=false;
  for(const session of sessions.results||[]){
    const providerId=clean(session?.provider_session_id,160);if(!providerId)continue;
    try{
      const state=await providerCall(env,`/sessions/${encodeURIComponent(providerId)}`,{method:'GET'});
      if((state?.tracks||[]).some(track=>track?.location==='local'&&track?.status==='active')){active=true;break;}
    }catch(error){
      if(Number(error?.providerStatus)===404)continue;
      uncertain=true;break;
    }
  }
  if(active||uncertain)return row;
  const stamp=new Date().toISOString();
  await env.DB.prepare(`UPDATE realtime_rooms SET status='ended',updated_at=?,ended_at=COALESCE(ended_at,?) WHERE id=? AND status='live'`).bind(stamp,stamp,row.id).run();
  await env.DB.prepare(`UPDATE realtime_media_sessions SET status='closed',updated_at=? WHERE room_id=? AND status='active'`).bind(stamp,row.id).run().catch(()=>{});
  await env.DB.prepare(`UPDATE realtime_media_tracks SET status='closed',updated_at=? WHERE room_id=? AND status='active'`).bind(stamp,row.id).run().catch(()=>{});
  return await roomById(env,row.id);
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
    let row=await env.DB.prepare(`SELECT * FROM realtime_rooms WHERE tenant_id IN (${placeholders}) AND status='live' ORDER BY updated_at DESC LIMIT 1`).bind(...aliases).first();
    if(row)row=await recoverStaleLiveRoom(env,row);
    const live=row?.status==='live';
    return json(request,env,{ok:true,tenant,canonicalTenant:config.id,live,room:live?safeRoom(row):null});
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
  const destinationSelection=await validateDestinationSelection(env,canonicalTenant,input);
  const wanted={tier:access.tier,interactiveParticipants:Number(input.interactiveParticipants||1),languages:Array.isArray(input.languages)?input.languages.length:Number(input.languages||0),durationMinutes:Number(input.durationMinutes||0),recording:input.recording!==false,multistream:destinationSelection.ids.length>0};
  const decision=evaluateRealtimeRequest(wanted);
  if(!decision.allowed)return json(request,env,{ok:false,error:'realtime_entitlement_exceeded',decision,subscriptionUrl:'https://ekodi.kr/my/?service=media'},decision.requiresSubscription?402:403);
  if(destinationSelection.rejected?.length)return json(request,env,{ok:false,error:'external_destination_not_ready',rejected:destinationSelection.rejected,catalog:destinationSelection.catalog},409);
  const id=uid('room'),stamp=new Date().toISOString(),owner=canonicalAiSubject(access.identity);
  const mode=clean(input.mode,40)||config.mode;
  const security=clean(input.securityProfile,30)||'standard';
  const title=clean(input.title,160)||config.title;
  const recording=input.recording!==false,notice=recording!==false;
  await env.DB.prepare(`INSERT INTO realtime_rooms (id,tenant_id,owner_user_id,mode,security_profile,title,status,ai_enabled,recording_enabled,recording_notice_enabled,anonymous_viewers_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?, 'created',?,?,?,?,?,?)`).bind(id,canonicalTenant,owner,mode,security,title,input.ai!==false?1:0,recording?1:0,notice?1:0,input.publicViewers===false?0:1,stamp,stamp).run();
  await env.DB.prepare(`INSERT OR REPLACE INTO realtime_room_members (room_id,tenant_id,user_id,role,joined_at,left_at) VALUES (?,?,?,?,?,NULL)`).bind(id,canonicalTenant,owner,'owner',stamp).run();
  const destinationRows=[];
  for(const item of destinationSelection.selected){
    const destinationId=uid('dest');
    await env.DB.prepare(`INSERT INTO realtime_destinations(id,room_id,tenant_id,destination_type,secret_ref,status,failure_count,last_error_code,updated_at)
      VALUES(?,?,?,?,?,'idle',0,NULL,?)`).bind(destinationId,id,canonicalTenant,item.provider,`marketing-channel:${item.id.slice('channel:'.length)}`,stamp).run();
    destinationRows.push({id:destinationId,room_id:id,tenant_id:canonicalTenant,destination_type:item.provider,status:'idle',failure_count:0,last_error_code:null,updated_at:stamp,label:item.label,externalDestinationId:item.id});
  }
  return json(request,env,{ok:true,room:safeRoom(await roomById(env,id)),destinations:destinationRows.map(row=>safeDestination(row,{label:row.label,externalDestinationId:row.externalDestinationId})),entitlement:decision,studioUrl:`https://ekodi.kr${config.path}?room=${encodeURIComponent(id)}&mode=studio`},201);
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

async function destinationRoute(request,env,url){
  if(request.method==='GET'&&url.pathname===`${PREFIX}/destinations/catalog`){
    const config=realtimeTenant(url.searchParams.get('tenant')||'');if(!config)return json(request,env,{ok:false,error:'invalid_tenant'},400);
    const access=await tenantAdminAccess(request,env,config.apiTenant);if(!access.allowed)return json(request,env,{ok:false,error:'tenant_host_permission_required'},403);
    const channels=await destinationCatalogRows(env,config.apiTenant);
    return json(request,env,{ok:true,tenant:config.apiTenant,internal:{enabled:true,recordingDefault:true,label:'EKODI 내부 방송 · 자동 저장'},channels});
  }
  const match=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/destinations$/);
  if(match&&request.method==='GET'){
    const room=await roomById(env,decodeURIComponent(match[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    const auth=await ownerAllowed(request,env,room);if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
    return json(request,env,{ok:true,roomId:room.id,destinations:await roomDestinations(env,room.id)});
  }
  return null;
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


function safeChat(row){return row?{id:row.id,roomId:row.room_id,displayName:row.display_name||'참여자',role:row.role||'viewer',message:row.message||'',createdAt:row.created_at}:null}
function safeParticipation(row){return row?{id:row.id,roomId:row.room_id,displayName:row.display_name||'참여자',status:row.status,requestedAt:row.requested_at,decidedAt:row.decided_at||null}:null}
async function requestActorKey(request,env,room,{allowAnonymous=false}={}){
  const access=await entitlementFor(request,env,slug(room.tenant_id));
  if(access.identity)return {access,actorKey:canonicalAiSubject(access.identity),authenticated:true};
  if(!allowAnonymous)return {access,actorKey:'',authenticated:false};
  const ip=clean(request.headers.get('cf-connecting-ip'),80)||'unknown';
  const agent=clean(request.headers.get('user-agent'),180)||'unknown';
  return {access,actorKey:`anon:${(await sha256(`${room.id}|${ip}|${agent}`)).slice(0,32)}`,authenticated:false};
}
async function collaborationRoute(request,env,url,input){
  const chat=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/chat$/);
  if(chat){
    const room=await roomById(env,decodeURIComponent(chat[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    if(request.method==='GET'){
      if(!room.anonymous_viewers_enabled){const access=await entitlementFor(request,env,slug(room.tenant_id));if(!access.identity)return json(request,env,{ok:false,error:'authentication_required'},401)}
      const since=clean(url.searchParams.get('after'),40);
      const query=since
        ? env.DB.prepare(`SELECT * FROM realtime_chat_messages WHERE room_id=? AND deleted_at IS NULL AND created_at>? ORDER BY created_at,id LIMIT 100`).bind(room.id,since)
        : env.DB.prepare(`SELECT * FROM realtime_chat_messages WHERE room_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100`).bind(room.id);
      const rows=await query.all(),messages=(rows.results||[]).map(safeChat);
      if(!since)messages.reverse();
      return json(request,env,{ok:true,roomId:room.id,messages});
    }
    if(request.method==='POST'){
      if(!['starting','live'].includes(room.status))return json(request,env,{ok:false,error:'room_chat_not_open'},409);
      const actor=await requestActorKey(request,env,room,{allowAnonymous:room.anonymous_viewers_enabled});
      if(!actor.actorKey)return json(request,env,{ok:false,error:'authentication_required'},401);
      const message=clean(input?.message,500),actorRole=actor.authenticated?(normalizeRealtimeRole(actor.access.role)||'viewer'):'viewer',displayName=actor.authenticated&&ADMIN_ROLES.has(actorRole)?'방송자':actor.authenticated?(clean(actor.access.identity?.email,80).split('@')[0]||'참여자'):'참여자';
      if(!message)return json(request,env,{ok:false,error:'chat_message_required'},400);
      const last=await env.DB.prepare(`SELECT created_at FROM realtime_chat_messages WHERE room_id=? AND actor_key=? ORDER BY created_at DESC LIMIT 1`).bind(room.id,actor.actorKey).first();
      if(last?.created_at&&Date.now()-Date.parse(last.created_at)<1800)return json(request,env,{ok:false,error:'chat_rate_limited'},429);
      const id=uid('chat'),stamp=new Date().toISOString(),role=actorRole;
      await env.DB.prepare(`INSERT INTO realtime_chat_messages(id,room_id,tenant_id,actor_key,display_name,role,message,created_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,NULL)`).bind(id,room.id,room.tenant_id,actor.actorKey,displayName,role,message,stamp).run();
      return json(request,env,{ok:true,message:safeChat(await env.DB.prepare('SELECT * FROM realtime_chat_messages WHERE id=?').bind(id).first())},201);
    }
  }
  const requestMe=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/participation-request\/me$/);
  if(requestMe&&request.method==='GET'){
    const room=await roomById(env,decodeURIComponent(requestMe[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    const actor=await requestActorKey(request,env,room);if(!actor.authenticated)return json(request,env,{ok:false,error:'authentication_required'},401);
    const row=await env.DB.prepare('SELECT * FROM realtime_participation_requests WHERE room_id=? AND actor_key=?').bind(room.id,actor.actorKey).first();
    return json(request,env,{ok:true,request:safeParticipation(row)});
  }
  const requestList=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/participation-requests$/);
  if(requestList){
    const room=await roomById(env,decodeURIComponent(requestList[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    if(request.method==='POST'){
      const actor=await requestActorKey(request,env,room);if(!actor.authenticated)return json(request,env,{ok:false,error:'authentication_required'},401);
      const displayName=clean(input?.displayName,40)||(clean(actor.access.identity?.email,80).split('@')[0]||'참여자'),stamp=new Date().toISOString();
      const existing=await env.DB.prepare('SELECT id FROM realtime_participation_requests WHERE room_id=? AND actor_key=?').bind(room.id,actor.actorKey).first();
      const id=existing?.id||uid('join');
      await env.DB.prepare(`INSERT INTO realtime_participation_requests(id,room_id,tenant_id,actor_key,display_name,status,requested_at,decided_at,decided_by)
        VALUES(?,?,?,?,?,'pending',?,NULL,NULL)
        ON CONFLICT(room_id,actor_key) DO UPDATE SET display_name=excluded.display_name,status='pending',requested_at=excluded.requested_at,decided_at=NULL,decided_by=NULL`)
        .bind(id,room.id,room.tenant_id,actor.actorKey,displayName,stamp).run();
      return json(request,env,{ok:true,request:safeParticipation(await env.DB.prepare('SELECT * FROM realtime_participation_requests WHERE room_id=? AND actor_key=?').bind(room.id,actor.actorKey).first())},201);
    }
    if(request.method==='GET'){
      const auth=await ownerAllowed(request,env,room);if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
      const rows=await env.DB.prepare(`SELECT * FROM realtime_participation_requests WHERE room_id=? ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, requested_at DESC LIMIT 100`).bind(room.id).all();
      return json(request,env,{ok:true,requests:(rows.results||[]).map(safeParticipation)});
    }
  }
  const decide=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/participation-requests\/([^/]+)$/);
  if(decide&&request.method==='PATCH'){
    const room=await roomById(env,decodeURIComponent(decide[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    const auth=await ownerAllowed(request,env,room);if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
    const status=clean(input?.status,20);if(!['approved','rejected'].includes(status))return json(request,env,{ok:false,error:'invalid_participation_status'},400);
    const row=await env.DB.prepare('SELECT * FROM realtime_participation_requests WHERE room_id=? AND id=?').bind(room.id,decodeURIComponent(decide[2])).first();
    if(!row)return json(request,env,{ok:false,error:'participation_request_not_found'},404);
    const stamp=new Date().toISOString(),decider=auth.access.identity?canonicalAiSubject(auth.access.identity):room.owner_user_id;
    await env.DB.prepare('UPDATE realtime_participation_requests SET status=?,decided_at=?,decided_by=? WHERE id=?').bind(status,stamp,decider,row.id).run();
    if(status==='approved')await env.DB.prepare(`INSERT OR REPLACE INTO realtime_room_members(room_id,tenant_id,user_id,role,joined_at,left_at) VALUES(?,?,?,?,?,NULL)`).bind(room.id,room.tenant_id,row.actor_key,'presenter',stamp).run();
    else await env.DB.prepare(`DELETE FROM realtime_room_members WHERE room_id=? AND user_id=? AND role='presenter'`).bind(room.id,row.actor_key).run();
    return json(request,env,{ok:true,request:safeParticipation(await env.DB.prepare('SELECT * FROM realtime_participation_requests WHERE id=?').bind(row.id).first())});
  }
  const sources=url.pathname.match(/^\/api\/realtime\/rooms\/([^/]+)\/participant-sources$/);
  if(sources&&request.method==='GET'){
    const room=await roomById(env,decodeURIComponent(sources[1]));if(!room)return json(request,env,{ok:false,error:'room_not_found'},404);
    const auth=await ownerAllowed(request,env,room);if(!auth.allowed)return json(request,env,{ok:false,error:'room_owner_permission_required'},403);
    const rows=await env.DB.prepare(`SELECT s.actor_key,COALESCE(p.display_name,'참여자') display_name,t.track_name,t.media_kind,t.source_type
      FROM realtime_media_sessions s
      JOIN realtime_media_tracks t ON t.publisher_session_id=s.provider_session_id AND t.room_id=s.room_id AND t.status='active'
      LEFT JOIN realtime_participation_requests p ON p.room_id=s.room_id AND p.actor_key=s.actor_key
      WHERE s.room_id=? AND s.role='presenter' AND s.status='active'
      ORDER BY s.created_at,t.created_at`).bind(room.id).all();
    const map=new Map();
    for(const row of rows.results||[]){if(!map.has(row.actor_key))map.set(row.actor_key,{actorKey:row.actor_key,displayName:row.display_name||'참여자',tracks:[]});map.get(row.actor_key).tracks.push({trackName:row.track_name,kind:row.media_kind,sourceType:row.source_type});}
    return json(request,env,{ok:true,sources:[...map.values()]});
  }
  return null;
}

async function createMediaSession(request,env,room,requestedRole){
  const role=clean(requestedRole,30)||'viewer';
  let actorKey=`anon:${crypto.randomUUID()}`;
  if(role!=='viewer'||!room.anonymous_viewers_enabled){
    const access=await entitlementFor(request,env,slug(room.tenant_id));
    if(!access.identity)return json(request,env,{ok:false,error:'authentication_required'},401);
    actorKey=canonicalAiSubject(access.identity);
    if(['owner','cohost','presenter'].includes(role)&&room.owner_user_id!==actorKey&&!ADMIN_ROLES.has(access.role)){
      const membership=await env.DB.prepare(`SELECT role FROM realtime_room_members WHERE room_id=? AND user_id=? AND left_at IS NULL LIMIT 1`).bind(room.id,actorKey).first();
      if(!membership||!['owner','cohost','presenter'].includes(String(membership.role||'')))return json(request,env,{ok:false,error:'publish_permission_required'},403);
    }
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
  const recordingPart=await uploadRecordingPart(request,env,url);if(recordingPart)return recordingPart;
  const recordingStream=await recordingMedia(request,env,url);if(recordingStream)return recordingStream;
  const publicResponse=await publicRoutes(request,env,url);
  if(publicResponse)return publicResponse;
  let input=null;
  if(['POST','PUT','PATCH'].includes(request.method)){
    input=await body(request);
    if(!input)return json(request,env,{ok:false,error:'invalid_json'},400);
  }
  if(url.pathname===`${PREFIX}/rooms`&&request.method==='POST'){
    const config=realtimeTenant(input?.tenant||'ekodichurch');
    if(!config)return json(request,env,{ok:false,error:'invalid_tenant'},400);
    return createRoom(request,env,config.apiTenant,input||{});
  }
  const recordings=await recordingRoutes(request,env,url,input);if(recordings)return recordings;
  const destinations=await destinationRoute(request,env,url);if(destinations)return destinations;
  const collaboration=await collaborationRoute(request,env,url,input);if(collaboration)return collaboration;
  const mutation=await roomMutation(request,env,url,input);if(mutation)return mutation;
  const planned=await planRoute(request,env,url,input);if(planned)return planned;
  const session=await sessionRoute(request,env,url,input);if(session)return session;
  const media=await sessionMediaRoute(request,env,url,input);if(media)return media;
  return json(request,env,{ok:false,error:'realtime_endpoint_not_found'},404);
}


export async function runRealtimeRecordingRetention(env,{limit=10}={}){
  if(!env.DB)return {expired:0,stale:0,skipped:'db_missing'};
  const now=new Date(),stamp=now.toISOString(),max=Math.max(1,Math.min(50,Number(limit)||10));
  let expired=0,stale=0;
  const oldCutoff=new Date(now.getTime()-6*60*60*1000).toISOString();
  const staleRows=await env.DB.prepare(`SELECT * FROM realtime_recordings WHERE status='recording' AND updated_at<? ORDER BY updated_at LIMIT ?`).bind(oldCutoff,max).all();
  for(const recording of staleRows.results||[]){
    if(recording.upload_id&&env.LIVE_RECORDINGS_BUCKET){
      await env.LIVE_RECORDINGS_BUCKET.resumeMultipartUpload(recording.storage_key,recording.upload_id).abort().catch(()=>{});
    }
    await env.DB.prepare(`UPDATE realtime_recordings SET status='failed',archive_status='failed',upload_id=NULL,updated_at=? WHERE id=?`).bind(stamp,recording.id).run();
    stale++;
  }
  const expiredRows=await env.DB.prepare(`SELECT * FROM realtime_recordings WHERE status='ready' AND retention_until IS NOT NULL AND retention_until<=? ORDER BY retention_until LIMIT ?`).bind(stamp,max).all();
  for(const recording of expiredRows.results||[]){
    try{
      if(recording.drive_file_id&&env.STORAGE?.fetch){
        const response=await env.STORAGE.fetch(new Request('https://storage.internal/api/storage/v1/delete-file',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileId:recording.drive_file_id})}));
        if(!response.ok)continue;
      }
      if(recording.storage_key&&env.LIVE_RECORDINGS_BUCKET)await env.LIVE_RECORDINGS_BUCKET.delete(recording.storage_key);
      await env.DB.prepare(`UPDATE realtime_recordings SET status='deleted',deleted_at=?,updated_at=? WHERE id=?`).bind(stamp,stamp,recording.id).run();
      expired++;
    }catch(error){console.error('recording retention cleanup',recording.id,error?.message||error)}
  }
  return {expired,stale};
}

export const REALTIME_CONTROL_CONTRACT=Object.freeze({
  version:'2026-09-19.1',
  prefix:PREFIX,
  canonicalChurchPath:'https://ekodi.kr/ekodichurch/live/',
  multitenant:true,
  tenantCount:realtimeTenantList().length,
  provider:'cloudflare-realtime',
  browserSecrets:false,
  adaptiveMedia:true,
  anonymousPublicViewing:true,
  recordingManagement:true,
  recordingDurableArchive:'google_workspace_shared_drive',
  internalRecordingDefault:true,
  externalChannelSelection:true,
  externalDistributionFailIsolated:true,
  liveChat:true,
  participantCameraRequests:true,
  draggableProgramSources:true,
});
