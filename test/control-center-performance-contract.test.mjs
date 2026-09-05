import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [loader, layout, handoff, finance, billing, build, mission, hybrid, cheonggye, sharedDeploy] = await Promise.all([
  readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-central-handoff.js', import.meta.url), 'utf8'),
  readFile(new URL('../finance-monitor.js', import.meta.url), 'utf8'),
  readFile(new URL('../author-billing-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../mission-control-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../hybrid-execution-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../cheonggye-members-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8'),
]);

test('heavy Admin features are demand-loaded rather than added to the first-path shell', () => {
  for (const asset of ['client-access.js','books-admin.js','community-reports-admin.js','social-admin.js']) assert.ok(loader.includes(asset));
  assert.match(loader, /async function activateFeature/);
  assert.ok(loader.includes('for (const src of feature.scripts || []) await loadScript(src)'));
  assert.ok(loader.includes('const real = await waitFor(feature.real)'));
});

test('Admin navigation is event-driven and any observer used for lazy handoff is transient', () => {
  assert.match(layout, /ekodi-feature-installed/);
  assert.doesNotMatch(layout, /new MutationObserver/);
  assert.match(loader, /const observer = new MutationObserver/);
  assert.match(loader, /observer.disconnect()/);
});

test('Finance and Creator Billing stay off the first path and load independently', () => {
  assert.ok(!handoff.includes('FINANCE_API') && !handoff.includes('api/finance/overview') && !handoff.includes('ekodi-finance-overview'));
  assert.doesNotMatch(handoff, /setInterval/);
  assert.ok(finance.includes("new CustomEvent('ekodi-finance-overview'"));
  assert.ok(!billing.includes('ekodi-finance-overview') && !billing.includes('api/finance/overview') && !billing.includes('FINANCE_API'));
  assert.match(billing, /#booksAdminSection/);
  assert.ok(loader.includes("loadScript('finance-monitor.js')"));
  assert.ok(loader.includes("loadScript('author-billing-admin.js')"));
});

test('Finance keeps a short in-memory freshness window while explicit refresh bypasses it', () => {
  assert.ok(finance.includes('FINANCE_TTL_MS = 60 * 1000'));
  assert.ok(!finance.includes('ECOSYSTEM_TTL_MS') && !finance.includes('setInterval('));
  assert.ok(finance.includes('loadFinance(true)'));
  assert.ok(finance.includes('loadFinance(false)'));
  assert.match(finance, /cache:'no-store'/);
});

test('Admin live surfaces avoid hidden-tab polling and coalesce slow refreshes', () => {
  assert.ok(mission.includes('OVERVIEW_TTL_MS = 5 * 60 * 1000'));
  assert.ok(mission.includes("document.visibilityState === 'visible'"));
  assert.ok(mission.includes('refreshPromise'));
  assert.doesNotMatch(mission, /30_000/);
  assert.ok(hybrid.includes('HYBRID_REFRESH_MS = 30 * 1000'));
  assert.ok(hybrid.includes("document.visibilityState === 'visible'"));
  assert.ok(hybrid.includes('loadPromise'));
  assert.ok(cheonggye.includes('POLL_MS = 60 * 1000'));
  for (const asset of ['device-control-admin.js','hybrid-execution-admin.js','mission-control-admin.js','cheonggye-members-admin.js']) assert.ok(sharedDeploy.includes(`- '${asset}'`));
});

test('Shared Site release is triggered and syntax-checks Clients assets', () => {
  assert.ok(sharedDeploy.includes("- 'client-access.js'"));
  assert.ok(sharedDeploy.includes("- 'client-access.css'"));
  assert.match(sharedDeploy, /admin-public-site-controls\.js client-access\.js [^\r\n]*ai-ops-admin\.js/);
});

test('production build ships optional modules as standalone assets and retired loaders stay removed', () => {
  for (const asset of ['admin-demand-loader.js','author-billing-admin.js','client-access.js','books-admin.js','finance-monitor.js']) assert.ok(build.includes(`'${asset}'`));
  assert.doesNotMatch(build, /'control-center-features\.js'/);
});
