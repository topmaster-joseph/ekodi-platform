import test from 'node:test';
import assert from 'node:assert/strict';

import {
  executeJubileeConnection,
  prepareJubileeConnection,
} from '../jubilee-connection-service.js';

const candidates = [
  {
    id: 'ekodi-expert',
    kind: 'expert',
    label: 'EKODI Expert',
    source: 'ekodi',
    user_fit: 0.82,
  },
  {
    id: 'outside-expert',
    kind: 'expert',
    label: 'Outside Expert',
    source: 'external',
    user_fit: 0.94,
  },
];

test('connection preparation preserves a better external expert first', async () => {
  const prepared = await prepareJubileeConnection({ candidates });
  assert.equal(prepared.status, 'choice_required');
  assert.equal(prepared.gate.evaluation.choiceSet[0].id, 'outside-expert');
});
test('connection execution is bound to the explicit evaluated user choice', async () => {
  const prepared = await prepareJubileeConnection({
    candidates,
    user_choice: { candidate_id: 'ekodi-expert' },
  });
  const calls = [];
  const result = await executeJubileeConnection(prepared, async input => {
    calls.push(input);
    return { connectionRef: 'connection:test-1' };
  });

  assert.equal(prepared.selection.allowed, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.candidate.id, 'ekodi-expert');
  assert.equal(result.connectionRef, 'connection:test-1');
  assert.deepEqual(calls[0].candidate, {
    id: 'ekodi-expert',
    kind: 'expert',
    label: 'EKODI Expert',
    source: 'ekodi',
  });
});

test('hidden candidate substitution never reaches the connector', async () => {
  const prepared = await prepareJubileeConnection({
    candidates,
    user_choice: { candidate_id: 'hidden-margin-choice' },
  });
  let called = false;
  await assert.rejects(
    () => executeJubileeConnection(prepared, async () => { called = true; }),
    /candidate_not_in_jubilee_choice_set/,
  );
  assert.equal(called, false);
});

test('known outside alternatives fail closed when only EKODI candidates are supplied', async () => {
  const prepared = await prepareJubileeConnection({
    request_context: { externalAlternativesKnown: true },
    candidates: [candidates[0]],
    user_choice: { candidate_id: 'ekodi-expert' },
  });

  assert.equal(prepared.gate.actionable, false);
  assert.equal(prepared.gate.nextAction, 'discover_external_alternatives');
  assert.equal(prepared.selection.allowed, false);
});

test('undisclosed commercial relationship cannot become a connectable candidate', async () => {
  const prepared = await prepareJubileeConnection({
    candidates: [{
      id: 'partner',
      kind: 'service_provider',
      label: 'Partner',
      source: 'external',
      user_fit: 0.99,
      commercial_relationship: true,
    }],
    user_choice: { candidate_id: 'partner' },
  });
  assert.equal(prepared.gate.evaluation.choiceSet.length, 0);
  assert.equal(prepared.selection.allowed, false);
});

test('only supported human/service connection kinds are accepted', async () => {
  await assert.rejects(
    () => prepareJubileeConnection({
      candidates: [{ id: 'x', kind: 'advertiser', label: 'Ad', source: 'external' }],
    }),
    /invalid_jubilee_connection_kind/,
  );
});
