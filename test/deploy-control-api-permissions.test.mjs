import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8');

test('Control API production release can verify merged-PR provenance with least privilege',()=>{
  const permissions=workflow.match(/permissions:\n([\s\S]*?)\n\n/)?.[1]||'';
  assert.match(permissions,/contents:\s*read/);
  assert.match(permissions,/pull-requests:\s*read/);
  assert.match(permissions,/statuses:\s*write/);
  assert.doesNotMatch(permissions,/contents:\s*write/);
});


test('Control API provenance gate receives the least-privilege workflow token on every release stage',()=>{
  const gates=[...workflow.matchAll(/- name: EKODI AI Orchestration Gate\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}\n\s+EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}\n\s+EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \|\| '' \}\}\n\s+run:/g)];
  assert.equal(gates.length,3);
});
