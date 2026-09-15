import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validatePlan } from '../scripts/migrate-legacy-branch-names.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'governance', 'legacy-branch-name-migration-20260916.json'), 'utf8'));

test('verified legacy branch migration preserves PRs and enforces ai agent task targets', () => {
  assert.equal(validatePlan(plan), true);
  assert.equal(plan.renames.length, 6);
  assert.equal(plan.safety.preservePullRequest, true);
  assert.equal(plan.safety.closePullRequests, false);
  assert.equal(plan.safety.modifyTests, false);
  assert.equal(plan.safety.applyIntegrationOrderApproved, false);
  for (const item of plan.renames) {
    assert.match(item.newName, /^ai\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/);
    assert.match(item.expectedHeadSha, /^[0-9a-f]{40}$/);
    assert.ok(item.agentEvidence.length > 0);
  }
});

test('migration plan contains only explicitly evidenced agents', () => {
  const byPr = new Map(plan.renames.map(item => [item.prNumber, item]));
  assert.equal(byPr.get(920).agent, 'chatgpt');
  assert.equal(byPr.get(893).agent, 'chatgpt');
  assert.equal(byPr.get(817).agent, 'chatgpt');
  assert.equal(byPr.get(746).agent, 'claude');
  assert.equal(byPr.get(720).agent, 'codex');
  assert.equal(byPr.get(1741).agent, 'claude');
});
