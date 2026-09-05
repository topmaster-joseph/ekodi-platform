import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { groupProductOffers, productIdentityKey } from '../product-identity.js';

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
  const [api, marketplace, curator, admin] = await Promise.all([
    read('affiliate-control.js'),
    read('affiliate-marketplace.js'),
    read('sites/ekodi-mall/assets/context-curator.js'),
    read('marketing-funnel-admin.js'),
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
});
