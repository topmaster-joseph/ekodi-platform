import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

const PROVIDER_SCHEMA = 'config/marketing-ai-provider-manifest.schema.json';
const ENTITLEMENT_SCHEMA = 'config/marketing-ai-entitlement.schema.json';

test('Marketing AI remains an independent EKODI platform capability', async () => {
  const boundaries = await readJson('platform-boundaries.json');
  const marketingAi = boundaries.platforms['marketing-ai'];
  const business = boundaries.platforms.business;

  assert.ok(marketingAi, 'marketing-ai boundary must exist');
  assert.equal(marketingAi.kind, 'independent-platform-family');
  assert.ok(marketingAi.domains.includes('marketing.ekodi.kr'));
  assert.ok(
    business.sharedDependencies.some((dependency) => /Marketing AI via public service contract/i.test(dependency)),
    'EKODIBIZ/business must consume Marketing AI through a public service contract'
  );
});

test('provider manifest exposes replaceable provider lifecycle and capabilities', async () => {
  const schema = await readJson(PROVIDER_SCHEMA);
  const properties = schema.properties;

  assert.equal(properties.schema_version.const, '1.0');
  assert.deepEqual(properties.status.enum, ['draft', 'testing', 'certified', 'suspended', 'retired']);
  assert.ok(properties.capabilities.items.enum.includes('content.generate'));
  assert.ok(properties.capabilities.items.enum.includes('analytics.report'));
  assert.ok(properties.data_policy.required.includes('training_use'));
  assert.ok(properties.data_policy.required.includes('persists_payload'));
});

test('entitlement schema supports individuals, institutions and organizations', async () => {
  const schema = await readJson(ENTITLEMENT_SCHEMA);
  const properties = schema.properties;

  assert.deepEqual(properties.subject_scope.enum, ['individual', 'institution', 'organization']);
  assert.ok(properties.provider_selector.oneOf.some((option) => option.enum?.includes('any_certified')));
  assert.ok(properties.capabilities.items.enum.includes('campaign.plan'));
  assert.ok(properties.capabilities.items.enum.includes('publish.execute'));
  assert.equal(properties.enabled.type, 'boolean');
});
