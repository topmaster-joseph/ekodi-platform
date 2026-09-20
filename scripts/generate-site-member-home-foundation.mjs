import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const policy=JSON.parse(fs.readFileSync(path.join(root,'config','site-member-home.json'),'utf8'));
const packs=JSON.parse(fs.readFileSync(path.join(root,'config','workspace-packs.json'),'utf8'));
const capabilities=JSON.parse(fs.readFileSync(path.join(root,'config','capability-registry.json'),'utf8'));
const ecosystem=JSON.parse(fs.readFileSync(path.join(root,'config','ecosystem-services.json'),'utf8'));
const constitution=JSON.parse(fs.readFileSync(path.join(root,'governance','constitution','constitution.json'),'utf8'));
const outPath=path.join(root,'generated','site-member-home-foundation.js');

const capabilityById=new Map((capabilities.capabilities||[]).map(item=>[String(item.id),item]));
const packById=new Map((packs.packs||[]).map(item=>[String(item.id),item]));
const core=policy?.foundation?.layers?.core||[];
const common=policy?.foundation?.layers?.common||[];

for(const id of [...core,...common]){
  if(!capabilityById.has(String(id)))throw new Error(`Site member home references unknown capability: ${id}`);
}
const audiencePacks={};
for(const [audience,ids] of Object.entries(policy.audiencePacks||{})){
  if(!/^[a-z][a-z0-9-]{0,39}$/.test(audience))throw new Error(`Invalid audience: ${audience}`);
  audiencePacks[audience]=ids.map(id=>{
    const pack=packById.get(String(id));
    if(!pack)throw new Error(`Site member home references unknown pack: ${id}`);
    for(const capability of pack.capabilities||[]){
      if(!capabilityById.has(String(capability)))throw new Error(`Workspace pack ${id} references unknown capability: ${capability}`);
    }
    return {
      id:String(pack.id),
      name:String(pack.name||pack.id),
      description:String(pack.description||''),
      capabilities:[...(pack.capabilities||[])].map(String),
    };
  });
}
const compactCapability=id=>{
  const item=capabilityById.get(String(id))||{};
  return {id:String(id),name:String(item.name||id),description:String(item.description||'')};
};
const availableStatuses=new Set(['live','beta']);
function canonicalServiceUrl(service,id){
  const raw=String(service?.url||(service?.domain?`https://${service.domain}`:'')).trim();
  if(!raw)return `https://ekodi.kr/${encodeURIComponent(id)}`;
  try{
    const url=new URL(raw);
    if(url.hostname==='ekodi.kr')return url.toString();
    if(url.hostname.endsWith('.ekodi.kr')){
      const mapped=constitution.legacyDomainTargets?.[url.hostname];
      if(mapped){const target=new URL(mapped);if(target.hostname==='ekodi.kr')return target.toString();}
      return `https://ekodi.kr/${encodeURIComponent(id)}`;
    }
    return url.toString();
  }catch{return `https://ekodi.kr/${encodeURIComponent(id)}`;}
}
const services=(ecosystem.services||[])
  .filter(service=>service?.userVisible!==false)
  .map(service=>{
    const id=String(service?.id||'').trim().toLowerCase();
    const url=canonicalServiceUrl(service,id);
    const status=String(service?.status||'planned').trim().toLowerCase();
    const productionVerified=service?.productionVerified===true;
    return {
      id,
      name:String(service?.name||service?.nameEn||id).trim(),
      nameEn:String(service?.nameEn||'').trim(),
      url,
      group:String(service?.category||service?.group||'').trim().toLowerCase(),
      status,
      productionVerified,
      available:Boolean(productionVerified&&availableStatuses.has(status)),
    };
  });
for(const service of services){
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(service.id))throw new Error(`Invalid site-member service id: ${service.id}`);
  try{new URL(service.url)}catch{throw new Error(`Invalid site-member service URL: ${service.id}`)}
}
const payload={
  schemaVersion:Number(policy.schemaVersion||1),
  policyId:String(policy.policyId||'site-local-member-home'),
  workspacePackVersion:String(packs.version||''),
  capabilityRegistryVersion:String(capabilities.version||''),
  ecosystemServiceRegistryVersion:String(ecosystem.version||''),
  core:core.map(compactCapability),
  common:common.map(compactCapability),
  audiencePacks,
  services,
  canonical:policy.canonical||{},
  customization:policy.customization||{},
  privacy:policy.privacy||{},
};
const banner='// GENERATED from config/site-member-home.json + workspace/capability registries. Do not edit by hand.\n';
fs.mkdirSync(path.dirname(outPath),{recursive:true});
fs.writeFileSync(outPath,`${banner}export const SITE_MEMBER_HOME_FOUNDATION=Object.freeze(${JSON.stringify(payload,null,2)});\nexport function foundationForAudience(value){const key=String(value||'person').trim().toLowerCase();return Object.freeze({...SITE_MEMBER_HOME_FOUNDATION,specialist:SITE_MEMBER_HOME_FOUNDATION.audiencePacks[key]||SITE_MEMBER_HOME_FOUNDATION.audiencePacks.person||[]});}\n`);
console.log(`Generated site-local member-home foundation for ${Object.keys(audiencePacks).length} audiences.`);
