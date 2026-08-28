import authWorker from './auth-worker.js';

const ALLOWED_ORIGINS = new Set([
  'https://tax.ekodi.kr',
  'https://admin.ekodi.kr',
  'https://admin.biz.ekodi.kr',
  'https://admin.church.ekodi.kr',
  'https://admin.lab.ekodi.kr',
  'https://admin.trade.ekodi.kr'
]);
const NTS_STATUS_ENDPOINT = 'https://api.odcloud.kr/api/nts-businessman/v1/status';
const CACHE_TTL_MS = 30 * 60 * 1000;

function corsHeaders(origin='') {
  const headers = new Headers({
    'access-control-allow-headers':'authorization, content-type',
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-max-age':'86400',
    vary:'Origin'
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}
function json(data,status=200,origin='') {
  const headers = corsHeaders(origin);
  headers.set('content-type','application/json; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('x-content-type-options','nosniff');
  return new Response(JSON.stringify(data),{status,headers});
}
function text(value,max=200){return String(value??'').trim().slice(0,max)}
function corpNum(value){const v=String(value??'').replace(/\D/g,'').slice(0,10);return /^\d{10}$/.test(v)?v:''}
function serviceKey(env){return text(env?.NTS_BUSINESS_STATUS_SERVICE_KEY||env?.DATA_GO_KR_SERVICE_KEY||env?.PUBLIC_DATA_SERVICE_KEY,500)}
async function readJson(request){try{return await request.json()}catch{return {}}}
async function sessionCheck(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return {response};
  return {response,session:await response.clone().json()};
}
async function assertOrganization(env,organizationId){
  const row=await env.DB.prepare('SELECT id FROM organizations WHERE id=? AND active=1').bind(organizationId).first();
  if(!row)throw new Error('유효한 조직을 선택해 주세요.');
}
async function adminId(env,email){
  const row=await env.DB.prepare('SELECT id FROM admins WHERE email=?').bind(email).first();
  return row?.id||null;
}
async function audit(env,session,action,resource,detail=''){
  const id=await adminId(env,session.email);
  await env.DB.prepare('INSERT INTO audit_logs (admin_id,action,resource,detail,created_at) VALUES (?,?,?,?,?)')
    .bind(id,action,resource,String(detail).slice(0,500),new Date().toISOString()).run();
}
export function ntsStatusUrl(key){
  const url=new URL(NTS_STATUS_ENDPOINT);
  url.searchParams.set('serviceKey',String(key||''));
  return url.toString();
}
export function normalizeNtsStatus(input={}){
  const bNo=corpNum(input.b_no||input.corpNum);
  const bStt=text(input.b_stt||input.businessStatus,80);
  const bSttCd=text(input.b_stt_cd||input.businessStatusCode,20);
  return {
    corpNum:bNo,
    businessStatus:bStt,
    businessStatusCode:bSttCd,
    taxType:text(input.tax_type||input.taxType,120),
    taxTypeCode:text(input.tax_type_cd||input.taxTypeCode,20),
    endDate:text(input.end_dt||input.endDate,20),
    utccYn:text(input.utcc_yn||input.utccYn,5),
    taxTypeChangeDate:text(input.tax_type_change_dt||input.taxTypeChangeDate,20),
    invoiceApplyDate:text(input.invoice_apply_dt||input.invoiceApplyDate,20),
    previousTaxType:text(input.rbf_tax_type||input.previousTaxType,120),
    active:bSttCd==='01'||/계속/.test(bStt)
  };
}
function cacheRow(row){
  if(!row)return null;
  return {
    corpNum:row.corp_num,
    businessStatus:row.business_status||'',
    businessStatusCode:row.business_status_code||'',
    taxType:row.tax_type||'',
    taxTypeCode:row.tax_type_code||'',
    endDate:row.end_date||'',
    utccYn:row.utcc_yn||'',
    taxTypeChangeDate:row.tax_type_change_date||'',
    invoiceApplyDate:row.invoice_apply_date||'',
    previousTaxType:row.previous_tax_type||'',
    active:row.business_status_code==='01'||/계속/.test(row.business_status||''),
    checkedAt:row.checked_at||'',
    source:'NTS_PUBLIC_DATA'
  };
}
async function cachedStatuses(env,organizationId,corpNums){
  if(!corpNums.length)return new Map();
  const marks=corpNums.map(()=>'?').join(',');
  const rows=await env.DB.prepare(`SELECT * FROM tax_business_registry_status WHERE organization_id=? AND corp_num IN (${marks})`)
    .bind(organizationId,...corpNums).all();
  return new Map((rows.results||[]).map(row=>[row.corp_num,cacheRow(row)]));
}
function isFresh(item,nowMs=Date.now()){
  const t=Date.parse(item?.checkedAt||'');
  return Number.isFinite(t)&&nowMs-t<CACHE_TTL_MS;
}
async function queryNts(corpNums,key){
  const response=await fetch(ntsStatusUrl(key),{
    method:'POST',
    headers:{accept:'application/json','content-type':'application/json'},
    body:JSON.stringify({b_no:corpNums})
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!Array.isArray(body?.data)){
    const code=text(body?.status_code||body?.code||`HTTP_${response.status}`,80);
    throw new Error(`국세청 사업자 상태조회 실패 (${code})`);
  }
  return body.data.map(normalizeNtsStatus).filter(item=>item.corpNum);
}
async function saveStatuses(env,organizationId,items,now){
  if(!items.length)return;
  const statements=items.map(item=>env.DB.prepare(`INSERT INTO tax_business_registry_status
    (organization_id,corp_num,business_status,business_status_code,tax_type,tax_type_code,end_date,utcc_yn,tax_type_change_date,invoice_apply_date,previous_tax_type,source,checked_at,raw_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(organization_id,corp_num) DO UPDATE SET
      business_status=excluded.business_status,business_status_code=excluded.business_status_code,
      tax_type=excluded.tax_type,tax_type_code=excluded.tax_type_code,end_date=excluded.end_date,utcc_yn=excluded.utcc_yn,
      tax_type_change_date=excluded.tax_type_change_date,invoice_apply_date=excluded.invoice_apply_date,
      previous_tax_type=excluded.previous_tax_type,source=excluded.source,checked_at=excluded.checked_at,raw_json=excluded.raw_json`)
    .bind(organizationId,item.corpNum,item.businessStatus,item.businessStatusCode,item.taxType,item.taxTypeCode,item.endDate,item.utccYn,
      item.taxTypeChangeDate,item.invoiceApplyDate,item.previousTaxType,'NTS_PUBLIC_DATA',now,JSON.stringify(item).slice(0,3000)));
  for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
}
async function resolveStatuses(env,organizationId,corpNums,refresh=false){
  const unique=[...new Set(corpNums.map(corpNum).filter(Boolean))].slice(0,100);
  if(!unique.length)return {items:[],configured:Boolean(serviceKey(env)),liveCount:0,cacheCount:0,staleCount:0};
  const nowMs=Date.now(),now=new Date(nowMs).toISOString();
  const cache=await cachedStatuses(env,organizationId,unique);
  const stale=unique.filter(no=>refresh||!isFresh(cache.get(no),nowMs));
  const key=serviceKey(env);
  let liveCount=0,error='';
  if(stale.length&&key){
    try{
      const live=await queryNts(stale,key);
      await saveStatuses(env,organizationId,live,now);
      for(const item of live){cache.set(item.corpNum,{...item,checkedAt:now,source:'NTS_PUBLIC_DATA'});liveCount++}
    }catch(err){error=err?.message||String(err)}
  }
  const items=unique.map(no=>{
    const item=cache.get(no);
    if(item)return {...item,stale:!isFresh(item,nowMs),available:true};
    return {corpNum:no,available:false,stale:true,active:false,source:'NTS_PUBLIC_DATA'};
  });
  return {
    items,
    configured:Boolean(key),
    liveCount,
    cacheCount:items.filter(x=>x.available&&!stale.includes(x.corpNum)).length,
    staleCount:items.filter(x=>x.stale).length,
    error,
    cacheTtlSeconds:CACHE_TTL_MS/1000,
    source:'NTS_PUBLIC_DATA'
  };
}
async function statusRequest(request,env,auth,origin){
  const url=new URL(request.url);
  const body=request.method==='POST'?await readJson(request):{};
  const organizationId=text(body.organizationId||url.searchParams.get('organizationId')||'EKODIBIZ',40);
  await assertOrganization(env,organizationId);
  const refresh=body.refresh===true||url.searchParams.get('refresh')==='1';
  const corpNums=request.method==='POST'
    ? (Array.isArray(body.corpNums)?body.corpNums:[body.corpNum])
    : [url.searchParams.get('corpNum')];
  const normalized=[...new Set(corpNums.map(corpNum).filter(Boolean))];
  if(!normalized.length)return json({error:'사업자등록번호 10자리를 입력해 주세요.'},400,origin);
  if(normalized.length>100)return json({error:'한 번에 최대 100개 사업자까지 조회할 수 있습니다.'},413,origin);
  const result=await resolveStatuses(env,organizationId,normalized,refresh);
  await audit(env,auth.session,'finance.tax_business.status',normalized.join(','),`refresh=${refresh};live=${result.liveCount};cache=${result.cacheCount};configured=${result.configured}`);
  return json({ok:true,organizationId,...result},200,origin);
}
async function health(env,origin){
  const row=await env.DB.prepare('SELECT COUNT(*) AS c, MAX(checked_at) AS latest FROM tax_business_registry_status').first();
  return json({
    ok:true,
    service:'ekodi-tax-business-registry',
    provider:'NTS_PUBLIC_DATA',
    endpoint:'nts-businessman/v1/status',
    configured:Boolean(serviceKey(env)),
    cacheTtlSeconds:CACHE_TTL_MS/1000,
    sourceRefreshMinutes:30,
    maxBatch:100,
    cachedRecords:Number(row?.c)||0,
    lastCheckedAt:row?.latest||'',
    schemaVersion:1
  },200,origin);
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('origin')||'';
    if(origin&&!ALLOWED_ORIGINS.has(origin))return json({error:'허용되지 않은 요청입니다.'},403,origin);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(origin)});
    try{
      if(request.method==='GET'&&url.pathname==='/api/finance/tax-business-status-health')return health(env,origin);
      if((request.method==='GET'||request.method==='POST')&&url.pathname==='/api/finance/tax-business-status'){
        const auth=await sessionCheck(request,env);
        if(!auth.session)return auth.response;
        return statusRequest(request,env,auth,origin);
      }
      return json({error:'지원하지 않는 Tax business registry 경로입니다.'},404,origin);
    }catch(error){
      return json({error:error?.message||String(error),code:'NTS_BUSINESS_STATUS_ERROR'},500,origin);
    }
  }
};
