// PUBLISHING-ADMIN-001 (§12): every admin section has its own URL; the page never self-authorizes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('admin page lists seven sections with canonical, independent URLs', () => {
  const html = read('publishing/admin/index.html');
  const sections = [...html.matchAll(/data-section="([a-z]+)" href="https:\/\/ekodi\.kr\/publishing\/admin\/([a-z]*)"/g)];
  assert.deepEqual(sections.map(m => m[1]), ['overview', 'review', 'contracts', 'channels', 'settlement', 'audit', 'roles']);
  for (const [, id, slug] of sections) assert.equal(slug, id === 'overview' ? '' : id);
  assert.match(html, /noindex/);
});

test('admin script writes only role changes, uses central login with exact return and no root literals', () => {
  const js = read('publishing/admin/admin.js');
  assert.doesNotMatch(js, /(["'`])\/(?!\/)/);
  // PUBLISHING-ROLES-001: the only write is the server-checked role endpoint.
  assert.equal((js.match(/method: 'POST'/g) || []).length, 1);
  assert.equal((js.match(/api\('admin\/roles', body\)/g) || []).length, 1);
  assert.doesNotMatch(js, /method:\s*'(PUT|PATCH|DELETE)'/);
  assert.match(js, /searchParams\.set\('return_to', location\.href\)/);
  assert.doesNotMatch(js, /@ekodi|topmaster|OPERATOR_EMAILS/, 'no email-string authorization');
});

test('worker serves admin sections (deep links and refresh) with noindex, and redirects /admin to the canonical page', async () => {
  const worker = (await import(pathToFileURL(path.resolve('publishing-worker.js')).href)).default;
  const seen = [];
  const env = { ASSETS: { fetch: async r => { seen.push(new URL(r.url).pathname); return new Response('<html><head></head><body>PUBLISHING ADMIN</body></html>', { headers: { 'content-type': 'text/html' } }); } } };
  globalThis.HTMLRewriter ??= class { on() { return this; } onDocument() { return this; } transform(r) { return r; } };
  const redirect = await worker.fetch(new Request('https://publishing.internal/admin'), env);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), 'https://ekodi.kr/publishing/admin/');
  for (const p of ['/admin/', '/admin/review', '/admin/roles']) {
    const r = await worker.fetch(new Request(`https://publishing.internal${p}`), env);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
  }
  assert.ok(seen.every(p => p === '/admin/'), 'section URLs serve the single admin page');
  await worker.fetch(new Request('https://publishing.internal/admin/admin.js'), env);
  assert.equal(seen.at(-1), '/admin/admin.js', 'assets pass through');
});
