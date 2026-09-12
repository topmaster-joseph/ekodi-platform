import test from 'node:test';
import assert from 'node:assert/strict';

import { createMallMarketDiscovery } from '../mall-market-discovery.js';

const result = overrides => ({
  id: 'item-1',
  productName: '독립상점 건강 선물',
  productUrl: 'https://merchant.example.test/products/item-1',
  priceKrw: 45000,
  userFit: 0.94,
  serviceQuality: 0.82,
  ...overrides,
});

test('market discovery is provider-neutral and normalizes external products', async () => {
  const discovery = createMallMarketDiscovery({
    providers: [{
      id: 'merchant-one',
      search: async ({ query, limit }) => {
        assert.equal(query, '부모님 건강 선물');
        assert.equal(limit, 6);
        return [result()];
      },
    }],
  });

  const output = await discovery.discover({ query: '부모님 건강 선물', limit: 6 });
  assert.equal(output.complete, true);
  assert.equal(output.providerCount, 1);
  assert.equal(output.successfulProviderCount, 1);
  assert.equal(output.products[0].id, 'external:merchant-one:item-1');
  assert.equal(output.products[0].source, 'external');
  assert.equal(output.products[0].providerIndependence, 1);
});

test('commercial external providers require disclosure before their products enter discovery', async () => {
  const discovery = createMallMarketDiscovery({
    providers: [{
      id: 'paid-market',
      commercialRelationship: true,
      search: async () => [result()],
    }],
  });

  const output = await discovery.discover({ query: '선물' });
  assert.equal(output.complete, false);
  assert.equal(output.products.length, 0);
  assert.ok(output.warnings.includes('market_discovery_no_external_candidates'));
});

test('provider-level commercial disclosure is inherited by normalized products', async () => {
  const discovery = createMallMarketDiscovery({
    providers: [{
      id: 'partner-market',
      commercialRelationship: true,
      commercialDisclosure: 'EKODI may receive a referral benefit from this external marketplace.',
      search: async () => [result()],
    }],
  });

  const output = await discovery.discover({ query: '선물' });
  assert.equal(output.products.length, 1);
  assert.equal(output.products[0].commercialRelationship, true);
  assert.match(output.products[0].commercialDisclosure, /referral benefit/i);
});

test('one provider failure does not erase valid independent alternatives', async () => {
  const discovery = createMallMarketDiscovery({
    timeoutMs: 1000,
    providers: [
      { id: 'broken-market', search: async () => { throw new Error('upstream unavailable'); } },
      { id: 'healthy-market', search: async () => [result({ id: 'healthy-1' })] },
    ],
  });

  const output = await discovery.discover({ query: '선물' });
  assert.equal(output.complete, true);
  assert.equal(output.successfulProviderCount, 1);
  assert.equal(output.products[0].id, 'external:healthy-market:healthy-1');
  assert.ok(output.warnings.some(warning => warning.startsWith('market_provider_failed:broken-market:')));
});

test('no configured external provider produces an explicit incomplete result', async () => {
  const discovery = createMallMarketDiscovery();
  const output = await discovery.discover({ query: '선물' });
  assert.equal(output.complete, false);
  assert.deepEqual(output.products, []);
  assert.ok(output.warnings.includes('market_discovery_provider_unavailable'));
});
