import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../ekodipay-worker.js';
import {PayOrderStore} from '../ekodipay-order-store.js';
import {paymentMode} from '../ekodipay-provider-toss.js';
const ID='EB-'+'M'.repeat(30);
const TOKEN='SECURE-SERVER-SERVICE-KEY-EXAMPLE-ONLY-'.repeat(2);
const EXPIRES=Date.now()+3600000;
const fakeOrder=()=>({orderId:ID,merchant:'ekodibiz',service:'ekodibiz',
 approved:true,approvalRef:'APP-VALIDATED-QUOTE-1234',currency:'KRW',amount:150000,orderName:'승인 견적 테스트',expiresAt:EXPIRES});
class FakeStorage{
 map=new Map();
 async get(k){return this.map.get(k)}
 async put(k,v){this.map.set(k,structuredClone(v))}
 async transaction(fn){return fn(this)}
}
function harness(operational=true){
 const store=new PayOrderStore({storage:new FakeStorage()});
 const env={PAYMENT_EXECUTION_MODE:operational?'test':'disabled-until-approved',
  EKODIPAY_SERVICE_ORDER_TOKEN:TOKEN,
  TOSS_TEST_CLIENT_KEY:'test_ck_our_dummy_client',TOSS_TEST_SECRET_KEY:'test_sk_our_dummy_secret',
  PAY_ORDERS:{idFromName:k=>k,get:k=>({fetch:req=>store.fetch(req)})}};
 return {env,store};
}
const endpoint=(path,env,opts={})=>worker.fetch(new Request('https://ekodi.kr/ekodipay'+path,opts),env);
const post=(path,env,data,headers={})=>endpoint(path,env,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
test('production money movement is fail-closed until all independent owner and PG conditions hold',()=>{
 const {env}=harness(false);
 assert.equal(paymentMode(env).ready,false);
 assert.equal(paymentMode({...env,PAYMENT_EXECUTION_MODE:'live'}).ready,false);
 assert.equal(paymentMode({...env,PAYMENT_EXECUTION_MODE:'live',EKODIPAY_LIVE_OWNER_GATE:'APPROVED',
 EKODIPAY_PG_CONTRACT_VERIFIED:'YES',EKODIPAY_SETTLEMENT_OWNER_VERIFIED:'YES'}).ready,false);
 assert.equal(paymentMode({...env,PAYMENT_EXECUTION_MODE:'live',EKODIPAY_LIVE_OWNER_GATE:'APPROVED',
 EKODIPAY_PG_CONTRACT_VERIFIED:'YES',EKODIPAY_SETTLEMENT_OWNER_VERIFIED:'YES',
 TOSS_LIVE_CLIENT_KEY:'live_ck_fixture',TOSS_LIVE_SECRET_KEY:'live_sk_fixture',
 EKODIPAY_REFUND_POLICY_VERIFIED:'YES',EKODIPAY_RECONCILIATION_VERIFIED:'YES',
 EKODIPAY_APPROVED_ORDER_ISSUER_VERIFIED:'YES',EKODIPAY_DELAYED_METHODS_DISABLED:'YES',
 EKODIPAY_TOSS_MID:'merchant01',
 EKODIPAY_OPERATOR_TOKEN:'OPERATOR-KEY-EXAMPLE-0123456789-ABCDEF'}).ready,true);
});
test('external clients cannot forge or register an order, and ready mode still trusts only signed service orders',async()=>{
 const {env}=harness(true);
 let res=await post('/api/merchant/orders',env,fakeOrder());
 assert.equal(res.status,401);
 res=await post('/api/merchant/orders',env,{...fakeOrder(),amount:1},{authorization:'Bearer '+TOKEN});
 assert.equal(res.status,400);
 res=await post('/api/merchant/orders',env,{...fakeOrder(),approved:false},{authorization:'Bearer '+TOKEN});
 assert.equal(res.status,400);
 res=await post('/api/merchant/orders',env,fakeOrder(),{authorization:'Bearer '+TOKEN});
 assert.equal(res.status,201);
 assert.equal((await res.json()).status,'ready');
 res=await post('/api/merchant/orders',env,fakeOrder(),{authorization:'Bearer '+TOKEN});
 assert.equal(res.status,200);
 res=await post('/api/merchant/orders',env,{...fakeOrder(),amount:1_000},{authorization:'Bearer '+TOKEN});
 assert.equal(res.status,409);
});
test('checkout state is private and one-time; confirming browser amount cannot be changed',async()=>{
 const {env,store}=harness(true);
 await post('/api/merchant/orders',env,fakeOrder(),{authorization:'Bearer '+TOKEN});
 const page=await endpoint('/pay-now?orderId='+ID,env);
 assert.equal(page.status,200);
 const html=await page.text();
 assert.match(html,/150,000/);
 assert.match(html,/test_ck_our_dummy_client/);
 assert.doesNotMatch(html,/test_sk_our_dummy_secret|SECURE-SERVER-SERVICE-KEY/);
 const cookie=page.headers.get('set-cookie');
 assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);
 let res=await post('/api/payments/confirm',env,
   {orderId:ID,paymentKey:'payment_key_0123456789',amount:1},
   {origin:'https://ekodi.kr',cookie});
 assert.equal(res.status,400);
 assert.equal((await store.storage.get('order')).status,'ready');
 res=await post('/api/payments/confirm',env,
   {orderId:ID,paymentKey:'payment_key_0123456789',amount:150000},
   {origin:'https://attacker.invalid',cookie});
 assert.equal(res.status,403);
 assert.equal((await store.storage.get('order')).status,'ready');
});
test('successful provider confirmation settles exactly once without financial data in browser',async()=>{
 const {env,store}=harness(true);
 await post('/api/merchant/orders',env,fakeOrder(),{authorization:'Bearer '+TOKEN});
 const page=await endpoint('/pay-now?orderId='+ID,env);
 const cookie=page.headers.get('set-cookie');
 const prior=globalThis.fetch;
 let called=0;
 globalThis.fetch=async (url,opts)=>{
   called++;
   assert.equal(url,'https://api.tosspayments.com/v1/payments/confirm');
   assert.match(opts.headers.authorization,/^Basic /);
   assert.equal(opts.headers['Idempotency-Key'],ID);
   const b=JSON.parse(opts.body);
   assert.deepEqual(b,{paymentKey:'payment_key_0123456789',orderId:ID,amount:150000});
   return new Response(JSON.stringify({...b,totalAmount:b.amount,status:'DONE',method:'카드',currency:'KRW'}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
   let res=await post('/api/payments/confirm',env,
     {paymentKey:'payment_key_0123456789',orderId:ID,amount:150000},
     {origin:'https://ekodi.kr',cookie});
   assert.equal(res.status,200);
   assert.equal((await res.json()).status,'paid');
   assert.equal((await store.storage.get('order')).status,'paid');
   res=await post('/api/payments/confirm',env,
     {paymentKey:'payment_key_0123456789',orderId:ID,amount:150000},
     {origin:'https://ekodi.kr',cookie});
   assert.equal(res.status,409);
   assert.equal(called,1);
 }finally{globalThis.fetch=prior;}
});
test('webhook and callback cannot directly declare a payment paid',async()=>{
 const {env}=harness(true);
 let res=await post('/api/webhooks/toss',env,{eventType:'PAYMENT_STATUS_CHANGED',data:{status:'DONE'}});
 assert.equal(res.status,503);
 res=await endpoint('/payment/success?orderId='+ID+'&amount=1&paymentKey=invalid',env);
 assert.equal(res.status,200);
 assert.doesNotMatch(await res.text(),/결제가 완료되었습니다/);
 const readiness=await endpoint('/api/payment-readiness',env);
 const info=await readiness.json();
 assert.equal(info.mode,'test');assert.equal(info.ready,true);assert.equal(info.live,false);
});

test('live merchant MID is mandatory even after every other approval flag is set',()=>{
 const {env}=harness(false);
 const flags={...env,PAYMENT_EXECUTION_MODE:'live',EKODIPAY_LIVE_OWNER_GATE:'APPROVED',
   EKODIPAY_PG_CONTRACT_VERIFIED:'YES',EKODIPAY_SETTLEMENT_OWNER_VERIFIED:'YES',
   TOSS_LIVE_CLIENT_KEY:'live_ck_fixture',TOSS_LIVE_SECRET_KEY:'live_sk_fixture',
   EKODIPAY_REFUND_POLICY_VERIFIED:'YES',EKODIPAY_RECONCILIATION_VERIFIED:'YES',
   EKODIPAY_APPROVED_ORDER_ISSUER_VERIFIED:'YES',EKODIPAY_DELAYED_METHODS_DISABLED:'YES',
   EKODIPAY_OPERATOR_TOKEN:'OPERATOR-KEY-EXAMPLE-0123456789-ABCDEF'};
 assert.equal(paymentMode(flags).ready,false);
 assert.equal(paymentMode({...flags,EKODIPAY_TOSS_MID:'merchant01'}).ready,true);
});
test('non-immediate virtual account is not accepted as a completed charged order',async()=>{
 const {env,store}=harness(true);
 await post('/api/merchant/orders',env,fakeOrder(),{authorization:'Bearer '+TOKEN});
 const page=await endpoint('/pay-now?orderId='+ID,env);
 const cookie=page.headers.get('set-cookie');
 const prior=globalThis.fetch;
 globalThis.fetch=async (_url,options)=>{
  const b=JSON.parse(options.body);
  return new Response(JSON.stringify({...b,totalAmount:b.amount,status:'DONE',
    method:'가상계좌',currency:'KRW'}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const res=await post('/api/payments/confirm',env,{paymentKey:'payment_key_0123456789',
    orderId:ID,amount:150000},{origin:'https://ekodi.kr',cookie});
  assert.equal(res.status,502);
  assert.equal((await store.storage.get('order')).status,'requires_reconciliation');
 }finally{globalThis.fetch=prior}
});
test('operator cannot reconcile an unapproved provider method as paid',async()=>{
 const {env,store}=harness(true);
 env.EKODIPAY_OPERATOR_TOKEN='OPERATOR-KEY-EXAMPLE-0123456789-ABCDEF';
 await post('/api/merchant/orders',env,fakeOrder(),{authorization:'Bearer '+TOKEN});
 const prior=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({orderId:ID,totalAmount:150000,
  status:'DONE',paymentKey:'payment_key_0123456789',method:'가상계좌',currency:'KRW'}),{status:200});
 try{
  const res=await post('/api/operator/reconcile',env,{orderId:ID},
    {authorization:'Bearer '+env.EKODIPAY_OPERATOR_TOKEN});
  assert.equal(res.status,409);
  assert.equal((await store.storage.get('order')).status,'ready');
 }finally{globalThis.fetch=prior}
});

test('public setup page exposes actionable onboarding without accepting keys or enabling a charge',async()=>{
 const {env}=harness(false);
 const response=await endpoint('/setup',env);
 assert.equal(response.status,200);
 const html=await response.text();
 for(const needle of ['실제 결제 운영 준비','가맹점 계약','Cloudflare','청구 비활성화','환불','실결제 준비']){
   assert.ok(html.includes(needle),needle);
 }
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.match(response.headers.get('content-security-policy')||'',/default-src 'none'/);
 assert.doesNotMatch(html,/test_sk_our_dummy_secret|SECURE-SERVER-SERVICE-KEY/);
 assert.doesNotMatch(html,/<form\b|type="password"|<input\b/i);
 let res=await endpoint('/setup',env,{method:'POST',body:'approved=true'});
 assert.equal(res.status,405);
 res=await endpoint('/api/payment-readiness',env);
 assert.equal((await res.json()).ready,false);
});
