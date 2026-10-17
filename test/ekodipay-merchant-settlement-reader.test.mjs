import test from 'node:test';
import assert from 'node:assert/strict';
import {readTenantPgSettlementPages} from '../ekodipay-merchant-settlement-reader.js';
const profile=(id='ekodibiz',mid='merchantA')=>({
 merchantId:id,legalEntityRef:'entity_'+id,state:'verified',provider:'tosspayments',
 services:[id],issuerRefs:{[id]:'issuer_'+id},
 midByMode:{test:'test'+mid,live:'live'+mid},
 credentialRefs:{
  test:{client:'PAY_'+id.toUpperCase()+'_TEST_CLIENT',secret:'PAY_'+id.toUpperCase()+'_TEST_SECRET'},
  live:{client:'PAY_'+id.toUpperCase()+'_LIVE_CLIENT',secret:'PAY_'+id.toUpperCase()+'_LIVE_SECRET'}
 },
 settlement:{bankCode:'088',accountLast4:'1234',fingerprint:(id==='ekodibiz'?'a':'b').repeat(64),proofRef:'BANK_PROOF_0001'},
 evidence:{}
});
const creds=p=>({[p.credentialRefs.test.secret]:'test_gsk_'+'A'.repeat(32),
 [p.credentialRefs.live.secret]:'live_gsk_'+'B'.repeat(32)});
const row=(p,n)=>({mId:p.midByMode.test,transactionKey:'TXNKEY_'+n,paymentKey:'PAYKEY_'+n,
 orderId:'ORDERID_'+n,currency:'KRW',method:'카드',amount:50000,
 payOutAmount:48000,fees:[{type:'BASE',fee:2000}],
 soldDate:'2026-10-16',paidOutDate:'2026-10-18',
 card:{number:'SHOULD_NOT_EXPORT'},customerName:'PRIVATE_SHOULD_NOT_EXPORT'});
const authorized=p=>new Set([p.merchantId]);
const base=p=>({
 merchantId:p.merchantId,mode:'test',profiles:[p],env:creds(p),
 authorizedMerchantIds:authorized(p),startDate:'2026-10-16',endDate:'2026-10-17',size:2,maxPages:3
});
test('read-only page collector uses the tenant secret, correct GET URL, and stops only after a partial page',async()=>{
 const p=profile(),calls=[];
 const fetchImpl=async(url,options)=>{
  const n=Number(new URL(url).searchParams.get('page'));
  calls.push({url,method:options.method,auth:options.headers.authorization});
  return new Response(JSON.stringify(n===1?[row(p,'000001'),row(p,'000002')]:[row(p,'000003')]),{status:200});
 };
 const result=await readTenantPgSettlementPages({...base(p),fetchImpl});
 assert.equal(result.merchantId,p.merchantId);
 assert.equal(result.mid,p.midByMode.test);
 assert.equal(result.paginationComplete,true);
 assert.equal(result.pagesRead,2);
 assert.equal(result.rows.length,3);
 assert.equal(result.bankDepositVerified,false);
 assert.equal(result.readOnly,true);
 assert.equal(calls.length,2);
 for(const call of calls){
  assert.equal(call.method,'GET');
  assert.ok(call.url.startsWith('https://api.tosspayments.com/v1/settlements?'));
  assert.equal(call.auth,'Basic '+btoa(creds(p)[p.credentialRefs.test.secret]+':'));
 }
 assert.equal(JSON.stringify(result).includes('PRIVATE_SHOULD_NOT_EXPORT'),false);
 assert.equal(JSON.stringify(result).includes('SHOULD_NOT_EXPORT'),false);
 assert.equal(JSON.stringify(result).includes(creds(p)[p.credentialRefs.test.secret]),false);
});
test('the selected merchant is server-authorized and MUST NOT fall back to another tenant secret or MID',async()=>{
 const a=profile(),b=profile('ekodiedu','merchantB');let called=0;
 const fetchImpl=async()=>{called++;return new Response('[]')};
 for(const overrides of [
   {authorizedMerchantIds:new Set([b.merchantId])},
   {profiles:[b]},
   {env:creds(b)},
   {mode:'live',env:creds(a)},
   {mode:undefined},
 ]){
  const args={...base(a),...overrides,fetchImpl};
  if(overrides.mode==='live')continue;
  await assert.rejects(()=>readTenantPgSettlementPages(args),/(tenant|merchant|binding|secret)/);
 }
 assert.equal(called,0);
 // Matching live credentials are allowed to READ, not to charge or prove payout.
 const v=await readTenantPgSettlementPages({...base(a),mode:'live',
  fetchImpl:async()=>new Response('[]',{status:200})});
 assert.equal(v.mode,'live');assert.equal(v.bankDepositVerified,false);
});
test('wrong MID, duplicate transactions, invalid fees and provider outages fail closed',async()=>{
 const p=profile(),opts=base(p);
 for(const batch of [
  [{...row(p,'000001'),mId:'anotherMID'}],
  [row(p,'000001'),{...row(p,'000002'),amount:1.9}],
  [row(p,'000001'),{...row(p,'000002'),fees:[{type:'BASE',fee:'2000'}]}],
  [row(p,'000001'),{...row(p,'000002'),currency:'USD'}],
  [{...row(p,'000001'),customerName:'A'},row(p,'000001')]
 ]){
  await assert.rejects(()=>readTenantPgSettlementPages({...opts,fetchImpl:async()=>new Response(JSON.stringify(batch))}),
    /(invalid_pg_settlement|duplicate_pg)/);
 }
 for(const response of [new Response('{}',{status:200}),new Response('[]',{status:429}),new Response('oops',{status:500})]){
  await assert.rejects(()=>readTenantPgSettlementPages({...opts,fetchImpl:async()=>response}),
    /(invalid_pg_settlement|pg_settlement)/);
 }
 await assert.rejects(()=>readTenantPgSettlementPages({...opts,
  maxPages:1,fetchImpl:async()=>new Response(JSON.stringify([row(p,'000001'),row(p,'000002')]))}),
  /pagination_incomplete/);
});
test('ambiguous date, unsupported method, binding and claims must never trigger provider HTTP',async()=>{
 const p=profile();let called=0;
 const fetchImpl=async()=>{called++;return new Response('[]')};
 for(const override of [
  {startDate:'not-a-date'}, {endDate:'2026-02-30'}, {size:5001},
  {maxPages:0}, {mode:'weird'}, {authorizedMerchantIds:new Set(['ekodiedu'])},
  {env:{[p.credentialRefs.test.secret]:'live_gsk_'+'A'.repeat(32)}}
 ]){
  await assert.rejects(()=>readTenantPgSettlementPages({...base(p),...override,fetchImpl}));
 }
 assert.equal(called,0);
});
