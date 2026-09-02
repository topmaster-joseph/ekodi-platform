import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiWorker = await readFile(new URL('../api-worker.js', import.meta.url), 'utf8');
const siteWorker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');

test('EKODI-owned brands are never classified as external clients', () => {
  const internalIds = ['biz', 'trade', 'mall', 'pay', 'books', 'lab', 'edu', 'media', 'church', 'community', 'social'];
  for (const id of internalIds) {
    const row = apiWorker.split('\n').find(line => line.includes(`id: '${id}'`));
    assert.ok(row, `${id} must exist in SERVICE_CATALOG`);
    assert.ok(!row.includes("group: 'client'"), `${id} must not be classified as an external client`);
  }
  assert.ok(!apiWorker.split('\n').some(line => line.includes("id: 'mission'")), 'retired mission service must not reappear in SERVICE_CATALOG');
  assert.ok(!apiWorker.includes('에코디선교회'), 'retired formal mission organization label must not reappear in Control API source');
});

test('admin worker retires legacy entry paths and serves only the canonical Admin shell', () => {
  assert.match(siteWorker, /RETIRED_ADMIN_PATHS[\s\S]*'\/control-center'/);
  assert.match(siteWorker, /if \(RETIRED_ADMIN_PATHS\.has\(url\.pathname\)\) return retiredAdminResponse\(\)/);
  assert.match(siteWorker, /assetRequest\(request, '\/admin-shell'\)/);
  assert.doesNotMatch(siteWorker, /assetRequest\(request, '\/control-center\.html'\)|assetRequest\(request, '\/admin\.html'\)/);
  assert.ok(siteWorker.includes("'X-EKODI-Route', routeName"));
});

test('admin security headers remain part of the routing contract', () => {
  for (const directive of [
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ]) {
    assert.ok(siteWorker.includes(directive), `missing CSP directive: ${directive}`);
  }
});

test('Campus action assets are served through the secured version-aware admin asset route', () => {
  assert.ok(siteWorker.includes("'/campus-actions.js'"));
  assert.ok(siteWorker.includes("'/campus-actions.css'"));
  assert.match(siteWorker, /function adminAssetCacheControl\(url\)/);
  assert.match(siteWorker, /ADMIN_ASSETS[\s\S]*withHostSecurity\(response, ADMIN_CSP, adminAssetCacheControl\(url\), 'admin-asset'\)/);
});
