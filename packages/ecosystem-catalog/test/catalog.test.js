import assert from 'node:assert/strict';
import test from 'node:test';
import { EKODI_SERVICES, findServiceByDomain, MANAGED_DNS_SERVICES } from '../src/index.js';

test('catalog defines unique EKODI services', () => {
  assert.equal(EKODI_SERVICES.length, 15);
  assert.equal(new Set(EKODI_SERVICES.map(service => service.id)).size, 15);
  assert.equal(new Set(EKODI_SERVICES.map(service => service.domain)).size, 15);
});

test('only five EKODI domains are managed through Cloudflare DNS', () => {
  assert.equal(MANAGED_DNS_SERVICES.length, 5);
  assert.equal(MANAGED_DNS_SERVICES.every(service => service.url.startsWith('https://')), true);
});

test('domain lookup normalizes input', () => {
  assert.equal(findServiceByDomain(' EKODIMALL.KR ')?.id, 'mall');
  assert.equal(findServiceByDomain('unknown.example'), null);
});

test('platform and ERP are the only private applications', () => {
  assert.deepEqual(EKODI_SERVICES.filter(service => service.access === 'private').map(service => service.id), ['platform', 'erp']);
});
