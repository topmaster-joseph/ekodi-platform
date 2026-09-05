import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyProductIdentityAliases, getProductIdentityAliases, groupProductOffers, productIdentityKey } from '../product-identity.js';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

function offer(overrides = {}) {
  return {
    id: overrides.id || '1',
    productId: overrides.productId || overrides.id || '1',
    productName: overrides.productName || 'Premium Test Product 500g',
    category: overrides.category || 'gift',
    providerKey: overrides.providerKey || 'provider-a',
    providerName: overrides.providerName || 'Provider A',
    priceKrw: overrides.priceKrw ?? 20000,
    clickUrl: overrides.clickUrl || 'https://example.com/buy',
    ...overrides,
  };
}

test('explicit seller-neutral identity groups provider offers without using commission', () => {
  const groups = groupProductOffers([
    offer({ id: 'a', providerKey: 'provider-a', productName: 'Acme Premium Gift Set', productIdentityKey: 'acme:gift:2026', priceKrw: 22000, commissionRate: 30 }),
    offer({ id: 'b', providerKey: 'provider-b', productName: 'Acme Gift Set Official', productIdentityKey: 'acme:gift:2026', priceKrw: 19000, commissionRate: 1 }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].identityBasis, 'explicit');
  assert.equal(groups[0].identityConfidence, 'verified');
  assert.equal(groups[0].providerCount, 2);
  assert.equal(groups[0].bestPriceKrw, 19000);
  assert.deepEqual(groups[0].offers.map(item => item.providerKey), ['provider-b', 'provider-a']);
});

test('verified source aliases join real provider offers without title guessing', () => {
  const env = { AFFILIATE_PRODUCT_IDENTITY_ALIASES_JSON: JSON.stringify([
    { providerKey: 'coupang_partners', sourceId: '2213165937', productIdentityKey: 'dazzlshop:ilpum:10x20' },
    { providerKey: 'linkprice_11st', sourceId: '3099849458', productIdentityKey: 'dazzlshop:ilpum:10x20' },
  ]) };
  const enriched = applyProductIdentityAliases([
    offer({ id: 'c', productId: '2213165937', providerKey: 'coupang_partners', productName: '다즐샵 일품도시락 10종 20팩', priceKrw: 81000 }),
    offer({ id: 'l', productId: '3099849458', providerKey: 'linkprice_11st', productName: '다즐샵 일품도시락 10종 20팩 냉동도시락', priceKrw: 69900 }),
  ], env);
  const groups = groupProductOffers(enriched);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].identityBasis, 'explicit');
  assert.equal(groups[0].identityConfidence, 'verified');
  assert.equal(groups[0].providerCount, 2);
  assert.equal(groups[0].bestPriceKrw, 69900);
});

test('identity alias config fails closed and never overwrites an existing explicit identity', () => {
  const env = { AFFILIATE_PRODUCT_IDENTITY_ALIASES_JSON: JSON.stringify([
    { providerKey: 'provider-a', sourceId: 'SKU-1', productIdentityKey: 'verified:sku:1' },
    { providerKey: 'provider bad', sourceId: 'SKU/2', productIdentityKey: '' },
    { providerKey: 'provider-c', sourceId: 'SKU-3', productIdentityKey: 'verified:sku:3a' },
    { providerKey: 'provider-c', sourceId: 'SKU-3', productIdentityKey: 'verified:sku:3b' },
  ]) };
  assert.deepEqual(getProductIdentityAliases(env), [
    { providerKey: 'provider-a', sourceId: 'SKU-1', productIdentityKey: 'verified:sku:1' },
  ]);
  const [preserved] = applyProductIdentityAliases([
    offer({ providerKey: 'provider-a', productId: 'SKU-1', productIdentityKey: 'existing:identity' }),
  ], env);
  assert.equal(preserved.productIdentityKey, 'existing:identity');
  assert.deepEqual(getProductIdentityAliases({ AFFILIATE_PRODUCT_IDENTITY_ALIASES_JSON: '{bad-json' }), []);
});

