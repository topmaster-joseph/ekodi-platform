import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { O2O_SITES, resolveO2OTarget, formatO2OShareText } from '../o2o-link-core.js';
import { o2oHubPage } from '../o2o-hub-page.js';
import siteWorker from '../site-worker.js';

test('six pilot site entrypoints share one canonical link contract', () => {
  assert.equal(O2O_SITES.length, 6);
  for (const site of O2O_SITES) {
    const target = resolveO2OTarget({ siteId: site.id });
    assert.equal(target.url, 'https://ekodi.kr' + site.root);
  }
});

test('Mission Saturday link preserves date and fragment without personal data', () => {
  const target = resolveO2OTarget({
    siteId: 'mission', targetPath: '/ekodimission?meeting=2026-11-07#saturday'
  });
  assert.equal(target.url, 'https://ekodi.kr/ekodimission?meeting=2026-11-07#saturday');
  assert.equal(formatO2OShareText({
    siteId: 'mission', targetPath: target.path, activityName: '토요모임'
  }), '에코디선교회 토요모임 신청하기\n' + target.url);
});

test('external hosts, dangerous schemes and privileged surfaces are rejected', () => {
  const cases = [
    'https://evil.example/ekodimission', '//evil.example/ekodimission',
    'javascript:alert(1)', '/admin', '/cgma', '/ekodimission/admin',
    '/ekodimission/api/participants', '/ekodimission/%61dmin',
    '/ekodimission/%2fadmin', '/ekodimission?access_token=secret',
    '/ekodimission?email=foo@example.org', '/ekodimission?return_to=/admin',
    '/ekodimission?q=sensitive', '/ekodimission\\@evil.test/',
    'https://ekodi.kr.evil.test/ekodimission'
  ];
  for (const targetPath of cases) {
    assert.throws(() => resolveO2OTarget({ siteId: 'mission', targetPath }), TypeError, targetPath);
  }
  assert.throws(() => resolveO2OTarget({ siteId: 'invalid' }), TypeError);
});

test('anonymous public screen does not record attendance, payment or points', async () => {
  const response = o2oHubPage(new Request('https://ekodi.kr/o2o'));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /QR 만들기/);
  assert.match(html, /자동으로 확정되지 않습니다/);
  assert.match(html, /o2o-hub-client.js/);
  assert.match(html, /o2o-qr-vendor.js/);
  const client = readFileSync(new URL('../o2o-hub-client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /\/api\/|fetch\s*\(|localStorage|sessionStorage|point.*award|check.?in/i);
});

test('public O2O route is GET/HEAD-only and fail-closed, with noindex headers', async () => {
  // Node does not expose Cloudflare's HTMLRewriter; preserve the response for route-contract assertions.
  const nativeRewriter = globalThis.HTMLRewriter;
  globalThis.HTMLRewriter = class { on() { return this; } transform(response) { return response; } };
  try {
  const env = { ASSETS: { fetch: () => { throw new Error('Unexpected asset request'); } } };
  const response = await siteWorker.fetch(new Request('https://ekodi.kr/o2o'), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') || '', /script-src 'self'/);
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
  const html = await response.text();
  assert.match(html, /현장과 온라인/);
  const head = await siteWorker.fetch(new Request('https://ekodi.kr/o2o', { method: 'HEAD' }), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const post = await siteWorker.fetch(new Request('https://ekodi.kr/o2o', { method: 'POST' }), env);
  assert.equal(post.status, 405);
  assert.match(post.headers.get('allow') || '', /GET/);
  } finally { globalThis.HTMLRewriter = nativeRewriter; }
});

test('link engine and QR assets are included in the shared release build', () => {
  const source = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../site-worker.js', import.meta.url), 'utf8');
  for (const asset of ['o2o-hub-client.js', 'o2o-link-core.js', 'o2o-hub.css', 'o2o-qr-vendor.js'])
    assert.ok(source.includes(asset) || (asset === 'o2o-qr-vendor.js' && source.includes(asset)), asset);
  assert.match(worker, /o2oHubPage/);
  assert.match(worker, /o2o-public-qr-hub/);
});
