import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=readFileSync(new URL('../.github/workflows/deploy-finance.yml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
test('finance dispatch retains audited release context and explicit human promotion',()=>{
  for(const marker of ['release_branch_ref:', 'release_task_id:', 'EKODI_RELEASE_BRANCH_REF:', 'EKODI_RELEASE_TASK_ID:'])assert.ok(text.includes(marker),marker);
  assert.ok(text.includes('inputs.promote_production == true'));
  assert.ok(text.includes("github.ref == 'refs/heads/main'"));
  assert.ok(text.includes('validate-ekodi-ai-change-orchestration.mjs'));
  assert.ok(text.includes('guarded-worker-release.mjs --manifest deploy/manifests/finance-api.worker.json'));
  assert.ok(text.includes('environment: production'));
});