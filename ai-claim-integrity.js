import crypto from 'node:crypto';

export const AI_CLAIM_INTEGRITY_POLICY = Object.freeze({
  id: 'AI-CLAIM-INTEGRITY-001',
  version: 1,
  verifiedVerdict: 'verified',
  maxCurrentStateAgeSeconds: 900,
  materialOperationalTypes: Object.freeze([
    'implemented','merged','deployed','production-live','runtime-working',
    'verified','complete','all-surfaces-applied','ecosystem-wide-normal',
  ]),
  broadScopeTypes: Object.freeze(['all-surfaces-applied','ecosystem-wide-normal']),
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

const BROAD_SCOPE_PATTERNS = Object.freeze([
  /(?:모든|전체|모두|전수)\s*(?:사용자|관리자|사이트|페이지|서비스|화면|경로|적용|반영|검증|정상)/i,
  /\b(?:all|every)\s+(?:user|admin|site|page|service|surface|route)s?\b/i,
  /\b(?:ecosystem[- ]wide|platform[- ]wide)\b/i,
]);

function text(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function list(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function epochMs(value) {
  const parsed = Date.parse(text(value, 80));
  return Number.isFinite(parsed) ? parsed : null;
}

function evidenceAgeSeconds(item, nowMs) {
  const timestamp = epochMs(item.verifiedAt) ?? epochMs(item.observedAt);
  if (timestamp === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((nowMs - timestamp) / 1000));
}

function isBroadScopeClaim(value = '') {
  const input = text(value, 50000);
  return BROAD_SCOPE_PATTERNS.some(pattern => pattern.test(input));
}

function broadScopeCovered(item = {}) {
  if (AI_CLAIM_INTEGRITY_POLICY.broadScopeTypes.includes(item.claimType)) return true;
  const scope = text(item.claimScope, 500).toLowerCase();
  return ['all-surfaces','all-sites','ecosystem-wide','platform-wide','ekodi-ecosystem'].some(token => scope.includes(token));
}

function scopeMatches(item = {}, expectedScope = '') {
  const expected = text(expectedScope, 500).toLowerCase();
  if (!expected) return true;
  const actual = text(item.claimScope, 500).toLowerCase();
  return Boolean(actual) && actual === expected;
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
      verifier: text(item.verifier || item.independent_verifier || item.independentVerifier, 160) || null,
    })));
}

export function hasVerifiedOperationalEvidence(value = {}, options = {}) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const expectedScope = text(options.claimScope, 500);
  const broadScope = options.broadScope === true;
  const evidence = normalizeClaimEvidence(value);

  if (evidence.some(item => item.verdict === 'contradicted')) return false;

  return evidence.some(item => {
    if (!item.claimId || !item.verified || !item.verifier) return false;
    if (item.claimType && !AI_CLAIM_INTEGRITY_POLICY.materialOperationalTypes.includes(item.claimType)) return false;
    if (evidenceAgeSeconds(item, nowMs) > AI_CLAIM_INTEGRITY_POLICY.maxCurrentStateAgeSeconds) return false;
    if (!scopeMatches(item, expectedScope)) return false;
    if (broadScope && !broadScopeCovered(item)) return false;
    return true;
  });
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
  const now = new Date();
  const nowIso = now.toISOString();
  const normalizedSources = Object.freeze(list(evidenceSources).map(item => text(item, 1000)).filter(Boolean));
  const normalizedVerdict = text(verdict, 40).toLowerCase() || 'unknown';
  const verifiedTimestamp = text(verifiedAt, 80) || (normalizedVerdict === 'verified' ? nowIso : null);
  const observedTimestamp = text(observedAt, 80) || null;
  const evidenceTimestampMs = epochMs(verifiedTimestamp) ?? epochMs(observedTimestamp);
  const freshnessSeconds = evidenceTimestampMs === null ? null : Math.max(0, Math.floor((now.getTime() - evidenceTimestampMs) / 1000));
  return Object.freeze({
    schemaVersion: 1,
    policyId: AI_CLAIM_INTEGRITY_POLICY.id,
    claim_id: `claim_${crypto.createHash('sha256').update([
      text(taskId, 160),
      text(claimType, 80),
      text(claimScope, 500),
      text(claimText, 5000),
      nowIso,
    ].join('|')).digest('hex').slice(0, 24)}`,
    task_id: text(taskId, 160) || null,
    claim_type: text(claimType, 80).toLowerCase() || 'unknown',
    claim_scope: text(claimScope, 500) || null,
    claim_text_hash: crypto.createHash('sha256').update(text(claimText, 50000)).digest('hex'),
    verdict: normalizedVerdict,
    evidence_sources: normalizedSources,
    observed_at: observedTimestamp,
    verified_at: verifiedTimestamp,
    verifier: text(verifier, 160) || null,
    freshness_seconds: freshnessSeconds,
  });
}

export function guardOperationalResponse(response = '', evidence = {}, options = {}) {
  const original = text(response, 50000);
  const operationalClaim = containsMaterialOperationalSuccessClaim(original);
  const broadScope = operationalClaim && isBroadScopeClaim(original);
  const verified = operationalClaim
    ? hasVerifiedOperationalEvidence(evidence, {
        nowMs: options.nowMs,
        claimScope: options.claimScope,
        broadScope,
      })
    : false;

  if (!operationalClaim || verified) {
    return Object.freeze({
      allowed: true,
      verdict: operationalClaim ? 'verified' : 'not_material_operational_claim',
      response: original,
      operationalClaim,
      broadScope,
      verifiedEvidence: verified,
    });
  }

  const safeStatus = text(options.safeStatus, 500)
    || '현재 제공된 검증 증거만으로는 완료·배포·정상 작동을 확정할 수 없습니다. 확인 가능한 실행 증거를 다시 수집한 뒤 상태를 확정해야 합니다.';

  return Object.freeze({
    allowed: false,
    verdict: broadScope ? 'unverified_broad_scope_claim_blocked' : 'unverified_operational_success_claim_blocked',
    response: safeStatus,
    operationalClaim: true,
    broadScope,
    verifiedEvidence: false,
  });
}
