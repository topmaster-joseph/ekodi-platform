import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
const check=(truth,message)=>{if(!truth)failures.push(message)};
const site=read('wrangler.site.toml');
check(site.includes('pattern = "ekodi.kr"'),'Apex Worker custom domain missing');
check(site.includes('"/admin"') && site.includes('"/admin/*"'),'Apex admin path must execute Worker-first');

for(const file of [
 'service-admin-entry-worker.js',
 'books-worker.js',
 'publishing-worker.js',
 'community-worker.js',
 'sites/ekodi-cafe/_redirects',
 'sites/ekodi-mall/_redirects'
]){
 const source=read(file);
 check(!source.includes('https://'+['admin','ekodi','kr'].join('.')),file+' reintroduced legacy administrator hostname');
}
check(read('service-admin-entry-worker.js').includes("const CENTRAL_ADMIN = 'https://ekodi.kr/admin/';"),
 'Central admin handoff must use https://ekodi.kr/admin/');
check(read('wrangler.my.toml').includes('AUTH_URL = "https://ekodi.kr/auth/?site=my"'),
 'My EKODI must use canonical /auth');
const services=JSON.parse(read('service-registry.json')).services||[];
for(const service of services){
 const href=String(service.href||'');
 check(href.startsWith('https://ekodi.kr/'),service.id+': noncanonical registry URL '+href);
}
for(const [file,expected] of [
 ['sites/ekodi-cafe/_redirects','https://ekodi.kr/admin/'],
 ['sites/ekodi-mall/_redirects','https://ekodi.kr/ekodimall/admin']
])check(read(file).includes(expected),file+': missing canonical admin target');
if(failures.length){
 console.error('Canonical admin/path entry gate FAILED ('+failures.length+')');
 failures.forEach(message=>console.error('- '+message));
 process.exit(1);
}
console.log('Canonical admin/path entry gate OK ('+services.length+' service registry entries)');
