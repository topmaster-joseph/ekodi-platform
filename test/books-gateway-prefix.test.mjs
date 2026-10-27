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
