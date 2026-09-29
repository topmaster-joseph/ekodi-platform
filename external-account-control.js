import { describeCloudflareAccountPool } from './cloudflare-account-pool.js';
const PREFIX='/api/control/external-accounts';
const MANAGE_ROLES=new Set(['owner','admin','tenant_admin','workspace_admin','manager','store_owner','hq_manager','client_admin','client_editor','marketing_manager','marketer','operator']);
const MODES=new Set(['oauth','delegated','official_handoff','service_account_ref','manual']);
const STATES=new Set(['pending_authorization','active','paused','reconnect_required','revoked','error']);
const PROVIDERS=Object.freeze([
  {id:'google',label:'Google',services:['gmail','drive','youtube','calendar'],connection:'oauth_or_delegated',adminTargets:{gmail:'#communication',drive:'#storage',youtube:'#social',calendar:'#external-accounts'}},
  {id:'meta',label:'Meta',services:['facebook','instagram','threads','ads'],connection:'oauth',adminTargets:{facebook:'#social',instagram:'#social',threads:'#social',ads:'#marketing-ai'}},
  {id:'kakao',label:'Kakao',services:['channel','business','message'],connection:'delegated_or_official_handoff',adminTargets:{}},
  {id:'naver',label:'Naver',services:['business','blog','search-ad'],connection:'delegated_or_official_handoff',adminTargets:{}},
  {id:'tiktok',label:'TikTok',services:['content','creator'],connection:'oauth',adminTargets:{content:'#social'}},
  {id:'microsoft',label:'Microsoft',services:['microsoft365','outlook','onedrive'],connection:'oauth_or_delegated',adminTargets:{}},
  {id:'other',label:'Other',services:['general'],connection:'delegated_or_manual',adminTargets:{}}
]);
function clean(v,max=200){return String(v??'').trim().slice(0,max)}
function slug(v){const x=clean(v,80).toLowerCase();return /^[a-z0-9][a-z0-9-]{0,79}$/.test(x)?x:''}
function bearer(r){const v=clean(r.headers.get('authorization'),4096);return v.toLowerCase().startsWith('bearer ')?v.slice(7).trim():''}
function now(){return new Date().toISOString()}
function uid(prefix='xac'){return `${prefix}_${crypto.randomUUID().replaceAll('-','')}`}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}})}
function list(v,max=40){return [...new Set((Array.isArray(v)?v:[]).map(x=>clean(x,120)).filter(Boolean))].slice(0,max)}
function safeParse(v,fallback){try{return JSON.parse(v||'')}catch{return fallback}}
function object(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function bootstrapAdmins(env){return new Set(clean(env.ADMIN_GOOGLE_BOOTSTRAP_EMAILS||env.ADMIN_GOOGLE_BOOTSTRAP_EMAIL||'',2000).split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))}
function envSupabase(env){return {url:clean(env.MY_SUPABASE_URL||env.SUPABASE_URL,500).replace(/\/$/,''),key:clean(env.MY_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY,1000)}}
async function supabase(path,token,env,init={}){const c=envSupabase(env);if(!c.url||!c.key)throw Object.assign(new Error('central_identity_unavailable'),{status:503});const r=await fetch(`${c.url}${path}`,{...init,headers:{apikey:c.key,authorization:`Bearer ${token}`,'content-type':'application/json',...(init.headers||{})},cache:'no-store'});const d=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(d?.message||d?.error||`identity_${r.status}`),{status:r.status});return d}
async function actor(request,env){const token=bearer(request);if(!token)return null;try{const [user,raw]=await Promise.all([supabase('/auth/v1/user',token,env),supabase('/rest/v1/rpc/current_site_activity_contexts',token,env,{method:'POST',body:'{}'})]);if(!user?.id)return null;const email=clean(user.email,254).toLowerCase();const contexts=(Array.isArray(raw)?raw:[]).map(x=>({workspaceId:clean(x?.tenant_id,120),workspaceSlug:slug(x?.tenant),workspaceName:clean(x?.workspace_name||x?.tenant,160),role:clean(x?.authorization_role,60)})).filter(x=>x.workspaceSlug);return {userId:String(user.id),email,superAdmin:bootstrapAdmins(env).has(email),contexts}}catch(error){console.error('external account identity',error?.message||error);return null}}
function canManage(a,workspaceSlug){if(a?.superAdmin)return true;const c=a?.contexts?.find(x=>x.workspaceSlug===workspaceSlug);return Boolean(c&&MANAGE_ROLES.has(c.role))}
function visible(a,workspaceSlug){return Boolean(a?.superAdmin||a?.contexts?.some(x=>x.workspaceSlug===workspaceSlug))}
function workspaceIdFor(a,workspaceSlug){return a?.contexts?.find(x=>x.workspaceSlug===workspaceSlug)?.workspaceId||''}
async function workspaceDirectory(db,a){
  const own=(a?.contexts||[]).map(x=>({id:x.workspaceId,slug:x.workspaceSlug,name:x.workspaceName||x.workspaceSlug,status:'accessible'})).filter(x=>x.slug);
  if(!a?.superAdmin)return own;
  try{
    const result=await db.prepare("SELECT id,slug,name,domain,status FROM customer_tenants WHERE status!='archived' ORDER BY name,slug").all();
    return (result.results||[]).map(row=>({id:clean(row.id,120),slug:slug(row.slug),name:clean(row.name||row.slug,160),domain:clean(row.domain,240),status:clean(row.status,40)})).filter(x=>x.slug);
  }catch{return own}
}
async function resolveWorkspace(db,a,value){
  const target=clean(value,80)==='platform'?'platform':slug(value);
  if(!target)return null;
  if(target==='platform')return a?.superAdmin?{id:'platform',slug:'platform',name:'EKODI Platform'}:null;
  const own=a?.contexts?.find(x=>x.workspaceSlug===target);
  if(own)return {id:own.workspaceId,slug:own.workspaceSlug,name:own.workspaceName||own.workspaceSlug};
  if(!a?.superAdmin)return null;
  try{
    const row=await db.prepare('SELECT id,slug,name FROM customer_tenants WHERE slug=? LIMIT 1').bind(target).first();
    return row?.id?{id:clean(row.id,120),slug:slug(row.slug),name:clean(row.name||row.slug,160)}:null;
  }catch{return null}
}
function rejectSecrets(body){const keys=['password','secret','clientsecret','client_secret','token','accesstoken','access_token','refreshtoken','refresh_token','credential','privatekey','private_key'];return Object.keys(object(body)).find(k=>keys.includes(String(k).toLowerCase()))||''}
async function readBody(request){try{return await request.json()}catch{return {}}}
async function audit(db,a,connectionId,workspaceSlug,action,detail={}){await db.prepare('INSERT INTO external_account_audit(id,connection_id,workspace_slug,actor_user_id,actor_email,action,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(uid('xaa'),connectionId||null,workspaceSlug,a.userId,a.email,action,JSON.stringify(detail),now()).run()}
function normalizeGeneric(row){return {source:'external_registry',id:row.id,workspaceSlug:row.workspace_slug,provider:row.provider,serviceKey:row.service_key,providerAccountId:row.provider_account_id,loginHint:row.login_hint,displayName:row.display_name,connectionMode:row.connection_mode,status:row.status,scopes:safeParse(row.scopes_json,[]),capabilities:safeParse(row.capabilities_json,[]),authorityRef:row.authority_ref,credentialBound:Boolean(row.credential_ref),lastVerifiedAt:row.last_verified_at||null,lastError:row.last_error||'',updatedAt:row.updated_at}}
async function genericRows(db){const r=await db.prepare('SELECT id,workspace_slug,provider,service_key,provider_account_id,login_hint,display_name,connection_mode,status,scopes_json,capabilities_json,authority_ref,credential_ref,last_verified_at,last_error,updated_at FROM external_account_connections ORDER BY updated_at DESC LIMIT 1000').all();return (r.results||[]).map(normalizeGeneric)}
async function optionalRows(db,sql,mapper){try{const r=await db.prepare(sql).all();return (r.results||[]).map(mapper)}catch{return []}}
async function existingRows(db){const [mail,channels,storage]=await Promise.all([
 optionalRows(db,"SELECT id,owner_type,owner_key,workspace_slug,provider,email_address,display_name,connector_mode,connection_status,credential_ref,enabled,last_sync_at,last_error,updated_at FROM mail_accounts WHERE enabled=1 ORDER BY updated_at DESC LIMIT 500",r=>({source:'mail',id:`mail:${r.id}`,workspaceSlug:r.workspace_slug||r.owner_key||'',provider:r.provider==='gmail'?'google':r.provider,serviceKey:'gmail',providerAccountId:r.email_address,loginHint:r.email_address,displayName:r.display_name||r.email_address,connectionMode:r.connector_mode,status:r.connection_status==='connected'?'active':r.connection_status,scopes:[],capabilities:['mail.read','mail.send'],authorityRef:`${r.owner_type}:${r.owner_key}`,credentialBound:Boolean(r.credential_ref),lastVerifiedAt:r.last_sync_at||null,lastError:r.last_error||'',updatedAt:r.updated_at})),
 optionalRows(db,"SELECT id,owner_type,owner_key,workspace_slug,provider,external_account_id,display_name,scopes,status,last_error,updated_at FROM channel_oauth_connections ORDER BY updated_at DESC LIMIT 500",r=>({source:'channel',id:`channel:${r.id}`,workspaceSlug:r.workspace_slug||r.owner_key||'',provider:r.provider==='youtube'?'google':r.provider,serviceKey:r.provider,providerAccountId:r.external_account_id||'',loginHint:'',displayName:r.display_name||r.provider,connectionMode:'oauth',status:r.status==='selection_required'?'pending_authorization':r.status,scopes:clean(r.scopes,1000).split(/[ ,]+/).filter(Boolean),capabilities:['channel.publish'],authorityRef:`${r.owner_type}:${r.owner_key}`,credentialBound:r.status==='active',lastVerifiedAt:null,lastError:r.last_error||'',updatedAt:r.updated_at})),
 optionalRows(db,"SELECT id,provider,role,account_email,display_name,drive_id,status,scopes,updated_at,last_verified_at FROM storage_connections WHERE status!='disabled' ORDER BY updated_at DESC LIMIT 100",r=>({source:'storage',id:`storage:${r.id}`,workspaceSlug:'platform',provider:'google',serviceKey:'drive',providerAccountId:r.drive_id||r.account_email,loginHint:r.account_email,displayName:r.display_name||r.account_email,connectionMode:'oauth',status:['connected','ready'].includes(r.status)?'active':r.status,scopes:clean(r.scopes,1000).split(/[ ,]+/).filter(Boolean),capabilities:['drive.read','drive.write'],authorityRef:`platform:${r.role}`,credentialBound:true,lastVerifiedAt:r.last_verified_at||null,lastError:'',updatedAt:r.updated_at}))
]);return [...mail,...channels,...storage]}
function filterRows(a,rows,workspace){return rows.filter(r=>{if(workspace)return r.workspaceSlug===workspace;if(a.superAdmin)return true;return visible(a,r.workspaceSlug)})}
const HEALTH_FRESH_MS=7*24*60*60*1000;
const HEALTH_STALE_MS=30*24*60*60*1000;
function verifiedAgeMs(value){const t=Date.parse(value||'');return Number.isFinite(t)?Math.max(0,Date.now()-t):null}
function accountHealth(row){
  const status=clean(row.status,40);
  const age=verifiedAgeMs(row.lastVerifiedAt);
  const base={lastVerifiedAt:row.lastVerifiedAt||null,lastError:clean(row.lastError,500),credentialBound:Boolean(row.credentialBound),evidence:'metadata'};
  if(status==='revoked')return {...base,state:'revoked',attention:false,evidence:'provider_or_admin_state'};
  if(status==='paused')return {...base,state:'paused',attention:false,evidence:'admin_state'};
  if(status==='error')return {...base,state:'error',attention:true,evidence:'provider_state'};
  if(status==='reconnect_required')return {...base,state:'reconnect_required',attention:true,evidence:'provider_state'};
  if(['pending_authorization','pending_oauth','pending_connection','selection_required'].includes(status))return {...base,state:'pending',attention:true,evidence:'provider_state'};
  if(status!=='active')return {...base,state:'unknown',attention:true,evidence:'status'};
  if(row.source==='external_registry'&&!row.credentialBound&&['manual','delegated','official_handoff'].includes(clean(row.connectionMode,40))){
    if(age!==null&&age<=HEALTH_FRESH_MS)return {...base,state:'healthy_manual',attention:false,evidence:'human_verified'};
    if(age!==null&&age<=HEALTH_STALE_MS)return {...base,state:'stale_manual',attention:true,evidence:'human_verified'};
    return {...base,state:'manual_required',attention:true,evidence:'human_required'};
  }
  if(row.credentialBound){
    if(age===null)return {...base,state:'configured',attention:false,evidence:'credential_and_active_state'};
    if(age<=HEALTH_FRESH_MS)return {...base,state:'healthy',attention:false,evidence:'recent_verification'};
    if(age<=HEALTH_STALE_MS)return {...base,state:'aging',attention:true,evidence:'verification_age'};
    return {...base,state:'stale',attention:true,evidence:'verification_age'};
  }
  return {...base,state:'unverified',attention:true,evidence:'missing_verification'};
}
function enrichHealth(rows){return rows.map(row=>({...row,health:accountHealth(row)}))}
function stats(rows){return {total:rows.length,active:rows.filter(x=>x.status==='active').length,healthy:rows.filter(x=>['healthy','healthy_manual','configured'].includes(x.health?.state)).length,attention:rows.filter(x=>x.health?.attention).length,manual:rows.filter(x=>['manual_required','stale_manual'].includes(x.health?.state)).length,providers:new Set(rows.map(x=>x.provider)).size}}
async function summary(env,a,url){const requested=clean(url.searchParams.get('workspace'),80);const workspace=requested==='platform'?'platform':slug(requested)||(a.superAdmin?'':a.contexts[0]?.workspaceSlug||'');if(workspace!=='platform'&&workspace&&!visible(a,workspace))return json({ok:false,error:'workspace_access_required'},403);if(workspace==='platform'&&!a.superAdmin)return json({ok:false,error:'super_admin_required'},403);const [rawRows,workspaces]=await Promise.all([Promise.all([genericRows(env.DB),existingRows(env.DB)]).then(([generic,existing])=>filterRows(a,[...generic,...existing],workspace)),workspaceDirectory(env.DB,a)]);const rows=enrichHealth(rawRows);const manage=workspace==='platform'?a.superAdmin:Boolean(workspace&&canManage(a,workspace));return json({ok:true,authority:{email:a.email,superAdmin:a.superAdmin,model:'Person + Workspace + Role + Capability',credentialOwnership:'external-provider'},permissions:{view:true,manage,register:manage,update:manage,reassign:Boolean(a.superAdmin),audit:true,recordVerification:manage,secretMaterial:false},healthPolicy:{freshDays:7,staleDays:30,manualConnectionsRequireHumanVerification:true},contexts:a.contexts,workspaces,workspace,providers:PROVIDERS,stats:stats(rows),accounts:rows})}
async function create(request,env,a){const b=await readBody(request),secretKey=rejectSecrets(b);if(secretKey)return json({ok:false,error:'secret_material_not_accepted',field:secretKey},400);const target=await resolveWorkspace(env.DB,a,b.workspaceSlug);if(!target)return json({ok:false,error:'workspace_not_found_or_forbidden'},404);if(target.slug==='platform'?!a.superAdmin:!canManage(a,target.slug))return json({ok:false,error:'workspace_manage_permission_required'},403);const provider=clean(b.provider,40).toLowerCase(),serviceKey=slug(b.serviceKey)||'general',providerAccountId=clean(b.providerAccountId,240),mode=clean(b.connectionMode,40)||'delegated';if(!PROVIDERS.some(x=>x.id===provider))return json({ok:false,error:'provider_not_supported'},400);if(!MODES.has(mode))return json({ok:false,error:'invalid_connection_mode'},400);if(!providerAccountId)return json({ok:false,error:'provider_account_id_required'},400);const id=uid(),stamp=now(),scopes=list(b.scopes),capabilities=list(b.capabilities),status='pending_authorization';try{await env.DB.prepare(`INSERT INTO external_account_connections(id,workspace_id,workspace_slug,provider,service_key,provider_account_id,login_hint,display_name,connection_mode,status,scopes_json,capabilities_json,authority_ref,credential_ref,metadata_json,created_by_user_id,created_by_email,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,target.id,target.slug,provider,serviceKey,providerAccountId,clean(b.loginHint,254),clean(b.displayName,160)||providerAccountId,mode,status,JSON.stringify(scopes),JSON.stringify(capabilities),clean(b.authorityRef,200),'',JSON.stringify({notes:clean(b.notes,500)}),a.userId,a.email,stamp,stamp).run()}catch(error){if(String(error?.message||'').toLowerCase().includes('unique'))return json({ok:false,error:'account_already_registered'},409);throw error}await audit(env.DB,a,id,target.slug,'connection.register',{provider,serviceKey,mode});return json({ok:true,id,status,workspace:target.slug},201)}
async function update(request,env,a,id){const row=await env.DB.prepare('SELECT * FROM external_account_connections WHERE id=?').bind(id).first();if(!row)return json({ok:false,error:'connection_not_found'},404);if(row.workspace_slug==='platform'?!a.superAdmin:!canManage(a,row.workspace_slug))return json({ok:false,error:'workspace_manage_permission_required'},403);const b=await readBody(request),secretKey=rejectSecrets(b);if(secretKey)return json({ok:false,error:'secret_material_not_accepted',field:secretKey},400);let target={id:row.workspace_id,slug:row.workspace_slug};if(b.workspaceSlug!==undefined&&clean(b.workspaceSlug,80)!==row.workspace_slug){if(!a.superAdmin)return json({ok:false,error:'workspace_reassign_super_admin_required'},403);target=await resolveWorkspace(env.DB,a,b.workspaceSlug);if(!target)return json({ok:false,error:'workspace_not_found_or_forbidden'},404)}const nextStatus=clean(b.status,40)||row.status;if(!STATES.has(nextStatus))return json({ok:false,error:'invalid_status'},400);const nextMode=b.connectionMode===undefined?row.connection_mode:clean(b.connectionMode,40);if(!MODES.has(nextMode))return json({ok:false,error:'invalid_connection_mode'},400);const scopes=b.scopes===undefined?safeParse(row.scopes_json,[]):list(b.scopes),capabilities=b.capabilities===undefined?safeParse(row.capabilities_json,[]):list(b.capabilities);const displayName=b.displayName===undefined?row.display_name:(clean(b.displayName,160)||row.provider_account_id);const loginHint=b.loginHint===undefined?row.login_hint:clean(b.loginHint,254);const authorityRef=b.authorityRef===undefined?row.authority_ref:clean(b.authorityRef,200);const lastError=b.lastError===undefined?row.last_error:clean(b.lastError,500);await env.DB.prepare('UPDATE external_account_connections SET workspace_id=?,workspace_slug=?,display_name=?,login_hint=?,connection_mode=?,status=?,scopes_json=?,capabilities_json=?,authority_ref=?,last_verified_at=?,last_error=?,updated_at=? WHERE id=?').bind(target.id,target.slug,displayName,loginHint,nextMode,nextStatus,JSON.stringify(scopes),JSON.stringify(capabilities),authorityRef,b.verified===true?now():row.last_verified_at,lastError,now(),id).run();if(target.slug!==row.workspace_slug)await audit(env.DB,a,id,target.slug,'connection.reassign',{from:row.workspace_slug,to:target.slug});await audit(env.DB,a,id,target.slug,b.verified===true?'connection.verify':'connection.update',{from:row.status,to:nextStatus,modeFrom:row.connection_mode,modeTo:nextMode,verified:b.verified===true});return json({ok:true,id,status:nextStatus,workspace:target.slug,verified:b.verified===true})}
async function infrastructureSummary(env,a){
  if(!a?.superAdmin)return json({ok:false,error:'super_admin_required'},403);
  let cloudflare;
  try{cloudflare=describeCloudflareAccountPool(env)}catch(error){
    cloudflare={policyId:'EKODI-CF-ACCOUNT-POOL-001',error:clean(error?.message||error,160),accounts:[]};
  }
  return json({
    ok:true,
    scope:'platform',
    generatedAt:now(),
    secretPolicy:{
      revealSecrets:false,
      acceptPlaintextSecrets:false,
      mutationBoundary:'provider-secret-store-and-ci-only'
    },
    infrastructure:{
      cloudflare,
      supabase:{role:'relational-source-of-truth',management:'platform-governed',secretVisible:false},
      github:{role:'source-control-and-release',management:'platform-governed',secretVisible:false}
    }
  });
}

async function auditList(env,a,url){const requested=clean(url.searchParams.get('workspace'),80);const workspace=requested==='platform'?'platform':slug(requested)||(a.superAdmin?'':a.contexts[0]?.workspaceSlug||'');if(workspace==='platform'&&!a.superAdmin)return json({ok:false,error:'super_admin_required'},403);if(workspace!=='platform'&&workspace&&!visible(a,workspace))return json({ok:false,error:'workspace_access_required'},403);let rows=[];if(a.superAdmin&&!workspace){const r=await env.DB.prepare('SELECT * FROM external_account_audit ORDER BY created_at DESC LIMIT 200').all();rows=r.results||[]}else{const r=await env.DB.prepare('SELECT * FROM external_account_audit WHERE workspace_slug=? ORDER BY created_at DESC LIMIT 200').bind(workspace).all();rows=r.results||[]}return json({ok:true,audit:rows.map(r=>({...r,detail:safeParse(r.detail_json,{})}))})}
export async function handleExternalAccountControl(request,env){const url=new URL(request.url);if(!url.pathname.startsWith(PREFIX))return null;if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'authorization,content-type'}});const a=await actor(request,env);if(!a)return json({ok:false,error:'auth_required'},401);if(url.pathname===`${PREFIX}/summary`&&request.method==='GET')return summary(env,a,url);if(url.pathname===`${PREFIX}/infrastructure`&&request.method==='GET')return infrastructureSummary(env,a);if(url.pathname===`${PREFIX}/accounts`&&request.method==='POST')return create(request,env,a);if(url.pathname===`${PREFIX}/audit`&&request.method==='GET')return auditList(env,a,url);const match=url.pathname.match(new RegExp(`^${PREFIX}/accounts/([^/]+)$`));if(match&&request.method==='PATCH')return update(request,env,a,decodeURIComponent(match[1]));return json({ok:false,error:'not_found'},404)}
export const EXTERNAL_ACCOUNT_PROVIDER_REGISTRY=PROVIDERS;
