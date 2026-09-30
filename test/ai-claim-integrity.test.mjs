import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaimReceipt,
  containsMaterialOperationalSuccessClaim,
  guardOperationalResponse,
  hasVerifiedOperationalEvidence,
} from '../ai-claim-integrity.js';

const NOW = Date.parse('2026-09-23T11:10:00.000Z');

function verifiedReceipt(overrides = {}) {
  return buildClaimReceipt({
    taskId: 't-1',
    claimType: 'deployed',
    claimScope: 'ekodi.kr/ai/interpreter',
    claimText: '운영 배포가 완료되었습니다.',
    verdict: 'verified',
    evidenceSources: ['github-run:1234', 'https://ekodi.kr/health'],
    verifiedAt: '2026-09-23T11:09:00.000Z',
    verifier: 'ekodi-runtime-observer',
    ...overrides,
  });
}

test('detects unsupported operational completion language', () => {
  assert.equal(containsMaterialOperationalSuccessClaim('운영 배포가 완료되었습니다.'), true);
  assert.equal(containsMaterialOperationalSuccessClaim('검토 결과 다음 변경을 권장합니다.'), false);
});

test('blocks a completion statement without verified evidence', () => {
  const result = guardOperationalResponse('모든 사용자 페이지에 적용 완료되었습니다.', {}, { nowMs: NOW });
  assert.equal(result.allowed, false);
  assert.equal(result.verdict, 'unverified_broad_scope_claim_blocked');
  assert.match(result.response, /확정할 수 없습니다/);
});

test('allows a scoped completion statement only with a fresh independently verified claim receipt', () => {
  const receipt = verifiedReceipt();
  assert.equal(hasVerifiedOperationalEvidence([receipt], {
    nowMs: NOW,
    claimScope: 'ekodi.kr/ai/interpreter',
  }), true);
  const result = guardOperationalResponse('운영 배포가 완료되었습니다.', [receipt], {
    nowMs: NOW,
    claimScope: 'ekodi.kr/ai/interpreter',
  });
  assert.equal(result.allowed, true);
  assert.equal(result.verdict, 'verified');
});

test('stale evidence cannot prove current operational state', () => {
  const receipt = verifiedReceipt({ verifiedAt: '2026-09-23T10:00:00.000Z' });
  assert.equal(hasVerifiedOperationalEvidence([receipt], {
    nowMs: NOW,
    claimScope: 'ekodi.kr/ai/interpreter',
  }), false);
});

test('scope mismatch cannot be promoted to a completion claim', () => {
  const receipt = verifiedReceipt({ claimScope: 'ekodi.kr/ai/interpreter' });
  const result = guardOperationalResponse('운영 배포가 완료되었습니다.', [receipt], {
    nowMs: NOW,
    claimScope: 'ekodi.kr/admin',
  });
  assert.equal(result.allowed, false);
});

test('one route cannot prove an all-surfaces claim', () => {
  const receipt = verifiedReceipt();
  const result = guardOperationalResponse('모든 사용자 페이지에 적용 완료되었습니다.', [receipt], { nowMs: NOW });
  assert.equal(result.allowed, false);
  assert.equal(result.verdict, 'unverified_broad_scope_claim_blocked');
});

test('broad claim requires broad-scope receipt', () => {
  const receipt = verifiedReceipt({
    claimType: 'all-surfaces-applied',
    claimScope: 'all-surfaces',
    claimText: '모든 사용자 페이지에 적용 완료되었습니다.',
  });
  const result = guardOperationalResponse('모든 사용자 페이지에 적용 완료되었습니다.', [receipt], { nowMs: NOW });
  assert.equal(result.allowed, true);
});

test('agent assertion without receipt/source/verifier is not verification evidence', () => {
  const evidence = [{ claim_type: 'complete', verdict: 'verified', verifier: 'agent:sentinel' }];
  assert.equal(hasVerifiedOperationalEvidence(evidence, { nowMs: NOW }), false);
});

test('contradictory evidence blocks positive status', () => {
  const receipt = verifiedReceipt();
  const result = guardOperationalResponse('운영 배포가 완료되었습니다.', [
    receipt,
    { claim_id: 'contradiction-1', claim_type: 'deployed', verdict: 'contradicted', evidence_sources: ['runtime:failure'], verified_at: '2026-09-23T11:09:30.000Z', verifier: 'ekodi-runtime-observer' },
  ], { nowMs: NOW, claimScope: 'ekodi.kr/ai/interpreter' });
  assert.equal(result.allowed, false);
});

test('claim receipt hashes the statement and records freshness', () => {
  const receipt = verifiedReceipt();
  assert.equal(receipt.policyId, 'AI-CLAIM-INTEGRITY-001');
  assert.equal(receipt.verdict, 'verified');
  assert.equal(receipt.evidence_sources.length, 2);
  assert.equal(receipt.claim_text_hash.length, 64);
  assert.ok(Number.isInteger(receipt.freshness_seconds));
});
