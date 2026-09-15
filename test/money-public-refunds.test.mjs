import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRefundSweep,PUBLIC_BENEFIT_SOURCE,PUBLIC_REFUND_SOURCES} from '../money/public-refunds.js';

test('public refund catalog is official-handoff only',()=>{
  assert.equal(PUBLIC_REFUND_SOURCES.length,7);
  for(const source of PUBLIC_REFUND_SOURCES){
    assert.match(source.url,/^https:\/\//);
    assert.equal(source.authRequired,true);
    assert.equal(source.apply,'official');
  }
  assert.equal(PUBLIC_BENEFIT_SOURCE.id,'government-benefits');
});

test('full sweep keeps every category while prioritizing non-sensitive signals',()=>{
  const sweep=buildRefundSweep({signals:['tax','health','pension'],fullSweep:true});
  assert.equal(sweep.sources.length,7);
  assert.equal(sweep.confirmedAmount,null);
  assert.equal(sweep.mode,'official-handoff');
  assert.ok(sweep.sources.slice(0,4).every(source=>source.reason==='관련 이용 흔적 우선'));
});

import fs from 'node:fs';
test('Money worker rejects sensitive identity and authentication fields',()=>{
  const worker=fs.readFileSync(new URL('../money-worker.js',import.meta.url),'utf8');
  for(const key of ['residentnumber','accountnumber','otp','auth_code','certificate_password'])assert.match(worker,new RegExp(`['\"]${key}['\"]`));
  assert.match(worker,/invalid_or_sensitive_refund_payload/);
  assert.match(worker,/financialExecution:false/);
});

import moneyWorker from '../money-worker.js';
test('refund API exposes the official catalog without financial execution',async()=>{
  const response=await moneyWorker.fetch(new Request('https://money.ekodi.kr/api/refunds/sources'),{});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.sources.length,7);
  assert.equal(data.sensitiveCredentialCollection,false);
  assert.equal(data.financialExecution,false);
});
