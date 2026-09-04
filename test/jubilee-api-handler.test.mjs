import test from 'node:test';
import assert from 'node:assert/strict';

import { handleJubileeApi } from '../jubilee-api-handler.js';

const allow = async () => ({ allowed: true, actorId: 'test-agent' });

test('fails closed when no authorization adapter is wired', async () => {
  const request = new Request('https://api.ekodi.kr/api/jubilee/v1/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidates: [] }),
  });

  const response = await handleJubileeApi(request);
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.code, 'JUBILEE_AUTH_ADAPTER_REQUIRED');
});

test('rejects unauthorized callers', async () => {
  const request = new Request('https://api.ekodi.kr/api/jubilee/v1/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidates: [] }),
  });

  const response = await handleJubileeApi(request, {}, {
    authorize: async () => ({ allowed: false, status: 401 }),
  });
  assert.equal(response.status, 401);
});

test('returns a Jubilee evaluation and emits privacy-minimized audit metadata', async () => {
  const audits = [];
  const request = new Request('https://api.ekodi.kr/api/jubilee/v1/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workspace_id: 'ws_test',
      context: {
        needSignals: [{ type: 'affordability_constraint', source: 'user_provided' }],
      },
      candidates: [
        {
          id: 'ekodi',
          source: 'ekodi',
          userFit: 0.75,
          commercialRelationship: true,
          commercialDisclosure: 'EKODI receives a referral benefit.',
        },
        { id: 'external', source: 'external', userFit: 0.92 },
      ],
    }),
  });

  const response = await handleJubileeApi(request, {}, {
    authorize: allow,
    audit: async event => audits.push(event),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.choiceSet[0].id, 'external');
  assert.ok(payload.supportActions.includes('consider_jubilee_credit'));
  assert.equal(audits.length, 1);
  assert.equal(audits[0].workspaceId, 'ws_test');
  assert.equal('needSignals' in audits[0], false);
});

test('blocks sensitive inference at the API boundary', async () => {
  const request = new Request('https://api.ekodi.kr/api/jubilee/v1/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      context: { sensitiveTraitInferenceUsed: true },
      candidates: [{ id: 'candidate', source: 'ekodi', userFit: 0.8 }],
    }),
  });

  const response = await handleJubileeApi(request, {}, { authorize: allow });
  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(payload.reason, 'sensitive_trait_inference_not_permitted');
});

test('returns null for unrelated API routes', async () => {
  const request = new Request('https://api.ekodi.kr/api/other', { method: 'GET' });
  const response = await handleJubileeApi(request, {}, { authorize: allow });
  assert.equal(response, null);
});
