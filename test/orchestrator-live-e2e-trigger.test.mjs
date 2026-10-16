import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/verify-ekodi-orchestrator-live-e2e.yml',import.meta.url),'utf8');
const converger=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');

test('Orchestrator live E2E has both push and explicit post-merge trigger coverage',()=>{
  for(const file of [
    '.github/workflows/verify-ekodi-orchestrator-live-e2e.yml',
    'scripts/converge-orchestrated-pr-merge.mjs',
    'ekodi-command-plane.js',
    'ekodi-command-ledger.js',
    'ekodi-pulse-runtime.js',
    'ekodi-orchestrator-task-adapter.js',
    'core-ai-gateway.js',
    'ai-command-control.js',
  ]) assert.ok(workflow.includes("- '"+file+"'"),file);

  assert.ok(converger.includes('const orchestratorLiveVerificationTouched='));
  assert.ok(converger.includes("'/actions/workflows/verify-ekodi-orchestrator-live-e2e.yml/dispatches'"));
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/Audit command ledger for legacy core_only deployment dead-ends/);
});
