import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const migrationFile = 'scripts/migrate-ekodi-subdomains-to-paths.mjs';
const retiredWorkflows = new Set([
  '.github/workflows/activate-ekodi-pages-domains.yml',
  '.github/workflows/configure-ekodi-subdomains.yml',
  '.github/workflows/configure-marketing-domains.yml',
  '.github/workflows/configure-marketing-tenant-domains.yml',
  '.github/workflows/sync-worker-domains.yml',
  '.github/workflows/verify-ekodi-subdomains.yml',
  '.github/workflows/promote-biz-domain.yml',
  '.github/workflows/diagnose-biz-domain.yml',
]);

const canonical = Object.freeze({
  'www.ekodi.kr':'', 'admin.ekodi.kr':'/admin', 'auth.ekodi.kr':'/auth', 'api.ekodi.kr':'/api',
  'ai.ekodi.kr':'/ai', 'author.ekodi.kr':'/author', 'bible.ekodi.kr':'/bible', 'books.ekodi.kr':'/books',
  'business.ekodi.kr':'/business', 'community.ekodi.kr':'/community', 'edu.ekodi.kr':'/education',
  'energy.ekodi.kr':'/energy', 'exp.ekodi.kr':'/experience', 'try.ekodi.kr':'/try', 'dev.ekodi.kr':'/dev',
  'finance-api.ekodi.kr':'/finance/api', 'journal.ekodi.kr':'/journal', 'life.ekodi.kr':'/life',
  'management.ekodi.kr':'/management', 'money.ekodi.kr':'/money', 'publishing.ekodi.kr':'/publishing',
  'social.ekodi.kr':'/social', 'support.ekodi.kr':'/support', 'work.ekodi.kr':'/work',
  'biz.ekodi.kr':'/ekodibiz', 'church.ekodi.kr':'/ekodichurch', 'lab.ekodi.kr':'/lab',
  'mail.ekodi.kr':'/mail', 'tax.ekodi.kr':'/tax', 'messenger.ekodi.kr':'/messenger', 'invest.ekodi.kr':'/invest',
  'pay.ekodi.kr':'/pay', 'trade.ekodi.kr':'/trade', 'live.ekodi.kr':'/live', 'cloud.ekodi.kr':'/cloud',
  'shell.ekodi.kr':'/shell', 'drive.ekodi.kr':'/storage', 'space.ekodi.kr':'/space', 'my.ekodi.kr':'/my',
  'marketing-api.ekodi.kr':'/marketing/api', 'marketing-publish-api.ekodi.kr':'/marketing/publish-api',
  'marketing-connect-api.ekodi.kr':'/marketing/connect-api', 'personal-finance-api.ekodi.kr':'/personal-finance/api',
  'workspace-api.ekodi.kr':'/workspace/api', 'mall-api.ekodi.kr':'/mall/api', 'insurance-api.ekodi.kr':'/insurance/api',
  'pay.biz.ekodi.kr':'/ekodibiz/pay', 'trade.biz.ekodi.kr':'/ekodibiz/trade', 'live.biz.ekodi.kr':'/ekodibiz/live',
  'mall.biz.ekodi.kr':'/ekodibiz/mall', 'mall.ekodi.kr':'/ekodibiz/mall',
  'admin.biz.ekodi.kr':'/ekodibiz/admin', 'admin.church.ekodi.kr':'/ekodichurch/admin',
  'admin.lab.ekodi.kr':'/lab/admin', 'admin.trade.ekodi.kr':'/trade/admin',
  'live.church.ekodi.kr':'/ekodichurch/live', 'live.lab.ekodi.kr':'/lab/live',
  'mail.biz.ekodi.kr':'/mail', 'mail.church.ekodi.kr':'/mail', 'mail.lab.ekodi.kr':'/mail',
  'mail.books.ekodi.kr':'/mail', 'mail.trade.ekodi.kr':'/mail',
});

