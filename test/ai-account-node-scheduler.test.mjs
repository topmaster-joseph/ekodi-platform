import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [worker,agent,migration,collaboration] = await Promise.all([
  readFile(new URL('../ai-control-worker.js',import.meta.url),'utf8'),
  readFile(new URL('../scripts/ai-account-node.mjs',import.meta.url),'utf8'),
  readFile(new URL('../migrations/0085_ai_account_node_load_scheduler.sql',import.meta.url),'utf8'),
  readFile(new URL('../ai-collaboration-settings.js',import.meta.url),'utf8'),
]);

test('AI account nodes report bounded resource and portable eligibility telemetry', () => {
  assert.match(agent,/systemSnapshot/);
  assert.match(agent,/cpuLoadPct/);
  assert.match(agent,/memoryUsedPct/);
  assert.match(agent,/autoExecutionEligible:isPortable===false/);
  assert.match(agent,/EKODI_AI_NODE_MAX_CONCURRENCY/);
  assert.match(agent,/body:\{providers,system:await systemSnapshot\(\),maxConcurrency:boundedConcurrency\(\)\}/);
});

test('control plane fails closed for portable or unknown nodes and selects least loaded', () => {
  assert.match(worker,/safeNodeTelemetry/);
  assert.match(worker,/auto_execution_eligible=1 AND is_portable=0/);
  assert.match(worker,/compareLocalExecutionCandidates/);
  assert.match(worker,/another_node_preferred_or_queue_empty/);
  assert.match(worker,/strategy:'least_loaded_parallel'/);
});

test('scheduler telemetry migration is additive and legacy nodes start ineligible', () => {
  assert.match(migration,/ADD COLUMN current_load INTEGER NOT NULL DEFAULT 100/);
  assert.match(migration,/ADD COLUMN is_portable INTEGER NOT NULL DEFAULT 1/);
  assert.match(migration,/ADD COLUMN auto_execution_eligible INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration,/idx_ai_nodes_scheduler/);
  assert.doesNotMatch(migration,/DROP\s+(TABLE|COLUMN)/i);
});

test('Cloud First collaboration policy exposes the locked local scheduler contract', () => {
  assert.match(collaboration,/localScheduler: Object\.freeze\(localExecutionPolicySnapshot\(\)\)/);
  assert.match(collaboration,/localScheduler: localExecutionPolicySnapshot\(\)/);
});

test('account node keeps source-changing work isolated and deterministic', () => {
  assert.match(agent,/git\('worktree',\['add','--force','-B'/);
  assert.match(agent,/workspace-write/);
  assert.match(agent,/Respect the repository's validation and production approval gates/);
});
