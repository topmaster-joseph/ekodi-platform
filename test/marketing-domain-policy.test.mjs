import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cfg = JSON.parse(await readFile(new URL('../config/marketing-tenants.json', import.meta.url), 'utf8'));

test('customer AI domains remain compatibility execution aliases while user routes stay canonical', () => {
  assert.equal(cfg.domainPattern, '{tenant}.ai.ekodi.kr');
  assert.equal(cfg.domainPatternRole, 'legacy_execution_alias_only');
  assert.equal(cfg.namespace.domain, 'ai.ekodi.kr');
  assert.equal(cfg.namespace.productHub, 'https://ekodi.kr/ekodibiz/marketing-ai');
  assert.equal(cfg.namespace.engineDomain, 'marketing.ekodi.kr');
  assert.equal(cfg.namespace.aiGateway, 'ai.ekodi.kr');
  assert.equal(cfg.namespace.providerTopologyVisibleToOrdinaryUsers, false);
  const canon = { jadam:'https://ekodi.kr/jadam/marketing', pizzamaru:'https://ekodi.kr/pizzamaru/marketing', yogurt:'https://ekodi.kr/yogurt/marketing', cgma:'https://ekodi.kr/cgma/marketing' };
  for (const tenant of cfg.tenants) {
    assert.equal(tenant.domain, `${tenant.tenant}.ai.ekodi.kr`);
    assert.equal(tenant.domainRole, 'legacy_execution_alias');
    assert.equal(tenant.canonicalUrl, canon[tenant.tenant]);
  }
});

test('EKODIBIZ is a first-party Marketing AI consumer on the canonical product path', () => {
  const biz = cfg.internalConsumers.find((row) => row.id === 'ekodibiz');
  assert.ok(biz);
  assert.equal(biz.workspaceType, 'tenant');
  assert.equal(biz.workspaceKey, 'ekodibiz');
  assert.equal(biz.entryDomain, 'ekodi.kr');
  assert.equal(biz.entryUrl, 'https://ekodi.kr/ekodibiz/marketing-ai');
  assert.equal(biz.engineUrl, 'https://marketing.ekodi.kr/');
  assert.equal(biz.templateKey, 'service_b2b');
  assert.equal(biz.dedicatedEkodiDomain, false);
});

test('workspace plans share canonical path routing while Pro may map a customer-owned domain', () => {
  assert.equal(cfg.policy.organizationWorkspace.dedicatedEkodiDomain, false);
  assert.equal(cfg.policy.storeBasic.dedicatedEkodiDomain, false);
  assert.equal(cfg.policy.storePlus.dedicatedEkodiDomain, false);
  assert.equal(cfg.policy.storePlus.customDomain, false);
  assert.equal(cfg.policy.storePro.dedicatedEkodiDomain, false);
  assert.equal(cfg.policy.storePro.customDomain, true);
  assert.equal(cfg.policy.storePro.includedCustomDomains, 1);
  for (const key of ['organizationWorkspace','storePlus','storePro']) assert.equal(cfg.policy[key].canonicalPattern, 'https://ekodi.kr/{public_namespace}/marketing');
});

test('Pro custom domain means mapping a customer-owned hostname, not giving away a domain', () => {
  assert.equal(cfg.policy.customDomain.ownership, 'customer');
  assert.equal(cfg.policy.customDomain.registrationIncluded, false);
  assert.equal(cfg.policy.customDomain.mappingOnly, true);
});

test('CGMA public site stays separate from its private AI workspace', () => {
  const cgma = cfg.tenants.find((row) => row.tenant === 'cgma');
  assert.ok(cgma);
  assert.equal(cgma.tenantType, 'organization');
  assert.equal(cgma.visibility, 'private');
  assert.equal(cgma.platformSitePath, '/cgma');
  assert.equal(cgma.publicSiteDomain, 'cgma.or.kr');
  assert.equal(cgma.privateSiteDomain, undefined);
  assert.equal(cgma.domain, 'cgma.ai.ekodi.kr');
  assert.equal(cgma.landingPath, '/market-ai');
  assert.ok(cgma.legacyDomains.includes('cgma.ekodi.kr'));
});
