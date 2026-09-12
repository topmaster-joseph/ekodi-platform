import {
  AI_RESILIENCE_POLICY,
  getAiResilienceStatus,
  runAiEnhancedTask,
} from './ai-resilience-runtime.js';
import { buildEkodiAiOrchestrator } from './ai-orchestrator-runtime.js';
import { createEkodiAiProviderRegistry } from './ekodi-ai-provider-registry.js';
import { buildEkodiCommandPlane } from './ekodi-command-plane.js';
import { buildExperienceRecord } from './ekodi-capability-ecosystem.js';
import { appendCapabilityExperience } from './ekodi-capability-ecosystem-store.js';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);

function normalizeCapabilities(value) {
  const items = Array.isArray(value) ? value : value ? [value] : ['text'];
  return Object.freeze([...new Set(items.map(item => String(item || '').trim().toLowerCase()).filter(Boolean))]);
}

function normalizeProvider(provider, index) {
  if (!provider || typeof provider.invoke !== 'function') return null;
  const id = String(provider.id || `provider_${index + 1}`).trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,80}$/.test(id)) return null;
  const priorityValue = Number(provider.priority);
  return Object.freeze({
    id,
    invoke: provider.invoke,
    available: provider.available !== false,
    priority: Number.isFinite(priorityValue) ? priorityValue : index + 1,
    capabilities: normalizeCapabilities(provider.capabilities),
    trustClass: String(provider.trustClass || 'external').trim().toLowerCase() || 'external',
    resourceClass: String(provider.resourceClass || 'personal-api'),
    fundingSource: String(provider.fundingSource || 'personal'),
    officialPath: provider.officialPath !== false,
    automationAllowed: provider.automationAllowed !== false,
    costClass: String(provider.costClass || '').trim().toLowerCase(),
    freeQuotaRemaining: provider.freeQuotaRemaining ?? null,
  });
}

function isMultiProviderEnabled(env = {}) {
  return ENABLED_VALUES.has(String(env.AI_MULTI_PROVIDER_ENABLED || '').trim().toLowerCase());
}

function buildProviderPool(env = {}, providers = []) {
  const supplied = Array.isArray(providers) ? providers : [];
  const raw = isMultiProviderEnabled(env)
    ? [...createEkodiAiProviderRegistry(env), ...supplied]
    : supplied;
  const unique = new Map();
  raw.map(normalizeProvider).filter(Boolean).forEach(provider => {
    if (!unique.has(provider.id)) unique.set(provider.id, provider);
  });
  return Object.freeze([...unique.values()]);
}

export function buildCoreAiGateway(env = {}, providers = []) {
  const adapters = buildProviderPool(env, providers);
  const orchestrator = buildEkodiAiOrchestrator(env, adapters);
  const commandPlane = buildEkodiCommandPlane(env, adapters);

  async function recordExperience(options, result, startedAt, fallbackSource) {
    if (!env.DB || !result?.taskId) return;
    try {
      const record = buildExperienceRecord(options, result, {
        source: options.context?.source || fallbackSource,
        durationMs: Date.now() - startedAt,
      });
      await appendCapabilityExperience(env.DB, record);
    } catch (error) {
      console.warn('EKODI Capability Ecosystem experience recording unavailable', error);
    }
  }

  return Object.freeze({
    policyVersion: AI_RESILIENCE_POLICY.version,
    status() {
      return Object.freeze({
        ...getAiResilienceStatus(env, adapters),
        multiProviderEnabled: isMultiProviderEnabled(env),
        orchestration: orchestrator.status(),
        commandPlane: commandPlane.status(),
      });
    },
    plan(input = {}) {
      return orchestrator.plan(input);
    },
    commandPlan(input = {}) {
      return commandPlane.plan(input);
    },
    async run({ taskName, fallback, timeoutMs, totalTimeoutMs, context = {} } = {}) {
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
        totalTimeoutMs,
      });
    },
    async collaborate(options = {}) {
      return orchestrator.run(options);
    },
    async command(options = {}) {
      const startedAt = Date.now();
      const result = await commandPlane.execute(options);
      await recordExperience(options, result, startedAt, 'core-ai-command');
      return result;
    },
    async handlePulse(options = {}) {
      const startedAt = Date.now();
      const result = await commandPlane.handlePulse(options);
      await recordExperience(options, result, startedAt, 'core-ai-pulse');
      return result;
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
    orchestrator: 'ekodi-ai',
    commandPlane: 'ekodi-v8',
    ...status,
  });
}
