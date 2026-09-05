import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getProviderFeedConfigs,
  listProviderFeedDescriptors,
  mixProductsByProvider,
  normalizeProviderFeedItem,
  readProviderFeed,
} from '../affiliate-provider-feed.js';

const configJson = JSON.stringify([
  {
    providerKey: 'partner-one',
    providerName: 'Partner One',
    url: 'https://feed.example.com/catalog.json',
    tokenEnv: 'PARTNER_ONE_TOKEN',
    disclosureText: '제휴 링크를 통해 수수료를 받을 수 있습니다.',
  },
]);

test('provider feed config is HTTPS-only and bounded', () => {
  const env = { AFFILIATE_PROVIDER_FEEDS_JSON: JSON.stringify([
    ...Array.from({ length: 20 }, (_, i) => ({ providerKey: `p-${i}`, providerName: `P ${i}`, url: `https://p${i}.example.com/feed` })),
    { providerKey: 'bad', providerName: 'Bad', url: 'http://bad.example.com/feed' },
  ]) };
  const configs = getProviderFeedConfigs(env);
  assert.equal(configs.length, 16);
  assert.ok(configs.every(item => item.url.startsWith('https://')));
  assert.equal(configs.some(item => item.providerKey === 'bad'), false);
});
test('provider descriptor exposes readiness without endpoint path or secret names', () => {
  const descriptors = listProviderFeedDescriptors({
    AFFILIATE_PROVIDER_FEEDS_JSON: configJson,
    PARTNER_ONE_TOKEN: 'super-secret-token',
  });
  assert.equal(descriptors.length, 1);
  assert.deepEqual(descriptors[0], {
    providerKey: 'partner-one',
    providerName: 'Partner One',
    connectionMode: 'json_feed_v1',
    endpointHost: 'feed.example.com',
    marketCountry: 'KR',
    priceCurrency: 'KRW',
    affiliateMode: 'direct',
    networkKey: '',
    networkName: '',
    enabled: true,
    secretRequired: true,
    secretConfigured: true,
  });
  const serialized = JSON.stringify(descriptors);
  assert.doesNotMatch(serialized, /super-secret-token|PARTNER_ONE_TOKEN|catalog\.json/);
});

test('generic feed item normalizes into a provider-neutral product offer input', () => {
  const product = normalizeProviderFeedItem({
    sku: 'SKU-77',
    title: '지역 프리미엄 김 선물세트',
    url: 'https://shop.example.com/a/77',
    image: 'https://cdn.example.com/a/77.jpg',
    price: 39000,
    category: '선물',
    barcode: '8801234567893',
    brand: 'Local Sea',
    modelName: 'GIFT-39',
  }, { providerKey: 'partner-one', providerName: 'Partner One' });
  assert.equal(product.sourceId, 'SKU-77');
  assert.equal(product.priceKrw, 39000);
  assert.equal(product.gtin, '8801234567893');
  assert.equal(product.providerKey, 'partner-one');
});
test('foreign-currency feeds never treat raw foreign price as KRW without an explicit KRW value', () => {
  const foreignConfig = { providerKey: 'global-shop', providerName: 'Global Shop', marketCountry: 'US', priceCurrency: 'USD', affiliateMode: 'network', networkKey: 'global-network', networkName: 'Global Network' };
  const rawOnly = normalizeProviderFeedItem({ id: 'USD-1', name: 'Global Product', url: 'https://shop.example.com/usd-1', price: 49.99, currency: 'USD' }, foreignConfig);
  assert.equal(rawOnly.priceKrw, 0);
  assert.equal(rawOnly.sourcePriceAmount, 49.99);
  assert.equal(rawOnly.sourcePriceCurrency, 'USD');
  assert.equal(rawOnly.marketCountry, 'US');
  assert.equal(rawOnly.affiliateMode, 'network');
  const converted = normalizeProviderFeedItem({ id: 'USD-2', name: 'Global Product 2', url: 'https://shop.example.com/usd-2', price: 49.99, currency: 'USD', priceKrw: 69000 }, foreignConfig);
  assert.equal(converted.priceKrw, 69000);
});

