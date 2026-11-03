// EKODI Invest: fixed-target, server-only OpenDART public filings reader.
// No provider key in responses, browser state, logs, URLs returned to clients or source control.
// Caller authentication and rate governance belong to the owning Workspace API route.
export const INVEST_DART_SCHEMA='ekodi.invest.opendart-official.v1';
const BASE='https://opendart.fss.or.kr/api/';
const REPORTS=new Set(['11011','11012','11013','11014']);
const MAX_RESPONSE_BYTES=2_000_000;
const MAX_ROWS=600;
const TICKER=/^[0-9]{6}$/;
const CORP=/^[0-9]{8}$/;
const redact=(v,max=160)=>String(v??'').trim().slice(0,max);
const amount=(value)=>{
  if(value==null)return null;
  const s=String(value).trim().replaceAll(',','');
  if(s==='-'||s==='')return null;
  if(/^[-+]?[0-9]{1,25}$/.test(s))return s.replace(/^\+/,'');
  if(/^\([0-9]{1,25}\)$/.test(s))return '-'+s.slice(1,-1);
  return null;
};
export function validateDartRequest(input={},now=Date.now()){
  const corpCode=String(input.corpCode??'');
  if(!CORP.test(corpCode))return {ok:false,error:'INVALID_CORP_CODE'};
  if(input.kind==='company')return {ok:true,kind:'company',corpCode};
  if(input.kind!=='financials')return {ok:false,error:'UNSUPPORTED_QUERY'};
  const year=String(input.year??''),report=String(input.report??'11011'),fs=String(input.fs??'CFS');
  const currentYear=new Date(now).getUTCFullYear();
  if(!/^[0-9]{4}$/.test(year)||Number(year)<2015||Number(year)>currentYear)return {ok:false,error:'INVALID_REPORT_YEAR'};
  if(!REPORTS.has(report))return {ok:false,error:'INVALID_REPORT_CODE'};
  if(!['CFS','OFS'].includes(fs))return {ok:false,error:'INVALID_FINANCIAL_STATEMENT_TYPE'};
  return {ok:true,kind:'financials',corpCode,year,report,fs};
}
export async function fetchInvestOpenDart(env,input,options={}){
  const now=options.now??Date.now();
  const v=validateDartRequest(input,now);
  if(!v.ok)return {httpStatus:400,body:{schema:INVEST_DART_SCHEMA,error:v.error,ordersPlaced:false}};
  const key=String(env?.OPENDART_API_KEY??'').trim();
  if(!key)return {httpStatus:503,body:{schema:INVEST_DART_SCHEMA,error:'OPENDART_NOT_CONFIGURED',ordersPlaced:false}};
  const url=new URL(BASE+(v.kind==='company'?'company.json':'fnlttSinglAcntAll.json'));
  url.searchParams.set('crtfc_key',key);
  url.searchParams.set('corp_code',v.corpCode);
  if(v.kind==='financials'){
    url.searchParams.set('bsns_year',v.year);
    url.searchParams.set('reprt_code',v.report);
    url.searchParams.set('fs_div',v.fs);
  }
  // Fixed HTTPS endpoint only. Do not return or log the signed URL.
  let response;
  try{
    const fetcher=options.fetchImpl??fetch;
    response=await fetcher(url.href,{method:'GET',redirect:'error',cache:'no-store',
      headers:{accept:'application/json'},signal:AbortSignal.timeout(7500)});
  }catch{return {httpStatus:502,body:{schema:INVEST_DART_SCHEMA,error:'OPENDART_UNAVAILABLE',ordersPlaced:false}}}
  if(!response.ok)return {httpStatus:502,body:{schema:INVEST_DART_SCHEMA,error:'OPENDART_UPSTREAM_HTTP_ERROR',ordersPlaced:false}};
  if(!String(response.headers.get('content-type')||'').toLowerCase().includes('json'))
    return {httpStatus:502,body:{schema:INVEST_DART_SCHEMA,error:'OPENDART_INVALID_RESPONSE',ordersPlaced:false}};
  const declaredBytes=Number(response.headers.get('content-length')||0);
  if(declaredBytes>MAX_RESPONSE_BYTES)return {httpStatus:502,body:{schema:INVEST_DART_SCHEMA,error:'OPENDART_RESPONSE_TOO_LARGE',ordersPlaced:false}};
  const raw=await response.text().catch(()=>null);
  if(!raw||raw.length>MAX_RESPONSE_BYTES)
    return {httpStatus:502,body:{schema:INVEST_DART_SCHEMA,error:'OPENDART_RESPONSE_TOO_LARGE',ordersPlaced:false}};
  let data;
  try{data=JSON.parse(raw)}catch{return {httpStatus:502,body:{schema:INVEST_DART_SCHEMA,error:'OPENDART_INVALID_RESPONSE',ordersPlaced:false}}}
  // OpenDART uses body status codes, not only HTTP codes.
  if(String(data?.status)!=='000'){
    const status=String(data?.status||'');
    return {httpStatus:status==='013'?404:status==='020'?429:502,
      body:{schema:INVEST_DART_SCHEMA,error:status==='013'?'OPENDART_NO_DATA':status==='020'?'OPENDART_RATE_LIMITED':'OPENDART_PROVIDER_ERROR',
        providerStatus:/^[0-9]{3}$/.test(status)?status:null,ordersPlaced:false}};
  }
  const shared={schema:INVEST_DART_SCHEMA,provider:'OpenDART',source:'official_filing_api',
    fetchedAt:new Date(now).toISOString(),corpCode:v.corpCode,ordersPlaced:false,
    paperOrdersPlaced:false,liveOrdersEnabled:false,valuationReady:false,
    priceDataConnected:false,sourceUrl:'https://opendart.fss.or.kr/',
    keyReturned:false};
  if(v.kind==='company')return {httpStatus:200,body:{...shared,kind:'company',
    company:{corpCode:v.corpCode,name:redact(data.corp_name),nameEn:redact(data.corp_name_eng),
      stockCode:TICKER.test(String(data.stock_code||''))?data.stock_code:null,
      industryCode:redact(data.induty_code,20),accountingMonth:redact(data.acc_mt,8)}}};
  if(!Array.isArray(data.list))return {httpStatus:502,body:{schema:INVEST_DART_SCHEMA,error:'OPENDART_INVALID_STATEMENT',ordersPlaced:false}};
  const rows=data.list.slice(0,MAX_ROWS).filter(row=>row&&typeof row==='object').map(row=>({
    section:redact(row.sj_div,8),accountId:redact(row.account_id,90),
    accountName:redact(row.account_nm,150),currency:redact(row.currency,10),
    currentAmount:amount(row.thstrm_amount),priorAmount:amount(row.frmtrm_amount),
    receiptNo:/^[0-9]{14}$/.test(String(row.rcept_no||''))?row.rcept_no:null
  })).filter(row=>row.accountName);
  return {httpStatus:200,body:{...shared,kind:'financials',year:Number(v.year),
    reportCode:v.report,statementType:v.fs,unit:'as_reported_in_currency_field',
    reportingPeriodIsNotDisclosureTimestamp:true,
    officialRows:rows,returnedRows:rows.length,truncated:data.list.length>MAX_ROWS,
    sourceAttestedByServerFetch:true,
    uncertainty:'공식 공시의 재무제표 원천값이며 최신 주가, 섹터 비교, 공시 정정사항 및 투자가치 점수는 포함되지 않습니다.'}};
}
