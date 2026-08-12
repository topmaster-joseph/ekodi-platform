import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../finance-worker.js';

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
