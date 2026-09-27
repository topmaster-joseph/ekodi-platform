import { resolveWorkspacePrincipal } from './ekodi-principal.js';
import { TENANT_ADMIN_CAPABILITIES, tenantAdminCan } from './tenant-admin-policy.js';

const PREFIX='/api/workspace-records';
const RECORD_TYPES=new Set(['estimate','contract','project','meeting','document','expense','income','other']);
const STATUSES=new Set(['draft','issued','accepted','in_progress','completed','cancelled','archived']);
const DIRECTIONS=new Set(['outgoing','incoming']);

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  }});
}
const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
function id(prefix='wbr'){const b=new Uint8Array(12);crypto.getRandomValues(b);return prefix+'_'+[...b].map(v=>v.toString(16).padStart(2,'0')).join('')}
function isoDay(value){
  const raw=clean(value,20);
  if(!raw)return new Date().toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(Date.parse(raw+'T00:00:00Z')))throw Object.assign(new Error('일자는 YYYY-MM-DD 형식이어야 합니다.'),{status:400,code:'INVALID_RECORD_DATE'});
  return raw;
}
function amount(value){
  const raw=clean(value,40).replaceAll(',','');
  if(!raw)return'';
  if(!/^\d{1,15}(?:\.\d{1,2})?$/.test(raw))throw Object.assign(new Error('금액 형식을 확인해 주세요.'),{status:400,code:'INVALID_AMOUNT'});
  const [whole,decimal='']=raw.split('.');
  const base=String(BigInt(whole));
  return decimal?base+'.'+decimal.replace(/0+$/,''):base;
}
function safeUrl(value){
  const raw=clean(value,1000);if(!raw)return'';
  try{const url=new URL(raw);if(!['http:','https:'].includes(url.protocol))throw new Error();return url.toString()}catch{throw Object.assign(new Error('첨부·링크는 http 또는 https 주소여야 합니다.'),{status:400,code:'INVALID_DOCUMENT_URL'})}
}
function aliasCandidates(slug=''){
  const value=clean(slug,80).toLowerCase();
  if(value==='ekodi-biz'||value==='ekodibiz')return ['ekodi-biz','ekodibiz'];
  if(value==='cgma'||value==='cheonggye')return ['cgma','cheonggye'];
  return value?[value]:[];
}
async function tenantRows(env,slug){
  const candidates=aliasCandidates(slug);if(!candidates.length)return[];
  const placeholders=candidates.map(()=>'?').join(',');
  const result=await env.DB.prepare(`SELECT id,slug,name,status FROM customer_tenants WHERE slug IN (${placeholders}) AND status='active' ORDER BY CASE slug WHEN ? THEN 0 ELSE 1 END,id`)
    .bind(...candidates,candidates[0]).all();
  return result.results||[];
}
async function tenantForSlug(env,slug){
  const rows=await tenantRows(env,slug);return rows[0]||null;
}
async function workspaceScope(request,env){
  const access=await resolveWorkspacePrincipal(request,env,{write:false});
  if(access.error)return{response:json({error:access.error,code:access.error},access.status||403)};
  if(access.subject?.type!=='tenant')return{response:json({error:'운영공간 문맥이 필요합니다.',code:'TENANT_CONTEXT_REQUIRED'},403)};
  if(!tenantAdminCan(access.principal.role,TENANT_ADMIN_CAPABILITIES.reports))return{response:json({error:'내역·이력 관리 권한이 없습니다.',code:'WORKSPACE_RECORDS_FORBIDDEN'},403)};
  const rows=await tenantRows(env,access.subject.key);
  if(!rows.length)return{response:json({error:'운영공간을 찾을 수 없습니다.',code:'TENANT_NOT_FOUND'},404)};
  const exact=rows.find(row=>row.slug===String(access.subject.key).toLowerCase())||rows[0];
  return{scope:{
    workspaceId:String(exact.id),workspaceSlug:exact.slug,workspaceName:exact.name||exact.slug,
    workspaceIds:rows.map(row=>String(row.id)),workspaceSlugs:rows.map(row=>row.slug)
  },actor:access.principal.email||access.principal.id};
}
function placeholders(values){return values.map(()=>'?').join(',')}
function visibilitySql(scope,alias='r'){
  const ids=scope.workspaceIds.length?scope.workspaceIds:[scope.workspaceId];
  return{sql:`(CAST(${alias}.source_workspace_id AS TEXT) IN (${placeholders(ids)}) OR CAST(${alias}.target_workspace_id AS TEXT) IN (${placeholders(ids)}))`,binds:[...ids,...ids]};
}
function serialize(row){
  if(!row)return null;
  return{
    id:row.id,recordKey:row.record_key,recordType:row.record_type,recordDate:row.record_date,
    title:row.title,documentNumber:row.document_number||'',amount:row.amount_decimal||'',currency:row.currency||'KRW',
    vatIncluded:Boolean(row.vat_included),status:row.status,documentUrl:row.document_url||'',memo:row.memo||'',
    sourceWorkspaceId:String(row.source_workspace_id||''),sourceWorkspaceSlug:row.source_workspace_slug||'',sourceWorkspaceName:row.source_workspace_name||'',
    targetWorkspaceId:row.target_workspace_id==null?'':String(row.target_workspace_id),targetWorkspaceSlug:row.target_workspace_slug||'',targetWorkspaceName:row.target_workspace_name||'',
    revision:Number(row.revision||1),createdBy:row.created_by||'',updatedBy:row.updated_by||'',createdAt:row.created_at,updatedAt:row.updated_at
  };
}
async function readBody(request){
  const type=String(request.headers.get('content-type')||'').toLowerCase();
  if(type.includes('application/json'))return request.json().catch(()=>({}));
  if(type.includes('application/x-www-form-urlencoded')||type.includes('multipart/form-data')){
    const form=await request.formData().catch(()=>null);return form?Object.fromEntries(form.entries()):{};
  }
  return{};
}
function normalizeFields(body={},partial=false){
  const out={};
  const field=(name,aliases=[])=>{
    if(Object.prototype.hasOwnProperty.call(body,name))return body[name];
    for(const key of aliases)if(Object.prototype.hasOwnProperty.call(body,key))return body[key];
    return undefined;
  };
  const type=field('recordType',['record_type']);
  if(type!==undefined||!partial){const v=clean(type||'other',30).toLowerCase();if(!RECORD_TYPES.has(v))throw Object.assign(new Error('지원하지 않는 내역 분류입니다.'),{status:400,code:'INVALID_RECORD_TYPE'});out.recordType=v}
  const date=field('recordDate',['record_date']);
  if(date!==undefined||!partial)out.recordDate=isoDay(date);
  const title=field('title');
  if(title!==undefined||!partial){const v=clean(title,240);if(!v)throw Object.assign(new Error('제목이 필요합니다.'),{status:400,code:'TITLE_REQUIRED'});out.title=v}
  const doc=field('documentNumber',['document_number']);
  if(doc!==undefined||!partial)out.documentNumber=clean(doc,120);
  const amountValue=field('amount',['amountDecimal','amount_decimal']);
  if(amountValue!==undefined||!partial)out.amountDecimal=amount(amountValue);
  const currency=field('currency');
  if(currency!==undefined||!partial){const v=clean(currency||'KRW',3).toUpperCase();if(!/^[A-Z]{3}$/.test(v))throw Object.assign(new Error('통화코드를 확인해 주세요.'),{status:400,code:'INVALID_CURRENCY'});out.currency=v}
  const vat=field('vatIncluded',['vat_included']);
  if(vat!==undefined||!partial)out.vatIncluded=vat===true||vat===1||String(vat).toLowerCase()==='true'||String(vat)==='1';
  const status=field('status');
  if(status!==undefined||!partial){const v=clean(status||'draft',30).toLowerCase();if(!STATUSES.has(v))throw Object.assign(new Error('지원하지 않는 상태입니다.'),{status:400,code:'INVALID_STATUS'});out.status=v}
  const url=field('documentUrl',['document_url']);
  if(url!==undefined||!partial)out.documentUrl=safeUrl(url);
  const memo=field('memo');
  if(memo!==undefined||!partial)out.memo=clean(memo,4000);
  return out;
}
async function appendEvent(env,record,eventType,actor,workspaceId,details={}){
  await env.DB.prepare(`INSERT INTO workspace_business_record_events
    (id,record_id,event_type,actor,actor_workspace_id,revision,details_json,snapshot_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(id('wbe'),record.id,eventType,clean(actor,320)||'system',String(workspaceId||''),Number(record.revision||1),JSON.stringify(details),JSON.stringify(serialize(record)),new Date().toISOString()).run();
}
async function recordById(env,idValue){
  return env.DB.prepare('SELECT * FROM workspace_business_records WHERE id=?').bind(clean(idValue,80)).first();
}
function assertVisible(record,scope){
  if(!record)return Object.assign(new Error('내역을 찾을 수 없습니다.'),{status:404,code:'NOT_FOUND'});
  const ids=new Set(scope.workspaceIds.map(String));
  if(!ids.has(String(record.source_workspace_id))&&!ids.has(String(record.target_workspace_id)))return Object.assign(new Error('다른 운영공간의 내역에는 접근할 수 없습니다.'),{status:403,code:'WORKSPACE_FORBIDDEN'});
  return null;
}
async function listRecords(env,scope,url){
  const visible=visibilitySql(scope);
  const where=[visible.sql],binds=[...visible.binds];
  const type=clean(url.searchParams.get('type'),30).toLowerCase();
  if(type){if(!RECORD_TYPES.has(type))throw Object.assign(new Error('type 필터를 확인해 주세요.'),{status:400,code:'INVALID_RECORD_TYPE'});where.push('r.record_type=?');binds.push(type)}
  const status=clean(url.searchParams.get('status'),30).toLowerCase();
  if(status){if(!STATUSES.has(status))throw Object.assign(new Error('status 필터를 확인해 주세요.'),{status:400,code:'INVALID_STATUS'});where.push('r.status=?');binds.push(status)}
  const q=clean(url.searchParams.get('q'),160);
  if(q){where.push('(r.title LIKE ? OR r.document_number LIKE ? OR r.source_workspace_name LIKE ? OR r.target_workspace_name LIKE ? OR r.memo LIKE ?)');for(let i=0;i<5;i++)binds.push('%'+q+'%')}
  const limit=Math.max(1,Math.min(200,Number(url.searchParams.get('limit')||100)||100));binds.push(limit);
  const rows=await env.DB.prepare(`SELECT r.* FROM workspace_business_records r WHERE ${where.join(' AND ')} ORDER BY r.record_date DESC,r.updated_at DESC LIMIT ?`).bind(...binds).all();
  const records=(rows.results||[]).map(serialize);
  return{workspace:{id:scope.workspaceId,slug:scope.workspaceSlug,name:scope.workspaceName},records,summary:{
    total:records.length,estimates:records.filter(x=>x.recordType==='estimate').length,contracts:records.filter(x=>x.recordType==='contract').length,
    active:records.filter(x=>['issued','accepted','in_progress'].includes(x.status)).length,completed:records.filter(x=>x.status==='completed').length
  }};
}
async function createRecord(env,scope,body,actor){
  const fields=normalizeFields(body,false);
  const direction=clean(body.direction||'outgoing',20).toLowerCase();
  if(!DIRECTIONS.has(direction))throw Object.assign(new Error('방향은 outgoing 또는 incoming이어야 합니다.'),{status:400,code:'INVALID_DIRECTION'});
  const counterpartSlug=clean(body.counterpartyWorkspaceSlug||body.counterparty_workspace_slug,80).toLowerCase();
  const counterpart=counterpartSlug?await tenantForSlug(env,counterpartSlug):null;
  const counterpartName=clean(body.counterpartyName||body.counterparty_name,200)||(counterpart?.name||counterpart?.slug||'');
  if(!counterpartName)throw Object.assign(new Error('상대방 이름 또는 연결 운영공간이 필요합니다.'),{status:400,code:'COUNTERPARTY_REQUIRED'});
  const source=direction==='outgoing'?{id:scope.workspaceId,slug:scope.workspaceSlug,name:scope.workspaceName}:{id:counterpart?String(counterpart.id):'',slug:counterpart?.slug||counterpartSlug,name:counterpartName};
  const target=direction==='outgoing'?{id:counterpart?String(counterpart.id):'',slug:counterpart?.slug||counterpartSlug,name:counterpartName}:{id:scope.workspaceId,slug:scope.workspaceSlug,name:scope.workspaceName};
  const now=new Date().toISOString(),recordId=id();
  await env.DB.prepare(`INSERT INTO workspace_business_records
    (id,record_key,source_workspace_id,source_workspace_slug,source_workspace_name,target_workspace_id,target_workspace_slug,target_workspace_name,
     record_type,record_date,title,document_number,amount_decimal,currency,vat_included,status,document_url,memo,revision,created_by,updated_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?)`)
    .bind(recordId,'WBR-'+recordId.slice(4).toUpperCase(),source.id||null,source.slug,source.name,target.id||null,target.slug,target.name,
      fields.recordType,fields.recordDate,fields.title,fields.documentNumber,fields.amountDecimal,fields.currency,fields.vatIncluded?1:0,fields.status,fields.documentUrl,fields.memo,
      clean(actor,320),clean(actor,320),now,now).run();
  const created=await recordById(env,recordId);await appendEvent(env,created,'created',actor,scope.workspaceId,{direction,counterpartyWorkspaceSlug:counterpart?.slug||counterpartSlug});
  return created;
}
async function updateRecord(env,scope,idValue,body,actor){
  const current=await recordById(env,idValue),scopeError=assertVisible(current,scope);if(scopeError)throw scopeError;
  if(current.status==='archived'&&clean(body.status,30).toLowerCase()!=='draft')throw Object.assign(new Error('보관된 내역은 먼저 상태를 작성중으로 되돌려야 수정할 수 있습니다.'),{status:409,code:'ARCHIVED_RECORD'});
  const f=normalizeFields(body,true);
  const next={
    recordType:f.recordType??current.record_type,recordDate:f.recordDate??current.record_date,title:f.title??current.title,
    documentNumber:f.documentNumber??current.document_number,amountDecimal:f.amountDecimal??current.amount_decimal,
    currency:f.currency??current.currency,vatIncluded:f.vatIncluded??Boolean(current.vat_included),status:f.status??current.status,
    documentUrl:f.documentUrl??current.document_url,memo:f.memo??current.memo
  };
  const now=new Date().toISOString(),revision=Number(current.revision||1)+1;
  await env.DB.prepare(`UPDATE workspace_business_records SET
    record_type=?,record_date=?,title=?,document_number=?,amount_decimal=?,currency=?,vat_included=?,status=?,document_url=?,memo=?,
    revision=?,updated_by=?,updated_at=? WHERE id=?`)
    .bind(next.recordType,next.recordDate,next.title,next.documentNumber,next.amountDecimal,next.currency,next.vatIncluded?1:0,next.status,next.documentUrl,next.memo,
      revision,clean(actor,320),now,current.id).run();
  const updated=await recordById(env,current.id);await appendEvent(env,updated,'updated',actor,scope.workspaceId,{before:serialize(current),changed:Object.keys(f)});
  return updated;
}
async function recordDetail(env,scope,idValue){
  const record=await recordById(env,idValue),scopeError=assertVisible(record,scope);if(scopeError)throw scopeError;
  const rows=await env.DB.prepare('SELECT id,event_type,actor,actor_workspace_id,revision,details_json,created_at FROM workspace_business_record_events WHERE record_id=? ORDER BY created_at DESC,id DESC LIMIT 200').bind(record.id).all();
  return{record:serialize(record),events:(rows.results||[]).map(row=>({id:row.id,eventType:row.event_type,actor:row.actor,actorWorkspaceId:String(row.actor_workspace_id||''),revision:Number(row.revision||0),details:JSON.parse(row.details_json||'{}'),createdAt:row.created_at}))};
}
function errorJson(error){return json({error:error?.message||'내역·이력 처리 중 오류가 발생했습니다.',code:error?.code||'WORKSPACE_RECORDS_ERROR'},Number(error?.status)||500)}

export async function handleWorkspaceBusinessRecords(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(!(path===PREFIX||path.startsWith(PREFIX+'/')))return null;
  if(!env.DB)return json({error:'데이터베이스 연결이 필요합니다.',code:'DB_UNAVAILABLE'},503);
  try{
    const auth=await workspaceScope(request,env);if(auth.response)return auth.response;
    if(path===PREFIX&&request.method==='GET')return json(await listRecords(env,auth.scope,url));
    if(path===PREFIX&&request.method==='POST'){const record=await createRecord(env,auth.scope,await readBody(request),auth.actor);return json({record:serialize(record)},201)}
    const match=path.match(/^\/api\/workspace-records\/([^/]+)$/);if(!match)return json({error:'Not found'},404);
    const recordId=decodeURIComponent(match[1]);
    if(request.method==='GET')return json(await recordDetail(env,auth.scope,recordId));
    if(request.method==='PUT'){const record=await updateRecord(env,auth.scope,recordId,await readBody(request),auth.actor);return json({record:serialize(record)})}
    return json({error:'Method not allowed'},405);
  }catch(error){return errorJson(error)}
}
