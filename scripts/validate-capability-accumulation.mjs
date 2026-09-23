import fs from 'node:fs';
const policy=JSON.parse(fs.readFileSync(new URL('../config/capability-accumulation-policy.json',import.meta.url),'utf8'));
const foundry=JSON.parse(fs.readFileSync(new URL('../config/capability-foundry.json',import.meta.url),'utf8'));
const failures=[];
const fail=m=>failures.push(m);
if(policy.id!=='EKODI-CAPABILITY-ACCUMULATION-001'||policy.status!=='active')fail('capability accumulation policy identity/status mismatch');
if(policy.principle!=='learn_into_reusable_capabilities_before_services')fail('capability accumulation principle drifted');
for(const stage of ['register-user-service','create-independent-deployment-boundary','expand-authority','write-production-business-data','publish-unverified-module']){
  if(!policy.prohibitedAutomaticStages?.includes(stage))fail('missing prohibited automatic stage: '+stage);
}
if(Number(policy.thresholds?.minimumOccurrences)<3||Number(policy.thresholds?.minimumVerifiedOccurrences)<3)fail('capability accumulation evidence threshold must remain >= 3');
if(Number(policy.thresholds?.minimumObservedSuccessRate)<0.8)fail('capability accumulation observed success threshold must remain >= 0.8');
if(policy.dataSafety?.rawUserPromptStored!==false||policy.dataSafety?.secretsStored!==false||policy.dataSafety?.syntheticSampleOnly!==true||policy.dataSafety?.externalInstructionsExecutable!==false)fail('capability accumulation data-safety contract drifted');
if(foundry.serviceCreationRule?.capabilityFirst!==true||foundry.serviceCreationRule?.serviceCreationAutomatic!==false)fail('Capability Foundry must remain capability-first and forbid automatic service creation');
if(foundry.serviceCreationRule?.newUserServiceRegistrationRequiresEvidence!==true)fail('Foundry must remain bound to service-creation evidence');
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('Capability accumulation policy validation passed.');
