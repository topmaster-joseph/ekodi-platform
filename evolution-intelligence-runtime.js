import { evaluateMissionAction } from './ai-governance-runtime.js';

export const EVOLUTION_INTELLIGENCE_POLICY = Object.freeze({
  version: '1.0.0',
  principle: 'verification_first_security_native_self_evolving',
  finalAuthority: 'ekodi_platform_super_administrator',
  evidenceRequiredForPublishedRecommendation: true,
  providerIndependent: true,
  securityNative: true,
  automaticScope: Object.freeze([
    'observe', 'analyze', 'forecast', 'score', 'compare', 'sandbox_recommendation'
  ]),
  approvalRequired: Object.freeze([
    'production_change', 'shared_core_creation', 'permission_expansion',
    'paid_cost_commitment', 'data_migration', 'destructive_change',
    'security_boundary_change', 'production_dns_change', 'provider_lock_in'
  ]),
  sourcePriority: Object.freeze([
    'standard', 'official_spec', 'security_advisory', 'paper', 'official_doc',
    'official_repo', 'independent_benchmark', 'internal_metric', 'independent_analysis',
    'news', 'community'
  ]),
});

const AUTHORITATIVE_TYPES = new Set([
  'standard', 'official_spec', 'security_advisory', 'paper', 'official_doc', 'official_repo'
]);
const CORROBORATING_TYPES = new Set([
  'independent_benchmark', 'internal_metric', 'independent_analysis', 'paper', 'security_advisory'
]);
const DEFAULT_WEIGHTS = Object.freeze({
  capabilityGap: 18,
  commonality: 12,
  reusability: 10,
  securityReadiness: 14,
  operationalImpact: 12,
  urgency: 10,
  maturity: 8,
  independence: 7,
  costEfficiency: 5,
  evidence: 4,
});

const DEFAULT_HEALTH_THRESHOLDS = Object.freeze({
  latencyP95Ms: 1800,
  errorRatePct: 2,
  dbUtilizationPct: 75,
  queueDepth: 1000,
  cacheHitPct: 60,
  aiCostGrowthPct: 30,
  storageUtilizationPct: 80,
  capacityUtilizationPct: 75,
  criticalSecurityEvents: 0,
});

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}
function iso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export function normalizeEvidenceSource(source = {}) {
  const url = safeUrl(source.url);
  return Object.freeze({
    id: String(source.id || '').trim(),
    title: String(source.title || 'Untitled source').trim(),
    publisher: String(source.publisher || 'Unknown').trim(),
    type: String(source.type || 'independent_analysis').trim().toLowerCase(),
    url,
    publishedAt: source.publishedAt ? iso(source.publishedAt) : null,
    version: String(source.version || '').trim() || null,
    verifiedAt: iso(source.verifiedAt || new Date()),
    claim: String(source.claim || '').trim(),
    internal: Boolean(source.internal),
  });
}
export function gradeEvidence(sources = []) {
  const normalized = sources.map(normalizeEvidenceSource).filter(source => source.url);
  const publishers = new Set(normalized.map(source => source.publisher.toLowerCase()));
  const authoritative = normalized.some(source => AUTHORITATIVE_TYPES.has(source.type));
  const corroborating = normalized.some(source => CORROBORATING_TYPES.has(source.type));
  const independent = normalized.some(source =>
    ['independent_benchmark', 'independent_analysis', 'paper', 'internal_metric'].includes(source.type)
  );

  let grade = 'C';
  let score = normalized.length ? 35 : 0;
  if (authoritative) score += 25;
  if (corroborating) score += 15;
  if (independent) score += 10;
  if (publishers.size >= 2) score += 15;
  score = clamp(score);
  if (authoritative && corroborating && publishers.size >= 2) grade = 'A';
  else if (authoritative || (normalized.length >= 2 && publishers.size >= 2)) grade = 'B';

  return Object.freeze({
    grade,
    score,
    sources: Object.freeze(normalized),
    sourceCount: normalized.length,
    publisherCount: publishers.size,
    publishable: normalized.length > 0,
  });
}
export function scoreRecommendation(criteria = {}, sources = []) {
  const evidence = gradeEvidence(sources);
  const values = { ...criteria, evidence: evidence.score };
  let weighted = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(DEFAULT_WEIGHTS)) {
    weighted += clamp(values[key] ?? 50) * weight;
    totalWeight += weight;
  }
  const score = Math.round((weighted / totalWeight) * 10) / 10;
  const priority = score >= 95 ? 'critical_strategic'
    : score >= 85 ? 'high'
      : score >= 75 ? 'recommend'
        : score >= 60 ? 'watch'
          : 'internal';
  return Object.freeze({ score, priority, evidence });
}

