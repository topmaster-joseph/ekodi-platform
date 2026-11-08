// Measured in production on 2026-11-08: autonomous_health_snapshots held 8,434
// rows, exactly one distinct state among them — UNKNOWN — and
// autonomous_health_actions was empty. The platform had looked at itself 8,434
// times, never reached a conclusion, and never proposed a protective action.
//
// The cause was structural, not incidental. assessTrafficSurge derives `level`
// from currentRps / baselineRps, and nothing in this repository supplies either,
// so `ratio` was always null and `level` always UNKNOWN — while the same report
// carried breached:['p95LatencyMs'] with p95 at 2,048ms against a 1,200ms
// threshold, and production shed its own admin verification with
// 429 reasons=latency_or_error on 2026-11-02. proposeProtectiveActions returns an
// empty list for UNKNOWN, so observed pressure could never reach it.
//
// These tests pin that measured pressure now raises the level, that a level
// derived without a ratio is labelled as such, and that health is still never
// claimed without evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assessTrafficSurge,
  buildAutonomousHealthReport,
  proposeProtectiveActions,
} from '../ekodi-autonomous-health.js';

// Production's own numbers from the 2026-11-08T12:30:42Z snapshot.
const PRODUCTION_SIGNALS = Object.freeze({
  availabilityScore: 100,
  p95LatencyMs: 2048,
  dependencyIsolationScore: 100,
  telemetryFresh: false,
  recoveryReadinessScore: 100,
  autonomousDetectionScore: 100,
});

test("production's own evidence now yields a conclusion instead of UNKNOWN", () => {
  const assessment = assessTrafficSurge(PRODUCTION_SIGNALS);
  assert.deepEqual(assessment.breached, ['p95LatencyMs']);
  assert.equal(assessment.level, 'ELEVATED', '2,048ms against a 1,200ms threshold is not an unknown');
  assert.equal(assessment.levelBasis, 'observed_pressure');
  assert.equal(assessment.trafficRatio, null, 'the ratio is still genuinely unknown');
  assert.equal(assessment.evidenceComplete, false, 'and the report must keep saying so');

  const report = buildAutonomousHealthReport(PRODUCTION_SIGNALS);
  assert.equal(report.state, 'WATCH', 'the state machine finally leaves its single state');
  assert.ok(report.proposedActions.length > 0, 'and something is finally proposed');
  assert.equal(report.verificationStatus, 'REQUIRED_BEFORE_AND_AFTER_MUTATION');
});

test('nothing is proposed that is not reversible, and MEDIUM still needs approval', () => {
  // The whole change is safe only because proposals are recorded, not executed.
  const extreme = { p95LatencyMs: 9000, errorRatePct: 40, cpuPct: 99, memoryPct: 99, dbPoolPct: 99 };
  const report = buildAutonomousHealthReport(extreme, { allowMedium: false });
  assert.equal(report.traffic.level, 'EXTREME');
  assert.ok(report.proposedActions.every(action => action.reversible === true), 'every action must be reversible');
  for (const decision of report.guardrailDecisions) {
    if (decision.risk === 'MEDIUM') {
      assert.equal(decision.decision, 'APPROVAL_REQUIRED', 'a MEDIUM action may never auto-allow here');
    }
  }
  assert.equal(report.transparency.directProductionMutation, false);
});

test('one breach is ELEVATED, two is HIGH, four is EXTREME — without any ratio', () => {
  const cases = [
    [{ p95LatencyMs: 2048 }, 'ELEVATED'],
    [{ p95LatencyMs: 2048, errorRatePct: 5 }, 'HIGH'],
    [{ p95LatencyMs: 2048, errorRatePct: 5, cpuPct: 95 }, 'HIGH'],
    [{ p95LatencyMs: 2048, errorRatePct: 5, cpuPct: 95, memoryPct: 95 }, 'EXTREME'],
  ];
  for (const [signals, expected] of cases) {
    const assessment = assessTrafficSurge(signals);
    assert.equal(assessment.level, expected, `${JSON.stringify(signals)} must be ${expected}`);
    assert.equal(assessment.levelBasis, 'observed_pressure');
  }
});

