import test from 'node:test';
import assert from 'node:assert/strict';
import { wilson, providerReliability, orchestratorHealth, opsGate } from '../ops-baseline.mjs';

test('wilson interval is bounded and fails closed on invalid input', () => {
  const w = wilson(817, 845);
  assert(w.lower > 0.95 && w.upper < 0.99 && w.lower < w.estimate && w.estimate < w.upper);
  assert.equal(wilson(1, 0).estimate, null);
  assert.equal(wilson(5, 3).estimate, null);
});

test('providers ranked by lower bound, not lucky small samples', () => {
  const r = providerReliability([
    { provider_id: 'lucky', ok: 2, tries: 2, failed: 0 },
    { provider_id: 'proven', ok: 817, tries: 845, failed: 25 },
    { provider_id: 'flaky', ok: 113, tries: 1626, failed: 1513 },
  ]);
  assert.deepEqual(r.map(x => x.provider), ['proven', 'lucky', 'flaky']);
});

test('orchestrator health exposes orphaned assigned tasks', () => {
  const h = orchestratorHealth([
    { state: 'assigned', older7d: 658, last7d: 732 },
    { state: 'completed', older7d: 502, last7d: 148 },
    { state: 'blocked', older7d: 31, last7d: 0 },
    { state: 'cancelled', older7d: 3, last7d: 0 },
  ]);
  assert.equal(h.total, 2074);
  assert.equal(h.orphanedAssigned, 658);
  assert(Math.abs(h.completionLast7d.estimate - 148 / 880) < 1e-9);
});

test('ops gate blocks degradation and growing orphan backlog, fails closed on unknown', () => {
  const base = { completionLast7d: wilson(148, 880), orphanedAssigned: 658 };
  assert.equal(opsGate(base, { completionLast7d: wilson(300, 880), orphanedAssigned: 600 }).pass, true);
  assert.equal(opsGate(base, { completionLast7d: wilson(60, 880), orphanedAssigned: 600 }).pass, false);
  assert.equal(opsGate(base, { completionLast7d: wilson(148, 880), orphanedAssigned: 700 }).pass, false);
  assert.equal(opsGate(base, {}).pass, false);
});
