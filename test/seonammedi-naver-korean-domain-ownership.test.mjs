import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { SEONAMMEDI_NAVER_FILE_PATH, SEONAMMEDI_NAVER_FILE_BODY } from '../seonammedi-domain-gateway.js';
import { verificationMetaTags } from '../search-engine-verification.js';

const IDN = 'xn--3e0b8b58jw4co4mnpll3k.kr';
const naverCode = '24ca4ba6e96faad3747dd25f3df3b1748384771a';

function noUpstream() {
  const original = globalThis.fetch;
  globalThis.fetch = async request => { throw new Error('unexpected upstream request ' + request.url); };
  return () => { globalThis.fetch = original; };
}

test('Korean IDN serves Naver owner-issued HTML file at exact root, without any upstream or login', async () => {
  const restore = noUpstream();
  try {
    assert.equal(SEONAMMEDI_NAVER_FILE_PATH, '/naver2d4965e691c1cb3786d93044f2ad2f01.html');
    const get = await worker.fetch(new Request('https://' + IDN + SEONAMMEDI_NAVER_FILE_PATH));
    assert.equal(get.status, 200);
    assert.match(get.headers.get('content-type'), /text\/html/);
    assert.equal(get.headers.get('x-ekodi-route'), 'seonammedi-naver-ownership');
    assert.equal(await get.text(), SEONAMMEDI_NAVER_FILE_BODY);
    const head = await worker.fetch(new Request('https://' + IDN + SEONAMMEDI_NAVER_FILE_PATH, { method: 'HEAD' }));
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally { restore(); }
});

test('Naver Korean IDN code is distinct from the English customer domain and other account sites', () => {
  assert.equal(verificationMetaTags(IDN), '<meta name="naver-site-verification" content="' + naverCode + '">');
  assert.ok(!verificationMetaTags('seonammedi.kr').includes(naverCode));
  assert.ok(!verificationMetaTags('ekodi.kr').includes(naverCode));
  assert.equal(verificationMetaTags('unknown.example'), '');
});

test('Naver verification meta is injected into Korean HTML response only', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async request => {
    assert.equal(new URL(request.url).hostname, 'ekodi.kr');
    return new Response('<!doctype html><html><head><title>Public</title></head><body>OK</body></html>', {
      status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  };
  try {
    const korean = await worker.fetch(new Request('https://' + IDN + '/'));
    assert.equal(korean.status, 200);
    const html = await korean.text();
    assert.ok(html.includes('<head><meta name="naver-site-verification" content="' + naverCode + '">'));
    const english = await worker.fetch(new Request('https://seonammedi.kr/'));
    assert.equal(english.status, 200);
    assert.ok(!(await english.text()).includes(naverCode));
  } finally { globalThis.fetch = original; }
});

test('Naver file is exact-host and exact-path scoped; sibling domains still proxy normally', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async request => {
    seen.push(new URL(request.url).pathname);
    return new Response('upstream-404', { status: 404, headers: { 'content-type': 'text/plain' } });
  };
  try {
    const english = await worker.fetch(new Request('https://seonammedi.kr' + SEONAMMEDI_NAVER_FILE_PATH));
    assert.equal(english.status, 404);
    const suffix = await worker.fetch(new Request('https://' + IDN + SEONAMMEDI_NAVER_FILE_PATH + '.bak'));
    assert.equal(suffix.status, 404);
    const post = await worker.fetch(new Request('https://' + IDN + SEONAMMEDI_NAVER_FILE_PATH, { method: 'POST' }));
    assert.equal(post.status, 404);
    const unknown = await worker.fetch(new Request('https://other.example' + SEONAMMEDI_NAVER_FILE_PATH));
    assert.equal(unknown.status, 404);
    assert.deepEqual(seen, [
      '/seonammedi' + SEONAMMEDI_NAVER_FILE_PATH,
      '/seonammedi' + SEONAMMEDI_NAVER_FILE_PATH + '.bak',
      '/seonammedi' + SEONAMMEDI_NAVER_FILE_PATH,
    ]);
  } finally { globalThis.fetch = original; }
});
