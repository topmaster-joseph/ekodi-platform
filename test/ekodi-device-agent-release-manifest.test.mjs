import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mirrors Test-EkodiApprovedAgentManifest in the Windows agent: a manifest the agent
// would reject is worse than none, because every device silently stays on its old version.
test('device-agent release manifest satisfies the agent gate', () => {
  const m = JSON.parse(readFileSync('config/ekodi-device-agent-release.json', 'utf8'));
  assert.equal(m.policyId, 'EKODI-AGENT-AUTOUPDATE-001');
  assert.equal(m.channel, 'protected-orchestrator');
  assert.equal(m.approved, true);
  assert.ok(String(m.approvedBy || '').length > 5, 'records who approved the rollout');
  assert.equal(m.agentPath, 'tools/ekodi-device-agent/windows/ekodi-device-agent.ps1');
  assert.match(m.sourceCommit, /^[a-f0-9]{40}$/);
  assert.match(m.sha256, /^[a-f0-9]{64}$/);
  assert.equal(m.rolloutPercent, 25, 'first rollout is canary only');
  assert.match(m.version, /^2\.\d+\.\d+$/);
  const agent = readFileSync(m.agentPath, 'utf8');
  const installed = agent.match(/\$AgentVersion = '([0-9.]+)'/)[1];
  const cmp = (a, b) => a.split('.').map(Number).reduce((r, v, i) => r || v - b.split('.').map(Number)[i], 0);
  assert.ok(cmp(m.version, installed) <= 0, 'manifest never points past the agent in the repository');
});
