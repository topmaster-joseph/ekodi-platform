// BOOKS-GATEWAY-PREFIX-001: ekodi.kr/books 공용 게이트웨이는 JS의 '/…' 문자열 앞에 /books를 붙인다.
// 서점 결제·내 서재·구글 로그인 스크립트는 그 재작성을 거쳐도 한 글자도 바뀌지 않아야 한다
// (바뀌면 /books/api/commerce/books/library, /books/functions/v1/... 같은 깨진 주소가 된다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

const FILES = ['books/buy/commerce-client.js', 'books/buy/buy.js', 'books/buy/library.js', 'books/buy/result.js'];

async function throughGateway(path, body, type = 'application/javascript; charset=utf-8') {
  const env = { BOOKS: { fetch: async () => new Response(body, { headers: { 'content-type': type } }) } };
  const res = await routeCanonicalSurface(new Request(`https://ekodi.kr/books${path}`), env, { legacyFetch: async () => new Response('legacy', { status: 599 }) });
  assert.ok(res, `gateway must route /books${path}`);
  return res.text();
}

for (const file of FILES) {
  test(`${file} survives the /books gateway rewrite unchanged`, async () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const served = await throughGateway(`/${file.replace(/^books\//, '')}`, source);
    assert.equal(served, source);
  });
}

test('commerce API paths resolve under the /books mount exactly once', async () => {
  const source = readFileSync(new URL('../books/buy/commerce-client.js', import.meta.url), 'utf8');
  assert.match(source, /`\$\{BASE\}\/api\/commerce\/\$\{rel\}`/);
  for (const file of FILES.slice(1)) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /\.api\(\s*["'`]\//, `${file}: C.api() paths must be relative (no leading slash)`);
  }
});

test('cover/link paths get the /books mount exactly once (gateway may already have added it)', async () => {
  const vm = await import('node:vm');
  const source = readFileSync(new URL('../books/buy/commerce-client.js', import.meta.url), 'utf8');
  const load = pathname => { const ctx = { window: {}, location: { pathname }, localStorage: { getItem: () => null }, console }; vm.runInNewContext(source, ctx); return ctx.window.EkodiBooksCommerce; };
  const mounted = load('/books/buy/');
  assert.equal(mounted.under('/assets/a.svg'), '/books/assets/a.svg');
  assert.equal(mounted.under('/books/assets/a.svg'), '/books/assets/a.svg');
  assert.equal(mounted.under('https://ekodi.kr/x.png'), 'https://ekodi.kr/x.png');
  const direct = load('/buy/');
  assert.equal(direct.under('/assets/a.svg'), '/assets/a.svg');
});

// 2026-10-31: book purchase sign-in offers the central EKODI login (any login path),
// returning to the exact purchase page; the central session is already accepted.
test('books sign-in offers the central EKODI login and returns to the same page', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../books/buy/commerce-client.js', import.meta.url), 'utf8');
  if (!/new URL\('https:\/\/ekodi\.kr\/auth\/'\)/.test(src)) throw new Error('central auth entry missing');
  if (!/searchParams\.set\('return_to', location\.href\)/.test(src)) throw new Error('exact return missing');
  if (!/host\.append\(centralLoginLink\(\)\)/.test(src)) throw new Error('link not mounted');
  if (!/CENTRAL_KEY = 'sb-renzehysxirjilvdxacv-auth-token'/.test(src)) throw new Error('central session not read');
});
