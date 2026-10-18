import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildOriginSynthesisPrompt,
  normalizeTaskInput,
  rolePrompt,
  taskOrigin,
} from '../ai-control-core.js';

const policy = JSON.parse(readFileSync(new URL('../config/ai-change-orchestration-policy.json', import.meta.url), 'utf8'));
const contract = policy.multiAiCommandAuthority;

test('Claude, GPT and future AI are collaborators under a single EKODI authority', () => {
  assert.equal(contract.status, 'enforced');
  assert.equal(contract.soleTaskLifecycleOwner, policy.orchestrator);
  assert.equal(contract.mandatoryStatement, '모든 AI는 EKODI의 협력 실행자이며, EKODI Orchestrator가 유일한 총괄 지휘자로서 설계·개발·검증·배포·운영을 통합 관리한다.');
  for (const provider of ['claude', 'chatgpt', 'codex', 'gemini', 'local-ai', 'future-ai-providers']) {
    assert.ok(contract.appliesTo.includes(provider));
  }
  assert.equal(contract.providerRolesAreTaskScopedNotFixed, true);
  assert.equal(contract.providerMayIssueItsOwnOrchestratorAuthority, false);
  assert.equal(contract.providerMayPromoteMergeOrDeployDirectly, false);
  assert.equal(contract.orchestratorIssuedTaskRequiredForProductionBoundWork, true);
  assert.equal(contract.ownerHumanGatesRemainAuthoritative, true);
});

for (const [provider, channel, requestId] of [
  ['claude', 'claude-web', 'claude-test-1'],
  ['chatgpt', 'chatgpt-web', 'gpt-test-1'],
]) {
  test(`simulated ${provider} request preserves origin through worker prompt and result synthesis`, () => {
    const task = normalizeTaskInput({
      prompt: 'Review EKODI orchestration rules (test-only, do not deploy)',
      origin: { provider, channel, requestId },
    });
    assert.equal(taskOrigin(task).provider, provider);
    assert.equal(taskOrigin(task).channel, channel);
    assert.equal(taskOrigin(task).requestId, requestId);
    const workerPrompt = rolePrompt(task, 'parallel-2', { branch: 'ai/gpt6/test-sandbox' });
    assert.match(workerPrompt, /only EKODI Orchestrator owns task assignment/);
    assert.match(workerPrompt, /no provider may grant itself an authoritative task receipt/);
    assert.match(workerPrompt, /preserved origin channel/);
    assert.match(workerPrompt, new RegExp(`provider=${provider}`));

    const synthesis = buildOriginSynthesisPrompt(task, [{
      providerId: provider === 'claude' ? 'node:claude-code' : 'node:codex',
      role: 'origin-primary',
      ok: true,
      output: 'Candidate analysis; no operational action.',
    }]);
    assert.match(synthesis, new RegExp(`original ${provider} origin`));
    assert.match(synthesis, new RegExp(`channel ${channel}`));
    assert.match(synthesis, /Candidate analysis; no operational action/);
    assert.match(synthesis, /unverified\/unknown/);
  });
}

test('unit simulations cannot be reported as live Claude/GPT bidirectional proof', () => {
  assert.equal(contract.bidirectionalLiveProofMustBeAuthenticated, true);
  assert.equal(contract.simulatedOrStaticTestsDoNotCountAsLiveProof, true);
  assert.equal(contract.successClaimRequiresEvidenceFromBothClaudeAndGPT, true);
  assert.deepEqual(contract.requiredRoundtripEvidence, [
    'authenticated_origin',
    'orchestrator_accepted_task_id',
    'scoped_worker_assignment',
    'provider_response_received',
    'orchestrator_verification_result',
    'response_to_original_channel',
    'audit_and_timestamp',
  ]);
});
