import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiWorker = await readFile(new URL('../api-worker.js', import.meta.url), 'utf8');
const siteWorker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');

const criticalClients = [
  ['client-cgma', 'cgma.ekodi.kr', '청계면상인회'],
  ['client-jadam', 'jadam.ekodi.kr', '자담치킨 목포대점'],
  ['client-pizzamaru', 'pizzamaru.ekodi.kr', '피자마루 목포대점'],
  ['client-yogurt', 'yogurt.ekodi.kr', '요거트퍼플 목포대점'],
];

test('revenue-critical external clients stay active and monitored', () => {
  for (const [id, domain, name] of criticalClients) {
    const row = apiWorker.split('\n').find(line => line.includes(`id: '${id}'`));
    assert.ok(row, `${id} must exist in SERVICE_CATALOG`);
    assert.match(row, new RegExp(`domain: '${domain.replaceAll('.', '\\.')}'`));
    assert.ok(row.includes("group: 'client'"), `${name} must remain an external client`);
    assert.ok(row.includes("defaultState: 'active'"), `${name} must remain active`);
    assert.ok(row.includes('defaultMonitor: true'), `${name} must remain monitored`);
  }
});

test('EKODI-owned brands are never classified as external clients', () => {
  const internalIds = ['biz', 'trade', 'mall', 'pay', 'books', 'lab', 'edu', 'media', 'church', 'mission', 'community'];
  for (const id of internalIds) {
    const row = apiWorker.split('\n').find(line => line.includes(`id: '${id}'`));
    assert.ok(row, `${id} must exist in SERVICE_CATALOG`);
    assert.ok(!row.includes("group: 'client'"), `${id} must not be classified as an external client`);
  }
});

test('short canonical client domains are preserved', () => {
  for (const [, domain] of criticalClients) {
    assert.ok(!domain.includes('.marketing.ekodi.kr'), `${domain} must stay short`);
    assert.equal(domain.split('.').length, 3, `${domain} must be a first-level EKODI subdomain`);
  }
});

test('admin worker never reintroduces the static-assets redirect loop', () => {
  assert.ok(siteWorker.includes("assetRequest(request, '/control-center')"));
  assert.ok(siteWorker.includes("assetRequest(request, '/admin')"));
  assert.ok(!siteWorker.includes("assetRequest(request, '/control-center.html')"));
  assert.ok(!siteWorker.includes("assetRequest(request, '/admin.html')"));
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
