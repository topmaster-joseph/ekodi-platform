import fs from 'node:fs';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const read = path => JSON.parse(fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8').replace(/^\uFEFF/,''));
const constitution = read('governance/constitution/constitution.json');
const foundry = read('config/capability-foundry.json');
const capabilityRegistry = read('config/capability-registry.json');
const evidenceRegistry = read('config/service-creation-evidence.json');
const secondaryRegistry = read('service-registry.json');
const failures = [];
const fail = message => failures.push(message);
const policy = constitution.capabilityFirstServiceCreationPolicy || {};
const baseline = new Set(policy.grandfatheredUserServiceIds || []);
const secondaryOnlyBaseline = new Set(policy.grandfatheredSecondaryRegistryOnlyIds || []);
const records = evidenceRegistry.records || {};
const capabilityIds = new Set([...(capabilityRegistry.capabilities || []),...(capabilityRegistry.fabricCapabilities || [])].map(item => String(item.id || '')));
const moduleIds = new Set((foundry.modules || []).map(item => String(item.id || '')));
const recipeIds = new Set((foundry.sampleRecipes || []).map(item => String(item.id || '')));
const demandTypes = new Set(policy.acceptedDemandEvidence || []);

if (policy.id !== 'CAPABILITY-BEFORE-SERVICE-001' || policy.status !== 'enforced' || policy.mode !== 'mandatory') fail('capability-before-service constitutional policy must remain mandatory and enforced');
if (policy.canonicalServiceManifest !== 'ekodi-service-manifest.js') fail('canonical service manifest binding drifted');
if (policy.evidenceRegistry !== 'config/service-creation-evidence.json') fail('service creation evidence registry binding drifted');
if (policy.existingCapabilityReuseRequired !== true) fail('existing Capability reuse must be evaluated before service creation');
if (policy.foundryBeforeServiceWhenCapabilityGapExists !== true) fail('Capability Foundry must precede service creation when a gap exists');
if (policy.sampleBeforeUserService !== true) fail('sample validation must precede user service registration');
if (Number(policy.minimumVerifiedSampleRuns) < 3) fail('minimum verified sample runs must remain at least 3');
if (policy.demandEvidenceRequired !== true) fail('new service demand evidence must remain mandatory');
if (policy.humanPackagingReviewRequired !== true || policy.humanPackagingReviewAuthority !== 'ekodi_platform_super_administrator') fail('new service packaging must require EKODI Platform Super Administrator review');
if (policy.automaticUserServiceCreationForbidden !== true) fail('automatic user-facing service creation must remain forbidden');
if (policy.newServiceWithoutEvidenceBlocksCi !== true) fail('missing service creation evidence must block CI');
if (policy.newIndependentBoundaryAlsoRequiresSustainableBoundaryGate !== true) fail('independent service boundaries must also pass the sustainable boundary gate');
if (policy.currentServicesGrandfatheredOnlyAtAdoption !== true || policy.grandfatheredListExpansionRequiresConstitutionalAmendment !== true) fail('grandfather baseline must remain adoption-only and constitutionally locked');

if (foundry.serviceCreationRule?.policyId !== policy.id) fail('Capability Foundry policy id must match the constitution');
if (foundry.serviceCreationRule?.capabilityFirst !== true || foundry.serviceCreationRule?.reuseExistingCapabilitiesFirst !== true) fail('Capability Foundry capability reuse rule must remain enabled');
if (foundry.serviceCreationRule?.sampleBeforeUserService !== true) fail('Capability Foundry sample-before-service rule must remain enabled');
if (Number(foundry.serviceCreationRule?.minimumVerifiedSampleRuns) !== Number(policy.minimumVerifiedSampleRuns)) fail('Capability Foundry sample run threshold must match the constitution');
if (foundry.serviceCreationRule?.serviceCreationAutomatic !== false) fail('Capability Foundry automatic service creation must remain disabled');
if (foundry.serviceCreationRule?.newUserServiceRegistrationRequiresEvidence !== true) fail('Capability Foundry must require service registration evidence');
if (foundry.serviceCreationRule?.evidenceRegistry !== policy.evidenceRegistry) fail('Capability Foundry evidence registry binding drifted');
if (foundry.serviceCreationRule?.independentBoundaryRequiresSustainableGate !== true) fail('Capability Foundry must preserve the sustainable boundary gate');
if (evidenceRegistry.policyId !== policy.id || evidenceRegistry.policyVersion !== constitution.version || evidenceRegistry.status !== 'active') fail('service creation evidence registry policy/version/status mismatch');

const validateEvidence = (serviceId, service) => {
  const record = records[serviceId];
  if (!record) { fail(`${serviceId}: new service is outside the grandfathered baseline and has no governed creation evidence`); return; }
  if (record.status !== 'approved') fail(`${serviceId}: creation evidence status must be approved`);
  const search = record.existingCapabilitySearch || {};
  if (search.completed !== true) fail(`${serviceId}: existing Capability search must be completed`);
  const considered = Array.isArray(search.consideredCapabilityIds) ? search.consideredCapabilityIds : [];
  if (!considered.length) fail(`${serviceId}: existing Capability search must record considered Capability ids`);
  for (const id of considered) if (!capabilityIds.has(String(id))) fail(`${serviceId}: unknown considered Capability id: ${id}`);
  const gap = record.capabilityGap || {};
  if (typeof gap.exists !== 'boolean') fail(`${serviceId}: capability gap decision is required`);
  const foundryModules = Array.isArray(gap.foundryModuleIds) ? gap.foundryModuleIds : [];
  if (gap.exists === true && !foundryModules.length) fail(`${serviceId}: a declared Capability gap must be addressed by Foundry module(s)`);
  for (const id of foundryModules) if (!moduleIds.has(String(id))) fail(`${serviceId}: unknown Foundry module id: ${id}`);
  const sample = record.sampleValidation || {};
  if (sample.syntheticOnly !== true) fail(`${serviceId}: pre-service sample validation must be synthetic-only`);
  const recipes = Array.isArray(sample.recipeIds) ? sample.recipeIds : [];
  if (!recipes.length) fail(`${serviceId}: at least one Capability Sample recipe is required`);
  for (const id of recipes) if (!recipeIds.has(String(id))) fail(`${serviceId}: unknown sample recipe id: ${id}`);
  const runs = Array.isArray(sample.verifiedRunIds) ? sample.verifiedRunIds.filter(Boolean) : [];
  if (new Set(runs).size < Number(policy.minimumVerifiedSampleRuns)) fail(`${serviceId}: at least ${policy.minimumVerifiedSampleRuns} unique verified sample runs are required`);
  const demand = record.demandEvidence || {};
  if (!demandTypes.has(String(demand.type || ''))) fail(`${serviceId}: demand evidence type is missing or not constitutionally accepted`);
  if (!String(demand.ref || '').trim()) fail(`${serviceId}: auditable demand evidence reference is required`);
  const review = record.humanPackagingReview || {};
  if (review.approved !== true || review.authority !== policy.humanPackagingReviewAuthority) fail(`${serviceId}: Super Administrator packaging approval is required`);
  if (!String(review.ref || '').trim()) fail(`${serviceId}: auditable human packaging approval reference is required`);
  if (record.serviceRegistrationDecision !== 'approved') fail(`${serviceId}: service registration decision must be approved`);
  if (!Array.isArray(service?.capabilities) || !service.capabilities.length) fail(`${serviceId}: new canonical service must declare reusable capabilities`);
};

const manifestServices = EKODI_SERVICE_MANIFEST.services || [];
const manifestIds = new Set(manifestServices.map(service => String(service.id || '')));
for (const service of manifestServices) {
  const id = String(service.id || '');
  if (!id) { fail('canonical service manifest contains an empty service id'); continue; }
  if (baseline.has(id)) continue;
  validateEvidence(id, service);
}
for (const service of secondaryRegistry.services || []) {
  const id = String(service.id || '');
  if (!id) { fail('secondary service registry contains an empty service id'); continue; }
  if (secondaryOnlyBaseline.has(id) || baseline.has(id)) continue;
  if (!manifestIds.has(id)) fail(`${id}: new non-admin secondary registry service must also exist in the canonical service manifest`);
  validateEvidence(id, manifestServices.find(item => item.id === id));
}
for (const id of baseline) if (!manifestIds.has(id)) fail(`grandfathered canonical service disappeared from the adoption baseline: ${id}`);
for (const id of secondaryOnlyBaseline) if (!(secondaryRegistry.services || []).some(service => service.id === id)) fail(`grandfathered secondary registry-only service disappeared from baseline: ${id}`);

if (failures.length) {
  console.error(`Capability-before-service validation failed (${failures.length})`);
  failures.forEach(message => console.error('- '+message));
  process.exit(1);
}
console.log(`Capability-before-service gate: OK (${manifestServices.length} current canonical services, ${Object.keys(records).length} post-adoption evidence records).`);
