import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const files = [
  'system-health-control.js',
  'system-health-admin.js',
  'scripts/collect-system-health.mjs'
];

test('System Health JavaScript parses without an extra chart dependency', async () => {
  for (const file of files) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
  const admin = await readFile('system-health-admin.js', 'utf8');
  assert.doesNotMatch(admin, /chart\.js|recharts|echarts|d3\./i);
  assert.match(admin, /createElementNS\('http:\/\/www\.w3\.org\/2000\/svg'/);
});

test('System Health persists aggregate rows only and never raw request identity', async () => {
  const migration = await readFile('migrations/0028_system_usage_daily.sql', 'utf8');
  assert.match(migration, /system_usage_daily/);
  assert.doesNotMatch(migration, /client_ip|request_path|user_agent|raw_log/i);
});

test('System Health collector is daily and not on the public request path', async () => {
  const workflow = await readFile('.github/workflows/system-health-analytics.yml', 'utf8');
  const entry = await readFile('mission-control-entry-worker.js', 'utf8');
  assert.match(workflow, /cron: '20 0 \* \* \*'/);
  assert.match(entry, /path === '\/api\/control\/system-health'/);
  assert.doesNotMatch(entry, /collect-system-health/);
});

test('System Health is bundled after authentication into an existing admin asset', async () => {
  const build = await readFile('scripts/build.mjs', 'utf8');
  assert.match(build, /system-health-admin\.css/);
  assert.match(build, /system-health-admin\.js/);
  assert.match(build, /release-control-admin\.js/);
});
