import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = process.cwd();

function run(command, args, env) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('guarded Cloudflare production context rejects non-main GitHub Actions', () => {
  const result = run(process.execPath, ['scripts/validate-ai-provider-independence.mjs'], {
    GITHUB_ACTIONS: 'true',
    GITHUB_REF: 'refs/heads/feature/security-test',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    AI_PROVIDER: 'NONE',
    CLOUDFLARE_API_TOKEN: 'test-token-never-used',
    CLOUDFLARE_ACCOUNT_ID: 'test-account-never-used',
  });

  assert.equal(result.status, 3);
  assert.match(`${result.stdout}\n${result.stderr}`, /Production release context blocked/);
});

test('guarded Cloudflare production context rejects pull requests even if ref is main', () => {
  const result = run(process.execPath, ['scripts/validate-ai-provider-independence.mjs'], {
    GITHUB_ACTIONS: 'true',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'pull_request_target',
    AI_PROVIDER: 'NONE',
    CLOUDFLARE_API_TOKEN: 'test-token-never-used',
    CLOUDFLARE_ACCOUNT_ID: 'test-account-never-used',
  });

  assert.equal(result.status, 3);
  assert.match(`${result.stdout}\n${result.stderr}`, /Production release context blocked/);
});

test('production D1 migration exits before Wrangler on non-main GitHub Actions', () => {
  const result = run('bash', ['scripts/apply-d1-migrations-with-retry.sh', 'ekodi-auth', 'wrangler.api.toml', '4.119.0'], {
    GITHUB_ACTIONS: 'true',
    GITHUB_REF: 'refs/heads/development',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
  });

  assert.equal(result.status, 3);
  assert.match(`${result.stdout}\n${result.stderr}`, /Production D1 migration blocked/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /wrangler@/i);
});
