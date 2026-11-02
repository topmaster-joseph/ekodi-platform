import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { tenantAdminMetricsTabsMarkup, tenantAdminMetricsTabsCss, mountTenantAdminMetricsTabs } from '../tenant-admin-metrics-tabs.js';
import { churchPastorAdminPage, churchPastorAdminScript } from '../church-pastor-admin-page.js';
import { storeAdminPage, storeAdminCss, storeAdminScript } from '../store-admin-engine.js';

test('church and store have the same opt-in view tabs with live metrics protected by existing session', async () => {
  const routes = [
    ['church', await churchPastorAdminPage().text(), await churchPastorAdminScript().text()],
    ['store', await storeAdminPage({ slug: 'jadam', name: '자담치킨' }).text(), await storeAdminScript().text()],
  ];
  for (const [name, html, script] of routes) {
    assert.ok(html.includes(tenantAdminMetricsTabsMarkup), name);
    assert.match(html, /id="summaryCards"[^>]*role="tabpanel"[^>]*hidden/);
    assert.match(html, /id="mainPanel"[^>]*role="tabpanel"/);
    assert.ok(script.includes('function mountTenantAdminMetricsTabs'), name);
    assert.doesNotThrow(() => new vm.Script(script, { filename: name + '.js' }));
  }
  const css = await storeAdminCss().text();
  assert.ok(css.includes(tenantAdminMetricsTabsCss));
  assert.match(css, /#summaryCards\[hidden\]/);
  assert.match(css, /@media\(max-width:700px\)/);
});

test('tab state is addressable, keyboard accessible, reversible, and no requests are added', () => {
  let currentHref = 'https://ekodi.kr/ekodichurch/admin/people?adminView=metrics';
  const callbacks = {};
  const buttons = ['work', 'metrics'].map(view => ({
    dataset: { adminView: view },
    classList: { toggle() {} },
    setAttribute(key, val) { this[key] = val; },
    addEventListener(name, cb) { this[name + 'Handler'] = cb; },
    focus() { doc.activeElement = this; },
    click() { this.clickHandler(); },
  }));
  const nav = {
    dataset: {},
    querySelectorAll() { return buttons; },
    addEventListener(name, cb) { callbacks[name] = cb; },
  };
  const metrics = { hidden: true }, work = { hidden: false };
  const doc = {
    activeElement: null,
    querySelector() { return nav; },
    getElementById(id) { return id === 'summaryCards' ? metrics : work; },
  };
  const location = { get href() { return currentHref; } };
  const history = { state: {}, replaceState(_state, _unused, path) { currentHref = new URL(path, currentHref).href; } };
  const window = { addEventListener(name, callback) { callbacks[name] = callback; } };
  const fn = vm.runInNewContext('(' + mountTenantAdminMetricsTabs.toString() + ')', { document: doc, location, history, window, URL });
  fn();
  assert.equal(metrics.hidden, false);
  assert.equal(work.hidden, true);
  assert.equal(buttons[1]['aria-selected'], 'true');
  buttons[0].click();
  assert.equal(metrics.hidden, true);
  assert.equal(work.hidden, false);
  assert.equal(new URL(currentHref).searchParams.has('adminView'), false);
  doc.activeElement = buttons[0];
  callbacks.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(metrics.hidden, false);
  assert.equal(buttons[1].tabIndex, 0);
  assert.equal(new URL(currentHref).searchParams.get('adminView'), 'metrics');
  fn();
  assert.equal(nav.dataset.boundMetricsTabs, 'true');
});
