import { readFile, readdir } from 'node:fs/promises';

const readJson=async path=>JSON.parse((await readFile(new URL(`../${path}`,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const read=async path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const walkJs=async dir=>{const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const child=new URL(entry.name+(entry.isDirectory()?'/':''),dir);if(entry.isDirectory())out.push(...await walkJs(child));else if(entry.isFile()&&entry.name.endsWith('.js'))out.push(child)}return out};

const [policy,registry,pkg,scheduler,workflow,liveVerifier]=await Promise.all([
  readJson('config/site-execution-enforcement.json'),
  readJson('config/site-lifecycle-registry.json'),
  readJson('package.json'),
  read('ekodi-site-improvement-scheduler.js'),
  read('.github/workflows/ekodi-ai-orchestration-gate.yml'),
  read('scripts/verify-mobile-fixed-headers-live.mjs'),
]);

const failures=[];
const fail=message=>failures.push(message);

if(policy.schemaVersion!==4||policy.policyId!=='SITE-EXECUTION-ENFORCEMENT-001'||policy.status!=='enforced')fail('site execution policy must remain enforced schema v4');
const authEntry=policy.authenticationEntry||{};
if(authEntry.policyId!=='SITE-CENTRAL-AUTH-ENTRY-001'||authEntry.status!=='enforced')fail('central site auth-entry policy must remain enforced');
if(authEntry.centralEntry!=='https://ekodi.kr/auth/')fail('site auth entry must remain the canonical EKODI auth path');
if(authEntry.siteLocalAuthPathForbidden!==true||authEntry.exactInitiatingReturnRequired!==true)fail('site-local auth routes must be forbidden and exact initiating return required');
if(authEntry.futureSitesAutoInherit!==true||authEntry.perSiteOptOutAllowed!==false)fail('central auth entry must auto-inherit to future sites with no per-site opt-out');
const scopePolicy=policy.changeScopeClassification||{};
if(scopePolicy.policyId!=='SITE-CHANGE-SCOPE-001'||scopePolicy.status!=='enforced')fail('site change scope classification must remain enforced');
for(const key of ['platform_common','shared_service_engine','site_specific'])if(!scopePolicy.classes?.[key])fail(`missing site change scope class: ${key}`);
if(scopePolicy.classificationRequiredBeforeImplementation!==true)fail('every site change must be classified before implementation');
if(scopePolicy.commonDefectMustBeFixedAtCommonOwner!==true)fail('common defects must be fixed at the shared owner, not copied per site');
if(scopePolicy.futureSitesAutoInheritPlatformCommon!==true)fail('future sites must inherit platform-common changes automatically');
if(scopePolicy.validatorMustRejectCommonRuleImplementedOnlyAsPerSitePatch!==true)fail('validator must reject common rules implemented only as per-site patches');
if(scopePolicy.classes?.platform_common?.perSiteCopyForbidden!==true)fail('platform-common behavior may not be copied independently into each site');
if(scopePolicy.classes?.shared_service_engine?.perSiteOverride!=='tighten-only')fail('shared engine sites may tighten but not relax the engine contract');
if(scopePolicy.classes?.site_specific?.promotionToCommonRequiredWhenReusableAcrossSites!==true)fail('reusable site-specific behavior must be promoted to a common owner');
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
  'loading-error-empty-state-usability','shared-header-footer-language-behavior','central-social-hub-inheritance',
  'no-direct-production-mutation','isolated-branch-and-regression-validation','guarded-staging-before-production',
  'canonical-mount-parity','descendant-slash-parity'
]);
const contracts=new Set(policy.mandatoryContracts||[]);
for(const contract of requiredContracts)if(!contracts.has(contract))fail(`missing mandatory site contract: ${contract}`);

const mountParity=policy.canonicalMountParity||{};
if(mountParity.policyId!=='CANONICAL-PATH-MOUNT-PARITY-001'||mountParity.status!=='enforced'||mountParity.mode!=='mandatory-recursive')fail('canonical path/mount parity must remain mandatory-recursive');
for(const flag of ['externalCanonicalAndInternalMountMustServeSameSurface','descendantRouteSuffixMustBePreserved','absoluteRootLinksForbiddenWhenTheyCanEscapeSiteMount','mountAwareOrRelativeNavigationRequired','authReturnMustPreserveInitiatingHostAndMount','internalMountMustNotLeakIntoCustomerDomainUrl','customerDomainMustNotCollapseToEkodiRootOrMy','futureSitesAutoInherit','productionVerificationRequired'])if(mountParity[flag]!==true)fail(`canonical mount parity flag must remain true: ${flag}`);
if(mountParity.perSiteOptOutAllowed!==false)fail('canonical mount parity per-site opt-out must remain forbidden');

const slashParity=policy.descendantSlashParity||{};
if(slashParity.policyId!=='CANONICAL-ROUTE-SLASH-PARITY-001'||slashParity.status!=='enforced'||slashParity.mode!=='mandatory-recursive')fail('descendant slash parity must remain mandatory-recursive');
for(const flag of ['slashlessAndTrailingSlashMustResolveSameSurface','sameAuthenticationRealmRequired','sameAuthorizationContextRequired','sameMountRequired','sameCanonicalHostRequired','queryStringPreserved','contentDivergenceForbidden','bothVariantsRegressionTestRequired','productionVerificationRequired','futureSitesAutoInherit'])if(slashParity[flag]!==true)fail(`descendant slash parity flag must remain true: ${flag}`);
if(slashParity.perSiteOptOutAllowed!==false)fail('descendant slash parity per-site opt-out must remain forbidden');
if(slashParity.allowedNormalization!=='308-or-equivalent-direct-resolution')fail('slash parity normalization contract drifted');

for(const pair of mountParity.registeredMountPairs||[]){
  const external=new URL(pair.externalBase);
  const internal=new URL(pair.internalBase);
  if(internal.hostname!=='ekodi.kr')fail(`${pair.id}: internal mount must stay on ekodi.kr`);
  if(external.origin===internal.origin)fail(`${pair.id}: custom-domain mount pair must have distinct origins`);
  const descendants=Array.isArray(pair.descendantPaths)?pair.descendantPaths:[];
  if(!descendants.length)fail(`${pair.id}: registered mount pair must declare descendant paths`);
  for(const route of descendants){
    if(!String(route).startsWith('/'))fail(`${pair.id}: descendant path must start with /: ${route}`);
    if(String(route).length>1&&String(route).endsWith('/'))fail(`${pair.id}: registry path must be slashless canonical form: ${route}`);
  }
  if(pair.sourceRoot){
    const html=await read(`${pair.sourceRoot}/index.html`).catch(()=>null);
    if(!html)fail(`${pair.id}: source root index missing: ${pair.sourceRoot}/index.html`);
    else {
      const roots=[...new Set(descendants.map(route=>'/'+route.replace(/^\/+|\/+$/g,'').split('/')[0]))];
      for(const rootPath of roots){
        const quotedDouble='href="'+rootPath;
        const quotedSingle="href='"+rootPath;
        if(html.includes(quotedDouble)||html.includes(quotedSingle))fail(`${pair.id}: root-absolute navigation can escape internal mount: ${rootPath}; use relative or mount-aware navigation`);
      }
    }
  }
  if(pair.routeConfig&&descendants.some(route=>route.startsWith('/board/'))){
    const routes=await read(pair.routeConfig).catch(()=>null);
    const internalPath=internal.pathname.replace(/\/$/,'');
    if(!routes)fail(`${pair.id}: route config missing: ${pair.routeConfig}`);
    else {
      if(!routes.includes(`${external.hostname}/board*`))fail(`${pair.id}: external board mount route missing from ${pair.routeConfig}`);
      if(!routes.includes(`${internal.hostname}${internalPath}/board*`))fail(`${pair.id}: internal board mount route missing from ${pair.routeConfig}`);
    }
  }
}

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
    const liveTarget=canonical.replace(/\/+$/,'');
    if(!liveVerifier.includes(liveTarget))fail(`${site.id}: canonical workspace site must be covered by the live public-header verifier`);
  }else if(!pendingStates.has(String(site?.migrationState||''))){
    fail(`${site.id}: missing canonicalUrl without an explicit pending-canonical state`);
  }
}
if(canonicalCount<1)fail('no canonical workspace sites are covered by enforcement');
if(!liveVerifier.includes('PUBLIC_HEADER_FORBIDDEN'))fail('live verifier must enforce the public-header forbidden-label set');
for(const label of policy.publicHeader?.forbiddenLabels||[])if(!liveVerifier.includes(label))fail(`live verifier missing public-header forbidden label: ${label}`);
if(!liveVerifier.includes('data-ekodi-operating-space-label'))fail('live verifier must reject the legacy operating-space marker from public headers');

const siteScripts=await walkJs(new URL('../sites/',import.meta.url));
const localAuthPattern=/new URL\(\s*['"]\/auth\/['"]\s*,\s*location\.origin\s*\)/;
for(const scriptUrl of siteScripts){
  const source=await readFile(scriptUrl,'utf8');
  if(localAuthPattern.test(source))fail(`${scriptUrl.pathname.split('/').slice(-4).join('/')}: site-local /auth/ entry is forbidden; use https://ekodi.kr/auth/ and preserve return_to`);
}

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
