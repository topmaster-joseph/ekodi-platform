import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const failures = [];
const fail = message => failures.push(message);
const constitution = json('governance/constitution/constitution.json');
const supremeAttributes = json('governance/constitution/supreme-attributes.v1.json');
const packageJson = json('package.json');
const architecture = json('governance/architecture/ekodi-os-architecture.json');
const evolutionModel = json('governance/architecture/ekodi-evolution-model.json');
const boundaries = json('platform-boundaries.json');
const coreData = json('config/core-data-boundaries.json');
const storage = json('config/storage-policy.json');
const workspace = json('config/service-workspace-policy.json');
const surfaceVerification = json('config/surface-system-verification-policy.json');
const executionFabric = json('config/autonomous-execution-fabric-policy.json');
const remoteComputer = json('config/remote-computer-execution-policy.json');

if (constitution.version !== '1.24.0') fail('constitution version must be 1.24.0 with Capability Before Service enforcement plus all prior approved amendments');
if (constitution.status !== 'active') fail('constitution must be active');
for (const principle of ['free-first-not-free-only','ekodi-core-is-source-of-truth','provider-independent-by-default','secure-by-default','one-domain-grammar','isolated-parallel-development','verification-first-evolution','security-native-intelligence','evidence-linked-recommendations','secure-projection-minimum-disclosure','integrated-responsibility-distributed-execution-standardized-connections','layered-governance-os-core-services-connections-workspaces','user-surface-engine-separation','capability-first-reuse','capability-before-service-enforced','sustainable-scale-by-evidence','workspace-over-space','generation-10-active-baseline','open-ended-evidence-driven-generation-evolution','sovereign-autonomy-with-human-authority','person-workspace-role-capability-authority','observe-detect-reason-plan-execute-verify-recover-learn','ekodibiz-exclusive-commercial-subject','ordinary-user-information-first-commercial-separation','completion-continuity-through-recoverable-interruptions','supreme-attributes-binding','guest-open-public-user-surfaces','self-verifying-all-surface-system-evidence','ekodi-owned-virtualization-first','authentication-return-continuity','canonical-human-url-without-tracking-query','evidence-gated-ai-claims','evidence-gated-external-knowledge']) {
  if (!constitution.principles?.includes(principle)) fail(`missing constitutional principle: ${principle}`);
}

const capabilityBeforeService = constitution.capabilityFirstServiceCreationPolicy || {};
if (capabilityBeforeService.id !== 'CAPABILITY-BEFORE-SERVICE-001' || capabilityBeforeService.status !== 'enforced' || capabilityBeforeService.mode !== 'mandatory') fail('Capability Before Service constitutional policy must remain mandatory');
if (capabilityBeforeService.existingCapabilityReuseRequired !== true || capabilityBeforeService.foundryBeforeServiceWhenCapabilityGapExists !== true) fail('existing Capability reuse and Foundry-first gap resolution must remain mandatory');
if (capabilityBeforeService.sampleBeforeUserService !== true || Number(capabilityBeforeService.minimumVerifiedSampleRuns) < 3) fail('new services must require sample-first validation with at least three verified runs');
if (capabilityBeforeService.demandEvidenceRequired !== true || capabilityBeforeService.humanPackagingReviewRequired !== true) fail('new services must require demand evidence and human packaging review');
if (capabilityBeforeService.humanPackagingReviewAuthority !== 'ekodi_platform_super_administrator') fail('new service packaging authority must remain the EKODI Platform Super Administrator');
if (capabilityBeforeService.automaticUserServiceCreationForbidden !== true || capabilityBeforeService.newServiceWithoutEvidenceBlocksCi !== true) fail('automatic/evidence-free user service creation must remain blocked');
if (capabilityBeforeService.newIndependentBoundaryAlsoRequiresSustainableBoundaryGate !== true) fail('new independent service boundaries must retain the sustainable boundary gate');
if (capabilityBeforeService.currentServicesGrandfatheredOnlyAtAdoption !== true || capabilityBeforeService.grandfatheredListExpansionRequiresConstitutionalAmendment !== true) fail('service grandfather baseline must remain adoption-only and constitutionally locked');
if (capabilityBeforeService.evidenceRegistry !== 'config/service-creation-evidence.json') fail('service creation evidence registry path drifted');
if (!constitution.changeControl?.protectedPaths?.includes('scripts/validate-capability-first-service-creation.mjs')) fail('capability-before-service validator must remain constitutionally protected');

