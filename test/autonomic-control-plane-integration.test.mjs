import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Pulse runtime keeps autonomic control plane wired to existing service-health history', () => {
  const source = read('ekodi-pulse-runtime.js');
  assert.match(source, /runRuntimeAutonomicControlPlane/);
  assert.match(source, /collectPlatformRuntimeObservations/);
  assert.match(source, /previousAutonomousHealth/);
  assert.match(source, /humanGatePulses/);
  assert.match(source, /serviceObservation/);
  assert.match(source, /desired-state-observe-reconcile-route-act-verify-learn/);
});

test('human-gated autonomic events persist but cannot enter automatic claim states', () => {
  const source = read('ekodi-command-ledger.js');
  assert.match(source, /initialTaskState = requiresHuman \? 'human_gate' : 'queued'/);
  assert.match(source, /UPDATE ai_pulse_events SET state = 'human_gate'/);
  const claimFragments = [...source.matchAll(/state IN \('queued','retry'\)/g)];
  assert.ok(claimFragments.length >= 2);
  assert.doesNotMatch(source, /state IN \('queued','retry','human_gate'\)/);
});

test('platform observer is read-only and reuses existing control-center health tables', () => {
  const source = read('ekodi-platform-observer.js');
  assert.match(source, /FROM service_check_latest/);
  assert.match(source, /FROM service_checks/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /INSERT\s+INTO|UPDATE\s+service_|DELETE\s+FROM/i);
  assert.match(source, /arbitraryUrlFetch: false/);
  assert.match(source, /directMutation: false/);
});

test('autonomic core cannot claim production authority', () => {
  for (const path of [
    'ekodi-desired-state-registry.js',
    'ekodi-autonomic-reconciler.js',
    'ekodi-event-nervous-system.js',
    'ekodi-platform-digital-twin.js',
    'ekodi-autonomic-control-plane.js',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /directProductionMutation:\s*true/);
  }
  const control = read('ekodi-autonomic-control-plane.js');
  assert.match(control, /humanSovereigntyFinal: true/);
  assert.match(control, /guardedReleaseRequired: true/);
});


test('authenticated command status exposes the autonomic twin read model', () => {
  const source = read('ai-command-control.js');
  assert.match(source, /collectPlatformRuntimeObservations/);
  assert.match(source, /runRuntimeAutonomicControlPlane/);
  assert.match(source, /const autonomic = Object\.freeze/);
  assert.match(source, /serviceObservation: observations\.summary/);
  assert.match(source, /\n\s+autonomic,\n/);
});
