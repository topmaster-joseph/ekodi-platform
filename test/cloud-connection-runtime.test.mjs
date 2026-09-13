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
