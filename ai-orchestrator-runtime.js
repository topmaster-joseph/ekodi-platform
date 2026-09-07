import {
  isAiProviderDisabled,
  runAiEnhancedTask,
} from './ai-resilience-runtime.js';

const RISK_LEVELS = new Set(['low', 'normal', 'high', 'critical']);
const COLLABORATION_MODES = new Set(['auto', 'primary', 'review']);

function text(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeCapabilities(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return Object.freeze([...new Set(items.map(item => text(item, 80).toLowerCase()).filter(Boolean))]);
}

function normalizeProvider(provider, index) {
  if (!provider || typeof provider.invoke !== 'function') return null;
  const id = text(provider.id || `provider_${index + 1}`, 80).toLowerCase();
  if (!/^[a-z0-9._-]{1,80}$/.test(id)) return null;
  const priorityValue = Number(provider.priority);
  return Object.freeze({
    id,
    invoke: provider.invoke,
    available: provider.available !== false,
    priority: Number.isFinite(priorityValue) ? priorityValue : index + 1,
    capabilities: normalizeCapabilities(provider.capabilities || ['text']),
    trustClass: text(provider.trustClass || 'external', 40).toLowerCase() || 'external',
  });
}

function normalizeProviders(providers) {
  return Object.freeze((Array.isArray(providers) ? providers : [])
    .map(normalizeProvider)
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)));
}

function supports(provider, requiredCapabilities) {
  if (!requiredCapabilities.length) return true;
  const supported = new Set(provider.capabilities);
  return supported.has('*') || requiredCapabilities.every(capability => supported.has(capability));
}

function chooseMode(collaboration, risk) {
  if (collaboration !== 'auto') return collaboration;
  return risk === 'high' || risk === 'critical' ? 'review' : 'primary';
}

function publicProvider(provider) {
  return Object.freeze({
    id: provider.id,
    available: provider.available,
    priority: provider.priority,
    capabilities: provider.capabilities,
    trustClass: provider.trustClass,
  });
}

export function buildAiOrchestrationPlan(input = {}, providers = []) {
  const risk = RISK_LEVELS.has(String(input.risk || '').toLowerCase())
    ? String(input.risk).toLowerCase()
    : 'normal';
  const collaboration = COLLABORATION_MODES.has(String(input.collaboration || '').toLowerCase())
    ? String(input.collaboration).toLowerCase()
    : 'auto';
  const requiredCapabilities = normalizeCapabilities(input.requiredCapabilities || ['text']);
  const normalized = normalizeProviders(providers);
  const eligible = normalized.filter(provider => provider.available && supports(provider, requiredCapabilities));
  const mode = chooseMode(collaboration, risk);
  const primary = eligible[0] || null;
  const reviewer = mode === 'review' ? eligible.find(provider => provider.id !== primary?.id) || null : null;

  return Object.freeze({
    schemaVersion: 1,
    orchestrator: 'ekodi-ai',
    taskName: text(input.taskName || 'ai_task', 120) || 'ai_task',
    risk,
    requestedMode: collaboration,
    mode,
    requiredCapabilities,
    primaryProvider: primary?.id || null,
    reviewerProvider: reviewer?.id || null,
    eligibleProviders: Object.freeze(eligible.map(provider => provider.id)),
    reviewAvailable: Boolean(reviewer),
    principle: 'ekodi-controls-models-models-do-not-control-ekodi',
  });
}

async function runReviewer({ env, reviewer, taskName, timeoutMs, context, primary }) {
  if (!reviewer) return null;
  const result = await runAiEnhancedTask({
    env,
    taskName: `${taskName}.review`,
    timeoutMs,
    providers: [{
      id: reviewer.id,
      available: reviewer.available,
      invoke: () => reviewer.invoke(Object.freeze({
        taskName,
        context: Object.freeze({
          ...context,
          collaboration: Object.freeze({
            role: 'independent_reviewer',
            primaryProvider: primary.provider || null,
            primaryValue: primary.value,
          }),
        }),
      })),
    }],
    fallback: () => null,
  });
  return result.mode === 'ai' && result.ok ? result : null;
}

export function buildEkodiAiOrchestrator(env = {}, providers = []) {
  const normalized = normalizeProviders(providers);

  return Object.freeze({
    schemaVersion: 1,
    id: 'ekodi-ai-orchestrator',
    providers: Object.freeze(normalized.map(publicProvider)),
    status() {
      return Object.freeze({
        orchestrator: 'ekodi-ai',
        providerIndependent: true,
        providerDisabled: isAiProviderDisabled(env),
        configuredProviders: Object.freeze(normalized.map(publicProvider)),
      });
    },
    plan(input = {}) {
      return buildAiOrchestrationPlan(input, normalized);
    },
    async run({
      taskName,
      context = {},
      fallback,
      timeoutMs,
      risk = 'normal',
      collaboration = 'auto',
      requiredCapabilities = ['text'],
    } = {}) {
      const normalizedTaskName = text(taskName, 120);
      if (!normalizedTaskName) throw new TypeError('EKODI AI Orchestrator requires taskName.');
      if (typeof fallback !== 'function') throw new TypeError('EKODI AI Orchestrator requires a non-AI fallback.');

      const plan = buildAiOrchestrationPlan({
        taskName: normalizedTaskName,
        risk,
        collaboration,
        requiredCapabilities,
      }, normalized);
      const eligibleIds = new Set(plan.eligibleProviders);
      const eligible = normalized.filter(provider => eligibleIds.has(provider.id));

      const primary = await runAiEnhancedTask({
        env,
        taskName: normalizedTaskName,
        timeoutMs,
        providers: eligible.map(provider => ({
          id: provider.id,
          available: provider.available,
          invoke: () => provider.invoke(Object.freeze({
            taskName: normalizedTaskName,
            context: Object.freeze({
              ...context,
              collaboration: Object.freeze({ role: 'primary', mode: plan.mode }),
            }),
          })),
        })),
        fallback: reason => fallback(Object.freeze({ ...reason, context, plan })),
      });

      if (primary.mode !== 'ai' || plan.mode !== 'review') {
        return Object.freeze({
          ...primary,
          orchestration: Object.freeze({ plan, reviewer: null, reviewDegraded: false }),
        });
      }

      const reviewer = normalized.find(provider => provider.id === plan.reviewerProvider) || null;
      const reviewResult = await runReviewer({
        env,
        reviewer,
        taskName: normalizedTaskName,
        timeoutMs,
        context,
        primary,
      });

      return Object.freeze({
        ...primary,
        orchestration: Object.freeze({
          plan,
          reviewer: reviewResult ? Object.freeze({
            provider: reviewResult.provider,
            value: reviewResult.value,
          }) : null,
          reviewDegraded: Boolean(plan.reviewerProvider && !reviewResult),
        }),
      });
    },
  });
}

export const EKODI_AI_ORCHESTRATION = Object.freeze({
  version: '1.0.0',
  modes: Object.freeze([...COLLABORATION_MODES]),
  risks: Object.freeze([...RISK_LEVELS]),
  highRiskDefault: 'independent_provider_review',
  authority: 'bounded_by_ekodi_mission_governance',
});
