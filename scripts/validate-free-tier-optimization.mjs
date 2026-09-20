import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync('config/free-tier-optimization-policy.json','utf8'));
const wrangler = fs.readFileSync('wrangler.site.toml','utf8');
const runtime = fs.readFileSync('free-tier-quota-guard.js','utf8');
const governor = fs.readFileSync('free-tier-resource-governor.js','utf8');
const workflow = fs.readFileSync('.github/workflows/ekodi-ai-orchestration-gate.yml','utf8');
const collectorWorkflow = fs.readFileSync('.github/workflows/free-tier-resource-governor.yml','utf8');
const collector = fs.readFileSync('scripts/collect-free-tier-resource-usage.mjs','utf8');
const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message)};

expect(policy.policyId==='EKODI-FREE-TIER-001','policy id must remain EKODI-FREE-TIER-001');
expect(policy.status==='enforced','free-tier policy must remain enforced');
expect(policy.automaticPaidUpgrade===false,'automatic paid upgrade must remain disabled');
expect(policy.schemaVersion===2,'free-tier policy schema must remain v2');
expect(policy.resourceGovernor?.mode==='measured-telemetry-only','resource governor must use measured telemetry only');
expect(policy.resourceGovernor?.capacityAndConsumptionSeparated===true,'capacity and consumption must remain separated');
expect(policy.resourceGovernor?.capacityRules?.['supabase.active_projects']?.action==='block-new-project-only','Supabase project capacity must block only new projects');
expect(policy.resourceGovernor?.projectCreationPolicy?.automaticPaidProjectCreation===false,'automatic paid Supabase project creation must stay disabled');
expect(JSON.stringify(policy.thresholds)===JSON.stringify({warning:70,conserve:85,protect:90,survival:95,circuitBreaker:100}),'quota thresholds must remain 70/85/90/95/100');
expect(policy.providerRoles?.cloudflare?.prefer?.includes('static-assets-before-worker'),'Cloudflare must prefer static assets before Worker invocation');
expect(policy.providerRoles?.supabase?.role==='authoritative-relational-data-auth-and-rls','Supabase authoritative role drifted');
expect(policy.providerRoles?.github?.prefer?.includes('concurrency-cancel-in-progress'),'GitHub duplicate CI suppression is required');
for(const signal of ['1027','429','quota_exhausted']) expect(policy.protection?.retryStopSignals?.includes(signal),`retry-stop signal missing: ${signal}`);
expect(policy.release?.securityBoundaryMayNotBeWeakenedForCost===true,'cost optimization must not weaken security');
expect(policy.release?.productionAccountMustNotBeConfusedWithDevelopment===true,'Production/Development account boundary must remain explicit');

expect(wrangler.includes('[assets]')&&wrangler.includes('binding = "ASSETS"'),'Cloudflare static assets binding is required');
for(const path of [
  '/auth-bootstrap.js',
  '/auth-router.js',
  '/admin-authenticated-shell.js',
  '/admin-shell.css',
  '/admin-compact.css',
  '/system-health-admin.css',
  '/device-browser-diagnostics.css',
  '/tapo-device-admin.css',
  '/workspace-trade-portal.css'
]) {
  expect(wrangler.includes(`"${path}"`),`security-critical asset must remain Worker-first: ${path}`);
}
for(const path of ['/styles.css','/homepage-ambient.css','/mall.css']) {
  expect(!wrangler.includes(`"${path}"`),`ordinary immutable asset should stay asset-first: ${path}`);
}
expect(runtime.includes("'1027'")&&runtime.includes("'429'"),'runtime quota guard must stop retries on Cloudflare/rate-limit signals');
expect(governor.includes('measuredTelemetryOnly:true'),'resource governor must expose measured-telemetry-only contract');
expect(governor.includes("metric:'active_projects'")&&governor.includes("fullAction:'block_new_resource'"),'resource governor must protect Supabase project capacity');
expect(governor.includes("publicRepositoryStandardHostedRunners:'free'"),'resource governor must preserve public GitHub runner fact');
expect(workflow.includes('validate-free-tier-optimization.mjs'),'orchestration gate must validate free-tier policy');
expect(workflow.includes('free-tier-quota-guard.test.mjs'),'orchestration gate must run free-tier regression tests');
expect(workflow.includes('free-tier-resource-governor.test.mjs'),'orchestration gate must run resource governor regression tests');
expect(collectorWorkflow.includes('collect-free-tier-resource-usage.mjs'),'resource collector workflow must execute the measured collector');
expect(collectorWorkflow.includes('push:')&&collectorWorkflow.includes('branches:')&&collectorWorkflow.includes('- main'),'resource collector must run on relevant main pushes');
expect(collectorWorkflow.includes('provider_quota_snapshots'),'resource collector workflow must persist into the quota snapshot ledger');
expect(collectorWorkflow.includes('SUPABASE_ACCESS_TOKEN'),'resource collector must use the existing Supabase management credential boundary');
expect(collector.includes('/database/query'),'Supabase database usage must come from an authorized read-only database query');
expect(collector.includes('/actions/cache/usage'),'GitHub cache usage must come from the official repository usage endpoint');
expect(collector.includes('/actions/artifacts?'),'GitHub artifact usage must come from the official repository artifact endpoint');

if(failures.length){
  for(const failure of failures) console.error(`[EKODI-FREE-TIER-001] ${failure}`);
  process.exitCode=1;
}else{
  console.log('EKODI-FREE-TIER-001 validated: Cloudflare/Supabase/GitHub free-tier guard enforced.');
}
