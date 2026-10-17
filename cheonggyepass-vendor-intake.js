import { resolveRegionalAccess } from './regional-access-control.js';
import { regionalCommerceProgramById } from './regional-commerce-program-registry.js';
import { REGIONAL_COMMERCE_PROGRAM_CAPABILITIES } from './regional-commerce-program-contract.js';

const BASE='/api/cheonggyepass/vendor-intake';
const MAX_JSON_BYTES=12000;
const MAX_ZIP_BYTES=8*1024*1024;
const DELIVERY=new Set(['github_pr','zip','external_api']);
const REVIEW_STATES=new Set(['review_pending','approved_for_testing','rejected']);
const SECRET_FIELDS=/token|secret|password|authorization|private.?key|api.?key|credential|cookie/i;
const HOST_BLOCK=/(^localhost$|\.localhost$|\.local$|\.internal$|\.test$|\.invalid$|\.example$|\.onion$)/i;

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-content-type-options':'nosniff',
      'referrer-policy':'no-referrer',
    },
  });
}
const clean=(s,max=180)=>String(s??'').trim().slice(0,max);
function hasSensitiveField(value){
  if(!value||typeof value!=='object')return false;
  return Object.keys(value).some(key=>SECRET_FIELDS.test(key));
}
function error(code,message,status=400){return json({ok:false,code,error:message},status)}
function isPrivateHost(name){
  const host=name.toLowerCase().replace(/\.$/,'');
  if(HOST_BLOCK.test(host)||!host.includes('.')||host.includes('%'))return true;
  if(/^\d+(?:\.\d+){0,3}$/.test(host)){
    // Explicit numeric hosts are never accepted (not only RFC1918).
    return true;
  }
  if(host.includes(':')||host.startsWith('['))return true;
  return false;
}
export function safePublicHttps(value,{githubPr=false}={}){
  if(typeof value!=='string'||value.length>1000)return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)return null;
    if(isPrivateHost(url.hostname))return null;
    if(githubPr){
      if(url.hostname!=='github.com')return null;
      if(!/^\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/pull\/[1-9][0-9]*\/?$/i.test(url.pathname))return null;
    }
    return url.toString();
  }catch{return null}
}
export function intakePermission(access,action){
  if(!access?.ok)return false;
  const role=clean(access.role,80).toLowerCase();
  const external=['external_vendor','external_developer'].includes(role);
  const set=new Set(access.capabilities||[]);
  const all=Boolean(access.platform)||set.has('*');
  if(action==='review')return !external&&(Boolean(access.platform)||Boolean(access.canManageAccess));
  if(action==='submit')return all||set.has('tenant.integration.inspect')||set.has('tenant.pr.create')||set.has('tenant.operations.manage');
  if(action==='read')return intakePermission(access,'submit')||intakePermission(access,'review');
  return false;
}
export function validateVendorSubmission(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||hasSensitiveField(body))return {ok:false,code:'INVALID_FIELDS'};
  const allowed=new Set(['delivery','vendorName','sourceUrl','sourceRef','apiBaseUrl','documentationUrl','capabilities']);
  if(Object.keys(body).some(key=>!allowed.has(key)))return {ok:false,code:'UNRECOGNIZED_FIELD'};
  const delivery=clean(body.delivery,40);
  if(!DELIVERY.has(delivery))return {ok:false,code:'DELIVERY_UNSUPPORTED'};
  const vendorName=clean(body.vendorName,100);
  if(vendorName.length<2)return {ok:false,code:'VENDOR_NAME_REQUIRED'};
  const sourceRef=clean(body.sourceRef,80);
  if(sourceRef&&!/^[a-f0-9]{40}$/i.test(sourceRef))return {ok:false,code:'SOURCE_SHA_REQUIRED'};
  if(delivery==='github_pr'){
    const sourceUrl=safePublicHttps(body.sourceUrl,{githubPr:true});
    if(!sourceUrl)return {ok:false,code:'GITHUB_PR_URL_REQUIRED'};
    if(body.apiBaseUrl||body.documentationUrl||body.capabilities)return {ok:false,code:'CROSS_MODE_FIELDS'};
    return {ok:true,value:{delivery,vendorName,sourceUrl,sourceRef,apiBaseUrl:'',documentationUrl:'',capabilities:[]}};
  }
  if(delivery==='zip'){
    if(body.sourceUrl||body.apiBaseUrl||body.documentationUrl||body.capabilities||sourceRef)return {ok:false,code:'CROSS_MODE_FIELDS'};
    return {ok:true,value:{delivery,vendorName,sourceUrl:'',sourceRef:'',apiBaseUrl:'',documentationUrl:'',capabilities:[]}};
  }
  if(body.sourceUrl||sourceRef)return {ok:false,code:'CROSS_MODE_FIELDS'};
  const apiBaseUrl=safePublicHttps(body.apiBaseUrl);
  const documentationUrl=safePublicHttps(body.documentationUrl);
  if(!apiBaseUrl||!documentationUrl)return {ok:false,code:'API_HTTPS_URL_REQUIRED'};
  const candidate=body.capabilities===undefined?['health']:body.capabilities;
  if(!Array.isArray(candidate)||candidate.length<1||candidate.length>12||
      candidate.some(v=>typeof v!=='string'||!REGIONAL_COMMERCE_PROGRAM_CAPABILITIES.includes(v))){
    return {ok:false,code:'API_CAPABILITIES_INVALID'};
  }
  const capabilities=[...new Set(candidate)];
  if(!capabilities.includes('health'))return {ok:false,code:'API_HEALTH_REQUIRED'};
  return {ok:true,value:{delivery,vendorName,sourceUrl:'',sourceRef:'',apiBaseUrl,documentationUrl,capabilities}};
}
async function bodyJson(request){
  const length=Number(request.headers.get('content-length')||0);
  if(length>MAX_JSON_BYTES)return null;
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_JSON_BYTES)return null;
  try{return JSON.parse(raw)}catch{return null}
}
function rowPublic(row,{reviewer=false}={}){
  return {
    id:row.id,delivery:row.delivery,vendorName:row.vendor_name,
    sourceUrl:row.source_url||'',sourceRef:row.source_ref||'',
    apiBaseUrl:row.api_base_url||'',documentationUrl:row.documentation_url||'',
    capabilities:JSON.parse(row.capabilities_json||'[]'),
    status:row.status,uploaded:Boolean(row.artifact_sha256),
    artifactSha256:row.artifact_sha256||'',artifactSize:Number(row.artifact_size||0),
    createdAt:row.created_at,updatedAt:row.updated_at,
    ...(reviewer?{actorEmail:row.actor_email,reviewNote:row.review_note||''}:{}),
  };
}
function idempotency(request){
  const key=clean(request.headers.get('idempotency-key'),80);
  return /^[a-z0-9][a-z0-9_-]{11,79}$/i.test(key)?key:null;
}
function isAllowedOrigin(request){
  const origin=request.headers.get('origin');
  return (!origin||origin==='https://ekodi.kr')&&request.headers.get('x-ekodi-intake-request')==='1';
}
async function getRow(env,id){return env.DB.prepare('SELECT * FROM cheonggyepass_vendor_submissions WHERE id=? LIMIT 1').bind(id).first()}
function safeId(id){return /^[a-f0-9-]{36}$/i.test(id)&&id.split('-').length===5;}
function accessRow(access,row){return intakePermission(access,'review')||row.actor_email===access.email;}
async function list(request,env,access){
  const canReview=intakePermission(access,'review');
  const query=canReview
    ?env.DB.prepare('SELECT * FROM cheonggyepass_vendor_submissions ORDER BY created_at DESC LIMIT 50')
    :env.DB.prepare('SELECT * FROM cheonggyepass_vendor_submissions WHERE actor_email=? ORDER BY created_at DESC LIMIT 50').bind(access.email);
  const rows=await query.all();
  return json({ok:true,programId:'cheonggye-pass',financialExecutionEnabled:false,
    uploadEnabled:Boolean(env.PASS_VENDOR_QUARANTINE),canReview,
    items:(rows.results||[]).map(row=>rowPublic(row,{reviewer:canReview}))});
}
async function submit(request,env,access){
  if(!intakePermission(access,'submit'))return error('INTAKE_FORBIDDEN','접수 권한이 없습니다.',403);
  if(!isAllowedOrigin(request))return error('INTAKE_ORIGIN_FORBIDDEN','허용되지 않은 요청 출처입니다.',403);
  const key=idempotency(request);
  if(!key)return error('IDEMPOTENCY_KEY_REQUIRED','접수 고유번호가 필요합니다.');
  const body=await bodyJson(request);
  const validation=validateVendorSubmission(body);
  if(!validation.ok)return error(validation.code,'납품 유형과 공개 문서 주소를 확인하세요.');
  const v=validation.value,now=new Date().toISOString(),id=crypto.randomUUID();
  const row=[id,key,v.delivery,v.vendorName,access.email,v.sourceUrl,v.sourceRef,v.apiBaseUrl,v.documentationUrl,
    JSON.stringify(v.capabilities),'submitted',now,now];
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO cheonggyepass_vendor_submissions (id,submission_key,delivery,vendor_name,actor_email,source_url,source_ref,api_base_url,documentation_url,capabilities_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...row),
    env.DB.prepare("INSERT INTO cheonggyepass_vendor_events (id,submission_id,actor_email,event_type,created_at) SELECT ?,id,?,'submitted',? FROM cheonggyepass_vendor_submissions WHERE actor_email=? AND submission_key=? AND id=?").bind(crypto.randomUUID(),access.email,now,access.email,key,id),
  ]);
  const found=await env.DB.prepare('SELECT * FROM cheonggyepass_vendor_submissions WHERE actor_email=? AND submission_key=? LIMIT 1').bind(access.email,key).first();
  if(!found)return error('INTAKE_WRITE_FAILED','접수 결과를 확인하지 못했습니다.',503);
  if(found.delivery!==v.delivery||found.vendor_name!==v.vendorName||found.source_url!==v.sourceUrl||found.source_ref!==v.sourceRef||found.api_base_url!==v.apiBaseUrl||found.documentation_url!==v.documentationUrl||found.capabilities_json!==JSON.stringify(v.capabilities)){
    return error('IDEMPOTENCY_CONFLICT','이미 다른 내용으로 사용된 접수 고유번호입니다.',409);
  }
  return json({ok:true,reused:found.id!==id,item:rowPublic(found),next:found.delivery==='zip'?'upload_zip':'review'},found.id===id?201:200);
}
async function upload(request,env,access,id){
  if(!intakePermission(access,'submit'))return error('INTAKE_FORBIDDEN','업로드 권한이 없습니다.',403);
  if(!isAllowedOrigin(request))return error('INTAKE_ORIGIN_FORBIDDEN','허용되지 않은 요청 출처입니다.',403);
  if(!env.PASS_VENDOR_QUARANTINE)return error('INTAKE_QUARANTINE_UNAVAILABLE','격리 저장소가 아직 연결되지 않았습니다.',503);
  const row=await getRow(env,id);
  if(!row)return error('INTAKE_NOT_FOUND','접수를 찾을 수 없습니다.',404);
  if(row.actor_email!==access.email||row.delivery!=='zip'||row.status!=='submitted'||row.artifact_sha256)
    return error('INTAKE_UPLOAD_NOT_ALLOWED','이 접수에는 ZIP 업로드가 허용되지 않습니다.',403);
  const declared=Number(request.headers.get('content-length')||0);
  if(declared>MAX_ZIP_BYTES)return error('INTAKE_TOO_LARGE','ZIP 용량은 8MB 이하여야 합니다.',413);
  const type=String(request.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if(!['application/zip','application/octet-stream'].includes(type))
    return error('INTAKE_ZIP_TYPE_REQUIRED','ZIP 파일만 업로드할 수 있습니다.',415);
  const data=await request.arrayBuffer();
  if(data.byteLength<22||data.byteLength>MAX_ZIP_BYTES)return error('INTAKE_ZIP_SIZE_INVALID','ZIP 파일 크기가 올바르지 않습니다.',413);
  const bytes=new Uint8Array(data);
  if(bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==0x03||bytes[3]!==0x04)
    return error('INTAKE_ZIP_MAGIC_INVALID','정상적인 ZIP 헤더가 없습니다.',415);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const declaredHash=clean(request.headers.get('x-content-sha256'),64).toLowerCase();
  if(declaredHash&&declaredHash!==digest)return error('INTAKE_SHA256_MISMATCH','파일 해시가 일치하지 않습니다.',422);
  const objectKey='quarantine/cheonggyepass/'+id+'/'+crypto.randomUUID()+'.zip';
  await env.PASS_VENDOR_QUARANTINE.put(objectKey,data,{
    httpMetadata:{contentType:'application/octet-stream',contentDisposition:'attachment'},
    customMetadata:{submissionId:id,sha256:digest,trust:'untrusted-never-execute'},
  });
  const now=new Date().toISOString();
  try{
    const update=await env.DB.prepare("UPDATE cheonggyepass_vendor_submissions SET artifact_key=?,artifact_sha256=?,artifact_size=?,status='quarantined',updated_at=? WHERE id=? AND actor_email=? AND status='submitted' AND artifact_sha256 IS NULL")
      .bind(objectKey,digest,data.byteLength,now,id,access.email).run();
    if(Number(update?.meta?.changes||0)!==1){
      await env.PASS_VENDOR_QUARANTINE.delete(objectKey);
      return error('INTAKE_UPLOAD_RACE','이미 업로드가 완료되었습니다.',409);
    }
    await env.DB.prepare("INSERT INTO cheonggyepass_vendor_events (id,submission_id,actor_email,event_type,created_at) VALUES (?,?,?,'quarantined',?)")
      .bind(crypto.randomUUID(),id,access.email,now).run();
  }catch(error){
    // Preserve quarantined object when D1 may have accepted the update; never expose it.
    console.error('Cheonggye Pass quarantine metadata synchronization failed',error);
    return error('INTAKE_QUARANTINE_SYNC_FAILED','격리 파일 저장 상태 확인이 필요합니다.',503);
  }
  return json({ok:true,id,status:'quarantined',sha256:digest,size:data.byteLength,scanStatus:'not_scanned',activation:false},201);
}
async function review(request,env,access,id){
  if(!intakePermission(access,'review'))return error('INTAKE_REVIEW_FORBIDDEN','검토 권한이 없습니다.',403);
  if(!isAllowedOrigin(request))return error('INTAKE_ORIGIN_FORBIDDEN','허용되지 않은 요청 출처입니다.',403);
  const body=await bodyJson(request);
  const state=clean(body?.status,40);
  const note=clean(body?.note,300);
  if(!REVIEW_STATES.has(state)||note.length<5)return error('INTAKE_REVIEW_INVALID','검토 상태와 사유를 입력해야 합니다.');
  const row=await getRow(env,id);
  if(!row)return error('INTAKE_NOT_FOUND','접수를 찾을 수 없습니다.',404);
  if(!['submitted','quarantined','review_pending'].includes(row.status))
    return error('INTAKE_REVIEW_STATE_INVALID','변경할 수 없는 검토 상태입니다.',409);
  // ZIP objects cannot advance to testing without an independent malware / dependency scan.
  // This endpoint does not offer a scan-attestation bypass or any deployment action.
  if(row.delivery==='zip'&&state==='approved_for_testing')
    return error('INTAKE_SCAN_ATTESTATION_REQUIRED','ZIP은 별도 악성코드·의존성 검증 이후 공식 오케스트레이터에서만 테스트 승인이 가능합니다.',409);
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE cheonggyepass_vendor_submissions SET status=?,reviewer_email=?,review_note=?,updated_at=? WHERE id=? AND status=?')
      .bind(state,access.email,note,now,id,row.status),
    env.DB.prepare('INSERT INTO cheonggyepass_vendor_events (id,submission_id,actor_email,event_type,created_at) VALUES (?,?,?,?,?)')
      .bind(crypto.randomUUID(),id,access.email,'review:'+state,now),
  ]);
  return json({ok:true,id,status:state,activation:false});
}
export async function handleCheonggyePassVendorIntake(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith(BASE))return null;
  const match=url.pathname.match(/^\/api\/cheonggyepass\/vendor-intake(?:\/([a-f0-9-]{36})\/(upload|review))?\/?$/i);
  if(!match)return error('INTAKE_ROUTE_NOT_FOUND','등록되지 않은 접수 경로입니다.',404);
  if(!env?.DB)return error('INTAKE_DATABASE_UNAVAILABLE','접수 데이터베이스가 아직 준비되지 않았습니다.',503);
  const access=await resolveRegionalAccess(request,env,'cheonggye-pass');
  if(!access.ok)return error(access.code||'INTAKE_AUTH_REQUIRED','청계패스 접근 권한이 필요합니다.',access.status||403);
  if(!intakePermission(access,'read'))return error('INTAKE_FORBIDDEN','접수 권한이 없습니다.',403);
  try{
    const id=match[1],action=match[2];
    if(id&&!safeId(id))return error('INTAKE_ID_INVALID','접수 고유번호가 올바르지 않습니다.',400);
    if(!id&&request.method==='GET')return list(request,env,access);
    if(!id&&request.method==='POST')return submit(request,env,access);
    if(action==='upload'&&request.method==='POST')return upload(request,env,access,id);
    if(action==='review'&&request.method==='POST')return review(request,env,access,id);
    return error('INTAKE_METHOD_NOT_ALLOWED','허용되지 않은 요청입니다.',405);
  }catch(cause){
    console.error('Cheonggye Pass intake operation failed',cause);
    return error('INTAKE_UNAVAILABLE','접수 저장소 또는 권한 확인에 실패했습니다.',503);
  }
}
