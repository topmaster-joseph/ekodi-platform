import { resolveWorkspacePrincipal } from './ekodi-principal.js';
import { TENANT_ADMIN_CAPABILITIES, tenantAdminCan } from './tenant-admin-policy.js';

const WORKSPACE_PREFIX='/api/confirmations';
const ADMIN_PREFIX='/api/control/confirmations';
const KINDS=new Set(['payment','receipt']);
const STATUSES=new Set(['draft','confirmation_pending','confirmed','issued','cancelled']);
const VALUE_TYPES=new Set(['money','goods','service','support','other']);
const METHODS=new Set(['bank_transfer','cash','card','goods','service','other']);
const encoder=new TextEncoder();

function json(data,status=200,extra={}) {
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
}
function html(body,status=200) {
  return new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'}});
}
function clean(value,max=240){return String(value??'').trim().slice(0,max)}
function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function randomHex(bytes=16){const b=new Uint8Array(bytes);crypto.getRandomValues(b);return [...b].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',encoder.encode(String(value??'')));return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')}
function dayStamp(value=new Date()){return value.toISOString().slice(0,10).replaceAll('-','')}
function recordId(){return 'cfm_'+randomHex(12)}
function transactionId(){return `TXN-${dayStamp()}-${randomHex(5).toUpperCase()}`}
function documentNumber(kind){return `${kind==='payment'?'PAY':'RCV'}-${dayStamp()}-${randomHex(5).toUpperCase()}`}
function eventActor(value){return clean(value,240)||'system'}
function canonicalPublicUrl(path){return `https://ekodi.kr${path}`}