const serviceBindings = Object.freeze({
  AI:'ekodi-ai-control', AUTHOR:'ekodi-author-ai', BOOKS:'ekodi-books', BUSINESS:'ekodi-business',
  COMMUNITY:'ekodi-community', EDUCATION:'ekodi-education', ENERGY:'ekodi-energy', EXPERIENCE:'ekodi-experience',
  JOURNAL:'ekodi-journal', LIFE:'ekodi-life-ai', MANAGEMENT:'ekodi-management', MONEY:'ekodi-money',
  PUBLISHING:'ekodi-publishing', SOCIAL:'ekodi-social', SUPPORT:'ekodi-support-opportunity', WORK:'ekodi-work',
});

function canonicalPathForHost(host) {
  host = String(host || '').toLowerCase();
  if (canonical[host] !== undefined) return canonical[host];
  if (!host.endsWith('.ekodi.kr')) return null;
  const labels = host.slice(0, -'.ekodi.kr'.length).split('.');
  if (labels.at(-1) === 'ai' && labels.length > 1) return `/${labels.slice(0,-1).join('/')}/ai`;
  if (labels[0] === 'marketing' && labels.length > 1) return `/${labels.slice(1).join('/')}/marketing`;
  if (labels[0] === 'admin' && labels[1]) return `/${labels.slice(1).join('/')}/admin`;
  if (labels[0] === 'mail') return '/mail';
  if (labels[0] === 'live' && labels[1]) return `/${labels.slice(1).join('/')}/live`;
  const first = labels[0].replace(/-staging$/,'');
  const aliases = {edu:'education',exp:'experience',biz:'ekodibiz',church:'ekodichurch'};
  return `/${aliases[first] || first}`;
}

