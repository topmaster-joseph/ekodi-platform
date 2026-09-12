import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createJubileeCapabilityAuthorizer,
  hashJubileeBearerToken,
  parseJubileeCapabilityGrants,
} from '../jubilee-capability-auth.js';

const TOKEN = 'jubilee-test-token-abcdefghijklmnopqrstuvwxyz-123456';

async function grants(capabilities = ['jubilee.evaluate'], expiresAt = null) {
  return JSON.stringify([{
    tokenSha256: await hashJubileeBearerToken(TOKEN),
    actorId: 'service:test-client',
    capabilities,
    ...(expiresAt ? { expiresAt } : {}),
  }]);
}

function requestWithToken(token = TOKEN) {
  return new Request('https://api.ekodi.kr/api/jubilee/v1/evaluate', {
    headers: { authorization: `Bearer ${token}` },
  });
}

test('stores only hashed bearer grants and authorizes the exact capability', async () => {
  const raw = await grants(['jubilee.evaluate']);
  const parsed = parseJubileeCapabilityGrants(raw);
  assert.equal(parsed.length, 1);
  assert.match(parsed[0].tokenSha256, /^[a-f0-9]{64}$/);
  assert.equal(raw.includes(TOKEN), false);

  const authorize = createJubileeCapabilityAuthorizer({ grantsJson: raw });
  const result = await authorize(requestWithToken(), { capability: 'jubilee.evaluate' });
  assert.equal(result.allowed, true);
  assert.equal(result.actorId, 'service:test-client');
  assert.equal(result.authMethod, 'hashed_bearer_grant');
});

test('a valid token cannot exercise a capability it was not granted', async () => {
  const authorize = createJubileeCapabilityAuthorizer({ grantsJson: await grants(['jubilee.policy.read']) });
  const result = await authorize(requestWithToken(), { capability: 'jubilee.evaluate' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'jubilee_capability_not_granted');
});

test('unknown bearer token fails closed', async () => {
  const authorize = createJubileeCapabilityAuthorizer({ grantsJson: await grants() });
  const result = await authorize(requestWithToken('another-unknown-token-abcdefghijklmnopqrstuvwxyz'), { capability: 'jubilee.evaluate' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'jubilee_authorization_required');
});

test('expired service grants fail closed', async () => {
  const authorize = createJubileeCapabilityAuthorizer({
    grantsJson: await grants(['jubilee.evaluate'], '2020-01-01T00:00:00.000Z'),
  });
  const result = await authorize(requestWithToken(), { capability: 'jubilee.evaluate' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'jubilee_capability_grant_expired');
});

test('human/admin session fallback is disabled unless explicitly injected', async () => {
  const authorize = createJubileeCapabilityAuthorizer({ grantsJson: '[]' });
  const result = await authorize(new Request('https://api.ekodi.kr/api/jubilee/v1/evaluate'), { capability: 'jubilee.evaluate' });
  assert.equal(result.allowed, false);
});

test('injected sessions still need the exact requested capability', async () => {
  const authorize = createJubileeCapabilityAuthorizer({
    grantsJson: '[]',
    sessionVerifier: async () => ({
      allowed: true,
      actorId: 'session:platform-admin',
      capabilities: ['jubilee.policy.read'],
    }),
  });

  const denied = await authorize(new Request('https://api.ekodi.kr/api/jubilee/v1/evaluate'), { capability: 'jubilee.evaluate' });
  assert.equal(denied.allowed, false);

  const allowed = await authorize(new Request('https://api.ekodi.kr/api/jubilee/v1/policy'), { capability: 'jubilee.policy.read' });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.authMethod, 'capability_scoped_session');
});

test('malformed capability grant configuration is rejected at startup', () => {
  assert.throws(() => parseJubileeCapabilityGrants('[{"tokenSha256":"raw-token"}]'), /invalid_jubilee_grant_hash/);
});
