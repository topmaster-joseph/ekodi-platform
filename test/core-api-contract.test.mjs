import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE_API_PREFIX, CORE_API_VERSION, handleCoreApi } from '../core-api.js';

test('Core API publishes a stable public status contract', async () => {
  const response = await handleCoreApi(new Request(`https://api.ekodi.kr${CORE_API_PREFIX}/status`), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'ekodi-core');
  assert.equal(body.apiVersion, CORE_API_VERSION);
  assert.equal(body.architecture, 'hybrid-cloud');
  assert.deepEqual(body.canonicalHosts, {
    api: 'api.ekodi.kr',
    admin: 'admin.ekodi.kr',
    auth: 'auth.ekodi.kr',
  });
  assert.ok(body.principles.includes('provider-independence'));
  assert.ok(body.principles.includes('ai-optional'));
});

test('Core API exposes canonical roles without a database dependency', async () => {
  const response = await handleCoreApi(new Request(`https://api.ekodi.kr${CORE_API_PREFIX}/roles`), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.roles.map(item => item.role), [
    'owner','admin','manager','marketer','accountant','staff','member','viewer',
  ]);
});

test('Core API rejects unsupported methods before protected work', async () => {
  const response = await handleCoreApi(new Request(`https://api.ekodi.kr${CORE_API_PREFIX}/status`, { method: 'POST' }), {});
  assert.equal(response.status, 405);
  const body = await response.json();
  assert.equal(body.code, 'CORE_METHOD_NOT_ALLOWED');
});
