import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const policy = json('config/cloud-portability-policy.json');
const dataPlane = json('config/data-plane-contract.json');
const storage = json('config/storage-policy.json');
const failures = [];
const fail = message => failures.push(message);

if (policy.status !== 'enforced-foundation') fail('cloud portability policy must be enforced-foundation');
if (policy.mode !== 'portable-cloud-first') fail('cloud portability mode must be portable-cloud-first');
for (const key of [
  'cloudProvidersAreReplaceableInfrastructure',
  'canonicalIdentityProviderNeutral',
  'canonicalBusinessLogicProviderNeutral',
  'canonicalDataFormatsPortable',
  'providerNativeCriticalCallsRequireAdapter',
  'multiProviderReady',
  'criticalProviderExitPlanRequired',
  'freeCreditsNeverDefineArchitecture',
  'providerSecretsStayServerSide'
]) {
  if (policy.principles?.[key] !== true) fail(`cloud portability principle must be true: ${key}`);
}
if (policy.principles?.activeActiveMultiCloudDefault !== false) fail('active-active multi-cloud must not be the default');const classRules = policy.providerClasses || {};
for (const className of ['standard-native', 'adapter-portable', 'export-portable', 'provider-bound']) {
  if (!classRules[className]) fail(`missing provider portability class: ${className}`);
}
if (classRules['provider-bound']?.allowedForCanonicalData !== false) fail('provider-bound class may not own canonical data');

if (Number(dataPlane.version) < 2) fail('data-plane contract must be version 2 or newer');
if (dataPlane.principles?.portableCloudFirst !== true) fail('data plane must enable Portable Cloud First');
if (dataPlane.principles?.providerSpecificCanonicalIdsForbidden !== true) fail('provider-specific canonical IDs must be forbidden');
if (dataPlane.principles?.providerNativeCriticalCallsRequireAdapter !== true) fail('critical provider-native calls must require adapters');

const providerKinds = new Map();
for (const [providerId, provider] of Object.entries(dataPlane.providers || {})) {
  const portability = provider.portability;
  if (!portability) { fail(`provider missing portability metadata: ${providerId}`); continue; }
  if (!classRules[portability.class]) fail(`provider ${providerId} uses unknown portability class ${portability.class}`);
  if (!portability.runtimeContract) fail(`provider ${providerId} missing runtimeContract`);
  if (!portability.dataExit) fail(`provider ${providerId} missing dataExit`);
  const list = providerKinds.get(provider.adapterKind) || [];
  list.push(providerId);
  providerKinds.set(provider.adapterKind, list);
}for (const [dataClass, rule] of Object.entries(dataPlane.dataClasses || {})) {
  const provider = dataPlane.providers?.[rule.defaultProvider];
  if (!provider) { fail(`data class ${dataClass} has unknown default provider`); continue; }
  if (rule.canonicalData === true && provider.portability?.canonicalDataAllowed !== true) {
    fail(`canonical data class ${dataClass} routes to provider that disallows canonical data`);
  }
  if (rule.canonicalData === true && provider.portability?.class === 'provider-bound') {
    fail(`canonical data class ${dataClass} may not default to provider-bound infrastructure`);
  }
}

if ((providerKinds.get('database') || []).length < 2) fail('database capability must have at least two provider targets');
if ((providerKinds.get('file') || []).length < 2) fail('file capability must have at least two provider targets');
for (const providerId of ['gcp-cloud-sql-postgres', 'gcs-object', 's3-object']) {
  if (!dataPlane.providers?.[providerId]) fail(`portable optional provider target missing: ${providerId}`);
}

if (storage.principles?.portableProviderContractRequired !== true) fail('storage must require a portable provider contract');
if (storage.principles?.providerNativeIdsAreMetadataOnly !== true) fail('storage provider-native IDs must remain metadata only');
if (storage.principles?.criticalProviderExitPlanRequired !== true) fail('storage critical providers require exit plans');
if (storage.principles?.freeCreditsNeverDefineArchitecture !== true) fail('storage architecture may not be defined by free credits');if (failures.length) {
  console.error(`EKODI cloud portability validation failed (${failures.length})`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log('EKODI Portable Cloud First: OK');
console.log(`- ${Object.keys(dataPlane.providers || {}).length} provider targets checked`);
console.log(`- database targets: ${(providerKinds.get('database') || []).join(', ')}`);
console.log(`- file targets: ${(providerKinds.get('file') || []).join(', ')}`);
console.log('- Google Cloud remains an optional replaceable provider, not an architecture authority');
