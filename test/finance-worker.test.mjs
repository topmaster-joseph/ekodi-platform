import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../finance-worker.js';
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

test('church giving orders are classified into the church finance boundary', async () => {
  const binds = [];
  const DB = { prepare(sql) { return {
    bind(...args) { binds.push({ sql, args }); return this; },
    async first() { return null; },
    async run() { return { success: true }; },
  }; } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    paymentKey: 'pk_church_1', orderId: 'CHURCH_123_abc', status: 'DONE', method: 'CARD',
    currency: 'KRW', totalAmount: 10000, orderName: '에코디교회 십일조·주일헌금', approvedAt: new Date().toISOString(),
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://finance-api.ekodi.kr/webhooks/toss', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk_church_1', orderId: 'CHURCH_123_abc', status: 'DONE' } }),
    }), { DB, TOSS_SECRET_KEY: 'server-secret-for-test' });
    assert.equal(response.status, 200);
    const paymentInsert = binds.find((entry) => /INSERT INTO payments/.test(entry.sql));
    assert.equal(paymentInsert.args[2], 'EKODICHURCH');
    assert.equal(paymentInsert.args[3], 'CHURCH');
    assert.equal(paymentInsert.args[5], 'church.ekodi.kr');
  } finally { globalThis.fetch = originalFetch; }
});
