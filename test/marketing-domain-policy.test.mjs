import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cfg = JSON.parse(await readFile(new URL('../config/marketing-tenants.json', import.meta.url), 'utf8'));

test('Marketing AI tenants use shared product-hub paths as canonical URLs', () => {
  assert.equal(cfg.canonicalPattern, 'https://marketing.ekodi.kr/{tenant}/');
  assert.equal(cfg.namespace.gateway, 'ai.ekodi.kr');
  assert.equal(cfg.namespace.productHub, 'marketing.ekodi.kr');
  assert.equal(cfg.policy.tenantAddressing, 'parent-service-path');
  assert.equal(cfg.policy.newTenantSubdomainCreation, false);
  for (const tenant of cfg.tenants) {
    assert.equal(tenant.canonicalUrl, `https://marketing.ekodi.kr${tenant.canonicalPath}`);
    assert.ok(tenant.legacyDomains.includes(`${tenant.tenant}.ai.ekodi.kr`));
  }
});

test('legacy tenant domains are compatibility aliases, never canonical', () => {
  for (const tenant of cfg.tenants) {
    for (const legacy of tenant.legacyDomains) {
      assert.ok(!tenant.canonicalUrl.includes(legacy));
    }
  }
});

test('customer-owned custom domains are mappings only', () => {
  assert.equal(cfg.policy.customDomain.ownership, 'customer');
  assert.equal(cfg.policy.customDomain.registrationIncluded, false);
  assert.equal(cfg.policy.customDomain.mappingOnly, true);
});

test('CGMA follows the same Marketing AI parent-path rule', () => {
  const cgma = cfg.tenants.find((row) => row.tenant === 'cgma');
  assert.ok(cgma);
  assert.equal(cgma.tenantType, 'organization');
  assert.equal(cgma.canonicalUrl, 'https://marketing.ekodi.kr/cgma/');
  assert.ok(cgma.legacyDomains.includes('cgma.ai.ekodi.kr'));
});

test('EKODIBIZ consumes the shared Marketing AI without a dedicated tenant domain', () => {
  const biz = cfg.internalConsumers.find((row) => row.id === 'ekodibiz');
  assert.ok(biz);
  assert.equal(biz.entryUrl, 'https://marketing.ekodi.kr/biz/');
  assert.equal(biz.dedicatedEkodiDomain, false);
});
