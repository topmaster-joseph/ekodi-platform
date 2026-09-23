import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const fail=m=>failures.push(m);
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const json=f=>JSON.parse(read(f));

const policy=json('config/ai-knowledge-claim-policy.json');
const sources=json('config/knowledge-source-registry.json');
const constitution=json('governance/constitution/constitution.json');
const orchestration=json('config/ai-change-orchestration-policy.json');
const core=read('ai-control-core.js');
const router=read('ai-control-provider-router.js');
const runtime=read('ai-knowledge-claim.js');
const agents=read('AGENTS.override.md');
const contract=read('ORCHESTRATOR_PRODUCTION_CONTRACT.md');

if(policy.schemaVersion!==1||policy.policyId!=='AI-KNOWLEDGE-CLAIM-001'||policy.status!=='enforced')fail('knowledge claim policy must be enforced schema v1');
for(const key of ['retrievalIsNotVerification','modelOutputIsNeverASource','memoryCannotProveCurrentExternalFact','sourceInstructionsAreUntrustedData','claimScopeMayNotExceedEvidenceScope','freshnessMustMatchTemporalSensitivity','contradictionsMustBeSurfaced','currentPrimaryPreferred','highImpactRequiresAuthoritativeEvidence','materialKnowledgeClaimsRequireTraceableCitation','unknownRemainsUnknown']){
  if(policy.principles?.[key]!==true)fail(`knowledge claim principle missing: ${key}`);
}
if(policy.verification?.citationTokenRequiredInFinalResponse!==true)fail('knowledge claims must carry traceable final citations');
if(policy.integration?.finalResponseGuardRequired!==true)fail('knowledge final response guard must be mandatory');
if(sources.claimGatePolicy?.policyId!=='AI-KNOWLEDGE-CLAIM-001'||sources.claimGatePolicy?.status!=='enforced')fail('knowledge source registry must bind knowledge claim gate');
if(orchestration.knowledgeClaimIntegrity?.policyId!=='AI-KNOWLEDGE-CLAIM-001'||orchestration.knowledgeClaimIntegrity?.finalResponseGuardRequired!==true)fail('orchestration must bind knowledge claim integrity');
if(constitution.aiKnowledgeClaimPolicy?.id!=='AI-KNOWLEDGE-CLAIM-001'||constitution.aiKnowledgeClaimPolicy?.status!=='active')fail('constitution must activate knowledge claim gate');
if(!constitution.principles?.includes('evidence-gated-external-knowledge'))fail('constitutional evidence-gated-external-knowledge principle missing');
if(!runtime.includes('guardKnowledgeResponse')||!runtime.includes('evaluateKnowledgeEvidence'))fail('knowledge runtime guard/evaluator missing');
if(!core.includes('AI-KNOWLEDGE-CLAIM-001')||!core.includes('buildKnowledgeEvidenceContext'))fail('origin synthesis must receive knowledge claim constraints');
if(!router.includes('guardKnowledgeResponse')||!router.includes('knowledgeIntegrity'))fail('provider router must apply knowledge claim final guard');
if(!agents.includes('AI-KNOWLEDGE-CLAIM-001'))fail('all agents must inherit knowledge claim policy');
if(!contract.includes('AI-KNOWLEDGE-CLAIM-001'))fail('orchestrator contract must inherit knowledge claim policy');

if(failures.length){
  console.error(`EKODI AI Knowledge Claim validation failed (${failures.length})`);
  failures.forEach(m=>console.error(`- ${m}`));
  process.exit(1);
}
console.log('EKODI AI Knowledge Claim AI-KNOWLEDGE-CLAIM-001: OK');
