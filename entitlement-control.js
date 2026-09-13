import { isAllowedOrigin } from './auth-worker.js';
import { handleAdminSessionFastPath } from './admin-session-fastpath.js';
import { handleCustomerAuth } from './customer-auth.js';
import { canonicalAiSubject, legacyAiSubject, resolveCanonicalEkodiIdentity } from './personal-ai-bridge.js';
import { tenantAdminCan, TENANT_ADMIN_CAPABILITIES } from './tenant-admin-policy.js';

const DEFAULT_SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const DEFAULT_SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const SERVICE='my';
export const ENTITLEMENT_TIERS=Object.freeze(['free','basic','pro','business']);
export const PRESENTATION_ENTITLEMENT_CATALOG=Object.freeze([
  {id:'presentation.open',label:'즉시 발표',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.pptx',label:'PowerPoint PPTX',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.pdf',label:'PDF',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.docx',label:'Word DOCX',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.hwp',label:'한글 HWP · HWPX',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.spreadsheet',label:'Excel · CSV',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.text',label:'TXT · Markdown · HTML',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.image',label:'이미지',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.fullscreen',label:'전체화면 발표',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.history',label:'최근 발표 기록',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.speaker-notes',label:'발표자 노트',kind:'boolean',defaults:[true,true,true,true]},
  {id:'presentation.brand-template',label:'브랜드 템플릿',kind:'boolean',defaults:[false,true,true,true]},
  {id:'presentation.ai-refine',label:'AI 발표 다듬기',kind:'boolean',defaults:[false,true,true,true]},
  {id:'presentation.translation',label:'다국어 자막·통역',kind:'boolean',defaults:[false,true,true,true]},
  {id:'presentation.multi-file',label:'여러 파일 통합 발표',kind:'boolean',defaults:[false,false,true,true]},
  {id:'presentation.voice',label:'AI 음성 발표',kind:'boolean',defaults:[false,false,true,true]},
  {id:'presentation.record',label:'발표 녹화',kind:'boolean',defaults:[false,true,true,true]},
  {id:'presentation.live',label:'라이브 송출',kind:'boolean',defaults:[false,false,true,true]},
  {id:'presentation.qna',label:'청중 Q&A',kind:'boolean',defaults:[false,false,true,true]},
  {id:'presentation.analytics',label:'발표 분석',kind:'boolean',defaults:[false,false,true,true]},
  {id:'presentation.max-file-mb',label:'파일 크기(MB)',kind:'limit',defaults:[25,75,150,250]},
  {id:'presentation.max-units',label:'슬라이드·페이지·시트 한도',kind:'limit',defaults:[150,500,1500,3000]},
  {id:'presentation.max-recent',label:'최근 발표 보관 개수',kind:'limit',defaults:[5,20,50,100]},
]);
const CATALOG=new Map(PRESENTATION_ENTITLEMENT_CATALOG.map(item=>[item.id,item]));
const FREE_REQUIRED=new Set(['presentation.open','presentation.pptx','presentation.pdf','presentation.docx','presentation.hwp','presentation.spreadsheet','presentation.text','presentation.image','presentation.fullscreen','presentation.history','presentation.speaker-notes']);
function allowedOrigin(origin,env={}){return !origin||isAllowedOrigin(origin,env)||origin==='https://ekodi.kr'||origin==='https://www.ekodi.kr'}
function cors(request,env){const origin=request.headers.get('origin')||'';const headers={'access-control-allow-methods':'GET,PUT,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'86400',vary:'Origin'};if(origin&&allowedOrigin(origin,env))headers['access-control-allow-origin']=origin;return headers}
function json(request,env,data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...cors(request,env)}})}
function bearerToken(request){const value=String(request.headers.get('authorization')||'');return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():''}
function oauthClientToken(token){try{const part=String(token||'').split('.')[1]||'';const normalized=part.replace(/-/g,'+').replace(/_/g,'/');const padded=normalized+'='.repeat((4-normalized.length%4)%4);const claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded),c=>c.charCodeAt(0))));return Boolean(String(claims?.client_id||'').trim())}catch{return false}}
function normalizeTier(value){const raw=String(value||'free').trim().toLowerCase();if(ENTITLEMENT_TIERS.includes(raw))return raw;if(['premium','plus'].includes(raw))return'pro';if(['enterprise','team'].includes(raw))return'business';return'free'}
function tierIndex(tier){return Math.max(0,ENTITLEMENT_TIERS.indexOf(normalizeTier(tier)))}
function defaultValue(item,tier){return item.defaults[tierIndex(tier)]}
function serializeValue(value){return JSON.stringify(value)}
function parseValue(raw){try{return JSON.parse(String(raw??'null'))}catch{return null}}
function validateValue(item,value){if(!item)return{ok:false,error:'unknown_capability'};if(item.kind==='boolean'){if(typeof value!=='boolean')return{ok:false,error:'boolean_value_required'};return{ok:true,value}}const n=Number(value);if(!Number.isFinite(n)||n<0||n>100000)return{ok:false,error:'valid_limit_required'};return{ok:true,value:Math.trunc(n)}}
function subjectCandidates(identity){return [...new Set([canonicalAiSubject(identity),identity?.personId,legacyAiSubject(identity),identity?.authUserId,identity?.id].filter(Boolean).map(String))]}
async function userIdentity(request,env={}){const token=bearerToken(request);if(!token||token.length>8192||oauthClientToken(token))return null;const supabase=String(env.MY_SUPABASE_URL||DEFAULT_SUPABASE_URL).replace(/\/$/,'');const key=String(env.MY_SUPABASE_PUBLISHABLE_KEY||DEFAULT_SUPABASE_KEY);const response=await fetch(`${supabase}/auth/v1/user`,{headers:{apikey:key,authorization:`Bearer ${token}`}});if(!response.ok)return null;const user=await response.json();const email=String(user?.email||'').trim().toLowerCase();if(!user?.id||!email||!user?.email_confirmed_at)return null;return resolveCanonicalEkodiIdentity({token,authUser:{id:String(user.id),email},supabaseUrl:supabase,publishableKey:key})}
async function verifiedWorkspaceForIdentity(request,env,workspaceKey){
  if(!workspaceKey)return true;
  const token=bearerToken(request);if(!token)return false;
  const supabase=String(env.MY_SUPABASE_URL||DEFAULT_SUPABASE_URL).replace(/\/$/,'');
  const key=String(env.MY_SUPABASE_PUBLISHABLE_KEY||DEFAULT_SUPABASE_KEY);
  const response=await fetch(`${supabase}/functions/v1/workspace-api/workspaces?site=social`,{headers:{authorization:`Bearer ${token}`,apikey:key,'cache-control':'no-store'}}).catch(()=>null);
  if(!response?.ok)return false;
  const body=await response.json().catch(()=>({}));
  return (Array.isArray(body?.workspaces)?body.workspaces:[]).some(row=>String(row?.workspace_key||'').toLowerCase()===workspaceKey&&['active','pre_registered'].includes(String(row?.status||'')));
}
async function tierForIdentity(env,identity){if(!env.DB||!identity)return'free';for(const subject of subjectCandidates(identity)){const row=await env.DB.prepare(`SELECT plan_id,status FROM service_subscriptions WHERE subject_type='person' AND subject_key=? AND site=? ORDER BY updated_at DESC LIMIT 1`).bind(subject,SERVICE).first().catch(()=>null);if(row&&['active','free','eligible','trialing'].includes(String(row.status||'').toLowerCase()))return normalizeTier(row.plan_id)}return'free'}
async function adminActor(request,env){const probe=new Request(new URL('/api/session',request.url),{method:'GET',headers:request.headers});const response=await handleAdminSessionFastPath(probe,env);if(!response?.ok)return null;const data=await response.json().catch(()=>null);return data?.authenticated?{type:'platform_admin',key:String(data.email||''),role:String(data.role||''),workspaceKey:'',platform:true}:null}
async function customerActor(request,env){const probe=new Request(new URL('/api/customer/session',request.url),{method:'GET',headers:request.headers});const response=await handleCustomerAuth(probe,env);if(!response?.ok)return null;const data=await response.json().catch(()=>null);if(!data?.tenant?.slug||!tenantAdminCan(data.role,TENANT_ADMIN_CAPABILITIES.access))return null;return{type:'workspace_admin',key:String(data.email||''),role:String(data.role||''),workspaceKey:String(data.tenant.slug),platform:false}}
async function controlActor(request,env){return await adminActor(request,env)||await customerActor(request,env)}
function normalizeWorkspace(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9:_-]+/g,'-').slice(0,160)}
function normalizeSubjectType(value){const raw=String(value||'').trim().toLowerCase();return ['default','person','tier'].includes(raw)?raw:'default'}
function normalizeSubjectKey(value){return String(value||'').trim().slice(0,220)}
async function readOverrides(env,{workspaceKey='',subjectKeys=[],tier='free'}={}){const rows=[];if(!env.DB)return rows;const tierRows=await env.DB.prepare(`SELECT * FROM entitlement_overrides WHERE service=? AND workspace_key='' AND subject_type='tier' AND subject_key=? AND enabled=1 ORDER BY updated_at`).bind(SERVICE,normalizeTier(tier)).all();rows.push(...(tierRows.results||[]));if(workspaceKey){const result=await env.DB.prepare(`SELECT * FROM entitlement_overrides WHERE service=? AND workspace_key=? AND enabled=1 AND subject_type='default' ORDER BY updated_at`).bind(SERVICE,workspaceKey).all();rows.push(...(result.results||[]))}for(const subjectKey of subjectKeys){const globalRows=await env.DB.prepare(`SELECT * FROM entitlement_overrides WHERE service=? AND workspace_key='' AND subject_type='person' AND subject_key=? AND enabled=1 ORDER BY updated_at`).bind(SERVICE,subjectKey).all();rows.push(...(globalRows.results||[]));if(workspaceKey){const scoped=await env.DB.prepare(`SELECT * FROM entitlement_overrides WHERE service=? AND workspace_key=? AND subject_type='person' AND subject_key=? AND enabled=1 ORDER BY updated_at`).bind(SERVICE,workspaceKey,subjectKey).all();rows.push(...(scoped.results||[]))}}return rows}
function effectiveMap(tier,rows=[]){const map=new Map(PRESENTATION_ENTITLEMENT_CATALOG.map(item=>[item.id,{id:item.id,label:item.label,kind:item.kind,value:defaultValue(item,tier),source:`tier:${normalizeTier(tier)}`}])) ;for(const row of rows){const item=CATALOG.get(String(row.capability_id||''));if(!item)continue;const parsed=parseValue(row.value_json);const valid=validateValue(item,parsed);if(!valid.ok)continue;map.set(item.id,{id:item.id,label:item.label,kind:item.kind,value:valid.value,source:row.subject_type==='tier'?`tier-policy:${row.subject_key}`:row.subject_type==='person'?(row.workspace_key?'workspace-user':'user'):'workspace'})}return Object.fromEntries([...map.entries()].map(([id,value])=>[id,value]))}
async function effectiveForIdentity(env,identity,workspaceKey=''){const tier=await tierForIdentity(env,identity);const subjects=subjectCandidates(identity);const rows=await readOverrides(env,{workspaceKey,subjectKeys:subjects,tier});return{tier,service:SERVICE,workspaceKey:workspaceKey||null,subjectKey:canonicalAiSubject(identity)||subjects[0]||null,capabilities:effectiveMap(tier,rows)}}
async function audit(env,actor,entry){const now=new Date().toISOString();await env.DB.prepare(`INSERT INTO entitlement_audit_logs (actor_type,actor_key,workspace_key,subject_type,subject_key,service,capability_id,action,old_value_json,new_value_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(actor.type,actor.key,entry.workspaceKey||'',entry.subjectType||'default',entry.subjectKey||'',SERVICE,entry.capabilityId,entry.action,entry.oldValue??null,entry.newValue??null,now).run()}
async function controlSnapshot(request,env,actor){const url=new URL(request.url);let workspaceKey=normalizeWorkspace(url.searchParams.get('workspace'));if(!actor.platform){workspaceKey=actor.workspaceKey;if(url.searchParams.get('workspace')&&normalizeWorkspace(url.searchParams.get('workspace'))!==actor.workspaceKey)return json(request,env,{error:'workspace_scope_forbidden'},403)}const subjectKey=normalizeSubjectKey(url.searchParams.get('subject'));const params=[SERVICE,workspaceKey];let sql=`SELECT id,workspace_key,subject_type,subject_key,capability_id,value_json,enabled,updated_by,updated_at FROM entitlement_overrides WHERE service=? AND workspace_key=? AND subject_type!='tier'`;if(subjectKey){sql+=` AND (subject_type='default' OR subject_key=?)`;params.push(subjectKey)}sql+=' ORDER BY subject_type,subject_key,capability_id';const result=await env.DB.prepare(sql).bind(...params).all();const tierRows=await env.DB.prepare(`SELECT id,workspace_key,subject_type,subject_key,capability_id,value_json,enabled,updated_by,updated_at FROM entitlement_overrides WHERE service=? AND workspace_key='' AND subject_type='tier' ORDER BY subject_key,capability_id`).bind(SERVICE).all();const audits=await env.DB.prepare(`SELECT actor_type,actor_key,workspace_key,subject_type,subject_key,capability_id,action,created_at FROM entitlement_audit_logs WHERE service=? AND workspace_key=? ORDER BY id DESC LIMIT 30`).bind(SERVICE,workspaceKey).all();return json(request,env,{ok:true,service:SERVICE,workspaceKey,actor:{type:actor.type,role:actor.role,platform:actor.platform},tiers:ENTITLEMENT_TIERS,catalog:PRESENTATION_ENTITLEMENT_CATALOG,overrides:[...(tierRows.results||[]),...(result.results||[])].map(row=>({...row,value:parseValue(row.value_json)})),audit:audits.results||[]})}
async function readBody(request){try{return await request.json()}catch{return null}}
async function mutateOverride(request,env,actor){
  const body=await readBody(request);if(!body)return json(request,env,{error:'invalid_json'},400);
  let workspaceKey=normalizeWorkspace(body.workspaceKey),subjectType=normalizeSubjectType(body.subjectType),subjectKey='';
  if(subjectType==='tier'){if(!actor.platform)return json(request,env,{error:'platform_admin_required'},403);workspaceKey='';subjectKey=normalizeTier(body.subjectKey);}else{if(!actor.platform){if(!workspaceKey)workspaceKey=actor.workspaceKey;if(workspaceKey!==actor.workspaceKey)return json(request,env,{error:'workspace_scope_forbidden'},403)}subjectKey=subjectType==='person'?normalizeSubjectKey(body.subjectKey):'';}
  if(subjectType==='person'&&!subjectKey)return json(request,env,{error:'subject_key_required'},400);if(!workspaceKey&&subjectType==='default')return json(request,env,{error:'global_default_override_forbidden'},409);
  const capabilityId=String(body.capabilityId||'').trim(),item=CATALOG.get(capabilityId),validation=validateValue(item,body.value);if(!validation.ok)return json(request,env,{error:validation.error,capabilityId},400);
  if(subjectType==='tier'&&subjectKey==='free'&&FREE_REQUIRED.has(capabilityId)&&validation.value!==true)return json(request,env,{error:'free_core_required',capabilityId},409);if(subjectType==='tier'&&subjectKey==='free'&&item?.kind==='limit'&&validation.value<1)return json(request,env,{error:'free_core_limit_required',capabilityId},409);
  const old=await env.DB.prepare(`SELECT value_json,enabled FROM entitlement_overrides WHERE workspace_key=? AND subject_type=? AND subject_key=? AND service=? AND capability_id=?`).bind(workspaceKey,subjectType,subjectKey,SERVICE,capabilityId).first();const now=new Date().toISOString(),encoded=serializeValue(validation.value);
  await env.DB.prepare(`INSERT INTO entitlement_overrides (workspace_key,subject_type,subject_key,service,capability_id,value_json,enabled,updated_by,updated_at) VALUES (?,?,?,?,?,?,1,?,?) ON CONFLICT(workspace_key,subject_type,subject_key,service,capability_id) DO UPDATE SET value_json=excluded.value_json,enabled=1,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(workspaceKey,subjectType,subjectKey,SERVICE,capabilityId,encoded,actor.key,now).run();
  await audit(env,actor,{workspaceKey,subjectType,subjectKey,capabilityId,action:old?'override.update':'override.create',oldValue:old?.value_json??null,newValue:encoded});return json(request,env,{ok:true,workspaceKey,subjectType,subjectKey,capabilityId,value:validation.value},200);
}
async function deleteOverride(request,env,actor){
  const body=await readBody(request);if(!body)return json(request,env,{error:'invalid_json'},400);
  let workspaceKey=normalizeWorkspace(body.workspaceKey),subjectType=normalizeSubjectType(body.subjectType),subjectKey='';
  if(subjectType==='tier'){if(!actor.platform)return json(request,env,{error:'platform_admin_required'},403);workspaceKey='';subjectKey=normalizeTier(body.subjectKey);}else{if(!actor.platform){if(!workspaceKey)workspaceKey=actor.workspaceKey;if(workspaceKey!==actor.workspaceKey)return json(request,env,{error:'workspace_scope_forbidden'},403)}subjectKey=subjectType==='person'?normalizeSubjectKey(body.subjectKey):'';}
  const capabilityId=String(body.capabilityId||'').trim();if(!CATALOG.has(capabilityId))return json(request,env,{error:'unknown_capability'},400);
  const old=await env.DB.prepare(`SELECT value_json FROM entitlement_overrides WHERE workspace_key=? AND subject_type=? AND subject_key=? AND service=? AND capability_id=?`).bind(workspaceKey,subjectType,subjectKey,SERVICE,capabilityId).first();await env.DB.prepare(`DELETE FROM entitlement_overrides WHERE workspace_key=? AND subject_type=? AND subject_key=? AND service=? AND capability_id=?`).bind(workspaceKey,subjectType,subjectKey,SERVICE,capabilityId).run();if(old)await audit(env,actor,{workspaceKey,subjectType,subjectKey,capabilityId,action:'override.delete',oldValue:old.value_json,newValue:null});return json(request,env,{ok:true,deleted:Boolean(old)});
}
export async function handleEntitlementControl(request,env={}){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/entitlements')&&!path.startsWith('/api/control/entitlements'))return null;
  if(!allowedOrigin(request.headers.get('origin')||'',env))return json(request,env,{error:'origin_forbidden'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request,env)});
  if(path==='/api/entitlements/catalog'&&request.method==='GET')return json(request,env,{service:SERVICE,tiers:ENTITLEMENT_TIERS,catalog:PRESENTATION_ENTITLEMENT_CATALOG,policy:'tier-default < workspace-default < user-exception'});
  if(!env.DB)return json(request,env,{error:'entitlement_database_unavailable'},503);
  if(path==='/api/entitlements/me'&&request.method==='GET'){
    const identity=await userIdentity(request,env);
    if(!identity)return json(request,env,{error:'authentication_required'},401);
    const workspaceKey=normalizeWorkspace(url.searchParams.get('workspace'));
    if(workspaceKey&&!(await verifiedWorkspaceForIdentity(request,env,workspaceKey)))return json(request,env,{error:'workspace_access_required'},403);
    const effective=await effectiveForIdentity(env,identity,workspaceKey);
    return json(request,env,{ok:true,identity:{email:identity.email,ekodiId:identity.ekodiId||null},...effective});
  }
  if(path==='/api/entitlements/workspace/me'&&request.method==='GET'){
    const actor=await customerActor(request,env);
    if(!actor)return json(request,env,{error:'workspace_admin_authentication_required'},401);
    const rows=await readOverrides(env,{workspaceKey:actor.workspaceKey});
    return json(request,env,{ok:true,service:SERVICE,tier:'free',workspaceKey:actor.workspaceKey,role:actor.role,capabilities:effectiveMap('free',rows)});
  }
  if(path==='/api/control/entitlements'){
    const actor=await controlActor(request,env);
    if(!actor)return json(request,env,{error:'entitlement_admin_authentication_required'},401);
    if(request.method==='GET')return controlSnapshot(request,env,actor);
    if(request.method==='PUT')return mutateOverride(request,env,actor);
    if(request.method==='DELETE')return deleteOverride(request,env,actor);
    return json(request,env,{error:'method_not_allowed'},405);
  }
  return json(request,env,{error:'entitlement_endpoint_not_found'},404);
}

export const ENTITLEMENT_CONTROL_CONTRACT=Object.freeze({
  version:'ekodi.entitlements.v1',service:SERVICE,
  precedence:['tier-default','workspace-default','user-exception'],
  tenantIsolation:true,auditRequired:true,freeCoreComplete:true,
});
