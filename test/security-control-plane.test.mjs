import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../security-control-plane-worker.js';

test('security control plane is disabled by default', async () => {
  const response = await worker.fetch(new Request('https://security.ekodi.kr/'), {});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
  const body = await response.json();
  assert.equal(body.code, 'SECURITY_CONTROL_PLANE_DISABLED');
});

test('enabled pre-activation exposes only minimal health', async () => {
  const env = { SECURITY_CONTROL_PLANE_ENABLED: 'true' };
  const health = await worker.fetch(new Request('https://security.ekodi.kr/healthz'), env);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.privilegedUi, false);

  const privileged = await worker.fetch(new Request('https://security.ekodi.kr/'), env);
  assert.equal(privileged.status, 403);
  const body = await privileged.json();
  assert.equal(body.code, 'ADMIN_AUTH_NOT_WIRED');
});

test('mutating methods are rejected', async () => {
  const response = await worker.fetch(new Request('https://security.ekodi.kr/', { method: 'POST' }), {
    SECURITY_CONTROL_PLANE_ENABLED: 'true'
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
