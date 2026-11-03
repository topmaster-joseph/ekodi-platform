// EKODI Eval Lab: read-only, privacy-preserving aggregate projection.
// This is operating telemetry, NOT an evaluation scorecard or goldens.
import {OPS_BASELINE_SQL, orchestratorHealth, providerReliability} from './ops-baseline.mjs';

const safeCount = n => Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0;
const isProviderId = value => /^[a-z0-9][a-z0-9:_-]{0,79}$/i.test(String(value ?? ''));
const dateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''));
const trustworthy = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export async function queryOperationalSnapshot(db, now = new Date().toISOString()) {
  if (!db || typeof db.prepare !== 'function') throw new Error('D1_REQUIRED');
  if (!trustworthy(now)) throw new Error('INVALID_OBSERVATION_TIME');
  const since = new Date(Date.parse(now) - 30 * 24 * 60 * 60 * 1000).toISOString();
  // SQL only reads aggregate counters; no task titles, prompts, payloads or IDs.
  const [providers, daily, states] = await Promise.all([
    db.prepare(OPS_BASELINE_SQL.providerOverall).bind(since).all(),
    db.prepare(OPS_BASELINE_SQL.routingDaily).bind(since).all(),
    db.prepare(OPS_BASELINE_SQL.orchestratorStates).all(),
  ]);
  const providerRows = providerReliability((providers.results || []).filter(row => isProviderId(row.provider_id)))
    .filter(row => row.n >= 10)
    .slice(0, 25)
    .map(row => ({
      provider:row.provider,
      attempted:row.n,
      selected:Math.round(row.estimate * row.n),
      failed:safeCount(row.failed),
      selectionRate:{estimate:row.estimate,lower:row.lower,upper:row.upper},
    }));
  const days=(daily.results || [])
    .filter(row=>dateOnly(row.day))
    .map(row=>({day:row.day,attempts:safeCount(row.tries),selected:safeCount(row.ok)}))
    .sort((a,b)=>a.day.localeCompare(b.day))
    .slice(-14);
  const tasks=orchestratorHealth(states.results || []);
  return Object.freeze({
    source:'cloudflare-d1-aggregate',
    observedAt:now,
    since,
    providerMetric:'selected_events_divided_by_attempt_events_not_semantic_quality',
    providers:providerRows,
    routingDays:days,
    orchestrator:{
      completionLast7d:tasks.completionLast7d,
      completionAllTime:tasks.completionAllTime,
      assignedOlderThan7Days:tasks.orphanedAssigned,
      assignedLast7Days:tasks.openAssignedLast7d,
      totalTracked:tasks.total,
    },
  });
}

export function unresolvedEvaluationSnapshot(operations) {
  // Never assert "verified" without an approved hold-out, independent blind labels
  // and a cryptographically verifiable frozen baseline.
  return {
    schemaVersion:1,
    status:'needs-goldens-and-calibration',
    verifiedAt:null,
    baselineVersion:null,
    sampleCount:0,
    repeatCount:0,
    rows:[],
    provenance:{releaseReceipt:null, independentVerifier:null},
    requirements:{goldens:50,minimumRepeats:3,privateHoldoutRequired:true,humanCalibrationRequired:true},
    operational:operations,
  };
}
