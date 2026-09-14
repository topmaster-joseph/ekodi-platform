const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function percentile(values, ratio) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function hostMatches(hostname, suffix) {
  if (!suffix) return false;
  if (suffix.startsWith('.')) return hostname.endsWith(suffix);
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function classifyTarget(targetUrl, config) {
  const url = new URL(targetUrl);
  const host = url.hostname.toLowerCase();
  const guardrails = config.guardrails || {};
  if ((guardrails.stagingHostSuffixes || []).some(suffix => hostMatches(host, suffix))) return 'staging';
  if ((guardrails.productionHostSuffixes || []).some(suffix => hostMatches(host, suffix))) return 'production';
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'local';
  return 'unknown';
}

export function validateReliabilityConfig(config) {
  const errors = [];
  const guardrails = config?.guardrails || {};
  const profiles = config?.profiles || {};
  if (!Number.isFinite(guardrails.maxRequests) || guardrails.maxRequests < 1) errors.push('guardrails.maxRequests must be positive');
  if (!Number.isFinite(guardrails.maxConcurrency) || guardrails.maxConcurrency < 1) errors.push('guardrails.maxConcurrency must be positive');
  if (!Number.isFinite(guardrails.maxDurationSeconds) || guardrails.maxDurationSeconds < 1) errors.push('guardrails.maxDurationSeconds must be positive');
  if (!Object.keys(profiles).length) errors.push('at least one reliability profile is required');

  for (const [name, profile] of Object.entries(profiles)) {
    if (!Number.isInteger(profile.requests) || profile.requests < 1) errors.push(`${name}.requests must be a positive integer`);
    if (!Number.isInteger(profile.concurrency) || profile.concurrency < 1) errors.push(`${name}.concurrency must be a positive integer`);
    if (!Number.isFinite(profile.targetRps) || profile.targetRps <= 0) errors.push(`${name}.targetRps must be positive`);
    if (profile.requests > guardrails.maxRequests) errors.push(`${name}.requests exceeds maxRequests`);
    if (profile.concurrency > guardrails.maxConcurrency) errors.push(`${name}.concurrency exceeds maxConcurrency`);
    if (!Number.isFinite(profile.thresholds?.p95Ms) || profile.thresholds.p95Ms <= 0) errors.push(`${name}.thresholds.p95Ms must be positive`);
    if (!Number.isFinite(profile.thresholds?.errorRate) || profile.thresholds.errorRate < 0 || profile.thresholds.errorRate >= 1) errors.push(`${name}.thresholds.errorRate must be in [0,1)`);
  }

  for (const name of guardrails.productionAllowedProfiles || []) {
    if (!profiles[name]) errors.push(`productionAllowedProfiles references unknown profile: ${name}`);
  }
  if ((guardrails.productionAllowedProfiles || []).some(name => name !== 'synthetic')) {
    errors.push('productionAllowedProfiles may contain only synthetic');
  }
  return errors;
}

export function assertScenarioAllowed({ targetUrl, profileName, config, env = process.env, manual = false }) {
  const profile = config.profiles?.[profileName];
  if (!profile) throw new Error(`Unknown reliability profile: ${profileName}`);
  const errors = validateReliabilityConfig(config);
  if (errors.length) throw new Error(`Invalid reliability policy: ${errors.join('; ')}`);

  const target = new URL(targetUrl);
  if (target.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(target.hostname)) {
    throw new Error('Reliability validation requires HTTPS outside localhost');
  }

  const guardrails = config.guardrails;
  if (profile.requests > guardrails.maxRequests || profile.concurrency > guardrails.maxConcurrency) {
    throw new Error('Reliability profile exceeds hard safety caps');
  }
  if (profile.manualOnly && !manual) throw new Error(`${profileName} is manual-only`);

  const targetClass = classifyTarget(targetUrl, config);
  if (targetClass === 'unknown') throw new Error(`Target host is not allowlisted: ${target.hostname}`);
  if (targetClass === 'production') {
    if (!(guardrails.productionAllowedProfiles || []).includes(profileName)) {
      throw new Error(`Production load profile is forbidden: ${profileName}`);
    }
    const approvalEnv = guardrails.productionApprovalEnv;
    if (!approvalEnv || String(env[approvalEnv]).toLowerCase() !== 'true') {
      throw new Error(`Production synthetic validation requires ${approvalEnv}=true`);
    }
  }
  return { profile, targetClass, target };
}

export function summarizeResults(results, profile) {
  const durations = results.map(result => result.durationMs);
  const failures = results.filter(result => !result.ok);
  const statusCounts = {};
  for (const result of results) {
    const key = result.status == null ? 'network-error' : String(result.status);
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  const total = results.length;
  const errorRate = total ? failures.length / total : 1;
  const metrics = {
    total,
    passed: total - failures.length,
    failed: failures.length,
    errorRate,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    maxMs: durations.length ? Math.max(...durations) : 0,
    statusCounts
  };
  const violations = [];
  if (metrics.p95Ms > profile.thresholds.p95Ms) violations.push(`p95 ${metrics.p95Ms}ms > ${profile.thresholds.p95Ms}ms`);
  if (metrics.errorRate > profile.thresholds.errorRate) violations.push(`errorRate ${metrics.errorRate.toFixed(4)} > ${profile.thresholds.errorRate}`);
  return { metrics, violations, passed: violations.length === 0 };
}

export async function runScenario({
  targetUrl,
  path,
  profile,
  expectedStatuses = [200],
  headers = {},
  timeoutMs = 8000,
  maxDurationSeconds = 600,
  fetchImpl = fetch,
  clock = () => performance.now()
}) {
  const target = new URL(path || '/', targetUrl).toString();
  const results = new Array(profile.requests);
  let cursor = 0;
  const startedAt = clock();
  const intervalMs = 1000 / profile.targetRps;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= profile.requests) return;
      const scheduledAt = startedAt + index * intervalMs;
      const delay = scheduledAt - clock();
      if (delay > 0) await sleep(delay);
      const requestStart = clock();
      let response;
      try {
        response = await fetchImpl(target, {
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
          headers
        });
        await response.body?.cancel?.();
        results[index] = {
          ok: expectedStatuses.includes(response.status),
          status: response.status,
          durationMs: Math.round(clock() - requestStart),
          error: null
        };
      } catch (error) {
        results[index] = {
          ok: false,
          status: null,
          durationMs: Math.round(clock() - requestStart),
          error: error?.name === 'TimeoutError' ? 'timeout' : String(error?.message || error)
        };
      }
      if ((clock() - startedAt) / 1000 > maxDurationSeconds) throw new Error('Reliability validation exceeded maxDurationSeconds');
    }
  }

  await Promise.all(Array.from({ length: Math.min(profile.concurrency, profile.requests) }, () => worker()));
  return results;
}
