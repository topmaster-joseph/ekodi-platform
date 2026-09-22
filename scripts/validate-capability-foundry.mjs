import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const foundry=read('config/capability-foundry.json');
const registry=read('config/capability-registry.json');
const errors=[];
const fail=m=>errors.push(m);
const unique=(items,label)=>{const ids=items.map(x=>x.id);if(new Set(ids).size!==ids.length)fail('duplicate '+label+' id')};
if(foundry.foundryId!=='ekodi.capability-foundry.v1')fail('foundryId must be canonical');
if(foundry.visibility!=='admin_internal')fail('foundry must remain admin_internal');
if(foundry.serviceCreationRule?.capabilityFirst!==true)fail('capability-first must be enforced');
if(foundry.serviceCreationRule?.sampleBeforeUserService!==true)fail('sample-before-service must be enforced');
if(foundry.serviceCreationRule?.serviceCreationAutomatic!==false)fail('automatic service creation must remain disabled');
if(Number(foundry.serviceCreationRule?.minimumVerifiedSampleRuns)<3)fail('at least three verified sample runs are required');
if(foundry.sampleService?.dataPolicy!=='synthetic_only'||foundry.sampleService?.sideEffects!=='none'||foundry.sampleService?.productionWrites!==false)fail('sample service must remain synthetic and side-effect free');
unique(foundry.families||[],'family');unique(foundry.modules||[],'module');unique(foundry.sampleRecipes||[],'recipe');
const families=new Set((foundry.families||[]).map(x=>x.id));
const modules=new Set((foundry.modules||[]).map(x=>x.id));
const capabilities=new Set([...(registry.capabilities||[]),...(registry.fabricCapabilities||[])].map(x=>x.id));
for(const module of foundry.modules||[]){if(!families.has(module.family))fail('unknown family for '+module.id);if(!['discovered','module_candidate','sandboxed','verified','ready_for_reuse','adopted','quarantined','retired'].includes(module.state))fail('invalid module state '+module.id)}
for(const recipe of foundry.sampleRecipes||[]){if(recipe.sampleInput?.synthetic!==true)fail('recipe must use synthetic input: '+recipe.id);for(const id of recipe.modules||[])if(!modules.has(id))fail('recipe module missing '+recipe.id+': '+id);for(const id of recipe.capabilities||[])if(!capabilities.has(id))fail('recipe capability missing '+recipe.id+': '+id)}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('Capability Foundry validation passed: '+foundry.modules.length+' modules, '+foundry.sampleRecipes.length+' sample recipes, '+foundry.families.length+' internal families.');
