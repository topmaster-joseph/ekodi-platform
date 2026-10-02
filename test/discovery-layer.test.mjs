import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalUrl, DISCOVERY_CRAWLER_POLICY, DISCOVERY_PRIVATE_PREFIXES, DISCOVERY_PUBLIC_ROUTES, pageJsonLd, renderDiscoveryHead, renderLlmsTxt, renderRobotsTxt, renderSitemapXml } from '../discovery-layer.js';

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

test('crawler policy separates search, answer retrieval, training and agents', () => {
  assert.deepEqual(DISCOVERY_CRAWLER_POLICY.searchIndex, ['Googlebot', 'bingbot']);
  assert.deepEqual(DISCOVERY_CRAWLER_POLICY.answerRetrieval, ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Applebot']);
  assert.deepEqual(DISCOVERY_CRAWLER_POLICY.training, [
    'GPTBot', 'ClaudeBot', 'Google-Extended', 'Google-CloudVertexBot', 'Bytespider', 'CCBot',
    'meta-externalagent', 'FacebookBot', 'Amazonbot',
  ]);
  assert.deepEqual(DISCOVERY_CRAWLER_POLICY.agent, [
    'ChatGPT-User', 'Claude-User', 'Perplexity-User', 'meta-externalfetcher', 'DuckAssistBot', 'MistralAI-User',
  ]);
});

test('robots allows public search and answer discovery while blocking training and agents', () => {
  const robots = renderRobotsTxt();
  for (const crawler of [...DISCOVERY_CRAWLER_POLICY.searchIndex, ...DISCOVERY_CRAWLER_POLICY.answerRetrieval]) {
    assert.match(robots, new RegExp(`User-agent: ${crawler}\\nAllow: /`));
  }
  for (const crawler of [...DISCOVERY_CRAWLER_POLICY.training, ...DISCOVERY_CRAWLER_POLICY.agent]) {
    assert.match(robots, new RegExp(`User-agent: ${crawler}\\nDisallow: /`));
  }
  for (const prefix of DISCOVERY_PRIVATE_PREFIXES) assert.ok(robots.includes(`Disallow: ${prefix}`));
  assert.match(robots, /Sitemap: https:\/\/ekodi\.kr\/sitemap\.xml/);
});

test('llms discovery file identifies canonical public sources and purpose separation', () => {
  const llms = renderLlmsTxt();
  assert.match(llms, /Canonical site: https:\/\/ekodi\.kr\//);
  assert.match(llms, /preview-development/);
  assert.match(llms, /search permission does not imply training or agent permission/i);
  assert.equal(llms.includes('https://admin.ekodi.kr'), false);
});

test('page structured data links WebPage to stable WebSite and Organization entities', () => {
  const jsonLd = pageJsonLd('/privacy');
  assert.equal(jsonLd['@context'], 'https://schema.org');
  assert.deepEqual(jsonLd['@graph'].map(entity => entity['@type']), ['Organization', 'WebSite', 'WebPage']);
  const page = jsonLd['@graph'][2];
  assert.equal(page.url, 'https://ekodi.kr/privacy');
  assert.deepEqual(page.isPartOf, { '@id': 'https://ekodi.kr/#website' });
  assert.deepEqual(page.about, { '@id': 'https://ekodi.kr/#organization' });
});

test('discovery head is page-specific and exposes canonical social metadata', () => {
  const head = renderDiscoveryHead('/privacy');
  assert.match(head, /data-ekodi-discovery="v3"/);
  assert.match(head, /property="og:url" content="https:\/\/ekodi\.kr\/privacy"/);
  assert.match(head, /application\/ld\+json/);
  assert.match(head, /name="robots" content="index, follow"/);
});


test('central registry auto-projects verified live services and excludes preparing or private surfaces', () => {
  const paths = new Set(DISCOVERY_PUBLIC_ROUTES.map(route => route.path));
  for (const path of ['/ekodichurch', '/ekodibiz', '/books', '/publishing', '/journal', '/author', '/ekodilab', '/learn', '/life', '/work']) {
    assert.ok(paths.has(path), `expected auto-discovered live service: ${path}`);
  }
  assert.equal(paths.has('/ekodimission'), false);
  assert.equal(paths.has('/my'), false);
  assert.equal([...paths].some(path => path.includes('/admin') || path.startsWith('/api/')), false);
});

test('registered entity kinds generate type-specific Schema.org entities', () => {
  const graph = pageJsonLd('/jadam')['@graph'];
  assert.ok(graph.some(entity => entity['@type'] === 'Restaurant'));
  const page = graph.find(entity => entity['@type'] === 'WebPage');
  const restaurant = graph.find(entity => entity['@type'] === 'Restaurant');
  assert.deepEqual(page.about, { '@id': restaurant['@id'] });
});
