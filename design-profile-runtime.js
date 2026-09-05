const TONES=new Set(['inherit','warm','calm','vivid','mono','night']);
const CHARACTERS=new Set(['auto','off','welcome','guide','read','idea']);
const SEASONS=new Set(['auto','off','spring','summer','autumn','winter']);
const MOTIONS=new Set(['inherit','still','gentle']);
const FOOTERS=new Set(['inherit','contextual']);
const MODES=new Set(['baseline','manual','recommended']);
const clean=(v,max=80)=>String(v??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
function parse(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}
function profile(input={}){return Object.freeze({
  mode:MODES.has(input.mode)?input.mode:'baseline',
  tone:TONES.has(input.tone)?input.tone:'inherit',
  character:CHARACTERS.has(input.character)?input.character:'auto',
  season:SEASONS.has(input.season)?input.season:'auto',
  motion:MOTIONS.has(input.motion)?input.motion:'inherit',
  footer:FOOTERS.has(input.footer)?input.footer:'contextual',
});}
const RECOMMENDATIONS=Object.freeze({
  church:{tone:'warm',character:'welcome',season:'auto',motion:'gentle'},
  community:{tone:'warm',character:'welcome',season:'auto',motion:'gentle'},
  mall:{tone:'vivid',character:'guide',season:'auto',motion:'gentle'},
  marketing:{tone:'vivid',character:'idea',season:'auto',motion:'gentle'},
  biz:{tone:'calm',character:'guide',season:'off',motion:'still'},
  business:{tone:'calm',character:'guide',season:'off',motion:'still'},
  lab:{tone:'calm',character:'idea',season:'off',motion:'still'},
  books:{tone:'warm',character:'read',season:'auto',motion:'still'},
  publishing:{tone:'warm',character:'read',season:'auto',motion:'still'},
  invest:{tone:'calm',character:'off',season:'off',motion:'still'},
  pay:{tone:'calm',character:'off',season:'off',motion:'still'},
  insurance:{tone:'calm',character:'guide',season:'off',motion:'still'},
  developer:{tone:'calm',character:'guide',season:'off',motion:'still'},
  experience:{tone:'night',character:'welcome',season:'off',motion:'gentle'},
});
export function recommendedDesignProfile(serviceId=''){return profile({mode:'recommended',footer:'contextual',...(RECOMMENDATIONS[clean(serviceId).toLowerCase()]||{tone:'inherit',character:'auto',season:'auto',motion:'inherit'})});}
function responseHeaders(cache='no-store'){return {'content-type':'application/json; charset=utf-8','cache-control':cache,'access-control-allow-origin':'*','access-control-allow-methods':'GET,PUT,POST,OPTIONS','access-control-allow-headers':'content-type,authorization','x-content-type-options':'nosniff'}}
function publicJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:responseHeaders('public, max-age=60, stale-while-revalidate=300')})}
function privateJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:responseHeaders('no-store')})}
async function identity(request){
 const auth=clean(request.headers.get('authorization'),8192);const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';if(!token)return null;
 const r=await fetch('https://renzehysxirjilvdxacv.supabase.co/auth/v1/user',{headers:{apikey:'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_',authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}).catch(()=>null);if(!r?.ok)return null;const u=await r.json().catch(()=>null);return u?.id&&u?.email_confirmed_at?{id:String(u.id),email:clean(u.email,240).toLowerCase()}:null;
}
async function canManage(env,who,subjectKey){
 const tenant=await env.DB.prepare('SELECT id,status FROM customer_tenants WHERE slug=?').bind(subjectKey).first();if(!tenant||tenant.status!=='active')return false;
 const grant=await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id=? AND email=?').bind(tenant.id,who.email).first();
 return Boolean(grant&&Number(grant.enabled)===1&&new Set(['store_owner','hq_manager','client_admin','manager','owner']).has(String(grant.role||'')));
}
async function row(env,subjectKey,serviceId){return env.DB.prepare('SELECT profile_json,profile_version,updated_by,updated_at FROM site_design_profiles WHERE subject_type=? AND subject_key=? AND service_id=?').bind('tenant',subjectKey,serviceId).first()}
export async function handleDesignProfileApi(request,env){
 const url=new URL(request.url);const path=url.pathname.replace(/\/+$/,'');if(!path.startsWith('/v1/design-profiles'))return null;if(request.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders('no-store')});if(!env?.DB)return privateJson({error:'DATABASE_UNAVAILABLE'},503);
 const subjectKey=clean(url.searchParams.get('subject_key'),80).toLowerCase();const serviceId=clean(url.searchParams.get('service_id'),80).toLowerCase();if(!subjectKey||!serviceId)return privateJson({error:'SUBJECT_AND_SERVICE_REQUIRED'},400);
 if(path==='/v1/design-profiles/public'&&request.method==='GET'){
  const current=await row(env,subjectKey,serviceId);return publicJson({version:1,subjectKey,serviceId,profile:profile(parse(current?.profile_json,{})),updatedAt:current?.updated_at||null});
 }
 const who=await identity(request);if(!who)return privateJson({error:'AUTH_REQUIRED'},401);if(!(await canManage(env,who,subjectKey)))return privateJson({error:'SUBJECT_FORBIDDEN'},403);
 if(path==='/v1/design-profiles/recommend'&&request.method==='POST')return privateJson({version:1,subjectKey,serviceId,profile:recommendedDesignProfile(serviceId),source:'ekodi-design-recommender-v1'});
 if(path==='/v1/design-profiles'&&request.method==='GET'){
  const current=await row(env,subjectKey,serviceId);return privateJson({version:1,subjectKey,serviceId,profile:profile(parse(current?.profile_json,{})),recommended:recommendedDesignProfile(serviceId),updatedAt:current?.updated_at||null,updatedBy:current?.updated_by||null});
 }
 if(path==='/v1/design-profiles'&&request.method==='PUT'){
  if(String(env.ALLOW_MUTATIONS)!=='true')return privateJson({error:'MUTATIONS_DISABLED'},503);const data=await request.json().catch(()=>null);if(!data)return privateJson({error:'INVALID_JSON'},400);const next=profile(data.profile||data);const now=nowIso();
  await env.DB.prepare(`INSERT INTO site_design_profiles(subject_type,subject_key,service_id,profile_json,profile_version,updated_by,updated_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(subject_type,subject_key,service_id) DO UPDATE SET profile_json=excluded.profile_json,profile_version=site_design_profiles.profile_version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind('tenant',subjectKey,serviceId,JSON.stringify(next),who.email,now).run();
  return privateJson({ok:true,subjectKey,serviceId,profile:next,updatedAt:now});
 }
 return privateJson({error:'NOT_FOUND'},404);
}