function trackedFiles() {
  return execFileSync('git', ['ls-files','-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
}
function readUtf8(rel) {
  try { const b=fs.readFileSync(path.join(root,rel)); if (b.includes(0)) return null; return b.toString('utf8'); } catch { return null; }
}
function writeIfChanged(rel, before, after) {
  if (before === after) return false;
  fs.writeFileSync(path.join(root,rel), after, 'utf8');
  console.log(`updated ${rel}`); return true;
}

function replacePublicUrls(text) {
  return text.replace(/https?:\/\/([A-Za-z0-9.-]+\.ekodi\.kr)(?=[:/?#'"`\s<]|$)/gi, (all, host) => {
    const p=canonicalPathForHost(host); return p===null ? all : `https://ekodi.kr${p}`;
  }).replace(/https%3A%2F%2F([A-Za-z0-9.-]+\.ekodi\.kr)%2F/gi,(all,host)=>{
    const p=canonicalPathForHost(host); if(p===null)return all;
    return `https%3A%2F%2Fekodi.kr${encodeURIComponent(p).replace(/%2F/g,'%2F')}%2F`;
  });
}

function removeSubdomainRoutes(text) {
  const chunks=text.split(/(?=^\[\[routes\]\]\s*$)/m);
  text=chunks.filter(chunk=>{
    if(!chunk.startsWith('[[routes]]'))return true;
    const m=chunk.match(/^pattern\s*=\s*"([^"]+)"/m); if(!m)return true;
    const host=m[1].split('/')[0].toLowerCase();
    return !(host.endsWith('.ekodi.kr') && host!=='ekodi.kr');
  }).join('');
  return text.replace(/^route\s*=\s*\{[^\n]*pattern\s*=\s*"([^"]+\.ekodi\.kr)[^"]*"[^\n]*\}\s*\r?\n?/gmi,'');
}

function ensureSiteBindings() {
  const rel='wrangler.site.toml'; let text=readUtf8(rel); if(text===null)return;
  const before=text;
  for(const [binding,service] of Object.entries(serviceBindings)){
    if(new RegExp(`binding\\s*=\\s*"${binding}"`).test(text))continue;
    text += `\n[[services]]\nbinding = "${binding}"\nservice = "${service}"\n`;
  }
  writeIfChanged(rel,before,text);
}

function updateCanonicalRouter() {
  const rel='canonical-surface-router.js'; let text=readUtf8(rel); if(text===null)return;
  const before=text;
  const block=`const PUBLIC_EXECUTION_SURFACES=Object.freeze([\n  Object.freeze({id:'ai',prefix:'/ai',binding:'AI'}),\n  Object.freeze({id:'author',prefix:'/author',binding:'AUTHOR'}),\n  Object.freeze({id:'bible',prefix:'/bible',binding:'BIBLE',basePathAware:true}),\n  Object.freeze({id:'books',prefix:'/books',binding:'BOOKS'}),\n  Object.freeze({id:'business',prefix:'/business',binding:'BUSINESS'}),\n  Object.freeze({id:'community',prefix:'/community',binding:'COMMUNITY'}),\n  Object.freeze({id:'education',prefix:'/education',binding:'EDUCATION'}),\n  Object.freeze({id:'energy',prefix:'/energy',binding:'ENERGY'}),\n  Object.freeze({id:'experience',prefix:'/experience',binding:'EXPERIENCE'}),\n  Object.freeze({id:'journal',prefix:'/journal',binding:'JOURNAL'}),\n  Object.freeze({id:'life',prefix:'/life',binding:'LIFE'}),\n  Object.freeze({id:'management',prefix:'/management',binding:'MANAGEMENT'}),\n  Object.freeze({id:'money',prefix:'/money',binding:'MONEY'}),\n  Object.freeze({id:'publishing',prefix:'/publishing',binding:'PUBLISHING'}),\n  Object.freeze({id:'social',prefix:'/social',binding:'SOCIAL'}),\n  Object.freeze({id:'support',prefix:'/support',binding:'SUPPORT'}),\n  Object.freeze({id:'work',prefix:'/work',binding:'WORK'}),\n  Object.freeze({id:'lab',prefix:'/lab',origin:'https://ekodilab.pages.dev'}),\n]);`;
  text=text.replace(/const PUBLIC_EXECUTION_SURFACES=Object\.freeze\(\[[\s\S]*?\n\]\);/,block);
  text=text.replace("  }else{\n    if(typeof externalFetch!=='function')return serviceUnavailable(spec.id);\n    upstreamUrl.hostname=spec.host;\n    upstreamUrl.pathname=stripPrefix(upstreamUrl.pathname,spec.prefix);\n    response=await externalFetch(cloneRequest(request,upstreamUrl));\n  }", "  }else{\n    if(typeof externalFetch!=='function')return serviceUnavailable(spec.id);\n    if(spec.origin){const origin=new URL(spec.origin);upstreamUrl.protocol=origin.protocol;upstreamUrl.hostname=origin.hostname;upstreamUrl.port=origin.port;}else upstreamUrl.hostname=spec.host;\n    upstreamUrl.pathname=stripPrefix(upstreamUrl.pathname,spec.prefix);\n    response=await externalFetch(cloneRequest(request,upstreamUrl));\n  }");
  writeIfChanged(rel,before,text);
}

function updateEntryRouter() {
  const rel='platform-router-entry-worker.js'; let text=readUtf8(rel); if(text===null)return;
  const before=text;
  const marker="const DEPLOYMENT_PROBE_PATH='/deployment-probe';";
  const helper=`const CANONICAL_LOCAL_SURFACES=Object.freeze([\n  ['/mail','mail.ekodi.kr'],['/tax','tax.ekodi.kr'],['/messenger','messenger.ekodi.kr'],['/invest','invest.ekodi.kr']\n]);\nfunction canonicalLocalRequest(request,host,url){\n  if(host!==PUBLIC_HOST)return null;\n  let prefix='',legacyHost='';\n  for(const [candidate,target] of CANONICAL_LOCAL_SURFACES){if(url.pathname===candidate||url.pathname.startsWith(candidate+'/')){prefix=candidate;legacyHost=target;break}}\n  if(!legacyHost){const assets=new Map([['/tax-portal.js','tax.ekodi.kr'],['/messenger-ui.js','messenger.ekodi.kr'],['/invest-ui.js','invest.ekodi.kr'],['/invest-subject-ui.js','invest.ekodi.kr']]);legacyHost=assets.get(url.pathname)||'';}\n  if(!legacyHost)return null;\n  const mapped=new URL(url);mapped.hostname=legacyHost;if(prefix)mapped.pathname=url.pathname===prefix||url.pathname===prefix+'/'?'/':url.pathname.slice(prefix.length);\n  return{request:new Request(mapped,request),url:mapped,host:legacyHost};\n}`;
  if(!text.includes('CANONICAL_LOCAL_SURFACES')) text=text.replace(marker,`${marker}\n${helper}`);
  text=text.replace('    const url=new URL(request.url);\n    const host=resolvedHost(request,env);','    let url=new URL(request.url);\n    let host=resolvedHost(request,env);');
  const anchor='    if(canonical)return canonical;';
  const remap="    if(canonical)return canonical;\n    const localCanonical=canonicalLocalRequest(request,host,url);if(localCanonical){request=localCanonical.request;url=localCanonical.url;host=localCanonical.host;}";
  if(!text.includes('const localCanonical=canonicalLocalRequest'))text=text.replace(anchor,remap);
  writeIfChanged(rel,before,text);
}

function updateRegistry() {
  const rel='platform-route-registry.js'; let text=readUtf8(rel); if(text===null)return;
  const before=text;
  const required=['ai','author','education','management','publishing','lab'];
  const m=text.match(/platformServices:Object\.freeze\(\[([\s\S]*?)\]\)/); if(!m)return;
  const values=[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
  for(const item of required)if(!values.includes(item))values.push(item);
  values.sort();
  text=text.slice(0,m.index)+`platformServices:Object.freeze([\n    ${values.map(v=>`'${v}'`).join(',')}\n  ])`+text.slice(m.index+m[0].length);
  writeIfChanged(rel,before,text);
}

function replaceValidator() {
  const rel='scripts/validate-admin-subdomain-routes.mjs'; const before=readUtf8(rel)??'';
  const next=`import fs from 'node:fs';\nimport path from 'node:path';\nimport { execFileSync } from 'node:child_process';\nconst root=process.cwd();\nconst errors=[];\nfor(const file of fs.readdirSync(root).filter(n=>/^wrangler\\..*\\.toml$/.test(n))){const text=fs.readFileSync(path.join(root,file),'utf8');for(const m of text.matchAll(/(?:pattern|route)\\s*=\\s*\\{?[^\\n\"]*\"([^\"]+)\"/g)){const host=m[1].split('/')[0].toLowerCase();if(host.endsWith('.ekodi.kr')&&host!=='ekodi.kr')errors.push(\`${'${file}'} still declares public subdomain ${'${host}'}\`);}}\nconst files=execFileSync('git',['ls-files','-z'],{cwd:root}).toString('utf8').split('\\0').filter(Boolean);\nfor(const file of files){if(file==='${migrationFile}'||file.includes('/reports/')||file.startsWith('docs/'))continue;let text='';try{text=fs.readFileSync(path.join(root,file),'utf8')}catch{continue}for(const m of text.matchAll(/https?:\\/\\/([A-Za-z0-9.-]+\\.ekodi\\.kr)(?=[:/?#'\"\\s<]|$)/gi))errors.push(\`${'${file}'} still exposes URL ${'${m[0]}'}\`);}\nif(errors.length){console.error(errors.join('\\n'));process.exit(1)}\nconsole.log('OK: no public *.ekodi.kr route declarations or URL references remain.');\n`;
  writeIfChanged(rel,before,next);
}

let changed=0;
for(const rel of trackedFiles()){
  if(rel===migrationFile)continue;
  if(retiredWorkflows.has(rel)){fs.rmSync(path.join(root,rel),{force:true});console.log(`removed ${rel}`);changed++;continue;}
  let text=readUtf8(rel); if(text===null)continue;
  let next=replacePublicUrls(text);
  if(/^wrangler\..*\.toml$/.test(rel))next=removeSubdomainRoutes(next);
  if(writeIfChanged(rel,text,next))changed++;
}
ensureSiteBindings();
updateCanonicalRouter();
updateEntryRouter();
updateRegistry();
replaceValidator();
console.log(`migration pass complete; changed=${changed}`);