test('feed fetch keeps credentials server-side and accepts common payload shapes', async () => {
  let seenUrl = '';
  let seenAuth = '';
  const result = await readProviderFeed({
    AFFILIATE_PROVIDER_FEEDS_JSON: configJson,
    PARTNER_ONE_TOKEN: 'super-secret-token',
  }, 'partner-one', {
    fetchImpl: async (url, init) => {
      seenUrl = String(url);
      seenAuth = init.headers.get('Authorization');
      return new Response(JSON.stringify({ items: [{ id: 'A1', name: '상품 A1', affiliateUrl: 'https://shop.example.com/A1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(seenUrl, 'https://feed.example.com/catalog.json');
  assert.equal(seenAuth, 'Bearer super-secret-token');
  assert.equal(result.ok, true);
  assert.equal(result.products.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /super-secret-token|PARTNER_ONE_TOKEN/);
});

test('feed requiring an absent server secret fails closed before fetch', async () => {
  let called = false;
  const result = await readProviderFeed({ AFFILIATE_PROVIDER_FEEDS_JSON: configJson }, 'partner-one', {
    fetchImpl: async () => { called = true; throw new Error('should not run'); },
  });
  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'secret_required');
});
test('feed sync contract is admin-only and provider-key scoped', () => {
  const control = fs.readFileSync(new URL('../affiliate-control.js', import.meta.url), 'utf8');
  const authIndex = control.indexOf('const auth = await sessionCheck');
  const syncIndex = control.indexOf('const providerSync = path.match');
  assert.ok(authIndex >= 0 && syncIndex > authIndex);
  assert.match(control, /syncProviderFeed\(env, providerSync\[1\]\)/);
  assert.match(control, /providerFeedSync: true/);
  assert.match(control, /endpointHost/);
  assert.doesNotMatch(control, /body\.feedUrl|body\.tokenEnv|body\.secret/);
});

test('feed products use stable provider source ids instead of creating a new offer identity every sync', () => {
  const marketplace = fs.readFileSync(new URL('../affiliate-marketplace.js', import.meta.url), 'utf8');
  assert.match(marketplace, /const offerSourceId = stableOfferSourceId \? `feed:/);
  assert.match(marketplace, /SELECT metadata_json FROM ekodi_offers WHERE offer_type = 'product' AND source_provider = \? AND source_id = \?/);
  assert.match(marketplace, /sourceId: offerSourceId \|\| `link:/);
  assert.match(marketplace, /metadata_json LIKE \?/);
});

test('provider mixing reserves catalog visibility without using commission', () => {
  const mixed = mixProductsByProvider([
    { id: 'c1', providerKey: 'coupang_partners' },
    { id: 'c2', providerKey: 'coupang_partners' },
    { id: 'c3', providerKey: 'coupang_partners' },
    { id: 'p1', providerKey: 'partner-one' },
    { id: 'p2', providerKey: 'partner-one' },
  ], 4);
  assert.deepEqual(mixed.map(item => item.id), ['c1', 'p1', 'c2', 'p2']);
});

test('stale feed prices are suppressed while cached purchase links remain available', () => {
  const marketplace = fs.readFileSync(new URL('../affiliate-marketplace.js', import.meta.url), 'utf8');
  assert.match(marketplace, /FEED_PRICE_FRESH_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(marketplace, /freshness\.status === 'stale' \? 0 : Number\(offer\.priceAmount/);
  assert.match(marketplace, /priceFreshness: freshness\.status/);
});

test('admin surface shows feed readiness and only syncs configured provider keys', () => {
  const admin = fs.readFileSync(new URL('../marketing-funnel-admin.js', import.meta.url), 'utf8');
  assert.match(admin, /affiliateFeedProviders/);
  assert.match(admin, /data-provider-sync/);
  assert.match(admin, /api\('\/api\/affiliate\/providers'\)/);
  assert.match(admin, /encodeURIComponent\(providerKey\)\}\/sync/);
  assert.doesNotMatch(admin, /tokenEnv|feedUrl|AFFILIATE_PROVIDER_FEEDS_JSON/);
});

test('provider feed configuration rejects internal targets, reserved provider and header injection', () => {
  const configs = getProviderFeedConfigs({ AFFILIATE_PROVIDER_FEEDS_JSON: JSON.stringify([
    { providerKey: 'http', providerName: 'HTTP', url: 'http://feed.example.com/items' },
    { providerKey: 'loopback', providerName: 'Loopback', url: 'https://127.0.0.1/items' },
    { providerKey: 'private', providerName: 'Private', url: 'https://192.168.0.2/items' },
    { providerKey: 'creds', providerName: 'Creds', url: 'https://user:pass@feed.example.com/items' },
    { providerKey: 'coupang_partners', providerName: 'Reserved', url: 'https://feed.example.com/items' },
    { providerKey: 'newline', providerName: 'Newline', url: 'https://feed.example.com/items', tokenPrefix: 'Bearer\r\nX-Evil: yes' },
    { providerKey: 'safe', providerName: 'Safe', url: 'https://feed.example.com/items' },
    { providerKey: 'safe', providerName: 'Duplicate', url: 'https://other.example.com/items' },
  ]) });
  assert.equal(configs.length, 1);
  assert.equal(configs[0].providerKey, 'safe');
  assert.equal(new URL(configs[0].url).hostname, 'other.example.com');
});

test('provider secret containing CRLF fails closed before fetch', async () => {
  let called = false;
  const result = await readProviderFeed({
    AFFILIATE_PROVIDER_FEEDS_JSON: configJson,
    PARTNER_ONE_TOKEN: 'bad\r\nvalue',
  }, 'partner-one', { fetchImpl: async () => { called = true; return new Response('{}'); } });
  assert.equal(called, false);
  assert.equal(result.status, 'secret_invalid');
});

test('marketplace reserves a non-Coupang offer window before provider mixing', () => {
  const registry = fs.readFileSync(new URL('../offer-registry.js', import.meta.url), 'utf8');
  const marketplace = fs.readFileSync(new URL('../affiliate-marketplace.js', import.meta.url), 'utf8');
  assert.match(registry, /excludeSourceProvider = ''/);
  assert.match(registry, /source_provider <> \?/);
  assert.match(marketplace, /excludeSourceProvider: 'coupang_partners'/);
});

test('successful feed sync retires products removed by the provider', () => {
  const feed = fs.readFileSync(new URL('../affiliate-provider-feed.js', import.meta.url), 'utf8');
  assert.match(feed, /ensureFeedRegistration\(env, config\)/);
  assert.match(feed, /retireMissingFeedProducts\(env\.DB, read\.providerKey, activeSourceIds\)/);
  assert.match(feed, /UPDATE ekodi_offers SET status = 'inactive'/);
  assert.match(feed, /UPDATE affiliate_links SET status = 'archived'/);
  assert.match(feed, /retired,/);
});
test('unknown successful feed payload shape fails closed instead of retiring the catalog', async () => {
  const result = await readProviderFeed({
    AFFILIATE_PROVIDER_FEEDS_JSON: configJson,
    PARTNER_ONE_TOKEN: 'secret',
  }, 'partner-one', {
    fetchImpl: async () => new Response(JSON.stringify({ data: { changed: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsupported_shape');
});