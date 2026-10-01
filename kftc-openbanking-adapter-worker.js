const SECURITY_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer'
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:SECURITY_HEADERS});
const enabled=v=>String(v||'').toLowerCase()==='true';
const hasBinding=v=>Boolean(v&&typeof v.fetch==='function');
const digits=(v,n)=>new RegExp('^\\d{'+n+'}$').test(String(v||''));
const safeConnectionId=v=>/^[A-Za-z0-9._:-]{1,128}$/.test(String(v||''));
const safeTrace=v=>/^[A-Za-z0-9]{1,20}$/.test(String(v||''));

function kstTranDateTime(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(now);
  const pick=t=>parts.find(p=>p.type===t)?.value||'';
  return pick('year')+pick('month')+pick('day')+pick('hour')+pick('minute')+pick('second');
}
function randomUpper(length){
  const bytes=new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return [...bytes].map(b=>alphabet[b%alphabet.length]).join('');
}
function bankTranId(env){
  const prefix=String(env.KFTC_BANK_TRAN_ID_PREFIX||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{9}$/.test(prefix))return null;
  return prefix+randomUpper(11);
}
function readiness(env){
  const contractApproved=enabled(env.KFTC_CONTRACT_APPROVED);
  const liveReadEnabled=enabled(env.KFTC_LIVE_READ_ENABLED);
  const clientConfigured=Boolean(String(env.KFTC_CLIENT_ID||'').trim());
  const bankTranPrefixConfigured=/^[A-Z0-9]{9}$/.test(String(env.KFTC_BANK_TRAN_ID_PREFIX||'').trim().toUpperCase());
  const tokenStoreConnected=hasBinding(env.TOKEN_STORE);
  return {
    service:'ekodi-kftc-openbanking-adapter',
    mode:'read-only',
    contractApproved,
    liveReadEnabled,
    clientConfigured,
    bankTranPrefixConfigured,
    tokenStoreConnected,
    ready:contractApproved&&liveReadEnabled&&clientConfigured&&bankTranPrefixConfigured&&tokenStoreConnected,
    balanceInquiry:true,
    transactionHistory:true,
    transferExecution:false
  };
}
async function body(request){try{return await request.json()}catch{return null}}
async function resolveConnection(env,connectionId){
  if(!hasBinding(env.TOKEN_STORE))return {ok:false,status:503,error:'token_store_unavailable'};
  const response=await env.TOKEN_STORE.fetch(new Request('https://kftc-token-store.internal/v1/resolve',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connectionId})
  }));
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,status:response.status===404?404:503,error:response.status===404?'connection_not_found':'token_store_unavailable'};
  const accessToken=String(data.accessToken||'');
  const fintechUseNum=String(data.fintechUseNum||'');
  if(!accessToken||!/^\d{24}$/.test(fintechUseNum))return {ok:false,status:503,error:'connection_material_incomplete'};
  return {ok:true,accessToken,fintechUseNum};
}
async function kftcGet(url,accessToken){
  const response=await fetch(url,{method:'GET',headers:{authorization:'Bearer '+accessToken,accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,status:502,error:'kftc_http_error'};
  if(String(data.rsp_code||'')!=='A0000')return {ok:false,status:502,error:'kftc_api_error',rspCode:String(data.rsp_code||'')};
  return {ok:true,data};
}
function sanitizeBalance(data){
  return {
    bankName:String(data.bank_name||''),
    savingsBankName:String(data.savings_bank_name||''),
    balanceAmount:String(data.balance_amt||''),
    availableAmount:String(data.available_amt||''),
    currency:String(data.currency||'KRW'),
    bankTranDate:String(data.bank_tran_date||'')
  };
}
function sanitizeTransactions(data){
  const rows=Array.isArray(data.res_list)?data.res_list:[];
  return {
    balanceAmount:String(data.balance_amt||''),
    pageRecordCount:Number(data.page_record_cnt||rows.length||0),
    nextPage:Boolean(String(data.next_page_yn||'').toUpperCase()==='Y'),
    nextTraceInfo:String(data.befor_inquiry_trace_info||data.next_page_trace_info||''),
    transactions:rows.slice(0,25).map(row=>({
      date:String(row.tran_date||''),
      time:String(row.tran_time||''),
      type:String(row.inout_type||row.tran_type||''),
      amount:String(row.tran_amt||''),
      balanceAfter:String(row.after_balance_amt||''),
      printedContent:String(row.print_content||''),
      branchName:String(row.branch_name||'')
    }))
  };
}
async function handleBalance(request,env){
  const state=readiness(env); if(!state.ready)return json({...state,error:'adapter_not_ready'},503);
  const payload=await body(request); const connectionId=String(payload?.connectionId||'');
  if(!safeConnectionId(connectionId))return json({error:'invalid_connection_id'},400);
  const material=await resolveConnection(env,connectionId); if(!material.ok)return json({error:material.error},material.status);
  const id=bankTranId(env); if(!id)return json({error:'bank_tran_prefix_not_configured'},503);
  const url=new URL('https://openapi.openbanking.or.kr/v2.0/account/balance/fin_num');
  url.searchParams.set('bank_tran_id',id); url.searchParams.set('fintech_use_num',material.fintechUseNum); url.searchParams.set('tran_dtime',kstTranDateTime());
  const result=await kftcGet(url,material.accessToken); if(!result.ok)return json({error:result.error,rspCode:result.rspCode||undefined},result.status);
  return json({ok:true,service:state.service,connectionId,data:sanitizeBalance(result.data)});
}
async function handleTransactions(request,env){
  const state=readiness(env); if(!state.ready)return json({...state,error:'adapter_not_ready'},503);
  const payload=await body(request); const connectionId=String(payload?.connectionId||'');
  if(!safeConnectionId(connectionId))return json({error:'invalid_connection_id'},400);
  const fromDate=String(payload?.fromDate||''),toDate=String(payload?.toDate||''),fromTime=String(payload?.fromTime||'000000'),toTime=String(payload?.toTime||'235959');
  if(!digits(fromDate,8)||!digits(toDate,8)||!digits(fromTime,6)||!digits(toTime,6))return json({error:'invalid_date_range'},400);
  const trace=String(payload?.traceInfo||''); if(trace&&!safeTrace(trace))return json({error:'invalid_trace_info'},400);
  const material=await resolveConnection(env,connectionId); if(!material.ok)return json({error:material.error},material.status);
  const id=bankTranId(env); if(!id)return json({error:'bank_tran_prefix_not_configured'},503);
  const url=new URL('https://openapi.openbanking.or.kr/v2.0/account/transaction_list/fin_num');
  for(const [k,v] of Object.entries({bank_tran_id:id,fintech_use_num:material.fintechUseNum,inquiry_type:'A',inquiry_base:'D',from_date:fromDate,from_time:fromTime,to_date:toDate,to_time:toTime,sort_order:'D',tran_dtime:kstTranDateTime()}))url.searchParams.set(k,v);
  if(trace)url.searchParams.set('befor_inquiry_trace_info',trace);
  const result=await kftcGet(url,material.accessToken); if(!result.ok)return json({error:result.error,rspCode:result.rspCode||undefined},result.status);
  return json({ok:true,service:state.service,connectionId,data:sanitizeTransactions(result.data)});
}
export default{async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return json(readiness(env));
  if(url.pathname==='/v1/balance'&&request.method==='POST')return handleBalance(request,env);
  if(url.pathname==='/v1/transactions'&&request.method==='POST')return handleTransactions(request,env);
  if(url.pathname.startsWith('/v1/transfer'))return json({error:'transfer_execution_not_supported'},405);
  return json({error:'not_found'},404);
}};
