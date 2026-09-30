import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGeneration10Activation } from '../scripts/evaluate-gen10-activation-evidence.mjs';

const runtimeEvidence = {
  kind: 'execution_fabric_runtime_evidence',
  verified: true,
  subject: 'autonomous-execution-fabric',
  payloadSha256: 'f'.repeat(64),
  evidence: {
    shortLivedTaskGrantProven: true,
    parallelConvergenceProven: true,
    sbomProvenanceCostBundleProven: true,
  },
};

const sharedEvidence = {
  kind: 'production_release_evidence',
  service: 'shared-site',
  release: {
    productionVerified: true,
    stagingArtifactReproducible: true,
    artifactContinuityVerified: true,
    productionArtifactDigest: 'sha256:' + 'a'.repeat(64),
  },
};

const rollbackEvidence = {
  kind: 'production_release_evidence',
  service: 'shared-site',
  release: { rollbackAttempted: true, rollbackVerified: true },
};

const verifiedRuntimeRow = {
  id: 'runtime_execution-fabric_1_1',
  generation: 10,
  outcome: 'verified',
  payload_sha256: 'f'.repeat(64),
  recorded_at: '2026-09-24T12:02:00Z',
  evidence_json: JSON.stringify(runtimeEvidence),
};

const sharedRow = {
  id: 'prod_shared-site_1_1',
  generation: 10,
  outcome: 'verified',
  recorded_at: '2026-09-24T11:16:00Z',
  evidence_json: JSON.stringify(sharedEvidence),
};

const rollbackRow = {
  id: 'prod_shared-site_rollback_1',
  generation: 10,
  outcome: 'rolled_back_verified',
  recorded_at: '2026-09-23T10:00:00Z',
  evidence_json: JSON.stringify(rollbackEvidence),
};

const greenRow = {
  id: 'runtime_green_1',
  generation: 10,
  outcome: 'verified',
  recorded_at: '2026-09-24T12:05:00Z',
  evidence_json: JSON.stringify({ subject:'green-change-end-to-end', verified:true }),
};

const redRow = {
  id: 'runtime_red_1',
  generation: 10,
  outcome: 'verified',
  recorded_at: '2026-09-24T12:06:00Z',
  evidence_json: JSON.stringify({ subject:'red-human-gate', verified:true }),
};

const architecture = {
  parallelExecution:{claimBoundary:{multiProviderFailureDomainIndependenceProven:true}},
  runtimeEvidence:{
    durableEvidenceLedgerRegistered:true,
    durableEvidenceAppendOnly:true,
    durableEvidenceRoundtripRequired:true,
  },
};

test('activation remains blocked when runtime/production evidence exists but provider and lifecycle proofs are missing', () => {
  const result = evaluateGeneration10Activation({
    runtimeRows:[verifiedRuntimeRow],
    productionRows:[sharedRow],
    architecture:{
      ...architecture,
      parallelExecution:{claimBoundary:{multiProviderFailureDomainIndependenceProven:false}},
    },
  });
  assert.equal(result.ready,false);
  for(const blocker of [
    'verified_rollback_recovery_evidence_missing',
    'green_change_end_to_end_evidence_missing',
    'red_human_gate_runtime_evidence_missing',
    'multi_provider_failure_domain_evidence_missing',
  ]) assert.ok(result.blockers.includes(blocker), blocker);
  assert.equal(result.evidence.runtimeEvidenceId,verifiedRuntimeRow.id);
  assert.equal(result.evidence.sharedSiteProductionEvidenceId,sharedRow.id);
});

test('activation becomes ready only when every required durable evidence class is present', () => {
  const result = evaluateGeneration10Activation({
    runtimeRows:[verifiedRuntimeRow,greenRow,redRow],
    productionRows:[sharedRow,rollbackRow],
    architecture,
  });
  assert.equal(result.ready,true);
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.claim,'generation_10_activation_evidence_complete');
  assert.equal(result.evidence.rollbackEvidenceId,rollbackRow.id);
  assert.equal(result.evidence.greenEndToEndEvidenceId,greenRow.id);
  assert.equal(result.evidence.redHumanGateEvidenceId,redRow.id);
});

test('a successful workflow declaration without complete runtime evidence cannot satisfy activation', () => {
  const row={...verifiedRuntimeRow,evidence_json:JSON.stringify({...runtimeEvidence,evidence:{...runtimeEvidence.evidence,shortLivedTaskGrantProven:false}})};
  const result=evaluateGeneration10Activation({runtimeRows:[row,greenRow,redRow],productionRows:[sharedRow,rollbackRow],architecture});
  assert.equal(result.ready,false);
  assert.ok(result.blockers.includes('short_lived_task_grant_evidence_missing'));
});
