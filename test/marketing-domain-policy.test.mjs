import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cfg = JSON.parse(await readFile(new URL('../config/marketing-tenants.json', import.meta.url), 'utf8'));

test('Marketing workspaces use the apex-path-only address model', () => {
  assert.equal(cfg.addressModel, 'apex-path-only');
  assert.equal(cfg.namespace.canonicalHost, 'ekodi.kr');
  assert.equal(cfg.namespace.productHub, 'https://ekodi.kr/ekodibiz/marketing-ai');
  assert.equal(cfg.namespace.enginePath, '/marketing');
  assert.equal(cfg.namespace.aiGatewayPath, '/ai');
  assert.equal(cfg.namespace.providerTopologyVisibleToOrdinaryUsers, false);
  const canon = { jadam:'/jadam/marketing', pizzamaru:'/pizzamaru/marketing', yogurt:'/yogurt/marketing', cgma:'/cgma/marketing' };
  for (const tenant of cfg.tenants) {
    assert.equal(tenant.host, 'ekodi.kr');
    assert.equal(tenant.domain, 'ekodi.kr');
    assert.equal(tenant.canonicalPath, canon[tenant.tenant]);
    assert.equal(tenant.canonicalUrl, 'https://ekodi.kr' + canon[tenant.tenant]);
    assert.equal(tenant.legacyDomains, undefined);
    assert.equal(tenant.executionAlias, undefined);
  }
});

test('EKODIBIZ is a first-party Marketing AI consumer on the canonical product path', () => {
  const biz = cfg.internalConsumers.find((row) => row.id === 'ekodibiz');
  assert.ok(biz);
  assert.equal(biz.workspaceType, 'tenant');
  assert.equal(biz.workspaceKey, 'ekodibiz');
  assert.equal(biz.entryDomain, 'ekodi.kr');
  assert.equal(biz.entryUrl, 'https://ekodi.kr/ekodibiz/marketing-ai');
  assert.equal(biz.engineUrl, 'https://ekodi.kr/marketing/');
  assert.equal(biz.templateKey, 'service_b2b');
});

test('workspace plans use canonical paths while Pro may map a customer-owned domain', () => {
  for (const key of ['organizationWorkspace','storeBasic','storePlus','storePro']) {
    assert.equal(cfg.policy[key].addressModel, 'apex-path-only');
  }
  assert.equal(cfg.policy.storePlus.customDomain, false);
  assert.equal(cfg.policy.storePro.customDomain, true);
  assert.equal(cfg.policy.storePro.includedCustomDomains, 1);
  for (const key of ['organizationWorkspace','storePlus','storePro']) {
    assert.equal(cfg.policy[key].canonicalPattern, 'https://ekodi.kr/{public_namespace}/marketing');
  }
});

test('Pro custom domain maps a customer-owned hostname only', () => {
  assert.equal(cfg.policy.customDomain.ownership, 'customer');
  assert.equal(cfg.policy.customDomain.registrationIncluded, false);
  assert.equal(cfg.policy.customDomain.mappingOnly, true);
});

test('CGMA public domain remains separate from its private Marketing workspace path', () => {
  const cgma = cfg.tenants.find((row) => row.tenant === 'cgma');
  assert.ok(cgma);
  assert.equal(cgma.tenantType, 'organization');
  assert.equal(cgma.visibility, 'private');
  assert.equal(cgma.platformSitePath, '/cgma');
  assert.equal(cgma.publicSiteDomain, 'cgma.or.kr');
  assert.equal(cgma.canonicalPath, '/cgma/marketing');
  assert.equal(cgma.canonicalUrl, 'https://ekodi.kr/cgma/marketing');
});
