import { access, readFile } from 'node:fs/promises';
const readJson=async path=>JSON.parse((await readFile(new URL(`../${path}`,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const policy=await readJson('config/data-ownership-policy.json');
const failures=[];
const fail=message=>failures.push(message);
if(policy.schemaVersion!==1||policy.status!=='enforced') fail('data ownership policy must be enforced schema v1');
for(const [label,path] of Object.entries(policy.authoritativeSources||{})){
  try{await access(new URL(`../${path}`,import.meta.url))}catch{fail(`missing authoritative data source ${label}: ${path}`)}
}
const [core,boundaries,architecture]=await Promise.all([
  readJson(policy.authoritativeSources.coreProtectedData),
  readJson(policy.authoritativeSources.serviceOperationalData),
  readJson(policy.authoritativeSources.architecture),
]);
if(!Array.isArray(core.protectedTables)||core.protectedTables.length===0) fail('core protected table registry must not be empty');
if(!String(core.rule||'').includes('must not directly reference')) fail('core data boundary must forbid direct protected-table coupling');
for(const [id,boundary] of Object.entries(boundaries.platforms||{})){
  if(policy.rules?.serviceDatabaseDeclarationRequired===true&&typeof boundary.database!=='string') fail(`${id}: database ownership/declaration is required`);
}
if(policy.rules?.directPrivateDatabaseCouplingAcrossIndependentServices!==false) fail('private cross-service DB coupling must remain forbidden');
if(policy.rules?.crossBoundaryContractRequired!==true) fail('cross-boundary contracts must remain required');
if(policy.rules?.projectionMayBecomeCanonicalAuthority!==false) fail('projections must not become canonical authority');
const rules=architecture.connectionRules||[];
if(!rules.includes('Direct private database coupling across responsible independent service boundaries is forbidden.')) fail('architecture lost cross-service private DB prohibition');
if(!rules.includes('Cross-boundary access uses a public or explicitly declared contract.')) fail('architecture lost explicit cross-boundary contract rule');
if(failures.length){
  console.error(`Data ownership validation failed (${failures.length})`);
  failures.forEach(item=>console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Data ownership OK: ${core.protectedTables.length} protected core tables, ${Object.keys(boundaries.platforms||{}).length} service boundary declarations`);
