import test from 'node:test';
import assert from 'node:assert/strict';
import { applyApiSecurityHeaders, enforceEdgeSecurity, SECURITY_EDGE_CONSTANTS } from '../security-edge.js';

function limiter(success = true) {
  return { limit: async () => ({ success }) };
}

test('API security headers block framing and downgrade exposure', () => {
  const response = applyApiSecurityHeaders(new Response('{}', { headers: { 'content-type': 'application/json' } }));
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('strict-transport-security') || '', /max-age=31536000/);
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'none'/);
  assert.match(response.headers.get('permissions-policy') || '', /camera=\(\)/);
});

test('public Google login is rate limited before auth processing', async () => {
  const request = new Request('https://api.ekodi.kr/api/google/login', {
    method: 'POST',
    headers: { 'cf-connecting-ip': '203.0.113.10', 'content-type': 'application/json' },
    body: '{}',
  });
  const response = await enforceEdgeSecurity(request, { AUTH_RATE_LIMITER: limiter(false) });
  assert.equal(response?.status, 429);
  assert.equal(response?.headers.get('retry-after'), '60');
  const data = await response.json();
  assert.equal(data.code, 'AUTH_RATE_LIMITED');
});

test('sensitive mutations are rate limited by authenticated identity', async () => {
  const request = new Request('https://api.ekodi.kr/api/control/ai/actions', {
    method: 'POST',
    headers: { authorization: `Bearer ${'a'.repeat(64)}`, 'content-type': 'application/json' },
    body: '{}',
  });
  const response = await enforceEdgeSecurity(request, { SENSITIVE_RATE_LIMITER: limiter(false) });
  assert.equal(response?.status, 429);
  assert.equal((await response.json()).code, 'SENSITIVE_ACTION_RATE_LIMITED');
});

test('oversized mutation requests are rejected before application code', async () => {
  const request = new Request('https://api.ekodi.kr/api/control/ai/actions', {
    method: 'POST',
    headers: { 'content-length': String(SECURITY_EDGE_CONSTANTS.MAX_MUTATION_BODY_BYTES + 1) },
  });
  const response = await enforceEdgeSecurity(request, {});
  assert.equal(response?.status, 413);
  assert.equal((await response.json()).code, 'REQUEST_BODY_TOO_LARGE');
});

test('TRACE and CONNECT are blocked at the edge', async () => {
  const request = { method: 'TRACE', url: 'https://api.ekodi.kr/api/status', headers: new Headers() };
  const response = await enforceEdgeSecurity(request, {});
  assert.equal(response?.status, 405);
  assert.equal((await response.json()).code, 'METHOD_BLOCKED');
});
