import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => { throw new Error(`[universal-membership] ${message}`); };

const registry = JSON.parse(read('config/ecosystem-services.json'));
const policy = JSON.parse(read('config/universal-membership.json'));
const services = Array.isArray(registry.services) ? registry.services : [];
const reserved = new Set(policy.excludedInfrastructure || []);
const expectedIds = services.map((service) => String(service.id || '').trim().toLowerCase());

if (policy.policyId !== 'one-account-free-everywhere-pay-where-needed') fail('canonical policy id changed');
if (policy.defaultEntitlement?.tier !== 'free') fail('default entitlement must remain FREE');
if (policy.defaultEntitlement?.scope !== 'all_registry_user_services') fail('FREE must cover all registry user services');
if (policy.guestAccess?.scope !== 'common_service_user_pages' || policy.guestAccess?.mode !== 'guide_only') fail('guest user pages must stay guide-only');
if (policy.guestAccess?.minimumTierForContent !== 'free' || policy.guestAccess?.identityProvider !== 'google') fail('common service content must require Google FREE membership');
if (policy.paidPlans?.scope !== 'service_specific' || policy.paidPlans?.upgradeIndependently !== true) fail('paid plans must remain service-specific');
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
if (!mySummary.includes("https://api.ekodi.kr/api/membership/portfolio")) fail('My EKODI is not connected to portfolio endpoint');

console.log(`Universal membership contract OK: ${expectedIds.length} user services inherit FREE; paid tiers remain service-specific.`);
