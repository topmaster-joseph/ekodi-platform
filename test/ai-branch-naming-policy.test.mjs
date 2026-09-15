import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/ai-change-orchestration-policy.json', import.meta.url), 'utf8'));
const workflow = fs.readFileSync(new URL('../.github/workflows/ekodi-ai-orchestration-gate.yml', import.meta.url), 'utf8');
const naming = policy.sourceControl?.branchNaming || {};
const requiredPattern = new RegExp(naming.requiredPattern || '^$');

function allowed(branch, actor) {
  if (requiredPattern.test(branch)) return true;
  return (naming.automatedBotExceptions || []).some(rule =>
    actor === rule.actor && branch.startsWith(rule.branchPrefix)
  );
}

test('AI change branches require ai/<agent>/<task-id>', () => {
  assert.equal(naming.format, 'ai/<agent>/<task-id>');
  assert.equal(allowed('ai/chatgpt/ekodibiz-operating-core-20260819', 'topmaster-joseph'), true);
  assert.equal(allowed('ai/claude/conflict-guard-exclude-drafts-20260915', 'topmaster-joseph'), true);
  assert.equal(allowed('ai/cheonggye-community-live', 'topmaster-joseph'), false);
  assert.equal(allowed('chatgpt/device-safe-optimizer', 'topmaster-joseph'), false);
  assert.equal(allowed('ai/chatgpt/task/nested', 'topmaster-joseph'), false);
});

test('Dependabot exception is bound to both actor and branch prefix', () => {
  assert.equal(allowed('dependabot/github_actions/actions/checkout-7', 'dependabot[bot]'), true);
  assert.equal(allowed('dependabot/github_actions/actions/checkout-7', 'topmaster-joseph'), false);
  assert.equal(allowed('feature/dependency-update', 'dependabot[bot]'), false);
});

test('orchestration workflow enforces branch identity before the existing gate', () => {
  const branchStep = workflow.indexOf('Enforce change branch identity');
  const orchestrationStep = workflow.indexOf('Route change intent through EKODI AI');
  assert.ok(branchStep >= 0);
  assert.ok(orchestrationStep > branchStep);
  assert.match(workflow, /AI-BRANCH-001/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login/);
});
