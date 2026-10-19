import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSelfUrl, decorateSiteDiscoveryHtml, ensureSiteDiscoveryHead, siteDiscoveryApplies } from '../site-discovery-head.js';

const site = { id: 'mnubiz', name: '국립목포대학교 경영동문회' };
const html = '<!doctype html><html><head><title>t</title></head><body>x</body></html>';
const req = (url = 'https://ekodi.kr/mnubiz/?utm_source=x#h', method = 'GET') => new Request(url, { method });
const res = (body = html, init = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });

test('canonical is self URL on ekodi.kr without query/hash', () => {
  assert.equal(canonicalSelfUrl('https://ekodi.kr/mnubiz/?a=1#b'), 'https://ekodi.kr/mnubiz/');
  assert.equal(canonicalSelfUrl('https://ekodi.kr//a//b'), 'https://ekodi.kr/a/b');
  assert.equal(canonicalSelfUrl('https://seonammedi.kr/'), '');
  assert.equal(canonicalSelfUrl('http://ekodi.kr/'), '');
});

test('adds missing robots, canonical, description, og tags', async () => {
  const out = await (await ensureSiteDiscoveryHead(req(), res(), site)).text();
  assert.match(out, /<meta name="robots" content="index, follow, max-image-preview:large">/);
  assert.match(out, /<link rel="canonical" href="https:\/\/ekodi.kr\/mnubiz\/">/);
  assert.match(out, /<meta name="description" content="국립목포대학교 경영동문회 — EKODI/);
  assert.match(out, /<meta property="og:url" content="https:\/\/ekodi.kr\/mnubiz\/">/);
  assert.match(out, /og:site_name/);
  assert.ok(out.indexOf('canonical') < out.indexOf('</head>'));
});

test('never overrides existing site-specific tags', () => {
  const own = '<html><head><link rel="canonical" href="https://ekodi.kr/x"><meta name="robots" content="index,follow"><meta name="description" content="own"><meta property="og:url" content="u"><meta property="og:site_name" content="S"></head></html>';
  assert.equal(decorateSiteDiscoveryHtml(own, { canonical: 'https://ekodi.kr/y', siteName: 'n' }), own);
});

test('respects noindex in meta and header, non-200, non-HTML, HEAD and missing site', async () => {
  const noindex = '<html><head><meta name="robots" content="noindex,nofollow"></head></html>';
  assert.equal(decorateSiteDiscoveryHtml(noindex, { canonical: 'https://ekodi.kr/a', siteName: 'n' }), noindex);
  assert.equal(siteDiscoveryApplies(req(), res(html, { headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' } }), site), false);
  assert.equal(siteDiscoveryApplies(req(), res(html, { status: 404 }), site), false);
  assert.equal(siteDiscoveryApplies(req(), res('{}', { headers: { 'content-type': 'application/json' } }), site), false);
  assert.equal(siteDiscoveryApplies(req(undefined, 'HEAD'), res(), site), false);
  assert.equal(siteDiscoveryApplies(req(), res(), null), false);
  const original = res();
  assert.equal(await ensureSiteDiscoveryHead(req(), original, null), original);
});

test('escapes site name and leaves HTML without head untouched', () => {
  const out = decorateSiteDiscoveryHtml(html, { canonical: 'https://ekodi.kr/a', siteName: '"><script>x</script>' });
  assert.ok(!out.includes('<script>x'));
  assert.equal(decorateSiteDiscoveryHtml('<p>no head</p>', { siteName: 'n' }), '<p>no head</p>');
});

test('keeps status and drops stale length/etag headers', async () => {
  const out = await ensureSiteDiscoveryHead(req(), res(html, { headers: { 'content-type': 'text/html', 'content-length': String(html.length), etag: '"a"', 'cache-control': 'public, max-age=0' } }), site);
  assert.equal(out.status, 200);
  assert.equal(out.headers.get('content-length'), null);
  assert.equal(out.headers.get('etag'), null);
  assert.equal(out.headers.get('cache-control'), 'public, max-age=0');
  assert.equal(out.headers.get('x-ekodi-search-exposure'), 'site-head-v1');
});

test('tenant opt-out keeps the page reachable but marks it noindex', async () => {
  const out = await ensureSiteDiscoveryHead(req(), res(), site, { optOut: new Set(['mnubiz']) });
  assert.equal(out.status, 200);
  assert.equal(out.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(await out.text(), html);
});

test('self-managed and release-digest pages are never modified (SeonamMedi parity)', async () => {
  const seonam = { id: 'seonammedi', name: '서남권 국립의대 소통센터' };
  const original = res();
  assert.equal(await ensureSiteDiscoveryHead(req('https://ekodi.kr/seonammedi/'), original, seonam), original);
  const digest = '<html><head><meta name="ekodi-release" content="r1"><title>t</title></head></html>';
  assert.equal(decorateSiteDiscoveryHtml(digest, { canonical: 'https://ekodi.kr/a', siteName: 'n' }), digest);
});
