import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const failures = [];
const fail = message => failures.push(message);
const constitution = json('governance/constitution/constitution.json');
const architecture = json('governance/architecture/ekodi-os-architecture.json');
const evolutionModel = json('governance/architecture/ekodi-evolution-model.json');
const boundaries = json('platform-boundaries.json');
const coreData = json('config/core-data-boundaries.json');
const storage = json('config/storage-policy.json');
const workspace = json('config/service-workspace-policy.json');

if (constitution.version !== '1.8.2') fail('constitution version must remain 1.8.2 with the approved Developer/Experience portal amendment');
if (constitution.status !== 'active') fail('constitution must be active');
for (const principle of ['free-first-not-free-only','ekodi-core-is-source-of-truth','provider-independent-by-default','secure-by-default','one-domain-grammar','isolated-parallel-development','verification-first-evolution','security-native-intelligence','evidence-linked-recommendations','secure-projection-minimum-disclosure','integrated-responsibility-distributed-execution-standardized-connections','layered-governance-os-core-services-connections-workspaces','user-surface-engine-separation','capability-first-reuse','sustainable-scale-by-evidence','workspace-over-space','living-digital-commons-north-star','sovereign-autonomy-with-human-authority','person-workspace-role-capability-authority','observe-detect-reason-plan-execute-verify-recover-learn']) {
  if (!constitution.principles?.includes(principle)) fail(`missing constitutional principle: ${principle}`);
}

const architectureModel = constitution.architectureModel || {};
if (architectureModel.registry !== 'governance/architecture/ekodi-os-architecture.json') fail('constitutional architecture registry path mismatch');
if (architectureModel.platformBoundaryRegistry !== 'platform-boundaries.json') fail('constitutional platform boundary registry path mismatch');
if (architectureModel.evolutionRegistry !== 'governance/architecture/ekodi-evolution-model.json') fail('constitutional evolution registry path mismatch');
if (architectureModel.operatingArchitectureVersion !== '1.8.1') fail('constitutional operating architecture version must be 1.8.1');
if (architectureModel.sovereignOperationsRegistry !== 'governance/architecture/sovereign-autonomous-operations.v1.json') fail('constitutional sovereign operations registry path mismatch');
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
if (evolution.noSpeculativeScale !== true) fail('speculative scaling must be constitutionally forbidden');
for (const signal of ['traffic','latency','error_rate','capacity','ai_cost','security_events','revenue','funding','unit_economics']) {
  if (!evolution.observedSignals?.includes(signal)) fail(`Evolution observed signal missing: ${signal}`);
}
for (const gate of ['production_change','shared_core_creation','permission_expansion','paid_cost_commitment','data_migration','destructive_change','security_boundary_change','production_dns_change','new_independent_deployment']) {
  if (!evolution.approvalRequired?.includes(gate)) fail(`Evolution approval gate missing: ${gate}`);
}
for (const control of ['least_privilege','zero_trust','audit','tenant_isolation','sandbox','agent_identity','secure_projection','rollback','backup','disaster_recovery']) {
  if (!evolution.securityCore?.includes(control)) fail(`Evolution security core control missing: ${control}`);
}

