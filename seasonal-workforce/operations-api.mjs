// EKODI municipal workforce-demand planning API. No recruitment, selection, visas or allocation.
// Disabled until authorized operator, D1 schema and staging verification are approved.
import authWorker from '../auth-worker.js';
import {principalFromAdminSession} from '../ekodi-principal.js';
import {validateFarmDemand} from './demand-domain.mjs';
export const SEASONAL_API_ROOT='/ekodibiz/seasonal-workers/api/v1';
const ROOT=/^\/ekodibiz\/seasonal-workers\/api\/v1\/tenants\/([a-z0-9][a-z0-9_-]{1,63})\/demands(?:\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}))?$/i;
const STATS=/^\/ekodibiz\/seasonal-workers\/api\/v1\/tenants\/([a-z0-9][a-z0-9_-]{1,63})\/statistics$/i;
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive','referrer-policy':'no-referrer','vary':'Authorization'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const error=(code,status)=>json({ok:false,error:code},status);
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const rows=result=>Array.isArray(result?.results)?result.results:[];
const ADMIN_ROLES=new Set(['municipal_operator','auditor']);
export const isSeasonalOperationsPath=path=>path===SEASONAL_API_ROOT||path.startsWith(SEASONAL_API_ROOT+'/');

export function validateSeasonalSubmission(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const keys=Object.keys(value);
 if(keys.length!==6||keys.some(k=>!['crop','workers','start_month','duration_months','housing_status','request_id'].includes(k)))return null;
 if(typeof value.request_id!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.request_id))return null;
 try{return {...validateFarmDemand(value),request_id:value.request_id.toLowerCase()}}catch{return null}
}
export function validateSeasonalReview(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2)return null;
 if(!Number.isSafeInteger(value.version)||value.version<1||!['under_review','approved','rejected'].includes(value.status))return null;
 return {version:value.version,status:value.status};
}
async function payload(request){
 if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type')||''))throw Object.assign(new Error('content_type_required'),{status:415});
 const len=Number(request.headers.get('content-length')||0);
 if(!Number.isFinite(len)||len>4096)throw Object.assign(new Error('payload_too_large'),{status:413});
 const data=await request.text();
 if(new TextEncoder().encode(data).length>4096)throw Object.assign(new Error('payload_too_large'),{status:413});
 try{return JSON.parse(data)}catch{throw Object.assign(new Error('invalid_json'),{status:400})}
}
async function defaultAdmin(request,env){return (await principalFromAdminSession(request,env,authWorker)).principal}
async function operator(request,env,slug,resolveAdmin){
 if(!/^Bearer\s+\S+$/i.test(request.headers.get('authorization')||''))return {error:error('authentication_required',401)};
 const principal=await resolveAdmin(request,env);
 if(principal?.kind!=='admin'||!principal.email)return {error:error('authentication_required',401)};
 const admin=await env.DB.prepare('SELECT id FROM admins WHERE lower(trim(email))=?').bind(principal.email.toLowerCase()).first();
 if(!admin?.id)return {error:error('administrator_unregistered',403)};
 const membership=await env.DB.prepare('SELECT t.id AS tenant_id,r.role FROM seasonal_tenants t JOIN seasonal_operator_roles r ON r.tenant_id=t.id WHERE t.slug=? AND t.activated=1 AND r.admin_id=? AND r.active=1 LIMIT 1').bind(slug,admin.id).first();
 if(!membership?.tenant_id||!ADMIN_ROLES.has(membership.role))return {error:error('not_found',404)};
 return {tenantId:membership.tenant_id,adminId:admin.id,role:membership.role};
}
const redact=r=>({id:r.id,crop:r.crop,workers:r.workers,start_month:r.start_month,duration_months:r.duration_months,housing_status:r.housing_status,status:r.status,version:r.version,created_at:r.created_at,updated_at:r.updated_at});

