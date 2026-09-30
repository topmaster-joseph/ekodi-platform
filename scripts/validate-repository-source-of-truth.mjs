import { readFile } from 'node:fs/promises';
const readJson=async path=>JSON.parse((await readFile(new URL(`../${path}`,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const [registry,platformTruth]=await Promise.all([
  readJson('config/repository-source-of-truth.json'),
  readJson('config/platform-source-of-truth.json'),
]);
const failures=[];
const fail=message=>failures.push(message);
if(registry.schemaVersion!==1||registry.status!=='enforced') fail('repository source-of-truth registry must be enforced schema v1');
if(registry.canonicalPlatformRepository!=='topmaster-joseph/ekodi-platform') fail('canonical platform repository drift');
const entries=registry.repositories||[];
const names=new Set();
let canonical=0;
for(const entry of entries){
  if(!entry.name||names.has(entry.name)) fail(`repository missing/duplicate: ${entry.name||'(empty)'}`);
  names.add(entry.name);
  if(entry.role==='canonical-platform') canonical+=1;
  if(entry.name!==registry.canonicalPlatformRepository&&entry.mutationMode==='guarded-pr') fail(`${entry.name}: satellite cannot inherit unrestricted platform mutation mode`);
  if(entry.role==='unclassified-satellite'&&!String(entry.mutationMode).startsWith('blocked')) fail(`${entry.name}: unclassified repository must remain write-blocked`);
}
if(canonical!==1) fail(`exactly one canonical platform repository required, found ${canonical}`);
if(!names.has(registry.canonicalPlatformRepository)) fail('canonical repository missing from repository list');
if(registry.rules?.duplicateImplementationRequiresCrossRepositoryReview!==true) fail('duplicate implementations must require cross-repository review');
if(platformTruth.currentFacts?.canonicalWebRoot!=='https://ekodi.kr') fail('platform source-of-truth canonical web root drift');
if(!(platformTruth.authorityPrecedence||[]).some(item=>item.path==='platform-route-registry.js')) fail('runtime route registry must remain in source-of-truth precedence');
if(failures.length){
  console.error(`Repository source-of-truth validation failed (${failures.length})`);
  failures.forEach(item=>console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Repository source-of-truth OK: ${entries.length} registered repositories, one canonical platform repository`);