const virtualizationSovereignty = constitution.virtualizationSovereigntyPolicy || {};
if (virtualizationSovereignty.id !== 'VIRTUALIZATION-SOVEREIGNTY-001' || virtualizationSovereignty.status !== 'enforced') fail('virtualization sovereignty constitutional policy must remain enforced');
if (virtualizationSovereignty.orchestrationOwner !== 'ekodi-orchestrator' || virtualizationSovereignty.ekodiOwnedVirtualizationFirst !== true) fail('EKODI Orchestrator must enforce native-first virtualization');
if (virtualizationSovereignty.externalProviderRole !== 'temporary-replaceable-fallback-only' || virtualizationSovereignty.fallbackReasonAndAuditRequired !== true) fail('external virtualization must remain an audited temporary fallback');
if (virtualizationSovereignty.fallbackMustPreserveOrIncreaseSecurityAndIsolation !== true || virtualizationSovereignty.paidExternalAutoUpgradeForbidden !== true) fail('virtualization fallback may not weaken security/isolation or auto-upgrade paid capacity');
if (virtualizationSovereignty.successfulExternalFallbackMustCreateNativeCapabilityGapRecord !== true || virtualizationSovereignty.correctableNativeGapMustNotInterruptUserWorkflow !== true) fail('native virtualization gaps must be tracked and recovered without user handoff');
if (virtualizationSovereignty.virtualizationOnlyArchitectureForbidden !== true) fail('EKODI execution architecture must not become virtualization-only');
if (surfaceVerification.execution?.defaultHarness !== 'ekodi-owned-isolated-browser-runtime' || surfaceVerification.execution?.virtualizationProviderPolicy?.nativeFirst !== true) fail('surface verification operational policy must default to EKODI-owned virtualization');
if (surfaceVerification.execution?.nativeWorkerPolicy !== 'config/background-browser-worker-policy.json' || surfaceVerification.execution?.nativeWorkerId !== 'ekodi-background-browser-worker') fail('surface verification must bind the native background browser worker');
if (executionFabric.orchestration?.selection?.ekodiOwnedVirtualizationFirst !== true || executionFabric.providers?.virtualization?.nativeFirst !== true) fail('execution fabric must select EKODI-owned virtualization first');
if (remoteComputer.strategy?.nativeFirst !== true || remoteComputer.strategy?.externalProviderRole !== 'temporary-replaceable-fallback-only' || remoteComputer.strategy?.buildNativeCapabilityBeforePermanentExternalDependency !== true) fail('remote computer policy must preserve EKODI-native-first virtualization');

const supremePolicy = constitution.supremeAttributesPolicy || {};
if (supremePolicy.id !== 'EKODI-SUPREME-ATTRIBUTES-001') fail('supreme attributes constitutional policy id mismatch');
if (supremePolicy.registry !== 'governance/constitution/supreme-attributes.v1.json') fail('supreme attributes registry path mismatch');
if (supremePolicy.bindingLevel !== 'supreme-mandatory') fail('supreme attributes must remain supreme-mandatory');
if (supremePolicy.attributeCount !== 21 || supremePolicy.allRequired !== true) fail('all 21 supreme attributes must remain mandatory');
if (supremePolicy.nonRegressionRequired !== true || supremePolicy.appliesToAllPlatformChanges !== true || supremePolicy.appliesToFutureGenerations !== true) fail('supreme attributes non-regression/future-generation binding missing');
if (supremePolicy.implementationWaiverForbidden !== true || supremePolicy.aiSelfWaiverForbidden !== true || supremePolicy.exceptionRequiresConstitutionalAmendment !== true) fail('supreme attribute waiver protection missing');
if (supremePolicy.finalAuthority !== 'ekodi_platform_super_administrator') fail('supreme attributes final authority must remain EKODI Platform Super Administrator');

