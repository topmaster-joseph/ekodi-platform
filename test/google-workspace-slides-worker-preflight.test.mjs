import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const worker=fileURLToPath(new URL('../tools/ekodi-device-agent/windows/google-workspace-slides-audio.mjs',import.meta.url));
const invoke=env=>spawnSync(process.execPath,[worker,'--canary'],{
  env:{...process.env,EKODI_WORKSPACE_AUTOMATION_PROFILE:'',EKODI_WORKSPACE_CONSENT_FILE:'',EKODI_WORKSPACE_CANARY_FILE:'',...env},
  encoding:'utf8',timeout:20000,
});
test('Workspace runner cannot access browser or Google without a dedicated EKODI profile',()=>{
  const run=invoke();
  assert.equal(run.status,2,run.stderr);
  const report=JSON.parse(run.stdout.trim());
  assert.equal(report.status,'blocked');
  assert.equal(report.code,'DEDICATED_EKODI_PROFILE_REQUIRED');
  assert.equal(report.items.length,0);
});
test('Workspace runner refuses to reach Google before a local consent receipt',()=>{
  const expected=process.platform==='win32'?'C:\\ProgramData\\EKODI\\GoogleWorkspace\\automation-profile':'/tmp/ekodi/GoogleWorkspace/automation-profile';
  const run=invoke({EKODI_WORKSPACE_AUTOMATION_PROFILE:expected});
  assert.equal(run.status,2,run.stderr);
  const report=JSON.parse(run.stdout.trim());
  assert.equal(report.status,'blocked');
  assert.equal(report.code,'CONSENT_RECEIPT_MISSING');
  assert.equal(report.items.length,0);
});
