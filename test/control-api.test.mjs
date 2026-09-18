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
  assert.deepEqual(await response.json(), { ok:true, service:'ekodi-auth-api', version:4, personalFinanceBindingConfigured:false });
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


test('Control API exposes a provider-neutral Personal Finance binding health probe', async () => {
  const missing = await apiWorker.fetch(new Request('https://api.example/api/health/personal-finance'), {});
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, 'PERSONAL_FINANCE_BINDING_UNAVAILABLE');

  const env = {
    PERSONAL_FINANCE: {
      async fetch(request) {
        assert.equal(new URL(request.url).pathname, '/health');
        return new Response(JSON.stringify({
          ok:true,
          service:'ekodi-personal-finance-api',
          dataBoundary:'dedicated-d1',
          actionCeiling:'L2',
          adminControl:true,
          personalDataAdminReadable:false,
        }), { status:200, headers:{'content-type':'application/json'} });
      }
    }
  };
  const response = await apiWorker.fetch(new Request('https://api.example/api/health/personal-finance'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-ekodi-personal-finance-proxy'), 'control-service-binding-v1');
  const data = await response.json();
  assert.equal(data.binding, 'PERSONAL_FINANCE');
  assert.equal(data.personalDataAdminReadable, false);
});

test('canonical Control API owns the Personal Finance admin proxy through a service binding', () => {
  assert.match(apiSource, /path === `\$\{CONTROL_PREFIX\}\/personal-finance`/);
  assert.match(apiSource, /proxyPersonalFinanceControl\(request, env\)/);
  assert.match(apiSource, /env\.PERSONAL_FINANCE\?\.fetch/);
  assert.match(apiSource, /target\.pathname = '\/api\/admin\/personal-finance\/control'/);
  assert.match(apiSource, /X-EKODI-Personal-Finance-Proxy/);
  assert.match(wranglerApi, /\[\[services\]\][\s\S]*binding = "PERSONAL_FINANCE"[\s\S]*service = "ekodi-personal-finance-api"/);
});


test('health reports the Personal Finance service binding without exposing finance data', async () => {
  const response = await apiWorker.fetch(new Request('https://api.example/health'), {
    PERSONAL_FINANCE:{ fetch:async()=>new Response('{}') }
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.personalFinanceBindingConfigured, true);
  assert.equal('accounts' in data, false);
  assert.equal('transactions' in data, false);
  assert.equal('balances' in data, false);
});