const expectedSupremeAttributeIds = ["independence","modularity","scalability","standardization","consistency","collaboration","agility","creativity","security","evolvability","adaptability","replaceability","reversibility","resilience","observability","verifiability","interoperability","data-sovereignty","autonomous-operations","economic-sustainability","simplicity"];
if (supremeAttributes.schemaVersion !== 1 || supremeAttributes.id !== 'EKODI-SUPREME-ATTRIBUTES-001' || supremeAttributes.status !== 'active') fail('supreme attributes registry identity/status mismatch');
if (supremeAttributes.bindingLevel !== 'supreme-mandatory') fail('supreme attributes registry binding level mismatch');
if (supremeAttributes.generationBaseline !== 10) fail('supreme attributes registry must preserve Generation 10 baseline');
if (supremeAttributes.rules?.allAttributesRequiredTogether !== true || supremeAttributes.rules?.nonRegressionRequired !== true) fail('supreme attributes must be enforced together with non-regression');
if (supremeAttributes.rules?.implementationWaiverForbidden !== true || supremeAttributes.rules?.providerWaiverForbidden !== true || supremeAttributes.rules?.aiSelfWaiverForbidden !== true || supremeAttributes.rules?.serviceLocalOverrideForbidden !== true) fail('supreme attributes waiver rules are incomplete');
if (supremeAttributes.rules?.exceptionRequiresConstitutionalAmendment !== true) fail('supreme attribute exceptions must require constitutional amendment');
if (supremeAttributes.rules?.securityDataSovereigntyAndHumanAuthorityFloorsCannotBeReducedByTradeoff !== true) fail('security/data-sovereignty/human-authority floors must be non-reducible');
if (supremeAttributes.authority?.finalHumanAuthority !== 'ekodi_platform_super_administrator' || supremeAttributes.authority?.automationMayChangeConstitution !== false || supremeAttributes.authority?.automationMayExpandOwnAuthority !== false) fail('supreme attribute sovereign authority contract mismatch');
if (supremeAttributes.enforcement?.constitutionValidatorRequired !== true || supremeAttributes.enforcement?.ciGateRequired !== true || supremeAttributes.enforcement?.guardedPromotionRequired !== true) fail('supreme attribute enforcement gates must remain enabled');
const actualSupremeAttributeIds = (supremeAttributes.attributes || []).map(item => item.id);
if (JSON.stringify(actualSupremeAttributeIds) !== JSON.stringify(expectedSupremeAttributeIds)) fail('supreme attribute set/order drifted from the approved 21 attributes');
for (const attribute of supremeAttributes.attributes || []) {
  if (attribute.required !== true || attribute.nonRegression !== true) fail(`supreme attribute must remain mandatory/non-regressive: ${attribute.id}`);
  if (!attribute.nameKo || !attribute.nameEn || !attribute.intent) fail(`supreme attribute metadata incomplete: ${attribute.id}`);
  const validators = attribute.enforcement?.validators || [];
  if (!validators.length || attribute.enforcement?.evidenceRequired !== true) fail(`supreme attribute enforcement evidence missing: ${attribute.id}`);
  for (const validatorName of validators) if (!packageJson.scripts?.[validatorName]) fail(`supreme attribute validator command missing for ${attribute.id}: ${validatorName}`);
}

const commercialSubject = constitution.commercialSubjectPolicy || {};
if (commercialSubject.id !== 'REV-001') fail('commercial subject policy id must be REV-001');
if (commercialSubject.subject !== 'ekodibiz' || commercialSubject.exclusiveForEkodiRevenueBusinesses !== true) fail('EKODIBIZ must remain the exclusive commercial subject for EKODI revenue businesses');
if (commercialSubject.technologyProvider !== 'ekodi') fail('EKODI must remain the technology/platform provider');
if (commercialSubject.ordinaryUserMode !== 'information-only') fail('ordinary-user revenue surface must remain information-only');
if (commercialSubject.tenantCommercialExecution !== 'ekodibiz-managed-only') fail('tenant commercial execution must remain EKODIBIZ-managed only');
if (commercialSubject.externalUserOwnedBusinessUnaffected !== true) fail('external user-owned businesses must remain outside the platform commercial-subject restriction');

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


