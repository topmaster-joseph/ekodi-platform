import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import apiWorker from '../api-worker.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [apiSource, domains, health, loader, wranglerApi, entrySource, missionEntrySource] = await Promise.all([
  read('api-worker.js'), read('domains-hub.js'), read('system-health-admin.js'), read('admin-demand-loader.js'),
  read('wrangler.api.toml'), read('customer-entry-worker.js'), read('mission-control-entry-worker.js')
]);

test('shared API preserves the existing health endpoint', async () => {
  const response = await apiWorker.fetch(new Request('https://api.example/health'), {
    ENVIRONMENT: 'production', ALLOWED_ORIGINS: 'https://admin.ekodi.kr'
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'ekodi-auth-api', version: 4 });
});

test('control endpoints require the D1 operations store', async () => {
  const response = await apiWorker.fetch(new Request('https://api.example/api/control/overview'), {
    ENVIRONMENT: 'production', ALLOWED_ORIGINS: 'https://admin.ekodi.kr'
  });
  assert.equal(response.status, 503);
});
test('control API keeps overview, checks, services, account and history boundaries', () => {
  for (const fragment of ['/overview', '/check', '/cloudflare-accounts', '/services']) assert.ok(apiSource.includes(fragment));
  assert.match(apiSource, /service_controls|service_checks|stats24h|VALID_STATES/);
});

test('current demand-loaded Admin consumers use only canonical control APIs', () => {
  assert.match(domains, /\/api\/control\/overview/);
  assert.match(health, /\/api\/control\//);
  assert.match(loader, /health:\s*\{/);
  assert.doesNotMatch(domains, /raw\.githubusercontent\.com/);
});

test('service URLs stay server-owned rather than browser-editable', () => {
  assert.match(apiSource, /const SERVICE_CATALOG/);
  assert.doesNotMatch(domains, /name=['"]url['"]|service\.url\s*=/);
});

test('Mission Control wrapper preserves the ten-minute monitoring schedule and edge security', () => {
  assert.match(wranglerApi, /main = "mission-control-entry-worker\.js"/);
  assert.match(wranglerApi, /crons = \["\*\/10 \* \* \* \*"\]/);
  assert.match(missionEntrySource, /customerEntryWorker\.scheduled/);
  assert.match(missionEntrySource, /enforceEdgeSecurity/);
  assert.match(entrySource, /apiWorker\.scheduled/);
});
