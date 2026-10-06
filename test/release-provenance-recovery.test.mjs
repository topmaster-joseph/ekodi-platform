import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('release provenance recovery preserves gates while self-healing non-orchestrator AI branches',async()=>{
  const [script,workflow,policy]=await Promise.all([
    read('scripts/recover-release-provenance.mjs'),
    read('.github/workflows/recover-release-provenance.yml'),
    read('config/ai-change-orchestration-policy.json'),
  ]);
  const parsed=JSON.parse(policy);
  assert.match(script,/release-provenance-recovery/);
  assert.match(script,/INSERT OR IGNORE INTO ekodi_orchestrator_tasks/);
  assert.match(script,/deployment_requested/);
  assert.match(script,/permission_class/);
  assert.match(script,/api\/orchestrator\/release-receipt/);
  assert.match(script,/enablePullRequestAutoMerge/);
  assert.match(script,/guardedReleasePreserved:true/);
  assert.match(script,/productionVerificationRequired:true/);
  assert.match(script,/automatic release provenance recovery requires policy-owner actor/);
  assert.match(workflow,/pull_request_target:/);
  assert.match(workflow,/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow,/contents: write/);
  assert.match(workflow,/pull-requests: write/);
  assert.match(workflow,/CLOUDFLARE_API_TOKEN/);
  assert.match(workflow,/recover-release-provenance\.mjs/);
  assert.equal(parsed.sourceControl.branchNaming.enforcement.autoGenerateCompliantBranch,true);
  assert.equal(parsed.sourceControl.branchNaming.enforcement.autoCorrectNonCompliantBranchBeforeMutation,true);
  assert.equal(parsed.sourceControl.branchNaming.enforcement.closeOrRetireSupersededNonCompliantPr,true);
  assert.equal(parsed.execution.nonTerminalFailuresRequireAutomaticRecovery,true);
  assert.equal(parsed.execution.retryRepairRedeployReverify,true);
});
