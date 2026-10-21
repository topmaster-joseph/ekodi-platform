import test from 'node:test';
import assert from 'node:assert/strict';

import { handleJubileeSharedApi } from '../jubilee-shared-api.js';
import { hashJubileeBearerToken } from '../jubilee-capability-auth.js';

const TOKEN = 'jubilee-test-bearer-token-abcdefghijklmnopqrstuvwxyz';

async function grant(capabilities) {
  return [{
    tokenSha256: await hashJubileeBearerToken(TOKEN),
    actorId: 'service:test-jubilee',
    capabilities,
  }];
}

function authorizedRequest(path, method = 'GET', body) {
  return new Request(`https://api.ekodi.kr${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('Jubilee shared API is off by default', async () => {
  const response = await handleJubileeSharedApi(
    authorizedRequest('/api/jubilee/v1/policy'),
    {},
  );
  assert.equal(response.status, 404);
});

test('policy read in shadow mode requires only policy capability, not ledger credentials', async () => {
  const response = await handleJubileeSharedApi(
    authorizedRequest('/api/jubilee/v1/policy'),
    { JUBILEE_API_MODE: 'shadow' },
    { grants: await grant(['jubilee.policy.read']) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-ekodi-jubilee-mode'), 'shadow');
});

test('evaluation in shadow mode fails closed without durable ledger configuration', async () => {
  const response = await handleJubileeSharedApi(
    authorizedRequest('/api/jubilee/v1/evaluate', 'POST', { candidates: [] }),
    { JUBILEE_API_MODE: 'shadow' },
    { grants: await grant(['jubilee.evaluate']) },
  );
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.code, 'JUBILEE_INTEGRATION_NOT_READY');
});

test('authorized shadow evaluation persists minimized audit before releasing result', async () => {
  const writes = [];
  const response = await handleJubileeSharedApi(
    authorizedRequest('/api/jubilee/v1/evaluate', 'POST', {
      workspace_id: 'ws-test',
      purpose: 'discovery',
      context: { needSignals: [{ type: 'affordability_constraint', source: 'user_provided' }] },
      candidates: [
        { id: 'external', source: 'external', userFit: 0.93 },
        {
          id: 'ekodi',
          source: 'ekodi',
          userFit: 0.82,
          commercialRelationship: true,
          commercialDisclosure: 'EKODI may receive a referral benefit.',
        },
      ],
    }),
    { JUBILEE_API_MODE: 'shadow' },
    {
      grants: await grant(['jubilee.evaluate']),
      postgrestUrl: 'https://ledger.example.test/rest/v1',
      postgrestServiceToken: 'ledger-service-token-abcdefghijklmnopqrstuvwxyz',
      fetch: async (url, init) => {
        writes.push({ url, rows: JSON.parse(init.body) });
        return { ok: true, status: 201 };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-ekodi-jubilee-mode'), 'shadow');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url, 'https://ledger.example.test/rest/v1/jubilee_policy_events');
  assert.equal(writes[0].rows[0].workspace_id, 'ws-test');
  assert.match(writes[0].rows[0].actor_ref_hash, /^[a-f0-9]{64}$/);
  assert.equal('context' in writes[0].rows[0], false);
  assert.equal('candidates' in writes[0].rows[0], false);
  const payload = await response.json();
  assert.equal(payload.choiceSet[0].id, 'external');
});

test('durable ledger write failure suppresses Jubilee evaluation result', async () => {
  const response = await handleJubileeSharedApi(
    authorizedRequest('/api/jubilee/v1/evaluate', 'POST', {
      candidates: [{ id: 'external', source: 'external', userFit: 0.9 }],
    }),
    { JUBILEE_API_MODE: 'active' },
    {
      grants: await grant(['jubilee.evaluate']),
      postgrestUrl: 'https://ledger.example.test/rest/v1',
      postgrestServiceToken: 'ledger-service-token-abcdefghijklmnopqrstuvwxyz',
      fetch: async () => ({ ok: false, status: 503 }),
    },
  );
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.code, 'JUBILEE_AUDIT_PERSISTENCE_FAILED');
});
