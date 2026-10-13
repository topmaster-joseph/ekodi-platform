import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const converger=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const e2e=readFileSync(new URL('../.github/workflows/verify-admin-authenticated-production-e2e.yml',import.meta.url),'utf8');
test('post-merge trusted Orchestrator dispatches the canonical signed-in Admin E2E',()=>{
 const selector=converger.slice(converger.indexOf('const adminContinuityVerificationTouched='),converger.indexOf('async function dispatchPostMergeDeploys()'));
 for(const file of ['scripts/verify-admin-login-continuity.mjs','scripts/admin-authenticated-e2e-retry.mjs','scripts/admin-authenticated-e2e-menu-worker.mjs','test/admin-authenticated-e2e-readiness.test.mjs','.github/workflows/verify-admin-authenticated-production-e2e.yml','scripts/converge-orchestrated-pr-merge.mjs']){
   assert.ok(selector.includes("file==='"+file+"'"),file);
 }
 const dispatcher=converger.slice(converger.indexOf('async function dispatchPostMergeDeploys()'),converger.indexOf('if(nativeUser4AcceptanceTouched)'));
 assert.ok(dispatcher.includes('if(adminContinuityVerificationTouched)'),dispatcher);
 assert.ok(dispatcher.includes("'/actions/workflows/verify-admin-authenticated-production-e2e.yml/dispatches'"));
 assert.ok(dispatcher.includes("method:'POST'"));
 assert.ok(dispatcher.includes("body:JSON.stringify({ref:'main'})"));
 assert.ok(dispatcher.includes('if(!response.r.ok)fail('));
 assert.ok(e2e.includes('run: node scripts/verify-admin-login-continuity.mjs'));
 assert.ok(e2e.includes('Revoke short-lived E2E session'));
 assert.ok(e2e.includes('Issue short-lived genuine super-admin session'));
});
