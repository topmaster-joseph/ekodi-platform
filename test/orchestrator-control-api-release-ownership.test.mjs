import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('the canonical release dispatcher includes every directly used Control API completion boundary',async()=>{
  const converge=await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  const control=converge.slice(converge.indexOf('const controlApiTouched='),converge.indexOf('const marketingGrowthTouched='));
  const site=converge.slice(converge.indexOf('const sharedSiteTouched='),converge.indexOf('const churchPagesTouched='));
  assert.ok(control.startsWith('const controlApiTouched='),'Control API ownership table missing');
  for(const file of [
    'ekodi-orchestrator-task-adapter.js',
    'github-actions-oidc.js',
    'ai-command-control.js',
    'seonammedi-monitor.js',
    'seonammedi-relevance.js',
  ]){
    assert.ok(control.includes("'"+file+"'"),file+' must dispatch protected Control API release');
  }
  assert.ok(control.includes("file.startsWith('migrations/')"),'Control API release must dispatch canonical D1 migrations');
  assert.ok(control.includes("file.endsWith('.sql')"),'D1 release trigger must be limited to SQL migration files');
  assert.ok(!control.includes("file.startsWith('migrations/')||["),'D1 ownership condition must remain explicit');
  assert.ok(site.includes("'seonammedi-monitor.js'"),'RSS monitor must also release Site Core');
  assert.ok(converge.includes('deploy-control-api.yml/dispatches'));
  assert.ok(converge.includes('if(controlApiTouched)'));
});
test('canonical D1 changes invoke the guarded Control API release owner',async()=>{
  const converge=await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  const control=converge.slice(converge.indexOf('const controlApiTouched='),converge.indexOf('const marketingGrowthTouched='));
  assert.ok(control.includes("(file.startsWith('migrations/')&&file.endsWith('.sql')&&!file.includes('messenger'))"),'D1 SQL migration selector must exclude messenger changes');
  assert.ok(converge.includes('if(controlApiTouched)'));
  assert.ok(converge.includes('deploy-control-api.yml/dispatches'));
});

test('Control API entry imports the completion adapter; deploy workflow owns its changed-file path',async()=>{
  const entry=await readFile(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');
  const deploy=await readFile(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8');
  assert.match(entry,/from '\.\/ekodi-orchestrator-task-adapter\.js'/);
  assert.match(entry,/handleOrchestratorCompletionReconciliation/);
  assert.match(deploy,/ekodi-orchestrator-task-adapter\.js/);
});
test('GITHUB_TOKEN main merges need official workflow_dispatch rather than relying on push',async()=>{
  const converge=await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  assert.match(converge,/GITHUB_TOKEN merges do not trigger main push workflows/);
  assert.match(converge,/controlApiTouched/);
  assert.match(converge,/deploy-control-api\.yml\/dispatches/);
  assert.doesNotMatch(converge,/skipAllProtectedChecks/);
});
