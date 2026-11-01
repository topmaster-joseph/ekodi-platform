import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// RECOVERY-POST-MERGE-LANES-001: an immediate recovery merge must still reach every guarded
// lane. Observed 2026-10-31: #7154 (access-api) merged immediately and Access API never deployed.
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('recovery hands an immediately merged PR to the converger in reconcile mode',async()=>{
  const s=await read('scripts/recover-release-provenance.mjs');
  assert.match(s,/if\(merge\.response\.ok&&merge\.data\?\.merged===true\)\{[\s\S]*?converge-orchestrated-pr-merge\.yml\/dispatches[\s\S]*?inputs:\{post_merge_reconcile_branch:branchRef\}/);
});

test('converger reconcile mode: merged recently, receipt still checked, recovery lanes skipped',async()=>{
  const s=await read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(s,/const postMergeReconcile=Boolean\(reconcileBranch\)&&String\(process\.env\.GITHUB_REF_NAME\|\|''\)\.trim\(\)==='main'/);
  assert.match(s,/RECONCILE_WINDOW_MS=30\*60\*1000/);
  assert.match(s,/RECOVERY_DISPATCHED_WORKFLOWS=new Set\(\['deploy-independent-board\.yml','deploy-ekodi-shell\.yml','deploy-site-core\.yml','deploy-control-api\.yml','deploy-cgma-apex-edge\.yml'/);
  assert.match(s,/reconcile-skip-already-dispatched/);
  // Receipt verification sits between the reconcile guard and PR selection.
  assert.ok(s.indexOf("globalThis.__ekodiReconcilePr=merged")<s.indexOf("release receipt is not authorized"));
  assert.ok(s.indexOf("release receipt is not authorized")<s.indexOf("await dispatchPostMergeDeploys();\n  console.log(JSON.stringify({ok:true,action:'post-merge-reconciled'"));
  assert.match(s,/if\(p\?\.merged!==true\)fail\('reconcile: PR is not merged'\)/);
  const wf=await read('.github/workflows/converge-orchestrated-pr-merge.yml');
  assert.match(wf,/post_merge_reconcile_branch:/);
  assert.match(wf,/POST_MERGE_RECONCILE_BRANCH: \$\{\{ inputs\.post_merge_reconcile_branch \|\| '' \}\}/);
});
