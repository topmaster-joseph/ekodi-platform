import authWorker from './auth-worker.js';
import { principalFromAdminSession } from './ekodi-principal.js';
import { businessOsGate } from './business-os-core.js';

// Canonical, private draft ledger. This is NOT a payment, signed-contract,
// invoice issuance, bank transfer, or final settlement API.
export const DORAJI_LEDGER_ROOT='/ekodibiz/doraji/api/v1';
const ALLOWED_KINDS=new Set(['cultivation','budget','contract','delivery','document']);
const PROJECT_STATES=new Set(['draft','planning','cultivation','harvest','closed']);
const MAX_BODY_BYTES=8192;
const JSON_HEADERS=Object.freeze({
 'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store',
 'x-content-type-options':'nosniff',
 'x-robots-tag':'noindex, nofollow, noarchive',
 'referrer-policy':'no-referrer',
 'vary':'Authorization',
});
const json=(data,status=200,more={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...more}});
const bad=(code,status=400)=>json({ok:false,error:code},status);
const uuid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const clean=(value,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
const formatDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))?s:null;
const idPattern=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const projectRoutes=new RegExp('^'+DORAJI_LEDGER_ROOT+'/projects/([0-9a-f-]{36})(?:/(records|audit)(?:/([0-9a-f-]{36}))?)?$', 'i');
export function isDorajiLedgerApiPath(path){return path===DORAJI_LEDGER_ROOT+'/projects'||projectRoutes.test(path);}
export function validateDorajiProjectInput(value,{partial=false}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const keys=Object.keys(value),allowed=['name','region','greenhouseCount','areaSqm','status','version'];
 if(keys.some(k=>!allowed.includes(k))||keys.length===0)return null;
 if(!partial||value.name!==undefined){if(typeof value.name!=='string'||!value.name.trim()||value.name.trim().length>160)return null;}
 if(value.region!==undefined&&(typeof value.region!=='string'||value.region.length>160))return null;
 if(value.greenhouseCount!==undefined&&(!Number.isSafeInteger(value.greenhouseCount)||value.greenhouseCount<0||value.greenhouseCount>100000))return null;
 if(value.areaSqm!==undefined&&(typeof value.areaSqm!=='number'||!Number.isFinite(value.areaSqm)||value.areaSqm<0||value.areaSqm>100000000))return null;
 if(value.status!==undefined&&!PROJECT_STATES.has(value.status))return null;
 if(partial&&(!Number.isSafeInteger(value.version)||value.version<1))return null;
 if(!partial&&(value.status!==undefined&&value.status!=='draft'||value.version!==undefined))return null;
 return {name:value.name!==undefined?value.name.trim():undefined,region:value.region!==undefined?value.region.trim():undefined,greenhouseCount:value.greenhouseCount,areaSqm:value.areaSqm,status:value.status,version:value.version};
}
export function validateDorajiRecordInput(value,{partial=false}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const allowed=['kind','date','title','note','quantityKg','amountKRW','counterparty','reference','version'];
 const keys=Object.keys(value);
 if(keys.length===0||keys.some(k=>!allowed.includes(k)))return null;
 if(!partial&&!ALLOWED_KINDS.has(value.kind))return null;
 if(partial&&value.kind!==undefined)return null; // Records cannot be reclassified after creation.
 if(!partial||value.date!==undefined){if(!formatDate(value.date))return null;}
 if(!partial||value.title!==undefined){if(typeof value.title!=='string'||!value.title.trim()||value.title.trim().length>160)return null;}
 for(const [field,max] of [['note',2000],['counterparty',160],['reference',240]]){
  if(value[field]!==undefined&&(typeof value[field]!=='string'||value[field].length>max))return null;
 }
 if(value.quantityKg!==undefined&&(typeof value.quantityKg!=='number'||!Number.isFinite(value.quantityKg)||value.quantityKg<0||value.quantityKg>1e9))return null;
 if(value.amountKRW!==undefined&&(!Number.isSafeInteger(value.amountKRW)||value.amountKRW<0||value.amountKRW>9e15))return null;
 if(partial&&(!Number.isSafeInteger(value.version)||value.version<1))return null;
 if(!partial&&value.version!==undefined)return null;
 return {kind:value.kind,date:value.date,title:value.title?.trim(),note:value.note?.trim(),quantityKg:value.quantityKg,amountKRW:value.amountKRW,counterparty:value.counterparty?.trim(),reference:value.reference?.trim(),version:value.version};
}
async function readPayload(request){
 const mime=request.headers.get('content-type')||'';
 if(!/^application\/json(?:\s*;|\s*$)/i.test(mime))throw Object.assign(new Error('content_type_required'),{status:415});
 const advertised=Number(request.headers.get('content-length')||0);
 if(advertised>MAX_BODY_BYTES)throw Object.assign(new Error('payload_too_large'),{status:413});
 const input=await request.text();
 if(new TextEncoder().encode(input).length>MAX_BODY_BYTES)throw Object.assign(new Error('payload_too_large'),{status:413});
 try{return JSON.parse(input)}catch{throw Object.assign(new Error('invalid_json'),{status:400})}
}
async function trustedAdmin(request,env,resolveSession=principalFromAdminSession){
 const authorization=request.headers.get('authorization')||'';
 if(!/^Bearer\s+\S+/i.test(authorization))return {error:bad('authentication_required',401)};
 const {principal}=await resolveSession(request,env,authWorker);
 if(principal?.kind!=='admin'||!principal.email)return {error:bad('authentication_required',401)};
 const row=await env.DB.prepare('SELECT id FROM admins WHERE lower(trim(email))=?').bind(principal.email.toLowerCase()).first();
 if(!row?.id)return {error:bad('admin_not_registered',403)};
 return {adminId:row.id};
}
async function projectAccess(env,projectId,adminId){
 const row=await env.DB.prepare(`SELECT p.*,
 CASE WHEN p.owner_admin_id=? THEN 'owner' ELSE (SELECT role FROM doraji_project_roles WHERE project_id=p.id AND admin_id=?) END AS access_role
 FROM doraji_projects p WHERE p.id=?`).bind(adminId,adminId,projectId).first();
 return row?.access_role?row:null;
}
async function audit(env,projectId,adminId,action,resourceId){
 return env.DB.prepare('INSERT INTO doraji_audit_events(id,project_id,actor_admin_id,action,resource_id,description,created_at) VALUES(?,?,?,?,?,?,?)')
  .bind(uuid(),projectId,adminId,action,resourceId,'draft_ledger',now());
}
const resultList=r=>r?.results||[];
export async function dorajiLedgerApiResponse(request,env,{resolveSession=principalFromAdminSession}={}){
 const url=new URL(request.url),path=url.pathname;
 if(!isDorajiLedgerApiPath(path))return null;
 // Even if the edge alias is accidentally reattached, no private records are available there.
 if(url.origin!=='https://ekodi.kr')return bad('canonical_origin_required',403);
 if(request.headers.get('origin')&&request.headers.get('origin')!=='https://ekodi.kr')return bad('origin_forbidden',403);
 if(!['GET','POST','PATCH'].includes(request.method))return json({ok:false,error:'method_not_allowed'},405,{allow:'GET, POST, PATCH'});
 if(!env?.DB)return bad('ledger_unavailable',503);
 let adminId;
 try{const auth=await trustedAdmin(request,env,resolveSession);if(auth.error)return auth.error;adminId=auth.adminId}
 catch{return bad('authentication_unavailable',503)}
 const parts=projectRoutes.exec(path);
 try{
  if(!parts){
   if(request.method==='GET'){
    const list=await env.DB.prepare(`SELECT p.id,p.name,p.region,p.greenhouse_count,p.area_sqm,p.status,p.version,p.updated_at,
 CASE WHEN p.owner_admin_id=? THEN 'owner' ELSE (SELECT role FROM doraji_project_roles WHERE project_id=p.id AND admin_id=?) END AS access_role
 FROM doraji_projects p WHERE p.owner_admin_id=? OR EXISTS(SELECT 1 FROM doraji_project_roles r WHERE r.project_id=p.id AND r.admin_id=?)
 ORDER BY p.updated_at DESC LIMIT 100`).bind(adminId,adminId,adminId,adminId).all();
    return json({ok:true,items:resultList(list)});
   }
   if(request.method!=='POST')return bad('method_not_allowed',405);
   const value=validateDorajiProjectInput(await readPayload(request));
   if(!value)return bad('invalid_project',400);
   const id=uuid(),created=now();
   await env.DB.batch([
    env.DB.prepare('INSERT INTO doraji_projects(id,owner_admin_id,name,region,greenhouse_count,area_sqm,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
     .bind(id,adminId,value.name,value.region||'',value.greenhouseCount??0,value.areaSqm??0,'draft',created,created),
    env.DB.prepare('INSERT INTO doraji_audit_events(id,project_id,actor_admin_id,action,resource_id,description,created_at) VALUES(?,?,?,?,?,?,?)')
     .bind(uuid(),id,adminId,'project_created',id,'draft_ledger',created)
   ]);
   return json({ok:true,id,status:'draft',signed:false,paymentExecuted:false},201);
  }
  const [,projectId,section,recordId]=parts;
  if(!idPattern.test(projectId)||recordId&&!idPattern.test(recordId))return bad('not_found',404);
  const project=await projectAccess(env,projectId,adminId);
  if(!project)return bad('not_found',404); // Do not disclose other projects.
  const canWrite=['owner','editor'].includes(project.access_role);
  if(!section){
   if(request.method==='GET')return json({ok:true,project});
   if(request.method!=='PATCH')return bad('method_not_allowed',405);
   if(!canWrite)return bad('forbidden',403);
   const value=validateDorajiProjectInput(await readPayload(request),{partial:true});
   if(!value)return bad('invalid_project',400);
   const result=await env.DB.prepare(`UPDATE doraji_projects SET name=?,region=?,greenhouse_count=?,area_sqm=?,status=?,version=version+1,updated_at=?
 WHERE id=? AND version=?`)
     .bind(value.name??project.name,value.region??project.region,value.greenhouseCount??project.greenhouse_count,value.areaSqm??project.area_sqm,value.status??project.status,now(),projectId,value.version).run();
   if(result.meta?.changes!==1)return bad('version_conflict',409);
   await (await audit(env,projectId,adminId,'project_updated',projectId)).run();
   return json({ok:true,version:value.version+1,status:'draft_data_only'});
  }
  if(section==='audit'){
   if(request.method!=='GET'||recordId)return bad('method_not_allowed',405);
   const events=await env.DB.prepare('SELECT id,actor_admin_id,action,resource_id,created_at FROM doraji_audit_events WHERE project_id=? ORDER BY created_at DESC LIMIT 100').bind(projectId).all();
   return json({ok:true,items:resultList(events)});
  }
  if(section!=='records')return bad('not_found',404);
  if(request.method==='GET'){
   if(recordId)return bad('not_found',404);
   const kind=url.searchParams.get('kind')||'';
   if(kind&&!ALLOWED_KINDS.has(kind))return bad('invalid_kind',400);
   const q=kind?'SELECT * FROM doraji_records WHERE project_id=? AND kind=? ORDER BY record_date DESC LIMIT 100':'SELECT * FROM doraji_records WHERE project_id=? ORDER BY record_date DESC LIMIT 100';
   const records=await env.DB.prepare(q).bind(...(kind?[projectId,kind]:[projectId])).all();
   return json({ok:true,items:resultList(records),draftOnly:true});
  }
  if(!canWrite)return bad('forbidden',403);
  if(request.method==='POST'&&!recordId){
   const value=validateDorajiRecordInput(await readPayload(request));
   if(!value)return bad('invalid_record',400);
   // High-impact operations are never executed via this API, even if a caller forges a status.
   if(businessOsGate('sign_contract').decision!=='blocked'||businessOsGate('approve_delivery_settlement').decision!=='blocked')return bad('approval_policy_unavailable',503);
   const id=uuid(),created=now();
   await env.DB.batch([
    env.DB.prepare(`INSERT INTO doraji_records
    (id,project_id,kind,record_date,title,note,quantity_kg,amount_krw,counterparty,reference,author_admin_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,projectId,value.kind,value.date,value.title,value.note||'',value.quantityKg??0,value.amountKRW??0,value.counterparty||'',value.reference||'',adminId,created,created),
    env.DB.prepare('INSERT INTO doraji_audit_events(id,project_id,actor_admin_id,action,resource_id,description,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind(uuid(),projectId,adminId,'record_created',id,value.kind,created)
   ]);
   return json({ok:true,id,state:'draft',signed:false,settlementApproved:false,paymentExecuted:false},201);
  }
  if(request.method==='PATCH'&&recordId){
   const value=validateDorajiRecordInput(await readPayload(request),{partial:true});
   if(!value)return bad('invalid_record',400);
   const old=await env.DB.prepare('SELECT * FROM doraji_records WHERE id=? AND project_id=?').bind(recordId,projectId).first();
   if(!old)return bad('not_found',404);
   const changed=await env.DB.prepare(`UPDATE doraji_records SET record_date=?,title=?,note=?,quantity_kg=?,amount_krw=?,counterparty=?,reference=?,version=version+1,updated_at=?
    WHERE id=? AND project_id=? AND version=? AND state='draft'`)
    .bind(value.date??old.record_date,value.title??old.title,value.note??old.note,value.quantityKg??old.quantity_kg,value.amountKRW??old.amount_krw,value.counterparty??old.counterparty,value.reference??old.reference,now(),recordId,projectId,value.version).run();
   if(changed.meta?.changes!==1)return bad('version_conflict',409);
   await (await audit(env,projectId,adminId,'record_updated',recordId)).run();
   return json({ok:true,id:recordId,state:'draft',version:value.version+1});
  }
  return bad('method_not_allowed',405);
 }catch(e){
  if(e?.status&&['payload_too_large','content_type_required','invalid_json'].includes(e.message))return bad(e.message,e.status);
  return bad('ledger_unavailable',503);
 }
}
