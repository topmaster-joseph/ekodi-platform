const DEFAULT_POLICY = Object.freeze({
  trafficRatioBands: Object.freeze({ normalMax: 2, elevatedMax: 5, highMax: 10 }),
  thresholds: Object.freeze({ cpuPct: 80, memoryPct: 85, dbPoolPct: 75, p95LatencyMs: 1200, errorRatePct: 2 })
});

const INDEX_WEIGHTS = Object.freeze({ EHI: 0.24, ESI: 0.18, ERI: 0.18, EAI: 0.14, E2I: 0.12, ECRI: 0.14 });

export function clampScore(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function available(entries) {
  return entries.filter(([, value]) => Number.isFinite(value));
}

export function weightedScore(entries) {
  const usable = available(entries);
  if (!usable.length) return null;
  const denominator = usable.reduce((sum, [, , weight]) => sum + weight, 0);
  if (!denominator) return null;
  return clampScore(usable.reduce((sum, [, value, weight]) => sum + value * weight, 0) / denominator);
}

function inversePressure(value, warn, fail = 100) {
  if (!Number.isFinite(value)) return null;
  if (value <= warn * 0.5) return 100;
  if (value >= fail) return 0;
  return clampScore(100 - ((value - warn * 0.5) / (fail - warn * 0.5)) * 100);
}

function inverseLatency(value, warn) {
  if (!Number.isFinite(value)) return null;
  if (value <= warn * 0.25) return 100;
  if (value >= warn * 4) return 0;
  return clampScore(100 - ((value - warn * 0.25) / (warn * 3.75)) * 100);
}

function inverseErrorRate(value, warn) {
  if (!Number.isFinite(value)) return null;
  if (value <= warn * 0.1) return 100;
  if (value >= Math.max(10, warn * 5)) return 0;
  return clampScore(100 - ((value - warn * 0.1) / (Math.max(10, warn * 5) - warn * 0.1)) * 100);
}

function normalizeOptionalScore(value) {
  return Number.isFinite(value) ? clampScore(value) : null;
}

export function assessTrafficSurge(signals = {}, policy = DEFAULT_POLICY) {
  const baselineRps = Number(signals.baselineRps);
  const currentRps = Number(signals.currentRps);
  const ratio = baselineRps > 0 && currentRps >= 0 ? currentRps / baselineRps : null;
  const bands = policy.trafficRatioBands || DEFAULT_POLICY.trafficRatioBands;
  const thresholds = policy.thresholds || DEFAULT_POLICY.thresholds;

  let level = 'UNKNOWN';
  if (Number.isFinite(ratio)) {
    if (ratio <= bands.normalMax) level = 'NORMAL';
    else if (ratio <= bands.elevatedMax) level = 'ELEVATED';
    else if (ratio <= bands.highMax) level = 'HIGH';
    else level = 'EXTREME';
  }

  const pressureSignals = [
    ['cpuPct', signals.cpuPct, thresholds.cpuPct],
    ['memoryPct', signals.memoryPct, thresholds.memoryPct],
    ['dbPoolPct', signals.dbPoolPct, thresholds.dbPoolPct],
    ['p95LatencyMs', signals.p95LatencyMs, thresholds.p95LatencyMs],
    ['errorRatePct', signals.errorRatePct, thresholds.errorRatePct]
  ];
  const breached = pressureSignals.filter(([, value, limit]) => Number.isFinite(value) && value >= limit).map(([name]) => name);
  if (breached.length >= 2 && (level === 'NORMAL' || level === 'ELEVATED')) level = 'HIGH';
  if (breached.length >= 4) level = 'EXTREME';

  return {
    level,
    trafficRatio: Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : null,
    breached,
    evidenceComplete: Number.isFinite(ratio)
  };
}

export function proposeProtectiveActions(assessment, signals = {}) {
  const actions = [];
  const add = (id, risk, reason) => actions.push({ id, risk, reason, reversible: true });
  if (!assessment || assessment.level === 'UNKNOWN' || assessment.level === 'NORMAL') return actions;

  add('scale_out_reversible', 'LOW', `traffic_${assessment.level.toLowerCase()}`);
  add('increase_safe_cache_reuse', 'LOW', 'reduce_origin_pressure');
  if (assessment.breached?.includes('dbPoolPct')) add('protect_db_connection_budget', 'LOW', 'db_pool_pressure');
  if (assessment.level === 'HIGH' || assessment.level === 'EXTREME') {
    add('enable_queue_backpressure', 'LOW', 'surge_absorption');
    add('defer_noncritical_jobs', 'LOW', 'preserve_critical_paths');
    add('defer_heavy_ai_work', 'LOW', 'protect_latency_and_cost');
  }
  if (Number.isFinite(signals.costBurnRatePct) && signals.costBurnRatePct >= 80) {
    add('watch_cost_ceiling', 'LOW', 'cost_burn_rate_high');
  }
  if (assessment.level === 'EXTREME') {
    add('preserve_critical_user_paths', 'MEDIUM', 'graceful_degradation_required');
  }
  return actions;
}

export function applyActionGuardrails(actions = [], options = {}) {
  const allowMedium = options.allowMedium === true;
  return actions.map(action => {
    const autoExecutable = action.risk === 'LOW' || (action.risk === 'MEDIUM' && allowMedium && action.reversible === true);
    return {
      ...action,
      decision: autoExecutable ? 'AUTO_ALLOWED' : 'APPROVAL_REQUIRED',
      verificationRequired: true,
      auditRequired: true
    };
  });
}

export function computeIndices(signals = {}) {
  const thresholds = DEFAULT_POLICY.thresholds;
  const cpu = inversePressure(signals.cpuPct, thresholds.cpuPct);
  const memory = inversePressure(signals.memoryPct, thresholds.memoryPct);
  const db = inversePressure(signals.dbPoolPct, thresholds.dbPoolPct);
  const latency = inverseLatency(signals.p95LatencyMs, thresholds.p95LatencyMs);
  const errors = inverseErrorRate(signals.errorRatePct, thresholds.errorRatePct);

  const EHI = weightedScore([
    ['cpu', cpu, 0.18], ['memory', memory, 0.16], ['db', db, 0.20], ['latency', latency, 0.24], ['errors', errors, 0.22]
  ]);
  const ESI = weightedScore([
    ['headroom', normalizeOptionalScore(signals.capacityHeadroomScore), 0.35],
    ['autoscaling', normalizeOptionalScore(signals.autoscalingReadinessScore), 0.35],
    ['backpressure', normalizeOptionalScore(signals.backpressureReadinessScore), 0.30]
  ]);
  const ERI = weightedScore([
    ['availability', normalizeOptionalScore(signals.availabilityScore), 0.40],
    ['recovery', normalizeOptionalScore(signals.recoveryReadinessScore), 0.35],
    ['dependency', normalizeOptionalScore(signals.dependencyIsolationScore), 0.25]
  ]);
  const EAI = weightedScore([
    ['autonomousDetection', normalizeOptionalScore(signals.autonomousDetectionScore), 0.30],
    ['autonomousSafeAction', normalizeOptionalScore(signals.autonomousSafeActionScore), 0.40],
    ['verification', normalizeOptionalScore(signals.autonomousVerificationScore), 0.30]
  ]);
  const E2I = weightedScore([
    ['learning', normalizeOptionalScore(signals.learningScore), 0.35],
    ['reuse', normalizeOptionalScore(signals.experienceReuseScore), 0.35],
    ['repeatPrevention', normalizeOptionalScore(signals.repeatIncidentPreventionScore), 0.30]
  ]);
  const ECRI = weightedScore([
    ['containment', normalizeOptionalScore(signals.containmentScore), 0.25],
    ['continuity', normalizeOptionalScore(signals.serviceContinuityScore), 0.30],
    ['recovery', normalizeOptionalScore(signals.recoveryReadinessScore), 0.25],
    ['dataProtection', normalizeOptionalScore(signals.dataProtectionScore), 0.20]
  ]);

  const indices = { EHI, ESI, ERI, EAI, E2I, ECRI };
  const present = Object.entries(indices).filter(([, value]) => value !== null);
  const systemScore = weightedScore(present.map(([name, value]) => [name, value, INDEX_WEIGHTS[name]]));
  const coveragePct = clampScore((present.length / Object.keys(indices).length) * 100);
  return { indices, systemScore, coveragePct };
}

export function buildAutonomousHealthReport(signals = {}, options = {}) {
  const observedAt = options.observedAt || new Date().toISOString();
  const traffic = assessTrafficSurge(signals, options.policy || DEFAULT_POLICY);
  const proposedActions = proposeProtectiveActions(traffic, signals);
  const guardrailDecisions = applyActionGuardrails(proposedActions, { allowMedium: options.allowMedium === true });
  const scoring = computeIndices(signals);

  const state = traffic.level === 'EXTREME' ? 'CRITICAL'
    : traffic.level === 'HIGH' ? 'DEGRADED'
      : traffic.level === 'ELEVATED' ? 'WATCH'
        : traffic.level === 'NORMAL' ? 'HEALTHY'
          : 'UNKNOWN';

  return {
    schemaVersion: 1,
    observedAt,
    generation: 10,
    state,
    traffic,
    coveragePct: scoring.coveragePct,
    indices: scoring.indices,
    systemScore: scoring.systemScore,
    evidence: Object.fromEntries(Object.entries(signals).filter(([, value]) => value !== undefined)),
    proposedActions,
    guardrailDecisions,
    verificationStatus: proposedActions.length ? 'REQUIRED_BEFORE_AND_AFTER_MUTATION' : 'NOT_REQUIRED',
    transparency: {
      fabricatedScoresForbidden: true,
      directProductionMutation: false,
      aiRequiredForAssessment: false
    }
  };
}

export const AUTONOMOUS_HEALTH_POLICY = DEFAULT_POLICY;
