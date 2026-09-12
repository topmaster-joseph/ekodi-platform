import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import router from '../platform-router-entry-worker.js';

test('Tax canonical surface is served from ekodi.kr/tax', async () => {
  const response=await router.fetch(new Request('https://ekodi.kr/tax'),{},{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'tax-apex');
  const html=await response.text();
  assert.match(html,/EKODI Tax/);
  assert.match(html,/\/tax\/tax-portal\.js/);
  assert.match(html,/https:\/\/ekodi\.kr\/admin\/\?route=finance/);
});

test('Tax assets stay namespaced under the apex path', async () => {
  const response=await router.fetch(new Request('https://ekodi.kr/tax/tax-portal.js'),{},{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'tax-apex');
  assert.match(await response.text(),/https:\/\/ekodi\.kr\/auth\//);
});

test('Tax runtime and release contracts contain no tax subdomain dependency',()=>{
  const files=['admin-menu-registry.js','admin-menu-runtime.js','auth-site/admin-auth.js','finance-monitor.js','platform-router-entry-worker.js','tax-portal-worker.js','wrangler.site.toml','wrangler.finance.toml','wrangler.service-admin-entry.toml','deploy/manifests/shared-site.worker.json','.github/workflows/deploy-site-core.yml','.github/workflows/deploy-finance.yml','scripts/admin-authenticated-e2e-menu-worker.mjs','scripts/admin-authenticated-e2e.mjs','scripts/admin-authenticated-tax-surface-e2e.mjs','test/admin-tax-http2-fallback.test.mjs'];
  for(const file of files)assert.equal(fs.readFileSync(file,'utf8').includes('tax.ekodi.kr'),false,file);
});