const sustainable = constitution.sustainableEvolutionModel || {};
if (sustainable.registry !== 'governance/architecture/ekodi-evolution-model.json') fail('sustainable evolution registry mismatch');
if (sustainable.currentGeneration !== 2 || sustainable.currentGenerationName !== 'Integrated Platform') fail('constitutional current generation must be 2 Integrated Platform');
if (sustainable.nextGeneration !== 3 || sustainable.nextGenerationName !== 'Capability Platform') fail('constitutional next generation must be 3 Capability Platform');
if (sustainable.northStarGeneration !== 8 || sustainable.northStarName !== 'Living Digital Commons') fail('constitutional north star must be Generation 8 Living Digital Commons');
if (sustainable.currentScaleTier !== 'S0') fail('constitutional current scale tier must be S0');
if (sustainable.reuseCapabilityBeforeNewService !== true) fail('capability reuse must precede new service creation');
if (sustainable.sharedBeforeDedicated !== true) fail('shared infrastructure must precede dedicated infrastructure');
if (sustainable.existingDeploymentBoundariesGrandfathered !== true) fail('existing deployment boundaries must be grandfathered as migration baseline');
if (sustainable.newIndependentDeploymentRequiresEvidence !== true) fail('new independent deployment must require evidence');
if (sustainable.workspaceConvergenceTarget !== 'Person + Workspace + Membership + Capability') fail('workspace convergence target mismatch');
if (evolutionModel.currentGeneration !== sustainable.currentGeneration) fail('constitution/evolution current generation mismatch');
if (evolutionModel.northStarGeneration !== sustainable.northStarGeneration) fail('constitution/evolution north star mismatch');
if (evolutionModel.currentScaleTier !== sustainable.currentScaleTier) fail('constitution/evolution scale tier mismatch');
if (evolutionModel.sustainability?.noSpeculativeScale !== true) fail('evolution model must forbid speculative scale');
if (evolutionModel.sustainability?.sharedBeforeDedicated !== true) fail('evolution model must preserve shared-before-dedicated');
if (evolutionModel.sustainability?.reuseCapabilityBeforeNewService !== true) fail('evolution model must preserve capability-first reuse');
if (evolutionModel.boundaryCreationGate?.grandfatherExistingBoundaries !== true) fail('evolution model must grandfather existing boundaries');
if (evolutionModel.workspaceConvergence?.canonicalIdentity !== 'workspace_id') fail('evolution model must preserve workspace_id authority');
if (evolutionModel.workspaceConvergence?.canonicalTerm !== 'Workspace') fail('evolution model must make Workspace canonical');

const sovereign = constitution.sovereignAutonomousOperations || {};
if (JSON.stringify(sovereign.hierarchy || []) !== JSON.stringify(['sovereign','autonomous','agentic','services'])) fail('sovereign hierarchy mismatch');
if (sovereign.authorityContext !== 'Person + Workspace + Role + Capability') fail('sovereign authority context mismatch');
if (sovereign.autonomousAuthorityExpansionForbidden !== true) fail('autonomous authority expansion must be forbidden');
if (sovereign.productionDirectAgentMutationForbidden !== true) fail('direct production mutation by agents must be forbidden');
if (sovereign.verificationAfterExecutionRequired !== true) fail('autonomous execution verification must be required');
if (sovereign.currentGenerationUnchanged !== true || sovereign.currentScaleTierUnchanged !== true) fail('v1.8 must not silently promote generation or scale tier');

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
const registeredCore = new Set(constitution.registeredCoreServiceBoundaries || []);
const targets = constitution.legacyDomainTargets || {};
const customerOwned = constitution.customerOwnedDomainMappings || {};
if (!systemDomains.has('ekodi.kr') || !systemDomains.has('api.ekodi.kr') || !systemDomains.has('auth.ekodi.kr')) fail('canonical system domain set is incomplete');
if (constitution.domainPolicy?.newFeatureSubdomainsForbidden !== true) fail('new feature subdomains must be forbidden');
if (constitution.domainPolicy?.newTenantSubdomainsForbidden !== true) fail('new tenant/workspace subdomains must be forbidden');
if (constitution.domainPolicy?.sustainableBoundaryGateRequired !== true) fail('new system/common/core subdomains must pass the sustainable boundary gate');
if (!registeredCommon.has('journal.ekodi.kr')) fail('registered common-service boundary missing: journal.ekodi.kr');
if (!registeredCommon.has('dev.ekodi.kr')) fail('registered public developer boundary missing: dev.ekodi.kr');
if (!registeredCommon.has('exp.ekodi.kr')) fail('registered experience boundary missing: exp.ekodi.kr');
if (!registeredCommon.has('try.ekodi.kr')) fail('registered Experience compatibility boundary missing: try.ekodi.kr');
if (!registeredCommon.has('invest.ekodi.kr')) fail('registered common-service boundary missing: invest.ekodi.kr');
if (!registeredCommon.has('marketing.ekodi.kr')) fail('registered common-service boundary missing: marketing.ekodi.kr');
if (!registeredCore.has('ai.ekodi.kr')) fail('registered core-service boundary missing: ai.ekodi.kr');
if (!systemDomains.has('dev.ekodi.kr') || !systemDomains.has('exp.ekodi.kr')) fail('public Developer/Experience production boundaries are incomplete');
if ((constitution.systemBoundaries?.development || []).includes('dev.ekodi.kr')) fail('root dev.ekodi.kr must not remain a Development environment host');
const portals=constitution.publicPortalPolicy||{};
if (portals.developerPortal!=='https://dev.ekodi.kr' || portals.experiencePortal!=='https://exp.ekodi.kr') fail('public portal canonical domain policy mismatch');
if (portals.sharedRuntimeAllowedAtS0!==true) fail('public portal S0 shared-runtime policy missing');
if (portals.experienceDataPolicy!=='synthetic-only' || portals.developerDataPolicy!=='public-contract-only') fail('public portal data projection policy mismatch');
const separation=constitution.userSurfaceEngineSeparation||{};
if (separation.canonicalMarketingProduct !== 'https://ekodi.kr/ekodibiz/marketing-ai') fail('Marketing product canonical drift');
if (separation.canonicalWorkspaceMarketingPattern !== 'https://ekodi.kr/{slug}/marketing') fail('workspace Marketing canonical pattern drift');
if (separation.marketingCore !== 'https://marketing.ekodi.kr') fail('Marketing Core boundary drift');
if (separation.aiGateway !== 'https://ai.ekodi.kr') fail('AI Gateway/Core boundary drift');
if (separation.customerAiSubdomains !== 'legacy_execution_alias_only') fail('customer AI subdomains must remain legacy execution aliases');
if (separation.providerTopologyVisibleToOrdinaryUsers !== false) fail('provider topology must stay hidden from ordinary users');
if (targets['cgma.ekodi.kr'] !== 'https://ekodi.kr/cgma') fail('CGMA legacy domain must target the canonical platform path');
if (customerOwned['cgma.or.kr'] !== 'https://ekodi.kr/cgma') fail('CGMA customer-owned domain mapping must target the canonical platform path');

