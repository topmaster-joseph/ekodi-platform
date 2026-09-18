import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/ai-conflict-guard.yml',import.meta.url),'utf8');

test('parallel change guard batches ordinary PR metadata instead of REST-looping every open PR',()=>{
  assert.match(workflow,/gh_retry pr list/);
  assert.match(workflow,/--json number,headRefName,changedFiles,files,labels/);
  assert.match(workflow,/gh_retry pr view/);
  assert.match(workflow,/--json comments,reviews,mergeable,mergeStateStatus/);
  assert.match(workflow,/GitHub API rate limit encountered; retrying guard query/);
  assert.match(workflow,/if \(\( changed > listed \)\)/);
  assert.match(workflow,/gh_retry api --paginate/);
  assert.match(workflow,/\.labels\[\]\.name/);
  assert.match(workflow,/\.comments\[\]\?\.body/);
  assert.match(workflow,/\.reviews\[\]\?\.body/);
  assert.doesNotMatch(workflow,/while IFS= read -r candidate_pr;[\s\S]{0,500}gh api "repos\/\$\{REPOSITORY\}\/pulls\/\$\{candidate_pr\}"/);
});

test('mergeability uses the same batched current-PR snapshot and still rejects conflicts',()=>{
  assert.match(workflow,/current_pr_json="\$RUNNER_TEMP\/ekodi-current-pr-guard\.json"/);
  assert.match(workflow,/mergeable=\$\(jq -r '\.mergeable \/\/ "UNKNOWN"'/);
  assert.match(workflow,/if \[\[ "\$mergeable" == 'CONFLICTING' \]\]/);
});
