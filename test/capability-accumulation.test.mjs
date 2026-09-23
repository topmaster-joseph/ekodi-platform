import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EKODI_CAPABILITY_ACCUMULATION_POLICY,
  assessExistingCapabilityReuse,
  buildAccumulationCandidate,
  buildCapabilityAccumulationQueue,
  classifyFoundryFamily,
  prepareFoundrySandboxBatch,
} from '../ekodi-capability-accumulation.js';

test('accumulation policy learns capabilities before services',()=>{
  assert.equal(EKODI_CAPABILITY_ACCUMULATION_POLICY.principle,'learn_into_reusable_capabilities_before_services');
  assert.ok(EKODI_CAPABILITY_ACCUMULATION_POLICY.prohibitedAutomaticStages.includes('register-user-service'));
  assert.equal(EKODI_CAPABILITY_ACCUMULATION_POLICY.dataSafety.syntheticSampleOnly,true);
});

test('family classification is deterministic and internal',()=>{
  assert.equal(classifyFoundryFamily({patternKey:'api connector webhook'}),'integration');
  assert.equal(classifyFoundryFamily({patternKey:'translate live subtitle'}),'language');
  assert.equal(classifyFoundryFamily({patternKey:'unknown recurring task'}),'workflow');
});

test('existing capability reuse wins before new module creation',()=>{
  const reuse=assessExistingCapabilityReuse({query:'marketing content campaign',minimumScore:2});
  assert.equal(reuse.reusable,true);
  assert.equal(reuse.newCapabilityNeeded,false);
  assert.ok(reuse.matches.some(item=>item.id==='business.marketing'));
  const candidate=buildAccumulationCandidate({
    patternKey:'marketing content campaign',
    semanticQuery:'marketing content campaign',
    evidence:{occurrences:10,verifiedCount:10,observedSuccessRate:1},
  });
  assert.equal(candidate.state,'reuse_existing');
  assert.equal(candidate.proposedCapabilityId,null);
  assert.equal(candidate.automaticServiceCreation,false);
});

test('repeated verified gap becomes a Foundry module candidate, not a service',()=>{
  const candidate=buildAccumulationCandidate({
    patternKey:'goal:synthetic-rare-unhandled-capability-zzq',
    semanticQuery:'synthetic rare unhandled capability zzq',
    capabilityProposal:{proposedCapabilityId:'automation.generated.syntheticzzq',contract:{domain:'core',actionTier:'assist',providerIndependent:true}},
    evidence:{occurrences:5,verifiedCount:4,observedSuccessRate:0.9},
  });
  assert.equal(candidate.state,'module_candidate');
  assert.equal(candidate.moduleDraft.registrationPerformed,false);
  assert.equal(candidate.sampleDraft.syntheticOnly,true);
  assert.equal(candidate.serviceRegistryMutationPerformed,false);
  assert.equal(candidate.productionMutationPerformed,false);
});

test('insufficient evidence remains an observed gap',()=>{
  const candidate=buildAccumulationCandidate({
    patternKey:'goal:early-gap',
    semanticQuery:'early unique gap',
    capabilityProposal:{proposedCapabilityId:'automation.generated.earlygap',contract:{}},
    evidence:{occurrences:2,verifiedCount:2,observedSuccessRate:1},
  });
  assert.equal(candidate.state,'observed_gap');
  assert.equal(candidate.next,'accumulate_more_verified_evidence');
});

test('queue can prepare only synthetic Foundry sandbox batches',()=>{
  const queue=buildCapabilityAccumulationQueue({generatedAt:'2026-09-23T00:00:00.000Z',candidates:[
    {patternKey:'goal:gap-a',semanticQuery:'rare unique gap alpha',capabilityProposal:{proposedCapabilityId:'automation.generated.a',contract:{}},evidence:{occurrences:4,verifiedCount:4,observedSuccessRate:1}},
    {patternKey:'marketing content campaign',semanticQuery:'marketing content campaign',evidence:{occurrences:4,verifiedCount:4,observedSuccessRate:1}},
  ]});
  const batch=prepareFoundrySandboxBatch(queue);
  assert.equal(queue.summary.automaticServicesCreated,0);
  assert.equal(batch.count,1);
  assert.equal(batch.items[0].sample.syntheticOnly,true);
  assert.equal(batch.items[0].serviceCreationPerformed,false);
  assert.equal(batch.productionMutationPerformed,false);
});
