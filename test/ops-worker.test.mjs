import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../ops-worker.js';

test('operations API health is available without database or admin session', async () => {
  const response = await worker.fetch(new Request('https://ops-api.ekodi.kr/health'), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.service, 'ekodi-ops-api');
  assert.equal(data.version, 4);
});

test('operations API rejects browser origins outside the admin allowlist', async () => {
  const request = new Request('https://ops-api.ekodi.kr/api/overview', {
    headers: { origin: 'https://example.com' }
  });
  const response = await worker.fetch(request, {});
  assert.equal(response.status, 403);
  const data = await response.json();
  assert.match(data.error, /허용되지 않은/);
});

test('operations API fails closed when D1 is absent', async () => {
  const response = await worker.fetch(new Request('https://ops-api.ekodi.kr/api/overview'), {});
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.match(data.error, /D1/);
});
