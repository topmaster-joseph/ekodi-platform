function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  return value;
}

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function rule(input = {}) {
  return freeze({
    id: text(input.id, 160),
    scope: text(input.scope || 'platform', 80),
    entityId: text(input.entityId || 'platform:ekodi', 160),
    selector: text(input.selector, 220),
    operator: text(input.operator || 'equals', 40),
    expected: input.expected,
    severity: text(input.severity || 'medium', 20),
    changeClass: text(input.changeClass || 'yellow', 20),
    autoRepairPolicy: text(input.autoRepairPolicy || 'assist_only', 60),
    eventEnabled: input.eventEnabled !== false,
    source: text(input.source || 'derived', 220),
    description: text(input.description, 500),
  });
}

const FACT_RULES = Object.freeze([
  ['generation','platform.generation','equals','high','yellow','assist_only'],
  ['scaleTier','platform.scaleTier','equals','high','yellow','assist_only'],
  ['canonicalWebRoot','platform.canonicalWebRoot','equals','critical','red','human_gate'],
  ['canonicalAdminPath','platform.canonicalAdminPath','equals','critical','red','human_gate'],
  ['canonicalPersonalPath','platform.canonicalPersonalPath','equals','high','yellow','assist_only'],
  ['canonicalMcpPath','platform.canonicalMcpPath','equals','high','yellow','assist_only'],
  ['newSubdomainCreationAllowed','platform.newSubdomainCreationAllowed','equals','critical','red','human_gate'],
  ['automaticPaidCommitmentAllowed','platform.automaticPaidCommitmentAllowed','equals','critical','red','human_gate'],
  ['directAutonomousProductionMutationAllowed','platform.directAutonomousProductionMutationAllowed','equals','critical','red','human_gate'],
  ['directPushToMainAllowed','platform.directPushToMainAllowed','equals','critical','red','human_gate'],
]);

export function buildPlatformDesiredStateRegistry(input = {}) {
  const sourceOfTruth = input.sourceOfTruth || {};
  const facts = sourceOfTruth.currentFacts || {};
  const autonomy = input.autonomyPolicy || {};
  const routes = input.routeRegistry || {};
  const services = Array.isArray(input.services) ? input.services : [];
  const rules = [];

  for (const [fact, selector, operator, severity, changeClass, autoRepairPolicy] of FACT_RULES) {
    if (!(fact in facts)) continue;
    rules.push(rule({
      id: `platform.fact.${fact}`,
      selector,
      operator,
      expected: facts[fact],
      severity,
      changeClass,
      autoRepairPolicy,
      eventEnabled: false,
      source: 'config/platform-source-of-truth.json',
      description: `Canonical platform fact ${fact} must match the current Source of Truth.`,
    }));
  }

  const defaults = autonomy.defaultPosture || {};
  const safety = autonomy.safety || {};
  const policyRules = [
    ['orchestratorOwnsExecutionCoordination', 'governance.orchestratorOwnsExecutionCoordination', defaults.orchestratorOwnsExecutionCoordination, 'critical'],
    ['humanSovereigntyRemainsFinal', 'governance.humanSovereigntyRemainsFinal', defaults.humanSovereigntyRemainsFinal, 'critical'],
    ['neverExpandOwnAuthority', 'governance.neverExpandOwnAuthority', safety.neverExpandOwnAuthority, 'critical'],
    ['neverTreatAutonomyAsPermissionForDirectProductionMutation', 'governance.directProductionMutationForbidden', safety.neverTreatAutonomyAsPermissionForDirectProductionMutation, 'critical'],
    ['guardedReleaseAndProductionVerificationRemainRequired', 'governance.guardedReleaseRequired', safety.guardedReleaseAndProductionVerificationRemainRequired, 'critical'],
  ];
  for (const [id, selector, expected, severity] of policyRules) {
    if (expected === undefined) continue;
    rules.push(rule({
      id: `autonomy.${id}`,
      selector,
      expected: true,
      severity,
      changeClass: 'red',
      autoRepairPolicy: 'human_gate',
      eventEnabled: false,
      source: 'config/autonomous-operations-policy.json',
      description: `Autonomous governance invariant ${id} must remain enabled.`,
    }));
  }

  const canonicalRoutes = Array.isArray(routes.canonical) ? routes.canonical.map(String) : [];
  const platformServices = Array.isArray(routes.platformServices) ? routes.platformServices.map(String) : [];
  if (canonicalRoutes.length) rules.push(rule({
    id: 'routing.canonical_roots',
    entityId: 'routing:root-registry',
    scope: 'routing',
    selector: 'routing.canonical',
    operator: 'set_equals',
    expected: canonicalRoutes,
    severity: 'critical',
    changeClass: 'red',
    autoRepairPolicy: 'human_gate',
    eventEnabled: false,
    source: 'platform-route-registry.js',
    description: 'Canonical platform roots must match the registered route grammar.',
  }));
  if (platformServices.length) rules.push(rule({
    id: 'routing.platform_services',
    entityId: 'routing:root-registry',
    scope: 'routing',
    selector: 'routing.platformServices',
    operator: 'set_equals',
    expected: platformServices,
    severity: 'high',
    changeClass: 'yellow',
    autoRepairPolicy: 'assist_only',
    eventEnabled: false,
    source: 'platform-route-registry.js',
    description: 'Registered platform service routes must remain synchronized with the route registry.',
  }));

  for (const service of services) {
    const id = text(service?.id, 100);
    if (!id) continue;
    const entityId = `service:${id}`;
    if (service.url) rules.push(rule({
      id: `service.${id}.url`,
      entityId,
      scope: 'service',
      selector: `services.${id}.url`,
      expected: String(service.url),
      severity: 'high',
      changeClass: 'yellow',
      autoRepairPolicy: 'assist_only',
      eventEnabled: true,
      source: 'config/ecosystem-services.json',
      description: `${id} must remain available at its registered canonical URL.`,
    }));
    if (service.status) rules.push(rule({
      id: `service.${id}.status`,
      entityId,
      scope: 'service',
      selector: `services.${id}.status`,
      expected: String(service.status),
      severity: service.status === 'live' ? 'high' : 'medium',
      changeClass: 'green',
      autoRepairPolicy: 'bounded_reversible',
      eventEnabled: service.status === 'live',
      source: 'config/ecosystem-services.json',
      description: `${id} observed lifecycle state should match its registered state.`,
    }));
  }

  return freeze({
    schemaVersion: 1,
    registryId: 'EKODI-DESIRED-STATE-001',
    owner: 'ekodi-orchestrator',
    generation: Number(facts.generation || 10),
    scaleTier: text(facts.scaleTier || 'S0', 20),
    deterministicFirst: true,
    directMutation: false,
    rules,
    sources: ['config/platform-source-of-truth.json','config/autonomous-operations-policy.json','platform-route-registry.js','config/ecosystem-services.json'],
  });
}

