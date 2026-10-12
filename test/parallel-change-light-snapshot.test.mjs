import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/ai-conflict-guard.yml',import.meta.url),'utf8');

test('parallel-change guard avoids massive GraphQL PR file arrays but retrieves complete relevant files',()=>{
  assert.match(workflow,/--json number,headRefName,isDraft,baseRefOid,changedFiles,labels/);
  assert.match(workflow,/--json number,baseRefOid,changedFiles,labels,comments,reviews,mergeable,mergeStateStatus/);
  assert.doesNotMatch(workflow,/changedFiles,files,labels/);
  assert.match(workflow,/repos\/\$\{REPOSITORY\}\/pulls\/\$\{PR_NUMBER\}\/files\?per_page=100/);
  assert.match(workflow,/repos\/\$\{REPOSITORY\}\/pulls\/\$\{other_pr\}\/files\?per_page=100/);
  assert.match(workflow,/--paginate/);
  assert.match(workflow,/Current PR file evidence is missing; refusing to infer independence/);
  assert.match(workflow,/PR #\$\{other_pr\} file evidence is missing/);
  assert.match(workflow,/\.isDraft == false and \.baseRefOid == \$base/);
  assert.match(workflow,/HTTP 50\[234\]/);
});
