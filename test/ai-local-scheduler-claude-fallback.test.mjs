import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [worker,node,claude]=await Promise.all([
  readFile(new URL('../ai-control-worker.js',import.meta.url),'utf8'),
  readFile(new URL('../scripts/ai-account-node.mjs',import.meta.url),'utf8'),
  readFile(new URL('../scripts/claude-code-subscription-provider.mjs',import.meta.url),'utf8'),
]);

test('unhealthy nodes cannot advertise schedulable providers',()=>{
  assert.match(worker,/SELECT providers FROM ai_control_nodes WHERE state='online' AND auto_execution_eligible=1 AND is_portable=0 AND last_seen_at>=\?/);
  assert.match(node,/autoExecutionEligible:isPortable===false&&memory<=90/);
  assert.match(worker,/reason:telemetry\.isPortable\?'portable_device':telemetry\.memoryUsedPct>90\?'memory_pressure'/);
});

test('internal site improvement uses Claude subscription only after other ready code lanes',()=>{
  assert.match(worker,/\['codex','gemini-cli','claude-code'\]\.find\(provider=>nodeProviders\.includes\(provider\)\)/);
  assert.match(worker,/needsCodeBranch:true,[\s\S]*?site-improvement-scheduler/);
  assert.match(claude,/job\.needsCodeBranch===true/);
  assert.match(claude,/INTERNAL_REPOSITORY\.test/);
  assert.match(claude,/EKODI_CLAUDE_INTERNAL_ONLY/);
  const scheduled=worker.slice(worker.indexOf('async function runScheduledSiteImprovement('),worker.indexOf('function commonsConfig('));
  assert.doesNotMatch(scheduled,/\['codex','gemini-cli','claude-code','ollama-local'\]/);
});
