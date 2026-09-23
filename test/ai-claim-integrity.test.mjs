import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaimReceipt,
  containsMaterialOperationalSuccessClaim,
  guardOperationalResponse,
  hasVerifiedOperationalEvidence,
} from '../ai-claim-integrity.js';

test('detects unsupported operational completion language', () => {
  assert.equal(containsMaterialOperationalSuccessClaim('운영 배포가 완료되었습니다.'), true);
  assert.equal(containsMaterialOperationalSuccessClaim('검토 결과 다음 변경을 권장합니다.'), false);
});

test('blocks a completion statement without verified evidence', () => {
  const result = guardOperationalResponse('모든 사용자 페이지에 적용 완료되었습니다.', {});
  assert.equal(result.allowed, false);
  assert.equal(result.verdict, 'unverified_operational_success_claim_blocked');
  assert.match(result.response, /확정할 수 없습니다/);
});

test('allows a completion statement only with a verified evidence source', () => {
  const evidence = [{
    claim_type: 'deployed',
    verdict: 'verified',
    evidence_sources: ['github-run:1234', 'https://ekodi.kr/health'],
  }];
  assert.equal(hasVerifiedOperationalEvidence(evidence), true);
  const result = guardOperationalResponse('운영 배포가 완료되었습니다.', evidence);
  assert.equal(result.allowed, true);
  assert.equal(result.verdict, 'verified');
});

test('agent assertion without source references is not verification evidence', () => {
  const evidence = [{ claim_type: 'complete', verdict: 'verified', verifier: 'agent:sentinel' }];
  assert.equal(hasVerifiedOperationalEvidence(evidence), false);
});

test('claim receipt hashes the statement and records explicit evidence references', () => {
  const receipt = buildClaimReceipt({
    taskId: 't-1',
    claimType: 'runtime-working',
    claimScope: 'ekodi.kr/ai/interpreter',
    claimText: '정상 작동',
    verdict: 'verified',
    evidenceSources: ['synthetic-canary:abc'],
    verifier: 'ekodi-runtime-observer',
  });
  assert.equal(receipt.policyId, 'AI-CLAIM-INTEGRITY-001');
  assert.equal(receipt.verdict, 'verified');
  assert.equal(receipt.evidence_sources.length, 1);
  assert.equal(receipt.claim_text_hash.length, 64);
});
