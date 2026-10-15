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
  assert.match(converge,/deploy-control-api\.yml\/dispatches/);
  assert.match(converge,/if\(controlApiTouched\)/);
});
test('release dispatch selects canonical D1 grant SQL but excludes unrelated migration and docs',async()=>{
  const converge=await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  const start=converge.indexOf('const controlApiTouched=');
  const end=converge.indexOf('const marketingGrowthTouched=',start);
  assert.ok(start>=0&&end>start,'Control API ownership predicate missing');
  const evaluate=new Function('changedFiles',converge.slice(start,end)+'\\nreturn controlApiTouched;');
  assert.equal(evaluate(['migrations/0198_seonammedi_linuxceo_board_admin.sql']),true,'board admin grant must trigger D1 deployment');
  assert.equal(evaluate(['migrations/0181_messenger_schema.sql']),false,'unrelated messenger data must not trigger Control API deployment');
  assert.equal(evaluate(['migrations/README.md']),false,'migration documentation must not trigger D1 deployment');
  assert.equal(evaluate(['docs/operations/readme.md']),false,'unrelated docs must not trigger Control API deployment');
  assert.equal(evaluate(['seonammedi-monitor.js']),true,'existing runtime owner must remain supported');
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