function normalizeAmount(value){
  const raw=clean(value,40).replaceAll(',','');
  if(!raw)return'';
  if(!/^\d{1,15}(?:\.\d{1,2})?$/.test(raw))throw Object.assign(new Error('금액 형식을 확인해 주세요.'),{status:400,code:'INVALID_AMOUNT'});
  const [whole,decimal='']=raw.split('.');
  const normalizedWhole=String(BigInt(whole));
  return decimal?`${normalizedWhole}.${decimal.replace(/0+$/,'')||'0'}`:normalizedWhole;
}
function normalizeOccurredAt(value){
  const raw=clean(value,40);
  if(!raw)return new Date().toISOString();
  const parsed=Date.parse(raw);
  if(!Number.isFinite(parsed))throw Object.assign(new Error('지급·수령 일시 형식을 확인해 주세요.'),{status:400,code:'INVALID_OCCURRED_AT'});
  return new Date(parsed).toISOString();
}
function normalizeCreateInput(body={}){
  const kind=clean(body.kind,20).toLowerCase();
  if(!KINDS.has(kind))throw Object.assign(new Error('구분은 payment 또는 receipt여야 합니다.'),{status:400,code:'INVALID_KIND'});
  const valueType=clean(body.valueType||body.value_type||'money',30).toLowerCase();
  if(!VALUE_TYPES.has(valueType))throw Object.assign(new Error('지원하지 않는 지급·수령 유형입니다.'),{status:400,code:'INVALID_VALUE_TYPE'});
  const method=clean(body.method||'other',40).toLowerCase();
  if(!METHODS.has(method))throw Object.assign(new Error('지원하지 않는 지급 방식입니다.'),{status:400,code:'INVALID_METHOD'});
  const amountDecimal=normalizeAmount(body.amount??body.amountDecimal??body.amount_decimal);
  const currency=clean(body.currency||'KRW',3).toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency))throw Object.assign(new Error('통화코드를 확인해 주세요.'),{status:400,code:'INVALID_CURRENCY'});
  const valueDescription=clean(body.valueDescription??body.value_description,500);
  if(valueType==='money'&&!amountDecimal)throw Object.assign(new Error('금전 지급·수령에는 금액이 필요합니다.'),{status:400,code:'AMOUNT_REQUIRED'});
  if(valueType!=='money'&&!amountDecimal&&!valueDescription)throw Object.assign(new Error('금액 또는 물품·서비스 설명을 입력해 주세요.'),{status:400,code:'VALUE_REQUIRED'});
  const payerName=clean(body.payerName??body.payer_name,160);
  const recipientName=clean(body.recipientName??body.recipient_name,160);
  if(!payerName||!recipientName)throw Object.assign(new Error('지급자와 수령자 이름이 필요합니다.'),{status:400,code:'PARTIES_REQUIRED'});
  const purpose=clean(body.purpose,500);
  if(!purpose)throw Object.assign(new Error('지급·수령 목적이 필요합니다.'),{status:400,code:'PURPOSE_REQUIRED'});
  let txn=clean(body.transactionId??body.transaction_id,80).toUpperCase();
  if(txn&&!/^[A-Z0-9._:-]{4,80}$/.test(txn))throw Object.assign(new Error('거래번호 형식을 확인해 주세요.'),{status:400,code:'INVALID_TRANSACTION_ID'});
  if(!txn)txn=transactionId();
  return {kind,transactionId:txn,valueType,amountDecimal,currency,valueDescription,payerName,recipientName,purpose,method,occurredAt:normalizeOccurredAt(body.occurredAt??body.occurred_at),note:clean(body.note,1000)};
}
function serialize(row){
  if(!row)return null;
  const publicId=row.public_id||'';
  return {
    id:row.id,workspaceId:String(row.workspace_id),workspaceSlug:row.workspace_slug,workspaceName:row.workspace_name||'',
    kind:row.kind,transactionId:row.transaction_id,documentNumber:row.document_number,status:row.status,
    valueType:row.value_type,amount:row.amount_decimal||'',currency:row.currency,valueDescription:row.value_description||'',
    payerName:row.payer_name,recipientName:row.recipient_name,purpose:row.purpose,method:row.method,occurredAt:row.occurred_at,
    confirmedAt:row.confirmed_at||'',confirmedByName:row.confirmed_by_name||'',issuedAt:row.issued_at||'',cancelledAt:row.cancelled_at||'',
    publicId,verificationUrl:publicId?canonicalPublicUrl(`/api/confirmations/verify/${publicId}`):'',
    documentUrl:publicId?canonicalPublicUrl(`/api/confirmations/document/${publicId}`):'',
    documentHash:row.document_hash||'',createdAt:row.created_at,updatedAt:row.updated_at,
  };
}
async function readBody(request){
  const type=String(request.headers.get('content-type')||'').toLowerCase();
  if(type.includes('application/json'))return request.json().catch(()=>({}));
  if(type.includes('application/x-www-form-urlencoded')||type.includes('multipart/form-data')){
    const form=await request.formData().catch(()=>null);return form?Object.fromEntries(form.entries()):{};
  }
  return {};
}
async function appendEvent(env,record,eventType,actor,details={}){
  await env.DB.prepare(`INSERT INTO confirmation_events (confirmation_id,workspace_id,event_type,actor,details_json,created_at) VALUES(?,?,?,?,?,?)`)
    .bind(record.id,String(record.workspace_id),eventType,eventActor(actor),JSON.stringify(details),new Date().toISOString()).run();
}
async function workspaceBySlug(env,slug){return env.DB.prepare('SELECT id,slug,name,status FROM customer_tenants WHERE slug=?').bind(clean(slug,80).toLowerCase()).first()}
async function recordById(env,id){
  return env.DB.prepare(`SELECT r.*,t.name AS workspace_name FROM confirmation_records r LEFT JOIN customer_tenants t ON CAST(t.id AS TEXT)=CAST(r.workspace_id AS TEXT) WHERE r.id=?`).bind(clean(id,80)).first();
}
async function recordByPublicId(env,publicId){
  return env.DB.prepare(`SELECT r.*,t.name AS workspace_name FROM confirmation_records r LEFT JOIN customer_tenants t ON CAST(t.id AS TEXT)=CAST(r.workspace_id AS TEXT) WHERE r.public_id=?`).bind(clean(publicId,80)).first();
}
function ensureScope(record,scope){
  if(!record)return Object.assign(new Error('확인서를 찾을 수 없습니다.'),{status:404,code:'NOT_FOUND'});
  if(scope.workspaceId!==null&&String(record.workspace_id)!==String(scope.workspaceId))return Object.assign(new Error('다른 운영공간의 확인서에는 접근할 수 없습니다.'),{status:403,code:'WORKSPACE_FORBIDDEN'});
  return null;
}
async function createRecord(env,scope,input,actor){
  const now=new Date().toISOString();
  const id=recordId(),doc=documentNumber(input.kind);
  await env.DB.prepare(`INSERT INTO confirmation_records
    (id,workspace_id,workspace_slug,kind,transaction_id,document_number,status,value_type,amount_decimal,currency,value_description,payer_name,recipient_name,purpose,method,occurred_at,confirmed_at,confirmed_by_name,public_id,document_hash,issued_at,issued_by,cancelled_at,cancelled_by,created_by,created_at,updated_at,note)
    VALUES(?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,NULL,'',NULL,'',NULL,'',NULL,'',?,?,?,?)`)
    .bind(id,String(scope.workspaceId),scope.workspaceSlug,input.kind,input.transactionId,doc,input.valueType,input.amountDecimal,input.currency,input.valueDescription,input.payerName,input.recipientName,input.purpose,input.method,input.occurredAt,eventActor(actor),now,now,input.note).run();
  const created=await recordById(env,id);await appendEvent(env,created,'created',actor,{kind:input.kind,transactionId:input.transactionId});return created;
}
async function listRecords(env,scope,url){
  const where=[];const binds=[];
  if(scope.workspaceId!==null){where.push('CAST(r.workspace_id AS TEXT)=?');binds.push(String(scope.workspaceId))}
  const workspace=clean(url.searchParams.get('workspace'),80).toLowerCase();
  if(scope.workspaceId===null&&workspace){where.push('r.workspace_slug=?');binds.push(workspace)}
  const kind=clean(url.searchParams.get('kind'),20).toLowerCase();
  if(kind){if(!KINDS.has(kind))throw Object.assign(new Error('kind 필터를 확인해 주세요.'),{status:400});where.push('r.kind=?');binds.push(kind)}
  const status=clean(url.searchParams.get('status'),30).toLowerCase();
  if(status){if(!STATUSES.has(status))throw Object.assign(new Error('status 필터를 확인해 주세요.'),{status:400});where.push('r.status=?');binds.push(status)}
  const q=clean(url.searchParams.get('q'),120);
  if(q){where.push('(r.document_number LIKE ? OR r.transaction_id LIKE ? OR r.payer_name LIKE ? OR r.recipient_name LIKE ? OR r.purpose LIKE ?)');for(let i=0;i<5;i++)binds.push(`%${q}%`)}
  const limit=Math.max(1,Math.min(200,Number(url.searchParams.get('limit')||100)||100));binds.push(limit);
  const sql=`SELECT r.*,t.name AS workspace_name FROM confirmation_records r LEFT JOIN customer_tenants t ON CAST(t.id AS TEXT)=CAST(r.workspace_id AS TEXT) ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY r.created_at DESC LIMIT ?`;
  const rows=await env.DB.prepare(sql).bind(...binds).all();const records=(rows.results||[]).map(serialize);
  return {records,summary:{total:records.length,payment:records.filter(x=>x.kind==='payment').length,receipt:records.filter(x=>x.kind==='receipt').length,pending:records.filter(x=>x.status==='confirmation_pending').length,issued:records.filter(x=>x.status==='issued').length}};
}
async function requestReceiptConfirmation(env,scope,id,actor){
  const record=await recordById(env,id);const scopeError=ensureScope(record,scope);if(scopeError)throw scopeError;
  if(record.kind!=='receipt')throw Object.assign(new Error('수령확인서만 수령자 확인 요청을 보낼 수 있습니다.'),{status:409,code:'RECEIPT_ONLY'});
  if(['issued','cancelled'].includes(record.status))throw Object.assign(new Error('이미 발급되었거나 취소된 문서입니다.'),{status:409,code:'INVALID_STATE'});
  if(record.status==='confirmed')throw Object.assign(new Error('이미 수령 확인이 완료되었습니다.'),{status:409,code:'ALREADY_CONFIRMED'});
  const token=randomHex(24),tokenHash=await sha256(token),expiresAt=new Date(Date.now()+7*86400000).toISOString(),now=new Date().toISOString();
  await env.DB.prepare(`UPDATE confirmation_records SET status='confirmation_pending',acceptance_token_hash=?,acceptance_expires_at=?,updated_at=? WHERE id=?`).bind(tokenHash,expiresAt,now,record.id).run();
  const updated=await recordById(env,record.id);await appendEvent(env,updated,'confirmation_requested',actor,{expiresAt});
  return {record:serialize(updated),acceptanceUrl:canonicalPublicUrl(`/api/confirmations/accept/${token}`),expiresAt};
}
function canonicalDocumentPayload(record){
  return {schemaVersion:1,workspaceId:String(record.workspace_id),workspaceSlug:record.workspace_slug,kind:record.kind,transactionId:record.transaction_id,documentNumber:record.document_number,valueType:record.value_type,amount:record.amount_decimal||'',currency:record.currency,valueDescription:record.value_description||'',payerName:record.payer_name,recipientName:record.recipient_name,purpose:record.purpose,method:record.method,occurredAt:record.occurred_at,confirmedAt:record.confirmed_at||'',confirmedByName:record.confirmed_by_name||''};
}
async function issueRecord(env,scope,id,actor){
  const record=await recordById(env,id);const scopeError=ensureScope(record,scope);if(scopeError)throw scopeError;
  if(record.status==='cancelled')throw Object.assign(new Error('취소된 문서는 발급할 수 없습니다.'),{status:409,code:'CANCELLED'});
  if(record.status==='issued')return record;
  if(record.kind==='receipt'&&record.status!=='confirmed')throw Object.assign(new Error('수령확인서는 수령자 확인 완료 후 발급할 수 있습니다.'),{status:409,code:'RECEIPT_CONFIRMATION_REQUIRED'});
  if(record.kind==='payment'&&record.status!=='draft')throw Object.assign(new Error('지급확인서 상태를 확인해 주세요.'),{status:409,code:'INVALID_STATE'});
  const now=new Date().toISOString(),publicId=randomHex(16),hash=await sha256(JSON.stringify(canonicalDocumentPayload(record)));
  await env.DB.prepare(`UPDATE confirmation_records SET status='issued',public_id=?,document_hash=?,issued_at=?,issued_by=?,updated_at=? WHERE id=?`).bind(publicId,hash,now,eventActor(actor),now,record.id).run();
  const updated=await recordById(env,record.id);await appendEvent(env,updated,'issued',actor,{publicId,documentHash:hash});return updated;
}
async function cancelRecord(env,scope,id,actor,reason=''){
  const record=await recordById(env,id);const scopeError=ensureScope(record,scope);if(scopeError)throw scopeError;if(record.status==='cancelled')return record;
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE confirmation_records SET status='cancelled',cancelled_at=?,cancelled_by=?,acceptance_token_hash=NULL,acceptance_expires_at=NULL,updated_at=? WHERE id=?`).bind(now,eventActor(actor),now,record.id).run();
  const updated=await recordById(env,record.id);await appendEvent(env,updated,'cancelled',actor,{reason:clean(reason,500)});return updated;
}
async function createCounterpart(env,scope,id,actor){
  const source=await recordById(env,id);const scopeError=ensureScope(source,scope);if(scopeError)throw scopeError;if(source.status==='cancelled')throw Object.assign(new Error('취소된 문서에서는 연결 문서를 만들 수 없습니다.'),{status:409,code:'CANCELLED'});
  const targetKind=source.kind==='payment'?'receipt':'payment';
  const existing=await env.DB.prepare(`SELECT id FROM confirmation_records WHERE workspace_id=? AND transaction_id=? AND kind=? AND status!='cancelled' LIMIT 1`).bind(String(source.workspace_id),source.transaction_id,targetKind).first();
  if(existing){const row=await recordById(env,existing.id);return {record:row,existing:true}}
  const input={kind:targetKind,transactionId:source.transaction_id,valueType:source.value_type,amountDecimal:source.amount_decimal||'',currency:source.currency,valueDescription:source.value_description||'',payerName:source.payer_name,recipientName:source.recipient_name,purpose:source.purpose,method:source.method,occurredAt:source.occurred_at,note:`연결 문서: ${source.document_number}`};
  const created=await createRecord(env,scope,input,actor);await appendEvent(env,created,'counterpart_created',actor,{sourceId:source.id,sourceDocumentNumber:source.document_number});return {record:created,existing:false};
}
function escapeRegExp(value){return value.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}
async function handleScoped(request,env,scope,actor,prefix){
  const url=new URL(request.url),path=url.pathname;
  if(path===prefix&&request.method==='GET')return json(await listRecords(env,scope,url));
  if(path===prefix&&request.method==='POST'){const input=normalizeCreateInput(await readBody(request));const record=await createRecord(env,scope,input,actor);return json({record:serialize(record)},201)}
  const match=path.match(new RegExp('^'+escapeRegExp(prefix)+'/([^/]+)(?:/(request|issue|cancel|counterpart))?$'));if(!match)return null;
  const id=decodeURIComponent(match[1]),action=match[2]||'';
  if(!action&&request.method==='GET'){const record=await recordById(env,id);const scopeError=ensureScope(record,scope);if(scopeError)throw scopeError;const events=await env.DB.prepare('SELECT event_type,actor,details_json,created_at FROM confirmation_events WHERE confirmation_id=? ORDER BY id DESC LIMIT 100').bind(record.id).all();return json({record:serialize(record),events:events.results||[]})}
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(action==='request')return json(await requestReceiptConfirmation(env,scope,id,actor));
  if(action==='issue'){const record=await issueRecord(env,scope,id,actor);return json({record:serialize(record)})}
  if(action==='cancel'){const body=await readBody(request);const record=await cancelRecord(env,scope,id,actor,body.reason);return json({record:serialize(record)})}
  if(action==='counterpart'){const result=await createCounterpart(env,scope,id,actor);return json({record:serialize(result.record),existing:result.existing},result.existing?200:201)}
  return null;
}
async function workspaceScope(request,env){
  const access=await resolveWorkspacePrincipal(request,env,{write:false});
  if(access.error)return {response:json({error:access.error},access.status||403)};
  if(access.subject?.type!=='tenant')return {response:json({error:'운영공간 문맥이 필요합니다.',code:'TENANT_CONTEXT_REQUIRED'},403)};
  if(!tenantAdminCan(access.principal.role,TENANT_ADMIN_CAPABILITIES.confirmations))return {response:json({error:'지급·수령 확인 관리 권한이 없습니다.',code:'CONFIRMATION_FORBIDDEN'},403)};
  const tenant=await workspaceBySlug(env,access.subject.key);if(!tenant||tenant.status!=='active')return {response:json({error:'운영공간을 찾을 수 없습니다.',code:'TENANT_NOT_FOUND'},404)};
  return {scope:{workspaceId:String(tenant.id),workspaceSlug:tenant.slug},actor:access.principal.email||access.principal.id};
}
function adminScope(session){if(String(session?.role||'')!=='super_admin')return null;return {workspaceId:null,workspaceSlug:''}}
function errorJson(error){return json({error:error?.message||'지급·수령 확인 처리 중 오류가 발생했습니다.',code:error?.code||'CONFIRMATION_ERROR'},Number(error?.status)||500)}

export async function handleWorkspaceConfirmations(request,env){
  const path=new URL(request.url).pathname;
  if(!(path===WORKSPACE_PREFIX||path.startsWith(WORKSPACE_PREFIX+'/')))return null;
  if(path.startsWith(WORKSPACE_PREFIX+'/accept/')||path.startsWith(WORKSPACE_PREFIX+'/verify/')||path.startsWith(WORKSPACE_PREFIX+'/document/'))return null;
  if(!env.DB)return json({error:'데이터베이스 연결이 필요합니다.',code:'DB_UNAVAILABLE'},503);
  try{const auth=await workspaceScope(request,env);if(auth.response)return auth.response;return await handleScoped(request,env,auth.scope,auth.actor,WORKSPACE_PREFIX)||json({error:'Not found'},404)}catch(error){return errorJson(error)}
}

export async function handleAdminConfirmations(request,env,session){
  const path=new URL(request.url).pathname;
  if(!(path===ADMIN_PREFIX||path.startsWith(ADMIN_PREFIX+'/')))return null;
  if(!env.DB)return json({error:'데이터베이스 연결이 필요합니다.',code:'DB_UNAVAILABLE'},503);
  const scope=adminScope(session);if(!scope)return json({error:'최고관리자 권한이 필요합니다.',code:'SUPER_ADMIN_REQUIRED'},403);
  try{
    if(path===ADMIN_PREFIX+'/workspaces'&&request.method==='GET'){const rows=await env.DB.prepare("SELECT id,slug,name,status FROM customer_tenants WHERE status='active' ORDER BY name,slug").all();return json({workspaces:(rows.results||[]).map(row=>({id:String(row.id),slug:row.slug,name:row.name}))})}
    if(path===ADMIN_PREFIX&&request.method==='POST'){const body=await readBody(request),tenant=await workspaceBySlug(env,body.workspaceSlug||body.workspace);if(!tenant||tenant.status!=='active')return json({error:'관리 대상 운영공간을 찾을 수 없습니다.',code:'TENANT_NOT_FOUND'},404);const input=normalizeCreateInput(body),scoped={workspaceId:String(tenant.id),workspaceSlug:tenant.slug};const record=await createRecord(env,scoped,input,session.email||session.role);return json({record:serialize(record)},201)}
    return await handleScoped(request,env,scope,session.email||session.role,ADMIN_PREFIX)||json({error:'Not found'},404);
  }catch(error){return errorJson(error)}
}

async function acceptanceRecord(env,token){const tokenHash=await sha256(token);return env.DB.prepare(`SELECT r.*,t.name AS workspace_name FROM confirmation_records r LEFT JOIN customer_tenants t ON CAST(t.id AS TEXT)=CAST(r.workspace_id AS TEXT) WHERE r.kind='receipt' AND r.acceptance_token_hash=? LIMIT 1`).bind(tokenHash).first()}
function amountText(record){if(record.amount_decimal)return `${record.amount_decimal} ${record.currency}`;return record.value_description||'-'}
function acceptancePage(record,token,message=''){
  const done=record.status==='confirmed'||record.status==='issued';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>수령 확인</title><style>:root{font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:#172033;background:#f5f7fb}body{margin:0;padding:28px}main{max-width:620px;margin:auto;background:#fff;border:1px solid #e4e8ef;border-radius:18px;padding:26px;box-shadow:0 18px 50px #1f293715}h1{margin:0 0 8px;font-size:25px}p{line-height:1.65;color:#5f6b7a}.grid{display:grid;grid-template-columns:120px 1fr;border-top:1px solid #edf0f5;margin:20px 0}.grid div{padding:10px 4px;border-bottom:1px solid #edf0f5}.grid b{color:#667085}input,button{width:100%;box-sizing:border-box;min-height:46px;border-radius:10px;border:1px solid #d9e0ea;padding:10px 12px;font:inherit}button{margin-top:10px;background:#1f3c88;color:#fff;border-color:#1f3c88;font-weight:700}.note{font-size:12px;color:#7c8798}.ok{padding:12px;border-radius:10px;background:#eef8f1;color:#287347}</style></head><body><main><small>EKODI · ${esc(record.workspace_name||record.workspace_slug)}</small><h1>수령 확인</h1><p>아래 내용을 확인한 뒤 실제로 수령한 경우에만 확인해 주세요.</p>${message?`<p class="ok">${esc(message)}</p>`:''}<div class="grid"><div><b>문서번호</b></div><div>${esc(record.document_number)}</div><div><b>지급자</b></div><div>${esc(record.payer_name)}</div><div><b>수령자</b></div><div>${esc(record.recipient_name)}</div><div><b>내용</b></div><div>${esc(amountText(record))}</div><div><b>목적</b></div><div>${esc(record.purpose)}</div><div><b>일자</b></div><div>${esc(record.occurred_at.slice(0,10))}</div></div>${done?'<p class="ok">수령 확인이 완료되었습니다.</p>':`<form method="post" action="/api/confirmations/accept/${encodeURIComponent(token)}"><label>확인자 이름<input name="name" required maxlength="160" value="${esc(record.recipient_name)}"></label><button type="submit">내용을 확인하고 수령 확인</button></form>`}<p class="note">이 확인은 지급·수령 사실 기록을 위한 것입니다. 세금계산서·현금영수증·급여명세서 등 법정 세무증빙을 대체하지 않습니다.</p></main></body></html>`;
}
function documentPage(record){
  const kindLabel=record.kind==='payment'?'지급확인서':'수령확인서',cancelled=record.status==='cancelled';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${kindLabel} ${esc(record.document_number)}</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:"Noto Sans KR",system-ui,sans-serif;color:#111827;margin:0}.sheet{max-width:780px;margin:20px auto;padding:36px;border:1px solid #d8dee8}.top{text-align:center}.top h1{font-size:30px;letter-spacing:.08em;margin:8px 0 24px}.badge{display:inline-block;padding:5px 9px;border:1px solid #cbd5e1;border-radius:999px;font-size:11px}.cancel{color:#a22}.grid{display:grid;grid-template-columns:150px 1fr;border-top:2px solid #1f2937;margin-top:24px}.grid div{padding:12px 10px;border-bottom:1px solid #d8dee8}.grid b{font-size:13px}.statement{margin:28px 0;font-size:16px;line-height:1.9;text-align:center}.sign{margin-top:34px;text-align:right;line-height:1.8}.verify{margin-top:38px;padding-top:16px;border-top:1px solid #d8dee8;font-size:10px;color:#6b7280;word-break:break-all}.no-tax{margin-top:12px;font-size:10px;color:#6b7280}@media print{body{background:#fff}.sheet{border:0;margin:0;padding:0}.toolbar{display:none}}.toolbar{text-align:right;max-width:780px;margin:20px auto 0}.toolbar button{padding:8px 12px}</style></head><body><div class="toolbar"><button onclick="print()">인쇄 · PDF 저장</button></div><main class="sheet"><div class="top"><span class="badge ${cancelled?'cancel':''}">${cancelled?'취소된 문서':'EKODI VERIFIED RECORD'}</span><h1>${kindLabel}</h1><p>${esc(record.workspace_name||record.workspace_slug)}</p></div><div class="grid"><div><b>문서번호</b></div><div>${esc(record.document_number)}</div><div><b>거래번호</b></div><div>${esc(record.transaction_id)}</div><div><b>지급자</b></div><div>${esc(record.payer_name)}</div><div><b>수령자</b></div><div>${esc(record.recipient_name)}</div><div><b>금액·내용</b></div><div>${esc(amountText(record))}${record.value_description&&record.amount_decimal?' · '+esc(record.value_description):''}</div><div><b>방법</b></div><div>${esc(record.method)}</div><div><b>목적</b></div><div>${esc(record.purpose)}</div><div><b>지급·수령일</b></div><div>${esc(record.occurred_at.slice(0,10))}</div>${record.kind==='receipt'?`<div><b>수령 확인</b></div><div>${esc(record.confirmed_by_name||record.recipient_name)} · ${esc((record.confirmed_at||'').replace('T',' ').slice(0,19))}</div>`:''}</div><p class="statement">${record.kind==='payment'?'위와 같이 지급하였음을 확인합니다.':'위와 같이 수령하였음을 확인합니다.'}</p><div class="sign">${esc((record.issued_at||record.created_at).slice(0,10))}<br><strong>${record.kind==='payment'?esc(record.payer_name):esc(record.recipient_name)}</strong></div><div class="verify">검증주소: ${esc(canonicalPublicUrl('/api/confirmations/verify/'+record.public_id))}<br>문서 해시: ${esc(record.document_hash||'')}</div><p class="no-tax">본 문서는 지급·수령 사실 확인을 위한 확인서이며 세금계산서·현금영수증·급여명세서 등 법정 세무증빙을 대체하지 않습니다.</p></main></body></html>`;
}

