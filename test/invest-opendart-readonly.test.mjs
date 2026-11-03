import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchInvestOpenDart, validateDartRequest, INVEST_DART_SCHEMA } from '../invest-opendart-readonly.js';

const KEY='a'.repeat(40), NOW=Date.parse('2026-11-03T10:00:00.000Z');
const company={status:'000',corp_code:'00126380',corp_name:'표준기업',corp_name_eng:'Standard Co',stock_code:'005930',induty_code:'264',acc_mt:'12'};
const statement={status:'000',list:[
  {sj_div:'BS',account_id:'ifrs-full_Assets',account_nm:'자산총계',currency:'KRW',thstrm_amount:'1,234,567,890',frmtrm_amount:'1,000,000,000',rcept_no:'20260331000123'},
  {sj_div:'IS',account_id:'ifrs-full_ProfitLoss',account_nm:'당기순이익',currency:'KRW',thstrm_amount:'(20,000)',frmtrm_amount:'-',rcept_no:'20260331000123'}
]};
const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json; charset=utf-8'}});
test('no secret means zero outbound network requests',async()=>{
 let called=0;
 const x=await fetchInvestOpenDart({}, {kind:'company',corpCode:'00126380'},
  {now:NOW,fetchImpl:async()=>{called++;return json(company)}});
 assert.equal(x.httpStatus,503);assert.equal(x.body.error,'OPENDART_NOT_CONFIGURED');assert.equal(called,0);
});
test('DART input constraints prevent arbitrary URL, future years and unsupported financial periods',()=>{
 for(const id of ['../../secret','005930','000000000','a'.repeat(8),'']){
  assert.equal(validateDartRequest({kind:'company',corpCode:id}).ok,false);
 }
 assert.equal(validateDartRequest({kind:'financials',corpCode:'00126380',year:'2030' },NOW).error,'INVALID_REPORT_YEAR');
 assert.equal(validateDartRequest({kind:'financials',corpCode:'00126380',year:'2025',report:'99999'},NOW).error,'INVALID_REPORT_CODE');
 assert.equal(validateDartRequest({kind:'financials',corpCode:'00126380',year:'2025',fs:'XSS'},NOW).error,'INVALID_FINANCIAL_STATEMENT_TYPE');
 assert.equal(validateDartRequest({kind:'financials',corpCode:'00126380',year:'2025',report:'11011',fs:'CFS'},NOW).ok,true);
});
test('company query is GET-only fixed OpenDART target and never echoes secret',async()=>{
 let calls=0;
 const out=await fetchInvestOpenDart({OPENDART_API_KEY:KEY},{kind:'company',corpCode:'00126380'},
  {now:NOW,fetchImpl:async(url,init)=>{
   calls++;const u=new URL(url);
   assert.equal(u.origin,'https://opendart.fss.or.kr');
   assert.equal(u.pathname,'/api/company.json');
   assert.equal(u.searchParams.get('crtfc_key'),KEY);
   assert.equal(u.searchParams.get('corp_code'),'00126380');
   assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
   return json(company);
  }});
 assert.equal(calls,1);assert.equal(out.httpStatus,200);
 assert.equal(out.body.schema,INVEST_DART_SCHEMA);
 assert.equal(out.body.company.stockCode,'005930');
 assert.equal(out.body.keyReturned,false);
 assert.equal(out.body.valuationReady,false);
 assert.equal(out.body.liveOrdersEnabled,false);
 assert.doesNotMatch(JSON.stringify(out.body),new RegExp(KEY));
});
test('financials return only official raw account amounts, not derived valuation or prices',async()=>{
 const out=await fetchInvestOpenDart({OPENDART_API_KEY:KEY},
  {kind:'financials',corpCode:'00126380',year:'2025',report:'11011',fs:'CFS'},
  {now:NOW,fetchImpl:async(url)=>{
    const u=new URL(url);
    assert.equal(u.pathname,'/api/fnlttSinglAcntAll.json');
    assert.equal(u.searchParams.get('fs_div'),'CFS');
    assert.equal(u.searchParams.get('bsns_year'),'2025');
    return json(statement);
  }});
 assert.equal(out.httpStatus,200);
 assert.equal(out.body.officialRows[0].currentAmount,'1234567890');
 assert.equal(out.body.officialRows[1].currentAmount,'-20000');
 assert.equal(out.body.officialRows[1].priorAmount,null);
 assert.equal(out.body.reportingPeriodIsNotDisclosureTimestamp,true);
 assert.equal(out.body.priceDataConnected,false);
 assert.equal(out.body.valuationReady,false);
 assert.equal(out.body.paperOrdersPlaced,false);
 assert.equal(out.body.ordersPlaced,false);
 assert.equal(out.body.officialRows[0].receiptNo,'20260331000123');
 assert.doesNotMatch(JSON.stringify(out.body),new RegExp(KEY));
});
test('OpenDART rate/no-data/auth errors expose no provider message or secret',async()=>{
 for(const [status,expect,code] of [['013','OPENDART_NO_DATA',404],['020','OPENDART_RATE_LIMITED',429],['010','OPENDART_PROVIDER_ERROR',502]]){
  const x=await fetchInvestOpenDart({OPENDART_API_KEY:KEY},{kind:'company',corpCode:'00126380'},
   {now:NOW,fetchImpl:async()=>json({status,message:'secret '+KEY})});
  assert.equal(x.httpStatus,code);
  assert.equal(x.body.error,expect);
  assert.doesNotMatch(JSON.stringify(x.body),new RegExp(KEY));
 }
});
test('DART response size, MIME and network failures fail closed',async()=>{
 const input={kind:'company',corpCode:'00126380'}, env={OPENDART_API_KEY:KEY};
 const badMime=await fetchInvestOpenDart(env,input,{now:NOW,fetchImpl:async()=>new Response('html',{headers:{'content-type':'text/html'}})});
 assert.equal(badMime.body.error,'OPENDART_INVALID_RESPONSE');
 const tooLarge=await fetchInvestOpenDart(env,input,{now:NOW,fetchImpl:async()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'99999999'}})});
 assert.equal(tooLarge.body.error,'OPENDART_RESPONSE_TOO_LARGE');
 const outage=await fetchInvestOpenDart(env,input,{now:NOW,fetchImpl:async()=>{throw Error('Do not echo private key '+KEY)}});
 assert.equal(outage.body.error,'OPENDART_UNAVAILABLE');
 assert.doesNotMatch(JSON.stringify(outage.body),new RegExp(KEY));
});
