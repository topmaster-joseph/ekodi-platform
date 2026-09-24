import { readFile } from 'node:fs/promises';
import {
  PLATFORM_CANONICAL_HOST,
  PLATFORM_EXECUTION_SURFACES,
  PLATFORM_LEGACY_HOST_PATHS,
  isReservedPlatformRoot,
} from '../platform-route-registry.js';

const readJson=async path=>JSON.parse((await readFile(new URL(`../${path}`,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const [boundaries,domainPolicy]=await Promise.all([
  readJson('platform-boundaries.json'),
  readJson('config/domain-canonical-policy.json'),
]);
const failures=[];
const fail=message=>failures.push(message);

if(domainPolicy.canonicalHost!==PLATFORM_CANONICAL_HOST) fail(`domain canonical host must be ${PLATFORM_CANONICAL_HOST}`);
const recognizedHosts=new Set([
  PLATFORM_CANONICAL_HOST,
  ...(domainPolicy.registeredCommonServiceBoundaries||[]),
  ...(domainPolicy.registeredCoreServiceBoundaries||[]),
]);
if(Object.keys(PLATFORM_LEGACY_HOST_PATHS).length) fail('EKODI-owned legacy host registry must remain empty under apex-path-only routing');
for(const host of domainPolicy.legacyDomainAllowlist||[]){
  if(String(host).endsWith('.ekodi.kr')||String(host).includes('/')) fail(`legacy domain allowlist must not contain EKODI child/path aliases: ${host}`);
}

const seenIds=new Set(),seenPrefixes=new Set();
for(const spec of PLATFORM_EXECUTION_SURFACES){
  if(!spec.id||seenIds.has(spec.id)) fail(`execution surface id missing/duplicate: ${spec.id||'(empty)'}`);
  if(!spec.prefix||!spec.prefix.startsWith('/')||seenPrefixes.has(spec.prefix)) fail(`execution surface prefix missing/duplicate: ${spec.prefix||'(empty)'}`);
  seenIds.add(spec.id);seenPrefixes.add(spec.prefix);
  const root=spec.prefix.split('/').filter(Boolean)[0]||'';
  if(root&&!isReservedPlatformRoot(root)) fail(`execution surface root is not reserved: ${root} (${spec.id})`);
  for(const host of [spec.virtualHost,spec.legacyHost,spec.canonicalHost].filter(Boolean)){
    if(!host.endsWith('.ekodi.kr')) continue;
    fail(`execution surface must not depend on an EKODI child host: ${host} (${spec.id})`);
  }
}

for(const [host,target] of Object.entries(domainPolicy.legacyDomainTargets||{})){
  if(String(host).endsWith('.ekodi.kr')||String(host).includes('/')) fail(`legacy domain target key must be an external hostname, not an EKODI child/path alias: ${host}`);
  if(!String(target).startsWith(`https://${PLATFORM_CANONICAL_HOST}`)) fail(`legacy target must converge to apex: ${host} -> ${target}`);
}

for(const [id,boundary] of Object.entries(boundaries.platforms||{})){
  for(const domain of boundary.domains||[]){
    if(domain===PLATFORM_CANONICAL_HOST||domain===`www.${PLATFORM_CANONICAL_HOST}`) continue;
    if(domain.includes('*')) continue;
    if(!domain.endsWith('.ekodi.kr')) continue;
    fail(`${id}: EKODI-owned child host is forbidden under apex-path-only routing: ${domain}`);
  }
  for(const key of ['canonicalPath','publicEntry']){
    const value=boundary[key];
    if(typeof value!=='string'||!value.startsWith('http')) continue;
    let host='';
    try{host=new URL(value).hostname}catch{fail(`${id}: invalid ${key}: ${value}`);continue}
    if(host!==PLATFORM_CANONICAL_HOST) fail(`${id}: ${key} must use canonical apex host, got ${value}`);
  }
}

if(failures.length){
  console.error(`Canonical boundary sync failed (${failures.length})`);
  failures.forEach(item=>console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Canonical boundary sync OK: ${PLATFORM_EXECUTION_SURFACES.length} execution surfaces, ${Object.keys(boundaries.platforms||{}).length} boundaries`);
