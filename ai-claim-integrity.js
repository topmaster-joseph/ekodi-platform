import crypto from 'node:crypto';

export const AI_CLAIM_INTEGRITY_POLICY = Object.freeze({
  id: 'AI-CLAIM-INTEGRITY-001',
  version: 1,
  verifiedVerdict: 'verified',
  materialOperationalTypes: Object.freeze([
    'implemented','merged','deployed','production-live','runtime-working',
    'verified','complete','all-surfaces-applied','ecosystem-wide-normal',
  ]),
});

const KOREAN_SUCCESS_PATTERNS = Object.freeze([
  /(?:수정|구축|적용|반영|등록|병합|배포|검증)(?:이|가|은|는|을|를)?\s*(?:완료|되었습니다|됐습니다|됨)/i,
  /(?:정상\s*(?:작동|동작|운영)|운영\s*정상|전체\s*적용|모두\s*적용|전수\s*적용)/i,
  /(?:완료했습니다|완료되었습니다|완료됐습니다)/i,
]);

const ENGLISH_SUCCESS_PATTERNS = Object.freeze([
  /\b(?:implementation|deployment|verification)\s+(?:is\s+)?complete\b/i,
  /\b(?:implemented|deployed|merged|verified|completed)\b/i,
  /\b(?:live\s+in\s+production|working\s+in\s+production|all\s+surfaces\s+(?:updated|applied|verified))\b/i,
]);

function text(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function list(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function sourceVerified(source = {}) {
  const verdict = text(source.verdict || source.state || source.status, 40).toLowerCase();
  const verified = source.verified === true || verdict === 'verified' || verdict === 'passed' || verdict === 'success';
  const evidenceSources = list(source.evidence_sources || source.evidenceSources || source.sources || source.links).filter(Boolean);
  return verified && evidenceSources.length > 0;
}

export function containsMaterialOperationalSuccessClaim(value = '') {
  const input = text(value, 50000);
  if (!input) return false;
  return [...KOREAN_SUCCESS_PATTERNS, ...ENGLISH_SUCCESS_PATTERNS].some(pattern => pattern.test(input));
}

export function normalizeClaimEvidence(value = {}) {
  const candidates = list(value?.claims || value?.claimEvidence || value?.receipts || value);
  return Object.freeze(candidates
    .filter(item => item && typeof item === 'object')
    .map(item => Object.freeze({
      claimId: text(item.claim_id || item.claimId || item.id, 160) || null,
      taskId: text(item.task_id || item.taskId, 160) || null,
      claimType: text(item.claim_type || item.claimType || item.type, 80).toLowerCase() || null,
      claimScope: text(item.claim_scope || item.claimScope || item.scope, 500) || null,
      verdict: text(item.verdict || item.state || item.status, 40).toLowerCase() || 'unknown',
      verified: sourceVerified(item),
      evidenceSources: Object.freeze(list(item.evidence_sources || item.evidenceSources || item.sources || item.links).filter(Boolean)),
      observedAt: text(item.observed_at || item.observedAt, 80) || null,
      verifiedAt: text(item.verified_at || item.verifiedAt, 80) || null,
      verifier: text(item.verifier, 160) || null,
    })));
}

export function hasVerifiedOperationalEvidence(value = {}) {
  return normalizeClaimEvidence(value).some(item =>
    item.verified &&
    (!item.claimType || AI_CLAIM_INTEGRITY_POLICY.materialOperationalTypes.includes(item.claimType))
  );
}

export function buildClaimReceipt({
  taskId = '',
  claimType = 'unknown',
  claimScope = '',
  claimText = '',
  verdict = 'unknown',
  evidenceSources = [],
  observedAt = '',
  verifiedAt = '',
  verifier = '',
} = {}) {
  const now = new Date().toISOString();
  const normalizedSources = Object.freeze(list(evidenceSources).map(item => text(item, 1000)).filter(Boolean));
  const normalizedVerdict = text(verdict, 40).toLowerCase() || 'unknown';
  return Object.freeze({
    schemaVersion: 1,
    policyId: AI_CLAIM_INTEGRITY_POLICY.id,
    claim_id: `claim_${crypto.createHash('sha256').update([
      text(taskId, 160),
      text(claimType, 80),
      text(claimScope, 500),
      text(claimText, 5000),
      now,
    ].join('|')).digest('hex').slice(0, 24)}`,
    task_id: text(taskId, 160) || null,
    claim_type: text(claimType, 80).toLowerCase() || 'unknown',
    claim_scope: text(claimScope, 500) || null,
    claim_text_hash: crypto.createHash('sha256').update(text(claimText, 50000)).digest('hex'),
    verdict: normalizedVerdict,
    evidence_sources: normalizedSources,
    observed_at: text(observedAt, 80) || null,
    verified_at: text(verifiedAt, 80) || (normalizedVerdict === 'verified' ? now : null),
    verifier: text(verifier, 160) || null,
    freshness_seconds: null,
  });
}

export function guardOperationalResponse(response = '', evidence = {}, options = {}) {
  const original = text(response, 50000);
  const operationalClaim = containsMaterialOperationalSuccessClaim(original);
  const verified = hasVerifiedOperationalEvidence(evidence);

  if (!operationalClaim || verified) {
    return Object.freeze({
      allowed: true,
      verdict: operationalClaim ? 'verified' : 'not_material_operational_claim',
      response: original,
      operationalClaim,
      verifiedEvidence: verified,
    });
  }

  const safeStatus = text(options.safeStatus, 500)
    || '현재 제공된 검증 증거만으로는 완료·배포·정상 작동을 확정할 수 없습니다. 확인 가능한 실행 증거를 다시 수집한 뒤 상태를 확정해야 합니다.';

  return Object.freeze({
    allowed: false,
    verdict: 'unverified_operational_success_claim_blocked',
    response: safeStatus,
    operationalClaim: true,
    verifiedEvidence: false,
  });
}
