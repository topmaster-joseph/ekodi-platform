import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const [ecosystem,docs,authRouter,clientAuth,siteConfig,platformRouter]=await Promise.all([
  readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../docs/ekodi-shell-contract.md',import.meta.url),'utf8'),
  readFile(new URL('../auth-site/auth-router.js',import.meta.url),'utf8'),
  readFile(new URL('../auth-site/client-auth.js',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8'),
  readFile(new URL('../platform-router-worker.js',import.meta.url),'utf8').catch(()=>''),
]);
const manifest=EKODI_SERVICE_MANIFEST;
const allowedKinds=new Set(['person','business','organization','church','community','project']);
const allowedIntegrations=new Set(['worker-injected','shared-proxy','static-script','external-build','pending','planned']);
const legacyPending=new Set();
const legacyServiceIds=new Set(['my','marketing','community','church','business','biz','work','author','books','lab','social','energy','mall','trade','pay','edu','media','insurance','mail','live','cloud']);

function fail(message){console.error(`❌ EKODI Shell adoption: ${message}`);process.exitCode=1;}

if(manifest.identityModel!=='person-space-role')fail('identityModel must remain person-space-role');
if(manifest.shellPolicy!=='required-for-user-facing-services')fail('shellPolicy must require Shell for user-facing services');
if(!Number.isInteger(manifest.shellVersion)||manifest.shellVersion<1)fail('shellVersion must be a positive integer');
if(!Number.isInteger(manifest.onboardingPolicyVersion)||manifest.onboardingPolicyVersion<1)fail('onboardingPolicyVersion must be a positive integer');

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
  if(!Array.isArray(service.workspaceKinds)||!service.workspaceKinds.length)fail(`${service.id} needs workspaceKinds`);
  for(const kind of service.workspaceKinds||[])if(!allowedKinds.has(kind))fail(`${service.id} has unsupported workspace kind ${kind}`);
  if(!Array.isArray(service.capabilities)||!service.capabilities.length)fail(`${service.id} needs capabilities`);
  if(typeof service.sso!=='boolean')fail(`${service.id} must declare sso`);
  if(typeof service.targetable!=='boolean')fail(`${service.id} must declare targetable`);
  if(!allowedIntegrations.has(service.shellIntegration))fail(`${service.id} must declare a recognized shellIntegration`);
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
      if(!siteConfig.includes(`pattern = \"${url.hostname}\"`))fail(`${service.id} shared platform host is missing from wrangler.site.toml`);
      if(!platformRouter.includes(`'${url.hostname}': '${service.id}'`))fail(`${service.id} shared platform host is missing from platform-router-worker.js`);
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
for(const service of manifest.services||[]){
  if(!ecosystemById.has(service.id))fail(`canonical service ${service.id} is missing from the ecosystem registry`);
}

for(const required of ['Person + Space + Role + Capability','My EKODI responsibility','Future-site onboarding','Browser context contract','Security boundaries']){
  if(!docs.includes(required))fail(`Shell contract documentation lost required section: ${required}`);
}

if(process.exitCode)process.exit(process.exitCode);
console.log(`✅ EKODI Shell adoption policy passed: ${manifest.services.length} services covered; zero legacy services remain pending; future services require automatic onboarding v${manifest.onboardingPolicyVersion}.`);
