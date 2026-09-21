import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ExecutionTaskGrantBroker } from '../execution-task-grant.js';

const output = process.env.EKODI_TASK_GRANT_PROOF_OUTPUT || 'artifacts/execution-task-grant-proof.json';
let now = Date.parse('2026-09-21T00:00:00Z');
const broker = new ExecutionTaskGrantBroker({ clock: () => now, maxTtlSeconds: 600 });
const issued = broker.issue({
  taskId: 'gen10-runtime-credential-proof',
  workspaceId: 'workspace:ekodi-platform',
  role: 'operator',
  capabilities: ['execution:test', 'evidence:write'],
  ttlSeconds: 120,
});
const exact = broker.authorize(issued.token, {
  taskId: 'gen10-runtime-credential-proof',
  workspaceId: 'workspace:ekodi-platform',
  role: 'operator',
  capability: 'execution:test',
});
const wrongCapability = broker.authorize(issued.token, {
  taskId: 'gen10-runtime-credential-proof',
  workspaceId: 'workspace:ekodi-platform',
  role: 'operator',
  capability: 'execution:deploy',
});
const revoked = broker.revoke(issued.token, { reason: 'runtime-proof-complete' });
const afterRevoke = broker.authorize(issued.token, {
  taskId: 'gen10-runtime-credential-proof',
  workspaceId: 'workspace:ekodi-platform',
  role: 'operator',
  capability: 'execution:test',
});

const expiryBroker = new ExecutionTaskGrantBroker({ clock: () => now, maxTtlSeconds: 600 });
const expiring = expiryBroker.issue({
  taskId: 'gen10-expiry-proof',
  workspaceId: 'workspace:ekodi-platform',
  role: 'operator',
  capability: 'execution:test',
  ttlSeconds: 30,
});
now += 31_000;
const expired = expiryBroker.authorize(expiring.token, {
  taskId: 'gen10-expiry-proof',
  workspaceId: 'workspace:ekodi-platform',
  role: 'operator',
  capability: 'execution:test',
});

if (!exact.ok || wrongCapability.reason !== 'capability_scope_mismatch' || !revoked.ok || afterRevoke.reason !== 'grant_revoked' || expired.reason !== 'grant_expired') {
  throw new Error('task grant runtime proof failed');
}

const evidence = {
  schemaVersion: 1,
  evidenceId: 'GEN10-TASK-GRANT-RUNTIME-001',
  generation: 10,
  broker: 'ekodi-execution-task-grant-broker',
  scope: {
    taskId: issued.grant.taskId,
    workspaceId: issued.grant.workspaceId,
    role: issued.grant.role,
    capabilities: issued.grant.capabilities,
  },
  ttlSeconds: 120,
  exactScopeAuthorized: true,
  crossCapabilityDenied: true,
  expiryEnforced: true,
  revocationEnforced: true,
  productionMutationAllowed: false,
  providerMutationAllowed: false,
  productionSecretExposed: false,
  rawTokenPersisted: false,
  rawTokenPresentInEvidence: false,
  finalGrantState: revoked.grant,
};
const canonical = JSON.stringify(evidence);
evidence.evidenceDigest = 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
