import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

const [core, boundaries] = await Promise.all([
  readJson('config/ekodi-core-contract.json'),
  readJson('platform-boundaries.json')
]);

const fail = message => {
  console.error(`EKODI Core contract validation failed: ${message}`);
  process.exitCode = 1;
};

if (core.schemaVersion !== 2) fail('schemaVersion must be 2 after final completion');
if (core.status !== 'completed') fail('status must be completed after seven-stage rollout');
if (core.adoptionStatus !== 'adopted') fail('adoptionStatus must preserve the adopted architecture state');
if (core.completionEvidence !== 'config/ekodi-core-completion.json') fail('completion evidence contract must be declared');
if (core.canonicalHosts?.api !== 'api.ekodi.kr') fail('canonical API host must be api.ekodi.kr');
if (core.controlPlane?.platformId !== 'control-api') fail('control plane must be control-api');

const controlApi = boundaries.platforms?.[core.controlPlane?.platformId];
if (!controlApi) fail('control-api platform boundary is missing');
if (controlApi && !controlApi.domains?.includes(core.canonicalHosts.api)) fail('control-api must own api.ekodi.kr');
if (controlApi && controlApi.database !== core.controlPlane.database) fail('control-plane database declaration differs from Core contract');

const adminAuth = boundaries.platforms?.['admin-auth'];
if (!adminAuth?.domains?.includes(core.canonicalHosts.admin)) fail('admin.ekodi.kr must remain in the admin-auth boundary');
if (!adminAuth?.domains?.includes(core.canonicalHosts.auth)) fail('auth.ekodi.kr must remain in the admin-auth boundary');

const requiredEntities = ['organization', 'person', 'membership', 'audit'];
for (const entity of requiredEntities) {
  if (!core.controlPlane?.canonicalEntities?.[entity]) fail(`canonical entity mapping is missing: ${entity}`);
}

const requiredPrinciples = [
  'tenant-isolation',
  'provider-independence',
  'ai-optional',
  'data-portability',
  'graceful-degradation',
  'observable-operations',
  'human-agency'
];
for (const principle of requiredPrinciples) {
  if (!core.corePrinciples?.includes(principle)) fail(`required Core principle is missing: ${principle}`);
}

const requiredCompletionGates = [
  'tenant-isolation-is-verified',
  'ai-provider-outage-does-not-break-core-workflows',
  'backup-and-restore-path-is-verified',
  'production-core-api-contract-is-live',
  'bounded-production-load-test-passes',
  'automatic-worker-rollback-contract-is-enforced',
  'security-baseline-is-enforced'
];
for (const gate of requiredCompletionGates) {
  if (!core.completionGates?.includes(gate)) fail(`required completion gate is missing: ${gate}`);
}

const rules = boundaries.rules || [];
if (!rules.some(rule => /private data/i.test(rule) && /explicit shared API contract/i.test(rule))) {
  fail('platform boundaries must enforce explicit contracts for cross-tenant private data');
}
if (!rules.some(rule => /shared database migration/i.test(rule) && /shared-core change/i.test(rule))) {
  fail('platform boundaries must classify shared database migrations as shared-core changes');
}
if (!rules.some(rule => /real public hostname/i.test(rule))) {
  fail('production verification must use real public hostnames');
}

const storeKinds = new Set((core.dataStrategy?.stores || []).map(store => store.kind));
for (const kind of ['cloudflare-d1', 'supabase-postgres', 'object-storage']) {
  if (!storeKinds.has(kind)) fail(`hybrid store declaration is missing: ${kind}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('EKODI Core contract validation passed.');