const expectedNamespaces = ['workspace-root-slug'];
if (JSON.stringify(constitution.publicNamespaces || []) !== JSON.stringify(expectedNamespaces)) {
  fail(`public workspace namespaces must be ${expectedNamespaces.join(', ')}`);
}
if (constitution.workspaceRoutingPolicy?.canonicalHost !== 'ekodi.kr') fail('workspace canonical host must be ekodi.kr');
if (constitution.workspaceRoutingPolicy?.identityKey !== 'workspace_id') fail('workspace routing identity key must be workspace_id');
if (constitution.workspaceRoutingPolicy?.workspaceSubdomainsForbidden !== true) fail('workspace subdomains must be forbidden');
if (constitution.workspaceRoutingPolicy?.personalHomeSubdomainException !== 'my.ekodi.kr') fail('My EKODI must remain the personal-home subdomain exception');
if (constitution.workspaceRoutingPolicy?.canonicalOperatingTerm !== 'Workspace') fail('Workspace must be the canonical operating-context term');
if (constitution.workspaceRoutingPolicy?.legacySpaceIsCompatibilityOnly !== true) fail('Space must remain compatibility-only during migration');

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
if (workspace.userSurfaceTopologyPolicy?.customerSpecificAiSubdomains !== 'forbidden_as_canonical') fail('service workspace policy must forbid customer AI subdomains as canonical');
if (workspace.userSurfaceTopologyPolicy?.marketingProduct !== 'https://ekodi.kr/ekodibiz/marketing-ai') fail('service workspace Marketing product canonical drift');
if (workspace.userSurfaceTopologyPolicy?.workspaceMarketingPattern !== 'https://ekodi.kr/{slug}/marketing') fail('service workspace Marketing path pattern drift');

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
console.log(`- sustainable evolution: generation ${sustainable.currentGeneration} -> ${sustainable.northStarGeneration}, scale ${sustainable.currentScaleTier}`);
console.log('- canonical user spaces: /{slug} on ekodi.kr; workspace kind remains internal metadata');
console.log('- Workspace is canonical; Space remains compatibility-only during migration');
console.log('- service workspace routing policy aligned to immutable workspace_id');
console.log('- Sovereign -> Autonomous -> Agentic -> Services operating hierarchy registered over Governance/OS/Core service boundaries');
console.log('- data sovereignty, tenant authority, provider, storage and sustainable scaling rules checked');
