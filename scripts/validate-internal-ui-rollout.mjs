import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [policy,injector,workspaceCss,shell,workflow]=await Promise.all([
  read('config/internal-ui-rollout.json').then(JSON.parse),
  read('ekodi-shell-injector.js'),
  read('shell/workspace.css'),
  read('shell/shell.js'),
  read('.github/workflows/deploy-ekodi-shell.yml'),
]);
let failed=false;
const fail=message=>{console.error(`❌ Internal UI rollout: ${message}`);failed=true;};
const stable=new Set(policy.internalSurfaces||[]);
const dynamic=new Set(policy.dynamicSurfaces||[]);

if(policy.version!==1)fail('policy version must remain 1');
for(const required of ['workspace','admin','form','document','data'])if(!stable.has(required))fail(`missing internal surface ${required}`);
for(const required of ['transition','bridge','loading','handoff'])if(!dynamic.has(required))fail(`missing dynamic surface ${required}`);
if([...stable].some(x=>dynamic.has(x)))fail('stable and dynamic surfaces must not overlap');

for(const service of EKODI_SERVICE_MANIFEST.services){
  if(!service.defaultSurface)fail(`${service.id} has no defaultSurface`);
  if(!['public',...stable,...dynamic].includes(service.defaultSurface))fail(`${service.id} has invalid defaultSurface ${service.defaultSurface}`);
}
for(const id of policy.rootWorkspaceServices||[]){
  const service=EKODI_SERVICE_MANIFEST.services.find(item=>item.id===id);
  if(service?.defaultSurface!=='workspace')fail(`${id} must default to workspace`);
}
for(const id of policy.publicRootServices||[]){
  const service=EKODI_SERVICE_MANIFEST.services.find(item=>item.id===id);
  if(service?.defaultSurface!=='public')fail(`${id} public root must remain public`);
}

for(const marker of ['SHELL_WORKSPACE_STYLE','data-ekodi-workspace-style','x-ekodi-surface','style-src','INTERNAL_SURFACES'])if(!injector.includes(marker))fail(`injector missing ${marker}`);
if(!injector.includes("defaultSurface(serviceId)"))fail('injector must resolve manifest default surfaces');
if(!workspaceCss.includes('data-ekodi-shell-surface="workspace"'))fail('workspace stylesheet is not scoped to internal surfaces');
if(!workspaceCss.includes('data-ekodi-document-surface'))fail('document light-canvas exception is missing');
if(!workspaceCss.includes('focus-visible'))fail('shared focus visibility rule is missing');
if(!shell.includes("html.dataset.ekodiShellSurface=value.surface"))fail('shell must publish the active surface on the root element');
if(!workflow.includes('workspace.css'))fail('Shell deployment workflow must verify workspace.css');
if(workspaceCss.includes(':root:not('))fail('workspace stylesheet must not use broad negative selectors');

if(failed)process.exit(1);
console.log(`✅ Internal UI rollout contract valid for ${EKODI_SERVICE_MANIFEST.services.length} services; ${policy.rootWorkspaceServices.length} workspace roots and ${policy.publicRootServices.length} public roots are explicit.`);
