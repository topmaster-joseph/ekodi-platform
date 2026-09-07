import test from 'node:test';
import assert from 'node:assert/strict';
import { adminAuthorityForRole } from '../ekodi-authorization.js';
import { authorizeAdminSessionCapability } from '../admin-session-fastpath.js';
import {
  EKODI_REQUIRED_CAPABILITY_HEADER,
  requiredAdminCapability,
  withAdminRouteCapability,
} from '../admin-route-authorization.js';

test('admin control routes resolve to one central capability policy', () => {
  assert.equal(requiredAdminCapability('/api/control/system-health', 'GET'), 'observe:read');
  assert.equal(requiredAdminCapability('/api/control/ai/assist', 'POST'), 'ai:operate');
  assert.equal(requiredAdminCapability('/api/control/secrets/rotate', 'POST'), 'secrets:write');
  assert.equal(requiredAdminCapability('/api/control/devices/abc', 'PATCH'), 'service:operate');
  assert.equal(requiredAdminCapability('/api/user-ai/profile', 'PATCH'), '');
});

test('router overwrites a spoofed capability with the route requirement', () => {
  const request = new Request('https://api.ekodi.kr/api/control/secrets', {
    method:'POST',
    headers:{ [EKODI_REQUIRED_CAPABILITY_HEADER]:'service:read' },
  });
  const routed = withAdminRouteCapability(request);
  assert.equal(routed.headers.get(EKODI_REQUIRED_CAPABILITY_HEADER), 'secrets:write');
});
test('session capability decisions preserve viewer read-only and operator operations', () => {
  const viewer = { authority:adminAuthorityForRole('viewer') };
  const operator = { authority:adminAuthorityForRole('operator') };
  assert.equal(authorizeAdminSessionCapability(viewer, 'service:read').allowed, true);
  assert.equal(authorizeAdminSessionCapability(viewer, 'service:operate').code, 'CAPABILITY_FORBIDDEN');
  assert.equal(authorizeAdminSessionCapability(operator, 'service:operate').allowed, true);
});

test('sensitive route decisions still require active elevation', () => {
  const normal = { authority:adminAuthorityForRole('super_admin') };
  const elevated = { authority:adminAuthorityForRole('super_admin', {
    elevated:true,
    elevatedUntil:'2099-01-01T00:00:00.000Z',
  }) };
  assert.equal(authorizeAdminSessionCapability(normal, 'secrets:write').code, 'ELEVATION_REQUIRED');
  assert.equal(authorizeAdminSessionCapability(elevated, 'secrets:write').allowed, true);
});

test('explicit server-to-server session capability request is preserved', () => {
  const request = new Request('https://api.ekodi.kr/api/session', {
    headers:{ [EKODI_REQUIRED_CAPABILITY_HEADER]:'service:operate' },
  });
  const routed = withAdminRouteCapability(request);
  assert.equal(routed.headers.get(EKODI_REQUIRED_CAPABILITY_HEADER), 'service:operate');
});

import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mission control stamps policy and legacy session checks consume the same authority', async () => {
  const [entry, authCore, fast] = await Promise.all([
    read('mission-control-entry-worker.js'),
    read('auth-worker-core.js'),
    read('admin-session-fastpath.js'),
  ]);
  assert.match(entry, /withAdminRouteCapability\(request\)/);
  assert.match(authCore, /resolveAdminSessionAuthority\(request, env\)/);
  assert.match(authCore, /EKODI_REQUIRED_CAPABILITY_HEADER/);
  assert.match(fast, /authorizeAdminSessionCapability/);
  assert.doesNotMatch(authCore, /authenticated: true, email: admin\.email, role: admin\.role, expiresAt: admin\.expires_at/);
});
