import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import apiWorker from '../api-worker.js';

const [apiSource, aiOps, domains, buildScript, wranglerApi, entrySource, missionEntrySource] = await Promise.all([
  readFile(new URL('../api-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../ai-ops-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../domains-hub.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.api.toml', import.meta.url), 'utf8'),
  readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8')
]);

test('shared API preserves the existing health endpoint', async () => {
  const response = await apiWorker.fetch(new Request('https://api.example/health'), { ENVIRONMENT:'production', ALLOWED_ORIGINS:'https://admin.ekodi.kr' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok:true, service:'ekodi-auth-api', version:4 });
});

test('control endpoints require the D1 operations store', async () => {
  const response = await apiWorker.fetch(new Request('https://api.example/api/control/overview'), { ENVIRONMENT:'production', ALLOWED_ORIGINS:'https://admin.ekodi.kr' });
  assert.equal(response.status, 503);
});

test('control API defines health, service, Cloudflare and history boundaries', () => {
  for (const marker of [
    "path === `${CONTROL_PREFIX}/overview`", "path === `${CONTROL_PREFIX}/check`",
    "path === `${CONTROL_PREFIX}/cloudflare-accounts`", "path === `${CONTROL_PREFIX}/cloudflare-accounts/check`",
    'service_controls', 'service_checks', 'stats24h', 'VALID_STATES'
  ]) assert.ok(apiSource.includes(marker), `missing control API marker: ${marker}`);
  assert.match(apiSource, /\/history\$/);
});

test('current Admin consumers use the canonical operations API', () => {
  assert.ok(aiOps.includes('/api/control/check') && aiOps.includes('/api/control/overview'));
  assert.ok(domains.includes('/api/control/overview'));
  assert.doesNotMatch(aiOps, /raw\.githubusercontent\.com/);
});

test('service URLs stay server-authoritative rather than browser editable', () => {
  assert.match(apiSource, /SERVICE_CATALOG/);
  assert.doesNotMatch(aiOps, /name=['"]url['"]/);
  assert.doesNotMatch(domains, /method:s*['"]PUT['"]/);
});

test('production build ships current operations surfaces', () => {
  for (const asset of ['ai-ops-admin.js','domains-hub.js','system-health-admin.js']) assert.ok(buildScript.includes(`'${asset}'`));
  assert.doesNotMatch(buildScript, /'control-center-features\.js'/);
});

test('Mission Control security wrapper preserves the ten-minute monitoring schedule', () => {
  assert.match(wranglerApi, /main = "mission-control-entry-worker\.js"/);
  assert.match(wranglerApi, /pattern = "api\.ekodi\.kr"/);
  assert.match(wranglerApi, /crons = \["\*\/10 \* \* \* \*"\]/);
  assert.match(missionEntrySource, /customerEntryWorker\.scheduled/);
  assert.match(missionEntrySource, /applyApiSecurityHeaders/);
  assert.match(missionEntrySource, /enforceEdgeSecurity/);
  assert.match(entrySource, /apiWorker\.scheduled/);
  assert.match(entrySource, /apiWorker\.fetch/);
});