const completionContinuity = constitution.completionContinuityPolicy || {};
if (completionContinuity.id !== 'COMPLETE-CONTINUITY-001' || completionContinuity.status !== 'active') fail('Completion Continuity constitutional policy must remain active');
if (completionContinuity.interruptionDefault !== 'recoverable') fail('execution interruptions must default to recoverable');
if (completionContinuity.checkpointRequired !== true || completionContinuity.resumeFromCheckpoint !== true) fail('recoverable interruptions must checkpoint and resume');
if (completionContinuity.alternateAuthorizedPathBeforeEscalation !== true) fail('authorized alternate execution paths must be attempted before escalation');
if (completionContinuity.blockedReservedForAuthorityOrDependency !== true) fail('blocked state must be reserved for genuine authority/dependency blocks');
if (completionContinuity.authorityExpansionForbidden !== true || completionContinuity.productionVerificationStillRequired !== true) fail('continuity must not widen authority or weaken production verification');
for (const interruptionClass of ['session-ended','tool-unavailable','connector-failure','rate-limit','execution-window-ended','transient-infrastructure-failure']) if (!completionContinuity.recoverableInterruptionClasses?.includes(interruptionClass)) fail(`recoverable interruption class missing: ${interruptionClass}`);

const surfaceSystemVerification = constitution.surfaceSystemVerificationPolicy || {};
if (surfaceSystemVerification.id !== 'SURFACE-SYSTEM-VERIFICATION-001' || surfaceSystemVerification.status !== 'active') fail('universal surface system verification policy must remain active');
if (surfaceSystemVerification.completionRule !== 'system-verified-before-complete') fail('all governed surfaces must require System Verified before completion');
if (surfaceSystemVerification.manualUserTestingDefaultGateForbidden !== true) fail('manual user testing must not be the default completion gate');
if (surfaceSystemVerification.virtualizationPolicy?.requiredAsAvailableVerificationMethod !== true || surfaceSystemVerification.virtualizationPolicy?.virtualizationOnlyArchitectureForbidden !== true) fail('surface verification must provide virtualization without becoming virtualization-only architecture');
for (const actor of ['guest','authenticated-user','workspace-member','operator','workspace-or-service-admin','platform-super-admin']) if (!surfaceSystemVerification.syntheticActors?.includes(actor)) fail(`surface verification synthetic actor missing: ${actor}`);
for (const profile of ['mobile-portrait','mobile-landscape','tablet','desktop']) if (!surfaceSystemVerification.deviceProfiles?.includes(profile)) fail(`surface verification device profile missing: ${profile}`);
for (const layer of ['route-and-canonical-url','authentication-session-and-token-hygiene','authorization-role-capability','safe-public-projection','functional-interaction','responsive-layout-and-overflow','secure-projection-and-secret-leakage','api-and-data-contract','observability-and-error-surface','real-production-host-canary']) if (!surfaceSystemVerification.requiredVerificationLayers?.includes(layer)) fail(`surface verification layer missing: ${layer}`);
if (surfaceSystemVerification.productionCanary?.required !== true || surfaceSystemVerification.productionCanary?.realCanonicalHostRequired !== true) fail('real canonical production canary must remain mandatory');
if (surfaceSystemVerification.productionCanary?.destructiveMutationForbidden !== true) fail('surface verification production canary must forbid destructive mutation');
if (surfaceSystemVerification.failurePolicy?.repairRetestRedeployReverifyBeforeCompletion !== true || surfaceSystemVerification.failurePolicy?.askUserToTestAsDefaultFallbackForbidden !== true) fail('surface verification failure recovery contract drifted');
if (surfaceSystemVerification.exceptionPolicy?.exceptionRequiresUnsimulatableDeviceOsProviderBehaviorOrTelemetryConflict !== true || surfaceSystemVerification.exceptionPolicy?.exceptionMustBeNarrowScopedAuditableAndOwnerVisible !== true) fail('surface verification exception policy drifted');

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
if (sustainable.currentGeneration !== 10 || sustainable.currentGenerationName !== 'Self-Architecture Optimization') fail('constitutional current generation must be 10 Self-Architecture Optimization');
if (sustainable.nextGeneration !== null || sustainable.nextGenerationName !== 'Evidence-defined future generation') fail('future generation must remain evidence-defined rather than predeclared');
if (sustainable.northStarGeneration !== null || sustainable.northStarName !== 'Open-Ended Evidence-Driven Evolution') fail('constitutional evolution must remain open-ended beyond Generation 10');
if (sustainable.currentScaleTier !== 'S0') fail('constitutional current scale tier must be S0');
if (sustainable.reuseCapabilityBeforeNewService !== true) fail('capability reuse must precede new service creation');
if (sustainable.sharedBeforeDedicated !== true) fail('shared infrastructure must precede dedicated infrastructure');
if (sustainable.existingDeploymentBoundariesGrandfathered !== true) fail('existing deployment boundaries must be grandfathered as migration baseline');
if (sustainable.newIndependentDeploymentRequiresEvidence !== true) fail('new independent deployment must require evidence');
if (sustainable.workspaceConvergenceTarget !== 'Person + Workspace + Membership + Capability') fail('workspace convergence target mismatch');
if (evolutionModel.currentGeneration !== sustainable.currentGeneration) fail('constitution/evolution current generation mismatch');
if (evolutionModel.northStarGeneration !== sustainable.northStarGeneration || evolutionModel.northStarName !== sustainable.northStarName) fail('constitution/evolution open-ended north star mismatch');
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

