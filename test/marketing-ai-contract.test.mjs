import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

const PROVIDER_SCHEMA = 'config/marketing-ai-provider-manifest.schema.json';
const ENTITLEMENT_SCHEMA = 'config/marketing-ai-entitlement.schema.json';

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.json', '.toml', '.yml', '.yaml']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'test', 'tests']);
const DEPRECATED_BRANDING = [
  '에코디비즈 마케팅AI',
  '에코디비즈 마케팅 AI',
  'EKODIBIZ Marketing AI'
];

async function collectTextFiles(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectTextFiles(fullPath, output);
    } else if (TEXT_EXTENSIONS.has(extname(entry.name))) {
      output.push(fullPath);
    }
  }
  return output;
}

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

test('user-facing source does not regress to deprecated EKODIBIZ Marketing AI branding', async () => {
  const files = await collectTextFiles(ROOT);
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const phrase of DEPRECATED_BRANDING) {
      if (content.includes(phrase)) {
        violations.push(`${file.slice(ROOT.length)}: ${phrase}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Use the canonical parent brand "에코디 마케팅AI" instead:\n${violations.join('\n')}`
  );
});
