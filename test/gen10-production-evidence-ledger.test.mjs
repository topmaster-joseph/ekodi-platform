import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGuardedReleaseLog,
  buildProductionEvidence,
  buildProductionEvidenceSql,
} from '../scripts/build-production-release-evidence.mjs';

const STABLE = '11111111-1111-4111-8111-111111111111';
const CANDIDATE = '22222222-2222-4222-8222-222222222222';

test('parses verified guarded production promotion', () => {
  const log = `
Stable production version: ${STABLE}
Candidate version: ${CANDIDATE}
Phase 1/3: attach candidate at 0% traffic while stable version remains at 100%.
Phase 2/3: smoke-test the 0% candidate through Cloudflare version overrides.
Phase 3/3: candidate passed, promote it to 100% and verify production without overrides.
✅ Guarded Worker release complete.
`;
  const parsed = parseGuardedReleaseLog(log);
  assert.equal(parsed.releaseReached, true);
  assert.equal(parsed.previousVersion, STABLE);
  assert.equal(parsed.candidateVersion, CANDIDATE);
  assert.equal(parsed.candidateVerified, true);
  assert.equal(parsed.productionVerified, true);
  assert.equal(parsed.rollbackAttempted, false);

  const evidence = buildProductionEvidence({
    log,
    sourceRunId: '1431',
    sourceRunAttempt: '1',
    sourceConclusion: 'success',
    headSha: 'abc123',
  });
  assert.equal(evidence.generation, 10);
  assert.equal(evidence.outcome, 'verified');
  assert.equal(evidence.evidenceId, 'prod_control-api_1431_1');
  assert.match(evidence.source.logSha256, /^[0-9a-f]{64}$/);
});

test('records rollback as verified only when stable rollback verification passed', () => {
  const log = `
Stable production version: ${STABLE}
Candidate version: ${CANDIDATE}
Phase 1/3: attach candidate at 0% traffic while stable version remains at 100%.
❌ Guarded Worker release failed: candidate probe failed
Rolling back ekodi-auth-api to ${STABLE} at 100%.
✅ Automatic rollback verified against the stable rollback contract.
`;
  const evidence = buildProductionEvidence({
    log,
    sourceRunId: '1432',
    sourceRunAttempt: '2',
    sourceConclusion: 'failure',
  });
  assert.equal(evidence.release.productionVerified, false);
  assert.equal(evidence.release.rollbackAttempted, true);
  assert.equal(evidence.release.rollbackVerified, true);
  assert.equal(evidence.outcome, 'rolled_back_verified');
});

test('generated D1 SQL is append-only and idempotent', () => {
  const evidence = buildProductionEvidence({
    log: 'workflow failed before guarded release',
    sourceRunId: '1433',
    sourceRunAttempt: '1',
    sourceConclusion: 'failure',
  });
  const sql = buildProductionEvidenceSql(evidence);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ai_production_evidence/);
  assert.match(sql, /trg_ai_production_evidence_no_update/);
  assert.match(sql, /trg_ai_production_evidence_no_delete/);
  assert.match(sql, /INSERT OR IGNORE INTO ai_production_evidence/);
  assert.match(sql, /append-only/);
  assert.match(sql, /prod_control-api_1433_1/);
});
