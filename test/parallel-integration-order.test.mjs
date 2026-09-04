import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/ai-conflict-guard.yml','utf8');
const docs=fs.readFileSync('docs/PARALLEL-INTEGRATION-ORDER.md','utf8');

test('parallel conflict guard remains fail-closed unless one central winner is approved',()=>{
  assert.match(workflow,/integration-order-approved/);
  assert.match(workflow,/approved_count.*-eq 1/);
  assert.match(workflow,/approved_winner.*PR_NUMBER/);
  assert.match(workflow,/Multiple overlapping PRs carry/);
  assert.match(workflow,/must refresh\/rebase on main after this winner merges/);
});

test('integration order never bypasses actual GitHub merge conflicts',()=>{
  assert.match(workflow,/mergeable.*== 'false'/);
  assert.match(workflow,/actual merge conflict with the base branch/);
  assert.match(docs,/does not waive tests, reviews, branch protection, authorization or deployment safeguards/);
});
