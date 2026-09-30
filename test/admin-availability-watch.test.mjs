import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/admin-availability-watch.yml', import.meta.url), 'utf8');

test('admin availability watch remains frequent but quota-aware', () => {
  assert.match(workflow, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow, /cloudflare-production-budget\.mjs/);
  assert.match(workflow, /post-deploy-canary\.mjs --scope=admin-monitor/);
  assert.match(workflow, /EKODI_CF_QUOTA_STATE/);
  assert.doesNotMatch(workflow, /probe_redirect/);
  assert.doesNotMatch(workflow, /for attempt in 1 2 3/);
});

test('watch validates canonical Cloudflare attachment without generating user traffic', () => {
  assert.match(workflow, /workers\/domains\?service=shy-thunder-39a4/);
  assert.match(workflow, /hostname == "ekodi\.kr"/);
  assert.match(workflow, /Canonical ekodi\.kr Worker attachment verified through Cloudflare API/);
  assert.doesNotMatch(workflow, /cloudflare-dns\.com\/dns-query/);
  assert.doesNotMatch(workflow, /dns\.google\/resolve/);
});

test('quota warning and protection state become durable operational evidence', () => {
  assert.match(workflow, /Cloudflare Production quota guard alert/);
  assert.match(workflow, /steps\.quota\.outputs\.state != 'normal'/);
  assert.match(workflow, /steps\.quota\.outputs\.skip_nonessential/);
  assert.match(workflow, /gh issue list --state open/);
  assert.match(workflow, /gh issue comment/);
  assert.match(workflow, /gh issue create/);
  assert.match(workflow, /gh issue close/);
});

test('availability incident never adds a second production probe after circuit break', () => {
  assert.match(workflow, /Admin availability incident: canonical EKODI Admin/);
  assert.match(workflow, /circuit open: \$\{\{ steps\.canary\.outputs\.circuit_open \}\}/);
  assert.match(workflow, /deliberately performs no follow-up curl after 429\/Error 1027/);
  const incidentBlock = workflow.split('Open or update Admin availability incident without extra probes')[1] || '';
  assert.doesNotMatch(incidentBlock, /curl .*https:\/\/ekodi\.kr/);
});
