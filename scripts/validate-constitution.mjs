import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const failures = [];
const fail = message => failures.push(message);
const constitution = json('governance/constitution/constitution.json');
const architecture = json('governance/architecture/ekodi-os-architecture.json');
const boundaries = json('platform-boundaries.json');
const coreData = json('config/core-data-boundaries.json');
const storage = json('config/storage-policy.json');
const workspace = json('config/service-workspace-policy.json');

if (constitution.version !== '1.6.0') fail('constitution version must remain 1.6.0 with approved EKODI OS responsibility architecture amendment');
if (constitution.status !== 'active') fail('constitution must be active');
for (const principle of ['free-first-not-free-only','ekodi-core-is-source-of-truth','provider-independent-by-default','secure-by-default','one-domain-grammar','isolated-parallel-development','verification-first-evolution','security-native-intelligence','evidence-linked-recommendations','secure-projection-minimum-disclosure','integrated-responsibility-distributed-execution-standardized-connections','layered-governance-os-core-services-connections-workspaces']) {
  if (!constitution.principles?.includes(principle)) fail(`missing constitutional principle: ${principle}`);
}

const architectureModel = constitution.architectureModel || {};
if (architectureModel.registry !== 'governance/architecture/ekodi-os-architecture.json') fail('constitutional architecture registry path mismatch');
if (architectureModel.platformBoundaryRegistry !== 'platform-boundaries.json') fail('constitutional platform boundary registry path mismatch');
if (architectureModel.deploymentTopology !== 'modular-monolith-first') fail('constitutional deployment topology must remain modular-monolith-first');
for (const layer of ['governance','os','core','responsible-independent-service','external-connected-service','workspace']) {
  if (!architectureModel.layers?.includes(layer)) fail(`constitutional architecture layer missing: ${layer}`);
  if (!architecture.layers?.[layer]) fail(`architecture registry layer missing: ${layer}`);
}
for (const responsibility of ['ekodi-responsible','external-provider-responsible']) {
  if (!architectureModel.responsibilityClasses?.includes(responsibility)) fail(`constitutional responsibility class missing: ${responsibility}`);
}
if (architecture.principle !== 'Integrated responsibility, distributed execution, standardized connections.') fail('architecture registry canonical principle mismatch');
if (architecture.deploymentTopology !== 'modular-monolith-first') fail('architecture registry must preserve modular-monolith-first deployment topology');

const parallel = constitution.parallelDevelopmentPolicy || {};
if (parallel.uniqueTaskIdRequired !== true) fail('parallel development requires unique task IDs');
if (parallel.independentBranchPerTask !== true) fail('parallel development requires an independent branch per task');
if (parallel.independentWorktreeOrSandboxPerTask !== true) fail('parallel development requires an independent worktree or sandbox per task');
if (parallel.sharedMutableWorkingDirectoryForbidden !== true) fail('concurrent tasks must not share a mutable working directory');
if (parallel.directProtectedBranchWritesForbidden !== true) fail('direct protected-branch writes must be forbidden');
if (parallel.directAgentProductionDeploymentForbidden !== true) fail('direct agent production deployment must be forbidden');
const evolution = constitution.evolutionPolicy || {};
if (evolution.mode !== 'verification_first_security_native_self_evolving') fail('evolution policy must remain verification-first and security-native');
if (evolution.finalAuthority !== 'ekodi_platform_super_administrator') fail('Evolution Intelligence final authority must remain the EKODI Platform Super Administrator');
if (evolution.providerIndependent !== true) fail('Evolution Intelligence must remain provider-independent');
if (evolution.evidenceLinksRequiredForPublishedRecommendations !== true) fail('published Evolution recommendations must require evidence links');
if (evolution.unsupportedRecommendationsRemainInternal !== true) fail('unsupported Evolution recommendations must remain internal');
for (const signal of ['traffic','latency','error_rate','capacity','ai_cost','security_events']) {
  if (!evolution.observedSignals?.includes(signal)) fail(`Evolution observed signal missing: ${signal}`);
}
for (const gate of ['production_change','shared_core_creation','permission_expansion','paid_cost_commitment','data_migration','destructive_change','security_boundary_change','production_dns_change']) {
  if (!evolution.approvalRequired?.includes(gate)) fail(`Evolution approval gate missing: ${gate}`);
}
for (const control of ['least_privilege','zero_trust','audit','tenant_isolation','sandbox','agent_identity','secure_projection','rollback','backup','disaster_recovery']) {
  if (!evolution.securityCore?.includes(control)) fail(`Evolution security core control missing: ${control}`);
}
const secureProjection = constitution.securityPolicy?.secureProjection || {};
if (secureProjection.enabledByDefault !== true) fail('Secure Projection must be enabled by default');
if (secureProjection.model !== 'purpose-bound-minimum-disclosure') fail('Secure Projection model mismatch');
if (secureProjection.browserHiddenFieldsForbidden !== true) fail('restricted browser fields must be removed server-side');
if (secureProjection.secretsNeverProjected !== true) fail('secrets must never be projection outputs');
if (secureProjection.sourceTopologyNotProjectedToBrowserOrExternalOperationalAi !== true) fail('source/topology must stay out of browser and external operational AI projections');
if (secureProjection.adminDefaultProfile !== 'admin_safe') fail('administrator default projection must be admin_safe');
if (secureProjection.externalAiDefaultProfile !== 'ai_minimum') fail('external operational AI projection must default to ai_minimum');
if (secureProjection.viewExportDownloadApiRawDataSeparated !== true) fail('view/export/download/API/raw-data capabilities must remain distinct');
const systemDomains = new Set(constitution.systemBoundaries?.production || []);
const legacy = new Set(constitution.legacyDomainAllowlist || []);
const registeredCommon = new Set(constitution.registeredCommonServiceBoundaries || []);
const targets = constitution.legacyDomainTargets || {};
if (!systemDomains.has('ekodi.kr') || !systemDomains.has('api.ekodi.kr') || !systemDomains.has('auth.ekodi.kr')) fail('canonical system domain set is incomplete');
if (constitution.domainPolicy?.newFeatureSubdomainsForbidden !== true) fail('new feature subdomains must be forbidden');
if (constitution.domainPolicy?.newTenantSubdomainsForbidden !== true) fail('new tenant/workspace subdomains must be forbidden');
if (!registeredCommon.has('journal.ekodi.kr')) fail('registered common-service boundary missing: journal.ekodi.kr');
if (!registeredCommon.has('invest.ekodi.kr')) fail('registered common-service boundary missing: invest.ekodi.kr');

