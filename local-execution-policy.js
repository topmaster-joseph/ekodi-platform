const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export const LOCAL_EXECUTION_POLICY = Object.freeze({
  version: '1.0.0',
  cloudFirst: true,
  localFallbackOnly: true,
  strategy: 'least_loaded_parallel',
  parallelDistribution: true,
  portableAutoExecution: false,
  unknownHardwareAutoExecution: false,
  onlineWindowMs: 90 * 1000,
  defaultMaxConcurrency: 1,
});

export function normalizeLocalResource(value = {}, { legacyCompatible = false } = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const cpuLoadPct = clamp(source.cpuLoadPct, 0, 100, null);
  const memoryUsedPct = clamp(source.memoryUsedPct, 0, 100, null);
  const explicitLoad = clamp(source.currentLoad, 0, 100, null);
  const samples = [cpuLoadPct, memoryUsedPct, explicitLoad].filter(Number.isFinite);
  const currentLoad = samples.length ? Math.round(Math.max(...samples)) : 100;
  const isPortable = typeof source.isPortable === 'boolean' ? source.isPortable : null;
  const explicitEligible = typeof source.autoExecutionEligible === 'boolean' ? source.autoExecutionEligible : null;
  const autoExecutionEligible = explicitEligible === false || isPortable === true
    ? false
    : explicitEligible === true && isPortable === false
      ? true
      : legacyCompatible;

  return Object.freeze({
    cpuLoadPct,
    memoryUsedPct,
    currentLoad,
    isPortable,
    deviceClass: String(source.deviceClass || (isPortable === true ? 'portable' : isPortable === false ? 'desktop' : 'unknown')).slice(0, 24),
    autoExecutionEligible,
    measuredAt: String(source.measuredAt || '').slice(0, 40),
  });
}

export function localExecutionScore({ currentLoad = 100, activeJobs = 0, maxConcurrency = 1 } = {}) {
  const load = clamp(currentLoad, 0, 100, 100);
  const concurrency = Math.max(1, Math.floor(clamp(maxConcurrency, 1, 32, 1)));
  const active = Math.max(0, Math.floor(clamp(activeJobs, 0, 1000, 0)));
  return Math.round((load + (active / concurrency) * 100) * 100) / 100;
}

export function compareLocalExecutionCandidates(a, b) {
  const aScore = localExecutionScore(a);
  const bScore = localExecutionScore(b);
  if (aScore !== bScore) return aScore - bScore;
  const aSeen = String(a.lastSeenAt || a.last_seen_at || '');
  const bSeen = String(b.lastSeenAt || b.last_seen_at || '');
  const heartbeat = bSeen.localeCompare(aSeen);
  if (heartbeat) return heartbeat;
  return String(a.deviceId || a.id || '').localeCompare(String(b.deviceId || b.id || ''));
}

export function localExecutionPolicySnapshot() {
  return {
    version: LOCAL_EXECUTION_POLICY.version,
    cloudFirst: true,
    localFallbackOnly: true,
    strategy: LOCAL_EXECUTION_POLICY.strategy,
    parallelDistribution: true,
    portableAutoExecution: false,
    onlineWindowSeconds: LOCAL_EXECUTION_POLICY.onlineWindowMs / 1000,
  };
}
