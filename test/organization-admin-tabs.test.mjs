import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { tenantAdminMetricsTabsMarkupFor, mountTenantAdminMetricsTabs } from '../tenant-admin-metrics-tabs.js';
import { organizationAdminPage, organizationAdminCss, organizationAdminScript, ORGANIZATION_ADMIN_TENANTS } from '../organization-admin-page.js';
import { churchPastorAdminPage, churchPastorAdminScript } from '../church-pastor-admin-page.js';
import { storeAdminPage, storeAdminScript } from '../store-admin-engine.js';

test('each organization-scoped admin has work-first tab with optional metrics', async () => {
  const markup = tenantAdminMetricsTabsMarkupFor('cards','panel');
  assert.match(markup, /aria-controls="cards"/);
  assert.match(markup, /aria-controls="panel"/);
  for (const tenant of ORGANIZATION_ADMIN_TENANTS) {
    const html = await organizationAdminPage(tenant.base + '/admin').text();
    assert.ok(html.includes(markup), tenant.slug);
    assert.match(html, /id="cards"[^>]*hidden/);
    assert.match(html, /id="panel"[^>]*role="tabpanel"/);
  }
  const css = await organizationAdminCss().text();
  assert.match(css, /\.oa-main > #cards\[hidden\]/);
  assert.match(css, /\.oa-head \.oa-state\{display:none/);
  const script = await organizationAdminScript().text();
  assert.match(script, /mountTenantAdminMetricsTabs/);
  assert.doesNotThrow(() => new vm.Script(script));
});

test('shared helper remains backward-compatible for church and store admin scripts', async () => {
  const church = await churchPastorAdminPage().text();
  const store = await storeAdminPage({slug:'jadam',name:'자담치킨'}).text();
  assert.match(church, /aria-controls="summaryCards"/);
  assert.match(store, /aria-controls="summaryCards"/);
  const churchScript = await churchPastorAdminScript().text();
  const storeScript = await storeAdminScript().text();
  assert.doesNotThrow(() => new vm.Script(churchScript));
  assert.doesNotThrow(() => new vm.Script(storeScript));
  assert.match(mountTenantAdminMetricsTabs.toString(), /metricsId = 'summaryCards'/);
});
