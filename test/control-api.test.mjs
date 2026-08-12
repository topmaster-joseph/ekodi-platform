import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import apiWorker from '../api-worker.js';

const [apiSource, controlHtml, controlJs, buildScript, wranglerApi] = await Promise.all([
  readFile(new URL('../api-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../control-center.html', import.meta.url), 'utf8'),
  readFile(new URL('../control-center.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.api.toml', import.meta.url), 'utf8')
]);

test('shared API preserves the existing health endpoint', async () => {
  const response = await apiWorker.fetch(new Request('https://api.example/health'), {
    ENVIRONMENT: 'production',
    ALLOWED_ORIGINS: 'https://admin.ekodi.kr'
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'ekodi-auth-api', version: 3 });
});

test('control endpoints require the D1 operations store', async () => {
  const response = await apiWorker.fetch(new Request('https://api.example/api/control/overview'), {
    ENVIRONMENT: 'production',
    ALLOWED_ORIGINS: 'https://admin.ekodi.kr'
  });
  assert.equal(response.status, 503);
});

test('control API defines health, statistics, settings and history boundaries', () => {
  assert.ok(apiSource.includes("path === `${CONTROL_PREFIX}/overview`"));
  assert.ok(apiSource.includes("path === `${CONTROL_PREFIX}/check`"));
  assert.ok(apiSource.includes("path === `${CONTROL_PREFIX}/services`"));
  assert.match(apiSource, /service_controls/);
  assert.match(apiSource, /service_checks/);
  assert.match(apiSource, /stats24h/);
  assert.match(apiSource, /\/history\$/);
  assert.match(apiSource, /VALID_STATES/);
});

test('Control Center consumes only the canonical operations API for service controls', () => {
  assert.match(controlHtml, /id="serviceControlGrid"/);
  assert.match(controlHtml, /id="runHealthCheck"/);
  assert.match(controlJs, /\/api\/control\/overview/);
  assert.match(controlJs, /\/api\/control\/check/);
  assert.match(controlJs, /\/api\/control\/services\//);
  assert.doesNotMatch(controlJs, /raw\.githubusercontent\.com/);
});

test('service URLs are fixed server-side rather than editable through the browser', () => {
  assert.match(apiSource, /const SERVICE_CATALOG/);
  assert.doesNotMatch(controlJs, /name=['"]url['"]/);
  assert.doesNotMatch(controlJs, /service\.url\s*=/);
});

test('production build includes operations styling', () => {
  assert.match(buildScript, /'control-center-ops\.css'/);
});

test('Cloudflare API worker owns the ten-minute monitoring schedule', () => {
  assert.match(wranglerApi, /main = "api-worker\.js"/);
  assert.match(wranglerApi, /pattern = "api\.ekodi\.kr"/);
  assert.match(wranglerApi, /crons = \["\*\/10 \* \* \* \*"\]/);
});
