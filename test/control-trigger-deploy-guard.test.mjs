import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-control-api.yml', import.meta.url), 'utf8');
const validator = await readFile(new URL('../scripts/validate-deployment-guardrails.mjs', import.meta.url), 'utf8');

test('Control production keeps guarded artifact promotion and deploys only route/cron triggers afterward', () => {
  assert.match(workflow, /guarded-worker-release\.mjs --manifest deploy\/manifests\/control-api\.worker\.json/);
  assert.match(workflow, /wrangler@\$\{WRANGLER_VERSION\} triggers deploy --config wrangler\.api\.toml/);
  assert.doesNotMatch(workflow, /wrangler@\$\{WRANGLER_VERSION\}\s+deploy\s+--config\s+wrangler\.api\.toml/);
});

test('deployment guard distinguishes trigger synchronization from an unsafe direct Worker deploy', () => {
  assert.match(validator, /forbidPattern\('\.github\/workflows\/deploy-control-api\.yml'/);
  assert.ok(validator.includes("/wrangler(?:@[^\\s]+)?\\s+deploy\\s+--config\\s+wrangler\\.api\\.toml/"));
  assert.doesNotMatch(validator, /forbidText\('\.github\/workflows\/deploy-control-api\.yml',[^\n]*deploy --config wrangler\.api\.toml/);
});
