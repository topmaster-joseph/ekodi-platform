import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { hasGlobalFinanceAccess } from '../finance-worker.js';
import { namespaceFinanceSql } from '../finance-entry-worker.js';

test('finance SQL is isolated from pre-existing application tables', () => {
  const input = 'SELECT * FROM projects JOIN payments ON payments.project_id = projects.id; INSERT INTO accounting_entries(amount) VALUES (1)';
  const output = namespaceFinanceSql(input);
  assert.match(output, /finance_projects/);
  assert.match(output, /finance_payments/);
  assert.match(output, /finance_accounting_entries/);
  assert.doesNotMatch(output, /\bFROM projects\b/);
});

test('finance API health is public and does not require D1', async () => {
  const response = await worker.fetch(new Request('https://finance-api.ekodi.kr/health'), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.service, 'ekodi-finance-api');
  assert.equal(data.version, 4);
});

test('finance API rejects untrusted browser origins', async () => {
  const response = await worker.fetch(new Request('https://finance-api.ekodi.kr/api/finance/overview', {
    headers: { origin: 'https://example.com' }
  }), {});
  assert.equal(response.status, 403);
  const data = await response.json();
  assert.match(data.error, /허용되지 않은/);
});

test('finance API fails closed without its D1 binding', async () => {
  const response = await worker.fetch(new Request('https://finance-api.ekodi.kr/api/finance/overview'), {});
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.match(data.error, /D1/);
});

test('Toss webhook fails closed until a server secret is configured', async () => {
  const response = await worker.fetch(new Request('https://finance-api.ekodi.kr/webhooks/toss', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId: 'ORDER-1' } })
  }), { DB: {} });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.match(data.error, /서버키/);
});


function mockDatabase(order) {
  const calls=[];
  const DB={prepare(sql){return{
    bind(...args){calls.push({sql,args});return this;},
    async first(){return /FROM payment_orders WHERE order_id/.test(sql)?order:null;},
    async run(){return{success:true};},
  };}};
  return {DB,calls};
}
async function deliverWebhook(DB, data, secret='server-secret-for-test', extra={}) {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
  try{
    return await worker.fetch(new Request('https://finance-api.ekodi.kr/webhooks/toss',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({eventType:'PAYMENT_STATUS_CHANGED',data:{paymentKey:data.paymentKey,orderId:data.orderId,status:data.status}}),
    }),{DB,TOSS_SECRET_KEY:secret,...extra});
  }finally{globalThis.fetch=originalFetch;}
}
const churchPayment=()=>({
  paymentKey:'pk_church_1',orderId:'CHURCH_123_abc',status:'DONE',
  method:'CARD',currency:'KRW',totalAmount:10000,mId:'q_verifiedchurch',
  orderName:'에코디교회 십일조·주일헌금',approvedAt:'2026-10-30T01:00:00Z'
});
const churchOrder=()=>({
  organization_id:'EKODICHURCH',business_unit_id:'CHURCH',project_id:null,
  source_domain:'ekodi.kr',amount:10000,currency:'KRW'
});

test('registered church giving order is classified only by server row',async()=>{
 const {DB,calls}=mockDatabase(churchOrder());
 const response=await deliverWebhook(DB,churchPayment());
 assert.equal(response.status,200);
 const inserted=calls.find(x=>/INSERT INTO payments/.test(x.sql));
 assert.ok(inserted);
 assert.equal(inserted.args[2],'EKODICHURCH');
 assert.equal(inserted.args[3],'CHURCH');
 assert.equal(inserted.args[5],'ekodi.kr');
});
test('unknown church-prefixed order fails closed without a financial record',async()=>{
 const {DB,calls}=mockDatabase(null);
 const response=await deliverWebhook(DB,churchPayment());
 assert.equal(response.status,502);
 assert.equal(calls.some(x=>/INSERT INTO payments/.test(x.sql)),false);
});
test('legacy unknown non-church order never defaults to EKODIBIZ',async()=>{
 const {DB,calls}=mockDatabase(null);
 const data={...churchPayment(),orderId:'UNREGISTERED-1001'};
 const response=await deliverWebhook(DB,data);
 assert.equal(response.status,502);
 assert.equal(calls.some(x=>/INSERT INTO payments/.test(x.sql)),false);
});
test('server amount and PG amount mismatch rejects the event before inserting',async()=>{
 const {DB,calls}=mockDatabase({...churchOrder(),amount:9999});
 const response=await deliverWebhook(DB,churchPayment());
 assert.equal(response.status,502);
 assert.equal(calls.some(x=>/INSERT INTO payments/.test(x.sql)),false);
});
test('wrong PG currency and MID do not cross tenant boundaries',async()=>{
 const c1=mockDatabase(churchOrder());
 assert.equal((await deliverWebhook(c1.DB,{...churchPayment(),currency:'USD'})).status,502);
 assert.equal(c1.calls.some(x=>/INSERT INTO payments/.test(x.sql)),false);
 const c2=mockDatabase(churchOrder());
 assert.equal((await deliverWebhook(c2.DB,churchPayment(),'server-secret-for-test',{TOSS_MID:'q_anothermerchant'})).status,502);
 assert.equal(c2.calls.some(x=>/INSERT INTO payments/.test(x.sql)),false);
});

test('webhook cannot replay another order or payment key from a valid Toss lookup',async()=>{
 const a=mockDatabase(churchOrder());
 const data=churchPayment();
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 try{
   const forgedOrder=await worker.fetch(new Request('https://ekodi.kr/webhooks/toss',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({eventType:'PAYMENT_STATUS_CHANGED',data:{paymentKey:data.paymentKey,orderId:'OTHER_ORDER',status:'DONE'}})
    }),{DB:a.DB,TOSS_SECRET_KEY:'server-secret-for-test'});
   assert.equal(forgedOrder.status,502);
   assert.equal(a.calls.some(x=>/INSERT INTO payments/.test(x.sql)),false);
   const forgedKey=await worker.fetch(new Request('https://ekodi.kr/webhooks/toss',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({eventType:'PAYMENT_STATUS_CHANGED',data:{paymentKey:'another_payment_key',orderId:data.orderId,status:'DONE'}})
    }),{DB:a.DB,TOSS_SECRET_KEY:'server-secret-for-test'});
   assert.equal(forgedKey.status,502);
   assert.equal(a.calls.some(x=>/INSERT INTO payments/.test(x.sql)),false);
 }finally{globalThis.fetch=originalFetch;}
});

test('global cross-organization Finance access is reserved to authenticated platform superadmin',()=>{
 assert.equal(hasGlobalFinanceAccess({authenticated:true,role:'super_admin'}),true);
 assert.equal(hasGlobalFinanceAccess({authenticated:true,role:'admin'}),false);
 assert.equal(hasGlobalFinanceAccess({authenticated:true,role:'site_manager'}),false);
 assert.equal(hasGlobalFinanceAccess({authenticated:false,role:'super_admin'}),false);
 assert.equal(hasGlobalFinanceAccess(null),false);
});
test('financial admin order creation is immutable and rejects nonpositive or fractional input',async()=>{
 const source=await import('node:fs/promises').then(x=>x.readFile(new URL('../finance-worker.js',import.meta.url),'utf8'));
 assert.match(source,/ON CONFLICT\(order_id\) DO NOTHING/);
 assert.doesNotMatch(source,/ON CONFLICT\(order_id\) DO UPDATE SET/);
 assert.match(source,/Number\.isSafeInteger\(amount\) \|\| amount <= 0/);
 assert.match(source,/result\?\.meta\?\.changes/);
 assert.match(source,/finance\.order\.create/);
});
