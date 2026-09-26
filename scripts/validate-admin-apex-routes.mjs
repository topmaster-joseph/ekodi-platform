import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const policy=JSON.parse(fs.readFileSync(path.join(root,'config/domain-canonical-policy.json'),'utf8'));
const failures=[];
const fail=m=>failures.push(m);
if(policy.canonicalHost!=='ekodi.kr')fail('canonical host must be ekodi.kr');
if(policy.publicAddressPolicy!=='apex-path-only')fail('public address policy must be apex-path-only');
if(policy.subdomainPolicy!=='forbidden')fail('EKODI child-host addresses must be forbidden');
if(policy.legacySubdomainRedirects!==false)fail('retired child-host redirects must remain disabled');
for(const [site,entry] of Object.entries(policy.sites||{})){
  if(entry.root!==`https://ekodi.kr/${site}`)fail(`${site}: canonical root drift`);
  if(entry.admin!==`https://ekodi.kr/${site}/admin`)fail(`${site}: canonical admin drift`);
}
const childHost=/\b(?:[a-z0-9-]+\.)+ekodi\.kr\b/i;
for(const name of fs.readdirSync(root).filter(n=>/^wrangler\..+\.toml$/.test(n))){
  const text=fs.readFileSync(path.join(root,name),'utf8');
  if(childHost.test(text))fail(`${name}: EKODI child-host route remains`);
}
for(const file of ['sites/ekodi-cafe/_redirects','sites/ekodi-mall/_redirects']){
  const full=path.join(root,file);
  if(!fs.existsSync(full))continue;
  const text=fs.readFileSync(full,'utf8');
  if(childHost.test(text))fail(`${file}: child-host redirect remains`);
  if(/^\/admin\/?\s+https:\/\//m.test(text))fail(`${file}: external admin redirect remains`);
}
if(failures.length){
  console.error('EKODI apex-path admin route contract failed:\n'+failures.map(v=>' - '+v).join('\n'));
  process.exit(1);
}
console.log('EKODI apex-path admin route contract OK: platform and site admins remain path-owned on ekodi.kr');
