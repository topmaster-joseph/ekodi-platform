import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import apiWorker from '../api-worker.js';

const [apiSource, bootstrapSource, buildSource, wranglerApi] = await Promise.all([
  readFile(new URL('../api-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../control-center-bootstrap.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.api.toml', import.meta.url), 'utf8')
]);

test('API worker preserves the existing public health endpoint', async () => {
  const response = await apiWorker.fetch(new Request('https://api.example/health'), {
    ENVIRONMENT: 'production',
    ALLOWED_ORIGINS: 'https://admin.ekodi.kr'
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'ekodi-auth-api', version: 3 });
});

test('control endpoints require the D1 operations store', async () => {
  const response = await apiWorker.fetch(new Request('https://api.example/api/control/overview', {
    headers: { origin: 'https://admin.ekodi.kr' }
  }), {
    ENVIRONMENT: 'production',
    ALLOWED_ORIGINS: 'https://admin.ekodi.kr'
  });
  assert.equal(response.status, 503);
});

test('control API exposes monitoring, service settings and history boundaries', () => {
  for (const route of ['/overview', '/check', '/services']) {
    assert.match(apiSource, new RegExp(`CONTROL_PREFIX}\\${route.replace('/', '\\/')}`));
  }
  assert.match(apiSource, /service_checks/);
  assert.match(apiSource, /service_controls/);
  assert.match(apiSource, /VALID_STATES/);
  assert.match(apiSource, /30 \* 86400000/);
});

test('admin monitoring is routed through the canonical API with a worker fallback', () => {
  assert.match(bootstrapSource, /https:\/\/api\.ekodi\.kr/);
  assert.match(bootstrapSource, /legacyMonitorPrefix/);
  assert.match(bootstrapSource, /\/api\/control\/overview/);
  assert.match(bootstrapSource, /\/api\/control\/services/);
  assert.match(bootstrapSource, /\/api\/control\/check/);
  assert.match(bootstrapSource, /ekodi-auth-api\.topmaster-joseph\.workers\.dev/);
});

test('production build ships control center adapter and styles', () => {
  assert.match(buildSource, /'control-center-bootstrap\.js'/);
  assert.match(buildSource, /'control-center\.css'/);
  assert.match(buildSource, /adminHtml\.replace/);
});

test('Cloudflare runs the operations API and scheduled monitoring separately from public sites', () => {
  assert.match(wranglerApi, /main = "api-worker\.js"/);
  assert.match(wranglerApi, /pattern = "api\.ekodi\.kr"/);
  assert.match(wranglerApi, /crons = \["\*\/10 \* \* \* \*"\]/);
});
