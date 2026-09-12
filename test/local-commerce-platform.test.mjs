import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../local-commerce-worker.js';

test('local commerce worker health keeps financial execution disabled',async()=>{
  const response=await worker.fetch(new Request('https://ekodi.kr/local-commerce/health'),{DATA_MODE:'production'});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.service,'ekodi-local-commerce');
  assert.equal(body.canonicalPath,'/local-commerce');
  assert.equal(body.cashCustody,false);
  assert.equal(body.storedValueCash,false);
  assert.equal(body.automaticMoneyTransfer,false);
  assert.equal(body.paymentAdapter,'disabled');
});

test('local commerce admin stays on canonical path',async()=>{
  const response=await worker.fetch(new Request('https://ekodi.kr/local-commerce/admin'),{DATA_MODE:'production'});
  assert.equal(response.status,307);
  assert.equal(response.headers.get('location'),'https://ekodi.kr/local-commerce/?mode=admin');
});

test('user surface exposes wallet, merchant, operator and accounting flows',()=>{
  const html=fs.readFileSync(new URL('../local-commerce/index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../local-commerce/app.js',import.meta.url),'utf8');
  for(const marker of ['내 지역상권 지갑','가맹점 참여 신청','QR 결제 확인','상인 결제요청 만들기','회계·정산'])assert.match(html,new RegExp(marker));
  for(const route of ['/claim','/merchant-requests','/qr-intents','/redeem','/programs/update','/settlements/draft','/settlements/review'])assert.ok(app.includes(route));
  assert.ok(app.includes('x-ekodi-confirm-impact'));
  for(const marker of ['value="church"','value="nonprofit"','value="enterprise"','value="public_agency"','value="community"','programPolicyForm','policyMerchants'])assert.ok(html.includes(marker));
});
