import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_CONNECTION_POLICY,
  getCloudConnectionStatus,
  isOperaConnectorEnabled,
  runCloudConnectedTask,
} from '../cloud-connection-runtime.js';

test('Opera connector is optional and disabled by default', () => {
  assert.equal(CLOUD_CONNECTION_POLICY.operaRequired, false);
  assert.equal(isOperaConnectorEnabled({}), false);
  const status = getCloudConnectionStatus({}, [
    { id: 'opera', kind: 'opera_browser', state: 'connected', invoke: async () => 'opera' },
  ]);
  assert.deepEqual(status.usableProviders, []);
});

test('official API is preferred over browser providers', async () => {
  const result = await runCloudConnectedTask({
    env: { OPERA_BROWSER_CONNECTOR_ENABLED: 'true' },
    providers: [
      { id: 'opera', kind: 'opera_browser', state: 'connected', invoke: async () => 'opera' },
      { id: 'api', kind: 'official_api', state: 'connected', invoke: async () => 'api' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'api');
  assert.equal(result.value, 'api');
});

test('refreshable cloud credential refreshes before use', async () => {
  let refreshed = false;
  const result = await runCloudConnectedTask({
    providers: [
      {
        id: 'oauth',
        kind: 'oauth_cloud',
        state: 'refreshable',
        refresh: async () => { refreshed = true; return { ok: true }; },
        invoke: async () => 'ok',
      },
    ],
  });
  assert.equal(refreshed, true);
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'oauth');
});

test('provider failure automatically falls through to next authorized provider', async () => {
  const result = await runCloudConnectedTask({
    providers: [
      { id: 'api', kind: 'official_api', state: 'connected', invoke: async () => { throw new Error('down'); } },
      { id: 'plugin', kind: 'connected_plugin', state: 'connected', invoke: async () => 'fallback' },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.attemptedProviders, ['api', 'plugin']);
  assert.equal(result.value, 'fallback');
});

test('login, consent, MFA or reauthentication is never bypassed', async () => {
  let invoked = false;
  const result = await runCloudConnectedTask({
    providers: [
      {
        id: 'oauth',
        kind: 'oauth_cloud',
        state: 'needs_user_auth',
        userAction: { type: 'mfa', instruction: 'Complete MFA with the provider.' },
        invoke: async () => { invoked = true; },
      },
    ],
  });
  assert.equal(invoked, false);
  assert.equal(result.ok, false);
  assert.equal(result.requiresUserAction, true);
  assert.equal(result.userAction.type, 'mfa');
});

test('Opera can be an explicit last-resort provider without becoming a dependency', async () => {
  const result = await runCloudConnectedTask({
    env: { OPERA_BROWSER_CONNECTOR_ENABLED: 'true' },
    providers: [
      { id: 'cloud', kind: 'cloud_browser', state: 'unavailable', invoke: async () => 'cloud' },
      { id: 'opera', kind: 'opera_browser', state: 'connected', invoke: async () => 'opera' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'opera');
});

test('remote desktop with zero remaining quota is skipped before invocation', async () => {
  let remoteInvoked = false;
  const status = getCloudConnectionStatus({}, [
    {
      id: 'remote',
      kind: 'remote_desktop',
      state: 'connected',
      quotaRemainingPercent: '0%',
      invoke: async () => { remoteInvoked = true; return 'remote'; },
    },
  ]);
  assert.deepEqual(status.usableProviders, []);
  assert.equal(status.skippedProviders[0].reason, 'quota_exhausted');
  assert.equal(status.skippedProviders[0].quotaRemainingPercent, 0);

  const result = await runCloudConnectedTask({
    providers: [
      {
        id: 'remote',
        kind: 'remote_desktop',
        state: 'connected',
        quotaRemainingPercent: 0,
        invoke: async () => { remoteInvoked = true; return 'remote'; },
      },
    ],
  });
  assert.equal(remoteInvoked, false);
  assert.equal(result.ok, false);
  assert.equal(result.skippedProviders[0].reason, 'quota_exhausted');
});

test('cloud provider is used while exhausted remote desktop remains skipped', async () => {
  let remoteInvoked = false;
  const result = await runCloudConnectedTask({
    providers: [
      {
        id: 'remote',
        kind: 'remote_desktop',
        state: 'connected',
        quotaRemainingPercent: 0,
        invoke: async () => { remoteInvoked = true; return 'remote'; },
      },
      {
        id: 'github',
        kind: 'connected_plugin',
        state: 'connected',
        invoke: async () => 'github-api',
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'github');
  assert.equal(result.value, 'github-api');
  assert.equal(remoteInvoked, false);
  assert.equal(result.skippedProviders[0].reason, 'quota_exhausted');
});

test('runtime classifies a quota failure and continues to the next authorized path', async () => {
  const result = await runCloudConnectedTask({
    providers: [
      {
        id: 'api-primary',
        kind: 'official_api',
        state: 'connected',
        invoke: async () => {
          const error = new Error('monthly quota exhausted');
          error.code = 'MONTHLY_QUOTA_EXHAUSTED';
          throw error;
        },
      },
      {
        id: 'github',
        kind: 'connected_plugin',
        state: 'connected',
        invoke: async () => 'continued',
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.attemptedProviders, ['api-primary', 'github']);
  assert.equal(result.skippedProviders[0].id, 'api-primary');
  assert.equal(result.skippedProviders[0].reason, 'quota_exhausted');
});

test('HTTP 429 is recorded as rate limited and does not become a user-auth request', async () => {
  const result = await runCloudConnectedTask({
    providers: [
      {
        id: 'api',
        kind: 'official_api',
        state: 'connected',
        invoke: async () => {
          const error = new Error('Too many requests');
          error.status = 429;
          throw error;
        },
      },
      { id: 'plugin', kind: 'connected_plugin', state: 'connected', invoke: async () => 'ok' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.requiresUserAction, false);
  assert.equal(result.skippedProviders[0].reason, 'rate_limited');
});
