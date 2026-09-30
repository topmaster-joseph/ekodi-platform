import test from 'node:test';
import assert from 'node:assert/strict';
import { getCoreOrganization, getCoreStatus } from '../core-client.js';

test('Core client uses the versioned server-side API and forwards auth', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), authorization: options.headers.get('authorization') };
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const request = new Request('https://service.ekodi.kr', { headers: { authorization: 'Bearer test-token' } });
    const body = await getCoreStatus(request, { CORE_API_ORIGIN: 'https://api-staging.ekodi.kr/' });
    assert.equal(body.ok, true);
    assert.equal(captured.url, 'https://api-staging.ekodi.kr/api/core/v1/status');
    assert.equal(captured.authorization, 'Bearer test-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Core client rejects malformed organization slugs before a network request', async () => {
  assert.throws(() => getCoreOrganization(new Request('https://service.ekodi.kr'), {}, '../other'), /Invalid EKODI Core organization slug/);
});
