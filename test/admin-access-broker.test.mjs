import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderRegistry } from '../external-provider-control.js';

test('admin access broker reports all providers without exposing credential values', async () => {
  const env = {
    ENVIRONMENT:'development',
    CLOUDFLARE_ACCOUNT_ID:'account-id-for-test',
    CLOUDFLARE_SECRET_MANAGER_TOKEN:'cf-secret-value',
    GITHUB_CONTROL_TOKEN:'github-secret-value',
    GITHUB_CONTROL_OWNER:'ekodi-test',
    SUPABASE_CONTROL_URL:'https://example.supabase.co',
    SUPABASE_CONTROL_KEY:'supabase-secret-value',
    GOOGLE_DRIVE_CONTROL_ACCESS_TOKEN:'google-secret-value',
  };
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url:String(url), headers:new Headers(init.headers || {}) });
    return new Response('{}', { status:200, headers:{ 'content-type':'application/json' } });
  };

  const registry = await buildProviderRegistry(env, { fetchImpl });
  assert.deepEqual(registry.providers.map(provider => provider.id), ['cloudflare','github','supabase','google_drive']);
  assert.equal(registry.summary.connected, 4);
  assert.equal(registry.policy.environment, 'development');
  assert.equal(registry.policy.credentialValuesReturned, false);
  const serialized = JSON.stringify(registry);
  for (const secret of ['cf-secret-value','github-secret-value','supabase-secret-value','google-secret-value']) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(calls.length, 4);
});

test('admin access broker isolates unconfigured providers and production remains observe-only', async () => {
  const registry = await buildProviderRegistry({ ENVIRONMENT:'production' }, {
    fetchImpl:async () => { throw new Error('network should not be called'); },
  });
  assert.equal(registry.summary.unconfigured, 4);
  assert.equal(registry.policy.production, true);
  assert.equal(registry.policy.mode, 'observe');
  assert.equal(registry.policy.destructiveProductionActions, false);
  for (const provider of registry.providers) {
    assert.equal(provider.connected, false);
    assert.deepEqual(provider.capabilities.enabled, []);
  }
});