test('GTIN and brand plus model create provider-neutral identities', () => {
  const gtinA = productIdentityKey(offer({ providerKey: 'a', gtin: '4006381333931' }));
  const gtinB = productIdentityKey(offer({ providerKey: 'b', gtin: '4006381333931', productName: 'Different seller title' }));
  assert.equal(gtinA.key, gtinB.key);
  assert.equal(gtinA.basis, 'gtin');
  const invalid = productIdentityKey(offer({ providerKey: 'c', gtin: '4006381333932', productName: 'Short' }));
  assert.notEqual(invalid.basis, 'gtin');

  const modelA = productIdentityKey(offer({ providerKey: 'a', brand: 'Acme', model: 'ZX-100' }));
  const modelB = productIdentityKey(offer({ providerKey: 'b', brand: 'ACME', model: 'ZX 100' }));
  assert.equal(modelA.key, modelB.key);
  assert.equal(modelA.basis, 'brand_model');
});

test('ambiguous short titles stay isolated instead of being force-merged', () => {
  const groups = groupProductOffers([
    offer({ id: 'a', productId: 'a', providerKey: 'provider-a', productName: 'Water' }),
    offer({ id: 'b', productId: 'b', providerKey: 'provider-b', productName: 'Water' }),
  ]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every(group => group.identityConfidence === 'isolated'));
});

test('exact sufficiently specific titles remain a conservative compatibility fallback', () => {
  const groups = groupProductOffers([
    offer({ id: 'a', providerKey: 'provider-a', productName: 'Acme Stainless Kitchen Bottle 750ml' }),
    offer({ id: 'b', providerKey: 'provider-b', productName: 'Acme Stainless Kitchen Bottle 750ml' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].identityBasis, 'exact_title');
  assert.equal(groups[0].providerCount, 2);
});

test('public Mall contract exposes server identities while keeping flat products for compatibility', async () => {
  const [api, marketplace, curator, admin, routeMigration, gateMigration] = await Promise.all([
    read('affiliate-control.js'),
    read('affiliate-marketplace.js'),
    read('sites/ekodi-mall/assets/context-curator.js'),
    read('marketing-funnel-admin.js'),
    read('migrations/0063_affiliate_merchant_routes.sql'),
    read('migrations/0064_affiliate_recommendation_gate.sql'),
  ]);
  assert.match(api, /groupProductOffers/);
  assert.match(api, /catalogMode: 'product_identity_v1'/);
  assert.match(api, /productIdentityCatalog: true/);
  assert.match(api, /productIdentities, products/);
  for (const field of ['productIdentityKey', 'gtin', 'brand', 'model']) assert.match(marketplace, new RegExp(field));
  assert.match(curator, /body\.productIdentities/);
  assert.match(curator, /identities\.length \? identities : groupOffers\(offers\)/);
  assert.match(admin, /name="gtin"/);
  assert.match(admin, /name="brand"/);
  assert.match(admin, /name="model"/);
  assert.match(admin, /name="productIdentityKey"/);
  for (const field of ['merchantKey', 'marketCountry', 'settlementCurrency', 'affiliateMode', 'affiliateStatus', 'trackingStatus', 'catalogStatus', 'networkKey', 'recommendationEnabled']) assert.match(admin, new RegExp(`name="${field}"`));
  for (const network of ['LinkPrice', 'awin', 'impact', 'cj', 'rakuten']) assert.match(admin, new RegExp(network, 'i'));
  assert.match(api, /recommendationRequiresActiveAffiliate: true/);
  assert.match(api, /recommendationRequiresVerifiedTrackingAndCatalog: true/);
  assert.match(api, /freshPriceRequiredForRecommendation: true/);
  assert.match(api, /trackingStatus !==? 'ready'|trackingStatus === 'ready'/);
  assert.match(api, /RECOMMENDABLE_CATALOG_STATUSES/);
  assert.match(api, /recommendedMerchants\.has\('coupang_partners'\)/);
  assert.match(marketplace, /tracking_status = 'ready'/);
  assert.match(marketplace, /catalog_status IN \('manual_verified','feed_ready'\)/);
  assert.match(marketplace, /if \(!\(priceKrw > 0\)\) return null/);
  assert.match(curator, /제휴가 완료된 판매처 안에서/);
  assert.match(routeMigration, /'elevenst', '11번가'.*'network'/s);
  assert.match(routeMigration, /'linkprice', 'LinkPrice', 'pending', 0/);
  assert.match(gateMigration, /ADD COLUMN tracking_status/);
  assert.match(gateMigration, /ADD COLUMN catalog_status/);
  assert.match(gateMigration, /merchant_key = 'coupang_partners'/);
});
