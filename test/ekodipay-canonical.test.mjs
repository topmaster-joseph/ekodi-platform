import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { CANONICAL_PAYMENT_ROOT } from '../ekodipay-worker.js';
import { readFile } from 'node:fs/promises';
const read = name => readFile(new URL('../'+name, import.meta.url), 'utf8');

test('canonical root serves Korean EKODI Pay entry, never legacy host', async () => {
  const r=await worker.fetch(new Request('https://ekodi.kr/ekodipay/'));
  assert.equal(r.status,200);
  assert.match(await r.text(),/모든 에코디 서비스를 위한 하나의 결제 창구/);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(CANONICAL_PAYMENT_ROOT,'https://ekodi.kr/ekodipay');
  const old=await worker.fetch(new Request('https://' + ['pay', 'ekodi', 'kr'].join('.') + '/ekodipay/'));
  assert.equal(old.status,404);
});
test('canonical slash and HEAD behave predictably',async()=>{
  const r=await worker.fetch(new Request('https://ekodi.kr/ekodipay'));
  assert.equal(r.status,308);
  assert.equal(r.headers.get('location'),'/ekodipay/');
  const h=await worker.fetch(new Request('https://ekodi.kr/ekodipay/',{method:'HEAD'}));
  assert.equal(h.status,200);
  assert.equal(await h.text(),'');
});
test('live processing disabled and checkout never trusts browser amount or payment status',async()=>{
  let r=await worker.fetch(new Request('https://ekodi.kr/ekodipay/api/health'));
  const body=await r.json();
  assert.match(body.realMoneyProcessing,/disabled/);
  for(const query of ['amount=1','price=1','paymentKey=abc','total=100']) {
    r=await worker.fetch(new Request('https://ekodi.kr/ekodipay/checkout?service=ekodibiz&orderId=EB-ABCDEF&'+query));
    assert.equal(r.status,400);
  }
  r=await worker.fetch(new Request('https://ekodi.kr/ekodipay/checkout?service=ekodibiz&orderId=EB-ABCDEF&status=paid'));
  assert.equal(r.status,200);
  assert.match(await r.text(),/결제 완료 증명이 아닙니다/);
  r=await worker.fetch(new Request('https://ekodi.kr/ekodipay/checkout?service=ekodibiz&orderId=invalid'));
  assert.equal(r.status,400);
  r=await worker.fetch(new Request('https://ekodi.kr/ekodipay/checkout',{method:'POST'}));
  assert.equal(r.status,405);
});
test('Cloudflare route has no legacy subdomain owner and no secrets in source',async()=>{
  const wrangler=await read('wrangler.ekodipay.toml');
  const code=await read('ekodipay-worker.js');
  assert.match(wrangler,/pattern = "ekodi\.kr\/ekodipay\*"/);
  assert.doesNotMatch(wrangler,/pay\.ekodi\.kr/);
  assert.doesNotMatch(code,/TOSS_SECRET_KEY|process\.env|Authorization: Basic/);
});
