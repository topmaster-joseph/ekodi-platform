import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlatformDesiredStateRegistry } from '../ekodi-desired-state-registry.js';
import { runRuntimeAutonomicControlPlane, EKODI_AUTONOMIC_CONTROL_PLANE } from '../ekodi-autonomic-control-plane.js';
import { EKODI_EVENT_NERVOUS_SYSTEM } from '../ekodi-event-nervous-system.js';
import { EKODI_PLATFORM_DIGITAL_TWIN } from '../ekodi-platform-digital-twin.js';
import { EKODI_PLATFORM_OBSERVER } from '../ekodi-platform-observer.js';
import { PLATFORM_ROUTE_REGISTRY } from '../platform-route-registry.js';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

const sourceOfTruth = readJson('config/platform-source-of-truth.json');
const autonomyPolicy = readJson('config/autonomous-operations-policy.json');
const ecosystem = readJson('config/ecosystem-services.json');

assert.equal(EKODI_AUTONOMIC_CONTROL_PLANE.generation, 10);
assert.equal(EKODI_AUTONOMIC_CONTROL_PLANE.newDeploymentBoundary, false);
assert.equal(EKODI_AUTONOMIC_CONTROL_PLANE.paidDependency, false);
assert.equal(EKODI_AUTONOMIC_CONTROL_PLANE.directProductionMutation, false);
assert.equal(EKODI_EVENT_NERVOUS_SYSTEM.directMutation, false);
assert.equal(EKODI_PLATFORM_DIGITAL_TWIN.canonicalAuthorityRemainsExternal, true);
assert.equal(EKODI_PLATFORM_OBSERVER.directMutation, false);
assert.equal(EKODI_PLATFORM_OBSERVER.arbitraryUrlFetch, false);

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
  services: {
    core: { status:'online', fresh:true },
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

const degradedObserved = {
  ...healthyObserved,
  autonomousHealth: {
    state: 'DEGRADED',
    transparency: { directProductionMutation: false },
  },
  services: {
    core: { status:'offline', fresh:false },
  },
};
const degraded = runRuntimeAutonomicControlPlane({
  observed: degradedObserved,
  previousObserved: healthyObserved,
  now: '2026-09-25T00:01:00.000Z',
  eventOccurrenceKey: 'validator-degraded',
});
assert.ok(degraded.reconciliation.summary.drift >= 3);
assert.ok(degraded.events.length >= 3);
assert.ok(degraded.pulseCandidates.length >= 3);
assert.ok(degraded.pulseCandidates.every(pulse => pulse.delegation.directProductionMutation === false));
assert.equal(degraded.authority.authorityExpanded, false);
assert.equal(degraded.twin.health, 'drift');

const persistent = runRuntimeAutonomicControlPlane({
  observed: degradedObserved,
  previousObserved: degradedObserved,
  now: '2026-09-25T00:02:00.000Z',
  eventOccurrenceKey: 'validator-persistent',
});
assert.ok(persistent.reconciliation.summary.persistentDrift >= 3);
assert.equal(persistent.events.length, 0);

const redObserved = {
  ...healthyObserved,
  autonomousHealth: {
    state:'HEALTHY',
    transparency:{ directProductionMutation:true },
  },
};
const red = runRuntimeAutonomicControlPlane({
  observed:redObserved,
  previousObserved:healthyObserved,
  now:'2026-09-25T00:03:00.000Z',
  eventOccurrenceKey:'validator-red',
});
assert.equal(red.humanGates.length,1);
assert.equal(red.humanGatePulses.length,1);
assert.equal(red.humanGatePulses[0].delegation.allowed,false);
assert.equal(red.humanGatePulses[0].event.requiresHumanDecision,true);
assert.equal(red.humanGatePulses[0].delegation.directProductionMutation,false);

console.log('EKODI Autonomic Control Plane: OK');
console.log('- Desired State Registry: canonical-source derived');
console.log('- Platform Observer: existing health-ledger projection');
console.log('- Reconciler: deterministic desired/observed diff');
console.log('- Event Nervous System: transition-first, provider-neutral routing');
console.log('- Digital Twin: read model only; worst-state aggregation');
console.log('- Human gates: non-executable and authority-preserving');
console.log('- Generation 10 / S0 / guarded release boundaries preserved');
