import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [monitor, mission, migration, wrangler] = await Promise.all([
  readFile(new URL('../hybrid-execution-monitor.js', import.meta.url), 'utf8'),
  readFile(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0041_hybrid_execution_monitor.sql', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.api.toml', import.meta.url), 'utf8'),
]);

test('watchdog source and mission entry remain valid JavaScript', () => {
  for (const file of ['hybrid-execution-monitor.js', 'mission-control-entry-worker.js']) {
    execFileSync(process.execPath, ['--check', `${root}${file}`], { stdio:'pipe' });
  }
});

test('watchdog is driven by the existing ten-minute Control cron', () => {
  assert.match(wrangler, /crons = \["\*\/10 \* \* \* \*"\]/);
  assert.match(mission, /runHybridExecutionMonitor/);
  assert.match(mission, /ctx\.waitUntil\(hybridWatchdog\)/);
  assert.match(mission, /hybrid-execution\/monitor/);
});

test('watchdog detects node loss, backlog, repeated failures and requeue churn', () => {
  assert.match(monitor, /NODE_STALE_MS = 5 \* 60 \* 1000/);
  assert.match(monitor, /BACKLOG_MS = 15 \* 60 \* 1000/);
  assert.match(monitor, /FAILURE_WINDOW_MS = 30 \* 60 \* 1000/);
  for (const key of ['no_ready_nodes','stale_auto_nodes','pending_backlog','recent_failures','requeue_churn']) {
    assert.match(monitor, new RegExp(key));
  }
});

test('watchdog verifies production Control health and deployed Hybrid admin asset', () => {
  assert.match(monitor, /https:\/\/api\.ekodi\.kr\/health/);
  assert.match(monitor, /https:\/\/admin\.ekodi\.kr\/device-control-admin\.js/);
  assert.match(monitor, /EKODI HYBRID EXECUTION/);
  assert.match(monitor, /admin_hybrid_asset_missing/);
  assert.match(monitor, /control_health_failed/);
});

test('watchdog never treats the safe default of zero auto nodes as an incident', () => {
  assert.match(monitor, /configuredAutoNodes > 0 && signals\.onlineAutoNodes === 0/);
});

test('monitor API stays behind the existing administrator session boundary', () => {
  assert.match(monitor, /import authWorker from '\.\/auth-worker\.js'/);
  assert.match(monitor, /url\.pathname = '\/api\/session'/);
  assert.match(monitor, /if \(!auth\.session\) return auth\.response/);
});

test('incident ledger is durable and supports automatic resolution', () => {
  for (const table of ['hybrid_execution_incidents','hybrid_execution_monitor_state']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /idx_hybrid_incidents_status/);
  assert.match(monitor, /SET status='resolved'/);
  assert.match(monitor, /ON CONFLICT\(incident_key\) DO UPDATE SET/);
});

test('watchdog does not add arbitrary local execution primitives', () => {
  assert.doesNotMatch(monitor, /child_process|execSync|spawnSync|eval\(|new Function/);
});
