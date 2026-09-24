import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlatformDesiredStateRegistry } from '../ekodi-desired-state-registry.js';
import { runRuntimeAutonomicControlPlane, runPlatformAutonomicControlPlane, EKODI_AUTONOMIC_CONTROL_PLANE } from '../ekodi-autonomic-control-plane.js';
import { EKODI_EVENT_NERVOUS_SYSTEM } from '../ekodi-event-nervous-system.js';
import { EKODI_PLATFORM_DIGITAL_TWIN } from '../ekodi-platform-digital-twin.js';
import { PLATFORM_ROUTE_REGISTRY } from '../platform-route-registry.js';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

const sourceOfTruth = readJson('config/platform-source-of-truth.json');
const autonomyPolicy = readJson('config/autonomous-operations-policy.json');
const ecosystem = readJson('config/ecosystem-services.json');

assert.equal(EKODI_AUTONOMIC_CONTROL_PLANE.generation, 10);
assert.equal(EKODI_AUTONOMIC_CONTROL_PLANE.newDeploymentBoundary, false);
assert.equal(EKODI_AUTONOMIC_CONTROL_PLANE.directProductionMutation, false);
assert.equal(EKODI_EVENT_NERVOUS_SYSTEM.directMutation, false);
assert.equal(EKODI_PLATFORM_DIGITAL_TWIN.canonicalAuthorityRemainsExternal, true);

const registry = buildPlatformDesiredStateRegistry({
  sourceOfTruth,
  autonomyPolicy,
  routeRegistry: PLATFORM_ROUTE_REGISTRY,
  services: ecosystem.services,
});
assert.equal(registry.generation, 10);
assert.equal(registry.scaleTier, 'S0');
assert.equal(registry.directMutation, false);
assert.ok(registry.rules.length >= ecosystem.services.length);

const healthyObserved = {
  autonomousHealth: {
    state: 'HEALTHY',
    transparency: { directProductionMutation: false },
  },
  ledger: {
    durable: true,
    evidenceLedger: 'append-only-d1',
  },
};
const healthy = runRuntimeAutonomicControlPlane({
  observed: healthyObserved,
  previousObserved: healthyObserved,
  now: '2026-09-25T00:00:00.000Z',
  eventOccurrenceKey: 'validator-healthy',
});
assert.equal(healthy.reconciliation.summary.drift, 0);
assert.equal(healthy.events.length, 0);
assert.equal(healthy.twin.health, 'converged');

const degraded = runRuntimeAutonomicControlPlane({
  observed: {
    ...healthyObserved,
    autonomousHealth: {
      state: 'DEGRADED',
      transparency: { directProductionMutation: false },
    },
  },
  previousObserved: healthyObserved,
  now: '2026-09-25T00:01:00.000Z',
  eventOccurrenceKey: 'validator-degraded',
});
assert.equal(degraded.reconciliation.summary.drift, 1);
assert.equal(degraded.events.length, 1);
assert.equal(degraded.pulseCandidates.length, 1);
assert.equal(degraded.pulseCandidates[0].delegation.directProductionMutation, false);
assert.equal(degraded.authority.authorityExpanded, false);
assert.equal(degraded.twin.health, 'drift');

const platformObserved = {
  platform: { ...sourceOfTruth.currentFacts, directAutonomousProductionMutationAllowed: true },
  governance: {
    orchestratorOwnsExecutionCoordination: true,
    humanSovereigntyRemainsFinal: true,
    neverExpandOwnAuthority: true,
    directProductionMutationForbidden: true,
    guardedReleaseRequired: true,
  },
  routing: {
    canonical: [...PLATFORM_ROUTE_REGISTRY.canonical],
    platformServices: [...PLATFORM_ROUTE_REGISTRY.platformServices],
  },
  services: Object.fromEntries(ecosystem.services.map(service => [service.id, { url: service.url, status: service.status }])),
};
const platform = runPlatformAutonomicControlPlane({
  sourceOfTruth,
  autonomyPolicy,
  routeRegistry: PLATFORM_ROUTE_REGISTRY,
  services: ecosystem.services,
  observed: platformObserved,
  now: '2026-09-25T00:02:00.000Z',
  eventOccurrenceKey: 'validator-red',
});
assert.ok(platform.humanGates.some(event => event.ruleId === 'platform.fact.directAutonomousProductionMutationAllowed'));
assert.ok(platform.humanGatePulses.every(pulse => pulse.delegation.allowed === false));
assert.ok(platform.humanGatePulses.every(pulse => pulse.event.requiresHumanDecision === true));
assert.equal(platform.authority.directProductionMutation, false);

console.log('EKODI Autonomic Control Plane: OK');
console.log('- Desired State Registry: canonical-source derived');
console.log('- Reconciler: deterministic desired/observed diff');
console.log('- Event Nervous System: transition-first, provider-neutral routing');
console.log('- Digital Twin: read model only; worst-state aggregation');
console.log('- Human gates: persisted without autonomous execution');
console.log('- Generation 10 / S0 / guarded release boundaries preserved');
