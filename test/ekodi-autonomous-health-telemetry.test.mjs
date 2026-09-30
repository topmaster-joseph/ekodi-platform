import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTONOMOUS_HEALTH_TELEMETRY,
  collectAutonomousHealthSignals,
  getLatestAutonomousHealthSnapshot,
  recordAutonomousHealthSnapshot,
  verifyAutonomousHealthAction,
} from '../ekodi-autonomous-health-telemetry.js';

test('v2 telemetry contract is deterministic, durable and evidence bound', () => {
  assert.equal(AUTONOMOUS_HEALTH_TELEMETRY.version, '2.0.0');
  assert.equal(AUTONOMOUS_HEALTH_TELEMETRY.storage, 'cloudflare-d1');
  assert.equal(AUTONOMOUS_HEALTH_TELEMETRY.assessmentAiRequired, false);
  assert.equal(AUTONOMOUS_HEALTH_TELEMETRY.automaticMutation, 'low-risk-reversible-only');
  assert.equal(AUTONOMOUS_HEALTH_TELEMETRY.mediumHighRisk, 'human-approval-required');
  assert.equal(AUTONOMOUS_HEALTH_TELEMETRY.unsupportedEvidence, 'null-not-fabricated');
});

test('telemetry operations fail closed when durable DB is absent', async () => {
  await assert.rejects(() => collectAutonomousHealthSignals({}), /EKODI_AUTONOMOUS_HEALTH_DB_REQUIRED/);
  await assert.rejects(() => recordAutonomousHealthSnapshot({}), /EKODI_AUTONOMOUS_HEALTH_DB_REQUIRED/);
  await assert.rejects(() => getLatestAutonomousHealthSnapshot({}), /EKODI_AUTONOMOUS_HEALTH_DB_REQUIRED/);
  await assert.rejects(() => verifyAutonomousHealthAction({}, 'x', {}), /EKODI_AUTONOMOUS_HEALTH_DB_REQUIRED/);
});