test('health is still never claimed without measuring traffic', () => {
  // The asymmetry is the point: breaches may raise the level, absence of
  // breaches may not lower it to NORMAL, because that would be the fabrication
  // transparency.fabricatedScoresForbidden exists to prevent.
  const calm = assessTrafficSurge({ p95LatencyMs: 120, errorRatePct: 0, availabilityScore: 100 });
  assert.equal(calm.level, 'UNKNOWN', 'no breach and no ratio is honestly unknown');
  assert.equal(calm.levelBasis, 'insufficient_evidence');
  assert.deepEqual(calm.breached, []);
  assert.deepEqual(calm.measuredPressure, ['p95LatencyMs', 'errorRatePct'], 'but what was measured is recorded');

  const report = buildAutonomousHealthReport({ p95LatencyMs: 120, errorRatePct: 0 });
  assert.equal(report.state, 'UNKNOWN');
  assert.deepEqual(report.proposedActions, [], 'and nothing is proposed, which costs nothing');
});

test('a known ratio still decides the level exactly as before', () => {
  // The existing path must not shift under this change.
  for (const [signals, expected] of [
    [{ baselineRps: 10, currentRps: 15 }, 'NORMAL'],
    [{ baselineRps: 10, currentRps: 40 }, 'ELEVATED'],
    [{ baselineRps: 10, currentRps: 80 }, 'HIGH'],
    [{ baselineRps: 10, currentRps: 200 }, 'EXTREME'],
  ]) {
    const assessment = assessTrafficSurge(signals);
    assert.equal(assessment.level, expected);
    assert.equal(assessment.levelBasis, 'traffic_ratio');
    assert.equal(assessment.evidenceComplete, true);
  }
  // And the old escalation by breach count on top of a known ratio is intact.
  const escalated = assessTrafficSurge({ baselineRps: 10, currentRps: 15, p95LatencyMs: 2048, errorRatePct: 5 });
  assert.equal(escalated.level, 'HIGH', 'two breaches still lift a NORMAL ratio to HIGH');
  assert.equal(escalated.levelBasis, 'traffic_ratio');
});

test('a signal below its threshold is not a breach', () => {
  // p95 of exactly the threshold breaches; one millisecond under does not.
  assert.deepEqual(assessTrafficSurge({ p95LatencyMs: 1200 }).breached, ['p95LatencyMs']);
  assert.deepEqual(assessTrafficSurge({ p95LatencyMs: 1199 }).breached, []);
  assert.equal(assessTrafficSurge({ p95LatencyMs: 1199 }).level, 'UNKNOWN');
});

test('a malformed or absent signal set cannot throw, since this runs every ten minutes', () => {
  for (const signals of [undefined, {}, { p95LatencyMs: null }, { p95LatencyMs: 'slow' }, { errorRatePct: NaN }]) {
    const assessment = assessTrafficSurge(signals);
    assert.equal(assessment.level, 'UNKNOWN');
    assert.deepEqual(assessment.breached, []);
    const report = buildAutonomousHealthReport(signals);
    assert.equal(report.state, 'UNKNOWN');
  }
});

test('the UNKNOWN gate on proposals is left alone, because it no longer blocks observed pressure', () => {
  // Fixing the level rather than loosening the proposal gate keeps a genuinely
  // unknown state from proposing anything.
  assert.deepEqual(proposeProtectiveActions({ level: 'UNKNOWN', breached: ['p95LatencyMs'] }), []);
  const source = fs.readFileSync(new URL('../ekodi-autonomous-health.js', import.meta.url), 'utf8');
  assert.match(source, /if \(!assessment \|\| assessment\.level === 'UNKNOWN' \|\| assessment\.level === 'NORMAL'\) return actions;/,
    'the proposal gate must stay as strict as it was');
});
