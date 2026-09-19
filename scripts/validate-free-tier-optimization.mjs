import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync('config/free-tier-optimization-policy.json','utf8'));
const wrangler = fs.readFileSync('wrangler.site.toml','utf8');
const runtime = fs.readFileSync('free-tier-quota-guard.js','utf8');
const workflow = fs.readFileSync('.github/workflows/ekodi-ai-orchestration-gate.yml','utf8');
const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message)};

expect(policy.policyId==='EKODI-FREE-TIER-001','policy id must remain EKODI-FREE-TIER-001');
expect(policy.status==='enforced','free-tier policy must remain enforced');
expect(policy.automaticPaidUpgrade===false,'automatic paid upgrade must remain disabled');
expect(JSON.stringify(policy.thresholds)===JSON.stringify({warning:70,conserve:85,protect:90,survival:95,circuitBreaker:100}),'quota thresholds must remain 70/85/90/95/100');
expect(policy.providerRoles?.cloudflare?.prefer?.includes('static-assets-before-worker'),'Cloudflare must prefer static assets before Worker invocation');
expect(policy.providerRoles?.supabase?.role==='authoritative-relational-data-auth-and-rls','Supabase authoritative role drifted');
expect(policy.providerRoles?.github?.prefer?.includes('concurrency-cancel-in-progress'),'GitHub duplicate CI suppression is required');
for(const signal of ['1027','429','quota_exhausted']) expect(policy.protection?.retryStopSignals?.includes(signal),`retry-stop signal missing: ${signal}`);
expect(policy.release?.securityBoundaryMayNotBeWeakenedForCost===true,'cost optimization must not weaken security');
expect(policy.release?.productionAccountMustNotBeConfusedWithDevelopment===true,'Production/Development account boundary must remain explicit');

expect(wrangler.includes('[assets]')&&wrangler.includes('binding = "ASSETS"'),'Cloudflare static assets binding is required');
for(const path of ['/admin-shell.css','/admin-menu-layout.js','/admin-demand-loader.js','/device-browser-diagnostics.js']) {
  expect(!wrangler.includes(`"${path}"`),`immutable static asset must not be forced Worker-first: ${path}`);
}
expect(runtime.includes("'1027'")&&runtime.includes("'429'"),'runtime quota guard must stop retries on Cloudflare/rate-limit signals');
expect(workflow.includes('validate-free-tier-optimization.mjs'),'orchestration gate must validate free-tier policy');
expect(workflow.includes('free-tier-quota-guard.test.mjs'),'orchestration gate must run free-tier regression tests');

if(failures.length){
  for(const failure of failures) console.error(`[EKODI-FREE-TIER-001] ${failure}`);
  process.exitCode=1;
}else{
  console.log('EKODI-FREE-TIER-001 validated: Cloudflare/Supabase/GitHub free-tier guard enforced.');
}
