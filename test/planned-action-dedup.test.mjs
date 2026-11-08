// AUTONOMIC-STATE-FROM-OBSERVED-PRESSURE-001 let observed pressure raise the
// level, which finally made the platform propose protective actions. It also
// exposed something that had never been reachable: the proposal recorder ran on
// every pass, and the pulse runs every ten minutes.
//
// Production on 2026-11-08 has 8 of 33 production endpoint checks above the
// 1,200ms threshold with p95 at 2,048ms, so the ELEVATED condition is standing,
// not momentary. Without this change it would have written about 288 rows a day,
// forever, every one of them identical. "Never says anything" would have become
// "always says the same thing" — the same disease in a new costume, and on a
// free tier the growth is not free.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { recordAutonomousHealthSnapshot } from '../ekodi-autonomous-health-telemetry.js';

function createD1(sqlite) {
  const prepare = query => {
    let params = [];
    const statement = {
      bind(...values) { params = values; return statement; },
      async run() {
        const result = sqlite.prepare(query).run(...params);
        return { success: true, meta: { last_row_id: Number(result.lastInsertRowid) || 0 } };
      },
      async all() { return { results: sqlite.prepare(query).all(...params) }; },
      async first() { return sqlite.prepare(query).get(...params) ?? null; },
    };
    return statement;
  };
  return { prepare, async batch(statements) { return Promise.all(statements.map(item => item.run())); } };
}

function freshDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE cloudflare_environment_checks (
    environment TEXT NOT NULL, service_id TEXT, status TEXT NOT NULL,
    response_ms INTEGER, checked_at TEXT NOT NULL)`);
  sqlite.exec(`CREATE TABLE system_usage_state (
    source TEXT PRIMARY KEY, status TEXT, last_attempt_at TEXT, last_success_at TEXT, message TEXT)`);
  return { sqlite, db: createD1(sqlite) };
}

// Production's standing shape: most endpoints quick, several well over 1,200ms.
function seedPressure(sqlite, checkedAt) {
  const rows = [
    ['social', 'online', 1715], ['api', 'online', 1645], ['admin', 'online', 1099],
    ['books', 'online', 634], ['church', 'online', 410], ['biz', 'online', 354],
    ['mall', 'online', 349], ['trade', 'online', 333], ['pay', 'online', 321],
    ['learn', 'online', 280], ['slowest', 'online', 2666],
  ];
  for (const [service, status, ms] of rows) {
    sqlite.prepare(`INSERT INTO cloudflare_environment_checks
      (environment, service_id, status, response_ms, checked_at) VALUES ('production',?,?,?,?)`)
      .run(service, status, ms, checkedAt);
  }
}

const plans = sqlite => sqlite.prepare(
  "SELECT action_id, reason, state FROM autonomous_health_actions ORDER BY id").all();

test('a standing condition is planned once, not every ten minutes', async () => {
  const { sqlite, db } = freshDb();
  seedPressure(sqlite, '2026-11-08T12:00:00.000Z');
  const first = await recordAutonomousHealthSnapshot({ DB: db }, { observedAt: '2026-11-08T12:00:00.000Z' });
  assert.ok(first.proposedActions.length > 0, 'pressure must still propose');
  const afterFirst = plans(sqlite).length;
  assert.ok(afterFirst > 0, 'the first pass records the plan');

  // Six more passes, an hour of an unchanged condition.
  for (let i = 1; i <= 6; i += 1) {
    const at = `2026-11-08T12:${String(i * 10).padStart(2, '0')}:00.000Z`;
    seedPressure(sqlite, at);
    await recordAutonomousHealthSnapshot({ DB: db }, { observedAt: at });
  }
  assert.equal(plans(sqlite).length, afterFirst, 'an unchanged condition adds no rows');

  // The snapshots, which carry the full state, are still written every pass, so
  // the history of the condition is complete.
  const snapshots = sqlite.prepare('SELECT COUNT(*) n FROM autonomous_health_snapshots').get().n;
  assert.equal(snapshots, 7, 'every pass is still observed and recorded');
});

test('a plan whose reason changed is recorded as a new plan', async () => {
  // Deduplication keys on the open plan's reason, which carries the level
  // (traffic_elevated, traffic_high). A level change must therefore produce a
  // new row rather than being swallowed as a repeat.
  const { sqlite, db } = freshDb();
  seedPressure(sqlite, '2026-11-08T12:00:00.000Z');
  await recordAutonomousHealthSnapshot({ DB: db }, { observedAt: '2026-11-08T12:00:00.000Z' });
  const first = plans(sqlite);
  assert.ok(first.length > 0);
  assert.ok(first.some(row => row.reason === 'traffic_elevated'), 'one breach is an elevated plan');

  // Stand in for a worse level by changing the open plan's reason, which is what
  // the dedup key compares. (The platform cannot currently reach HIGH on its own
  // — see the test below.)
  sqlite.exec("UPDATE autonomous_health_actions SET reason='traffic_high' WHERE reason='traffic_elevated'");
  seedPressure(sqlite, '2026-11-08T12:10:00.000Z');
  await recordAutonomousHealthSnapshot({ DB: db }, { observedAt: '2026-11-08T12:10:00.000Z' });
  const after = plans(sqlite);
  assert.ok(after.length > first.length, 'a different reason must be recorded, not suppressed');
  assert.ok(after.some(row => row.reason === 'traffic_elevated'));
});

test('today only one pressure signal is ever supplied, so only ELEVATED is reachable', async () => {
  // A finding, pinned so it is not forgotten: assessTrafficSurge weighs five
  // pressure signals — cpuPct, memoryPct, dbPoolPct, p95LatencyMs, errorRatePct —
  // and the telemetry collectors supply exactly one of them. fleetSignals returns
  // availabilityScore, p95LatencyMs and dependencyIsolationScore; nothing in this
  // repository produces the other four. So breached can never hold more than one
  // name, and the HIGH and EXTREME escalations are unreachable from observed
  // pressure. The platform can notice that it is slow; it cannot yet notice that
  // it is slow AND erroring.
  const { sqlite, db } = freshDb();
  seedPressure(sqlite, '2026-11-08T12:00:00.000Z');
  const report = await recordAutonomousHealthSnapshot({ DB: db }, { observedAt: '2026-11-08T12:00:00.000Z' });
  assert.deepEqual(report.traffic.breached, ['p95LatencyMs']);
  assert.deepEqual(report.traffic.measuredPressure, ['p95LatencyMs'],
    'if another signal starts being supplied, this test should be updated to match');
  assert.equal(report.traffic.level, 'ELEVATED');
  for (const absent of ['cpuPct', 'memoryPct', 'dbPoolPct', 'errorRatePct']) {
    assert.equal(report.evidence[absent], undefined, `${absent} is still supplied by nothing`);
  }
});

test('a plan that is no longer open is proposed again', async () => {
  // Deduplication keys on an open plan, so once a plan is acted on, a recurrence
  // is recorded rather than silently swallowed.
  const { sqlite, db } = freshDb();
  seedPressure(sqlite, '2026-11-08T12:00:00.000Z');
  await recordAutonomousHealthSnapshot({ DB: db }, { observedAt: '2026-11-08T12:00:00.000Z' });
  const before = plans(sqlite).length;
  sqlite.exec("UPDATE autonomous_health_actions SET state='done'");

  seedPressure(sqlite, '2026-11-08T12:10:00.000Z');
  await recordAutonomousHealthSnapshot({ DB: db }, { observedAt: '2026-11-08T12:10:00.000Z' });
  assert.equal(plans(sqlite).length, before * 2, 'a closed plan does not suppress the next one');
});

test('a calm fleet proposes nothing, and records nothing', async () => {
  const { sqlite, db } = freshDb();
  for (const [service, ms] of [['a', 120], ['b', 90], ['c', 150]]) {
    sqlite.prepare(`INSERT INTO cloudflare_environment_checks
      (environment, service_id, status, response_ms, checked_at) VALUES ('production',?, 'online',?,?)`)
      .run(service, ms, '2026-11-08T12:00:00.000Z');
  }
  const report = await recordAutonomousHealthSnapshot({ DB: db }, { observedAt: '2026-11-08T12:00:00.000Z' });
  assert.deepEqual(report.proposedActions, []);
  assert.equal(plans(sqlite).length, 0);
});

test('deduplication keys on the open plan and its reason, not on time', () => {
  const source = fs.readFileSync(new URL('../ekodi-autonomous-health-telemetry.js', import.meta.url), 'utf8');
  assert.match(source, /WHERE action_id = \? AND state = 'planned'/);
  assert.match(source, /if \(openPlan && String\(openPlan\.reason \|\| ''\) === text\(action\.reason, 200\)\) continue;/);
  // The snapshot write must stay unconditional: it is the complete history.
  const insertSnapshot = source.indexOf('INSERT INTO autonomous_health_snapshots');
  const dedup = source.indexOf("WHERE action_id = ? AND state = 'planned'");
  assert.ok(insertSnapshot > 0 && dedup > insertSnapshot, 'the snapshot is written before any plan is considered');
});
