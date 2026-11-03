import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AI_FAMILY_AUTO_DISPATCH_POLICY,familyAutoDispatchEnabled,planFamilyDispatch,validateFamilyRunnerReceipt} from '../ai-family-dispatch.js';
const [hybrid,control,dock,docs]=await Promise.all([readFile(new URL('../hybrid-execution.js',import.meta.url),'utf8'),readFile(new URL('../ai-agent-control.js',import.meta.url),'utf8'),readFile(new URL('../admin-assist-dock.js',import.meta.url),'utf8'),readFile(new URL('../docs/ai-route-family-auto-dispatch-phase-2.md',import.meta.url),'utf8')]);
test('flag defaults off',()=>{assert.equal(AI_FAMILY_AUTO_DISPATCH_POLICY.defaultEnabled,false);assert.equal(familyAutoDispatchEnabled({}),false);assert.equal(familyAutoDispatchEnabled({AI_ROUTE_FAMILY_AUTO_DISPATCH:'true'}),true);assert.match(control,/familyAutoDispatchEnabled\(env\)/)});
test('closed zero-cost routing',()=>{const code=planFamilyDispatch('repository code analysis and tests');assert.equal(code.lane,'node:claude-code');assert.equal(code.timeoutMs,600000);assert.equal(code.costKrw,0);const image=planFamilyDispatch('create a poster image');assert.equal(image.lane,'node:codex');assert.equal(image.capability,'aiFamilyCodex');assert.match(docs,/does not claim that Codex can generate images/);assert.doesNotMatch(hybrid,/child_process|execSync|spawnSync/)});
test('receipt binds job lane and device',()=>{const context={jobId:'hyb_1',lane:'node:claude-code',deviceId:'device-1'};assert.equal(validateFamilyRunnerReceipt({verified:true,...context,completedAt:new Date().toISOString(),output:'done'},context).ok,true);assert.equal(validateFamilyRunnerReceipt({verified:true,...context,deviceId:'other',completedAt:new Date().toISOString(),output:'done'},context).ok,false);assert.match(hybrid,/validateFamilyRunnerReceipt\(result\.runnerReceipt/);assert.match(dock,/verifiedRunnerReceipt/);assert.match(dock,/실행: Codex/);assert.match(dock,/실행: Claude Code/)});
test('auth failure duplication capacity and polling fail closed',()=>{assert.match(control,/FAMILY_DISPATCH_SUPER_ADMIN_REQUIRED/);assert.match(control,/FAMILY_DISPATCH_SITE_RBAC_CONTEXT_REQUIRED/);assert.match(hybrid,/RUNNER_CAPABILITY_UNAVAILABLE/);assert.match(hybrid,/FAMILY_JOB_CAPACITY_REACHED/);assert.match(hybrid,/deduplicated:true/);assert.match(dock,/pollFamilyJob/)});
test('timeouts note lease heartbeat audit and cost floors',()=>{assert.deepEqual([AI_FAMILY_AUTO_DISPATCH_POLICY.processingNoteAfterMs,AI_FAMILY_AUTO_DISPATCH_POLICY.generalTimeoutMs,AI_FAMILY_AUTO_DISPATCH_POLICY.codeTimeoutMs],[60000,180000,600000]);assert.equal(AI_FAMILY_AUTO_DISPATCH_POLICY.globalMaxJobs,10);assert.equal(AI_FAMILY_AUTO_DISPATCH_POLICY.perDeviceModelMax,2);assert.match(hybrid,/const LEASE_MS = 5 \* 60 \* 1000/);assert.match(hybrid,/LEASE_FENCE_REJECTED/);assert.match(hybrid,/event\(env,commandId,device\.id,'heartbeat'/);assert.match(hybrid,/execution_timeout/);assert.match(hybrid,/ai\.family\.dispatch/);assert.match(hybrid,/costKrw:0/) });

test('capacity insert and heartbeat are fail-closed at the deadline',()=>{
  assert.ok(hybrid.includes("const insert=await env.DB.prepare"));
  assert.ok(hybrid.includes("if(!insert.meta?.changes)"));
  assert.ok(hybrid.includes("if(!row||!FAMILY_TASK_TYPES.has(row.task_type))"));
  assert.ok(hybrid.includes("Date.now()>=deadline"));
  assert.ok(hybrid.includes("Date.now()>Date.parse(job.created_at)+timeoutMs"));
});

test('async family reply remains in the originating command session',()=>{
  assert.ok(dock.includes('async function pollFamilyJob(jobId,sessionId)'));
  assert.ok(dock.includes('pollFamilyJob(result.jobId,requestSessionId)'));
  assert.ok(dock.includes('sessions.find(item=>item.id===extra.sessionId)'));
});