const expectedNamespaces = ['workspace-root-slug'];
if (JSON.stringify(constitution.publicNamespaces || []) !== JSON.stringify(expectedNamespaces)) {
  fail(`public workspace namespaces must be ${expectedNamespaces.join(', ')}`);
}
if (constitution.workspaceRoutingPolicy?.canonicalHost !== 'ekodi.kr') fail('workspace canonical host must be ekodi.kr');
if (constitution.workspaceRoutingPolicy?.identityKey !== 'workspace_id') fail('workspace routing identity key must be workspace_id');
if (constitution.workspaceRoutingPolicy?.workspaceSubdomainsForbidden !== true) fail('workspace subdomains must be forbidden');
if (constitution.workspaceRoutingPolicy?.personalHomeSubdomainException !== 'my.ekodi.kr') fail('My EKODI must remain the personal-home subdomain exception');

const canonicalPatterns = constitution.canonicalWorkspacePatterns || [];
if (JSON.stringify(canonicalPatterns) !== JSON.stringify(['https://ekodi.kr/{slug}'])) fail('canonical workspace pattern must be https://ekodi.kr/{slug}');
if (constitution.workspaceRoutingPolicy?.kindEncodedInUrl !== false) fail('workspace kind/type must not be encoded in public URLs');
if (constitution.workspaceRoutingPolicy?.reservedRootSlugsManagedBy !== 'platform_route_registry') fail('workspace root slug collisions must be controlled by the platform route registry');
const servicePatterns = new Set(constitution.canonicalWorkspaceServicePatterns || []);
for (const pattern of ['https://ekodi.kr/{slug}/{service}','https://ekodi.kr/{slug}/admin','https://ekodi.kr/{slug}/{service}/admin']) {
  if (!servicePatterns.has(pattern)) fail(`canonical workspace service pattern missing: ${pattern}`);
}

const legacyPathAliases = constitution.legacyPathAliases || {};
if (legacyPathAliases['https://space.ekodi.kr/{slug}'] !== 'https://ekodi.kr/{slug}') fail('space.ekodi.kr slug alias must map directly to ekodi.kr/{slug}');
if (legacyPathAliases['https://user.ekodi.kr/{slug}'] !== 'https://ekodi.kr/{slug}') fail('user.ekodi.kr slug alias must map directly to ekodi.kr/{slug}');

for (const [serviceId, service] of Object.entries(boundaries.platforms || {})) {
  for (const domain of service.domains || []) {
    if (!domain.endsWith('.ekodi.kr') && domain !== 'ekodi.kr') continue;
    if (!systemDomains.has(domain) && !legacy.has(domain) && !registeredCommon.has(domain)) fail(`${serviceId}: unregistered feature subdomain ${domain}`);
    if (legacy.has(domain) && !targets[domain]) fail(`${serviceId}: legacy domain ${domain} has no canonical migration target`);
  }
}
for (const domain of legacy) {
  const target = targets[domain];
  if (!target) fail(`legacy domain target missing: ${domain}`);
  else if (!/^https:\/\/(ekodi\.kr|my\.ekodi\.kr|api\.ekodi\.kr)(\/|$)/.test(target)) fail(`legacy target violates canonical grammar: ${domain} -> ${target}`);
}

