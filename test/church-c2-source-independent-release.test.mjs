import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const json=path=>JSON.parse(read(path));
const constitution=json('governance/constitution/constitution.json');
const amendment=json('governance/amendments/2026-11-03-church-source-independent-release-v1.27.7.json');
const boundaries=json('platform-boundaries.json');
const registry=json('config/repository-source-of-truth.json');
const retirement=json('config/site-repository-retirement-readiness.json');
const architecture=json('governance/architecture/ekodi-os-architecture.json');
const evolution=json('governance/architecture/ekodi-evolution-model.json');
const workflow=read('.github/workflows/deploy-ekodi-church-homepage.yml');
const policy=constitution.churchCanonicalSourceTransferPolicy;

test('C2 owner-approved Church source target is versioned, explicit and separately gated from C3 production',()=>{
  assert.equal(constitution.version,'1.27.7');
  assert.equal(amendment.status,'approved');
  assert.equal(amendment.changeClass,'C2');
  assert.equal(amendment.relatedReleaseTopologyClass,'C3');
  assert.equal(amendment.approvedBy,constitution.changeControl.owner);
  assert.equal(amendment.constitutionVersion,constitution.version);
  assert.equal(policy.canonicalRepository,'topmaster-joseph/ekodi-platform');
  assert.equal(policy.canonicalSourcePath,'sites/ekodi-church');
  assert.equal(policy.approvalStatus,'owner-approved-guarded-transition');
  assert.equal(policy.ownerApprovalDoesNotAuthorizeAutomaticProductionDeployment,true);
  for(const key of ['requireProtectedOrchestratorReceipt','requireExactMainCommitAndPayloadSha','requireStagedMemberAdminLiveBrowserCanary','requireIndependentRollbackProof','legacyRepositoryDeletionRequiresSeparateOwnerApproval','preventCrossTenantDataAndFinanceCoalescing'])
    assert.equal(policy[key],true,key);
});

test('independent Church Pages release is registered without changing other release units',()=>{
  const church=boundaries.platforms.church;
  assert.equal(church.kind,'independent-platform');
  assert.equal(church.publicEntry,'https://ekodi.kr/ekodichurch');
  assert.equal(church.deployWorkflow,'.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.ok(church.source.includes('sites/ekodi-church/**'));
  assert.equal(policy.preservedIndependentPagesProject,'ekodi-church');
  assert.match(church.note,/legacy/i);
  assert.equal(Object.values(boundaries.platforms)
    .filter(p=>p.deployWorkflow==='.github/workflows/deploy-ekodi-church-homepage.yml').length,1,
    'the existing Church deployment workflow must belong to only one independent unit');
});

test('existing Church deployment classification has explicit owner-approved sustainable cost and rollback evidence',()=>{
  const classification=architecture.platformBoundaryClassification.church;
  assert.equal(classification.layer,'responsible-independent-service');
  assert.equal(classification.responsibilityClass,'ekodi-responsible');
  const exception=evolution.boundaryCreationGate.approvedExpansionExceptions.find(x=>x.id==='church');
  assert.ok(exception,'Church registration requires evidence, not a grandfather bypass');
  for(const field of ['reason','expectedBenefit','incrementalMonthlyCost','rollbackPath','owner','observabilityPlan']) assert.ok(exception[field],field);
  assert.match(exception.reason,/existing ekodi-church Cloudflare Pages project/);
  assert.match(exception.incrementalMonthlyCost,/0 new fixed/);
  assert.equal(evolution.sustainability.noSpeculativeServiceSplit,true);
});

test('legacy Church source remains authoritative live until verified v2 release',()=>{
  const legacy=registry.repositories.find(x=>x.name==='topmaster-joseph/ekodi-church');
  assert.equal(legacy.role,'active-satellite');
  assert.equal(legacy.approvedConsolidation.productionCutover,'pending-guarded-v2-release-and-live-sha-verification');
  assert.equal(legacy.approvedConsolidation.legacyProductionSourceRemainsActive,true);
  const guard=retirement.registeredSatellites.find(x=>x.repository===legacy.name);
  assert.equal(guard.stage,'migration-staging');
  assert.equal(guard.deleteRequested,false);
  assert.equal(retirement.automaticRepositoryDeletionAllowed,false);
  assert.equal(retirement.directWorkerRepositoryDeletionAllowed,false);
});

test('the same pre-existing Cloudflare Pages project is protected by release receipt and exact SHA',()=>{
  assert.ok(workflow.includes('repository: topmaster-joseph/ekodi-church'));
  assert.ok(workflow.includes('CHURCH_CANONICAL_SOURCE_CUTOVER_APPROVED'));
  assert.ok(workflow.includes('if: github.event_name == \'workflow_dispatch\''));
  assert.ok(workflow.includes('validate-ekodi-ai-change-orchestration.mjs'));
  assert.ok(workflow.includes('--project-name ekodi-church --branch main'));
  assert.ok(workflow.includes('ekodi.church-release.v2'));
  assert.ok(workflow.includes('payloadSha256'));
  assert.ok(workflow.includes('release_task_id'));
  assert.ok(workflow.includes('refs/heads/main'));
});

test('Church source amendment forbids auto-deletion and cross-site role/financial consolidation',()=>{
  assert.equal(amendment.approvalScope.legacyDeletionAuthorized,false);
  assert.equal(amendment.approvalScope.retireOtherRepositories,false);
  assert.equal(amendment.approvalScope.scopedToChurch,true);
  assert.equal(amendment.existingRuntimeEvidence.productionSourceCutoverVerified,false);
  assert.ok(amendment.requiredProductionGates.includes('authenticated-member-and-admin-authorization'));
  assert.ok(amendment.requiredProductionGates.includes('independent-Church-Pages-project-release-provenance'));
  assert.ok(amendment.requiredProductionGates.includes('same-project-rollback-rehearsal'));
});
