import test from 'node:test';
import assert from 'node:assert/strict';

import { createMallMarketDiscovery } from '../mall-market-discovery.js';
import { evaluateMallJubileeRecommendation } from '../mall-jubilee-adapter.js';

const internal = {
  id: 'ekodi-gift',
  productName: '에코디 연결 선물세트',
  priceKrw: 59000,
  userFit: 0.80,
  affordability: 0.82,
  serviceQuality: 0.86,
};

test('open-market Mall recommendation consumes the replaceable discovery port', async () => {
  const discovery = createMallMarketDiscovery({
    providers: [{
      id: 'independent-shop',
      search: async () => [{
        id: 'gift-42',
        productName: '독립상점 건강 선물',
        productUrl: 'https://independent.example.test/gift-42',
        priceKrw: 47000,
        userFit: 0.94,
        affordability: 0.93,
        serviceQuality: 0.84,
      }],
    }],
  });

  const result = await evaluateMallJubileeRecommendation({
    scope: 'open_market',
    query: '부모님 건강 선물',
    products: [internal],
  }, {
    discoverExternalProducts: input => discovery.discover(input),
  });

  assert.equal(result.actionable, true);
  assert.equal(result.externalDiscovery.attempted, true);
  assert.equal(result.externalDiscovery.complete, true);
  assert.equal(result.externalDiscovery.providerCount, 1);
  assert.equal(result.externalDiscovery.candidateCount, 1);
  assert.equal(result.evaluation.choiceSet[0].id, 'external:independent-shop:gift-42');
  assert.ok(result.evaluation.choiceSet.some(item => item.id === 'ekodi-gift'));
});

test('open-market Mall remains non-actionable when discovery has no provider', async () => {
  const discovery = createMallMarketDiscovery();
  const result = await evaluateMallJubileeRecommendation({
    scope: 'open_market',
    query: '부모님 건강 선물',
    products: [internal],
  }, {
    discoverExternalProducts: input => discovery.discover(input),
  });

  assert.equal(result.actionable, false);
  assert.equal(result.nextAction, 'discover_external_alternatives');
  assert.equal(result.externalDiscovery.attempted, true);
  assert.equal(result.externalDiscovery.complete, false);
  assert.ok(result.externalDiscovery.warnings.includes('market_discovery_provider_unavailable'));
});

test('explicit EKODI catalog scope never calls external discovery', async () => {
  let calls = 0;
  const result = await evaluateMallJubileeRecommendation({
    scope: 'ekodi_catalog',
    products: [internal],
  }, {
    discoverExternalProducts: async () => {
      calls += 1;
      return { products: [] };
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.actionable, true);
  assert.equal(result.externalDiscovery.attempted, false);
});
