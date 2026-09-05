import fs from 'node:fs';
import path from 'node:path';
import { SOVEREIGN_AUTONOMY_POLICY, getSovereignAutonomySummary } from '../sovereign-autonomy-runtime.js';

const root = process.cwd();
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, ''));
const failures = [];
const fail = message => failures.push(message);
const registry = readJson('governance/architecture/sovereign-autonomous-operations.v1.json');
const surface = readJson('config/sovereign-surface-policy.json');
const constitution = readJson('governance/constitution/constitution.json');
const architecture = readJson('governance/architecture/ekodi-os-architecture.json');
const evolution = readJson('governance/architecture/ekodi-evolution-model.json');
const runtime = getSovereignAutonomySummary();

if (registry.schemaVersion !== 1) fail('sovereign operations registry schemaVersion must be 1');
if (registry.architectureVersion !== '1.8.1') fail('sovereign operations architectureVersion must be 1.8.1');
if (registry.status !== 'active') fail('sovereign operations registry must be active');
const hierarchy = ['sovereign','autonomous','agentic','services'];
if (JSON.stringify(registry.hierarchy?.map(item => item.id)) !== JSON.stringify(hierarchy)) fail('registry hierarchy must be Sovereign > Autonomous > Agentic > Services');
if (JSON.stringify(runtime.hierarchy) !== JSON.stringify(hierarchy)) fail('runtime hierarchy must match registry hierarchy');
if (registry.authorityContext?.canonical !== 'Person + Workspace + Role + Capability') fail('authority context must be Person + Workspace + Role + Capability');
if (runtime.authorityContext !== registry.authorityContext?.canonical) fail('runtime authority context mismatch');
if (registry.authorityContext?.workspaceIdentityKey !== 'workspace_id') fail('workspace_id must remain authority identity key');
if (registry.authorityContext?.aiMayExpandOwnAuthority !== false) fail('AI must not expand its own authority');
if (registry.productionRule?.directAgentMutationForbidden !== true) fail('direct agent production mutation must be forbidden');
if (registry.productionRule?.verifiedImmutablePromotionOnly !== true) fail('production must use verified immutable promotion');
if (registry.productionRule?.boundedStandingDelegation?.enabled !== true) fail('bounded production standing delegation must be enabled');
if (registry.productionRule?.boundedStandingDelegation?.scope !== 'existing_registered_boundary_only') fail('standing delegation must stay inside existing registered boundaries');
if (!registry.productionRule?.boundedStandingDelegation?.excludes?.includes('production_dns_or_topology_change')) fail('standing delegation must exclude production DNS/topology changes');
if (!registry.productionRule?.boundedStandingDelegation?.excludes?.includes('unbudgeted_paid_commitment')) fail('standing delegation must exclude unbudgeted paid commitments');
if (registry.autonomousLoop?.verificationRequiredAfterExecution !== true) fail('verification after autonomous execution is required');
if (registry.autonomousLoop?.failedVerificationRoutesTo !== 'recover') fail('failed verification must route to recover');
if (registry.autonomousLoop?.learningMayApplyAuthorityExpansion !== false) fail('learning must not apply authority expansion');
const loop = ['observe','detect','reason','plan','execute','verify','recover','learn'];
if (JSON.stringify(registry.autonomousLoop?.stages) !== JSON.stringify(loop)) fail('autonomous loop stages mismatch');
if (JSON.stringify(runtime.autonomyLoop) !== JSON.stringify(loop)) fail('runtime autonomous loop mismatch');

for (const changeClass of ['green','yellow','red']) {
  if (!registry.parallelChangeClasses?.[changeClass]) fail(`parallel change class missing: ${changeClass}`);
  if (!SOVEREIGN_AUTONOMY_POLICY.executionClasses?.[changeClass]) fail(`runtime execution class missing: ${changeClass}`);
}
for (const track of ['ui','service','tenant','knowledge','content','agent']) {
  if (!surface.tracks?.[track]) fail(`surface track missing: ${track}`);
  if (surface.tracks?.[track]?.independentParallelWork !== true) fail(`${track}: independentParallelWork must be true`);
}
if (surface.authorityContext !== registry.authorityContext?.canonical) fail('surface policy authority context mismatch');
if (surface.tracks?.service?.directCrossServicePrivateDb !== false) fail('service track must forbid direct cross-service private DB coupling');
if (surface.tracks?.tenant?.urlIsIdentity !== false) fail('tenant track must keep URL separate from identity authority');
if (surface.tracks?.agent?.rootCredentialAccess !== false) fail('agent track must forbid root credential access');

if (constitution.version !== '1.8.1') fail('constitution must be v1.8.1');
if (constitution.architectureModel?.operatingArchitectureVersion !== '1.8.1') fail('constitution operating architecture version mismatch');
if (constitution.architectureModel?.sovereignOperationsRegistry !== 'governance/architecture/sovereign-autonomous-operations.v1.json') fail('constitution sovereign registry path mismatch');
if (JSON.stringify(constitution.sovereignAutonomousOperations?.hierarchy) !== JSON.stringify(hierarchy)) fail('constitution sovereign hierarchy mismatch');
if (constitution.sovereignAutonomousOperations?.authorityContext !== registry.authorityContext?.canonical) fail('constitution authority context mismatch');
if (constitution.sovereignAutonomousOperations?.autonomousAuthorityExpansionForbidden !== true) fail('constitution must forbid autonomous authority expansion');
if (constitution.sovereignAutonomousOperations?.productionDirectAgentMutationForbidden !== true) fail('constitution must forbid direct production mutation by agents');
if (constitution.sovereignAutonomousOperations?.currentGenerationUnchanged !== true) fail('v1.8 must not silently promote generation');
if (constitution.sovereignAutonomousOperations?.currentScaleTierUnchanged !== true) fail('v1.8 must not silently promote scale tier');

if (architecture.operatingArchitectureVersion !== '1.8.1') fail('architecture registry operating version mismatch');
if (architecture.sovereignOperationsRegistry !== 'governance/architecture/sovereign-autonomous-operations.v1.json') fail('architecture registry sovereign path mismatch');
if (JSON.stringify(architecture.sovereignHierarchy?.order) !== JSON.stringify(hierarchy)) fail('architecture sovereign hierarchy mismatch');
if (architecture.authorityContext?.workspaceIdentityKey !== 'workspace_id') fail('architecture authority context must keep workspace_id');
if (evolution.operatingArchitectureVersion !== '1.8.1') fail('evolution model operating architecture version mismatch');
if (evolution.generationPromotion?.changedByV18 !== false) fail('v1.8 must not promote generation');
if (evolution.currentGeneration !== 2) fail('current generation must remain 2');
if (evolution.currentScaleTier !== 'S0') fail('current scale tier must remain S0');
if (evolution.sustainability?.sharedBeforeDedicated !== true) fail('shared-before-dedicated must remain active');
if (evolution.sustainability?.noSpeculativeScale !== true) fail('no-speculative-scale must remain active');

if (failures.length) {
  console.error(`EKODI Sovereign Autonomous Operations validation failed (${failures.length})`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}
console.log('EKODI Sovereign Autonomous Operations v1.8.1: OK');
console.log('- hierarchy: Sovereign > Autonomous > Agentic > Services');
console.log('- authority: Person + Workspace + Role + Capability');
console.log('- loop: Observe > Detect > Reason > Plan > Execute > Verify > Recover > Learn');
console.log('- parallel tracks: UI, Service, Tenant, Knowledge, Content, Agent');
console.log('- generation 2 / scale S0 preserved; no speculative scale');
