import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const converge=source('scripts/converge-orchestrated-pr-merge.mjs');
const recovery=source('scripts/recover-release-provenance.mjs');
const siteWorkflow=source('.github/workflows/deploy-site-core.yml');

test('seasonal-workforce source changes dispatch the owned guarded Site Core release after canonical merge',()=>{
 const convergenceSite=converge.slice(converge.indexOf('const sharedSiteTouched='),converge.indexOf('const churchPagesTouched='));
 const recoverySite=recovery.slice(recovery.indexOf('const sharedSiteTouched='),recovery.indexOf('const shellRuntimeTouched='));
 assert.ok(convergenceSite.startsWith('const sharedSiteTouched='),'missing convergent site trigger');
 assert.ok(recoverySite.startsWith('const sharedSiteTouched='),'missing recovery site trigger');
 for(const text of [convergenceSite,recoverySite])
   assert.ok(text.includes("file.startsWith('seasonal-workforce/')"),'seasonal portal missing from guarded release ownership');
 assert.ok(siteWorkflow.includes("'seasonal-workforce/**'"),'main push must stay as fallback');
 assert.match(converge,/if\(sharedSiteTouched\)\{/);
 assert.match(recovery,/if\(merge\.response\.ok&&\(independentBoardTouched\|\|shellRuntimeTouched\|\|sharedSiteTouched\)\)\{/);
 assert.match(converge,/\/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
 assert.match(converge,/release_branch_ref:branch,release_task_id:taskId/);
 assert.match(recovery,/release_branch_ref:branchRef,release_task_id:taskId/);
});

test('seasonal portal remains a proposal-only public worker and no new publishing bypass is introduced',()=>{
 const portal=source('seasonal-workforce/route.mjs');
 const report=source('seasonal-workforce/theme.css');
 const script=source('scripts/converge-orchestrated-pr-merge.mjs');
 assert.match(portal,/applications_not_enabled/);
 assert.match(report,/\.swp-table-wrap\{[^}]*max-width:100%;min-width:0;overflow-x:auto/);
 assert.match(script,/verifyOrchestratorReleaseReceipt|release-receipt/);
 assert.match(siteWorkflow,/Candidate at 0%, verify routes, promote and auto-rollback on failure/);
});
