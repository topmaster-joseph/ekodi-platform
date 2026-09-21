import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalUrl,
  DISCOVERY_CRAWLER_POLICY,
  DISCOVERY_EXTERNAL_RESOURCES,
  DISCOVERY_OFFICIAL_ORIGINS,
  DISCOVERY_PRIVATE_PREFIXES,
  DISCOVERY_PUBLIC_ROUTES,
  pageJsonLd,
  renderDiscoveryHead,
  renderLlmsTxt,
  renderRobotsTxt,
  renderSitemapXml,
} from '../discovery-layer.js';

test('registry-driven sitemap contains public apex canonical routes only', () => {
  const sitemap = renderSitemapXml();
  for (const route of DISCOVERY_PUBLIC_ROUTES) assert.ok(sitemap.includes(canonicalUrl(route.path)));
  for (const prefix of DISCOVERY_PRIVATE_PREFIXES) assert.equal(sitemap.includes(prefix), false);
  assert.equal(sitemap.includes('.html</loc>'), false);
  assert.equal(sitemap.includes('books.ekodi.kr'), false);
  for (const expected of ['/jadam','/pizzamaru','/yogurt','/cgma','/ekodichurch','/ekodibiz','/ekodilab','/bible','/community','/social','/ekodibiz/ekodimall']) {
    assert.ok(DISCOVERY_PUBLIC_ROUTES.some(route => route.path === expected), `missing generated public route: ${expected}`);
  }
  assert.equal(DISCOVERY_PUBLIC_ROUTES.some(route => route.path === '/my'), false);
});

test('public route contract carries canonical metadata and static asset ownership where applicable', () => {
  assert.deepEqual(DISCOVERY_PUBLIC_ROUTES.filter(route => route.asset).map(route => route.path), ['/', '/history', '/privacy', '/terms']);
  for (const route of DISCOVERY_PUBLIC_ROUTES) {
    assert.ok(route.title.length > 5);
    assert.ok(route.description.length > 10);
    assert.ok(canonicalUrl(route.path).startsWith('https://ekodi.kr/'));
  }
});

test('direct public subdomain services stay separate from redirect aliases', () => {
  const urls = DISCOVERY_EXTERNAL_RESOURCES.map(resource => resource.url);
  assert.deepEqual(urls, [
    'https://author.ekodi.kr',
    'https://books.ekodi.kr',
    'https://journal.ekodi.kr',
    'https://life.ekodi.kr',
    'https://publishing.ekodi.kr',
    'https://work.ekodi.kr',
  ]);
  for (const retiredRedirect of ['https://mall.ekodi.kr','https://mall.biz.ekodi.kr','https://mail.biz.ekodi.kr','https://live.church.ekodi.kr']) {
    assert.equal(urls.includes(retiredRedirect), false);
  }
  assert.ok(DISCOVERY_OFFICIAL_ORIGINS.includes('https://books.ekodi.kr'));
});

test('crawler policy separates search, answer retrieval, training and user-requested agents', () => {
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

test('robots allows public search, answer and user-agent discovery while blocking training', () => {
  const robots = renderRobotsTxt();
  for (const crawler of [...DISCOVERY_CRAWLER_POLICY.searchIndex, ...DISCOVERY_CRAWLER_POLICY.answerRetrieval, ...DISCOVERY_CRAWLER_POLICY.agent]) {
    assert.match(robots, new RegExp(`User-agent: ${crawler}\\nAllow: /`));
  }
  for (const crawler of DISCOVERY_CRAWLER_POLICY.training) {
    assert.match(robots, new RegExp(`User-agent: ${crawler}\\nDisallow: /`));
  }
  for (const prefix of DISCOVERY_PRIVATE_PREFIXES) assert.ok(robots.includes(`Disallow: ${prefix}`));
  assert.match(robots, /Sitemap: https:\/\/ekodi\.kr\/sitemap\.xml/);
});

test('llms discovery identifies apex and direct-service canonical public resources', () => {
  const llms = renderLlmsTxt();
  assert.match(llms, /Canonical site: https:\/\/ekodi\.kr\//);
  assert.match(llms, /preview-development/);
  assert.match(llms, /user-requested assistants may access public pages/i);
  assert.match(llms, /model-training crawlers are restricted separately/i);
  assert.match(llms, /https:\/\/books\.ekodi\.kr/);
  assert.equal(llms.includes('https://admin.ekodi.kr'), false);
  assert.equal(llms.includes('https://mall.ekodi.kr'), false);
});

test('page structured data links WebPage to stable WebSite and route entity', () => {
  const history = pageJsonLd('/history');
  assert.equal(history['@context'], 'https://schema.org');
  assert.deepEqual(history['@graph'].map(entity => entity['@type']), ['Organization', 'WebSite', 'WebPage']);
  const historyPage = history['@graph'][2];
  assert.equal(historyPage.url, 'https://ekodi.kr/history');
  assert.deepEqual(historyPage.isPartOf, { '@id': 'https://ekodi.kr/#website' });

  const store = pageJsonLd('/jadam');
  assert.deepEqual(store['@graph'].map(entity => entity['@type']), ['Organization', 'WebSite', 'WebPage', 'LocalBusiness']);
  assert.deepEqual(store['@graph'][2].mainEntity, { '@id': 'https://ekodi.kr/jadam#entity' });
});

test('discovery head is page-specific and exposes canonical social metadata', () => {
  const head = renderDiscoveryHead('/privacy');
  assert.match(head, /data-ekodi-discovery="v3"/);
  assert.match(head, /property="og:url" content="https:\/\/ekodi\.kr\/privacy"/);
  assert.match(head, /application\/ld\+json/);
  assert.match(head, /name="robots" content="index, follow"/);
});