const surfaces=constitution.surfaceRoutingPolicy||{};
if (surfaces.canonicalHost !== 'ekodi.kr') fail('one-domain canonical host must be ekodi.kr');
for (const [key,path] of Object.entries({user:'/my',admin:'/admin',authentication:'/auth',api:'/api',mcp:'/mcp',webhooks:'/webhooks',health:'/health'})) if (surfaces[key] !== path) fail(`canonical surface drift: ${key}`);
if (surfaces.humanSurfacesUsePaths !== true || surfaces.subdomainExecutionBoundariesAreNonCanonical !== true) fail('one-domain surface policy flags missing');
const systemDomains = new Set(constitution.systemBoundaries?.production || []);
const legacy = new Set(constitution.legacyDomainAllowlist || []);
const registeredCommon = new Set(constitution.registeredCommonServiceBoundaries || []);
const registeredCommonPaths = new Set(constitution.registeredCommonServicePaths || []);
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
if (!registeredCommonPaths.has('/invest')) fail('registered common-service path missing: /invest');
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
if (constitution.workspaceRoutingPolicy?.personalHomeSubdomainException !== null || constitution.workspaceRoutingPolicy?.personalHomeCanonicalPath !== '/my') fail('My EKODI canonical surface must be /my with no user-entry subdomain exception');
if (constitution.workspaceRoutingPolicy?.canonicalOperatingTerm !== 'Workspace') fail('Workspace must be the canonical operating-context term');
if (constitution.workspaceRoutingPolicy?.legacySpaceIsCompatibilityOnly !== true) fail('Space must remain compatibility-only during migration');

