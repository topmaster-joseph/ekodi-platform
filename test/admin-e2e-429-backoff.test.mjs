import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADMIN_ENTRY_MAX_429_RETRIES, ADMIN_ENTRY_TOTAL_RETRY_BUDGET_MS,
  parseRetryAfterMs, gotoAdminWith429Backoff } from '../scripts/admin-e2e-429-backoff.mjs';

const pageWith = responses => {
  let index = 0;
  const calls = [];
  const waits = [];
  return {
    calls, waits,
    async goto(url, options) {
      calls.push({url,options});
      const response = responses[Math.min(index++,responses.length - 1)];
      if (response instanceof Error) throw response;
      return {status:()=>response.status,
        headerValue:async name=>name==='retry-after' ? (response.retryAfter??null) : null};
    },
    async waitForTimeout(ms) { waits.push(ms); },
  };
};

test('429 accepts numeric seconds and RFC-date Retry-After, rejects malformed values',()=>{
  assert.equal(parseRetryAfterMs('12',0),12000);
  assert.equal(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT',Date.parse('Wed, 21 Oct 2015 07:27:00 GMT')),60000);
  assert.equal(parseRetryAfterMs('bad'),null);
  assert.equal(parseRetryAfterMs(null),null);
  assert.equal(parseRetryAfterMs('999999999999999999999'),null);
});

test('200 on first attempt performs no retries or artificial user session',async()=>{
  const page=pageWith([{status:200}]);
  const response=await gotoAdminWith429Backoff(page,'https://ekodi.kr/admin/');
  assert.equal(response.status(),200);
  assert.equal(page.calls.length,1);
  assert.deepEqual(page.waits,[]);
});

test('only a real 429 may retry; a 403 must fail closed at the caller',async()=>{
  const page=pageWith([{status:403}]);
  const response=await gotoAdminWith429Backoff(page,'https://ekodi.kr/admin/');
  assert.equal(response.status(),403);
  assert.equal(page.calls.length,1);
});

test('429 obeys server Retry-After then requires actual HTTP 200',async()=>{
  const page=pageWith([{status:429,retryAfter:'13'},{status:200}]);
  const response=await gotoAdminWith429Backoff(page,'https://ekodi.kr/admin/',{log:()=>{}});
  assert.equal(response.status(),200);
  assert.deepEqual(page.waits,[13000]);
  assert.equal(page.calls.length,2);
});

test('429 without Retry-After is paced and bounded, persistent throttling fails',async()=>{
  const page=pageWith([{status:429},{status:429},{status:429},{status:429},{status:200}]);
  await assert.rejects(gotoAdminWith429Backoff(page,'https://ekodi.kr/admin/',{log:()=>{}}),/remained HTTP 429/);
  assert.deepEqual(page.waits,[8000,18000,35000]);
  assert.equal(page.calls.length,ADMIN_ENTRY_MAX_429_RETRIES+1);
  assert.ok(page.waits.reduce((a,b)=>a+b,0)<=ADMIN_ENTRY_TOTAL_RETRY_BUDGET_MS);
});

test('429 with very long Retry-After is not retried early',async()=>{
  const page=pageWith([{status:429,retryAfter:'3600'}]);
  await assert.rejects(gotoAdminWith429Backoff(page,'https://ekodi.kr/admin/',{log:()=>{}}),/exceeds bounded verifier retry budget/);
  assert.equal(page.calls.length,1);
  assert.deepEqual(page.waits,[]);
});

test('transport errors and 503 do not trigger retries or hidden bypasses',async()=>{
  const network=pageWith([new Error('TLS failed')]);
  await assert.rejects(gotoAdminWith429Backoff(network,'https://ekodi.kr/admin/'),/TLS failed/);
  assert.equal(network.calls.length,1);
  const unavailable=pageWith([{status:503}]);
  assert.equal((await gotoAdminWith429Backoff(unavailable,'https://ekodi.kr/admin/')).status(),503);
  assert.equal(unavailable.calls.length,1);
});

test('production verifier uses bounded retry for entry and degraded shell only',()=>{
  const verifier=readFileSync(new URL('../scripts/verify-admin-production-ui-e2e.mjs',import.meta.url),'utf8');
  assert.match(verifier,/gotoAdminWith429Backoff\(page, ADMIN_URL\)/);
  assert.match(verifier,/if \(!response \|\| response\.status\(\) !== 200\) throw/);
  assert.match(verifier,/async function resetAdminShellIfPoisoned\(\)/);
  assert.doesNotMatch(verifier,/page\.route\('\*\*\/\*\*'/);
  const helper=readFileSync(new URL('../scripts/admin-e2e-429-backoff.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(helper,/route\.fulfill|bypassCSP|ignoreHTTPSErrors|setExtraHTTPHeaders|sessionStorage|localStorage/);
});
