import { buildRuntimeDesiredStateRegistry, buildPlatformDesiredStateRegistry } from './ekodi-desired-state-registry.js';
import { reconcileDesiredState } from './ekodi-autonomic-reconciler.js';
import { eventsFromReconciliation, autonomicEventToPulse } from './ekodi-event-nervous-system.js';
import { buildPlatformDigitalTwin } from './ekodi-platform-digital-twin.js';

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  return value;
}

function run(registry, input = {}) {
  const reconciliation = reconcileDesiredState(registry, input.observed || {}, {
    previousObserved: input.previousObserved || null,
    now: input.now,
  });
  const events = eventsFromReconciliation(reconciliation, { includePersistent: input.includePersistent === true, occurrenceKey: input.eventOccurrenceKey || input.now });
  const twin = buildPlatformDigitalTwin({ registry, reconciliation, events, observed: input.observed || {}, now: input.now });
  return freeze({
    schemaVersion: 1,
    controlPlaneId: 'EKODI-AUTONOMIC-CONTROL-PLANE-001',
    mode: 'desired-state-reconcile-event-twin',
    registry,
    reconciliation,
    events,
    pulseCandidates: events.filter(event => event.route === 'command_ledger').map(autonomicEventToPulse),
    humanGates: events.filter(event => event.route === 'human_gate'),
    humanGatePulses: events.filter(event => event.route === 'human_gate').map(autonomicEventToPulse),
    attention: events.filter(event => event.route === 'attention'),
    twin,
    authority: {
      owner: 'ekodi-orchestrator',
      humanSovereigntyFinal: true,
      directProductionMutation: false,
      authorityExpanded: false,
      guardedReleaseRequired: true,
    },
  });
}

export function runRuntimeAutonomicControlPlane(input = {}) {
  const serviceIds = Object.keys(input.observed?.services || {});
  return run(buildRuntimeDesiredStateRegistry({ generation: input.generation || 10, serviceIds }), input);
}

export function runPlatformAutonomicControlPlane(input = {}) {
  const registry = buildPlatformDesiredStateRegistry({
    sourceOfTruth: input.sourceOfTruth,
    autonomyPolicy: input.autonomyPolicy,
    routeRegistry: input.routeRegistry,
    services: input.services,
  });
  return run(registry, input);
}

export const EKODI_AUTONOMIC_CONTROL_PLANE = Object.freeze({
  version: '1.0.0',
  generation: 10,
  owner: 'ekodi-orchestrator',
  stages: Object.freeze(['desired_state','observe','reconcile','emit_event','route','verify','learn']),
  deterministicFirst: true,
  newDeploymentBoundary: false,
  paidDependency: false,
  directProductionMutation: false,
});
