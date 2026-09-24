import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlatformDesiredStateRegistry, buildRuntimeDesiredStateRegistry } from '../ekodi-desired-state-registry.js';
import { reconcileDesiredState } from '../ekodi-autonomic-reconciler.js';
import { eventsFromReconciliation, autonomicEventToPulse } from '../ekodi-event-nervous-system.js';
import { buildPlatformDigitalTwin } from '../ekodi-platform-digital-twin.js';
import { runRuntimeAutonomicControlPlane, runPlatformAutonomicControlPlane } from '../ekodi-autonomic-control-plane.js';

const sourceOfTruth = {
  currentFacts: {
    generation: 10,
    scaleTier: 'S0',
    canonicalWebRoot: 'https://ekodi.kr',
    canonicalAdminPath: 'https://ekodi.kr/admin',
    canonicalPersonalPath: 'https://ekodi.kr/my',
    canonicalMcpPath: 'https://ekodi.kr/mcp',
    newSubdomainCreationAllowed: false,
    automaticPaidCommitmentAllowed: false,
    directAutonomousProductionMutationAllowed: false,
    directPushToMainAllowed: false,
  },
};
const autonomyPolicy = {
  defaultPosture: { orchestratorOwnsExecutionCoordination:true, humanSovereigntyRemainsFinal:true },
  safety: { neverExpandOwnAuthority:true, neverTreatAutonomyAsPermissionForDirectProductionMutation:true, guardedReleaseAndProductionVerificationRemainRequired:true },
};

test('desired-state registry derives canonical values from current source inputs', () => {
  const registry = buildPlatformDesiredStateRegistry({ sourceOfTruth, autonomyPolicy, routeRegistry:{canonical:['admin','my'],platformServices:['ai']}, services:[{id:'community',url:'https://ekodi.kr/community',status:'live'}] });
  const root = registry.rules.find(item => item.id === 'platform.fact.canonicalWebRoot');
  const service = registry.rules.find(item => item.id === 'service.community.status');
  assert.equal(root.expected, 'https://ekodi.kr');
  assert.equal(service.expected, 'live');
  assert.equal(registry.directMutation, false);
});

test('reconciler distinguishes compliant, drift, and unknown without mutating', () => {
  const registry = buildRuntimeDesiredStateRegistry();
  const observed = { autonomousHealth:{state:'DEGRADED',transparency:{directProductionMutation:false}}, ledger:{durable:true,evidenceLedger:'append-only-d1'} };
  const result = reconcileDesiredState(registry, observed, { now:'2026-09-25T00:00:00Z' });
  assert.equal(result.summary.drift, 1);
  assert.equal(result.drifts[0].ruleId, 'runtime.autonomous_health_state');
  assert.equal(result.mutationPerformed, false);
});

test('persistent identical drift is marked persistent and duplicate event is suppressed', () => {
  const registry = buildRuntimeDesiredStateRegistry();
  const observed = { autonomousHealth:{state:'DEGRADED',transparency:{directProductionMutation:false}}, ledger:{durable:true,evidenceLedger:'append-only-d1'} };
  const result = reconcileDesiredState(registry, observed, { previousObserved:observed });
  assert.equal(result.drifts[0].transition, 'persistent');
  assert.equal(eventsFromReconciliation(result).length, 0);
  assert.equal(eventsFromReconciliation(result,{includePersistent:true}).length, 1);
});

test('event nervous system routes reversible drift to command ledger and red drift to human gate', () => {
  const reversible = { drifts:[{ruleId:'x',entityId:'runtime:x',expected:'HEALTHY',observed:'DEGRADED',severity:'high',changeClass:'green',autoRepairPolicy:'bounded_reversible',eventEnabled:true,transition:'new',fingerprint:'x'}] };
  const red = { drifts:[{ruleId:'y',entityId:'runtime:y',expected:false,observed:true,severity:'critical',changeClass:'red',autoRepairPolicy:'human_gate',eventEnabled:true,transition:'new',fingerprint:'y'}] };
  const event = eventsFromReconciliation(reversible)[0];
  const gated = eventsFromReconciliation(red)[0];
  assert.equal(event.route, 'command_ledger');
  assert.equal(autonomicEventToPulse(event).delegation.allowed, true);
  assert.equal(autonomicEventToPulse(event).delegation.directProductionMutation, false);
  assert.equal(gated.route, 'human_gate');
  assert.equal(gated.actionable, false);
});

test('digital twin is a read model and exposes convergence/drift graph', () => {
  const registry = buildRuntimeDesiredStateRegistry();
  const observed = { autonomousHealth:{state:'DEGRADED',transparency:{directProductionMutation:false}}, ledger:{durable:true,evidenceLedger:'append-only-d1'} };
  const reconciliation = reconcileDesiredState(registry, observed);
  const events = eventsFromReconciliation(reconciliation);
  const twin = buildPlatformDigitalTwin({ registry, reconciliation, events, observed });
  assert.equal(twin.health, 'drift');
  assert.ok(twin.nodes.some(node => node.id === 'runtime:autonomous-health'));
  assert.equal(twin.authority.directProductionMutation, false);
});

test('runtime control plane produces a bounded pulse candidate for a new degraded-state transition', () => {
  const observed = { autonomousHealth:{state:'DEGRADED',transparency:{directProductionMutation:false}}, ledger:{durable:true,evidenceLedger:'append-only-d1'} };
  const previousObserved = { autonomousHealth:{state:'HEALTHY',transparency:{directProductionMutation:false}}, ledger:{durable:true,evidenceLedger:'append-only-d1'} };
  const control = runRuntimeAutonomicControlPlane({ observed, previousObserved, now:'2026-09-25T00:00:00Z', eventOccurrenceKey:'snapshot-42' });
  assert.equal(control.pulseCandidates.length, 1);
  assert.equal(control.pulseCandidates[0].target.capability, 'desired_state_reconciliation');
  assert.ok(control.events[0].id.startsWith('autonomic_'));
  assert.equal(control.events[0].occurrenceKey, 'snapshot-42');
  assert.equal(control.authority.directProductionMutation, false);
});

test('platform control plane consumes current canonical sources without becoming authority itself', () => {
  const observed = {
    platform:{...sourceOfTruth.currentFacts},
    governance:{orchestratorOwnsExecutionCoordination:true,humanSovereigntyRemainsFinal:true,neverExpandOwnAuthority:true,directProductionMutationForbidden:true,guardedReleaseRequired:true},
    routing:{canonical:['my','admin'],platformServices:['ai']},
    services:{community:{url:'https://ekodi.kr/community',status:'live'}},
  };
  const control = runPlatformAutonomicControlPlane({ sourceOfTruth, autonomyPolicy, routeRegistry:{canonical:['admin','my'],platformServices:['ai']}, services:[{id:'community',url:'https://ekodi.kr/community',status:'live'}], observed });
  assert.equal(control.reconciliation.summary.drift, 0);
  assert.equal(control.registry.generation, 10);
  assert.equal(control.twin.authority.providerOwnsAuthority, false);
});