export async function handleConfirmationPublic(request,env){
  const url=new URL(request.url),path=url.pathname;if(!env.DB)return null;
  const accept=path.match(/^\/api\/confirmations\/accept\/([a-f0-9]{48})$/i);
  if(accept){
    const token=accept[1];
    try{
      const record=await acceptanceRecord(env,token);if(!record)return html('<h1>유효하지 않은 확인 요청입니다.</h1>',404);
      if(record.acceptance_expires_at&&Date.parse(record.acceptance_expires_at)<Date.now()&&record.status==='confirmation_pending')return html('<h1>확인 요청의 유효기간이 지났습니다.</h1>',410);
      if(request.method==='GET')return html(acceptancePage(record,token));
      if(request.method!=='POST')return json({error:'Method not allowed'},405);
      if(record.status!=='confirmation_pending')return html(acceptancePage(record,token,'이미 처리된 요청입니다.'));
      const body=await readBody(request),name=clean(body.name,160);if(!name)return html(acceptancePage(record,token,'확인자 이름을 입력해 주세요.'),400);
      const now=new Date().toISOString();
      await env.DB.prepare(`UPDATE confirmation_records SET status='confirmed',confirmed_at=?,confirmed_by_name=?,acceptance_token_hash=NULL,acceptance_expires_at=NULL,updated_at=? WHERE id=? AND status='confirmation_pending'`).bind(now,name,now,record.id).run();
      const updated=await recordById(env,record.id);await appendEvent(env,updated,'recipient_confirmed','recipient',{confirmedByName:name});return html(acceptancePage(updated,token,'수령 확인이 완료되었습니다.'));
    }catch(error){return errorJson(error)}
  }
  const verify=path.match(/^\/api\/confirmations\/verify\/([a-f0-9]{32})$/i);
  if(verify&&request.method==='GET'){const record=await recordByPublicId(env,verify[1]);if(!record)return json({verified:false,error:'NOT_FOUND'},404);return json({verified:Boolean(record.document_hash),status:record.status,record:serialize(record),legalEvidenceType:'fact-confirmation',taxDocument:false})}
  const document=path.match(/^\/api\/confirmations\/document\/([a-f0-9]{32})$/i);
  if(document&&request.method==='GET'){const record=await recordByPublicId(env,document[1]);if(!record)return html('<h1>문서를 찾을 수 없습니다.</h1>',404);return html(documentPage(record))}
  return null;
}
