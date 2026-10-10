import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('traffic collectors and browser shell are owned by their guarded release workflows',async()=>{
  const script=await read('scripts/converge-orchestrated-pr-merge.mjs');
  const api=script.slice(script.indexOf('const controlApiTouched='),script.indexOf('const marketingGrowthTouched='));
  for(const file of ['traffic-intelligence.js','traffic-intelligence-control.js']){
    assert.ok(api.includes("'"+file+"'"),'Control API release owner missing '+file);
  }
  const shell=script.slice(script.indexOf('const shellRuntimeTouched='),script.indexOf('const sharedSiteTouched='));
  assert.ok(shell.includes("file.startsWith('shell/')"));
  assert.ok(shell.includes("'scripts/converge-orchestrated-pr-merge.mjs'"));
  assert.match(script,/if\(shellRuntimeTouched\)/);
  assert.match(script,/actions\/workflows\/deploy-ekodi-shell\.yml\/dispatches/);
  assert.match(script,/release_branch_ref:branch,release_task_id:taskId/);
  assert.match(script,/if\(!dispatch\.r\.ok\)fail\('Shell deploy dispatch failed/);
});

test('Shell release accepts only verified orchestrator dispatch into main',async()=>{
  const workflow=await read('.github/workflows/deploy-ekodi-shell.yml');
  assert.match(workflow,/workflow_dispatch:\s+inputs:\s+release_branch_ref:/);
  assert.ok(workflow.includes("EKODI_RELEASE_BRANCH_REF: ${{ inputs.release_branch_ref || '' }}"));
  assert.ok(workflow.includes("EKODI_RELEASE_TASK_ID: ${{ inputs.release_task_id || '' }}"));
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(workflow,/Verify real Shell hostname with release cache busting/);
  assert.match(workflow,/Verify canonical EKODI Shell serves site-specific telemetry/);
  assert.match(workflow,/grep -Fq 'site_path:first\+child'/);
  assert.match(workflow,/Verify Shell staging with release cache busting/);
});
