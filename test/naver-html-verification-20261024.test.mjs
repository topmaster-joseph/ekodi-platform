import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchVerificationFileResponse, SEARCH_VERIFICATION_FILES } from '../search-engine-verification.js';

const FILE = '/naverf72bebc155107dcad735d8178146679f.html';

test('Naver HTML ownership file is served verbatim at the root path', async () => {
  const res = searchVerificationFileResponse(FILE);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(await res.text(), 'naver-site-verification: naverf72bebc155107dcad735d8178146679f.html');
  assert.equal(await searchVerificationFileResponse(FILE, { head: true }).text(), '');
});

test('second Naver file for ekodi.kr is served too', async () => {
  const res = searchVerificationFileResponse('/naver55dffd2edf849422807852a996ee52e6.html');
  assert.equal(await res.text(), 'naver-site-verification: naver55dffd2edf849422807852a996ee52e6.html');
});

test('unknown, nested or malformed verification paths are not answered', () => {
  for (const path of ['/naver00000000000000000000000000000000.html', '/ekodimall' + FILE, FILE + '?x', '/naverf72bebc155107dcad735d8178146679f.txt', '/../naver.html'])
    assert.equal(searchVerificationFileResponse(path), null, path);
  assert.equal(searchVerificationFileResponse('/naverabc.html', {}, { '/naverabc.html': '<script>' }), null);
  for (const [path, body] of Object.entries(SEARCH_VERIFICATION_FILES)) assert.equal(body, `naver-site-verification: ${path.slice(1)}`);
});

test('platform router answers verification files before other routing and Site Core ships it', () => {
  const router = readFileSync(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8');
  const start = router.indexOf('async fetch(request,env,ctx){');
  const hit = router.indexOf('searchVerificationFileResponse(', start);
  assert.ok(start > 0 && hit > start && hit - start < 700, 'served at the top of fetch, right after security and traffic guards');
  const converge = readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8');
  const begin = converge.indexOf('const sharedSiteTouched=');
  const sel = converge.slice(begin, converge.indexOf('\nconst ', begin + 1));
  assert.ok(sel.includes("file==='search-engine-verification.js'"));
});
