import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const [ecosystem,docs,authRouter,clientAuth,siteConfig,platformRouter,theme,shellSource,injectorSource,workspaceStyle]=await Promise.all([
  readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../docs/ekodi-shell-contract.md',import.meta.url),'utf8'),
  readFile(new URL('../auth-site/auth-router.js',import.meta.url),'utf8'),
  readFile(new URL('../auth-site/client-auth.js',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8'),
  readFile(new URL('../platform-router-worker.js',import.meta.url),'utf8').catch(()=>''),
  readFile(new URL('../shell/theme.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../shell/shell.js',import.meta.url),'utf8'),
  readFile(new URL('../ekodi-shell-injector.js',import.meta.url),'utf8'),
  readFile(new URL('../shell/workspace.css',import.meta.url),'utf8'),
]);
const manifest=EKODI_SERVICE_MANIFEST;
const allowedKinds=new Set(['person','business','organization','church','community','project']);
const allowedIntegrations=new Set(['worker-injected','shared-proxy','static-script','external-build','pending','planned']);
const allowedSurfaces=new Set(['public','workspace','admin','form','document','data','transition','bridge','loading','handoff']);
const legacyPending=new Set();
const legacyServiceIds=new Set(['my','marketing','community','church','business','biz','work','author','books','lab','social','energy','mall','trade','pay','edu','media','insurance','mail','live','cloud']);
const compactPlatformRouter=platformRouter.replace(/\s+/g,'');

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

for(const required of ['setSurface','ekodi:shell-theme','ekodi:public-experience','EKODI 서비스 전환','public-rail','Asia/Seoul'])if(!shellSource.includes(required))fail(`Shell browser source lost public experience marker: ${required}`);
for(const forbidden of ['fetchPublicThemeFromAI','OPENAI_API_KEY','ANTHROPIC_API_KEY'])if(shellSource.includes(forbidden))fail(`Shell public rotation must remain provider-independent: ${forbidden}`);
for(const required of ['SHELL_WORKSPACE_STYLE','INTERNAL_SURFACES','defaultSurface(serviceId)','data-ekodi-workspace-style'])if(!injectorSource.includes(required))fail(`Worker injection lost internal UI contract: ${required}`);
if(!injectorSource.includes("headers.set('x-ekodi-shell','v2')"))fail('Worker injection must advertise Shell v2');
if(!injectorSource.includes("headers.set('x-ekodi-surface'"))fail('Worker injection must advertise the resolved surface');
if(!workspaceStyle.includes('data-ekodi-shell-surface="workspace"'))fail('shared workspace stylesheet must be scoped to internal surfaces');

const byId=new Map();
const byHost=new Map();
const ecosystemById=new Map((ecosystem.services||[]).map(service=>[service.id,service]));
for(const service of manifest.services||[]){
  if(!service?.id||!/^[a-z][a-z0-9-]*$/.test(service.id)){fail(`invalid service id: ${service?.id||'(missing)'}`);continue;}
  if(byId.has(service.id))fail(`duplicate service id: ${service.id}`);
  byId.set(service.id,service);
  let url;
  try{url=new URL(service.url);}catch{fail(`${service.id} has an invalid URL`);continue;}
  if(url.protocol!=='https:')fail(`${service.id} must use https`);
  if(byHost.has(url.hostname))fail(`duplicate canonical host: ${url.hostname}`);
  byHost.set(url.hostname,service.id);
  if(!allowedSurfaces.has(service.defaultSurface))fail(`${service.id} must declare a recognized defaultSurface`);
  if(!Array.isArray(service.workspaceKinds)||!service.workspaceKinds.length)fail(`${service.id} needs workspaceKinds`);
  for(const kind of service.workspaceKinds||[])if(!allowedKinds.has(kind))fail(`${service.id} has unsupported workspace kind ${kind}`);
  if(!Array.isArray(service.capabilities)||!service.capabilities.length)fail(`${service.id} needs capabilities`);
  if(typeof service.sso!=='boolean')fail(`${service.id} must declare sso`);
  if(typeof service.targetable!=='boolean')fail(`${service.id} must declare targetable`);
  if(!allowedIntegrations.has(service.shellIntegration))fail(`${service.id} must declare a recognized shellIntegration`);
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
      if(!authRouter.includes("manifestRealm?.authMode==='client'"))fail('Auth Router lost manifest-backed client realm support');
      if(!clientAuth.includes("service.authMode!=='client'"))fail('Client Auth lost manifest-backed client realm validation');
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
    const ecosystemHost=new URL(service.url).hostname;
    const manifestHost=new URL(manifestService.url).hostname;
    if(ecosystemHost!==manifestHost)fail(`${service.id} host differs between ecosystem registry (${ecosystemHost}) and service manifest (${manifestHost})`);
  }catch{fail(`${service.id} has an invalid registry URL`);}
  if(['live','beta'].includes(service.status)&&service.productionVerified===true&&manifestService.state==='planned')fail(`${service.id} is production verified but planned in service manifest`);
}
for(const service of manifest.services||[])if(!ecosystemById.has(service.id))fail(`canonical service ${service.id} is missing from the ecosystem registry`);
for(const required of ['Person + Space + Role + Capability','My EKODI responsibility','Visual architecture','Public service selector','Public experience rotation','Future-site onboarding','Browser context contract','Shell API','Security boundaries'])if(!docs.includes(required))fail(`Shell contract documentation lost required section: ${required}`);
if(process.exitCode)process.exit(process.exitCode);
console.log(`✅ EKODI Shell v${manifest.shellVersion} adoption policy passed: ${manifest.services.length} services covered; every service has a top selector identity, public rotation is bounded, and internal surfaces remain stable.`);
