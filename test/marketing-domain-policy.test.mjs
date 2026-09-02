import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cfg = JSON.parse(await readFile(new URL('../config/marketing-tenants.json', import.meta.url), 'utf8'));

test('customer AI workspaces live under ai.ekodi.kr', () => {
  assert.equal(cfg.domainPattern, '{tenant}.ai.ekodi.kr');
  assert.equal(cfg.namespace.domain, 'ai.ekodi.kr');
  assert.equal(cfg.namespace.productHub, 'marketing.ekodi.kr');
  for (const tenant of cfg.tenants) {
    assert.equal(tenant.domain, `${tenant.tenant}.ai.ekodi.kr`);
  }
});

test('EKODIBIZ is a first-party Marketing AI consumer without a separate customer domain', () => {
  const biz = cfg.internalConsumers.find((row) => row.id === 'ekodibiz');
  assert.ok(biz);
  assert.equal(biz.workspaceType, 'tenant');
  assert.equal(biz.workspaceKey, 'ekodibiz');
  assert.equal(biz.entryDomain, cfg.namespace.productHub);
  assert.equal(biz.templateKey, 'service_b2b');
  assert.equal(biz.dedicatedEkodiDomain, false);
});

test('organization and store domain entitlements stay separate', () => {
  assert.equal(cfg.policy.organizationWorkspace.dedicatedEkodiDomain, true);
  assert.equal(cfg.policy.storeBasic.dedicatedEkodiDomain, false);
  assert.equal(cfg.policy.storePlus.dedicatedEkodiDomain, true);
  assert.equal(cfg.policy.storePlus.customDomain, false);
  assert.equal(cfg.policy.storePro.dedicatedEkodiDomain, true);
  assert.equal(cfg.policy.storePro.customDomain, true);
  assert.equal(cfg.policy.storePro.includedCustomDomains, 1);
});

test('Pro custom domain means mapping a customer-owned hostname, not giving away a domain', () => {
  assert.equal(cfg.policy.customDomain.ownership, 'customer');
  assert.equal(cfg.policy.customDomain.registrationIncluded, false);
  assert.equal(cfg.policy.customDomain.mappingOnly, true);
});

test('CGMA uses EKODI root canonical paths while its AI workspace remains private', () => {
  const cgma = cfg.tenants.find((row) => row.tenant === 'cgma');
  assert.ok(cgma);
  assert.equal(cgma.tenantType, 'organization');
  assert.equal(cgma.visibility, 'private');
  assert.equal(cgma.privateSiteDomain, undefined);
  assert.equal(cgma.canonicalSiteUrl, 'https://ekodi.kr/cgma');
  assert.equal(cgma.canonicalAiUrl, 'https://ekodi.kr/cgma/ai');
  assert.deepEqual(cgma.customDomains, ['cgma.or.kr']);
  assert.equal(cgma.domain, 'cgma.ai.ekodi.kr');
  assert.equal(cgma.landingPath, '/market-ai');
  assert.ok(cgma.legacyDomains.includes('cgma.ekodi.kr'));
});
