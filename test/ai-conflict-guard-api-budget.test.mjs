import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/ai-conflict-guard.yml',import.meta.url),'utf8');
const script=workflow.slice(workflow.indexOf('      - name: Detect exact and related changes'));
const commentsCommand='--json comments,reviews > "$review_snapshot"';
const noOverlap='if [[ ! -s "$exact_conflicts" && ! -s "$semantic_conflicts" ]]; then';
const afterNoOverlap='priority_label=$(jq -r';
test('API-intensive comments and review evidence are only requested after a real overlap',()=>{
  const first=script.indexOf('--json number,baseRefOid,changedFiles,labels,mergeable,mergeStateStatus');
  const noOverlapBranch=script.indexOf(noOverlap);
  const fetchDetails=script.indexOf(commentsCommand);
  const reviewStep=script.indexOf(afterNoOverlap);
  assert.ok(first>0);
  assert.ok(noOverlapBranch>first);
  assert.ok(fetchDetails>noOverlapBranch);
  assert.ok(reviewStep>fetchDetails);
  assert.match(script.slice(noOverlapBranch,fetchDetails),/exit 0/);
});
test('review evidence and integration winner remain mandatory when related work overlaps',()=>{
  assert.match(script,/review_evidence="\$\(jq -r .* "\$review_snapshot"\)"/);
  assert.match(script,/approved_count.*-eq 1/);
  assert.match(script,/approved_winner.*PR_NUMBER/);
  assert.match(script,/current_has_review.*'true'/);
  assert.match(script,/evidence_ok.*'true'/);
  assert.match(script,/Parallel related change remains blocked/);
});
test('file overlap discovery still fails closed when GitHub rate limit persists',()=>{
  assert.match(script,/gh_retry api --paginate/);
  assert.match(script,/PR #\$\{other_pr\} file evidence is missing/);
  assert.match(script,/GitHub API rate limit encountered; retrying guard query/);
  assert.match(script,/attempt.*-ge 4/);
});
