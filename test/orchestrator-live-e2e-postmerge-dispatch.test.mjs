import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const converger=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/verify-ekodi-orchestrator-live-e2e.yml',import.meta.url),'utf8');

test('protected Orchestrator merge dispatches the read-only live E2E for Core execution-path changes',()=>{
  const selector=converger.slice(
    converger.indexOf('const orchestratorLiveVerificationTouched='),
    converger.indexOf('// Signed-in Admin continuity')
  );
  for(const file of [
    '.github/workflows/verify-ekodi-orchestrator-live-e2e.yml',
    'ekodi-command-plane.js',
    'ekodi-command-ledger.js',
    'ekodi-pulse-runtime.js',
    'ekodi-orchestrator-task-adapter.js',
    'core-ai-gateway.js',
    'ai-command-control.js',
    'scripts/converge-orchestrated-pr-merge.mjs',
  ]) assert.ok(selector.includes("'"+file+"'"),file);

  const dispatcher=converger.slice(
    converger.indexOf('async function dispatchPostMergeDeploys()'),
    converger.indexOf('if(adminContinuityVerificationTouched)')
  );
  assert.ok(dispatcher.includes('if(orchestratorLiveVerificationTouched)'),dispatcher);
  assert.ok(dispatcher.includes("'/actions/workflows/verify-ekodi-orchestrator-live-e2e.yml/dispatches'"));
  assert.ok(dispatcher.includes("method:'POST'"));
  assert.ok(dispatcher.includes("body:JSON.stringify({ref:'main'})"));
  assert.ok(dispatcher.includes("if(!response.r.ok)fail('Orchestrator live production E2E dispatch failed '"));
  assert.ok(dispatcher.includes("action:'orchestrator-live-e2e-dispatched'"));

  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/productionMutationPerformed:false/);
  assert.match(workflow,/Audit command ledger for legacy core_only deployment dead-ends/);
});
