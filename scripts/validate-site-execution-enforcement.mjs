import { readFile } from 'node:fs/promises';

const readJson=async path=>JSON.parse((await readFile(new URL(`../${path}`,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const read=async path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

const [policy,registry,pkg,scheduler,workflow]=await Promise.all([
  readJson('config/site-execution-enforcement.json'),
  readJson('config/site-lifecycle-registry.json'),
  readJson('package.json'),
  read('ekodi-site-improvement-scheduler.js'),
  read('.github/workflows/ekodi-ai-orchestration-gate.yml'),
]);

const failures=[];
const fail=message=>failures.push(message);

if(policy.schemaVersion!==1||policy.policyId!=='SITE-EXECUTION-ENFORCEMENT-001'||policy.status!=='enforced')fail('site execution policy must remain enforced schema v1');
if(policy.sourceOfSites!=='config/site-lifecycle-registry.json')fail('site execution policy must use the lifecycle registry as source of sites');
if(policy.canonicalHost!=='ekodi.kr')fail('canonical host must remain ekodi.kr');
if(policy.scope?.rootSite!==true||policy.scope?.allDescendantServicePaths!==true||policy.scope?.siteOwnedAdmin!==true)fail('root, descendant service paths, and site-owned admin must all be in scope');
if(policy.scope?.futureSitesAutoInherit!==true||policy.scope?.perSiteOptOutAllowed!==false)fail('future sites must auto-inherit and per-site opt-out must remain forbidden');
if(policy.inheritance?.mode!=='mandatory-recursive'||policy.inheritance?.rootAppliesToAllDescendants!==true||policy.inheritance?.childMayTightenButNotRelax!==true)fail('recursive inheritance contract drifted');
if(policy.exceptions?.constitutionalBoundaryOnly!==true||policy.exceptions?.silentExceptionForbidden!==true)fail('exceptions must remain constitutional and explicit only');
const dailyBudget=policy.continuousImprovement?.dailyBudget||{};
if(dailyBudget.resetTimeKst!=='09:00'||dailyBudget.timezone!=='Asia/Seoul')fail('site improvement daily budget must reset at 09:00 KST');
if(dailyBudget.executionCountPerBudgetDay!==3)fail('site improvement must provide three traffic-aware daily execution windows');
if(dailyBudget.basis!=='live-server-resource-load'||dailyBudget.apiUsageExcluded!==true)fail('site improvement usage gate must be based on live server resources, not API quota');
if(dailyBudget.serverLoadCeilingsPercent?.morning!==30||dailyBudget.serverLoadCeilingsPercent?.lunch!==60||dailyBudget.serverLoadCeilingsPercent?.evening!==90)fail('site improvement server load ceilings must remain 30/60/90');
if(dailyBudget.emergencyReservePercent!==10||dailyBudget.startBlockedAtOrAboveCeiling!==true)fail('site improvement must preserve the 10% server reserve and fail-closed load ceiling');
if(policy.continuousImprovement?.rootAndDescendantsShareOneExecutionBudget!==true)fail('root and descendants must share one site-improvement execution budget');
if(policy.continuousImprovement?.slotExecutionMustRemainLowTrafficGated!==true)fail('three-window execution must remain low-traffic gated');
if(policy.continuousImprovement?.slotExecutionMustRemainServerLoadGated!==true)fail('three-window execution must remain server-load gated');

const requiredContracts=new Set([
  'canonical-apex-path','shared-shell-and-ui-dna','brand-or-service-only-public-header',
  'site-owned-admin-addressability','auth-return-continuity','responsive-mobile-desktop-layout',
  'readability-and-no-clipping','keyboard-and-touch-accessibility','internal-external-link-integrity',
  'loading-error-empty-state-usability','shared-header-footer-language-behavior',
  'no-direct-production-mutation','isolated-branch-and-regression-validation','guarded-staging-before-production'
]);
const contracts=new Set(policy.mandatoryContracts||[]);
for(const contract of requiredContracts)if(!contracts.has(contract))fail(`missing mandatory site contract: ${contract}`);

const lifecycleEnforcement=registry.enforcement||{};
if(lifecycleEnforcement.policy!=='config/site-execution-enforcement.json')fail('site lifecycle registry must point to the site execution policy');
if(lifecycleEnforcement.inheritance!=='mandatory-recursive')fail('site lifecycle registry must declare mandatory recursive inheritance');
if(lifecycleEnforcement.descendantsIncluded!==true||lifecycleEnforcement.siteAdminIncluded!==true)fail('site lifecycle registry must include descendants and site admin');

const pendingStates=new Set(policy.exceptions?.pendingCanonicalStates||[]);
const sites=Array.isArray(registry.existingWorkspaceSites)?registry.existingWorkspaceSites:[];
let canonicalCount=0;
for(const site of sites){
  if(site?.class!=='workspace_user_site')continue;
  if(site?.enforcementOptOut===true)fail(`${site.id}: per-site enforcement opt-out is forbidden`);
  const canonical=String(site?.canonicalUrl||'').trim();
  if(canonical){
    canonicalCount+=1;
    if(!canonical.startsWith('https://ekodi.kr/'))fail(`${site.id}: canonical workspace site must use ekodi.kr apex path`);
    const parsed=new URL(canonical);
    const root=parsed.pathname.replace(/^\/+|\/+$/g,'');
    if(!root||root.includes('/'))fail(`${site.id}: canonical workspace site must own one root slug before descendant services`);
  }else if(!pendingStates.has(String(site?.migrationState||''))){
    fail(`${site.id}: missing canonicalUrl without an explicit pending-canonical state`);
  }
}
if(canonicalCount<1)fail('no canonical workspace sites are covered by enforcement');

if(registry.workspaceServicePolicy?.canonicalPattern!==policy.canonicalAddressing?.descendantPattern)fail('workspace service canonical pattern must match recursive enforcement policy');
if(policy.canonicalAddressing?.adminPattern!=='https://ekodi.kr/{slug}/admin')fail('site admin canonical pattern drifted');
if(policy.canonicalAddressing?.featureSubdomainCreationForbidden!==true)fail('feature subdomain creation must remain forbidden');

if(!scheduler.includes("site-execution-enforcement.json"))fail('site improvement scheduler must load the recursive site execution policy');
if(!scheduler.includes('Mandatory recursive site execution policy'))fail('site improvement prompt must explicitly enforce root + descendant policy');
if(!scheduler.includes('every discoverable same-site subservice and site-owned admin surface'))fail('site improvement prompt must inspect descendant services and site-owned admin');
if(!scheduler.includes("cumulativeBudgetCapPercent=30")||!scheduler.includes("cumulativeBudgetCapPercent=60")||!scheduler.includes("cumulativeBudgetCapPercent=90"))fail('scheduler must retain the 30/60/90 slot ceilings');
if(!scheduler.includes("serverResourceSnapshot")||!scheduler.includes("cpu_load_pct")||!scheduler.includes("memory_used_pct")||!scheduler.includes("server_load_above_slot_limit"))fail('scheduler must enforce live server resource preflight');
if(!scheduler.includes("apiUsageExcluded:true"))fail('scheduler must explicitly exclude API usage from server resource gating');
if(!scheduler.includes("resetHourKst:9")||!scheduler.includes("dailyLimit:3"))fail('scheduler must enforce the 09:00 KST reset and three daily windows');
if(!scheduler.includes("recentVisits<=maxVisits"))fail('traffic gate must enforce both recent-session and recent-visit limits');

if(!String(pkg.scripts?.['validate:site-execution']||'').includes('validate-site-execution-enforcement.mjs'))fail('package must expose validate:site-execution');
if(!String(pkg.scripts?.check||'').includes('validate:site-execution'))fail('full check must enforce site execution policy');
if(!String(pkg.scripts?.['validate:fast']||'').includes('validate:site-execution'))fail('fast validation must enforce site execution policy');
if(!workflow.includes('Enforce recursive site and subsite execution policy'))fail('AI orchestration gate must enforce recursive site/subsite policy');
if(!workflow.includes('npm run validate:site-execution'))fail('AI orchestration gate must execute validate:site-execution');

if(failures.length){
  console.error(`Site execution enforcement failed (${failures.length})`);
  failures.forEach(item=>console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Site execution enforcement OK: ${canonicalCount} canonical workspace sites + all descendant services/admin inherit the policy`);
