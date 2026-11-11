import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../ai-command-control.js',import.meta.url),'utf8');
const marker="// EKODI site-AI advisory-only intent preview.";
const start=source.indexOf(marker);
const end=source.indexOf("// Super-admin only: the explicit probe",start);
test('site AI preview exists only as a super-admin read-only endpoint',()=>{
 assert.ok(start>0&&end>start);
 const route=source.slice(start,end);
 assert.match(route,/request\.method === 'POST'/);
 assert.match(route,/requirePlatformSuperAdmin\('ai:read'\)/);
 assert.match(route,/isSameOriginAdminMutation\(request\)/);
 assert.match(route,/previewSiteAiMicroIntent\(input/);
 assert.match(route,/previewOnly:true, executionAuthorized:false/);
 assert.doesNotMatch(route,/submitOrchestratorTask\(|runEkodiCommandQueue\(|approveOrchestratorTask/);
});
test('server registries determine route, not body-provided workspace authority',()=>{
 assert.match(source,/from '\.\/config\/site-lifecycle-registry\.json'/);
 assert.match(source,/from '\.\/config\/capability-registry\.json'/);
 assert.match(source,/sites:siteAiLifecycleRegistry/);
 assert.match(source,/capabilities:siteAiCapabilityRegistry/);
});
