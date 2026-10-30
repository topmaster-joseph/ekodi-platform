import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { SERVICE_ENTRYPOINTS } from '../ekodipay-worker.js';
const root='https://ekodi.kr/ekodipay';
const load=(path,init)=>worker.fetch(new Request(root+path,init));

test('public hub prefers service-owned order journeys and retains safe demos', async()=>{
  const r=await load('/');
  assert.equal(r.status,200);
  const body=await r.text();
  for(const p of ['/ekodimall/','/ekodibiz/','/edu/','/ekodipay/admin','/ekodipay/demo','/ekodipay/preview'])assert.ok(body.includes(p),p);
  assert.match(body,/고객은 별도 결제 사이트로 이동하지 않고/);
  assert.match(body,/서비스별 신청·결제 안내/);
  assert.equal((body.match(/class="card"/g)||[]).length,4);
  assert.match(r.headers.get('content-security-policy'),/form-action 'none'/);
});
test('service contract discloses only safe discovery metadata and never claims live readiness',async()=>{
  const res=await load('/api/services');
  assert.equal(res.status,200);
  assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal(res.headers.get('x-robots-tag'),'noindex, nofollow');
  const v=await res.json();
  assert.equal(v.consumerCheckout,'originating-service-only');
  assert.equal(v.publicPaymentInitiation,false);
  assert.match(v.realMoneyProcessing,/disabled/);
  assert.deepEqual(v.services.map(x=>x.id),Object.keys(SERVICE_ENTRYPOINTS));
  assert.deepEqual(v.services.filter(x=>x.entry).map(x=>x.entry),['/ekodimall/','/ekodibiz/','/edu/']);
  assert.ok(v.services.every(x=>x.livePaymentStatus==='not-verified'));
  assert.doesNotMatch(JSON.stringify(v),/live_sk|test_sk|TOSS_SECRET_KEY|bank_account|paymentKey/);
  assert.equal((await load('/api/services?amount=1')).status,400);
  const head=await load('/api/services',{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('public admin entry only delegates RBAC to the existing central admin',async()=>{
  for(const p of ['/admin','/admin/']){
    const r=await load(p,{redirect:'manual'});
    assert.equal(r.status,307);
    assert.equal(r.headers.get('location'),'/admin?route=finance&source=ekodipay');
    assert.equal(r.headers.get('cache-control'),'no-store');
    assert.equal(await r.text(),'');
  }
  assert.equal((await load('/admin?next=https://evil.example')).status,400);
  assert.equal((await load('/admin',{method:'POST'})).status,405);
  assert.equal((await worker.fetch(new Request('https://'+['pay','ekodi','kr'].join('.')+'/ekodipay/admin'))).status,404);
});
test('common hub does not become a public payment or refund API',async()=>{
 for(const p of ['/api/services','/admin','/demo','/checkout']){
   const r=await load(p,{method:'POST',body:'amount=1'});
   assert.equal(r.status,405,p);
 }
 const r=await load('/api/health');
 const v=await r.json();
 assert.match(v.realMoneyProcessing,/disabled/);
 assert.equal(v.paymentSecretsExposed,false);
 assert.equal(v.consumerCheckout,'originating-service-only');
});
