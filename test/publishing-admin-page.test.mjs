// PUBLISHING-ADMIN-001 (§12): every admin section has its own URL; the page never self-authorizes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('admin page lists eight sections with canonical, independent URLs', () => {
  const html = read('publishing/admin/index.html');
  const sections = [...html.matchAll(/data-section="([a-z]+)" href="https:\/\/ekodi\.kr\/publishing\/admin\/([a-z]*)"/g)];
  assert.deepEqual(sections.map(m => m[1]), ['overview', 'review', 'ai', 'contracts', 'channels', 'settlement', 'audit', 'roles']);
  for (const [, id, slug] of sections) assert.equal(slug, id === 'overview' ? '' : id);
  assert.match(html, /noindex/);
});

test('admin script writes only role changes and AI-manuscript review, uses central login with exact return and no root literals', () => {
  const js = read('publishing/admin/admin.js');
  assert.doesNotMatch(js, /(["'`])\/(?!\/)/);
  // PUBLISHING-ROLES-001 + PUBLISHING-AI-WEEKLY-001: writes go only to server-checked role and AI-review endpoints.
  const writes = [...js.matchAll(/api\(([`'])(admin\/[^`']+)\1, (?!\))/g)].map(m => m[2]);
  assert.deepEqual([...new Set(writes)].sort(), ['admin/ai-books/${id}/approve', 'admin/ai-books/${id}/chapters/${c.number}', 'admin/ai-books/${id}/publish', 'admin/roles'].sort());
  assert.doesNotMatch(js, /method:\s*'(PATCH|DELETE)'/);
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

test('admin page: Korean action names, old #section links, AI review card and its own dark theme', async () => {
  const { readFile } = await import('node:fs/promises');
  const [js, css, html] = await Promise.all(['admin.js', 'admin.css', 'index.html'].map(f => readFile(new URL('../publishing/admin/' + f, import.meta.url), 'utf8')));
  for (const code of ['ai_chapter_quality_polished', 'ai_book_author_reviewed', 'role_bootstrap_granted', 'create']) assert.match(js, new RegExp(code + ": '"));
  assert.doesNotMatch(js, /\(\$\{a\.action\}\)/, 'raw action codes are not shown');
  assert.match(js, /location\.hash/); assert.match(js, /hashchange/);
  assert.match(js, /stat\('AI 원고 감수 대기', s\.aiBooks\?\.author_review \|\| 0, 'ai'\)/);
  assert.match(html, /<meta name="color-scheme" content="dark">/);
  assert.match(css, /:root\{color-scheme:dark\}/); assert.match(css, /\.padmin h1,\.padmin h2,\.padmin-stat strong\{color:#f6efe0\}/); assert.doesNotMatch(css, /prefers-color-scheme/);
});

test('publishing login links name the publishing site so the central login returns to the same page', async () => {
  const { readFile } = await import('node:fs/promises');
  const files = ['publishing/admin/admin.js', 'publishing/workspace.js', 'publishing/studio/app.js'];
  for (const f of files) {
    const src = await readFile(new URL('../' + f, import.meta.url), 'utf8');
    assert.match(src, /searchParams\.set\(\s*'site'\s*,\s*'publishing'\s*\)/, f);
  }
  const auth = await readFile(new URL('../auth-site/client-auth.js', import.meta.url), 'utf8');
  assert.match(auth, /publishing:\{name:'Publishing',returnTo:'https:\/\/ekodi\.kr\/publishing\/'/, 'login has a publishing return scope covering /publishing/admin/*');
});

test('the role line is filled on every tab, not only the overview', async () => {
  const { readFile } = await import('node:fs/promises');
  const js = await readFile(new URL('../publishing/admin/admin.js', import.meta.url), 'utf8');
  assert.match(js, /show\(sectionFromPath\(\)\);\n[^\n]*\n  getSummary\(\)\.catch\(\(\) => \{\}\);/);
});

test('manuscript manage page shows Korean labels instead of internal codes', async () => {
  const { readFile } = await import('node:fs/promises');
  const [js, html] = await Promise.all(['app.js', 'index.html'].map(f => readFile(new URL('../publishing/human/manage/' + f, import.meta.url), 'utf8')));
  assert.match(js, /PUBLISHING_RELEASE_NOT_CONFIGURED:'서점 판매 연결이 아직 설정되지 않았습니다/);
  assert.match(js, /'판매 불가: '\+blockerText\(info\.blocker\)/);
  assert.match(js, /fieldLabel\(p\.fieldId\)/);
  assert.doesNotMatch(js, /'원고 버전 '\+p\.editionId/);
  assert.match(html, /<label class="check"><input type="checkbox" name="consent"/);
  assert.match(html, /원고 확인 코드 \(자동\)/);
});
