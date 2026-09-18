import test from 'node:test';
import assert from 'node:assert/strict';

import { createJubileePostgrestOperationalStore } from '../jubilee-postgrest-adapter.js';

const TOKEN = 'test-service-token-abcdefghijklmnopqrstuvwxyz';

test('PostgREST adapter writes only the minimized Jubilee policy event', async () => {
  const calls = [];
  const store = createJubileePostgrestOperationalStore({
    baseUrl: 'https://ledger.example.test/rest/v1',
    serviceToken: TOKEN,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 201 };
    },
  });

  await store.recordPolicyEvent({
    requestId: 'req-1',
    workspaceId: 'ws-1',
    purpose: 'mall_recommendation',
    decisionStatus: 'ready',
    policyVersion: '1.0.0',
    candidateCount: 2,
    choiceCount: 2,
    supportActionCount: 1,
    rulesTriggered: ['external_choice_preserved'],
    actorRefHash: 'a'.repeat(64),
    context: { needSignals: [{ type: 'affordability_constraint' }] },
    candidates: [{ id: 'secret-candidate-body' }],
    actorId: 'raw-service-id',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://ledger.example.test/rest/v1/jubilee_policy_events');
  assert.equal(calls[0].init.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].init.headers.prefer, 'return=minimal');
  const rows = JSON.parse(calls[0].init.body);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].request_id, 'req-1');
  assert.equal(rows[0].actor_ref_hash, 'a'.repeat(64));
  assert.equal('context' in rows[0], false);
  assert.equal('candidates' in rows[0], false);
  assert.equal('actorId' in rows[0], false);
});

test('PostgREST adapter writes support and Pool events through separate tables', async () => {
  const urls = [];
  const store = createJubileePostgrestOperationalStore({
    baseUrl: 'https://ledger.example.test/rest/v1/',
    serviceToken: TOKEN,
    fetch: async (url) => {
      urls.push(url);
      return { ok: true, status: 201 };
    },
  });

  const supportRef = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await store.recordSupportEvents({
    requestId: 'req-2',
    supportRef,
    policyVersion: '1.0.0',
    supportActions: ['consider_jubilee_credit'],
  });
  await store.recordPoolEntry({
    entryType: 'support_commitment',
    purpose: 'access_support',
    amountMinor: 1000,
    currency: 'KRW',
    supportRef,
    policyVersion: '1.0.0',
  });

  assert.deepEqual(urls, [
    'https://ledger.example.test/rest/v1/jubilee_support_events',
    'https://ledger.example.test/rest/v1/jubilee_pool_entries',
  ]);
});

test('PostgREST adapter rejects missing secrets and insecure remote URLs', () => {
  assert.throws(
    () => createJubileePostgrestOperationalStore({ baseUrl: 'https://ledger.example.test/rest/v1' }),
    /service_token_required/,
  );
  assert.throws(
    () => createJubileePostgrestOperationalStore({ baseUrl: 'http://ledger.example.test/rest/v1', serviceToken: TOKEN }),
    /https_required/,
  );
});

test('PostgREST write failures fail closed without embedding response bodies', async () => {
  const store = createJubileePostgrestOperationalStore({
    baseUrl: 'https://ledger.example.test/rest/v1',
    serviceToken: TOKEN,
    fetch: async () => ({ ok: false, status: 503 }),
  });

  await assert.rejects(
    () => store.recordPolicyEvent({
      requestId: 'req-fail',
      decisionStatus: 'blocked',
      policyVersion: '1.0.0',
    }),
    /jubilee_postgrest_write_failed:jubilee_policy_events:503/,
  );
});