export function approvalGate(change = {}) {
  const reasons = [];
  const flags = {
    production_change: change.productionChange,
    shared_core_creation: change.createsSharedCore,
    permission_expansion: change.permissionExpansion,
    paid_cost_commitment: change.paidCostCommitment,
    data_migration: change.dataMigration,
    destructive_change: change.destructive,
    security_boundary_change: change.securityBoundaryChange,
    production_dns_change: change.productionDnsChange,
    provider_lock_in: change.providerLockIn,
  };
  for (const area of EVOLUTION_INTELLIGENCE_POLICY.approvalRequired) {
    if (Boolean(flags[area])) reasons.push(area);
  }
  const mission = evaluateMissionAction({
    agentId: 'platform',
    area: reasons.length ? 'shared_core_breaking_change' : 'analytics',
    reversible: Boolean(change.reversible),
    delegated: Boolean(change.delegated),
    logged: Boolean(change.logged),
    preflightVerified: Boolean(change.preflightVerified),
  });
  return Object.freeze({
    required: reasons.length > 0 || mission.tier === 'human_gate',
    authority: EVOLUTION_INTELLIGENCE_POLICY.finalAuthority,
    reasons: Object.freeze(reasons),
    missionDecision: mission,
    automaticExecutionAllowed: reasons.length === 0 && mission.tier === 'observe',
  });
}

function recommendationId(type, title, target) {
  const seed = `${type}:${target}:${title}`.toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `evo_${(hash >>> 0).toString(36)}`;
}
export function buildRecommendation(input = {}) {
  const verifiedAt = iso(input.verifiedAt || new Date());
  const scored = scoreRecommendation(input.criteria, input.sources);
  const gate = approvalGate(input.change || {});
  const title = String(input.title || 'Untitled recommendation').trim();
  const type = String(input.type || 'platform_improvement').trim();
  const publishable = scored.evidence.publishable;

  return Object.freeze({
    id: recommendationId(type, title, String(input.target || 'platform')),
    type,
    title,
    summary: String(input.summary || '').trim(),
    reason: String(input.reason || '').trim(),
    target: String(input.target || 'platform').trim(),
    score: scored.score,
    priority: scored.priority,
    confidence: scored.evidence.score,
    evidenceGrade: scored.evidence.grade,
    references: scored.evidence.sources,
    verifiedAt,
    metrics: Object.freeze({ ...(input.metrics || {}) }),
    alternatives: Object.freeze([...(input.alternatives || [])]),
    risks: Object.freeze([...(input.risks || [])]),
    rolloutPlan: Object.freeze([...(input.rolloutPlan || [])]),
    rollbackPlan: Object.freeze([...(input.rollbackPlan || [])]),
    approval: gate,
    publishable,
    status: publishable ? (gate.required ? 'proposed' : 'recommendable') : 'evidence_required',
  });
}
function internalMetricSource(snapshot = {}) {
  return snapshot.sourceUrl ? [{
    id: `metric:${snapshot.id || 'platform'}`,
    title: snapshot.sourceTitle || 'EKODI Platform Health telemetry',
    publisher: 'EKODI Platform',
    type: 'internal_metric',
    url: snapshot.sourceUrl,
    verifiedAt: snapshot.observedAt || new Date(),
    claim: 'Operational telemetry used for this recommendation.',
    internal: true,
  }] : [];
}

