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

test('daily anonymous browser session hash is separated by canonical site',async()=>{
  const controller=await read('traffic-intelligence-control.js');
  assert.ok(controller.includes('async function sessionHash(day, host, siteId, sid)'));
  assert.ok(controller.includes('${day}|${host}|${siteId}|${sid}'));
  assert.ok(controller.includes('sessionHash(day, host, siteId, sid)'));
  assert.ok(controller.includes('ON CONFLICT(day, host, session_hash)'));
});

test('Control API production validates anonymous telemetry version via no-write preflight',async()=>{
  const workflow=await read('.github/workflows/deploy-control-api.yml');
  assert.match(workflow,/Verify canonical traffic telemetry version without writing visitor data/);
  assert.match(workflow,/-X OPTIONS -H 'Origin: https:\/\/ekodi\.kr'/);
  assert.match(workflow,/site-scoped-v2/);
  assert.match(workflow,/\[ "\$status" = '204' \]/);
  const handler=await read('traffic-intelligence-control.js');
  assert.match(handler,/'x-ekodi-traffic-telemetry':'site-scoped-v2'/);
});

test('traffic collector replay is dispatched only after a signed merge, never via unguarded PR staging',async()=>{
  const script=await read('scripts/converge-orchestrated-pr-merge.mjs');
  const source=script.slice(script.indexOf('const trafficCollectorTouched='),script.indexOf('const marketingGrowthTouched='));
  for(const file of ['scripts/collect-traffic-intelligence.mjs','traffic-collector-quality.js','.github/workflows/traffic-intelligence-analytics.yml']){
    assert.ok(source.includes("'"+file+"'"),'collector release ownership missing '+file);
  }
  assert.doesNotMatch(source,/traffic-intelligence-control\.js/);
  assert.match(script,/if\(trafficCollectorTouched\)\{/);
  assert.match(script,/actions\/workflows\/traffic-intelligence-analytics\.yml\/dispatches/);
  assert.match(script,/action:'collector-dispatched'/);
  const dispatch=script.slice(script.indexOf('if(trafficCollectorTouched)'),script.indexOf('if(marketingGrowthTouched)'));
  assert.match(dispatch,/method:'POST', body:JSON\.stringify\(\{ref:'main'\}\)/);
  assert.match(dispatch,/if\(!dispatch\.r\.ok\)fail\('Traffic Intelligence analytics dispatch failed '/);
  assert.ok(script.indexOf('if(trafficCollectorTouched)')>script.indexOf('function dispatchPostMergeDeploys()'));
  assert.ok(script.indexOf('if(trafficCollectorTouched)')<script.indexOf("for(let cycle=0;cycle<180;cycle++"));
  const workflow=await read('.github/workflows/traffic-intelligence-analytics.yml');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/collect:\s+if: github\.event_name != 'pull_request'/);
  assert.match(workflow,/--remote/);
  const collector=await read('scripts/collect-traffic-intelligence.mjs');
  assert.match(collector,/ON CONFLICT\(day, zone_name, host\) DO UPDATE SET/);
});
