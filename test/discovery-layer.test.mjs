import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISCOVERY_PRIVATE_PREFIXES,
  DISCOVERY_PUBLIC_ROUTES,
  organizationJsonLd,
  renderLlmsTxt,
  renderRobotsTxt,
  renderSitemapXml,
} from '../discovery-layer.js';

test('sitemap contains only declared public canonical routes', () => {
  const sitemap = renderSitemapXml();
  for (const route of DISCOVERY_PUBLIC_ROUTES) {
    const url = `https://ekodi.kr${route.path === '/' ? '/' : route.path}`;
    assert.match(sitemap, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const prefix of DISCOVERY_PRIVATE_PREFIXES) assert.equal(sitemap.includes(prefix), false);
  assert.equal(sitemap.includes('.html</loc>'), false);
});

test('robots separates public search discovery from model training', () => {
  const robots = renderRobotsTxt();
  assert.match(robots, /User-agent: OAI-SearchBot\nAllow: \//);
  assert.match(robots, /User-agent: PerplexityBot\nAllow: \//);
  assert.match(robots, /User-agent: GPTBot\nDisallow: \//);
  assert.match(robots, /User-agent: ClaudeBot\nDisallow: \//);
  assert.match(robots, /User-agent: Google-Extended\nDisallow: \//);
  for (const prefix of DISCOVERY_PRIVATE_PREFIXES) {
    assert.ok(robots.includes(`Disallow: ${prefix}`));
  }
  assert.match(robots, /Sitemap: https:\/\/ekodi\.kr\/sitemap\.xml/);
});

test('llms discovery file identifies canonical public sources and privacy boundary', () => {
  const llms = renderLlmsTxt();
  assert.match(llms, /Canonical site: https:\/\/ekodi\.kr\//);
  assert.match(llms, /Do not treat admin, authentication, API, tenant-private, or operational pages as public sources/);
  assert.equal(llms.includes('https://admin.ekodi.kr'), false);
});

test('structured data exposes only public EKODI organization and website entities', () => {
  const jsonLd = organizationJsonLd();
  assert.equal(jsonLd['@context'], 'https://schema.org');
  assert.deepEqual(jsonLd['@graph'].map(entity => entity['@type']), ['Organization', 'WebSite']);
  const serialized = JSON.stringify(jsonLd);
  assert.match(serialized, /https:\/\/ekodi\.kr\/#organization/);
  assert.equal(serialized.includes('/admin'), false);
  assert.equal(serialized.includes('/api/'), false);
});
