import assert from 'node:assert/strict';
import test from 'node:test';
import policyFundWorker from '../policy-fund-worker.js';
import financeEntryWorker from '../finance-entry-worker.js';
import {
  deadlineState,
  nextPolicyMilestones,
  officialSource,
} from '../policy-fund-domain.js';

test('policy fund official source recognises MSS and SEMAS only', () => {
  assert.equal(officialSource('https://www.mss.go.kr/site/smba/ex/bbs/View.do?bcIdx=1'), true);
  assert.equal(officialSource('https://ols.semas.or.kr/ols/man/SMAN010M/page.do'), true);
  assert.equal(officialSource('https://example.com/policy-fund'), false);
  assert.equal(officialSource('javascript:alert(1)'), false);
});

test('policy fund maturity creates D-90 through D-7 operating milestones', () => {
  assert.deepEqual(nextPolicyMilestones('2027-01-01'), [
    { daysBefore: 90, on: '2026-10-03' },
    { daysBefore: 60, on: '2026-11-02' },
    { daysBefore: 30, on: '2026-12-02' },
    { daysBefore: 14, on: '2026-12-18' },
    { daysBefore: 7, on: '2026-12-25' },
  ]);
  assert.deepEqual(deadlineState('2026-09-24', new Date('2026-09-17T12:00:00Z')), { band:'d7', days:7 });
});

test('policy fund API health is public and independent from D1', async () => {
  const response = await policyFundWorker.fetch(new Request('https://finance-api.ekodi.kr/api/finance/policy-funds/health'), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data, { ok:true, service:'ekodi-policy-fund-management', version:1 });
});

test('finance entry routes policy fund health to the isolated module', async () => {
  const response = await financeEntryWorker.fetch(new Request('https://finance-api.ekodi.kr/api/finance/policy-funds/health'), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.service, 'ekodi-policy-fund-management');
});

test('policy fund API rejects untrusted browser origins', async () => {
  const response = await policyFundWorker.fetch(new Request('https://finance-api.ekodi.kr/api/finance/policy-funds/overview', {
    headers: { origin:'https://example.com' },
  }), {});
  assert.equal(response.status, 403);
});

test('policy fund API fails closed without its D1 binding', async () => {
  const response = await policyFundWorker.fetch(new Request('https://finance-api.ekodi.kr/api/finance/policy-funds/overview'), {});
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.match(data.error, /D1/);
});
