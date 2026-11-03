import test from 'node:test';
import assert from 'node:assert/strict';
import legacy, { EKODIBIZ_NAVER_FILE_PATH, EKODIBIZ_NAVER_FILE_BODY } from '../biz-legacy-redirect.js';

for (const host of ['ekodibiz.kr', 'www.ekodibiz.kr']) {
  test(host + ': historical sitemap points at the canonical sitemap, never the service path', async () => {
    for (const method of ['GET', 'HEAD']) {
      const response = await legacy.fetch(new Request('https://' + host + '/sitemap.xml', { method }));
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), 'https://ekodi.kr/sitemap.xml');
    }
    assert.equal((await legacy.fetch(new Request('https://' + host + '/'))).headers.get('location'), 'https://ekodi.kr/ekodibiz');
  });

  test(host + ': robots.txt declares canonical sitemap and supports HEAD', async () => {
    const url = 'https://' + host + '/robots.txt';
    const response = await legacy.fetch(new Request(url));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/plain/);
    assert.equal(response.headers.get('location'), null);
    assert.equal(await response.text(), 'User-agent: *\nAllow: /\nSitemap: https://ekodi.kr/sitemap.xml\n');
    const head = await legacy.fetch(new Request(url, {method:'HEAD'}));
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });
}

test('Naver ownership proof remains on the legacy apex only', async () => {
  const a = await legacy.fetch(new Request('https://ekodibiz.kr' + EKODIBIZ_NAVER_FILE_PATH));
  assert.equal(a.status, 200);
  assert.equal(await a.text(), EKODIBIZ_NAVER_FILE_BODY);
  const b = await legacy.fetch(new Request('https://www.ekodibiz.kr' + EKODIBIZ_NAVER_FILE_PATH));
  assert.equal(b.status, 301);
});

test('unrelated hosts remain denied', async () => {
  for (const path of ['/sitemap.xml', '/robots.txt', '/']) {
    assert.equal((await legacy.fetch(new Request('https://other.invalid' + path))).status, 404);
  }
});
