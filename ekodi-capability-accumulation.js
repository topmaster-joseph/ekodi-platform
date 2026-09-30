import capabilityFoundry from './config/capability-foundry.json' with { type: 'json' };
import accumulationPolicy from './config/capability-accumulation-policy.json' with { type: 'json' };
import { findReusableComposition } from './ekodi-capability-ecosystem.js';

const freeze=value=>Object.freeze(value);
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const list=value=>Array.isArray(value)?value:[];
const unique=values=>[...new Set(values.filter(Boolean))];

function fnv1a(value){
  let hash=0x811c9dc5;
  for(const ch of String(value||'')){hash^=ch.codePointAt(0);hash=Math.imul(hash,0x01000193)}
  return (hash>>>0).toString(36);
}

const FAMILY_RULES=Object.freeze([
  ['knowledge',/(knowledge|research|source|crawl|search|rag|policy|notice|reference)/i],
  ['document',/(document|pdf|doc|form|report|write|content|structure)/i],
  ['language',/(language|translate|interpret|locale|caption|subtitle)/i],
  ['media',/(image|video|audio|media|voice|photo)/i],
  ['data',/(data|metric|analytics|sync|compare|reporting)/i],
  ['communication',/(mail|message|notify|communication|contact|reply)/i],
  ['integration',/(api|webhook|connector|integration|provider)/i],
  ['identity_access',/(auth|identity|permission|role|login|access)/i],
  ['realtime',/(live|realtime|presence|stream|socket)/i],
  ['commerce',/(commerce|product|menu|price|order|shop|mall|delivery|payment)/i],
  ['safety_verification',/(security|verify|verification|audit|rollback|safety|risk)/i],
  ['workflow',/(workflow|automation|schedule|queue|task|process)/i],
]);

export const EKODI_CAPABILITY_ACCUMULATION_POLICY=freeze(accumulationPolicy);

export function classifyFoundryFamily(input={}){
  const haystack=[
    input.patternKey,input.goal,input.taskType,input.domain,input.capabilityId,
    ...list(input.tags)
  ].map(value=>clean(value,300)).join(' ');
  const known=new Set(list(capabilityFoundry.families).map(item=>item.id));
  for(const [id,pattern] of FAMILY_RULES) if(known.has(id)&&pattern.test(haystack)) return id;
  return known.has('workflow')?'workflow':list(capabilityFoundry.families)[0]?.id||'workflow';
}

export function assessExistingCapabilityReuse(input={}){
  const query=clean(input.query||input.patternKey||input.goal||'',1200);
  const matches=findReusableComposition(query,Math.max(1,Math.min(8,Number(input.limit)||5)));
  const minimumScore=Math.max(1,Number(input.minimumScore)||4);
  const strong=matches.filter(item=>Number(item.score)>=minimumScore);
  return freeze({
    queryFingerprint:fnv1a(query.toLowerCase().replace(/\s+/g,' ')),
    reusable:strong.length>0,
    matches:freeze(strong.map(item=>freeze({id:item.capability.id,name:item.capability.name,score:item.score,domain:item.capability.domain}))),
    newCapabilityNeeded:strong.length===0,
  });
}

