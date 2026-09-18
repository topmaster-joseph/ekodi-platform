import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_ORCHESTRATOR_DIRECTIVE,
  buildAiExecutionProtocol,
  evaluateAiCompletionEvidence,
} from '../ai-orchestrator-directive.js';

test('coding protocol requires cross-check and failure-aware verification for material work', () => {
  const protocol = buildAiExecutionProtocol({ domain: 'coding', material: true });
  assert.equal(protocol.requiredVerification.mathCodingCrossCheck, true);
  assert.equal(protocol.requiredVerification.independentCrossCheck, true);
  assert.equal(protocol.requiredVerification.failurePathTesting, true);
});

test('deployment alone is never completion for production-impacting work', () => {
  const result = evaluateAiCompletionEvidence({
    productionImpacting: true,
    executed: true,
    tested: true,
    regressionChecked: true,
    deployed: true,
    productionVerified: false,
    operationalHealthChecked: true,
  });
  assert.equal(result.complete, false);
  assert.equal(result.state, 'needs_verification');
  assert.ok(result.reasons.includes('production_not_verified'));
});

test('fully verified production work can be complete', () => {
  const result = evaluateAiCompletionEvidence({
    productionImpacting: true,
    executed: true,
    tested: true,
    regressionChecked: true,
    productionVerified: true,
    operationalHealthChecked: true,
  });
  assert.equal(result.complete, true);
  assert.equal(result.state, 'verified_complete');
});

test('future compatibility keeps current verified source of truth ahead of historical instruction', () => {
  assert.equal(AI_ORCHESTRATOR_DIRECTIVE.sourceOfTruthPriority[0], 'verified_current_operating_state');
  assert.equal(AI_ORCHESTRATOR_DIRECTIVE.sourceOfTruthPriority.at(-1), 'historical_instruction');
  assert.equal(AI_ORCHESTRATOR_DIRECTIVE.futureCompatibility.vendorLockInForbiddenByDefault, true);
});
