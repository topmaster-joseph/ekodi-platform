import { buildEkodiAiOrchestrator } from './ai-orchestrator-runtime.js';
import { evaluateAiCostEligibility } from './ai-cost-policy.js';
import { decideEkodiConsultation, summarizeConsultationExecution } from './ai-consultation-governance.js';

const RISK_LEVELS = new Set(['low', 'normal', 'high', 'critical']);
const PULSE_KINDS = new Set(['manual_goal', 'schedule', 'webhook', 'repository', 'monitor', 'service_health', 'system_event']);
const RED_CHANGE_CLASSES = new Set(['red', 'constitutional_change', 'production_dns', 'permission_expansion', 'destructive_data', 'secrets']);

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeCapabilities(value, fallback = ['text']) {
  const source = Array.isArray(value) ? value : value ? [value] : fallback;
  return Object.freeze([...new Set(source.map(item => text(item, 80).toLowerCase()).filter(Boolean))]);
}

function normalizeProvider(provider, index) {
  if (!provider || typeof provider.invoke !== 'function') return null;
  const id = text(provider.id || `provider_${index + 1}`, 80).toLowerCase();
  if (!/^[a-z0-9._-]{1,80}$/.test(id)) return null;
  const priority = Number(provider.priority);
  return Object.freeze({
    ...provider,
    id,
    available: provider.available !== false,
    priority: Number.isFinite(priority) ? priority : index + 1,
    capabilities: normalizeCapabilities(provider.capabilities),
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
  if (!provider?.available) return false;
  if (!requiredCapabilities.length) return true;
  const capabilities = new Set(provider.capabilities);
  return capabilities.has('*') || requiredCapabilities.every(capability => capabilities.has(capability));
}

function publicProvider(provider) {
  return Object.freeze({
    id: provider.id,
    available: provider.available,
    priority: provider.priority,
    capabilities: provider.capabilities,
    trustClass: provider.trustClass,
    costClass: provider.costClass || 'unknown',
  });
}

function normalizeSpecialists(value) {
  const source = Array.isArray(value) && value.length
    ? value
    : [
        {
          role: 'planner',
          objective: 'Analyze the goal, constraints, dependencies, risks, and safest execution order.',
          requiredCapabilities: ['reasoning'],
        },
        {
          role: 'operator',
          objective: 'Produce a concrete implementation or operating approach with verifiable completion criteria.',
          requiredCapabilities: ['text'],
        },
      ];

  const seen = new Set();
  return Object.freeze(source.slice(0, 6).map((item, index) => {
    const baseRole = text(item?.role || `specialist_${index + 1}`, 60).toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
    const role = baseRole && !seen.has(baseRole) ? baseRole : `specialist_${index + 1}`;
    seen.add(role);
    return Object.freeze({
      role,
      objective: text(item?.objective || 'Contribute specialist analysis to the shared goal.', 600),
      requiredCapabilities: normalizeCapabilities(item?.requiredCapabilities),
    });
  }));
}

function executionSpecialists(input, consultationDecision) {
  const normalized = normalizeSpecialists(input.specialists);
  if (consultationDecision.status === 'multi_consult' || consultationDecision.status === 'reverified') return normalized;
  const operator = normalized.find(item => item.role === 'operator' || item.role === 'builder') || normalized.at(-1);
  return Object.freeze([Object.freeze({
    role: operator?.role || 'operator',
    objective: operator?.objective || 'Execute the task with verifiable completion criteria.',
    requiredCapabilities: operator?.requiredCapabilities || Object.freeze(['text']),
  })]);
}

export function normalizeEkodiResourceTarget(value = {}) {
  return Object.freeze({
    workspaceId: text(value.workspaceId, 120) || null,
    workspaceSlug: text(value.workspaceSlug, 120).toLowerCase() || null,
    service: text(value.service, 120).toLowerCase() || null,
    capability: text(value.capability, 160).toLowerCase() || null,
    surface: text(value.surface, 80).toLowerCase() || null,
  });
}

function chooseAssignments(specialists, providers, needsSentinel = true) {
  const available = providers.filter(provider => provider.available);
  const reviewCapable = available.filter(provider => supports(provider, ['review']));
  const canReserveSentinel = needsSentinel && available.length > specialists.length && reviewCapable.length > 0;
  const reservedSentinel = canReserveSentinel ? reviewCapable.at(-1) : null;
  const specialistPool = reservedSentinel
    ? available.filter(provider => provider.id !== reservedSentinel.id)
    : available;
  const used = new Set();

  const assignments = specialists.map(specialist => {
    const eligible = specialistPool.filter(provider => supports(provider, specialist.requiredCapabilities));
    const provider = eligible.find(candidate => !used.has(candidate.id)) || eligible[0] || null;
    if (provider) used.add(provider.id);
    return Object.freeze({
      ...specialist,
      provider: provider?.id || null,
    });
  });

  let sentinel = null;
  if (needsSentinel) {
    sentinel = reservedSentinel;
    if (!sentinel) {
      sentinel = reviewCapable.find(provider => !used.has(provider.id))
        || reviewCapable.find(provider => provider.id !== assignments[0]?.provider)
        || reviewCapable[0]
        || null;
    }
  }

  return Object.freeze({
    assignments: Object.freeze(assignments),
    sentinelProvider: sentinel?.id || null,
    sentinelIndependent: Boolean(sentinel && !used.has(sentinel.id)),
    usedProviders: Object.freeze([...used]),
  });
}

function chooseReverifier(providers, assignment) {
  const reviewCapable = providers.filter(provider => provider.available && supports(provider, ['review']));
  return reviewCapable.find(provider => provider.id !== assignment.sentinelProvider && !assignment.usedProviders.includes(provider.id))
    || reviewCapable.find(provider => provider.id !== assignment.sentinelProvider)
    || reviewCapable[0]
    || null;
}

export function buildEkodiCommandPlan(input = {}, providers = []) {
  const normalizedProviders = normalizeProviders(providers);
  const governance = input.governance && typeof input.governance === 'object' ? input.governance : {};
  const costEligibleProviders = normalizedProviders.filter(provider => evaluateAiCostEligibility(provider, { governance }).eligible);
  const risk = RISK_LEVELS.has(text(input.risk, 20).toLowerCase()) ? text(input.risk, 20).toLowerCase() : 'normal';
  const target = normalizeEkodiResourceTarget(input.target);
  const consultationDecision = decideEkodiConsultation({ ...input, risk, target });
  const specialists = executionSpecialists(input, consultationDecision);
  const assignment = chooseAssignments(specialists, costEligibleProviders, consultationDecision.requirements.sentinel);
  const reverifier = consultationDecision.requirements.reverifier ? chooseReverifier(costEligibleProviders, assignment) : null;
  const taskId = text(input.taskId || input.taskName || `task_${Date.now()}`, 120) || `task_${Date.now()}`;

  return Object.freeze({
    schemaVersion: 2,
    commandPlane: 'ekodi-v8',
    taskId,
    goal: text(input.goal || input.taskName || taskId, 1_200),
    risk,
    target,
    parallel: consultationDecision.status === 'multi_consult' || consultationDecision.status === 'reverified',
    consultationDecision,
    consultationDetailPath: `/api/control/ai/v8/tasks/${encodeURIComponent(taskId)}/consultation`,
    assignments: assignment.assignments,
    sentinelProvider: assignment.sentinelProvider,
    sentinelIndependent: assignment.sentinelIndependent,
    reverifierProvider: reverifier?.id || null,
    configuredProviders: Object.freeze(normalizedProviders.map(publicProvider)),
    principle: 'ekodi-controls-agents-agents-do-not-control-ekodi',
  });
}

function normalizePulseEvent(input = {}) {
  const kind = text(input.kind || input.type || 'system_event', 60).toLowerCase();
  return Object.freeze({
    id: text(input.id || input.eventId || `event_${Date.now()}`, 120),
    kind: PULSE_KINDS.has(kind) ? kind : 'system_event',
    source: text(input.source || 'ekodi-pulse', 120),
    actionable: input.actionable !== false,
    requiresHumanDecision: input.requiresHumanDecision === true,
    changeClass: text(input.changeClass || 'green', 80).toLowerCase(),
    summary: text(input.summary || input.message || '', 1_000),
  });
}

function qualifiesStandingDelegation(delegation = {}, event, risk) {
  if (!delegation || delegation.allowed !== true) return false;
  if (risk === 'high' || risk === 'critical') return false;
  if (event.requiresHumanDecision || RED_CHANGE_CLASSES.has(event.changeClass)) return false;
  return delegation.reversible === true
    && delegation.audited === true
    && delegation.preflightVerified === true
    && delegation.verificationDefined === true;
}

function providerById(providers, id) {
  return providers.find(provider => provider.id === id) || null;
}

function degradedValue(role, reason) {
  return Object.freeze({
    role,
    status: 'degraded',
    reason: text(reason?.reason || reason?.code || reason || 'provider_unavailable', 160),
  });
}

async function runAssigned({ env, provider, taskName, context, role, objective, timeoutMs, governance = {} }) {
  if (!provider) {
    return Object.freeze({ role, provider: null, mode: 'core_only', ok: false, value: degradedValue(role, 'no_eligible_provider') });
  }
  const orchestrator = buildEkodiAiOrchestrator(env, [provider]);
  const result = await orchestrator.run({
    taskName,
    context: Object.freeze({
      ...context,
      commandPlane: Object.freeze({ role, objective }),
    }),
    collaboration: 'primary',
    risk: 'normal',
    requiredCapabilities: [],
    governance,
    timeoutMs,
    fallback: reason => degradedValue(role, reason),
  });
  return Object.freeze({
    role,
    provider: result.mode === 'ai' ? result.provider : null,
    mode: result.mode,
    ok: result.mode === 'ai' && result.ok !== false,
    value: result.value,
  });
}

export function buildEkodiCommandPlane(env = {}, providers = []) {
  const normalizedProviders = normalizeProviders(providers);

  async function execute(input = {}) {
    const plan = buildEkodiCommandPlan(input, normalizedProviders);
    const context = Object.freeze({
      ...(input.context || {}),
      commandGoal: plan.goal,
      resourceTarget: plan.target,
      consultationDecision: plan.consultationDecision,
    });

    const specialistResults = await Promise.all(plan.assignments.map(assignment => runAssigned({
      env,
      provider: providerById(normalizedProviders, assignment.provider),
      taskName: `${plan.taskId}.${assignment.role}`,
      context,
      role: assignment.role,
      objective: assignment.objective,
      timeoutMs: input.timeoutMs,
      governance: input.governance || {},
    })));

    const specialistEvidence = Object.freeze(specialistResults.map(result => Object.freeze({
      role: result.role,
      provider: result.provider,
      ok: result.ok,
      value: result.value,
    })));

    const sentinelProvider = providerById(normalizedProviders, plan.sentinelProvider);
    const sentinel = plan.consultationDecision.requirements.sentinel && sentinelProvider ? await runAssigned({
      env,
      provider: sentinelProvider,
      taskName: `${plan.taskId}.sentinel`,
      context: Object.freeze({
        ...context,
        specialistEvidence,
        verificationInstruction: 'Independently check material errors, unsupported claims, security or policy risks, missing evidence, and whether completion criteria are actually satisfied.',
      }),
      role: 'sentinel',
      objective: 'Independently verify the specialist evidence. Do not merely agree with the specialists.',
      timeoutMs: input.timeoutMs,
      governance: input.governance || {},
    }) : null;

    const reverifierProvider = providerById(normalizedProviders, plan.reverifierProvider);
    const reverifier = plan.consultationDecision.requirements.reverifier && reverifierProvider ? await runAssigned({
      env,
      provider: reverifierProvider,
      taskName: `${plan.taskId}.reverifier`,
      context: Object.freeze({
        ...context,
        specialistEvidence,
        sentinelEvidence: sentinel ? Object.freeze({ role: sentinel.role, provider: sentinel.provider, ok: sentinel.ok, value: sentinel.value }) : null,
        verificationInstruction: 'Perform a second independent verification pass. Focus on material dissent, validation gaps, production safety, and whether the first verification is supported by evidence.',
      }),
      role: 'reverifier',
      objective: 'Reverify the task after the first sentinel review and report only structured findings.',
      timeoutMs: input.timeoutMs,
      governance: input.governance || {},
    }) : null;

    const successfulProviders = new Set(specialistResults.filter(result => result.ok && result.provider).map(result => result.provider));
    if (sentinel?.ok && sentinel.provider) successfulProviders.add(sentinel.provider);
    if (reverifier?.ok && reverifier.provider) successfulProviders.add(reverifier.provider);
    const specialistOk = specialistResults.length > 0 && specialistResults.every(result => result.ok);
    const sentinelOk = !plan.consultationDecision.requirements.sentinel || Boolean(sentinel?.ok);
    const reverifierOk = !plan.consultationDecision.requirements.reverifier || Boolean(reverifier?.ok);
    const diversityOk = successfulProviders.size >= Number(plan.consultationDecision.requirements.minProviderDiversity || 0);
    const state = specialistOk && sentinelOk && reverifierOk && diversityOk
      ? 'verified'
      : successfulProviders.size > 0
        ? 'degraded'
        : 'core_only';

    const provisional = {
      schemaVersion: 2,
      taskId: plan.taskId,
      state,
      plan,
      specialists: Object.freeze(specialistResults),
      sentinel,
      reverifier,
    };
    const consultation = summarizeConsultationExecution(provisional);

    return Object.freeze({
      ...provisional,
      consultation,
      evidence: Object.freeze({
        specialistCount: specialistResults.length,
        successfulSpecialists: specialistResults.filter(result => result.ok).length,
        providerDiversity: successfulProviders.size,
        sentinelIndependent: Boolean(sentinel?.ok && plan.sentinelIndependent),
        verified: state === 'verified',
        consultation: Object.freeze({
          status: consultation.status,
          actualCallCount: consultation.actualCallCount,
          actualProviderCount: consultation.actualProviderCount,
          detailPath: plan.consultationDetailPath,
        }),
      }),
    });
  }

  return Object.freeze({
    schemaVersion: 2,
    id: 'ekodi-command-plane',
    status() {
      return Object.freeze({
        commandPlane: 'ekodi-v8',
        proactiveInput: 'pulse-events-with-bounded-standing-delegation',
        providerIndependent: true,
        consultationMode: 'need-and-risk-based',
        providers: Object.freeze(normalizedProviders.map(publicProvider)),
        loop: Object.freeze(['observe', 'detect', 'reason', 'decide-consultation', 'plan', 'delegate', 'execute', 'verify', 'recover', 'close', 'learn']),
      });
    },
    plan(input = {}) {
      return buildEkodiCommandPlan(input, normalizedProviders);
    },
    execute,
    async handlePulse(input = {}) {
      const event = normalizePulseEvent(input.event || input.pulse || {});
      const risk = RISK_LEVELS.has(text(input.risk, 20).toLowerCase()) ? text(input.risk, 20).toLowerCase() : 'normal';
      if (!event.actionable) {
        return Object.freeze({ schemaVersion: 2, state: 'ignored', event, reason: 'event_not_actionable' });
      }
      if (!qualifiesStandingDelegation(input.delegation, event, risk)) {
        return Object.freeze({
          schemaVersion: 2,
          state: 'human_gate',
          event,
          reason: event.requiresHumanDecision || RED_CHANGE_CLASSES.has(event.changeClass) || risk === 'high' || risk === 'critical'
            ? 'sovereign_or_high_impact_gate'
            : 'standing_delegation_not_satisfied',
        });
      }
      return execute({
        ...input,
        taskId: input.taskId || event.id,
        taskName: input.taskName || event.summary || event.id,
        goal: input.goal || event.summary || event.id,
        risk,
        event,
        context: Object.freeze({ ...(input.context || {}), pulseEvent: event }),
      });
    },
  });
}

export const EKODI_COMMAND_PLANE = Object.freeze({
  version: '1.1.0',
  authority: 'bounded-by-ekodi-sovereign-governance',
  proactiveRequiresStandingDelegation: true,
  independentSentinelPreferred: true,
  symbolicResourceTargets: true,
  consultationPolicy: 'AI-CONSULT-001',
});