export function buildAccumulationCandidate(input={}){
  const evidence=input.evidence&&typeof input.evidence==='object'?input.evidence:{};
  const occurrences=Math.max(0,Math.trunc(Number(evidence.occurrences||input.occurrences)||0));
  const verifiedCount=Math.max(0,Math.trunc(Number(evidence.verifiedCount||input.verifiedCount)||0));
  const successRate=Math.max(0,Math.min(1,Number(evidence.observedSuccessRate??input.successRate)||0));
  const patternKey=clean(input.patternKey||input.id||'unknown-pattern',180);
  const reuse=assessExistingCapabilityReuse({query:input.semanticQuery||patternKey,minimumScore:input.minimumReuseScore});
  const proposal=input.capabilityProposal&&typeof input.capabilityProposal==='object'?input.capabilityProposal:null;
  const gapDeclared=proposal!=null||list(input.capabilityGaps).length>0||reuse.newCapabilityNeeded;
  const family=classifyFoundryFamily({
    patternKey,
    goal:input.semanticQuery,
    domain:proposal?.contract?.domain,
    capabilityId:proposal?.proposedCapabilityId,
    tags:input.tags,
  });
  const thresholdMet=
    occurrences>=Number(accumulationPolicy.thresholds?.minimumOccurrences||3)
    && verifiedCount>=Number(accumulationPolicy.thresholds?.minimumVerifiedOccurrences||3)
    && successRate>=Number(accumulationPolicy.thresholds?.minimumObservedSuccessRate||0.8);
  const proposedCapabilityId=clean(
    proposal?.proposedCapabilityId
      || (gapDeclared?`foundry.generated.${fnv1a(patternKey)}`:''),
    140
  )||null;
  const state=!gapDeclared
    ? 'reuse_existing'
    : thresholdMet?'module_candidate':'observed_gap';
  const sampleId=proposedCapabilityId?`accumulation-${fnv1a(proposedCapabilityId)}`:null;
  return freeze({
    contract:'ekodi.capability-accumulation-candidate.v1',
    id:`acc_${fnv1a(patternKey)}`,
    sourcePattern:patternKey,
    state,
    family,
    evidence:freeze({occurrences,verifiedCount,observedSuccessRate:Number(successRate.toFixed(4)),thresholdMet}),
    reuse,
    proposedCapabilityId,
    moduleDraft:proposedCapabilityId?freeze({
      id:proposedCapabilityId,
      family,
      state:'module_candidate',
      kind:'generated_candidate',
      actionTier:clean(proposal?.contract?.actionTier||'assist',30),
      providerIndependent:proposal?.contract?.providerIndependent!==false,
      registrationPerformed:false,
    }):null,
    sampleDraft:proposedCapabilityId?freeze({
      id:sampleId,
      syntheticOnly:true,
      externalNetwork:false,
      productionWrites:false,
      persistsInputs:false,
      sampleInputTemplate:freeze({
        synthetic:true,
        scenario:`Synthetic capability test for ${proposedCapabilityId}`,
        expected:'bounded reusable capability evidence',
      }),
      executionPerformed:false,
    }):null,
    automaticServiceCreation:false,
    serviceRegistryMutationPerformed:false,
    productionMutationPerformed:false,
    authorityExpansionPerformed:false,
    next:state==='reuse_existing'
      ?'compose_existing_capability'
      :state==='module_candidate'
        ?'queue_foundry_sandbox'
        :'accumulate_more_verified_evidence',
  });
}

export function buildCapabilityAccumulationQueue(input={}){
  const candidates=list(input.candidates).map(buildAccumulationCandidate);
  const reusable=candidates.filter(item=>item.state==='reuse_existing');
  const moduleCandidates=candidates.filter(item=>item.state==='module_candidate');
  const observedGaps=candidates.filter(item=>item.state==='observed_gap');
  return freeze({
    contract:'ekodi.capability-accumulation-queue.v1',
    generatedAt:input.generatedAt||new Date().toISOString(),
    policyId:accumulationPolicy.id,
    summary:freeze({
      total:candidates.length,
      reuseExisting:reusable.length,
      moduleCandidates:moduleCandidates.length,
      observedGaps:observedGaps.length,
      automaticServicesCreated:0,
    }),
    candidates:freeze(candidates),
    serviceCreationBlockedByDefault:true,
    productionMutationPerformed:false,
    authorityExpansionPerformed:false,
  });
}

export function prepareFoundrySandboxBatch(queue={}){
  const selected=list(queue.candidates).filter(item=>item.state==='module_candidate'&&item.sampleDraft?.syntheticOnly===true);
  return freeze({
    contract:'ekodi.capability-foundry-sandbox-batch.v1',
    count:selected.length,
    items:freeze(selected.map(item=>freeze({
      candidateId:item.id,
      proposedCapabilityId:item.proposedCapabilityId,
      family:item.family,
      sample:item.sampleDraft,
      registryMutationPerformed:false,
      serviceCreationPerformed:false,
    }))),
    productionMutationPerformed:false,
    externalExecutionPerformed:false,
  });
}