function healthRecommendation(snapshot, input) {
  return buildRecommendation({
    type: 'platform_health',
    target: snapshot.id || 'platform',
    sources: [...internalMetricSource(snapshot), ...(input.sources || [])],
    verifiedAt: snapshot.observedAt,
    criteria: {
      capabilityGap: 86, commonality: 82, reusability: 88,
      securityReadiness: input.securityReadiness ?? 88,
      operationalImpact: input.impact ?? 90, urgency: input.urgency ?? 82,
      maturity: 92, independence: 92, costEfficiency: input.costEfficiency ?? 86,
    },
    alternatives: input.alternatives || [],
    risks: input.risks || [],
    rolloutPlan: ['sandbox_or_development', 'load_and_failure_test', 'canary', 'observe', 'promote_after_approval'],
    rollbackPlan: ['preserve_previous_configuration', 'automatic_canary_abort', 'revert_to_last_verified_state'],
    ...input,
  });
}
export function analyzePlatformHealth(snapshot = {}, thresholds = {}) {
  const limit = { ...DEFAULT_HEALTH_THRESHOLDS, ...thresholds };
  const metrics = snapshot.metrics || {};
  const recommendations = [];

  if (Number(metrics.latencyP95Ms) >= limit.latencyP95Ms) {
    recommendations.push(healthRecommendation(snapshot, {
      title: '응답지연 구조 개선',
      summary: 'P95 지연시간이 운영 기준을 초과했습니다.',
      reason: '증설 전에 캐시, 비동기 처리, 병목 API와 DB 조회를 우선 개선합니다.',
      metrics: { latencyP95Ms: metrics.latencyP95Ms, thresholdMs: limit.latencyP95Ms },
      alternatives: ['cache_and_async', 'query_optimization', 'horizontal_scale'],
      change: { productionChange: true, reversible: true },
    }));
  }

  if (Number(metrics.errorRatePct) >= limit.errorRatePct) {
    recommendations.push(healthRecommendation(snapshot, {
      title: '오류율 안정화',
      summary: '오류율이 운영 기준을 초과했습니다.',
      reason: '장애격리, 재시도 정책, 회로차단기와 최근 배포 영향부터 검증합니다.',
      metrics: { errorRatePct: metrics.errorRatePct, thresholdPct: limit.errorRatePct },
      alternatives: ['fault_isolation', 'circuit_breaker', 'rollback_candidate'],
      urgency: 94,
      change: { productionChange: true, reversible: true },
    }));
  }
  if (Number(metrics.dbUtilizationPct) >= limit.dbUtilizationPct) {
    recommendations.push(healthRecommendation(snapshot, {
      title: '데이터 계층 확장성 개선',
      summary: 'DB 사용률이 지속가능 운영 범위를 벗어나고 있습니다.',
      reason: '쿼리 최적화와 캐시를 우선 검증하고 필요할 때 Read Replica 또는 분리를 제안합니다.',
      metrics: { dbUtilizationPct: metrics.dbUtilizationPct, thresholdPct: limit.dbUtilizationPct },
      alternatives: ['query_and_index_tuning', 'cache', 'read_replica', 'service_data_split'],
      impact: 94,
      change: { productionChange: true, dataMigration: Boolean(metrics.requiresDataMigration), reversible: true },
    }));
  }

  if (Number(metrics.queueDepth) >= limit.queueDepth) {
    recommendations.push(healthRecommendation(snapshot, {
      title: '비동기 작업 처리량 개선',
      summary: '작업 큐 적체가 기준을 초과했습니다.',
      reason: 'Worker 동시성, 작업 분리, backpressure와 우선순위 정책을 검토합니다.',
      metrics: { queueDepth: metrics.queueDepth, threshold: limit.queueDepth },
      alternatives: ['worker_autoscale', 'queue_partition', 'backpressure'],
      change: { productionChange: true, reversible: true },
    }));
  }

  if (Number.isFinite(Number(metrics.cacheHitPct)) && Number(metrics.cacheHitPct) < limit.cacheHitPct) {
    recommendations.push(healthRecommendation(snapshot, {
      title: '캐시 효율 개선',
      summary: '캐시 적중률이 기대 수준보다 낮습니다.',
      reason: '핫데이터, TTL, 무효화 정책을 재설계해 DB와 API 부하를 낮춥니다.',
      metrics: { cacheHitPct: metrics.cacheHitPct, targetPct: limit.cacheHitPct },
      alternatives: ['ttl_tuning', 'key_redesign', 'request_coalescing'],
      costEfficiency: 94,
      change: { productionChange: true, reversible: true },
    }));
  }
  if (Number(metrics.aiCostGrowthPct) >= limit.aiCostGrowthPct) {
    recommendations.push(healthRecommendation(snapshot, {
      title: 'AI 비용·모델 라우팅 최적화',
      summary: 'AI 호출비 증가율이 관리 기준을 초과했습니다.',
      reason: '단순 요청은 저비용 경로로, 복잡 요청은 고성능 모델로 라우팅하고 캐시·재사용을 검토합니다.',
      metrics: { aiCostGrowthPct: metrics.aiCostGrowthPct, thresholdPct: limit.aiCostGrowthPct },
      alternatives: ['model_routing', 'semantic_cache', 'prompt_compaction', 'provider_compare'],
      costEfficiency: 98,
      change: { productionChange: true, providerLockIn: false, reversible: true },
    }));
  }

  if (Number(metrics.criticalSecurityEvents) > limit.criticalSecurityEvents) {
    recommendations.push(healthRecommendation(snapshot, {
      title: '보안 이상행위 격리·검증',
      summary: 'Critical 보안 이벤트가 탐지되었습니다.',
      reason: '자동 차단 범위 내에서 격리하고 신원·권한·도구호출·감사로그를 교차검증합니다.',
      metrics: { criticalSecurityEvents: metrics.criticalSecurityEvents },
      urgency: 100,
      securityReadiness: 100,
      alternatives: ['isolate_and_investigate', 'credential_rotation_after_approval'],
      change: { securityBoundaryChange: true, permissionExpansion: false, reversible: true },
    }));
  }

  return Object.freeze({
    generatedAt: iso(snapshot.observedAt || new Date()),
    target: snapshot.id || 'platform',
    thresholds: Object.freeze(limit),
    recommendations: Object.freeze(recommendations),
    publishableCount: recommendations.filter(item => item.publishable).length,
    approvalRequiredCount: recommendations.filter(item => item.approval.required).length,
  });
}
export function evaluateTechnologyCandidate(candidate = {}) {
  const criteria = {
    capabilityGap: candidate.capabilityGap ?? 50,
    commonality: candidate.commonality ?? 50,
    reusability: candidate.reusability ?? 50,
    securityReadiness: candidate.securityReadiness ?? 50,
    operationalImpact: candidate.operationalImpact ?? 50,
    urgency: candidate.urgency ?? 50,
    maturity: candidate.maturity ?? 50,
    independence: candidate.independence ?? 50,
    costEfficiency: candidate.costEfficiency ?? 50,
  };
  return buildRecommendation({
    type: 'technology_radar',
    title: candidate.title || candidate.name || 'Technology candidate',
    summary: candidate.summary || '',
    reason: candidate.reason || '',
    target: candidate.target || 'platform',
    criteria,
    sources: candidate.sources || [],
    verifiedAt: candidate.verifiedAt,
    alternatives: candidate.alternatives || [],
    risks: candidate.risks || [],
    rolloutPlan: candidate.rolloutPlan || ['sandbox', 'benchmark', 'security_test', 'limited_pilot'],
    rollbackPlan: candidate.rollbackPlan || ['disable_adapter', 'restore_previous_route'],
    change: candidate.change || { createsSharedCore: Boolean(candidate.createsSharedCore), reversible: true },
  });
}

