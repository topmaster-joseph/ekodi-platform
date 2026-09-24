import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeEvidence,
  buildRuntimeEvidenceSql,
} from '../scripts/build-gen10-runtime-evidence.mjs';

function artifact(id, name, digestChar = 'a') {
  return {
    id,
    name,
    digest: 'sha256:' + digestChar.repeat(64),
    expired: false,
    size_in_bytes: 512,
    created_at: '2026-09-21T13:00:00Z',
    expires_at: '2026-12-20T13:00:00Z',
  };
}

const payload = {
  total_count: 5,
  artifacts: [
    artifact(1, 'ekodi-gen10-task-grant-proof-35603485703-1', '1'),
    artifact(2, 'ekodi-gen10-native-parallel-proof-35603485703-1', '2'),
    artifact(3, 'ekodi-gen10-rootless-sandbox-proof-35603485703-1', '3'),
    artifact(4, 'ekodi-gen10-parallel-convergence-proof-35603485703-1', '4'),
    artifact(5, 'ekodi-gen10-supply-chain-proof-35603485703-1', '5'),
  ],
};

test('runtime proof becomes verified only when all required durable artifact digests exist', () => {
  const evidence = buildRuntimeEvidence({
    artifactsPayload: payload,
    sourceRunId: '35603485703',
    sourceRunAttempt: '1',
    sourceConclusion: 'success',
    sourceUrl: 'https://github.com/topmaster-joseph/ekodi-platform/actions/runs/35603485703',
    headSha: '8e834b2fec1c6ba51f6b1fc70574304340f110a3',
  });
  assert.equal(evidence.generation, 10);
  assert.equal(evidence.kind, 'execution_fabric_runtime_evidence');
  assert.equal(evidence.outcome, 'verified');
  assert.equal(evidence.verified, true);
  assert.equal(evidence.evidence.requiredArtifactsPresent, true);
  assert.equal(evidence.evidence.requiredArtifactDigestsValid, true);
  assert.equal(evidence.evidence.shortLivedTaskGrantProven, true);
  assert.equal(evidence.evidence.parallelConvergenceProven, true);
  assert.equal(evidence.evidence.sbomProvenanceCostBundleProven, true);
  assert.equal(evidence.evidence.productionMutationPerformed, false);
  assert.equal(evidence.evidence.autonomousProductionReadinessClaimed, false);
  assert.match(evidence.payloadSha256, /^[0-9a-f]{64}$/);
});

test('successful workflow with missing required runtime artifact remains incomplete evidence', () => {
  const incomplete = { artifacts: payload.artifacts.filter(row => !row.name.includes('supply-chain')) };
  const evidence = buildRuntimeEvidence({
    artifactsPayload: incomplete,
    sourceRunId: '35603485703',
    sourceRunAttempt: '1',
    sourceConclusion: 'success',
  });
  assert.equal(evidence.verified, false);
  assert.equal(evidence.outcome, 'incomplete_evidence');
  assert.equal(evidence.evidence.requiredArtifactsPresent, false);
});

test('generation 10 runtime ledger SQL is append-only and idempotent', () => {
  const evidence = buildRuntimeEvidence({
    artifactsPayload: payload,
    sourceRunId: '35603485703',
    sourceRunAttempt: '1',
    sourceConclusion: 'success',
  });
  const sql = buildRuntimeEvidenceSql(evidence);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ai_generation10_evidence/);
  assert.match(sql, /trg_ai_generation10_evidence_no_update/);
  assert.match(sql, /trg_ai_generation10_evidence_no_delete/);
  assert.match(sql, /INSERT OR IGNORE INTO ai_generation10_evidence/);
  assert.match(sql, /runtime_execution-fabric_35603485703_1/);
  assert.match(sql, /append-only/);
});
