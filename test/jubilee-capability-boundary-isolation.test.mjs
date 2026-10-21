import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  JUBILEE_CAPABILITY_PROVIDER,
  executeAuthorizedJubileeCapabilityRequest,
} from '../jubilee-capability-provider.js';
import shadowWorker from '../support-jubilee-shadow-worker.js';

const missionControlSource = await readFile(
  new URL('../mission-control-entry-worker.js', import.meta.url),
  'utf8',
);

test('Jubilee remains an independent capability provider, not a Mission Control route owner', () => {
  assert.equal(JUBILEE_CAPABILITY_PROVIDER.capabilityId, 'jubilee-policy-gate');
  assert.equal(JUBILEE_CAPABILITY_PROVIDER.providerType, 'ekodi-responsible');
  assert.doesNotMatch(missionControlSource, /handleJubileeSharedApi/);
  assert.doesNotMatch(missionControlSource, /\/api\/jubilee\/v1/);
});

test('Support shadow strips scoring and beneficiary identity while production stays absent', async () => {
  const payload = {
    jubileeConsent: true,
    assessment: {
      needScore: 0.99,
      beneficiaryIdentity: { name: 'private' },
      supportSignals: [{ type: 'affordability_constraint', source: 'consented', reason: 'private' }],
    },
  };
  const makeRequest = () => new Request('https://shadow.invalid/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const shadow = await shadowWorker.fetch(makeRequest(), {
    ENVIRONMENT: 'development',
    JUBILEE_MODE: 'shadow',
  });
  assert.equal(shadow.status, 200);
  const text = await shadow.text();
  assert.match(text, /affordability_constraint/);
  assert.doesNotMatch(text, /needScore/);
  assert.doesNotMatch(text, /beneficiaryIdentity/);

  const production = await shadowWorker.fetch(makeRequest(), {
    ENVIRONMENT: 'production',
    JUBILEE_MODE: 'shadow',
  });
  assert.equal(production.status, 404);
});

test('Core authorization is capability, operation and workspace scoped', async () => {
  const input = {
    requestId: 'req-core-1',
    operation: 'evaluate',
    contextProjection: {
      workspace_id: 'ws-one',
      candidates: [{ id: 'outside', source: 'external', userFit: 0.9 }],
    },
    constraints: {},
  };
  const mismatch = await executeAuthorizedJubileeCapabilityRequest(input, {
    allowed: true,
    capabilityId: 'jubilee-policy-gate',
    operations: ['evaluate'],
    workspaceId: 'ws-two',
  });
  assert.equal(mismatch.response.status, 'rejected');
  assert.ok(mismatch.response.warnings.includes('jubilee_core_workspace_mismatch'));

  const actorRefHash = 'a'.repeat(64);
  const allowed = await executeAuthorizedJubileeCapabilityRequest(input, {
    allowed: true,
    capabilityId: 'jubilee-policy-gate',
    operations: ['evaluate'],
    workspaceId: 'ws-one',
    actorRefHash,
  });
  assert.equal(allowed.response.status, 'ok');
  assert.equal(allowed.audit.actor_ref_hash, actorRefHash);
  assert.equal('context_projection' in allowed.audit, false);
});
