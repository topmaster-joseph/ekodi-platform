import {
  AI_RESILIENCE_POLICY,
  getAiResilienceStatus,
  runAiEnhancedTask,
} from './ai-resilience-runtime.js';
import {
  ADAPTIVE_AI_POLICY,
  resolveAdaptiveAiPlan,
  runAdaptiveAiTask,
} from './adaptive-ai-orchestrator.js';

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
    orchestrationPolicyVersion: ADAPTIVE_AI_POLICY.version,
    status() {
      const resilience = getAiResilienceStatus(env, adapters);
      return Object.freeze({
        ...resilience,
        orchestrationMode:String(env.AI_ORCHESTRATION_MODE || ADAPTIVE_AI_POLICY.defaultMode).trim().toLowerCase(),
        adaptiveParallelism:true,
        maxParallelProviders:ADAPTIVE_AI_POLICY.maxParallelProviders,
      });
    },
    async run({ taskName, fallback, timeoutMs, context = {}, orchestration = '' } = {}) {
      const normalizedTask = String(taskName || '').trim().slice(0, 120);
      if (!normalizedTask) throw new TypeError('EKODI Core AI Gateway requires taskName.');
      if (typeof fallback !== 'function') {
        throw new TypeError('EKODI Core AI Gateway requires a non-AI fallback.');
      }

      const available = adapters.filter(adapter => adapter.available);
      const plan = resolveAdaptiveAiPlan({
        env,
        taskName:normalizedTask,
        context,
        providerCount:available.length,
        mode:orchestration,
      });
      if (plan.strategy === 'parallel') {
        return runAdaptiveAiTask({
          providers:available,
          fallback:reason => fallback(Object.freeze({ ...reason, context })),
          taskName:normalizedTask,
          context,
          timeoutMs,
          plan,
        });
      }

      const result = await runAiEnhancedTask({
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
      return Object.freeze({
        ...result,
        orchestration:Object.freeze({ ...plan, attemptedProviders:result.attemptedProviders || (result.provider ? [result.provider] : []), successfulProviders:result.provider ? [result.provider] : [], failedProviders:[], quorumMet:Boolean(result.provider), synthesized:false }),
      });
    },
  });
}

export function getCoreAiGatewayStatus(env = {}, providers = []) {
  const status = buildCoreAiGateway(env, providers).status();
  return Object.freeze({
    schemaVersion: 2,
    gateway: 'ekodi-core-ai',
    providerIndependent: true,
    aiOptional: true,
    ...status,
  });
}
