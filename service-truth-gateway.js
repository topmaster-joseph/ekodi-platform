import { EKODI_SERVICE_CATALOG } from './ekodi-service-catalog.js';

const DEFAULT_MAX_EVIDENCE_AGE_MS = 15 * 60 * 1000;
const DEFAULT_PROBE_TIMEOUT_MS = 8000;

const TRUTH_FACT_PATTERN = /(?:주소|도메인|url|링크|경로|route|domain|canonical|운영|작동|접속|상태|배포|deployment|operational|online|offline|존재|서비스|관리자|admin|로그인|인증|auth|공개)/i;
const EKODI_PATTERN = /(?:ekodi|에코디)/i;

function asTime(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : null;
}

function evidenceAgeMs(checkedAt, nowMs) {
  const checkedMs = asTime(checkedAt);
  return checkedMs === null ? null : Math.max(0, nowMs - checkedMs);
}

function runtimeStateFor(service, ageMs, maxEvidenceAgeMs) {
  const declaredState = String(service?.state || service?.defaultState || '').toLowerCase();
  if (declaredState === 'planned') return 'declared';
  if (declaredState === 'paused') return 'unverified';
  const latestStatus = String(service?.latest?.status || '').toLowerCase();
  if (!latestStatus || ageMs === null || ageMs > maxEvidenceAgeMs) return 'unverified';
  if (latestStatus === 'online') return 'operational';
  if (latestStatus === 'degraded') return 'degraded';
  if (latestStatus === 'offline') return 'offline';
  return 'unverified';
}
function confidenceFor(runtimeState, service, ageMs, maxEvidenceAgeMs) {
  if (!service) return 'none';
  if (['operational', 'degraded', 'offline'].includes(runtimeState)) {
    if (ageMs !== null && ageMs <= Math.min(maxEvidenceAgeMs, 5 * 60 * 1000)) return 'high';
    return 'medium';
  }
  if (runtimeState === 'declared') return 'medium';
  return 'low';
}

export function requiresServiceTruth(input) {
  const text = String(input || '').trim();
  if (!text) return false;
  return EKODI_PATTERN.test(text) && TRUTH_FACT_PATTERN.test(text);
}

export function normalizeServiceTruth(service, options = {}) {
  if (!service || typeof service !== 'object') {
    return {
      found: false,
      runtimeState: 'unverified',
      confidence: 'none',
      reason: 'service_not_found',
      evidence: { checkedAt: null, ageMs: null, fresh: false }
    };
  }
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const maxEvidenceAgeMs = Number.isFinite(options.maxEvidenceAgeMs)
    ? Math.max(1000, options.maxEvidenceAgeMs)
    : DEFAULT_MAX_EVIDENCE_AGE_MS;
  const ageMs = evidenceAgeMs(service.latest?.checkedAt, nowMs);
  const runtimeState = runtimeStateFor(service, ageMs, maxEvidenceAgeMs);
  const fresh = ageMs !== null && ageMs <= maxEvidenceAgeMs;
  return {
    found: true,
    id: service.id || '',
    name: service.name || '',
    canonicalUrl: service.url || '',
    declaredDomain: service.domain || '',
    group: service.group || '',
    declaredState: service.state || service.defaultState || '',
    monitorEnabled: Boolean(service.monitorEnabled ?? service.defaultMonitor),
    runtimeState,
    confidence: confidenceFor(runtimeState, service, ageMs, maxEvidenceAgeMs),
    evidence: {
      source: service.latest?.source || options.evidenceSource || 'control_api_service_snapshot',
      status: service.latest?.status || null,
      httpStatus: service.latest?.httpStatus ?? null,
      responseTime: service.latest?.responseTime ?? null,
      checkedAt: service.latest?.checkedAt || null,
      ageMs,
      fresh
    }
  };
}

function selectorMatches(service, selector) {
  const needle = String(selector || '').trim().toLowerCase();
  if (!needle) return false;
  const values = [service?.id, service?.name, service?.domain, service?.url]
    .filter(Boolean)
    .map(value => String(value).toLowerCase());
  return values.some(value => value === needle || value.includes(needle) || needle.includes(value));
}

export function resolveDeclaredService(selector) {
  return EKODI_SERVICE_CATALOG.find(service => selectorMatches(service, selector)) || null;
}

export function resolveServiceTruth(services, selector, options = {}) {
  const list = Array.isArray(services) ? services : [];
  const service = list.find(item => selectorMatches(item, selector));
  return normalizeServiceTruth(service, options);
}

export async function verifyDeclaredService(selector, options = {}) {
  const service = resolveDeclaredService(selector);
  if (!service) return normalizeServiceTruth(null, options);
  const declared = { ...service, state: service.defaultState, monitorEnabled: service.defaultMonitor };
  if (service.defaultState !== 'active') return normalizeServiceTruth(declared, options);

  const fetchFn = options.fetchFn || fetch;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : DEFAULT_PROBE_TIMEOUT_MS;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  let latest;
  try {
    const response = await fetchFn(service.url, {
      method: 'GET', redirect: 'follow', signal: controller.signal,
      headers: { 'user-agent': 'EKODI-Truth-Gateway/1.0' }
    });
    await response.body?.cancel?.();
    const responseTime = Date.now() - startedAt;
    const httpStatus = response.status;
    let status = 'offline';
    if (httpStatus >= 200 && httpStatus < 400) status = responseTime > 2500 ? 'degraded' : 'online';
    else if (httpStatus >= 400 && httpStatus < 500) status = 'degraded';
    latest = {
      source: 'direct_runtime_probe', status, httpStatus, responseTime,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    latest = {
      source: 'direct_runtime_probe', status: 'unverified', httpStatus: null,
      responseTime: Date.now() - startedAt,
      detail: error?.name === 'AbortError' ? 'timeout' : String(error?.message || 'network error').slice(0, 160),
      checkedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timer);
  }
  return normalizeServiceTruth({ ...declared, latest }, options);
}

export function buildVerifiedServiceContext(truth) {
  if (!truth?.found) {
    return {
      verified: false,
      instruction: 'Do not infer an EKODI service fact. State that no authoritative service record was found.'
    };
  }
  const operationallyVerified = ['operational', 'degraded', 'offline'].includes(truth.runtimeState);
  return {
    verified: operationallyVerified,
    service: {
      id: truth.id,
      name: truth.name,
      canonicalUrl: truth.canonicalUrl,
      declaredDomain: truth.declaredDomain,
      declaredState: truth.declaredState,
      runtimeState: truth.runtimeState
    },
    evidence: truth.evidence,
    instruction: operationallyVerified
      ? 'Use these EKODI service facts as the current verified context. Do not replace them with model memory or inferred URLs.'
      : 'Separate declared facts from current runtime facts. Current operation is unverified; do not infer it from code, deployment history, model memory or URL patterns.'
  };
}

export { DEFAULT_MAX_EVIDENCE_AGE_MS, DEFAULT_PROBE_TIMEOUT_MS };
