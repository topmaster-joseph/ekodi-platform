export const FREE_TIER_THRESHOLDS = Object.freeze({
  warning: 70,
  conserve: 85,
  protect: 90,
  survival: 95,
  circuitBreaker: 100,
});

const RETRY_STOP_SIGNALS = new Set([
  '1027',
  '429',
  'quota_exhausted',
  'monthly_limit_reached',
  'daily_limit_reached',
]);

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function freeTierState(percentValue) {
  const percent = numberOrZero(percentValue);
  if (percent >= FREE_TIER_THRESHOLDS.circuitBreaker) return 'circuit_breaker';
  if (percent >= FREE_TIER_THRESHOLDS.survival) return 'survival';
  if (percent >= FREE_TIER_THRESHOLDS.protect) return 'protect';
  if (percent >= FREE_TIER_THRESHOLDS.conserve) return 'conserve';
  if (percent >= FREE_TIER_THRESHOLDS.warning) return 'warning';
  return 'normal';
}

export function shouldStopRetry(signal) {
  const code = String(signal?.code ?? signal?.status ?? signal ?? '').trim().toLowerCase();
  return RETRY_STOP_SIGNALS.has(code);
}

export function evaluateFreeTierQuota(input = {}) {
  const percent = numberOrZero(input.percent);
  const state = freeTierState(percent);
  const essential = input.essential === true;
  const retryStop = shouldStopRetry(input.errorCode ?? input.statusCode ?? input.signal);

  const allowNonEssential = !retryStop && !['protect', 'survival', 'circuit_breaker'].includes(state);
  const allowEssential = !retryStop || Boolean(input.safeFallbackAvailable);
  const action = retryStop || state === 'circuit_breaker'
    ? 'circuit_breaker'
    : state === 'survival'
      ? 'essential_only'
      : state === 'protect'
        ? 'block_nonessential'
        : state === 'conserve'
          ? 'conserve'
          : state === 'warning'
            ? 'warn'
            : 'normal';

  return Object.freeze({
    percent,
    state,
    action,
    retryStop,
    allowed: essential ? allowEssential : allowNonEssential,
    preserveSecurityBoundary: true,
    automaticPaidUpgrade: false,
  });
}

export function providerFreeTierPreference(provider) {
  const id = String(provider || '').trim().toLowerCase();
  if (id === 'cloudflare') return Object.freeze(['static-assets','cdn-cache','r2','kv-low-write','d1-derived','queues','turnstile','workers-ai']);
  if (id === 'supabase') return Object.freeze(['postgres','auth','rls','direct-crud','realtime','edge-functions-last']);
  if (id === 'github') return Object.freeze(['source-control','pull-request','public-hosted-actions','dependency-cache','short-lived-artifacts']);
  return Object.freeze([]);
}

export const FREE_TIER_RETRY_STOP_SIGNALS = Object.freeze([...RETRY_STOP_SIGNALS]);
