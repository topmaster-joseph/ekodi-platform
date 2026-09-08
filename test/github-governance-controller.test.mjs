import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const config = JSON.parse(fs.readFileSync('config/github-governance.json', 'utf8'));
const source = fs.readFileSync('scripts/github-governance-controller.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/github-governance-audit.yml', 'utf8');
const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const bootstrap = fs.readFileSync('scripts/apply-github-governance.ps1', 'utf8');

test('main governance contract is fail-closed around source changes', () => {
  const policy = config.branchProtection;
  assert.equal(config.defaultBranch, 'main');
  assert.equal(policy.required, true);
  assert.equal(policy.requirePullRequest, true);
  assert.equal(policy.enforceAdmins, true);
  assert.equal(policy.allowForcePushes, false);
  assert.equal(policy.allowDeletions, false);
  assert.deepEqual(policy.requiredStatusChecks, ['EKODI AI Orchestration Gate', 'test']);
});

test('controller supports audit and explicit admin-token application', () => {
  assert.match(source, /EKODI_GITHUB_ADMIN_TOKEN/);
  assert.match(source, /method: 'PUT'/);
  assert.match(source, /required_pull_request_reviews/);
  assert.match(source, /allow_force_pushes/);
  assert.match(source, /allow_deletions/);
});

test('workflow audits continuously and never applies without explicit dispatch', () => {
  assert.match(workflow, /cron: '17 \*\/6 \* \* \*'/);
  assert.match(workflow, /inputs\.apply/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.apply/);
  assert.match(workflow, /secrets\.EKODI_GITHUB_ADMIN_TOKEN/);
  assert.match(workflow, /APPLY_MAIN_PROTECTION/);
  assert.match(workflow, /validate-ekodi-ai-change-orchestration\.mjs.*--release/);
  assert.match(workflow, /--live --report-only/);
  assert.match(workflow, /main branch protection drift/);
  assert.match(ci, /github-governance-audit\.yml/);
});

test('static governance contract validator executes successfully', () => {
  const output = execFileSync(process.execPath, ['scripts/github-governance-controller.mjs', '--contract'], {
    encoding: 'utf8',
  });
  assert.match(output, /GitHub governance contract .* is valid/);
});

test('apply fails closed before any network mutation without the admin token', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/github-governance-controller.mjs', '--apply'], {
    encoding: 'utf8',
    env: { ...process.env, EKODI_GITHUB_ADMIN_TOKEN: '', GITHUB_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
});

test('local bootstrap keeps the admin token ephemeral and least-lived', () => {
  assert.match(bootstrap, /expires_in=1&administration=write/);
  assert.match(bootstrap, /Read-Host 'Fine-grained PAT' -AsSecureString/);
  assert.match(bootstrap, /EKODI_GITHUB_ADMIN_TOKEN/);
  assert.match(bootstrap, /ZeroFreeBSTR/);
  assert.match(bootstrap, /github-governance-controller\.mjs' --apply/);
  assert.match(bootstrap, /github-governance-controller\.mjs' --live/);
});
