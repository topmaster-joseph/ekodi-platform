import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const failures = [];
const fail = message => failures.push(message);
const constitution = json('governance/constitution/constitution.json');
const boundaries = json('platform-boundaries.json');
const coreData = json('config/core-data-boundaries.json');
const storage = json('config/storage-policy.json');
const workspace = json('config/service-workspace-policy.json');

if (constitution.version !== '1.4.1') fail('constitution version must remain 1.4.1 with approved Secure Projection, Invest common-service, public-namespace and verification-first evolution amendments');
if (constitution.status !== 'active') fail('constitution must be active');
for (const principle of ['free-first-not-free-only','ekodi-core-is-source-of-truth','provider-independent-by-default','secure-by-default','one-domain-grammar','isolated-parallel-development','verification-first-evolution','security-native-intelligence','evidence-linked-recommendations','secure-projection-minimum-disclosure']) {
  if (!constitution.principles?.includes(principle)) fail(`missing constitutional principle: ${principle}`);
}

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

if (JSON.stringify(constitution.publicNamespaces || []) !== JSON.stringify(['{public_namespace}'])) {
  fail('public workspace namespace grammar must be one globally unique {public_namespace}');
}
const routing = constitution.workspaceRoutingPolicy || {};
if (routing.canonicalHost !== 'ekodi.kr') fail('workspace canonical host must be ekodi.kr');
if (routing.identityKey !== 'workspace_id') fail('workspace routing identity key must be workspace_id');
if (routing.publicNamespaceKey !== 'public_namespace') fail('workspace public namespace key must be public_namespace');
if (routing.publicNamespacePattern !== '/{public_namespace}') fail('workspace public namespace pattern must be /{public_namespace}');
if (routing.servicePattern !== '/{public_namespace}/{service}') fail('workspace service pattern must nest below public namespace');
if (routing.workspaceTypeInUrl !== false) fail('workspace type must not be encoded in the public URL');
if (routing.displayNameUnique !== false) fail('workspace display names must be allowed to repeat');
if (routing.publicNamespaceUnique !== true) fail('public_namespace must be globally unique');
if (routing.namespaceConflictPolicy !== 'first_valid_claim_wins_then_suggest_alternatives') fail('namespace conflict policy mismatch');
if (routing.workspaceSubdomainsForbidden !== true) fail('workspace subdomains must be forbidden');
if (routing.personalHomeSubdomainException !== 'my.ekodi.kr') fail('My EKODI must remain the personal-home subdomain exception');

const canonicalPatterns = new Set(constitution.canonicalWorkspacePatterns || []);
for (const pattern of ['https://ekodi.kr/{public_namespace}','https://ekodi.kr/{public_namespace}/{service}']) {
  if (!canonicalPatterns.has(pattern)) fail(`canonical workspace pattern missing: ${pattern}`);
}
for (const forbidden of ['https://ekodi.kr/personal/{slug}','https://ekodi.kr/org/{slug}','https://ekodi.kr/group/{slug}','https://ekodi.kr/project/{slug}']) {
  if (canonicalPatterns.has(forbidden)) fail(`legacy typed workspace pattern must not remain canonical: ${forbidden}`);
}

const legacyPathAliases = constitution.legacyPathAliases || {};
for (const legacyPath of ['/personal/{slug}','/org/{slug}','/group/{slug}','/project/{slug}','/people/{slug}','/biz/{slug}']) {
  if (legacyPathAliases[legacyPath] !== '/{public_namespace}') fail(`${legacyPath} must migrate to /{public_namespace}`);
}
if (legacyPathAliases['https://space.ekodi.kr/{path}'] !== 'https://ekodi.kr/{path}') fail('space.ekodi.kr must map to ekodi.kr path');
if (legacyPathAliases['https://user.ekodi.kr/{path}'] !== 'https://ekodi.kr/{path}') fail('user.ekodi.kr must map to ekodi.kr path');

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
const publicRouting = workspace.publicWorkspaceRouting || {};
if (publicRouting.canonicalHost !== 'ekodi.kr') fail('service workspace public canonical host must be ekodi.kr');
if (publicRouting.workspaceIdentityKey !== 'workspace_id') fail('service workspace identity key must be workspace_id');
if (publicRouting.publicNamespaceKey !== 'public_namespace') fail('service workspace namespace key must be public_namespace');
if (publicRouting.canonicalPattern !== '/{public_namespace}') fail('service workspace canonical pattern must be /{public_namespace}');
if (publicRouting.servicePattern !== '/{public_namespace}/{service}') fail('service workspace service path must nest under public namespace');
if (publicRouting.workspaceTypeInUrl !== false) fail('service workspace type must not be encoded in URL');
if (publicRouting.workspaceDisplayNameUnique !== false) fail('service workspace display names must be allowed to repeat');
if (publicRouting.publicNamespaceUnique !== true) fail('service workspace public namespace must be unique');
if (publicRouting.namespaceConflictPolicy !== 'first_valid_claim_wins_then_suggest_alternatives') fail('service namespace conflict policy mismatch');
if (publicRouting.workspaceSubdomains !== 'forbidden') fail('service workspace subdomains must be forbidden');
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
console.log('- canonical user spaces: /{public_namespace} with nested /{service} on ekodi.kr');
console.log('- workspace_id remains immutable identity; public_namespace is the unique routing locator');
console.log('- data sovereignty, tenant authority, provider and storage transition rules checked');
