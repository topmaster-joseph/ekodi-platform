import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [loader, layout, handoff, finance, billing, build, postbuild] = await Promise.all([
  read('admin-demand-loader.js'), read('admin-menu-layout.js'), read('admin-central-handoff.js'),
  read('finance-monitor.js'), read('author-billing-admin.js'), read('scripts/build.mjs'),
  read('scripts/admin-performance-postbuild.mjs')
]);

test('heavy Admin features are explicit demand-loaded capabilities', () => {
  for (const section of ['clients', 'books', 'affiliates', 'health', 'storage']) {
    assert.match(loader, new RegExp(`${section}:\\s*\\{`));
  }
  assert.match(loader, /for \(const src of feature\.scripts \|\| \[\]\) await loadScript\(src\)/);
  assert.match(loader, /scheduleSecondary/);
});

test('shared navigation remains event-driven instead of rebuilding a legacy control center', () => {
  assert.match(layout, /ekodi-admin-section-changed/);
  assert.match(layout, /requestDemand/);
  assert.doesNotMatch(layout, /control-center-features|control-center\.js/);
});
test('Finance and Creator Billing stay off the authentication first path', () => {
  assert.doesNotMatch(handoff, /FINANCE_API|api\/finance\/overview|setInterval/);
  assert.match(finance, /ekodi-finance-overview/);
  assert.doesNotMatch(billing, /api\/finance\/overview|FINANCE_API/);
  assert.match(loader, /loadScript\('finance-monitor\.js'\)/);
  assert.match(loader, /author-billing-admin\.js/);
});

test('Finance keeps bounded freshness while explicit refresh bypasses cache', () => {
  assert.match(finance, /FINANCE_TTL_MS = 60 \* 1000/);
  assert.doesNotMatch(finance, /ECOSYSTEM_TTL_MS|setInterval\(/);
  assert.match(finance, /loadFinance\(true\)/);
  assert.match(finance, /cache:'no-store'/);
});

test('build and postbuild keep heavy features standalone and enforce performance budgets', () => {
  for (const asset of ['author-billing-admin.js', 'books-admin.js', 'client-access.js']) assert.ok(build.includes(`'${asset}'`));
  assert.match(postbuild, /first-path|performance|budget/i);
});
