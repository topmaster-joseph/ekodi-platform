import { readFile } from 'node:fs/promises';
import { EKODI_UI_SURFACE_POLICY, resolveEkodiUiSurface } from '../config/ui-surface-policy.js';

const failures=[];
const fail=message=>failures.push(message);
const required=['platform-public','user-public','member-workspace','tenant-admin','platform-admin','service-admin'];
const actual=Object.keys(EKODI_UI_SURFACE_POLICY.surfaces||{});
for(const id of required) if(!actual.includes(id)) fail(`missing canonical UI surface: ${id}`);
if(EKODI_UI_SURFACE_POLICY.principles?.oneCoreManySurfaces!==true) fail('one Core / many surfaces principle missing');
if(EKODI_UI_SURFACE_POLICY.principles?.platformAndGeneralUserUiSeparated!==true) fail('platform/general-user separation missing');
if(EKODI_UI_SURFACE_POLICY.principles?.adminAuthoritySeparated!==true) fail('admin authority separation missing');
if(EKODI_UI_SURFACE_POLICY.principles?.tenantBrandPrimaryOutsidePlatform!==true) fail('tenant identity priority missing');

const cases=[
  [{serviceId:'ekodi',shellSurface:'public'},'platform-public'],
  [{serviceId:'church',shellSurface:'public'},'user-public'],
  [{serviceId:'ekodi',shellSurface:'workspace'},'user-public'],
  [{serviceId:'my',shellSurface:'workspace'},'member-workspace'],
  [{serviceId:'business',shellSurface:'admin',authorityScope:'tenant'},'tenant-admin'],
  [{serviceId:'ekodi',shellSurface:'admin'},'platform-admin'],
  [{serviceId:'books',shellSurface:'admin',authorityScope:'service'},'service-admin'],
];
for(const [input,expected] of cases){
  const actualSurface=resolveEkodiUiSurface(input);
  if(actualSurface!==expected) fail(`${JSON.stringify(input)} resolved ${actualSurface}; expected ${expected}`);
}
const [injector,worker,governor,principles]=await Promise.all([
  readFile(new URL('../ekodi-shell-injector.js',import.meta.url),'utf8'),
  readFile(new URL('../ekodi-shell-worker.js',import.meta.url),'utf8'),
  readFile(new URL('../shell/ui-surface-governor.js',import.meta.url),'utf8'),
  readFile(new URL('../docs/ui-system-principles.md',import.meta.url),'utf8'),
]);
if(!injector.includes('x-ekodi-ui-surface')) fail('Shell must expose x-ekodi-ui-surface');
if(!injector.includes('data-ekodi-ui-surface')) fail('Shell must expose data-ekodi-ui-surface');
if(!worker.includes('ui-surface-governor.js')) fail('Shell bundle must include UI Surface Governor');
if(!worker.includes('x-ekodi-ui-surface-governor')) fail('Shell bundle must advertise UI Surface Governor');
for(const marker of ['tenant-admin','platform-admin','service-admin',"ekodiScrollOwner='workspace'","overflow-y','auto","overflow-y','hidden"]){
  if(!governor.includes(marker)) fail(`UI Surface Governor missing ${marker}`);
}
for(const label of required) if(!principles.includes(label)) fail(`UI system principles missing ${label}`);

if(failures.length){
  console.error(`EKODI UI Surface validation failed (${failures.length})`);
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`EKODI UI Surface policy OK: ${required.length} canonical surfaces with shared Core, governed identity separation and fixed Admin scroll ownership.`);
