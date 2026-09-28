import fs from 'node:fs';

const policy=JSON.parse(fs.readFileSync('config/cloudflare-account-pool.json','utf8'));
const router=fs.readFileSync('cloudflare-account-pool.js','utf8');
const gate=fs.readFileSync('.github/workflows/ekodi-ai-orchestration-gate.yml','utf8');
const prod=fs.readFileSync('.github/workflows/deploy-site-core.yml','utf8');
const prodGate=fs.readFileSync('.github/workflows/production-gate.yml','utf8');
const development=fs.readFileSync('.github/workflows/deploy-development.yml','utf8');
const health=fs.readFileSync('.github/workflows/cloudflare-account-pool-health.yml','utf8');
const registry=JSON.parse(fs.readFileSync('config/evolution-resource-registry.json','utf8'));

const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message)};

expect(policy.policyId==='EKODI-CF-ACCOUNT-POOL-001','account pool policy id drifted');
expect(policy.status==='enforced','account pool policy must remain enforced');
expect(policy.accounts?.primary?.identityEmail==='topmaster.joseph@gmail.com','primary owner identity drifted');
expect(policy.accounts?.primary?.planClass==='workers-paid','primary must remain Workers Paid');
expect(policy.accounts?.primary?.canonicalDomainAuthority===true,'primary must own canonical domain authority');
expect(policy.accounts?.auxiliary?.identityEmail==='joseph@ekodi.kr','auxiliary owner identity drifted');
expect(policy.accounts?.auxiliary?.canonicalDomainAuthority===false,'auxiliary must never own canonical domain authority');
expect(policy.accounts?.primary?.accountIdEnv!==policy.accounts?.auxiliary?.accountIdEnv,'primary and auxiliary account id envs must differ');
expect(policy.accounts?.primary?.tokenEnv!==policy.accounts?.auxiliary?.tokenEnv,'primary and auxiliary token envs must differ');
expect(policy.failover?.productionCriticalToAuxiliary==='forbidden','critical production failover to auxiliary must stay forbidden');
expect(policy.security?.leastPrivilegeRequired===true,'least privilege is mandatory');
expect(policy.security?.crossAccountServiceBindingAssumed===false,'cross-account Service Binding must not be assumed');
expect(policy.serviceScope?.inheritance==='all-current-and-future-sites-services-subsurfaces','account-pool policy must recursively bind all services');
expect(policy.serviceScope?.localOverride==='forbidden','service-local account routing override must be forbidden');

for(const workload of ['auth','identity','authorization','secrets','payments','finance','orders','production-release','production-domain','production-dns','root-security']){
  expect(policy.routing?.primaryOnly?.includes(workload),`primary-only workload missing: ${workload}`);
  expect(router.includes(`'${workload}'`),`router primary-only workload missing: ${workload}`);
}
for(const workload of ['development','staging','batch','backup','snapshot','diagnostics','synthetic-verification']){
  expect(policy.routing?.auxiliaryPreferred?.includes(workload),`auxiliary-preferred workload missing: ${workload}`);
  expect(router.includes(`'${workload}'`),`router auxiliary workload missing: ${workload}`);
}

expect(router.includes('CLOUDFLARE_ACCOUNT_POOL_BOUNDARY_COLLISION'),'same-account collision guard is required');
expect(router.includes('CLOUDFLARE_PRIMARY_REQUIRED_FAIL_CLOSED'),'critical work must fail closed without primary credentials');
expect(router.includes('CLOUDFLARE_AUXILIARY_ACCOUNT_ID || env.CLOUDFLARE_DEVELOPMENT_ACCOUNT_ID'),'legacy development account must be accepted only as auxiliary compatibility');
expect(router.includes('CLOUDFLARE_AUXILIARY_API_TOKEN || env.CLOUDFLARE_DEVELOPMENT_API_TOKEN'),'legacy development token must be accepted only as auxiliary compatibility');
expect(router.includes("identityEmail:'topmaster.joseph@gmail.com'"),'sanitized account metadata must identify the Paid primary owner');
expect(router.includes("identityEmail:'joseph@ekodi.kr'"),'sanitized account metadata must identify the bounded auxiliary owner');
expect(router.includes("acceptPlaintextSecretsInAdmin:false"),'Account Center must never accept plaintext infrastructure secrets');
expect(router.includes('describeCloudflareAccountPool'),'Account Center must use the sanitized account-pool projection');

for(const workflow of [prod,prodGate]){
  expect(workflow.includes('CLOUDFLARE_ACCOUNT_ID'),'production workflow must use primary account id');
  expect(workflow.includes('CLOUDFLARE_API_TOKEN'),'production workflow must use primary API token');
  expect(!workflow.includes('CLOUDFLARE_AUXILIARY_API_TOKEN'),'production workflow must not consume auxiliary API token');
}
expect(development.includes('CLOUDFLARE_DEVELOPMENT_API_TOKEN')||development.includes('CLOUDFLARE_AUXILIARY_API_TOKEN'),'development workflow must use auxiliary/development token');

expect(gate.includes('validate-cloudflare-account-pool.mjs'),'orchestration gate must validate Cloudflare account pool');
expect(gate.includes('cloudflare-account-pool.test.mjs'),'orchestration gate must run Cloudflare account pool tests');
expect(health.includes('Primary + Auxiliary read-only health'),'account pool health workflow must verify both account lanes');
expect(health.includes('test "$CLOUDFLARE_ACCOUNT_ID" != "$CLOUDFLARE_AUXILIARY_ACCOUNT_ID"'),'account pool health must reject account collisions');
expect(health.includes('cloudflare-production-budget.mjs'),'account pool health must verify the primary plan-aware budget');
const registered=(registry.explicitResources||[]).find(item=>item.id==='cloudflare-account-pool-policy');
expect(registered?.source==='config/cloudflare-account-pool.json','account pool policy must be registered in evolution resources');
expect(registered?.verificationState==='ci_gate','account pool policy must remain CI-gated');

if(failures.length){
  for(const failure of failures) console.error(`[EKODI-CF-ACCOUNT-POOL-001] ${failure}`);
  process.exitCode=1;
}else{
  console.log('EKODI-CF-ACCOUNT-POOL-001 validated: Paid primary + bounded auxiliary account routing enforced.');
}
