import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalUrl, DISCOVERY_PRIVATE_PREFIXES, DISCOVERY_PUBLIC_ROUTES, pageJsonLd, renderDiscoveryHead, renderLlmsTxt, renderRobotsTxt, renderSitemapXml } from '../discovery-layer.js';

test('sitemap contains only declared public canonical routes', () => {
  const sitemap = renderSitemapXml();
  for (const route of DISCOVERY_PUBLIC_ROUTES) assert.ok(sitemap.includes(canonicalUrl(route.path)));
  for (const prefix of DISCOVERY_PRIVATE_PREFIXES) assert.equal(sitemap.includes(prefix), false);
  assert.equal(sitemap.includes('.html</loc>'), false);
});

test('public route contract carries canonical metadata and static asset ownership where applicable', () => {
  assert.deepEqual(DISCOVERY_PUBLIC_ROUTES.filter(route => route.asset).map(route => route.path), ['/', '/history', '/privacy', '/terms']);
  for (const route of DISCOVERY_PUBLIC_ROUTES) {
    assert.ok(route.title.length > 5);
    assert.ok(route.description.length > 10);
    assert.ok(canonicalUrl(route.path).startsWith('https://ekodi.kr/'));
  }
});

test('robots separates search discovery from model training and blocks private prefixes', () => {
  const robots = renderRobotsTxt();
  assert.match(robots, /User-agent: OAI-SearchBot\nAllow: \//);
  assert.match(robots, /User-agent: PerplexityBot\nAllow: \//);
  assert.match(robots, /User-agent: GPTBot\nDisallow: \//);
  assert.match(robots, /User-agent: ClaudeBot\nDisallow: \//);
  assert.match(robots, /User-agent: Google-Extended\nDisallow: \//);
  for (const prefix of DISCOVERY_PRIVATE_PREFIXES) assert.ok(robots.includes(`Disallow: ${prefix}`));
  assert.match(robots, /Sitemap: https:\/\/ekodi\.kr\/sitemap\.xml/);
});

test('llms discovery file identifies canonical public sources and privacy boundary', () => {
  const llms = renderLlmsTxt();
  assert.match(llms, /Canonical site: https:\/\/ekodi\.kr\//);
  assert.match(llms, /preview-development/);
  assert.equal(llms.includes('https://admin.ekodi.kr'), false);
});

test('page structured data links WebPage to stable WebSite and Organization entities', () => {
  const jsonLd = pageJsonLd('/history');
  assert.equal(jsonLd['@context'], 'https://schema.org');
  assert.deepEqual(jsonLd['@graph'].map(entity => entity['@type']), ['Organization', 'WebSite', 'WebPage']);
  const page = jsonLd['@graph'][2];
  assert.equal(page.url, 'https://ekodi.kr/history');
  assert.deepEqual(page.isPartOf, { '@id': 'https://ekodi.kr/#website' });
  assert.deepEqual(page.about, { '@id': 'https://ekodi.kr/#organization' });
});

test('discovery head is page-specific and exposes canonical social metadata', () => {
  const head = renderDiscoveryHead('/privacy');
  assert.match(head, /data-ekodi-discovery="v2"/);
  assert.match(head, /property="og:url" content="https:\/\/ekodi\.kr\/privacy"/);
  assert.match(head, /application\/ld\+json/);
  assert.match(head, /name="robots" content="index, follow"/);
});