export async function seasonalOperationsResponse(request,env,{resolveAdmin=defaultAdmin}={}){
 const url=new URL(request.url),path=url.pathname;
 if(!isSeasonalOperationsPath(path))return null;
 if(url.origin!=='https://ekodi.kr')return error('canonical_origin_required',403);
 const origin=request.headers.get('origin');
 if(origin&&origin!=='https://ekodi.kr')return error('origin_forbidden',403);
 if(['POST','PATCH'].includes(request.method)&&(origin!=='https://ekodi.kr'||['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')||'')))return error('same_origin_required',403);
 if(!['GET','POST','PATCH'].includes(request.method))return error('method_not_allowed',405);
 if(env?.SEASONAL_PORTAL_OPERATIONS_ENABLED!=='true')return error('applications_not_enabled',503);
 if(!env?.DB)return error('storage_unavailable',503);
 const match=ROOT.exec(path),stats=STATS.exec(path);
 if(!match&&!stats)return error('not_found',404);
 if(stats&&request.method!=='GET')return error('method_not_allowed',405);
 const slug=match?.[1]||stats?.[1],demandId=match?.[2]||'';
 let identity;
 try{identity=await operator(request,env,slug,resolveAdmin)}catch{return error('identity_unavailable',503)}
 if(identity.error)return identity.error;
 const {tenantId,adminId,role}=identity;
 try{
  if(stats){
   const aggregates=rows(await env.DB.prepare('SELECT status,count(*) AS count,sum(workers) AS workers,sum(workers*duration_months) AS person_months FROM seasonal_farm_demands WHERE tenant_id=? GROUP BY status').bind(tenantId).all());
   const counts={submitted:0,under_review:0,approved:0,rejected:0,cancelled:0};
   let total=0,workers=0,personMonths=0;
   for(const row of aggregates){if(!Object.hasOwn(counts,row.status))continue;counts[row.status]=Number(row.count||0);total+=Number(row.count||0);workers+=Number(row.workers||0);personMonths+=Number(row.person_months||0)}
   return json({ok:true,scope:'internal_demand_review_only',allocationConfirmed:false,total,workers,personMonths,counts});
  }
  if(request.method==='GET'){
   if(demandId){
    const row=await env.DB.prepare('SELECT * FROM seasonal_farm_demands WHERE tenant_id=? AND id=?').bind(tenantId,demandId).first();
    return row?json({ok:true,item:redact(row),allocationConfirmed:false}):error('not_found',404);
   }
   const result=await env.DB.prepare('SELECT * FROM seasonal_farm_demands WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100').bind(tenantId).all();
   return json({ok:true,items:rows(result).map(redact),allocationConfirmed:false});
  }
  if(role!=='municipal_operator')return error('forbidden',403);
  if(!env.PLATFORM_SENSITIVE_RATE_LIMITER?.limit)return error('rate_limit_unavailable',503);
  const limited=await env.PLATFORM_SENSITIVE_RATE_LIMITER.limit({key:'seasonal:'+tenantId+':'+adminId});
  if(limited?.success!==true)return error('rate_limited',429);
  if(request.method==='POST'&&!demandId){
   const value=validateSeasonalSubmission(await payload(request));
   if(!value)return error('invalid_demand',400);
   const old=await env.DB.prepare('SELECT id,created_by_admin_id FROM seasonal_farm_demands WHERE tenant_id=? AND request_id=?').bind(tenantId,value.request_id).first();
   if(old)return old.created_by_admin_id===adminId?json({ok:true,id:old.id,replayed:true,allocationConfirmed:false}):error('request_conflict',409);
   const id=uid(),date=now();
   await env.DB.batch([
    env.DB.prepare("INSERT INTO seasonal_farm_demands (id,tenant_id,request_id,created_by_admin_id,crop,workers,start_month,duration_months,housing_status,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'submitted',1,?,?)").bind(id,tenantId,value.request_id,adminId,value.crop,value.workers,value.start_month,value.duration_months,value.housing_status,date,date),
    env.DB.prepare('INSERT INTO seasonal_demand_audit (id,tenant_id,demand_id,actor_admin_id,action,occurred_at) VALUES(?,?,?,?,?,?)').bind(uid(),tenantId,id,adminId,'submitted',date),
   ]);
   return json({ok:true,id,status:'submitted',allocationConfirmed:false},201);
  }
  if(request.method==='PATCH'&&demandId){
   const value=validateSeasonalReview(await payload(request));
   if(!value)return error('invalid_review',400);
   const date=now();
   const [updated]=await env.DB.batch([
    env.DB.prepare('UPDATE seasonal_farm_demands SET status=?,version=version+1,reviewed_by_admin_id=?,updated_at=? WHERE id=? AND tenant_id=? AND version=?').bind(value.status,adminId,date,demandId,tenantId,value.version),
    env.DB.prepare('INSERT INTO seasonal_demand_audit (id,tenant_id,demand_id,actor_admin_id,action,occurred_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(uid(),tenantId,demandId,adminId,value.status,date),
   ]);
   if(updated?.meta?.changes!==1)return error('not_found_or_version_conflict',409);
   return json({ok:true,id:demandId,status:value.status,version:value.version+1,allocationConfirmed:false});
  }
  return error('method_not_allowed',405);
 }catch(e){
  return [400,413,415].includes(e?.status)?error(e.message,e.status):error('operations_unavailable',503);
 }
}
