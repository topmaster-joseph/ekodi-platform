import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const registry = JSON.parse(await readFile(new URL('../config/ecosystem-services.json', import.meta.url), 'utf8'));
const boundaries = JSON.parse(await readFile(new URL('../platform-boundaries.json', import.meta.url), 'utf8'));
const operatingModel = await readFile(new URL('../docs/SUSTAINABLE-OPERATING-MODEL.md', import.meta.url), 'utf8');

const failures = [];
const manifestById = new Map(EKODI_SERVICE_MANIFEST.services.map(service => [service.id, service]));
const registryById = new Map((registry.services || []).map(service => [service.id, service]));
const boundaryDomains = new Set(
  Object.values(boundaries.platforms || {}).flatMap(platform => platform.domains || [])
);

function fail(message) { failures.push(message); }
function hostOf(url) { try { return new URL(url).hostname; } catch { return ''; } }

if (EKODI_SERVICE_MANIFEST.identityModel !== 'person-space-role') fail('identity model must remain person-space-role');
if (EKODI_SERVICE_MANIFEST.authorityModel !== 'platform-admin-is-separate-from-tenant-activity') fail('admin and tenant activity authority must remain separate');
if (EKODI_SERVICE_MANIFEST.shellPolicy !== 'required-for-user-facing-services') fail('Shell must remain required for user-facing services');
if ((registry.services || []).length !== EKODI_SERVICE_MANIFEST.services.length) fail('ecosystem registry and service manifest must cover the same service count');

for (const required of [
  'AI is replaceable enhancement, never a mandatory dependency for core service',
  'Person + Space + Role + Capability',
  'staging verification',
  'real public-host verification'
]) {
  if (!operatingModel.includes(required)) fail(`operating model lost invariant: ${required}`);
}

for (const service of registry.services || []) {
  const manifest = manifestById.get(service.id);
  if (!manifest) { fail(`${service.id}: missing from canonical service manifest`); continue; }
  const registryHost = hostOf(service.url);
  const manifestHost = hostOf(manifest.url);
  if (!registryHost || registryHost !== manifestHost) fail(`${service.id}: registry/manifest host mismatch`);
  if (!String(service.url || '').startsWith('https://')) fail(`${service.id}: canonical URL must use HTTPS`);
  if (service.homepage === true && service.productionVerified !== true) fail(`${service.id}: homepage exposure requires production verification`);
  if (service.productionVerified === true && !['live', 'beta'].includes(service.status)) fail(`${service.id}: production verified service must be live or beta`);
  if (service.productionVerified === true && (manifest.state === 'planned' || manifest.shellIntegration === 'planned')) fail(`${service.id}: production verified service cannot remain planned`);
  if (service.status === 'planned' && service.productionVerified === true) fail(`${service.id}: planned service cannot be production verified`);
  if (manifest.sso !== true) fail(`${service.id}: user-facing service must participate in EKODI SSO`);
  if (!manifest.shellIntegration || manifest.shellIntegration === 'pending') fail(`${service.id}: Shell integration must be explicit`);
  if (!Array.isArray(manifest.workspaceKinds) || !manifest.workspaceKinds.length) fail(`${service.id}: Workspace kinds are required`);
  if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.length) fail(`${service.id}: service capabilities are required`);
  if (service.productionVerified === true && !boundaryDomains.has(registryHost)) {
    const indirect = ['marketing','church','biz','lab','mall','books','author','social','energy','community','work','business','invest','messenger','support','my'].includes(service.id);
    if (!indirect) fail(`${service.id}: production host must be declared in a platform boundary`);
  }
}

for (const service of EKODI_SERVICE_MANIFEST.services) {
  if (!registryById.has(service.id)) fail(`${service.id}: missing from ecosystem registry`);
}

for (const forbidden of ['admin', 'auth', 'api', 'core', 'security']) {
  if (registryById.has(forbidden)) fail(`${forbidden}: infrastructure/control service must not appear as a user membership service`);
}

if (failures.length) {
  console.error(`EKODI service operating-principle validation failed (${failures.length})`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log(`✅ EKODI operating principles verified across ${registry.services.length} user services.`);
