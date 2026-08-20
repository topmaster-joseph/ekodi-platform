import {
  AI_RESILIENCE_POLICY,
  getAiResilienceStatus,
  runAiEnhancedTask,
} from './ai-resilience-runtime.js';

function normalizeProvider(provider, index) {
  if (!provider || typeof provider.invoke !== 'function') return null;
  const id = String(provider.id || `provider_${index + 1}`).trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,80}$/.test(id)) return null;
  return Object.freeze({
    id,
    invoke: provider.invoke,
    available: provider.available !== false,
  });
}

export function buildCoreAiGateway(env = {}, providers = []) {
  const adapters = Object.freeze((Array.isArray(providers) ? providers : [])
    .map(normalizeProvider)
    .filter(Boolean));

  return Object.freeze({
    policyVersion: AI_RESILIENCE_POLICY.version,
    status() {
      return getAiResilienceStatus(env, adapters);
    },
    async run({ taskName, fallback, timeoutMs, context = {} } = {}) {
      const normalizedTask = String(taskName || '').trim().slice(0, 120);
      if (!normalizedTask) throw new TypeError('EKODI Core AI Gateway requires taskName.');
      if (typeof fallback !== 'function') {
        throw new TypeError('EKODI Core AI Gateway requires a non-AI fallback.');
      }
      return runAiEnhancedTask({
        env,
        providers: adapters.map(adapter => ({
          id: adapter.id,
          available: adapter.available,
          invoke: () => adapter.invoke(Object.freeze({ taskName: normalizedTask, context })),
        })),
        fallback: reason => fallback(Object.freeze({ ...reason, context })),
        taskName: normalizedTask,
        timeoutMs,
      });
    },
  });
}

export function getCoreAiGatewayStatus(env = {}, providers = []) {
  const status = buildCoreAiGateway(env, providers).status();
  return Object.freeze({
    schemaVersion: 1,
    gateway: 'ekodi-core-ai',
    providerIndependent: true,
    aiOptional: true,
    ...status,
  });
}