if (!Array.isArray(coreData.protectedTables) || coreData.protectedTables.length < 4) fail('core data protection table set is incomplete');
for (const table of ['customer_tenants','customer_users','customer_memberships','customer_access_grants']) if (!coreData.protectedTables?.includes(table)) fail(`core source-of-truth table not protected: ${table}`);
if (!String(coreData.rule || '').includes('must not directly reference EKODI Core protected tables')) fail('core data access rule missing');

if (workspace.schemaVersion !== 3) fail('service workspace policy schemaVersion must be 3');
if (workspace.identityAuthority !== 'ekodi') fail('service workspace identityAuthority must be ekodi');
if (workspace.commonServiceUserAccessRule?.memberMinimumTier !== 'free') fail('common services must preserve free-member minimum access');
if (workspace.customerWorkspaceRule?.preserveCustomerOwnership !== true) fail('customer workspace ownership must remain preserved');
if (workspace.publicWorkspaceRouting?.canonicalHost !== 'ekodi.kr') fail('service workspace public canonical host must be ekodi.kr');
if (workspace.publicWorkspaceRouting?.workspaceIdentityKey !== 'workspace_id') fail('service workspace identity key must be workspace_id');
if (workspace.publicWorkspaceRouting?.workspaceSubdomains !== 'forbidden') fail('service workspace subdomains must be forbidden');
if (workspace.publicWorkspaceRouting?.canonicalPattern !== '/{slug}') fail('service workspace canonical route must be /{slug}');
if (workspace.publicWorkspaceRouting?.servicePattern !== '/{slug}/{service}') fail('service workspace child service route must be /{slug}/{service}');
if (workspace.publicWorkspaceRouting?.adminPattern !== '/{slug}/admin') fail('service workspace admin route must be /{slug}/admin');
if (workspace.publicWorkspaceRouting?.serviceAdminPattern !== '/{slug}/{service}/admin') fail('service workspace child admin route must be /{slug}/{service}/admin');
if (workspace.publicWorkspaceRouting?.kindEncodedInUrl !== false) fail('service workspace kind/type must not be encoded in public URLs');
if (workspace.subdomainExceptions?.personalHome !== 'my.ekodi.kr') fail('service workspace policy must preserve my.ekodi.kr exception');
if (workspace.subdomainExceptions?.administration !== 'admin.ekodi.kr') fail('service workspace policy must preserve admin.ekodi.kr exception');
if (workspace.subdomainExceptions?.authentication !== 'auth.ekodi.kr') fail('service workspace policy must preserve auth.ekodi.kr exception');

const alignment = storage.constitutionAlignment || {};
if (alignment.identityAuthority !== 'ekodi') fail('storage policy must declare EKODI identity authority');
if (alignment.humanCollaborationStore !== 'google_workspace_shared_drive') fail('human collaboration store must remain explicit');
if (alignment.systemObjectStore !== 'cloudflare_r2') fail('system object target must be cloudflare_r2');
if (alignment.structuredOperationalData !== 'ekodi_controlled_database') fail('structured operational data must remain EKODI-controlled');
if (alignment.legacyCanonicalStore !== storage.canonicalStore) fail('storage transition must name the currently active legacy canonical store');
if (storage.principles?.externalModulesMayAccessDriveDirectly !== false) fail('external modules may not bypass storage gateway');
if (storage.principles?.providerSecretsStayServerSide !== true) fail('provider secrets must remain server-side');

const amendmentDir = path.join(root, 'governance/amendments');
const amendments = fs.readdirSync(amendmentDir).filter(name => name.endsWith('.json')).map(name => json(`governance/amendments/${name}`));
const activeAmendment = amendments.find(item => item.constitutionVersion === constitution.version && item.status === 'approved');
if (!activeAmendment) fail(`no approved amendment/adoption record found for constitution ${constitution.version}`);
if (activeAmendment && activeAmendment.approvedBy !== constitution.changeControl?.owner) fail('constitution approval owner mismatch');
for (const key of ['C0','C1','C2','C3']) if (!constitution.changeControl?.[key]) fail(`change class missing: ${key}`);

if (failures.length) {
  console.error(`EKODI constitution validation failed (${failures.length})`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}
console.log(`EKODI Constitution ${constitution.version}: OK`);
console.log(`- ${Object.keys(boundaries.platforms || {}).length} platform/service boundaries checked`);
console.log(`- ${legacy.size} legacy domains registered with canonical migration targets`);
console.log(`- ${registeredCommon.size} registered common-service boundaries checked`);
console.log('- canonical user spaces: /{slug} on ekodi.kr; workspace kind remains internal metadata');
console.log('- service workspace routing policy aligned to immutable workspace_id');
console.log('- Governance -> OS -> Core -> Responsible Independent Service -> External Connected Service -> Workspace architecture registered');
console.log('- data sovereignty, tenant authority, provider and storage transition rules checked');
