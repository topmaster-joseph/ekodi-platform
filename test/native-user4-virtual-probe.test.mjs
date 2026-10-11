import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const src=read('../scripts/verify-native-user4-virtual-probe.mjs');
const workflow=read('../.github/workflows/device-agent-production-verification.yml');
const orchestrator=read('../scripts/converge-orchestrated-pr-merge.mjs');
test('USER4 native Hyper-V probe is bound to exact healthy native agent',()=>{
  assert.match(src,/hostname\|\|''\)\.toLowerCase\(\)==='user4'/);
  assert.match(src,/d\.status==='online'/);
  assert.match(src,/d\.management\?\.source==='agent'/);
  assert.match(src,/d\.revokedAt==null/);
  assert.match(src,/Date\.now\(\)-parse\(d\.lastSeenAt\)<=90000/);
  assert.doesNotMatch(src,/hostname.*user2|targetAlias:'user2'/i);
});
test('USER4 probe only submits a fixed desktop readiness command, not desktop execution',()=>{
  assert.match(src,/const COMMAND='computer\.desktop\.probe'/);
  assert.match(src,/type:COMMAND,payload:\{\},confirmed:false/);
  assert.match(src,/const proof=c\.result\?\.desktopProbe/);
  assert.match(src,/proof\.headlessBackendReady===true/);
  assert.match(src,/if\(proof\.headlessBackendReady!==true\)throw Error\('user4_hyperv_backend_not_ready'\)/);
  assert.doesNotMatch(src,/computer\.desktop\.session\.execute|software\.localai\.install|agent\.self_update/);
});
test('official orchestrator release gates USER4 virtual probe dispatch',()=>{
  assert.match(workflow,/\- user4-virtual-probe/);
  assert.match(workflow,/execution_mode == 'user4-virtual-probe'/);
  assert.match(workflow,/node scripts\/verify-native-user4-virtual-probe\.mjs/);
  assert.match(orchestrator,/const nativeUser4VirtualProbeTouched=changedFiles\.some/);
  assert.match(orchestrator,/execution_mode:'user4-virtual-probe',release_branch_ref:branch,release_task_id:taskId/);
  assert.match(orchestrator,/authority:'ekodi-orchestrator'/);
});


test('USER4 Hyper-V gap remains visible while workflow selects a safe native alternative',()=>{
  assert.match(src,/persistProbeEvidence\(evidence\)/);
  assert.match(src,/native-user4-virtual-probe\.json/);
  assert.match(src,/if\(proof\.headlessBackendReady!==true\)throw Error\('user4_hyperv_backend_not_ready'\)/);
  assert.match(workflow,/id: user4_virtual_probe/);
  assert.match(workflow,/continue-on-error: true/);
  assert.match(workflow,/Select USER4 safe native execution route/);
  assert.match(workflow,/node scripts\/select-native-user4-execution-route\.mjs/);
  assert.match(workflow,/native-user4-execution-route\.json/);
});
