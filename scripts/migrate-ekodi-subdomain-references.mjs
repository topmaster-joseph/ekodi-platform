import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const retiredWorkflows=new Set([
  '.github/workflows/activate-ekodi-pages-domains.yml',
  '.github/workflows/configure-ekodi-subdomains.yml',
  '.github/workflows/configure-marketing-domains.yml',
  '.github/workflows/configure-marketing-tenant-domains.yml',
  '.github/workflows/sync-worker-domains.yml',
  '.github/workflows/verify-ekodi-subdomains.yml',
  '.github/workflows/promote-biz-domain.yml',
  '.github/workflows/diagnose-biz-domain.yml',
]);
const immutablePrefixes=['migrations/','supabase/migrations/','governance/amendments/','artifacts/'];
const canonical=Object.freeze({
  'www.ekodi.kr':'','admin.ekodi.kr':'/admin','auth.ekodi.kr':'/auth','api.ekodi.kr':'/api','my.ekodi.kr':'/my',
  'shell.ekodi.kr':'/shell','ai.ekodi.kr':'/ai','author.ekodi.kr':'/author','bible.ekodi.kr':'/bible','books.ekodi.kr':'/books',
  'business.ekodi.kr':'/business','community.ekodi.kr':'/community','edu.ekodi.kr':'/education','energy.ekodi.kr':'/energy',
  'exp.ekodi.kr':'/experience','try.ekodi.kr':'/experience','dev.ekodi.kr':'/developer','finance-api.ekodi.kr':'/finance-api',
  'journal.ekodi.kr':'/journal','life.ekodi.kr':'/life','management.ekodi.kr':'/management','money.ekodi.kr':'/money',
  'personal-finance-api.ekodi.kr':'/personal-finance-api','publishing.ekodi.kr':'/publishing','social.ekodi.kr':'/social',
  'space.ekodi.kr':'/space','drive.ekodi.kr':'/storage','support.ekodi.kr':'/support','work.ekodi.kr':'/work',
  'workspace-api.ekodi.kr':'/workspace-api','marketing-api.ekodi.kr':'/marketing-api','marketing-connect-api.ekodi.kr':'/marketing-connect-api',
  'marketing-publish-api.ekodi.kr':'/marketing-publish-api','pay.ekodi.kr':'/pay','live.ekodi.kr':'/live','cloud.ekodi.kr':'/cloud',
  'trade.ekodi.kr':'/trade','lab.ekodi.kr':'/ekodilab','cafe.ekodi.kr':'/cafe','mail.ekodi.kr':'/mail','messenger.ekodi.kr':'/messenger',
  'invest.ekodi.kr':'/invest','tax.ekodi.kr':'/tax','biz.ekodi.kr':'/ekodibiz','church.ekodi.kr':'/ekodichurch',
  'pay.biz.ekodi.kr':'/ekodibiz/pay','trade.biz.ekodi.kr':'/ekodibiz/trade','live.biz.ekodi.kr':'/live/biz',
  'live.church.ekodi.kr':'/live/church','live.lab.ekodi.kr':'/live/lab','mall.ekodi.kr':'/ekodibiz/mall','mall.biz.ekodi.kr':'/ekodibiz/mall',
  'mail.biz.ekodi.kr':'/mail','mail.church.ekodi.kr':'/mail','mail.lab.ekodi.kr':'/mail','mail.books.ekodi.kr':'/mail','mail.trade.ekodi.kr':'/mail',
  'marketing.ekodi.kr':'/ekodibiz/marketing-ai','cgma.ekodi.kr':'/cgma','jadam.ekodi.kr':'/jadam','pizzamaru.ekodi.kr':'/pizzamaru','yogurt.ekodi.kr':'/yogurt',
  'jadam.ai.ekodi.kr':'/jadam/marketing','pizzamaru.ai.ekodi.kr':'/pizzamaru/marketing','yogurt.ai.ekodi.kr':'/yogurt/marketing','cgma.ai.ekodi.kr':'/cgma/marketing',
});

const tracked=()=>execFileSync('git',['ls-files','-z'],{cwd:root}).toString('utf8').split('\0').filter(Boolean);
const immutable=file=>immutablePrefixes.some(prefix=>file.startsWith(prefix));
const read=file=>{try{const b=fs.readFileSync(path.join(root,file));return b.includes(0)?null:b.toString('utf8')}catch{return null}};
const write=(file,before,after)=>{if(before===after)return false;fs.writeFileSync(path.join(root,file),after,'utf8');console.log(`updated ${file}`);return true};
function pathForHost(host){
  host=String(host||'').toLowerCase();
  if(Object.hasOwn(canonical,host))return canonical[host];
  if(!host.endsWith('.ekodi.kr'))return null;
  const labels=host.slice(0,-'.ekodi.kr'.length).split('.');
  if(labels[0]==='admin'&&labels[1])return `/${labels.slice(1).join('/')}/admin`;
  if(labels[0]==='mail')return '/mail';
  if(labels[0]==='live'&&labels[1])return `/live/${labels.slice(1).join('/')}`;
  if(labels.at(-1)==='ai'&&labels.length>1)return `/${labels.slice(0,-1).join('/')}/marketing`;
  return `/${labels[0].replace(/-staging$/,'')}`;
}
function replaceUrls(text){
  return text.replace(/https?:\/\/([A-Za-z0-9.-]+\.ekodi\.kr)(?=[:/?#'"`\s<]|$)/gi,(full,host)=>{
    const p=pathForHost(host);return p===null?full:`https://ekodi.kr${p}`;
  });
}
function removeRoutes(text){
  const chunks=text.split(/(?=^\[\[routes\]\]\s*$)/m);
  text=chunks.filter(chunk=>{
    if(!chunk.startsWith('[[routes]]'))return true;
    const m=chunk.match(/^pattern\s*=\s*"([^"]+)"/m);if(!m)return true;
    const host=m[1].split('/')[0].toLowerCase();
    return !(host.endsWith('.ekodi.kr')&&host!=='ekodi.kr');
  }).join('');
  return text.replace(/^route\s*=\s*\{[^\n]*pattern\s*=\s*"([^"]+)"[^\n]*\}\s*\r?\n?/gmi,(line,pattern)=>{
    const host=String(pattern).split('/')[0].toLowerCase();return host.endsWith('.ekodi.kr')&&host!=='ekodi.kr'?'':line;
  });
}
let changed=0;
for(const file of tracked()){
  if(file==='scripts/migrate-ekodi-subdomain-references.mjs'||immutable(file))continue;
  if(retiredWorkflows.has(file)){fs.rmSync(path.join(root,file),{force:true});console.log(`removed ${file}`);changed++;continue;}
  const before=read(file);if(before===null)continue;
  let after=replaceUrls(before);
  if(/(^|\/)wrangler[^/]*\.toml$/i.test(file))after=removeRoutes(after);
  if(write(file,before,after))changed++;
}
console.log(`EKODI subdomain reference migration complete; changed=${changed}`);
