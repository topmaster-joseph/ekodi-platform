import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [features, compact, handoff, finance, billing, loader, build] = await Promise.all([
  readFile(new URL('../control-center-features.js', import.meta.url), 'utf8'),
  readFile(new URL('../compact-control-center.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-central-handoff.js', import.meta.url), 'utf8'),
  readFile(new URL('../finance-monitor.js', import.meta.url), 'utf8'),
  readFile(new URL('../author-billing-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
]);

test('heavy Control Center features are click-loaded rather than idle-preloaded', () => {
  assert.doesNotMatch(features, /requestIdleCallback/);
  assert.doesNotMatch(features, /loadIdleQueue/);
  assert.doesNotMatch(features, /queue\.push\(loadClients\)/);
  assert.match(features, /import\(`\.\/\$\{src\}`\)/);
  for (const section of ['clients', 'admins', 'affiliates']) {
    assert.match(features, new RegExp(`placeholder\\('${section}'`));
  }
  assert.match(features, /installStaticBooksNavigation/);
  assert.match(features, /await loadBooks\(\)/);
  assert.match(features, /loadModule\('books-admin\.js'\)/);
  assert.match(features, /loadModule\('books-finance-admin\.js'\)/);
  assert.match(features, /loadFinance\(\)\.catch/);
});

test('dynamic navigation stays event-driven and the simple Campus table needs no observer', () => {
  assert.match(compact, /ekodi-feature-installed/);
  assert.match(features, /ekodi-feature-installed/);
  assert.doesNotMatch(compact, /new MutationObserver/);
  assert.match(compact, /campusServiceRows/);
  assert.match(compact, /campusServiceRow/);
});

test('payment readiness stays off the first path and reuses the Finance overview response', () => {
  assert.doesNotMatch(handoff, /FINANCE_API|api\/finance\/overview|ekodi-finance-overview/);
  assert.doesNotMatch(handoff, /setInterval/);
  assert.match(finance, /new CustomEvent\('ekodi-finance-overview'/);
  assert.match(billing, /window\.addEventListener\('ekodi-finance-overview'/);
  assert.match(loader, /await loadScript\('author-billing-admin\.js'\);\s*\n\s*await loadScript\('finance-monitor\.js'\);/);
  assert.doesNotMatch(billing, /api\/finance\/overview|FINANCE_API/);
});

test('Finance keeps a short in-memory freshness window while explicit refresh bypasses it', () => {
  assert.match(finance, /FINANCE_TTL_MS = 60 \* 1000/);
  assert.match(finance, /ECOSYSTEM_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(finance, /loadFinance\(true\)/);
  assert.match(finance, /loadFinance\(false\)/);
  assert.match(finance, /cache: 'default'/);
});

test('production build still ships optional modules as standalone assets rather than eager scripts', () => {
  assert.match(build, /'control-center-features\.js'/);
  assert.match(build, /'author-billing-admin\.js'/);
  assert.doesNotMatch(build, /<script src="client-access\.js" defer><\/script>/);
  assert.doesNotMatch(build, /<script src="books-admin\.js" defer><\/script>/);
  assert.doesNotMatch(build, /<script src="finance-monitor\.js" defer><\/script>/);
  assert.doesNotMatch(build, /<script src="author-billing-admin\.js" defer><\/script>/);
});
