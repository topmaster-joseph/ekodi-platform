import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => { throw new Error(`[universal-membership] ${message}`); };

const registry = JSON.parse(read('config/ecosystem-services.json'));
const policy = JSON.parse(read('config/universal-membership.json'));
const services = Array.isArray(registry.services) ? registry.services.filter((service) => service?.userVisible !== false) : [];
const reserved = new Set(policy.excludedInfrastructure || []);
const expectedIds = services.map((service) => String(service.id || '').trim().toLowerCase());

if (policy.policyId !== 'public-by-default-progressive-membership') fail('canonical policy id changed');
if (policy.defaultEntitlement?.tier !== 'free') fail('default entitlement must remain FREE');
if (policy.defaultEntitlement?.scope !== 'all_registry_user_services') fail('FREE must cover all registry user services');
if (policy.guestAccess?.scope !== 'all_user_facing_sites' || policy.guestAccess?.mode !== 'full_public_site') fail('user-facing sites must remain public by default');
if (policy.guestAccess?.minimumTierForContent !== null || policy.guestAccess?.identityProvider !== null) fail('public content must not require membership or an identity provider');
if (policy.freeMemberBenefits?.purpose !== 'additional_basic_benefits_not_access' || policy.freeMemberBenefits?.siteAdminConfigurable !== true) fail('FREE membership must add configurable benefits rather than unlock public content');
if (policy.siteBenefitAdministration?.publicAccessImmutable !== true || policy.siteBenefitAdministration?.centralPlatformDefinesGuardrailsOnly !== true) fail('site benefit administration guardrails are incomplete');
if (policy.paidPlans?.scope !== 'service_specific' || policy.paidPlans?.upgradeIndependently !== true || policy.paidPlans?.siteAdminMayEdit !== true) fail('paid plans must remain service-specific and site-admin configurable');
if (policy.automaticInheritance?.enabledForFutureRegistryServices !== true) fail('future service inheritance must stay enabled');

for (const id of expectedIds) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) fail(`invalid service id ${id}`);
  if (reserved.has(id)) fail(`internal infrastructure leaked into user membership registry: ${id}`);
}
if (new Set(expectedIds).size !== expectedIds.length) fail('duplicate service ids');

const serverModule = await import(`${pathToFileURL(path.join(root, 'generated/user-services.js')).href}?v=${Date.now()}`);
const myModule = await import(`${pathToFileURL(path.join(root, 'my/user-services.js')).href}?v=${Date.now()}`);
const serverIds = serverModule.USER_SERVICES.map((service) => service.id);
const myIds = myModule.USER_SERVICES.map((service) => service.id);
if (JSON.stringify(serverIds) !== JSON.stringify(expectedIds)) fail('generated server registry is stale; run npm run generate:user-services');
if (JSON.stringify(myIds) !== JSON.stringify(expectedIds)) fail('generated My EKODI registry is stale; run npm run generate:user-services');

const runtime = read('universal-membership.js');
const missionEntry = read('mission-control-entry-worker.js');
const myIndex = read('my/index.html');
const mySummary = read('my/membership-summary.js');
if (!runtime.includes('/api/membership/portfolio')) fail('portfolio endpoint missing');
if (!runtime.includes('inherited: true')) fail('lazy inherited FREE projection missing');
if (!runtime.includes('USER_SERVICE_ORIGINS')) fail('registry-driven CORS missing');
if (!missionEntry.includes("path.startsWith('/api/membership/')") || !missionEntry.includes('handleUniversalMembership')) fail('Control API does not route membership through universal layer');
if (!myIndex.includes('/membership-summary.js') || !myIndex.includes('/membership-summary.css')) fail('My EKODI membership summary assets missing');
if (!mySummary.includes("https://ekodi.kr/api/membership/portfolio")) fail('My EKODI is not connected to portfolio endpoint');

console.log(`Universal membership contract OK: ${expectedIds.length} user services stay public by default; FREE adds benefits; paid tiers remain site-configurable.`);
