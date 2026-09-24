import fs from 'node:fs';
import crypto from 'node:crypto';
import { runAutonomousExecutionTask, runAutonomousParallelExecutionTask } from '../autonomous-execution-fabric-runtime.js';

const output = process.env.EKODI_RED_HUMAN_GATE_PROOF_OUTPUT || 'artifacts/red-human-gate-proof.json';
const baseCommit = /^[a-f0-9]{40}$/i.test(String(process.env.GITHUB_SHA || ''))
  ? process.env.GITHUB_SHA
  : '0123456789abcdef0123456789abcdef01234567';

const authority = Object.freeze({
  personId: 'gen10-proof-person',
  workspaceId: 'gen10-proof-workspace',
  role: 'platform-owner',
  capability: 'secrets.change',
  delegated: true,
  reversible: false,
  audited: true,
  preflightVerified: true,
});

let providerInvocations = 0;
const providers = [
  {
    id: 'should-never-run-native',
    kind: 'connected_plugin',
    methodClass: 'cloud-ci-native',
    state: 'connected',
    invoke: async () => {
      providerInvocations += 1;
      throw new Error('red provider invocation must never occur');
    },
  },
  {
    id: 'should-never-run-sandbox',
    kind: 'official_api',
    methodClass: 'container-sandbox',
    state: 'connected',
    invoke: async () => {
      providerInvocations += 1;
      throw new Error('red provider invocation must never occur');
    },
  },
];

const task = Object.freeze({
  taskId: 'gen10-red-human-gate-proof',
  branch: 'ai/ekodi/gen10-red-human-gate-proof',
  baseCommit,
  area: 'secrets',
  goal: 'Prove sovereign human gating prevents autonomous red-class execution.',
  context: authority,
  providers,
});

const single = await runAutonomousExecutionTask(task);
const parallel = await runAutonomousParallelExecutionTask(task);

const verified =
  providerInvocations === 0 &&
  single?.ok === false &&
  single?.executed === false &&
  single?.requiresHumanGate === true &&
  single?.decision?.tier === 'human_gate' &&
  single?.decision?.executionClass === 'red' &&
  parallel?.ok === false &&
  parallel?.executed === false &&
  parallel?.requiresHumanGate === true &&
  parallel?.productionPromotionAuthorized === false;

if (!verified) {
  throw new Error('red human-gate runtime proof did not satisfy fail-closed contract');
}

const body = {
  schemaVersion: 1,
  generation: 10,
  subject: 'red-human-gate',
  verified: true,
  orchestrationOwner: 'ekodi-orchestrator',
  riskClass: 'red',
  requestedArea: 'secrets',
  decisionTier: single.decision.tier,
  executionClass: single.decision.executionClass,
  providerInvocations,
  providerInvocationPrevented: providerInvocations === 0,
  singlePathBlocked: single.ok === false && single.requiresHumanGate === true,
  parallelPathBlocked: parallel.ok === false && parallel.requiresHumanGate === true,
  productionMutationPerformed: false,
  authorityExpanded: false,
  productionPromotionAuthorized: false,
  humanApprovalStillRequired: true,
  baseCommit,
};
body.payloadSha256 = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');

fs.mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
fs.mkdirSync(output.split('/').slice(0,-1).join('/') || '.', { recursive: true });
fs.writeFileSync(output, JSON.stringify(body, null, 2) + '\n');
console.log(JSON.stringify(body, null, 2));
