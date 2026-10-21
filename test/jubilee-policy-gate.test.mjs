import test from 'node:test';
import assert from 'node:assert/strict';

import { authorizeJubileeSelection, runJubileePolicyGate } from '../jubilee-policy-gate.js';

test('holds execution when known external alternatives have not been included', async () => {
  const gate = await runJubileePolicyGate({
    workspace_id: 'ws_test',
    purpose: 'mall_recommendation',
    market: { externalAlternativesKnown: true },
    candidates: [{ id: 'internal', source: 'ekodi', userFit: 0.9 }],
  });

  assert.equal(gate.actionable, false);
  assert.equal(gate.reason, 'external_alternative_lookup_required');
  assert.equal(gate.nextAction, 'discover_external_alternatives');
});

test('allows presentation only after a valid multi-source choice set is ready', async () => {
  const gate = await runJubileePolicyGate({
    candidates: [
      { id: 'internal', source: 'ekodi', userFit: 0.84 },
      { id: 'external', source: 'external', userFit: 0.92 },
    ],
  });

  assert.equal(gate.actionable, true);
  assert.equal(gate.nextAction, 'present_choice_to_user');
  assert.equal(gate.evaluation.choiceSet[0].id, 'external');
  assert.ok(gate.evaluation.choiceSet.some(item => item.id === 'internal'));
});

test('blocks execution of a candidate that was not in the Jubilee choice set', async () => {
  const gate = await runJubileePolicyGate({
    candidates: [
      { id: 'a', source: 'ekodi', userFit: 0.8 },
      { id: 'b', source: 'external', userFit: 0.85 },
    ],
  });

  const authorization = authorizeJubileeSelection(gate, 'hidden-high-margin-option');
  assert.equal(authorization.allowed, false);
  assert.equal(authorization.reason, 'candidate_not_in_jubilee_choice_set');
});

test('authorizes an explicit user choice that is inside the Jubilee choice set', async () => {
  const gate = await runJubileePolicyGate({
    candidates: [
      { id: 'a', source: 'ekodi', userFit: 0.8 },
      { id: 'b', source: 'external', userFit: 0.85 },
    ],
  });

  const authorization = authorizeJubileeSelection(gate, 'a');
  assert.equal(authorization.allowed, true);
  assert.equal(authorization.candidate.id, 'a');
  assert.equal(authorization.policyVersion, '1.0.0');
});

test('gate audit envelope excludes raw need signals and candidate bodies', async () => {
  const audits = [];
  await runJubileePolicyGate({
    workspace_id: 'ws_test',
    purpose: 'support_connection',
    context: {
      needSignals: [{ type: 'affordability_constraint', source: 'user_provided' }],
    },
    candidates: [{ id: 'service', source: 'ekodi', userFit: 0.9 }],
  }, {
    audit: async event => audits.push(event),
  });

  assert.equal(audits.length, 1);
  assert.equal(audits[0].workspaceId, 'ws_test');
  assert.equal(audits[0].purpose, 'support_connection');
  assert.equal('needSignals' in audits[0], false);
  assert.equal('context' in audits[0], false);
  assert.equal('candidates' in audits[0], false);
});

test('sensitive-trait inference makes the gate non-actionable and requires review', async () => {
  const gate = await runJubileePolicyGate({
    context: { sensitiveTraitInferenceUsed: true },
    candidates: [{ id: 'service', source: 'ekodi', userFit: 1 }],
  });

  assert.equal(gate.actionable, false);
  assert.equal(gate.nextAction, 'human_review');
  assert.equal(gate.evaluation.humanReviewRequired, true);
});
