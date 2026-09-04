import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const [ecosystem,docs,authRouter,clientAuth,siteConfig,platformRouter,theme,shellSource,shellWorker,mobileHeaderSource,injectorSource,userUiStyle,workspaceStyle,responsiveStyle,rootIndex,adminStyle]=await Promise.all([
  readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../docs/ekodi-shell-contract.md',import.meta.url),'utf8'),
  readFile(new URL('../auth-site/auth-router.js',import.meta.url),'utf8'),
  readFile(new URL('../auth-site/client-auth.js',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8'),
  readFile(new URL('../platform-router-worker.js',import.meta.url),'utf8').catch(()=>''),
  readFile(new URL('../shell/theme.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../shell/shell.js',import.meta.url),'utf8'),
  readFile(new URL('../ekodi-shell-worker.js',import.meta.url),'utf8'),
  readFile(new URL('../shell/mobile-fixed-header.js',import.meta.url),'utf8'),
  readFile(new URL('../ekodi-shell-injector.js',import.meta.url),'utf8'),
  readFile(new URL('../shell/user-ui-shell.css',import.meta.url),'utf8'),
  readFile(new URL('../shell/workspace.css',import.meta.url),'utf8'),
  readFile(new URL('../responsive.css',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../admin-shell.css',import.meta.url),'utf8'),
]);
const manifest=EKODI_SERVICE_MANIFEST;
const allowedKinds=new Set(['person','business','organization','church','community','project']);
const allowedIntegrations=new Set(['worker-injected','shared-proxy','static-script','external-build','pending','planned']);
const allowedSurfaces=new Set(['public','workspace','admin','form','document','data','transition','bridge','loading','handoff']);
const legacyPending=new Set();
const legacyServiceIds=new Set(['my','marketing','community','church','business','biz','work','author','books','lab','social','energy','mall','trade','pay','edu','media','insurance','mail','live','cloud']);
const compactPlatformRouter=platformRouter.replace(/\s+/g,'');
const compactUserUiStyle=userUiStyle.replace(/\s+/g,'');
const canonicalPath=value=>{const path=String(value||'/').replace(/\/+$/,'');return path||'/';};
const canonicalUrl=value=>{const url=value instanceof URL?value:new URL(value);return `${url.origin}${canonicalPath(url.pathname)}`;};

function fail(message){console.error(`❌ EKODI Shell adoption: ${message}`);process.exitCode=1;}

if(manifest.identityModel!=='person-space-role')fail('identityModel must remain person-space-role');
if(manifest.shellPolicy!=='required-for-user-facing-services')fail('shellPolicy must require Shell for user-facing services');
if(!Number.isInteger(manifest.shellVersion)||manifest.shellVersion<2)fail('shellVersion must be at least 2');
if(!Number.isInteger(manifest.onboardingPolicyVersion)||manifest.onboardingPolicyVersion<1)fail('onboardingPolicyVersion must be a positive integer');
if(theme.version!==manifest.shellVersion)fail(`theme version ${theme.version} must match shellVersion ${manifest.shellVersion}`);
for(const required of ['workspace','admin','form','document','data'])if(!theme.rules?.stableSurfaces?.includes(required))fail(`stable surface missing: ${required}`);
if(!theme.rules?.publicSurfaces?.includes('public'))fail('public surface must be explicit in the shared Shell');
for(const required of ['transition','bridge','loading','handoff'])if(!theme.rules?.dynamicSurfaces?.includes(required))fail(`dynamic surface missing: ${required}`);
for(const required of ['navigationPosition','buttonGeometry','fontScale','formLayout','focusTreatment','contrastFloor','safeArea','authMeaning'])if(!theme.rules?.dynamicMustNotChange?.includes(required))fail(`dynamic protected property missing: ${required}`);
for(const required of ['siteLayout','contentOrder','navigationPosition','buttonGeometry','fontScale','focusTreatment','contrastFloor','safeArea','authMeaning','serviceIdentity'])if(!theme.rules?.publicDynamicMustNotChange?.includes(required))fail(`public rotation protected property missing: ${required}`);

if(theme.publicExperience?.enabled!==true)fail('public experience rotation must be enabled');
if(theme.publicExperience?.timezone!=='Asia/Seoul')fail('public experience rotation timezone must remain Asia/Seoul');
if(theme.publicExperience?.rotation!=='weekly-deterministic'||theme.publicExperience?.cycleDays!==7)fail('public experience rotation must remain weekly-deterministic');
if(!Array.isArray(theme.publicExperience?.variants)||theme.publicExperience.variants.length<3)fail('public experience needs at least three pre-approved variants');
for(const motif of ['orbit','flow','grid','paper','signal','stage'])if(!Array.isArray(theme.publicExperience?.motifs?.[motif])||!theme.publicExperience.motifs[motif].length)fail(`public experience motif missing: ${motif}`);

for(const required of ['setSurface','ekodi:shell-theme','ekodi:public-experience','EKODI 다음 행동','suggestedServices','public-rail','Asia/Seoul'])if(!shellSource.includes(required))fail(`Shell browser source lost public experience marker: ${required}`);
for(const required of ['function workspaceUiAvailable(){return false;}','ekodiWorkspaceSelector=\'removed\''])if(!shellSource.includes(required))fail(`Shell browser source must keep workspace/path selector chrome removed: ${required}`);
for(const required of ['memberGateApplies','localMemberSession','guide-only','Google로 무료 시작','ekodiMemberAccess'])if(!shellSource.includes(required))fail(`Shell browser source lost common-service member gate marker: ${required}`);
for(const forbidden of ['fetchPublicThemeFromAI','OPENAI_API_KEY','ANTHROPIC_API_KEY'])if(shellSource.includes(forbidden))fail(`Shell public rotation must remain provider-independent: ${forbidden}`);
for(const required of ['SHELL_WORKSPACE_STYLE','SHELL_USER_UI_STYLE','INTERNAL_SURFACES','defaultSurface(serviceId)','data-ekodi-workspace-style','data-ekodi-user-ui-style'])if(!injectorSource.includes(required))fail(`Worker injection lost shared UI contract: ${required}`);
if(!injectorSource.includes("headers.set('x-ekodi-shell','v2')"))fail('Worker injection must advertise Shell v2');
if(!injectorSource.includes("headers.set('x-ekodi-surface'"))fail('Worker injection must advertise the resolved surface');
if(!workspaceStyle.includes('data-ekodi-shell-surface="workspace"'))fail('shared workspace stylesheet must be scoped to internal surfaces');

for(const required of ["headerUrl.pathname='/mobile-fixed-header.js'",'fixedHeader','bundledShell'])if(!shellWorker.includes(required))fail(`Shell Worker lost bundled mobile header runtime: ${required}`);
for(const required of ['position:fixed!important','ResizeObserver','data-ekodi-mobile-header-spacer','safe-area-inset-top','.site-header','.topbar'])if(!mobileHeaderSource.includes(required))fail(`mobile header runtime missing: ${required}`);
for(const required of ['position:fixed!important','left:0!important','right:0!important','safe-area-inset-top']){
  if(!compactUserUiStyle.includes(required))fail(`shared CSP-safe user chrome contract missing: ${required}`);
  if(!responsiveStyle.includes(required))fail(`responsive mobile header contract missing: ${required}`);
}
if(compactUserUiStyle.includes('position:sticky!important'))fail('shared user chrome stylesheet must not downgrade adopted mobile headers to sticky');
if(responsiveStyle.includes('position:sticky!important'))fail('responsive.css must not downgrade mobile headers to sticky');
if(!rootIndex.includes('.site-header{position:fixed;top:0;left:0;right:0;width:100%'))fail('ekodi.kr mobile site header must be fixed');
if(!rootIndex.includes('body{padding-top:calc(var(--ekodi-home-header-height) + env(safe-area-inset-top,0px))}'))fail('ekodi.kr content must be offset below the fixed mobile header');
if(/<script\b/i.test(rootIndex))fail('ekodi.kr root must preserve its zero-JavaScript contract');
if(!adminStyle.includes('.app>main{padding-top:calc(78px + env(safe-area-inset-top,0px))}'))fail('admin mobile content must be offset below the fixed topbar');
if(!adminStyle.includes('.topbar{position:fixed!important;top:0!important;left:0!important;right:0!important;width:100%!important'))fail('admin mobile topbar must remain fixed across control-center pages');

if(!authRouter.includes('manifestService'))fail('Auth Router lost manifest-backed service discovery');
if(!authRouter.includes('isRegistryUserService'))fail('Auth Router lost registry-driven universal identity routing');
if(!authRouter.includes("site==='portal'||isRegistryUserService"))fail('Auth Router no longer sends registry user services through universal identity handoff');
if(!clientAuth.includes('async function manifestRealm'))fail('Client Auth lost manifest-backed realm discovery');
if(!clientAuth.includes('service?.url'))fail('Client Auth lost manifest service URL validation');
if(!clientAuth.includes("serviceUrl.protocol!=='https:'"))fail('Client Auth must reject non-HTTPS manifest service URLs');
if(!clientAuth.includes('/session/handoff'))fail('Client Auth lost central session handoff');

const byId=new Map();
const byCanonical=new Map();
const ecosystemById=new Map((ecosystem.services||[]).map(service=>[service.id,service]));
for(const service of manifest.services||[]){
  if(!service?.id||!/^[a-z][a-z0-9-]*$/.test(service.id)){fail(`invalid service id: ${service?.id||'(missing)'}`);continue;}
  if(byId.has(service.id))fail(`duplicate service id: ${service.id}`);
  byId.set(service.id,service);
  let url;
  try{url=new URL(service.url);}catch{fail(`${service.id} has an invalid URL`);continue;}
  if(url.protocol!=='https:')fail(`${service.id} must use https`);
  const canonical=canonicalUrl(url);
  if(byCanonical.has(canonical))fail(`duplicate canonical URL: ${canonical}`);
  byCanonical.set(canonical,service.id);
  if(!allowedSurfaces.has(service.defaultSurface))fail(`${service.id} must declare a recognized defaultSurface`);
  if(!Array.isArray(service.workspaceKinds)||!service.workspaceKinds.length)fail(`${service.id} needs workspaceKinds`);
  for(const kind of service.workspaceKinds||[])if(!allowedKinds.has(kind))fail(`${service.id} has unsupported workspace kind ${kind}`);
  if(!Array.isArray(service.capabilities)||!service.capabilities.length)fail(`${service.id} needs capabilities`);
  if(typeof service.sso!=='boolean')fail(`${service.id} must declare sso`);
  if(typeof service.targetable!=='boolean')fail(`${service.id} must declare targetable`);
  if(!allowedIntegrations.has(service.shellIntegration))fail(`${service.id} must declare a recognized shellIntegration`);
  const commonUserPage=service.operatingModel!=='customer-site';
  if(commonUserPage){
    const p=service.userAccessPolicy;
    const publicGuide=service.defaultSurface==='public';
    const expectedGuestMode=publicGuide?'public-guide':'guide-only';
    const expectedEnforcer=publicGuide?'service-ui-and-protected-api':'shared-shell';
    if(p?.scope!=='user-pages'||p?.guestMode!==expectedGuestMode||p?.minimumTier!=='free'||p?.identityProvider!=='google'||p?.enforcedBy!==expectedEnforcer)fail(`${service.id} must keep public guide pages visible while protecting member content`);
  }
  else if(service.userAccessPolicy!==null)fail(`${service.id} customer site must keep its own user access policy`);
  const serviceTheme=theme.services?.[service.id];
  if(!serviceTheme?.accent)fail(`${service.id} needs a Shell v2 identity accent`);
  if(!serviceTheme?.public?.motif||!theme.publicExperience?.motifs?.[serviceTheme.public.motif])fail(`${service.id} needs a recognized public visual motif`);
  if(!serviceTheme?.public?.companion)fail(`${service.id} needs a public companion color`);
  const planned=service.state==='planned';
  if(planned&&service.shellIntegration!=='planned')fail(`${service.id} is planned and must use shellIntegration=planned`);
  if(!planned&&service.shellIntegration==='planned')fail(`${service.id} is active but still marked shellIntegration=planned`);
  if(!planned&&service.shellIntegration==='pending'&&!legacyPending.has(service.id))fail(`${service.id} is an active service without Shell integration`);

  if(!legacyServiceIds.has(service.id)){
    if(service.onboardingVersion!==manifest.onboardingPolicyVersion)fail(`${service.id} must adopt onboardingVersion=${manifest.onboardingPolicyVersion}`);
    if(!ecosystemById.has(service.id))fail(`${service.id} must be registered in the ecosystem registry on creation`);
    if(!planned&&service.sso!==true)fail(`${service.id} must use EKODI SSO before activation`);
    if(!planned&&service.authMode==='client'){
      if(!authRouter.includes('isRegistryUserService'))fail('Auth Router lost registry-driven client realm support');
      if(!clientAuth.includes('manifestRealm'))fail('Client Auth lost manifest-backed client realm support');
    }
    if(!planned&&service.shellIntegration==='shared-proxy'){
      if(!siteConfig.includes(`pattern = "${url.hostname}"`))fail(`${service.id} shared platform host is missing from wrangler.site.toml`);
      if(!compactPlatformRouter.includes(`'${url.hostname}':'${service.id}'`))fail(`${service.id} shared platform host is missing from platform-router-worker.js`);
    }
  }
}

for(const service of ecosystem.services||[]){
  if(!byId.has(service.id))fail(`ecosystem registry service ${service.id} is missing from the canonical service manifest`);
  const manifestService=byId.get(service.id);
  if(!manifestService)continue;
  try{
    const ecosystemCanonical=canonicalUrl(service.url);
    const manifestCanonical=canonicalUrl(manifestService.url);
    if(ecosystemCanonical!==manifestCanonical)fail(`${service.id} URL differs between ecosystem registry (${ecosystemCanonical}) and service manifest (${manifestCanonical})`);
  }catch{fail(`${service.id} has an invalid registry URL`);}
  if(['live','beta'].includes(service.status)&&service.productionVerified===true&&manifestService.state==='planned')fail(`${service.id} is production verified but planned in service manifest`);
}
for(const service of manifest.services||[])if(!ecosystemById.has(service.id))fail(`canonical service ${service.id} is missing from the ecosystem registry`);
for(const required of ['Person + Space + Role + Capability','My EKODI responsibility','Visual architecture','Public service selector','Public experience rotation','Future-site onboarding','Browser context contract','Shell API','Security boundaries'])if(!docs.includes(required))fail(`Shell contract documentation lost required section: ${required}`);
if(process.exitCode)process.exit(process.exitCode);
console.log(`✅ EKODI Shell v${manifest.shellVersion} adoption policy passed: ${manifest.services.length} services covered; shared runtime fixes mobile headers, CSP-safe user chrome is externalized, root stays zero-JS, internal surfaces remain stable, and registry services inherit One Login.`);
