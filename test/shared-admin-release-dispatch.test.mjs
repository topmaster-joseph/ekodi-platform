import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const script=await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const ownership=script.slice(script.indexOf('const sharedSiteTouched='),script.indexOf('async function dispatchPostMergeDeploys()'));
test('every shared Admin lazy runtime asset triggers a guarded Site Core production deployment',()=>{
 for(const file of ['admin-demand-loader.js','release-control-admin.js','admin-menu-layout.js','admin-menu-layout.compact.js','system-health-admin.js']){
   assert.ok(ownership.includes("'"+file+"'"),'missing production dispatch owner '+file);
 }
});
test('deploy request retains authenticated orchestrator receipt and main release entrypoint',()=>{
 assert.match(script,/if\(sharedSiteTouched\)\{/);
 assert.match(script,/\/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
 assert.match(script,/body:JSON\.stringify\(\{ref:'main',inputs:\{sync_domains:'false',release_branch_ref:branch,release_task_id:taskId\}\}\)/);
 assert.match(script,/release receipt is not authorized/);
});
