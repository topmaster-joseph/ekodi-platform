import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Health renders real fleet latency graphics even without traffic aggregates', async () => {
  const [admin, css] = await Promise.all([
    read('system-health-admin.js'),
    read('system-health-admin.css'),
  ]);
  assert.match(admin, /data-core-latency-chart/);
  assert.match(admin, /core-health-latency-row/);
  assert.match(admin, /service\.responseTime \?\? service\.latest\?\.responseTime/);
  assert.match(admin, /트래픽 집계 연결 대기/);
  assert.match(css, /\.core-health-latency-fill/);
  assert.match(css, /\.system-health-chart-empty-grid/);
  assert.doesNotMatch(admin, /setInterval\(/);
});

test('collector records a readable analytics permission failure before exiting', async () => {
  const [collector, workflow] = await Promise.all([
    read('scripts/collect-system-health.mjs'),
    read('.github/workflows/system-health-analytics.yml'),
  ]);
  assert.match(collector, /Cloudflare Analytics Read 권한이 없어 트래픽 집계를 수집하지 못했습니다/);
  assert.match(workflow, /set \+e[\s\S]*node scripts\/collect-system-health\.mjs[\s\S]*collector_status=\$\?[\s\S]*set -e/);
  assert.match(workflow, /wrangler@4\.119\.0 d1 execute ekodi-auth/);
});
