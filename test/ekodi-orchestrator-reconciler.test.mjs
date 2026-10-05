import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapter=fs.readFileSync(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');

test('orchestrator has bounded durable reconciliation pass',()=>{
  assert.match(adapter,/export async function reconcileOrchestratorTasks/);
  assert.match(adapter,/state NOT IN \('completed','blocked','failed','cancelled'\)/);
  assert.match(adapter,/syncFromCommandLedger\(db,env,row\)/);
});

test('reconciler runs independently from command pulse schedule',()=>{
  assert.match(worker,/reconcileOrchestratorTasks\(env, \{ limit:20 \}\)/);
  assert.match(worker,/ctx\.waitUntil\(orchestratorReconcile\)/);
  assert.match(worker,/commandPulse, orchestratorReconcile/);
});
