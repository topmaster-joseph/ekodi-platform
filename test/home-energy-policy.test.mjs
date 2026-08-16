import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSnapshot, classifyRequestedAction } from '../home-energy/policy-engine.mjs';

test('detects whole-home power anomaly without enabling control', () => {
  const report = analyzeSnapshot({ totalPowerW: 1000, baselinePowerW: 300 });
  assert.equal(report.controlEnabled, false);
  assert.ok(report.recommendations.some((item) => item.code === 'whole_home_power_anomaly'));
});

test('idle controllable load requires human approval', () => {
  const report = analyzeSnapshot({
    totalPowerW: 250,
    devices: [{ id: 'tv', name: 'TV', category: 'entertainment', state: 'on', idle: true, controllable: true, powerW: 35 }]
  });
  const item = report.recommendations.find((entry) => entry.code === 'device_idle_load');
  assert.equal(item.proposedAction, 'device.power_off');
  assert.equal(item.humanGate, true);
  assert.equal(item.executable, false);
});

test('protected device cannot be switched by requested action', () => {
  const decision = classifyRequestedAction('device.power_off', { category: 'refrigeration' });
  assert.equal(decision.decision, 'blocked');
});

test('main breaker operations are forbidden', () => {
  const decision = classifyRequestedAction('main_breaker.toggle');
  assert.equal(decision.decision, 'blocked');
});

test('unknown actions fail closed', () => {
  const decision = classifyRequestedAction('device.experimental_mode');
  assert.equal(decision.decision, 'awaiting_human');
});
