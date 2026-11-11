import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { o2oIssuedLinkResponse } from '../o2o-issued-links.js';
import { o2oHubPage } from '../o2o-hub-page.js';
import siteWorker from '../site-worker.js';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
};
const token = 'b'.repeat(48);
const valid = { ok: true, site_id: 'mission', target_path: '/ekodimission' };
const request = (code = token, method = 'GET') =>
  new Request('https://ekodi.kr/o2o/go/' + code, { method });

test('same-code concurrent QR scans share one upstream read, but never cache a completed result', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const fetcher = async (_url, options) => {
    calls += 1;
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'manual');
    assert.deepEqual(JSON.parse(options.body), { p_token: token });
    await gate;
    return Response.json(valid);
  };
  const pending = Array.from({ length: 24 }, () =>
    o2oIssuedLinkResponse(request(), env, fetcher));
  assert.equal(calls, 1, '24 concurrent reads should cause only one upstream request');
  release();
  const responses = await Promise.all(pending);
  for (const response of responses) {
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://ekodi.kr/ekodimission');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('server-timing') || '', /^o2o-resolve;dur=\d+$/);
  }
  const after = await o2oIssuedLinkResponse(request(), env, fetcher);
  assert.equal(after.status, 302);
  assert.equal(calls, 2, 'next scan must consult the database again');
});

test('revoking a link is observed on the next scan, not masked by an edge cache', async () => {
  let active = true;
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json(active ? valid : { ok: false });
  };
  assert.equal((await o2oIssuedLinkResponse(request(), env, fetcher)).status, 302);
  active = false;
  const revoked = await o2oIssuedLinkResponse(request(), env, fetcher);
  assert.equal(revoked.status, 404);
  assert.match(revoked.headers.get('cache-control') || '', /no-store/);
  assert.equal(calls, 2);
});

test('separate QR tokens are never coalesced with one another', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetcher = async (_url, options) => {
    calls += 1;
    await gate;
    return Response.json({
      ...valid,
      target_path: JSON.parse(options.body).p_token === 'c'.repeat(48)
        ? '/ekodimission?meeting=A' : '/ekodimission?meeting=B'
    });
  };
  const [a, b] = [
    o2oIssuedLinkResponse(request('c'.repeat(48)), env, fetcher),
    o2oIssuedLinkResponse(request('d'.repeat(48)), env, fetcher)
  ];
  assert.equal(calls, 2);
  release();
  const [first, second] = await Promise.all([a, b]);
  assert.notEqual(first.headers.get('location'), second.headers.get('location'));
});

test('failed network lookups are never retained and can recover safely', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary_network_failure');
    return Response.json(valid);
  };
  const first = await o2oIssuedLinkResponse(request(), env, fetcher);
  const retry = await o2oIssuedLinkResponse(request(), env, fetcher);
  assert.equal(first.status, 503);
  assert.equal(retry.status, 302);
  assert.equal(calls, 2);
});

test('HEAD never sends an error body and all unsupported methods remain fail-closed', async () => {
  const missing = await o2oIssuedLinkResponse(request(token, 'HEAD'), env,
    async () => Response.json({ ok: false }));
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), '');
  const disallowed = await o2oIssuedLinkResponse(request(token, 'POST'), env,
    async () => { throw Error('POST must not call the resolver'); });
  assert.equal(disallowed.status, 405);
  assert.equal(disallowed.headers.get('allow'), 'GET, HEAD');
});

test('anonymous QR assets get short browser caching while HTML and token responses stay no-store', async () => {
  const workerEnv = {
    ASSETS: { fetch: async () => new Response('asset', {
      headers: { 'content-type': 'text/javascript; charset=utf-8' }
    }) }
  };
  for (const path of ['/o2o-hub-client.js', '/o2o-link-core.js',
    '/o2o-hub.css', '/o2o-qr-vendor.js']) {
    const response = await siteWorker.fetch(new Request('https://ekodi.kr' + path), workerEnv);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('cache-control') || '', /max-age=120/, path);
    assert.match(response.headers.get('cache-control') || '', /stale-while-revalidate=30/, path);
  }
  const head = o2oHubPage(new Request('https://ekodi.kr/o2o'));
  assert.equal(head.headers.get('cache-control'), 'no-store');
  const tokenResponse = await o2oIssuedLinkResponse(request(), env,
    async () => Response.json(valid));
  assert.equal(tokenResponse.headers.get('cache-control'), 'private, no-store');
});

test('preload and edit debounce contracts reduce redundant work without background tracking', async () => {
  const html = await o2oHubPage(new Request('https://ekodi.kr/o2o')).text();
  assert.match(html, /rel="preload" href="\/o2o-qr-vendor\.js"/);
  assert.match(html, /rel="modulepreload" href="\/o2o-hub-client\.js"/);
  const source = readFileSync(new URL('../o2o-hub-client.js', import.meta.url), 'utf8');
  assert.match(source, /lastRenderedUrl/);
  assert.match(source, /targetInput\.addEventListener\('input', scheduleRender\)/);
  assert.match(source, /window\.setTimeout\(/);
  assert.match(source, /width: 256, height: 256/);
  assert.match(source, /open\.removeAttribute\('href'\)/);
  assert.doesNotMatch(source, /\bfetch\s*\(|localStorage|sessionStorage|point.*award/i);
});
