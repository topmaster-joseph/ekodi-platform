import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateJubileeRecommendation } from '../jubilee-runtime.js';

test('preserves a better external option instead of favoring EKODI margin', () => {
  const result = evaluateJubileeRecommendation({
    candidates: [
      {
        id: 'ekodi-option',
        source: 'ekodi',
        userFit: 0.72,
        serviceQuality: 0.9,
        commercialRelationship: true,
        commercialDisclosure: 'EKODI receives a referral benefit.',
      },
      {
        id: 'external-option',
        source: 'external',
        userFit: 0.91,
        serviceQuality: 0.84,
      },
    ],
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.choiceSet[0].id, 'external-option');
  assert.ok(result.choiceSet.some(item => item.id === 'ekodi-option'));
});

test('excludes an undisclosed commercial relationship', () => {
  const result = evaluateJubileeRecommendation({
    candidates: [
      {
        id: 'hidden-affiliate',
        source: 'ekodi',
        userFit: 0.95,
        commercialRelationship: true,
      },
      {
        id: 'clean-option',
        source: 'external',
        userFit: 0.82,
      },
    ],
  });

  assert.deepEqual(result.choiceSet.map(item => item.id), ['clean-option']);
  assert.ok(result.audit.rulesTriggered.includes('conflicted_candidates_excluded'));
});

test('does not permit sponsorship to secretly affect ranking', () => {
  const result = evaluateJubileeRecommendation({
    candidates: [
      {
        id: 'sponsored',
        source: 'ekodi',
        userFit: 1,
        sponsorshipAffectsRanking: true,
      },
      {
        id: 'organic',
        source: 'external',
        userFit: 0.7,
      },
    ],
  });

  assert.deepEqual(result.choiceSet.map(item => item.id), ['organic']);
});

test('derives discreet support only from allowed and consented need signals', () => {
  const result = evaluateJubileeRecommendation({
    context: {
      needSignals: [
        { type: 'affordability_constraint', source: 'user_provided' },
        { type: 'language_support_required', source: 'consented' },
        { type: 'unknown_social_label', source: 'user_provided' },
      ],
    },
    candidates: [{ id: 'service', source: 'ekodi', userFit: 0.9 }],
  });

  assert.ok(result.supportActions.includes('consider_fee_waiver'));
  assert.ok(result.supportActions.includes('consider_jubilee_credit'));
  assert.ok(result.supportActions.includes('offer_language_support'));
  assert.ok(result.audit.warnings.includes('ignored_need_signal:unknown_social_label'));
});

test('blocks sensitive-trait inference for support or ranking', () => {
  const result = evaluateJubileeRecommendation({
    context: { sensitiveTraitInferenceUsed: true },
    candidates: [{ id: 'service', source: 'ekodi', userFit: 0.9 }],
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'sensitive_trait_inference_not_permitted');
  assert.equal(result.humanReviewRequired, true);
});

test('requires external lookup when known alternatives were omitted', () => {
  const result = evaluateJubileeRecommendation({
    market: { externalAlternativesKnown: true },
    candidates: [{ id: 'internal-only', source: 'ekodi', userFit: 0.9 }],
  });

  assert.equal(result.externalAlternativeLookupRequired, true);
  assert.equal(result.humanReviewRequired, true);
});