export function buildRuntimeDesiredStateRegistry(input = {}) {
  const rules = [
    rule({
      id: 'runtime.autonomous_health_state',
      entityId: 'runtime:autonomous-health',
      scope: 'runtime',
      selector: 'autonomousHealth.state',
      operator: 'in',
      expected: ['HEALTHY','WATCH','UNKNOWN'],
      severity: 'high',
      changeClass: 'green',
      autoRepairPolicy: 'bounded_reversible',
      eventEnabled: true,
      source: 'ekodi-autonomous-health-telemetry.js',
      description: 'Autonomous health should remain outside DEGRADED or CRITICAL state.',
    }),
    rule({
      id: 'runtime.direct_production_mutation',
      entityId: 'runtime:autonomous-health',
      scope: 'runtime',
      selector: 'autonomousHealth.transparency.directProductionMutation',
      expected: false,
      severity: 'critical',
      changeClass: 'red',
      autoRepairPolicy: 'human_gate',
      eventEnabled: true,
      source: 'ekodi-autonomous-health.js',
      description: 'Autonomous health/runtime logic must never directly mutate production.',
    }),
    rule({
      id: 'runtime.command_ledger_durable',
      entityId: 'runtime:command-ledger',
      scope: 'runtime',
      selector: 'ledger.durable',
      expected: true,
      severity: 'critical',
      changeClass: 'yellow',
      autoRepairPolicy: 'assist_only',
      eventEnabled: false,
      source: 'ekodi-command-ledger.js',
      description: 'Autonomic events and commands require durable ledger persistence.',
    }),
    rule({
      id: 'runtime.command_evidence_append_only',
      entityId: 'runtime:command-ledger',
      scope: 'runtime',
      selector: 'ledger.evidenceLedger',
      expected: 'append-only-d1',
      severity: 'critical',
      changeClass: 'yellow',
      autoRepairPolicy: 'assist_only',
      eventEnabled: false,
      source: 'ekodi-command-ledger.js',
      description: 'Command evidence must remain append-only and durable.',
    }),
  ];
  const serviceIds = Array.isArray(input.serviceIds) ? [...new Set(input.serviceIds.map(value => text(value, 100)).filter(Boolean))].sort() : [];
  for (const id of serviceIds) {
    rules.push(rule({
      id: `runtime.service.${id}.health`,
      entityId: `service:${id}`,
      scope: 'service',
      selector: `services.${id}.status`,
      expected: 'online',
      severity: 'high',
      changeClass: 'green',
      autoRepairPolicy: 'bounded_reversible',
      eventEnabled: true,
      source: 'service_check_latest',
      description: `${id} runtime health should remain online.`,
    }));
    rules.push(rule({
      id: `runtime.service.${id}.freshness`,
      entityId: `service:${id}`,
      scope: 'service',
      selector: `services.${id}.fresh`,
      expected: true,
      severity: 'high',
      changeClass: 'green',
      autoRepairPolicy: 'bounded_reversible',
      eventEnabled: true,
      source: 'service_check_latest',
      description: `${id} runtime health observation must remain fresh.`,
    }));
  }

  return freeze({
    schemaVersion: 1,
    registryId: 'EKODI-RUNTIME-DESIRED-STATE-001',
    owner: 'ekodi-orchestrator',
    generation: Number(input.generation || 10),
    deterministicFirst: true,
    directMutation: false,
    rules,
    sources: ['ekodi-autonomous-health-telemetry.js','ekodi-command-ledger.js','service_check_latest','service_checks'],
  });
}

export const EKODI_DESIRED_STATE_REGISTRY = Object.freeze({
  version: '1.0.0',
  owner: 'ekodi-orchestrator',
  deterministicFirst: true,
  aiRequiredForComparison: false,
  directProductionMutation: false,
  missingObservationMeans: 'unknown-not-compliant-by-assumption',
});