export function buildEvidenceLedgerEntry(recommendation) {
  return Object.freeze({
    recommendationId: recommendation.id,
    title: recommendation.title,
    verifiedAt: recommendation.verifiedAt,
    evidenceGrade: recommendation.evidenceGrade,
    confidence: recommendation.confidence,
    references: recommendation.references.map(source => Object.freeze({ ...source })),
  });
}
export function analyzeServiceFleet(overview = {}, options = {}) {
  const sourceUrl = options.sourceUrl || '';
  const observedAt = overview.generatedAt || new Date();
  const recommendations = [];
  for (const service of overview.services || []) {
    if (service.state !== 'active' || !service.monitorEnabled || !service.latest) continue;
    const maxResponse = Number(service.stats24h?.maxResponseTime || 0);
    const averageResponse = Number(service.stats24h?.averageResponseTime || 0);
    const availability = Number(service.stats24h?.availabilityPercent ?? 100);
    const offline = Number(service.stats24h?.offline || 0);
    const degraded = Number(service.stats24h?.degraded || 0);
    const snapshot = {
      id: service.id,
      observedAt,
      sourceUrl,
      sourceTitle: `EKODI AI Ops · ${service.name}`,
    };
    if (maxResponse >= 2500 || averageResponse >= 1800) {
      recommendations.push(healthRecommendation(snapshot, {
        title: `${service.name} 응답성 개선`,
        summary: '24시간 응답지표가 성능 검토 기준을 넘었습니다.',
        reason: '증설보다 요청 경로, 캐시, 쿼리와 비동기 분리를 먼저 검증합니다.',
        metrics: { averageResponseMs: averageResponse, maxResponseMs: maxResponse },
        alternatives: ['request_path_profile', 'cache', 'query_tuning', 'async_work', 'scale_after_evidence'],
        change: { productionChange: true, reversible: true },
      }));
    }
    if (availability < 99 || offline > 0 || degraded >= 2) {
      recommendations.push(healthRecommendation(snapshot, {
        title: `${service.name} 안정성 개선`,
        summary: '24시간 가용성 또는 장애·저하 지표가 안정성 검토 기준에 도달했습니다.',
        reason: '최근 배포, 외부 의존성, timeout, 재시도, 회로차단과 장애격리 상태를 교차검증합니다.',
        metrics: { availabilityPercent: availability, offlineChecks: offline, degradedChecks: degraded },
        alternatives: ['dependency_isolation', 'timeout_retry_review', 'circuit_breaker', 'release_correlation'],
        urgency: offline > 0 ? 96 : 84,
        change: { productionChange: true, reversible: true },
      }));
    }
  }
  recommendations.sort((left, right) => right.score - left.score);
  return Object.freeze({
    schemaVersion: 1,
    generatedAt: iso(observedAt),
    recommendationCount: recommendations.length,
    publishableCount: recommendations.filter(item => item.publishable).length,
    approvalRequiredCount: recommendations.filter(item => item.approval.required).length,
    recommendations: Object.freeze(recommendations),
  });
}

export function computeTechnologyMaturityIndex(areas = {}) {
  const entries = Object.entries(areas).map(([area, value]) => Object.freeze({ area, score: clamp(value) }));
  const score = entries.length
    ? Math.round((entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length) * 10) / 10
    : 0;
  return Object.freeze({
    score,
    areas: Object.freeze(entries.sort((left, right) => left.score - right.score)),
    gaps: Object.freeze(entries.filter(entry => entry.score < 85).map(entry => entry.area)),
  });
}
