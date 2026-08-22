import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async file => readFile(new URL(file, root), 'utf8');

test('EKODI keeps separate user experience and administrator control planes', async () => {
  const constitution = await read('AGENTS.md');
  const myHome = await read('my/index.html');
  assert.match(constitution, /`admin\.ekodi\.kr`: private control plane and operational command center/);
  assert.match(myHome, /모든 일반사용자를 위한 EKODI 개인 홈/);
  assert.match(myHome, /data-ekodi-ui="USER"/);
  assert.match(myHome, /내 공간/);
  assert.match(myHome, /Google로 시작/);
});

test('EKODI identity remains person-space-role and shared Shell is mandatory for user-facing services', async () => {
  const manifest = await read('ekodi-service-manifest.js');
  assert.match(manifest, /identityModel: 'person-space-role'/);
  assert.match(manifest, /shellPolicy: 'required-for-user-facing-services'/);
  assert.match(manifest, /id:'my'/);
  assert.match(manifest, /id:'community'/);
});

test('core service survives without an AI provider', async () => {
  const policy = JSON.parse(await read('config/ai-provider-independence.json'));
  const runtime = await read('ai-resilience-runtime.js');
  assert.equal(policy.defaultPolicy.providerRequiredForCoreService, false);
  assert.equal(policy.defaultPolicy.providerFailureMustNotFailCoreRequest, true);
  assert.equal(policy.defaultPolicy.fallbackMode, 'free_assist');
  assert.equal(policy.defaultPolicy.finalFallbackMode, 'core');
  assert.match(runtime, /providerIndependentCore: true/);
  assert.match(runtime, /runAiEnhancedTask/);
});

test('production releases remain guarded and no-provider survival is part of CI', async () => {
  const ci = await read('.github/workflows/ci.yml');
  const sharedRelease = await read('.github/workflows/deploy.yml');
  const apiRelease = await read('.github/workflows/deploy-control-api.yml');
  assert.match(ci, /test:ai-none/);
  assert.match(sharedRelease, /guarded-worker-release\.mjs/);
  assert.match(sharedRelease, /test:ai-none/);
  assert.match(apiRelease, /guarded-worker-release\.mjs/);
  assert.match(apiRelease, /test:ai-none/);
});

test('staging configurations exist for control, My EKODI, Shell, and shared proxy', async () => {
  const required = [
    'wrangler.api.staging.toml',
    'wrangler.my.staging.toml',
    'wrangler.shell.staging.toml',
    'wrangler.shared-sites.staging.toml',
  ];
  for (const file of required) {
    const content = await read(file);
    assert.match(content, /staging/i, `${file} must remain explicitly isolated for staging`);
  }
});
