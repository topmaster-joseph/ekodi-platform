import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJubileePolicyEvent,
  buildJubileePoolEntry,
  buildJubileeSupportEvents,
  createJubileeOperationalStore,
} from '../jubilee-operational-store.js';

const SUPPORT_REF = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('policy event builder keeps only privacy-minimized operational fields', () => {
  const event = buildJubileePolicyEvent({
    requestId: 'req_1',
    workspaceId: 'ws_test',
    purpose: 'mall_recommendation',
    policyVersion: '1.0.0',
    decisionStatus: 'ready',
    candidateCount: 3,
    choiceCount: 2,
    supportActionCount: 1,
    rulesTriggered: ['provider_choice_diversity_preserved'],
    warningCount: 0,
    actorId: 'raw-person-id-must-not-persist',
    needSignals: [{ type: 'affordability_constraint' }],
    context: { private: true },
    candidates: [{ id: 'private-candidate-body' }],
  });

  assert.equal(event.request_id, 'req_1');
  assert.equal(event.workspace_id, 'ws_test');
  assert.equal('actorId' in event, false);
  assert.equal('needSignals' in event, false);
  assert.equal('context' in event, false);
  assert.equal('candidates' in event, false);
  assert.equal(event.actor_ref_hash, null);
});

test('raw actor identifiers are never accepted as actor_ref_hash', () => {
  const event = buildJubileePolicyEvent({
    requestId: 'req_2',
    policyVersion: '1.0.0',
    decisionStatus: 'ready',
    actorRefHash: 'person-123',
  });
  assert.equal(event.actor_ref_hash, null);
});

test('support event builder uses only opaque support reference and bounded action codes', () => {
  const events = buildJubileeSupportEvents({
    requestId: 'req_3',
    workspaceId: 'ws_test',
    supportRef: SUPPORT_REF,
    supportActions: ['consider_jubilee_credit', 'offer_language_support'],
    policyVersion: '1.0.0',
    beneficiaryId: 'must-not-persist',
    needReason: 'must-not-persist',
  });

  assert.equal(events.length, 2);
  assert.ok(events.every(event => event.support_ref === SUPPORT_REF));
  assert.ok(events.every(event => !('beneficiaryId' in event)));
  assert.ok(events.every(event => !('needReason' in event)));
});

test('support event builder rejects non-opaque support references', () => {
  assert.throws(() => buildJubileeSupportEvents({
    supportRef: 'user@example.com',
    supportActions: ['consider_jubilee_credit'],
    policyVersion: '1.0.0',
  }), /opaque_support_ref_required/);
});

test('Jubilee Pool entry requires an opaque support reference for beneficiary-facing flows', () => {
  assert.throws(() => buildJubileePoolEntry({
    entryType: 'support_commitment',
    purpose: 'fee_relief',
    amountMinor: 5000,
    currency: 'KRW',
    policyVersion: '1.0.0',
  }), /jubilee_pool_support_ref_required/);

  const entry = buildJubileePoolEntry({
    entryType: 'support_commitment',
    purpose: 'fee_relief',
    amountMinor: 5000,
    currency: 'KRW',
    supportRef: SUPPORT_REF,
    policyVersion: '1.0.0',
    beneficiaryId: 'must-not-persist',
  });

  assert.equal(entry.amount_minor, 5000);
  assert.equal(entry.support_ref, SUPPORT_REF);
  assert.equal('beneficiaryId' in entry, false);
});

test('operational store remains replaceable through an injected persistence adapter', async () => {
  const writes = { policy: [], support: [], pool: [] };
  const store = createJubileeOperationalStore({
    appendPolicyEvent: async event => writes.policy.push(event),
    appendSupportEvents: async events => writes.support.push(...events),
    appendPoolEntry: async entry => writes.pool.push(entry),
  });

  await store.recordPolicyEvent({
    requestId: 'req_4',
    policyVersion: '1.0.0',
    decisionStatus: 'ready',
  });
  await store.recordSupportEvents({
    requestId: 'req_4',
    supportRef: SUPPORT_REF,
    supportActions: ['consider_fee_waiver'],
    policyVersion: '1.0.0',
  });
  await store.recordPoolEntry({
    entryType: 'platform_allocation',
    purpose: 'access_support',
    amountMinor: 10000,
    currency: 'KRW',
    policyVersion: '1.0.0',
  });

  assert.equal(writes.policy.length, 1);
  assert.equal(writes.support.length, 1);
  assert.equal(writes.pool.length, 1);
});