const canonicalPatterns = constitution.canonicalWorkspacePatterns || [];
if (JSON.stringify(canonicalPatterns) !== JSON.stringify(['https://ekodi.kr/{slug}'])) fail('canonical workspace pattern must be https://ekodi.kr/{slug}');
if (constitution.workspaceRoutingPolicy?.kindEncodedInUrl !== false) fail('workspace kind/type must not be encoded in public URLs');
if (constitution.workspaceRoutingPolicy?.reservedRootSlugsManagedBy !== 'platform_route_registry') fail('workspace root slug collisions must be controlled by the platform route registry');
const servicePatterns = new Set(constitution.canonicalWorkspaceServicePatterns || []);
for (const pattern of ['https://ekodi.kr/{slug}/{service}']) {
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

if (workspace.schemaVersion !== 7) fail('service workspace policy schemaVersion must be 7');
if (workspace.identityAuthority !== 'ekodi') fail('service workspace identityAuthority must be ekodi');
if (workspace.commonServiceUserAccessRule?.memberMinimumTier !== 'free') fail('common services must preserve free-member minimum access');
const canonicalUrlQuery=constitution.canonicalUrlQueryPolicy||{};
if(canonicalUrlQuery.id!=='CANONICAL-URL-QUERY-001'||canonicalUrlQuery.status!=='active') fail('canonical human URL query hygiene policy must remain active');
if(canonicalUrlQuery.canonicalAddressRule!=='canonical-path-plus-functional-query-only'||canonicalUrlQuery.trackingQueryDisposition!=='remove-from-visible-url') fail('canonical human URLs must retain only canonical path plus functional query context');
if(canonicalUrlQuery.functionalQueryMustBePreserved!==true) fail('functional query context must be preserved during tracking cleanup');
if(canonicalUrlQuery.getAndHeadCanonicalization!=='308-redirect-before-human-surface-routing') fail('GET/HEAD human surfaces must canonicalize tracking queries before page routing');
if(canonicalUrlQuery.browserFallback!=='history.replaceState-on-shared-shell') fail('shared Shell must keep a browser-side canonical URL fallback');
for(const prefix of ['utm_']) if(!canonicalUrlQuery.trackingPrefixes?.includes(prefix)) fail(`canonical URL tracking prefix missing: ${prefix}`);
for(const key of ['gclid','fbclid','msclkid','srsltid','_gl']) if(!canonicalUrlQuery.trackingKeys?.includes(key)) fail(`canonical URL tracking key missing: ${key}`);
for(const key of ['return_to','code','state','page','q','filter']) if(!canonicalUrlQuery.functionalExamples?.includes(key)) fail(`canonical URL functional-query preservation example missing: ${key}`);
for(const route of ['/api','/webhooks','/mcp','/health','static-assets']) if(!canonicalUrlQuery.excludedSystemRoutes?.includes(route)) fail(`canonical URL system-route exclusion missing: ${route}`);
if(canonicalUrlQuery.trackingQueryMayNotDefineIdentityAuthorizationOrRouting!==true) fail('tracking query parameters must never define identity, authorization or routing');
if(canonicalUrlQuery.appliesToLegacyHumanEntryAliases!==true) fail('canonical URL query hygiene must cover legacy human-entry aliases');

const authReturn=constitution.authenticationReturnContinuityPolicy||{};
if(authReturn.id!=='AUTH-RETURN-CONTINUITY-001'||authReturn.status!=='active') fail('authentication return continuity policy must remain active');
if(authReturn.exactPreLoginReturnPreferred!==true||authReturn.initiatingSiteContextMustBePreserved!==true) fail('authentication must preserve the initiating site and exact trusted pre-login target');
if(authReturn.crossServicePostLoginFallbackForbidden!==true) fail('cross-service post-login fallback must remain forbidden');
if(authReturn.myEkodi?.genericPostLoginFallbackForbidden!==true) fail('My EKODI must not be a generic post-login fallback');
if(JSON.stringify(authReturn.myEkodi?.allowedInitiators)!==JSON.stringify(['my','portal'])) fail('My EKODI login initiators must remain limited to my/portal');
if(authReturn.myEkodi?.misroutedTrustedTokenMustRedirectBeforeConsumption!==true) fail('My EKODI must redirect misrouted trusted handoff tokens before consumption');
if(authReturn.adminReturn?.exactAdminChildPathRequired!==true) fail('workspace/service admin login must preserve exact child admin path');
const workspaceAuthReturn=workspace.authenticationReturnPolicy||{};
if(workspaceAuthReturn.policyId!=='AUTH-RETURN-CONTINUITY-001'||workspaceAuthReturn.exactPreLoginUrlFirst!==true) fail('service/workspace authentication return policy mismatch');
if(workspaceAuthReturn.siteLocalContextRequired!==true||workspaceAuthReturn.crossSiteFallback!==false) fail('service/workspace login must preserve site-local context and forbid cross-site fallback');
if(workspaceAuthReturn.platformMyEkodi?.genericFallback!==false) fail('service/workspace policy must forbid generic My EKODI fallback');
if(JSON.stringify(workspaceAuthReturn.platformMyEkodi?.allowedLoginInitiators)!==JSON.stringify(['my','portal'])) fail('service/workspace My EKODI initiators drifted');
if(workspaceAuthReturn.adminChildPathReturnRequired!==true||workspaceAuthReturn.misroutedMyHandoffMustRecoverBeforeTokenConsumption!==true) fail('admin return/misroute recovery policy drifted');
const publicUserSurface=constitution.publicUserSurfacePolicy||{};
if(publicUserSurface.id!=='PUBLIC-USER-SURFACE-001'||publicUserSurface.defaultAccess!=='guest-open') fail('constitutional public user surfaces must default to guest-open');
if(publicUserSurface.authenticationEffect!=='enhance-not-replace-public-experience') fail('authentication must enhance, not replace, public user surfaces');
if(publicUserSurface.safePublicProjectionRequired!==true||publicUserSurface.canonicalPublicLoginWallForbidden!==true) fail('safe guest public projection must be mandatory');
if(publicUserSurface.permissionFailureReplacesPublicPage!==false) fail('permission failures must not replace canonical public pages');
if(publicUserSurface.explicitPrivateException?.requiresExplicitClassification!==true||publicUserSurface.explicitPrivateException?.permissionErrorAsLandingForbidden!==true) fail('private surface exceptions must be explicit and may not degrade into permission-error landings');
const workspacePublicDefault=workspace.publicUserSurfaceDefault||{};
if(workspacePublicDefault.policyId!=='PUBLIC-USER-SURFACE-001'||workspacePublicDefault.defaultAccess!=='guest-open') fail('service/workspace public user surface default must be guest-open');
if(workspacePublicDefault.loginEffect!=='enhance-not-replace'||workspacePublicDefault.canonicalPublicRootLoginWallForbidden!==true) fail('service/workspace login policy must enhance rather than replace public pages');
for(const visibility of workspace.visibilityPolicies||[]) if(visibility.id!=='guest_visible'&&visibility.mayReplaceCanonicalPublicRoot!==false) fail(`${visibility.id} may not replace a canonical public root`);
if (workspace.customerWorkspaceRule?.preserveCustomerOwnership !== true) fail('customer workspace ownership must remain preserved');
if (workspace.publicWorkspaceRouting?.canonicalHost !== 'ekodi.kr') fail('service workspace public canonical host must be ekodi.kr');
if (workspace.publicWorkspaceRouting?.workspaceIdentityKey !== 'workspace_id') fail('service workspace identity key must be workspace_id');
if (workspace.publicWorkspaceRouting?.workspaceSubdomains !== 'forbidden') fail('service workspace subdomains must be forbidden');
if (workspace.publicWorkspaceRouting?.canonicalPattern !== '/{slug}') fail('service workspace canonical route must be /{slug}');
if (workspace.publicWorkspaceRouting?.servicePattern !== '/{slug}/{service}') fail('service workspace child service route must be /{slug}/{service}');
if (workspace.publicWorkspaceRouting?.adminPattern !== '/{slug}/admin' || workspace.publicWorkspaceRouting?.serviceAdminPattern !== '/{slug}/{service}/admin') fail('workspace and child-site administration must use each managed public path plus /admin');
if (workspace.publicWorkspaceRouting?.adminSurface !== '/admin/workspaces' || workspace.publicWorkspaceRouting?.adminSurfaceRole !== 'directory-observability-and-handoff-only' || workspace.publicWorkspaceRouting?.higherAdminChildAliases !== 'forbidden') fail('central Admin may aggregate and hand off but must not own alternate child-admin URLs');
if (constitution.workspaceRoutingPolicy?.workspaceAdminCanonical !== '/{slug}/admin' || constitution.workspaceRoutingPolicy?.workspaceChildAdminCanonical !== '/{slug}/{service}/admin' || constitution.workspaceRoutingPolicy?.centralAdminChildAliasForbidden !== true) fail('constitutional site-owned administrator canonical paths drifted');
if (workspace.publicWorkspaceRouting?.kindEncodedInUrl !== false) fail('service workspace kind/type must not be encoded in public URLs');
const expectedAdminRoutes = { home:'/admin/home/{capability}', operations:'/admin/operations/{capability}', workspaces:'/admin/workspaces/{capability}', services:'/admin/services/{service}', system:'/admin/system/{capability}' };
for (const [group, pattern] of Object.entries(expectedAdminRoutes)) {
  if (workspace.managementRouting?.[group] !== pattern) fail(`service workspace Admin route drift: ${group}`);
  if (constitution.surfaceRoutingPolicy?.adminServiceManagement?.[group] !== pattern) fail(`constitutional Admin route drift: ${group}`);
}
if (workspace.commonServiceOperatorAccessRule?.canonicalPath !== '/admin/services/common-services') fail('common-service operator canonical path must use /admin/services');
if (workspace.subdomainExceptions?.personalHome !== null) fail('service workspace policy must not preserve a personal-home user-entry subdomain');
if (workspace.subdomainExceptions?.administration !== null) fail('service workspace policy must not preserve an administrator user-entry subdomain');
if (workspace.subdomainExceptions?.authentication !== null) fail('service workspace policy must not preserve an authentication user-entry subdomain');
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

const claimIntegrity=constitution.aiClaimIntegrityPolicy||{};
if(claimIntegrity.id!=='AI-CLAIM-INTEGRITY-001'||claimIntegrity.status!=='active') fail('aiClaimIntegrityPolicy must remain active');
if(claimIntegrity.operationalClaimsRequireAuthoritativeEvidence!==true) fail('operational AI claims must require authoritative evidence');
if(claimIntegrity.currentStateRequiresFreshEvidence!==true||claimIntegrity.conversationMemoryMayNotSolelyProveCurrentState!==true) fail('current operational state must require fresh non-memory-only evidence');
if(claimIntegrity.otherAgentOutputIsAssertionNotEvidence!==true) fail('other agent output must remain assertion rather than evidence');
if(claimIntegrity.claimScopeMayNotExceedEvidenceScope!==true||claimIntegrity.singleSurfaceEvidenceMayNotProveAllSurfaces!==true) fail('AI claim scope may not exceed evidence scope');
if(claimIntegrity.unknownOrContradictedStateCannotUseSuccessLanguage!==true) fail('unknown or contradicted AI state may not use success language');
if(claimIntegrity.completionAndBroadScopeRequireIndependentVerifier!==true) fail('completion and broad-scope claims require an independent verifier');
if(claimIntegrity.materialOperationalClaimReceiptRequired!==true||claimIntegrity.deterministicFinalResponseGuardRequired!==true) fail('material operational claims require receipts and deterministic final-response guard');


const knowledgeClaim=constitution.aiKnowledgeClaimPolicy||{};
if(knowledgeClaim.id!=='AI-KNOWLEDGE-CLAIM-001'||knowledgeClaim.status!=='active') fail('aiKnowledgeClaimPolicy must remain active');
if(knowledgeClaim.retrievalIsNotVerification!==true||knowledgeClaim.modelOutputMayNotProveExternalFact!==true||knowledgeClaim.memoryMayNotProveCurrentExternalFact!==true) fail('external knowledge must remain evidence-gated beyond model output and memory');
if(knowledgeClaim.freshnessMustMatchTemporalSensitivity!==true||knowledgeClaim.currentPrimarySourcePreferred!==true) fail('knowledge freshness and primary-source preference must remain active');
if(knowledgeClaim.credibleContradictionsBlockUnqualifiedVerification!==true||knowledgeClaim.claimScopeMayNotExceedEvidenceScope!==true) fail('knowledge contradictions and scope must remain fail-closed');
if(knowledgeClaim.highImpactFactsRequireAuthoritativeEvidence!==true) fail('high-impact external facts must require authoritative evidence');
if(knowledgeClaim.externalSourceInstructionsAreUntrustedData!==true) fail('external source instructions must remain untrusted data');
if(knowledgeClaim.materialKnowledgeClaimsRequireTraceableCitation!==true||knowledgeClaim.deterministicFinalResponseGuardRequired!==true) fail('material external facts require traceable citations and deterministic final guard');

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
console.log('- 21 supreme ecosystem attributes: mandatory, non-regressive and CI-bound');
console.log(`- ${Object.keys(boundaries.platforms || {}).length} platform/service boundaries checked`);
console.log(`- ${legacy.size} legacy domains registered with canonical migration targets`);
console.log(`- ${registeredCommon.size} registered common-service boundaries checked`);
console.log(`- sustainable evolution: generation ${sustainable.currentGeneration}, future open-ended, scale ${sustainable.currentScaleTier}`);
console.log('- canonical user spaces: /{slug} on ekodi.kr; workspace kind remains internal metadata');
console.log('- Workspace is canonical; Space remains compatibility-only during migration');
console.log('- service workspace routing policy aligned to immutable workspace_id');
console.log('- Sovereign -> Autonomous -> Agentic -> Services operating hierarchy registered over Governance/OS/Core service boundaries');
console.log('- data sovereignty, tenant authority, provider, storage and sustainable scaling rules checked');
console.log('- Capability Before Service: mandatory; evidence-free new service registration is CI-blocked');
console.log('- canonical human URL query hygiene: tracking removed, functional query context preserved');
