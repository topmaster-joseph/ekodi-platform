import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const convergence=text('scripts/converge-orchestrated-pr-merge.mjs');
const recovery=text('scripts/recover-release-provenance.mjs');
const siteWorkflow=text('.github/workflows/deploy-site-core.yml');
const verifierPaths=[
  'scripts/verify-admin-production-ui-e2e.mjs',
  'scripts/admin-production-ui-coverage.mjs',
  'scripts/ekodi-background-browser-worker.mjs'
];

const until=(source,start,end)=>{
  const begin=source.indexOf(start);
  assert.ok(begin>=0,'missing section '+start);
  const stop=source.indexOf(end,begin+start.length);
  assert.ok(stop>begin,'missing section boundary '+end);
  return source.slice(begin,stop);
};

test('both exact-receipt merge paths classify native and Admin verifier code as guarded Site Core',()=>{
  const merged=until(convergence,'const sharedSiteTouched=changedFiles.some','// Church public Pages');
  const immediate=until(recovery,'const sharedSiteTouched=sourceFiles.some','// First-party Shell');
  for(const path of verifierPaths){
    assert.ok(merged.includes("file==='"+path+"'"),'explicit convergent merge contract must include '+path);
    assert.ok(immediate.includes("'"+path+"'"),'approved immediate recovery must include '+path);
  }
  assert.match(merged,/file==='invest-access-ui\.js'/);
  assert.match(immediate,/file==='invest-access-ui\.js'/);
});

test('guarded Site Core workflow tracks verifier paths on main push as a fallback',()=>{
  const push=until(siteWorkflow,'  push:\n','jobs:\n');
  assert.match(push,/branches:\s*\[main\]/);
  for(const path of verifierPaths)assert.ok(push.includes("- '"+path+"'"),'missing push path '+path);
  assert.ok(push.includes("- '.github/workflows/deploy-site-core.yml'"));
});

test('production release after protected merge uses authentic orchestrator receipt',()=>{
  const merged=until(convergence,'async function dispatchPostMergeDeploys()','// update-branch with the Actions token');
  assert.match(merged,/if\(sharedSiteTouched\)/);
  assert.match(merged,/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
  assert.match(merged,/release_branch_ref:branch,release_task_id:taskId/);

  const immediate=until(recovery,'const sharedSiteTouched=sourceFiles.some','// First-party Shell');
  assert.match(immediate,/deploy-site-core\.yml/);
  assert.match(recovery,/release_branch_ref:branchRef,release_task_id:taskId/);
});

test('release ownership does not weaken CF-QUOTA-001 stop and blocked receipt requirements',()=>{
  const verification=text('scripts/ekodi-background-browser-worker.mjs');
  assert.match(verification,/CF_QUOTA_CIRCUIT_OPEN/);
  assert.doesNotMatch(verification,/const transient=\[429,/);

  assert.match(siteWorkflow,/post_promotion_browser_verification_receipt:/);
  assert.match(siteWorkflow,/policyId:'CF-QUOTA-001'/);
  assert.match(siteWorkflow,/upstream-failure-or-quota-circuit/);
  assert.match(siteWorkflow,/receiptJobProductionRequests:0/);
  assert.match(siteWorkflow,/Candidate at 0%, verify routes, promote and auto-rollback on failure/);
});
