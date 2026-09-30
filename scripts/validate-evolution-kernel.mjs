import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const readJson = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const readText = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

export async function readEvolutionKernelSources() {
  const [
    kernel,
    metaModel,
    knowledgeRegistry,
    resourceRegistry,
    capabilityRegistry,
    providerContract,
    evolutionModel,
    orchestrationPolicy,
    migrationSql,
  ] = await Promise.all([
    readJson('governance/architecture/evolution-kernel.v1.json'),
    readJson('governance/architecture/universal-meta-model.v1.json'),
    readJson('config/knowledge-source-registry.json'),
    readJson('config/evolution-resource-registry.json'),
    readJson('config/capability-registry.json'),
    readJson('governance/architecture/capability-provider-contract.v1.json'),
    readJson('governance/architecture/ekodi-evolution-model.json'),
    readJson('config/ai-change-orchestration-policy.json'),
    readText('migrations/0098_evolution_kernel_resource_registry.sql'),
  ]);
  return {
    kernel,
    metaModel,
    knowledgeRegistry,
    resourceRegistry,
    capabilityRegistry,
    providerContract,
    evolutionModel,
    orchestrationPolicy,
    migrationSql,
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hasAll = (actual = [], required = []) => required.every(item => actual.includes(item));

export function validateEvolutionKernelContract(sources = {}) {
  const {
    kernel = {},
    metaModel = {},
    knowledgeRegistry = {},
    resourceRegistry = {},
    capabilityRegistry = {},
    providerContract = {},
    evolutionModel = {},
    orchestrationPolicy = {},
    migrationSql = '',
  } = sources;
  const errors = [];

  const requiredAreas = [
    'Constitution & Policy',
    'Universal Meta Model',
    'Identity & Permission',
    'Capability & Service Registry',
    'Knowledge & Source Registry',
    'AI/Tool Adapter & Dynamic Router',
    'Planning & Execution',
    'Verification & Recovery',
    'Observability & Audit',
    'Evolution & Lifecycle',
  ];
  const requiredVariableResources = [
    'organization','service','site','ai','provider','database','framework','cloud','domain',
  ];
  const requiredAdoption = [
    'Discover','Evaluate','Sandbox','Benchmark',
    'Security/Cost/Performance Verification','Canary','Monitoring',
    'Progressive Rollout','Production Verification','New Baseline',
  ];
  const requiredRetirement = [
    'Dependency Check','Migration','Regression Test','Archive','Deprecation','Removal',
  ];
  const requiredLoop = [
    'Detect','Understand','Decide','Plan','Act','Observe','Verify','Recover','Learn','Evolve',
  ];
  const requiredMetadata = [
    'source','version','owner','dependencies','effectiveDate','verificationState','lifecycleState',
  ];
  const requiredKinds = ['code','model','data','knowledge','workflow','policy'];
  const requiredEntities = [
    'Person','Organization','Workspace','Role','Capability','ServiceImplementation',
    'Resource','Activity','Task','Knowledge','Transaction','Consent','Relationship','Evidence',
  ];

  if (kernel.contractId !== 'ekodi.evolution-kernel.v1' || kernel.status !== 'enforced') {
    errors.push('Evolution Kernel must be the enforced ekodi.evolution-kernel.v1 contract.');
  }
  if (Number(kernel.currentGeneration) !== 10) errors.push('Evolution Kernel must preserve Generation 10 as the current baseline.');
  if (!same(kernel.kernelAreas, requiredAreas)) errors.push('Evolution Kernel areas must match the canonical ten-area contract.');
  if (!hasAll(kernel?.invariants?.transientResources || [], requiredVariableResources)) errors.push('All transient resource classes must remain replaceable.');
  if (kernel?.invariants?.connectByCapabilityNotProductName !== true) errors.push('Capability-first binding must be enforced.');
  if (kernel?.invariants?.providerNeutralContractsRequired !== true) errors.push('Provider-neutral contracts must be required.');
  if (kernel?.invariants?.automaticProductionAdmissionForbidden !== true) errors.push('Automatic production admission must remain forbidden.');
  if (kernel?.invariants?.independentVerifierRequiredForCompletion !== true) errors.push('Independent verification must be required for completion.');
  if (kernel?.invariants?.humanFinalAuthorityPreserved !== true) errors.push('Human final authority must remain preserved.');
  if (!same(kernel.adoptionLifecycle, requiredAdoption)) errors.push('Adoption lifecycle order is not canonical.');
  if (!same(kernel.retirementLifecycle, requiredRetirement)) errors.push('Retirement lifecycle order is not canonical.');
  if (!same(kernel.closedLoop, requiredLoop)) errors.push('Closed-loop operation order is not canonical.');
  if (!same(kernel?.resourceMetadata?.requiredResolvedFields, requiredMetadata)) errors.push('Evolution resources must resolve all required metadata fields.');
  if (!hasAll(kernel?.resourceMetadata?.appliesTo || [], requiredKinds)) errors.push('Evolution metadata contract must apply to code, model, data, knowledge, workflow and policy.');
  if (kernel?.verification?.authorExecutionIsNotSuccessEvidence !== true) errors.push('Author execution may not count as success evidence.');
  if (kernel?.verification?.prBuildMergeDeploymentAreNotCompletionByThemselves !== true) errors.push('PR/build/merge/deploy may not count as completion by themselves.');
  if (kernel?.promotion?.automaticGenerationPromotion !== false) errors.push('Automatic generation promotion must remain disabled.');
  if (kernel?.promotion?.finalAuthority !== 'EKODI Platform Super Administrator') errors.push('Super Administrator must retain final promotion authority.');

  if (metaModel.modelId !== 'ekodi.universal-meta-model.v1' || metaModel.status !== 'enforced') errors.push('Universal Meta Model must be enforced.');
  if (!hasAll(metaModel.canonicalEntities || [], requiredEntities)) errors.push('Universal Meta Model is missing canonical entities.');
  if (metaModel?.relationshipRules?.capabilityIdentityIndependentFromProvider !== true) errors.push('Capability identity must be independent from provider identity.');
  if (metaModel?.relationshipRules?.organizationIdentityIndependentFromDomain !== true) errors.push('Organization identity must be independent from domain identity.');
  if (metaModel?.relationshipRules?.deleteUsesLifecycleBeforePhysicalRemoval !== true) errors.push('Lifecycle must precede physical removal.');

  if (knowledgeRegistry.registryId !== 'ekodi.knowledge-source.v1' || knowledgeRegistry.status !== 'enforced') errors.push('Knowledge Source Registry must be enforced.');
  const requiredKnowledgeFields = ['sourceId','domain','sourceType','authority','owner','versionPolicy','effectiveDatePolicy','verificationPolicy','lifecycleState'];
  if (!same(knowledgeRegistry.requiredSourceFields, requiredKnowledgeFields)) errors.push('Knowledge source metadata fields are incomplete.');
  if (knowledgeRegistry?.dynamicKnowledgePolicy?.reverifyBeforeMaterialDecision !== true) errors.push('Dynamic knowledge must be reverified before material decisions.');
  if (knowledgeRegistry?.dynamicKnowledgePolicy?.unverifiableState !== 'needs_verification') errors.push('Unverifiable knowledge must be marked needs_verification.');

  if (resourceRegistry.registryId !== 'ekodi.evolution-resource-registry.v1' || resourceRegistry.status !== 'enforced') errors.push('Evolution Resource Registry must be enforced.');
  if (!hasAll(resourceRegistry?.coverage?.resourceKinds || [], requiredKinds)) errors.push('Evolution Resource Registry does not cover every required resource kind.');
  if (resourceRegistry?.coverage?.allCoveredByInheritanceOrExplicitRecord !== true) errors.push('Every governed resource must resolve metadata by inheritance or explicit record.');
  const groupFields = ['source','version','owner','dependencies','effectiveDate','verificationState','lifecycleState'];
  for (const group of resourceRegistry.resourceGroups || []) {
    for (const field of groupFields) if (!group?.[field]) errors.push(`Resource group ${group?.id || 'unknown'} is missing ${field}.`);
  }
  const resourceIds = new Set();
  for (const resource of resourceRegistry.explicitResources || []) {
    if (resourceIds.has(resource.id)) errors.push(`Duplicate evolution resource id: ${resource.id}`);
    resourceIds.add(resource.id);
    for (const field of ['id','kind','source','version','owner','dependencies','effectiveDate','verificationState','lifecycleState']) {
      if (resource?.[field] === undefined || resource?.[field] === null || resource?.[field] === '') errors.push(`Evolution resource ${resource?.id || 'unknown'} is missing ${field}.`);
    }
    if (!requiredKinds.includes(resource.kind)) errors.push(`Evolution resource ${resource.id} has unsupported kind ${resource.kind}.`);
    if (!Array.isArray(resource.dependencies)) errors.push(`Evolution resource ${resource.id} dependencies must be an array.`);
  }
  for (const id of ['constitution','evolution-kernel','universal-meta-model','capability-registry','knowledge-source-registry','ai-change-orchestration','autonomous-evolution-loop','orchestration-gate']) {
    if (!resourceIds.has(id)) errors.push(`Required anchor resource is not registered: ${id}`);
  }

  if (providerContract.contractId !== 'ekodi.capability-provider.v1' || providerContract.status !== 'active') errors.push('Capability provider contract must remain active.');
  if (capabilityRegistry.providerContract !== providerContract.contractId) errors.push('Capability Registry must bind to the active provider-neutral contract.');

  if (Number(evolutionModel.currentGeneration) !== 10) errors.push('Evolution model must remain on Generation 10.');
  if (evolutionModel?.futureGenerationPolicy?.openEnded !== true) errors.push('Future evolution must remain open-ended and evidence-driven.');
  if (evolutionModel?.futureGenerationPolicy?.promotionEligibleByDefault !== false) errors.push('Future generation promotion must not be eligible by default.');
  if (evolutionModel?.futureGenerationPolicy?.authorityExpansionForbidden !== true) errors.push('Evolution must not expand authority.');

  if (orchestrationPolicy?.sourceControl?.directPushToMain !== false) errors.push('Direct push to main must remain forbidden.');
  if (orchestrationPolicy?.sourceControl?.pullRequestRequired !== true) errors.push('Pull requests must remain required.');
  if (orchestrationPolicy?.mutationBoundary?.guardedReleaseRequired !== true) errors.push('Guarded release must remain required.');
  if (orchestrationPolicy?.humanGate?.preserved !== true) errors.push('Human gates must remain preserved.');
  if (orchestrationPolicy?.consultationDecision?.completionClaimRequiresActualExecutionEvidence !== true) errors.push('Completion claims must require actual execution evidence.');
  if (orchestrationPolicy?.executionFallback?.automaticDiscovery !== true) errors.push('Safe execution fallback discovery must remain automatic.');

  for (const column of [
    'resource_kind','canonical_source','version','owner','dependencies_json',
    'effective_at','verification_state','lifecycle_state',
  ]) {
    if (!String(migrationSql).includes(column)) errors.push(`Evolution Kernel migration is missing required column: ${column}`);
  }
  if (!String(migrationSql).includes('evolution_kernel_baselines')) errors.push('Evolution Kernel migration must persist verified baselines.');

  return {
    errors,
    generation: Number(kernel.currentGeneration || 0),
    kernelAreaCount: Array.isArray(kernel.kernelAreas) ? kernel.kernelAreas.length : 0,
    resourceCount: resourceIds.size,
    knowledgeSourceCount: Array.isArray(knowledgeRegistry.baselineSources) ? knowledgeRegistry.baselineSources.length : 0,
  };
}

async function main() {
  const sources = await readEvolutionKernelSources();
  const result = validateEvolutionKernelContract(sources);
  if (result.errors.length) {
    console.error('EKODI Evolution Kernel validation failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`EKODI Evolution Kernel OK: Generation ${result.generation}, ${result.kernelAreaCount} kernel areas, ${result.resourceCount} anchor resources, ${result.knowledgeSourceCount} baseline knowledge sources.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) await main();
