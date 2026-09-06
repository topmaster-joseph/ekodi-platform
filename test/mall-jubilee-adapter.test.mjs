import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeMallJubileeChoice,
  evaluateMallJubileeRecommendation,
} from '../mall-jubilee-adapter.js';

const internal = {
  id: 'ekodi-hongsam',
  productName: '홍삼 선물세트',
  priceKrw: 59000,
  userFit: 0.82,
  affordability: 0.9,
  serviceQuality: 0.86,
};

const external = {
  id: 'external-health-gift',
  productName: '외부 건강 선물',
  priceKrw: 49000,
  userFit: 0.91,
  affordability: 0.95,
  serviceQuality: 0.84,
};

test('general Mall recommendation fails closed when only EKODI affiliate products are available', async () => {
  const result = await evaluateMallJubileeRecommendation({
    scope: 'open_market',
    products: [internal],
  });

  assert.equal(result.actionable, false);
  assert.equal(result.nextAction, 'discover_external_alternatives');
  assert.equal(result.evaluation.externalAlternativeLookupRequired, true);
});

test('explicit EKODI catalog browsing is allowed but disclosed as catalog-scoped', async () => {
  const result = await evaluateMallJubileeRecommendation({
    scope: 'ekodi_catalog',
    products: [internal],
  });

  assert.equal(result.actionable, true);
  assert.match(result.scopeDisclosure, /limited to products currently connected to EKODI Mall/i);
  assert.equal(result.evaluation.choiceSet[0].id, 'ekodi-hongsam');
  assert.equal(result.evaluation.disclosures[0].type, 'commercial_relationship');
});

test('open-market recommendation keeps a better external option first and preserves EKODI as a disclosed alternative', async () => {
  const result = await evaluateMallJubileeRecommendation({
    scope: 'open_market',
    products: [internal],
    externalProducts: [external],
  });

  assert.equal(result.actionable, true);
  assert.equal(result.evaluation.choiceSet[0].id, 'external-health-gift');
  assert.ok(result.evaluation.choiceSet.some(item => item.id === 'ekodi-hongsam'));
  assert.ok(result.evaluation.disclosures.some(item => item.candidateId === 'ekodi-hongsam'));
});

test('Mall execution remains bound to the user-selected evaluated product', async () => {
  const result = await evaluateMallJubileeRecommendation({
    scope: 'open_market',
    products: [internal],
    externalProducts: [external],
  });

  const allowed = authorizeMallJubileeChoice(result, 'external-health-gift');
  const hidden = authorizeMallJubileeChoice(result, 'hidden-higher-margin-product');

  assert.equal(allowed.allowed, true);
  assert.equal(hidden.allowed, false);
  assert.equal(hidden.reason, 'candidate_not_in_jubilee_choice_set');
});

test('external commercial relationships must also be disclosed', async () => {
  const result = await evaluateMallJubileeRecommendation({
    scope: 'open_market',
    products: [internal],
    externalProducts: [{
      ...external,
      commercialRelationship: true,
      commercialDisclosure: '',
    }],
  });

  assert.equal(result.actionable, false);
  assert.equal(result.nextAction, 'discover_external_alternatives');
  assert.ok(result.evaluation.audit.rulesTriggered.includes('conflicted_candidates_excluded'));
});
