import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dispatchInsurancePrivatePreview as dispatch } from '../sites/ekodi-insurance/api/canonical-gateway-dispatch-preview.mjs';

const CANONICAL = 'https://ekodi.kr/api/insurance';
const client = (path, method = 'GET', opts = {}) => new Request(CANONICAL + path, {
  method, headers: {
    origin: 'https://ekodi.kr', 'content-type': 'application/json',
    'cookie': 'ekodi-secret-cookie', authorization: 'Bearer NOT-ALLOWED',
    'x-ekodi-insurance-internal-token': 'NOT-ALLOWED',
    'cf-connecting-ip': '9.8.7.6', 'x-ekodi-actor': 'fake-admin',
    ...(opts.headers || {})
  }, ...(method === 'POST' ? { body: opts.body || '{}' } : {})
});
const visitor = { edgeVerified: true, ip: '203.0.113.16', userAgent: 'synthetic-test-agent' };
function binding(result = { ok: true }, status = 200, contentType = 'application/json') {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      calls.push(request);
      return new Response(JSON.stringify(result), {
        status, headers: { 'content-type': contentType, 'set-cookie': 'never-forward-me',
          'access-control-allow-origin': '*', 'cache-control': 'public, max-age=600' }
      });
    }
  };
}
const asJson = async response => response.json();

test('GET canary uses private binding exact route and strips client cookies, credentials and response headers', async () => {
  const service = binding({ ok: true });
  const response = await dispatch(client('/health'), { binding: service });
  assert.equal(response.status, 200);
  assert.deepEqual(await asJson(response), { ok: true });
  assert.equal(service.calls.length, 1);
  const request = service.calls[0];
  assert.equal(new URL(request.url).pathname, '/health');
  assert.equal(new URL(request.url).hostname, 'insurance.internal.invalid');
  assert.equal(request.headers.get('origin'), 'https://ekodi.kr');
  for (const name of [
    'cookie', 'authorization', 'x-ekodi-insurance-internal-token',
    'cf-connecting-ip', 'x-ekodi-actor'
  ]) assert.equal(request.headers.get(name), null, name + ' must not travel');
  for (const name of ['set-cookie', 'access-control-allow-origin']) {
    assert.equal(response.headers.get(name), null, name + ' must not travel');
  }
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('POST requires separately verified visitor identity and forwards no untrusted caller identity', async () => {
  const service = binding({ consultation: { id: 'con_test' }, accessToken: 'synthetic-revoke' }, 201);
  const call = client('/consultations', 'POST', { body: JSON.stringify({
    name: 'synthetic', contact: '010-0000-0000', shareConsent: true
  }) });
  const blocked = await dispatch(call.clone(), { binding: service });
  assert.equal(blocked.status, 503);
  assert.equal((await asJson(blocked)).error, 'trusted_client_identity_required');
  assert.equal(service.calls.length, 0);
  const spoof = await dispatch(call.clone(), {
    binding: service, verifiedVisitor: { edgeVerified: false, ip: '9.8.7.6' }
  });
  assert.equal(spoof.status, 503);
  assert.equal(service.calls.length, 0);
  const response = await dispatch(call, { binding: service, verifiedVisitor: visitor });
  assert.equal(response.status, 201);
  const req = service.calls[0];
  assert.equal(new URL(req.url).pathname, '/api/consultations');
  assert.equal(req.headers.get('cf-connecting-ip'), visitor.ip);
  assert.equal(req.headers.get('user-agent'), visitor.userAgent);
  for (const name of ['cookie', 'authorization', 'x-ekodi-actor', 'x-ekodi-insurance-internal-token']) {
    assert.equal(req.headers.get(name), null, name);
  }
  const forwarded = await req.json();
  assert.equal(forwarded.shareConsent, true);
  assert.equal(forwarded.contact, '010-0000-0000');
});

test('rejects oversized streaming body without upstream call even without declared Content-Length', async () => {
  const service = binding();
  let canceled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(3000).fill(120)); },
    cancel() { canceled = true; }
  });
  const req = new Request(CANONICAL + '/consultations/con_01ab-7c/revoke', {
    method: 'POST',
    headers: { origin: 'https://ekodi.kr', 'content-type': 'application/json' },
    body: stream, duplex: 'half'
  });
  const response = await dispatch(req, { binding: service, verifiedVisitor: visitor });
  assert.equal(response.status, 413);
  assert.equal((await asJson(response)).error, 'request_body_too_large');
  assert.equal(service.calls.length, 0);
  assert.equal(canceled, true);
});

test('fail-closed POST body validity and forged origin, with no accidental service call', async () => {
  const service = binding();
  for (const body of ['', 'null', '[]', '{bad json']) {
    const response = await dispatch(client('/chat', 'POST', { body: body || ' ' }), {
      binding: service, verifiedVisitor: visitor
    });
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  const crossOrigin = await dispatch(client('/chat', 'POST', { headers: { origin: 'https://other.invalid' } }), {
    binding: service, verifiedVisitor: visitor
  });
  assert.equal(crossOrigin.status, 403);
  const internalRoute = await dispatch(client('/internal/consultations'), { binding: service });
  assert.equal(internalRoute.status, 404);
  assert.equal(service.calls.length, 0);
});

test('quota circuit, absent binding, exceptions, redirects, non-JSON and oversized responses fail closed', async () => {
  const x = client('/health');
  const service = binding();
  assert.equal((await dispatch(x.clone(), { binding: service, quotaCircuitOpen: true })).status, 429);
  assert.equal(service.calls.length, 0);
  assert.equal((await dispatch(x.clone())).status, 503);
  assert.equal((await dispatch(x.clone(), { binding: { fetch() { throw new Error('do not leak') } } })).status, 503);
  const redir = { async fetch() {
    return new Response(null, { status: 302, headers: { location: 'https://outside.invalid' } });
  }};
  assert.equal((await dispatch(x.clone(), { binding: redir })).status, 502);
  const broken = binding({ status: 'bad' }, 200, 'text/plain');
  assert.equal((await dispatch(x.clone(), { binding: broken })).status, 502);
  const tooBig = binding({ data: 'x'.repeat(512 * 1024) });
  assert.equal((await dispatch(x.clone(), { binding: tooBig })).status, 502);
  const throttled = binding({ error: 'old quota' }, 429);
  const response = await dispatch(x, { binding: throttled });
  assert.equal(response.status, 429);
  assert.deepEqual(await asJson(response), { error: 'quota_circuit_open' });
});

test('the preview dispatcher has no live route import, internal-token or unguarded network fetch', async () => {
  const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
  const [moduleSource, router, siteWorker, backend, build] = await Promise.all([
    read('sites/ekodi-insurance/api/canonical-gateway-dispatch-preview.mjs'),
    read('insurance-public-route.js'),
    read('site-worker.js'),
    read('sites/ekodi-insurance/api/worker.js'),
    read('scripts/build.mjs')
  ]);
  assert.equal([router,siteWorker,backend,build].every(s=>!s.includes('canonical-gateway-dispatch-preview')),true);
  assert.match(moduleSource, /binding\.fetch\(upstreamRequest\)/);
  assert.doesNotMatch(moduleSource, /\bglobalThis\.fetch\b|\bprocess\.env\b|\bconsole\.(?:log|error)\b/);
  assert.doesNotMatch(moduleSource, /headers\.set\('authorization'|headers\.set\('cookie'|headers\.set\('x-ekodi-insurance-internal-token'/);
});
