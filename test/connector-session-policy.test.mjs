import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECTOR_STATES,
  DEFAULT_CONNECTOR_POLICY,
  normalizeConnectorState,
  isConnectorUsable,
  shouldRefreshConnector,
  nextRetryDelay,
  chooseConnector,
  operaBrowserConnectorPolicy,
} from '../connector-session-policy.js';

test('connector states normalize safely', () => {
  assert.equal(normalizeConnectorState('CONNECTED'), CONNECTOR_STATES.CONNECTED);
  assert.equal(normalizeConnectorState('unknown'), CONNECTOR_STATES.UNAVAILABLE);
});

test('only connected and degraded connectors are routable', () => {
  assert.equal(isConnectorUsable({ state: 'connected' }), true);
  assert.equal(isConnectorUsable({ state: 'degraded' }), true);
  assert.equal(isConnectorUsable({ state: 'reauth_required' }), false);
  assert.equal(isConnectorUsable({ state: 'unavailable' }), false);
});

test('silent refresh is requested before expiry when supported', () => {
  const now = Date.UTC(2026, 8, 10, 0, 0, 0);
  assert.equal(shouldRefreshConnector({
    supportsSilentRefresh: true,
    expiresAt: new Date(now + DEFAULT_CONNECTOR_POLICY.refreshLeadTimeMs - 1).toISOString(),
  }, now), true);
  assert.equal(shouldRefreshConnector({
    supportsSilentRefresh: false,
    expiresAt: new Date(now + 1000).toISOString(),
  }, now), false);
});

test('backoff is bounded', () => {
  assert.equal(nextRetryDelay(0), 1000);
  assert.equal(nextRetryDelay(1), 2000);
  assert.equal(nextRetryDelay(10), DEFAULT_CONNECTOR_POLICY.maxBackoffMs);
});

test('routing prefers a healthy connected connector', () => {
  const chosen = chooseConnector([
    { id: 'a', state: 'reauth_required' },
    { id: 'b', state: 'degraded' },
    { id: 'c', state: 'connected' },
  ]);
  assert.equal(chosen.id, 'c');
});

test('Opera policy keeps the connection after a task without bypassing provider expiry', () => {
  const policy = operaBrowserConnectorPolicy();
  assert.equal(policy.disconnectAfterTask, false);
  assert.equal(policy.allowExpiryBypass, false);
  assert.equal(policy.requireExplicitReauthWhenProviderDemandsIt, true);
  assert.equal(policy.storeShortLivedBrowserCredentials, false);
});
