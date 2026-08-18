const CIRCUITS = new Map();

export const AI_RESILIENCE_POLICY = Object.freeze({
  version: '1.0.0',
  providerIndependentCore: true,
  defaultTimeoutMs: 2500,
  failureThreshold: 2,
  cooldownMs: 60_000,
  modes: Object.freeze(['core', 'free_assist', 'ai']),
  userNotice: '기본 모드로 계속 이용할 수 있습니다. AI 고급 기능은 잠시 사용할 수 없습니다.',
});

const DISABLED_VALUES = new Set(['none', 'off', 'disabled', 'false', '0']);

export function isAiProviderDisabled(env = {}) {
  const provider = String(env.AI_PROVIDER ?? '').trim().toLowerCase();
  const enabled = String(env.AI_PROVIDER_ENABLED ?? '').trim().toLowerCase();
  return DISABLED_VALUES.has(provider) || DISABLED_VALUES.has(enabled);
}

export function getAiResilienceStatus(env = {}, providers = []) {
  const available = normalizeProviders(providers).filter(provider => provider.available !== false);
  const disabled = isAiProviderDisabled(env);
  return Object.freeze({
    policyVersion: AI_RESILIENCE_POLICY.version,
    providerIndependentCore: true,
    providerDisabled: disabled,
    providerCount: disabled ? 0 : available.length,
    mode: disabled || available.length === 0 ? 'free_assist' : 'ai',
    notice: disabled || available.length === 0 ? AI_RESILIENCE_POLICY.userNotice : '',
  });
}

export async function runAiEnhancedTask(options = {}) {
  const {
    env = {},
    providers = [],
    fallback,
    taskName = 'ai_task',
    timeoutMs = AI_RESILIENCE_POLICY.defaultTimeoutMs,
    now = Date.now,
  } = options;

  if (typeof fallback !== 'function') {
    throw new TypeError('runAiEnhancedTask requires a fallback function so provider failure cannot become a core-service dependency.');
  }

  const normalized = normalizeProviders(providers);
  if (isAiProviderDisabled(env) || normalized.length === 0) {
    return runFallback(fallback, { taskName, reason: 'provider_disabled_or_missing', attemptedProviders: [] });
  }

  const attemptedProviders = [];
  for (const provider of normalized) {
    if (provider.available === false || isCircuitOpen(provider.id, now())) continue;
    attemptedProviders.push(provider.id);
    try {
      const value = await withTimeout(
        Promise.resolve().then(() => provider.invoke()),
        Math.max(1, Number(timeoutMs) || AI_RESILIENCE_POLICY.defaultTimeoutMs),
      );
      resetCircuit(provider.id);
      return Object.freeze({
        ok: true,
        mode: 'ai',
        degraded: false,
        provider: provider.id,
        taskName,
        value,
        notice: '',
      });
    } catch (error) {
      recordFailure(provider.id, now());
    }
  }

  return runFallback(fallback, { taskName, reason: 'provider_unavailable', attemptedProviders });
}

function normalizeProviders(providers) {
  if (!Array.isArray(providers)) return [];
  return providers
    .map((provider, index) => ({
      id: String(provider?.id || `provider_${index + 1}`).trim(),
      invoke: provider?.invoke,
      available: provider?.available,
    }))
    .filter(provider => provider.id && typeof provider.invoke === 'function');
}

async function runFallback(fallback, context) {
  try {
    const value = await fallback(context);
    return Object.freeze({
      ok: true,
      mode: 'free_assist',
      degraded: true,
      provider: null,
      taskName: context.taskName,
      reason: context.reason,
      attemptedProviders: Object.freeze([...context.attemptedProviders]),
      value,
      notice: AI_RESILIENCE_POLICY.userNotice,
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      mode: 'core',
      degraded: true,
      provider: null,
      taskName: context.taskName,
      reason: 'assist_unavailable',
      attemptedProviders: Object.freeze([...context.attemptedProviders]),
      value: null,
      notice: 'AI 보조 기능 없이 핵심 기능을 계속 이용할 수 있습니다.',
    });
  }
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI_PROVIDER_TIMEOUT')), timeoutMs);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

function isCircuitOpen(providerId, now) {
  const state = CIRCUITS.get(providerId);
  if (!state) return false;
  if (state.openUntil <= now) {
    CIRCUITS.delete(providerId);
    return false;
  }
  return state.failures >= AI_RESILIENCE_POLICY.failureThreshold;
}

function recordFailure(providerId, now) {
  const previous = CIRCUITS.get(providerId) || { failures: 0, openUntil: 0 };
  const failures = previous.failures + 1;
  CIRCUITS.set(providerId, {
    failures,
    openUntil: failures >= AI_RESILIENCE_POLICY.failureThreshold ? now + AI_RESILIENCE_POLICY.cooldownMs : 0,
  });
}

function resetCircuit(providerId) {
  CIRCUITS.delete(providerId);
}

export function resetAiResilienceCircuitsForTest() {
  CIRCUITS.clear();
}
