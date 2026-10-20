import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEARCH_VERIFICATION_CODES,
  isValidVerificationCode,
  verificationMetaTags,
  injectVerificationMeta,
} from '../search-engine-verification.js';
import worker from '../seonammedi-domain-gateway.js';

const registry = {
  'seonammedi.kr': { google: ['AbC_123-xyzVERIFY'], naver: ['0123456789abcdef0123'] },
};

test('codes are validated before reaching HTML', () => {
  assert.equal(isValidVerificationCode('AbC_123-xyzVERIFY'), true);
  for (const bad of ['', 'short', '"><script>x</script>', 'a b c d e f g h', 'x'.repeat(200)]) {
    assert.equal(isValidVerificationCode(bad), false, bad);
  }
  const tags = verificationMetaTags('seonammedi.kr', { 'seonammedi.kr': { google: ['"><script>', 'GoodCode123'], naver: [] } });
  assert.equal(tags, '<meta name="google-site-verification" content="GoodCode123">');
});

test('meta tags are inserted once, right after <head>', () => {
  const html = '<!doctype html><html><head lang="ko"><title>t</title></head><body></body></html>';
  const out = injectVerificationMeta(html, 'seonammedi.kr', registry);
  assert.match(out, /<head lang="ko"><meta name="google-site-verification" content="AbC_123-xyzVERIFY"><meta name="naver-site-verification" content="0123456789abcdef0123"><title>/);
  assert.equal((out.match(/site-verification/g) || []).length, 2);
});

test('unknown hosts, empty registry and head-less documents are untouched', () => {
  const html = '<html><head></head></html>';
  assert.equal(injectVerificationMeta(html, 'evil.example', registry), html);
  assert.equal(injectVerificationMeta(html, 'seonammedi.kr', { 'seonammedi.kr': { google: [], naver: [] } }), html);
  assert.equal(injectVerificationMeta('<p>fragment</p>', 'seonammedi.kr', registry), '<p>fragment</p>');
});

test('shipped registry only contains valid codes', () => {
  for (const [host, engines] of Object.entries(SEARCH_VERIFICATION_CODES)) {
    assert.match(host, /^[a-z0-9.-]+$/);
    for (const codes of Object.values(engines)) for (const code of codes) assert.ok(isValidVerificationCode(code), `${host}: ${code}`);
  }
});

test('gateway keeps proxying HTML and never duplicates verification meta', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html><head><title>x</title></head><body></body></html>', {
    status: 200, headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  try {
    const res = await worker.fetch(new Request('https://seonammedi.kr/'));
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /<title>x<\/title>/);
    const expected = verificationMetaTags('seonammedi.kr');
    assert.equal(html.includes(expected), true);
    assert.ok((html.match(/google-site-verification/g) || []).length <= (SEARCH_VERIFICATION_CODES['seonammedi.kr'].google.length));
  } finally { globalThis.fetch = original; }
});

test('ekodi.kr root carries the Naver ownership tag exactly once; other routes do not', async () => {
  const { decorateDiscoveryHtml } = await import('../discovery-layer.js');
  const html = '<!doctype html><html><head><title>EKODI</title><meta name="naver-site-verification" content="stale0000"></head><body></body></html>';
  const root = decorateDiscoveryHtml(html, '/');
  assert.equal((root.match(/naver-site-verification/g) || []).length, 1);
  assert.match(root, /<meta name="naver-site-verification" content="89c7b7e30eb1de66e84a2b7c751e2e6d8cfe7e8f">/);
  const history = decorateDiscoveryHtml(html.replace(/<meta name="naver[^>]*>/, ''), '/history');
  assert.doesNotMatch(history, /site-verification/);
});

test('seonammedi.kr gateway pages carry the same Naver tag', () => {
  assert.match(verificationMetaTags('seonammedi.kr'), /naver-site-verification" content="89c7b7e30eb1de66e84a2b7c751e2e6d8cfe7e8f"/);
});

test('ekodi.kr robots.txt starts with the Daum ownership line; malformed lines are dropped', async () => {
  const { renderRobotsTxt } = await import('../discovery-layer.js');
  const { daumWebmasterLine } = await import('../search-engine-verification.js');
  const robots = renderRobotsTxt();
  assert.equal(robots.split('\n')[0], '#DaumWebMasterTool:6a54258804aae42599a30f741a754100f26c942229a78e581195a158354f8ca1:sgQJn+c4WOkeYlgoF2KRow==');
  assert.match(robots, /Sitemap: https:\/\/ekodi\.kr\/sitemap\.xml/);
  assert.equal(daumWebmasterLine('ekodi.kr', { 'ekodi.kr': '#DaumWebMasterTool:bad\nDisallow: /' }), '');
  assert.equal(daumWebmasterLine('unknown.kr'), '');
});
