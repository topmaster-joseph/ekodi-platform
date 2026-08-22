import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiWorker = await readFile(new URL('../api-worker.js', import.meta.url), 'utf8');
const siteWorker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
const workspacePolicy = JSON.parse(await readFile(new URL('../config/service-workspace-policy.json', import.meta.url), 'utf8'));

const criticalClients = [
  ['client-cgma', 'cgma.ekodi.kr', '청계면상인회'],
  ['client-jadam', 'jadam.ekodi.kr', '자담치킨 목포대점'],
  ['client-pizzamaru', 'pizzamaru.ekodi.kr', '피자마루 목포대점'],
  ['client-yogurt', 'yogurt.ekodi.kr', '요거트퍼플 목포대점'],
];

test('revenue-critical external clients remain customer workspaces, not provider services', () => {
  assert.equal(workspacePolicy.customerWorkspaceRule.managedBy, 'customer_tenant_directory');
  assert.equal(workspacePolicy.customerWorkspaceRule.preserveCustomerOwnership, true);
  for (const [id, , name] of criticalClients) {
    const row = apiWorker.split('\n').find(line => line.includes(`id: '${id}'`));
    assert.equal(row, undefined, `${name} must not exist in provider SERVICE_CATALOG`);
    assert.ok(workspacePolicy.customerWorkspaceRule.examples.includes(name), `${name} must remain represented by the customer Workspace policy`);
  }
});

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

test('short canonical client domains are preserved as customer-facing workspace addresses', () => {
  for (const [, domain] of criticalClients) {
    assert.ok(!domain.includes('.marketing.ekodi.kr'), `${domain} must stay short`);
    assert.equal(domain.split('.').length, 3, `${domain} must be a first-level EKODI subdomain`);
  }
});

test('admin worker never reintroduces the static-assets redirect loop', () => {
  assert.ok(siteWorker.includes("assetRequest(request, '/control-center')"));
  assert.ok(!siteWorker.includes("assetRequest(request, '/control-center.html')"));
  assert.ok(!siteWorker.includes("assetRequest(request, '/admin.html')"));
  assert.match(siteWorker, /LEGACY_ALIASES[\s\S]*assetRequest\(request, '\/control-center'\)/);
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
