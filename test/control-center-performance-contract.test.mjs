import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [features, compact, handoff, finance, build] = await Promise.all([
  readFile(new URL('../control-center-features.js', import.meta.url), 'utf8'),
  readFile(new URL('../compact-control-center.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-central-handoff.js', import.meta.url), 'utf8'),
  readFile(new URL('../finance-monitor.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
]);

test('heavy Control Center features are click-loaded rather than idle-preloaded', () => {
  assert.doesNotMatch(features, /requestIdleCallback/);
  assert.doesNotMatch(features, /loadIdleQueue/);
  assert.doesNotMatch(features, /queue\.push\(loadClients\)/);
  assert.match(features, /import\(`\.\/\$\{src\}`\)/);
  for (const section of ['clients', 'admins', 'books', 'affiliates']) {
    assert.match(features, new RegExp(`placeholder\\('${section}'`));
  }
  assert.match(features, /loadFinance\(\)\.catch/);
});

test('dynamic navigation uses explicit feature events instead of a standing MutationObserver', () => {
  assert.doesNotMatch(compact, /new MutationObserver/);
  assert.match(compact, /ekodi-feature-installed/);
  assert.match(features, /ekodi-feature-installed/);
});

test('payment readiness reuses the Finance overview response instead of refetching it', () => {
  assert.doesNotMatch(handoff, /FINANCE_API/);
  assert.doesNotMatch(handoff, /api\/finance\/overview/);
  assert.doesNotMatch(handoff, /setInterval/);
  assert.match(handoff, /ekodi-finance-overview/);
  assert.match(finance, /new CustomEvent\('ekodi-finance-overview'/);
});

test('Finance keeps a short in-memory freshness window while explicit refresh bypasses it', () => {
  assert.match(finance, /FINANCE_TTL_MS = 60 \* 1000/);
  assert.match(finance, /ECOSYSTEM_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(finance, /loadFinance\(true\)/);
  assert.match(finance, /loadFinance\(false\)/);
  assert.match(finance, /cache: 'default'/);
});

test('production build still ships only the lightweight feature loader eagerly', () => {
  assert.match(build, /'control-center-features\.js'/);
  assert.doesNotMatch(build, /<script src="client-access\.js" defer><\/script>/);
  assert.doesNotMatch(build, /<script src="books-admin\.js" defer><\/script>/);
  assert.doesNotMatch(build, /<script src="finance-monitor\.js" defer><\/script>/);
});
