import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const source=file=>readFileSync(new URL(file,root),'utf8');

test('native Workspace policy and hybrid API mutations dispatch guarded Control API deployment',()=>{
  const sourceCode=source('scripts/converge-orchestrated-pr-merge.mjs');
  const control=sourceCode.slice(sourceCode.indexOf('const controlApiTouched='),sourceCode.indexOf('const marketingGrowthTouched='));
  for(const file of ['hybrid-execution.js','google-workspace-slides-audio-policy.js']){
    assert.ok(control.includes("'"+file+"'"),`Missing Control API orchestrator ownership: ${file}`);
    const yml=source('.github/workflows/deploy-control-api.yml');
    assert.ok(yml.includes("      - '"+file+"'"),`Missing workflow change path: ${file}`);
  }
  assert.match(sourceCode,/if\(controlApiTouched\)/);
  assert.match(sourceCode,/actions\/workflows\/deploy-control-api\.yml\/dispatches/);
  assert.match(sourceCode,/release_branch_ref:branch,release_task_id:taskId/);
});

test('hybrid execution administrator UI deploys through protected Site Core owner',()=>{
  const s=source('scripts/converge-orchestrated-pr-merge.mjs');
  const site=s.slice(s.indexOf('const sharedSiteTouched='),s.indexOf('async function dispatchPostMergeDeploys()'));
  assert.ok(site.includes("file==='hybrid-execution-admin.js'"));
  const yml=source('.github/workflows/deploy-site-core.yml');
  assert.ok(yml.includes("      - 'hybrid-execution-admin.js'"));
  assert.match(s,/if\(sharedSiteTouched\)/);
  assert.match(s,/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
  assert.match(s,/release_branch_ref:branch,release_task_id:taskId/);
});

test('native audio executor stays paired with authorized exact-scope runtime source',()=>{
  const p=source('google-workspace-slides-audio-policy.js');
  const w=source('tools/ekodi-device-agent/windows/google-workspace-slides-audio.mjs');
  assert.match(p,/SLIDES_AUDIO_PRESENTATION_ID/);
  assert.match(p,/validateSlidesAudioPilotReceipt/);
  assert.match(w,/NATIVE_AUDIO_CANARY_UNVERIFIED/);
});
