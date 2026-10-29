import test from 'node:test';
import assert from 'node:assert/strict';
import biz, { EKODIBIZ_NAVER_FILE_PATH, EKODIBIZ_NAVER_FILE_BODY } from '../biz-legacy-redirect.js';
import church, { EKODICHURCH_NAVER_FILE_PATH } from '../legacy-redirect.js';

const CHURCH_BODY = 'naver-site-verification: naver85321326d5553a0caa3a944158fc2969.html';

test('ekodibiz.kr serves exact owner-issued Naver file without redirect, including HEAD', async () => {
  assert.equal(EKODIBIZ_NAVER_FILE_PATH, '/naverf72bebc155107dcad735d8178146679f.html');
  const res = await biz.fetch(new Request('https://ekodibiz.kr' + EKODIBIZ_NAVER_FILE_PATH));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('location'), null);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(await res.text(), EKODIBIZ_NAVER_FILE_BODY);
  const head = await biz.fetch(new Request('https://ekodibiz.kr' + EKODIBIZ_NAVER_FILE_PATH, { method:'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('existing biz apex and www redirects remain canonical and file is not exposed on www', async () => {
  for (const host of ['ekodibiz.kr', 'www.ekodibiz.kr']) {
    const res = await biz.fetch(new Request('https://' + host + '/'));
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://ekodi.kr/ekodibiz');
  }
  const wwwFile = await biz.fetch(new Request('https://www.ekodibiz.kr' + EKODIBIZ_NAVER_FILE_PATH));
  assert.equal(wwwFile.status, 301);
  assert.equal(wwwFile.headers.get('location'), 'https://ekodi.kr/ekodibiz' + EKODIBIZ_NAVER_FILE_PATH);
  const wrong = await biz.fetch(new Request('https://ekodibiz.kr' + EKODIBIZ_NAVER_FILE_PATH + '.bak'));
  assert.equal(wrong.status, 301);
  const post = await biz.fetch(new Request('https://ekodibiz.kr' + EKODIBIZ_NAVER_FILE_PATH, {method:'POST'}));
  assert.equal(post.status, 301);
  const alien = await biz.fetch(new Request('https://other.invalid' + EKODIBIZ_NAVER_FILE_PATH));
  assert.equal(alien.status, 404);
});

test('ekodichurch.kr serves previously registered Naver HTML ownership file, before redirect', async () => {
  assert.equal(EKODICHURCH_NAVER_FILE_PATH, '/naver85321326d5553a0caa3a944158fc2969.html');
  const res = await church.fetch(new Request('https://ekodichurch.kr' + EKODICHURCH_NAVER_FILE_PATH));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('location'), null);
  assert.equal(await res.text(), CHURCH_BODY);
  const head = await church.fetch(new Request('https://ekodichurch.kr' + EKODICHURCH_NAVER_FILE_PATH, {method:'HEAD'}));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const home = await church.fetch(new Request('https://ekodichurch.kr/'));
  assert.equal(home.status, 301);
  assert.equal(home.headers.get('location'), 'https://ekodi.kr/ekodichurch/');
});

test('unrelated domain remains isolated from church and biz proof paths', async () => {
  const a = await biz.fetch(new Request('https://ekodichurch.kr' + EKODIBIZ_NAVER_FILE_PATH));
  assert.equal(a.status, 404);
  const b = await church.fetch(new Request('https://invalid.example' + EKODICHURCH_NAVER_FILE_PATH));
  assert.equal(b.status, 200); // Existing legacy verification helper is path-based.
});
