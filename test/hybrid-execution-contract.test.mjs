import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hybrid, mission, migration, admin, postbuild] = await Promise.all([
  readFile(new URL('../hybrid-execution.js', import.meta.url), 'utf8'),
  readFile(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0040_hybrid_execution.sql', import.meta.url), 'utf8'),
  readFile(new URL('../hybrid-execution-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/admin-thin-postbuild.mjs', import.meta.url), 'utf8'),
]);

test('hybrid queue is cloud-owned and new nodes default to auto execution off', () => {
  assert.match(hybrid, /auto_execute,\s*enabled[\s\S]*VALUES \(\?, 0, 1,/);
  assert.match(migration, /auto_execute INTEGER NOT NULL DEFAULT 0/);
});

test('hybrid execution hard-limits retries to three attempts', () => {
  assert.match(hybrid, /const MAX_ATTEMPTS = 3/);
  assert.match(migration, /max_attempts INTEGER NOT NULL DEFAULT 3 CHECK \(max_attempts BETWEEN 1 AND 3\)/);
  assert.match(migration, /attempt_count INTEGER NOT NULL DEFAULT 0 CHECK \(attempt_count BETWEEN 0 AND 3\)/);
});

test('hybrid tasks are a closed predefined allowlist without arbitrary shell hooks', () => {
  assert.match(hybrid, /const TASK_POLICIES = Object\.freeze/);
  assert.doesNotMatch(hybrid, /child_process|execSync|spawnSync|new Function|eval\(/);
  assert.match(hybrid, /arbitraryShell:false/);
  assert.doesNotMatch(hybrid, /'shell\./);
});

test('scheduler uses online freshness, capability, group, load and concurrency', () => {
  assert.match(hybrid, /ONLINE_MS = 90 \* 1000/);
  assert.match(hybrid, /nodeSupports\(node, job\)/);
  assert.match(hybrid, /safeGroup\(node\.device_group\)/);
  assert.match(hybrid, /current_load/);
  assert.match(hybrid, /active >= Math\.max\(1, Number\(node\.max_concurrency\)/);
});

test('lease expiry and failures requeue work and avoid the previous node when alternatives exist', () => {
  assert.match(hybrid, /lease_expired/);
  assert.match(hybrid, /last_device_id=assigned_device_id/);
  assert.match(hybrid, /candidates\.filter\(node => node\.device_id !== job\.last_device_id\)/);
  assert.match(hybrid, /status='pending'/);
});

test('legacy agent bridge only falls back to hybrid work when the existing queue is empty', () => {
  assert.match(mission, /handleDeviceControl\(request, env\)/);
  assert.match(mission, /if \(!body\?\.command\)/);
  assert.match(mission, /claimHybridFallback\(request, env\)/);
  assert.match(mission, /hyb_\[\^\/\]\+/);
  assert.match(mission, /handleHybridAgentResult/);
});

test('admin control exposes node policy, execution records and audit state without enabling nodes automatically', () => {
  assert.match(admin, /새 기기의 자동 실행은 기본 OFF/);
  assert.match(admin, /data-auto/);
  assert.match(admin, /maxConcurrency/);
  assert.match(admin, /기기 관리 · 실행 기록/);
  assert.match(admin, /감사 이벤트/);
  assert.match(admin, /hybridStatusFilter/);
  assert.match(admin, /전체 진단 자동배정/);
});

test('production postbuild bundles hybrid admin into the demand-loaded Device Control asset', () => {
  assert.match(postbuild, /hybrid-execution-admin\.js/);
  assert.match(postbuild, /const hybridExecutionJs/);
  assert.match(postbuild, /device-control-admin\.js/);
  assert.match(postbuild, /\$\{deviceJs\}\\n\$\{hybridExecutionJs\}\\n/);
});

test('migration creates durable node, job and event ledgers with queue indexes', () => {
  for (const table of ['hybrid_execution_nodes','hybrid_execution_jobs','hybrid_execution_events']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /idx_hybrid_jobs_queue/);
  assert.match(migration, /idx_hybrid_jobs_device/);
  assert.match(migration, /idx_hybrid_events_job/);
});