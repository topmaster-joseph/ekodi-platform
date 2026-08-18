import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const ecosystem=JSON.parse(await readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));
const docs=await readFile(new URL('../docs/ekodi-shell-contract.md',import.meta.url),'utf8');
const manifest=EKODI_SERVICE_MANIFEST;
const allowedKinds=new Set(['person','business','organization','church','community','project']);
const allowedIntegrations=new Set(['worker-injected','shared-proxy','static-script','external-build','pending','planned']);
// These services existed before the common Shell contract was adopted. They may remain pending only while
// being migrated one by one. Any new active service is forbidden from using this escape hatch.
const legacyPending=new Set(['marketing','business','work','author','books','social','energy','trade','pay']);

function fail(message){console.error(`❌ EKODI Shell adoption: ${message}`);process.exitCode=1;}

if(manifest.identityModel!=='person-space-role')fail('identityModel must remain person-space-role');
if(manifest.shellPolicy!=='required-for-user-facing-services')fail('shellPolicy must require Shell for user-facing services');
if(!Number.isInteger(manifest.shellVersion)||manifest.shellVersion<1)fail('shellVersion must be a positive integer');

const byId=new Map();
const byHost=new Map();
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
  if(!planned&&service.shellIntegration==='pending'&&!legacyPending.has(service.id))fail(`${service.id} is a new active service without Shell integration`);
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

for(const required of ['Person + Space + Role + Capability','My EKODI responsibility','Future-site onboarding','Browser workspace context contract','Security boundaries']){
  if(!docs.includes(required))fail(`Shell contract documentation lost required section: ${required}`);
}

if(process.exitCode)process.exit(process.exitCode);
console.log(`✅ EKODI Shell adoption policy passed: ${manifest.services.length} services covered; new active services cannot bypass the shared My/Shell contract.`);
