import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const HOST_PATH=new Map(Object.entries({
  'ekodi.kr/admin':'/admin','ekodi.kr/my':'/my','ekodi.kr/auth':'/auth','ekodi.kr/api':'/api',
  'ekodi.kr/status':'/status','ekodi.kr/ai':'/ai','ekodi.kr/developer':'/developer','ekodi.kr/experience':'/experience','ekodi.kr/experience':'/experience',
  'ekodi.kr/journal':'/journal','ekodi.kr/marketing':'/marketing','ekodi.kr/management':'/management','ekodi.kr/author':'/author',
  'ekodi.kr/books':'/books','ekodi.kr/publishing':'/publishing','ekodi.kr/community':'/community','ekodi.kr/work':'/work',
  'ekodi.kr/education':'/education','ekodi.kr/energy':'/energy','ekodi.kr/life':'/life','ekodi.kr/money':'/money','ekodi.kr/social':'/social',
  'ekodi.kr/pay':'/pay','ekodi.kr/ekodibiz/trade':'/ekodibiz/trade','ekodi.kr/mail':'/mail','ekodi.kr/live':'/live','ekodi.kr/cloud':'/cloud',
  'ekodi.kr/messenger':'/messenger','ekodi.kr/invest':'/invest','ekodi.kr/tax':'/tax','ekodi.kr/cafe':'/cafe','ekodi.kr/shop':'/shop',
  'ekodi.kr/media':'/media','ekodi.kr/business':'/business','ekodi.kr/finance-api':'/finance-api','ekodi.kr/storage':'/storage',
  'ekodi.kr/workspace-api':'/workspace-api','ekodi.kr/marketing-api':'/marketing-api',
  'ekodi.kr/marketing-connect-api':'/marketing-connect-api','ekodi.kr/marketing-publish-api':'/marketing-publish-api',
  'ekodi.kr/personal-finance-api':'/personal-finance-api','ekodi.kr/ekodibiz':'/ekodibiz','ekodi.kr/ekodichurch':'/ekodichurch',
  'ekodi.kr/ekodilab':'/ekodilab','ekodi.kr/ekodimall':'/ekodimall','ekodi.kr':'/',
  'ekodi.kr/ekodibiz/admin':'/ekodibiz/admin','ekodi.kr/ekodichurch/admin':'/ekodichurch/admin','ekodi.kr/ekodilab/admin':'/ekodilab/admin',
  'ekodi.kr/ekodibiz/trade/admin':'/ekodibiz/trade/admin','ekodi.kr/ekodibiz/trade':'/ekodibiz/trade','ekodi.kr/ekodimall':'/ekodimall',
  'ekodi.kr/ekodibiz/pay':'/ekodibiz/pay','ekodi.kr/ekodibiz/mail':'/ekodibiz/mail','ekodi.kr/ekodichurch/mail':'/ekodichurch/mail',
  'ekodi.kr/ekodilab/mail':'/ekodilab/mail','ekodi.kr/books/mail':'/books/mail','ekodi.kr/ekodibiz/trade/mail':'/ekodibiz/trade/mail',
  'ekodi.kr/ekodibiz/live':'/ekodibiz/live','ekodi.kr/ekodichurch/live':'/ekodichurch/live','ekodi.kr/ekodilab/live':'/ekodilab/live',
  'ekodi.kr/cgma':'/cgma','ekodi.kr/jadam':'/jadam','ekodi.kr/pizzamaru':'/pizzamaru','ekodi.kr/yogurt':'/yogurt',
  'ekodi.kr/cgma/marketing':'/cgma/marketing','ekodi.kr/jadam/marketing':'/jadam/marketing',
  'ekodi.kr/pizzamaru/marketing':'/pizzamaru/marketing','ekodi.kr/yogurt/marketing':'/yogurt/marketing',
  'ekodi.kr':'/','ekodi.kr':'/'
}));

function routeBlockCleanup(text){
  const lines=text.split(/\r?\n/),out=[];
  for(let i=0;i<lines.length;){
    if(lines[i].trim()==='[[routes]]'){
      let j=i+1;
      while(j<lines.length&&!/^\s*\[\[/.test(lines[j])&&!/^\s*\[[^\[]/.test(lines[j]))j++;
      const block=lines.slice(i,j);
      if(block.some(line=>/\b(?:[a-z0-9-]+\.)+ekodi\.kr\b/i.test(line))){i=j;continue;}
      out.push(...block);i=j;continue;
    }
    out.push(lines[i++]);
  }
  return out.join('\n');
}
function knownReplace(text){
  let out=text.replaceAll('EKODI child-host address','EKODI child-host address');
  const sorted=[...HOST_PATH.entries()].sort((a,b)=>b[0].length-a[0].length);
  for(const [host,prefix] of sorted){
    const suffix=prefix==='/'?'':prefix;
    out=out.split('https://'+host).join('https://ekodi.kr'+suffix);
    out=out.split('http://'+host).join('https://ekodi.kr'+suffix);
    out=out.split(host).join('ekodi.kr'+suffix);
  }
  out=out.replace(/https?:\/\/((?:[a-z0-9-]+\.)+)ekodi\.kr/gi,(_m,labels)=>{
    const p=labels.replace(/\.$/,'').split('.').reverse().join('/');
    return 'https://ekodi.kr/'+p;
  });
  out=out.replace(/\b((?:[a-z0-9-]+\.)+)ekodi\.kr\b/gi,(_m,labels)=>{
    const p=labels.replace(/\.$/,'').split('.').reverse().join('/');
    return 'ekodi.kr/'+p;
  });
  return out;
}
function fixOrigins(text){
  return text.replace(/^(\s*ALLOWED_ORIGINS\s*=\s*)".*"\s*$/gm,'$1"https://ekodi.kr"');
}
function fixPlatformRouterWorker(text){
  const start=text.indexOf("const PLATFORM_HOSTS=");
  const end=text.indexOf("\n\nfunction page(",start);
  if(start>=0&&end>start){
    text=text.slice(0,start)+
`const PLATFORM_PATHS=Object.freeze({'/messenger':'messenger','/invest':'invest'});
function platformRoute(pathname){
  for(const [prefix,id] of Object.entries(PLATFORM_PATHS)){
    if(pathname===prefix||pathname===prefix+'/'||pathname.startsWith(prefix+'/'))return {prefix,id};
  }
  return null;
}`+text.slice(end);
  }
  text=text.replace(/export default \{async fetch\(request,env,ctx\)\{const host=resolvedHost\(request,env\),id=PLATFORM_HOSTS\[host\],url=new URL\(request\.url\);if\(id\)\{if\(url\.pathname==='\/'\|\|url\.pathname==='\/index\.html'\)return platformResponse\(id\);if\(url\.pathname==='\/app\.js'\)return scriptResponse\(\);return new Response\('Not Found',\{status:404,headers:\{'cache-control':'no-store'\}\}\)\}return sharedSiteWorker\.fetch\(request,env,ctx\)\}\};/,
`export default {async fetch(request,env,ctx){const url=new URL(request.url),route=platformRoute(url.pathname);if(route){const inner=url.pathname.slice(route.prefix.length)||'/';if(inner==='/'||inner==='/index.html')return platformResponse(route.id);if(inner==='/app.js')return scriptResponse();return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}})}return sharedSiteWorker.fetch(request,env,ctx)}};`);
  return text;
}
function fixPlatformEntry(text){
  text=text.replace(/const MESSENGER_HOST=.*?;\nconst INVEST_HOST=.*?;\n/,'');
  text=text.replace(/function internalHostRequest\([\s\S]*?\n}\nasync function routeMessengerApex/,
    'async function routeMessengerApex');
  text=text.replace(/legacyPlatformRouter\.fetch\(internalHostRequest\(request,MESSENGER_HOST,'\/app\.js'\),env,ctx\)/g,
    'legacyPlatformRouter.fetch(request,env,ctx)');
  text=text.replace(/legacyPlatformRouter\.fetch\(internalHostRequest\(request,INVEST_HOST,'\/app\.js'\),env,ctx\)/g,
    'legacyPlatformRouter.fetch(request,env,ctx)');
  text=text.replace(/const LEGACY_ADMIN_HOSTS=[\s\S]*?function legacyStoreGatewayRedirect/,
    'function legacyStoreGatewayRedirect');
  text=text.replace(/\s*const legacySurface=legacySurfaceRedirect\(request\);if\(legacySurface\)return legacySurface;/,'');
  return text;
}
function fixCanonicalRouter(text){
  text=text.replace(/,?virtualHost:'[^']*'/g,'').replace(/,?legacyHost:'[^']*'/g,'').replace(/,?canonicalHost:'[^']*'/g,'');
  text=text.replace(/\s*Object\.freeze\(\{id:'(?:pay|live|cloud|trade)'[^\n]*\}\),?/g,'');
  text=text.replace(/const legacyEkodiHost=[\s\S]*?\);const ADMIN_RUNTIME_FILE=/,
    "const ADMIN_RUNTIME_FILE=");
  const ca=text.indexOf("function canonicalAbsoluteUrl(");
  const pr=text.indexOf("function prefixRootLiterals(",ca);
  if(ca>=0&&pr>ca)text=text.slice(0,ca)+"function rewriteAbsoluteEkodiOrigins(text){return String(text||'');}\n"+text.slice(pr);
  text=text.replace("  upstreamUrl.hostname='ekodi.kr/admin';\n  upstreamUrl.pathname='/';",
                    "  upstreamUrl.hostname=CANONICAL_HOST;\n  upstreamUrl.pathname='/admin/';");
  text=text.replace(/async function proxyLegacySurface\(request,legacyFetch,prefix,legacyHost,surface\)\{[\s\S]*?\n}\nasync function rewriteHtmlResponse/,
`async function proxyCanonicalSurface(request,legacyFetch,prefix,surface){
  const upstreamUrl=new URL(request.url);upstreamUrl.hostname=CANONICAL_HOST;
  const response=await legacyFetch(cloneRequest(request,upstreamUrl));
  const routed=new Response(response.body,response);
  routed.headers.set('x-ekodi-canonical-surface',surface);
  routed.headers.set('x-ekodi-canonical-path',prefix);
  return routed;
}
async function rewriteHtmlResponse`);
  text=text.replace(/return proxyLegacySurface\(request,legacyFetch,SURFACE_PREFIXES\.admin,'admin\.ekodi\.kr','admin'\);/,
    "return proxyCanonicalSurface(request,legacyFetch,SURFACE_PREFIXES.admin,'admin');");
  text=text.replace(/upstreamUrl\.hostname=spec\.virtualHost\|\|CANONICAL_HOST;/g,'upstreamUrl.hostname=CANONICAL_HOST;');
  text=text.replace(/\}else if\(spec\.legacyHost\)\{[\s\S]*?\}else if\(spec\.assetPath\)\{/,
    '}else if(spec.assetPath){');
  text=text.replace(/\s*const canonical=canonicalAbsoluteUrl\(target\.hostname,target\.pathname,target\.search,target\.hash\);if\(canonical\)return canonical;/,'');
  return text;
}
function fixConstitutionValidator(text){
  text=text.replace("if (constitution.version !== '1.25.0') fail('constitution version must be 1.25.0 with Public Visual Continuity enforcement plus all prior approved amendments');",
    "if (constitution.version !== '1.26.0') fail('constitution version must be 1.26.0 with apex-path-only routing plus all prior approved amendments');");
  const start=text.indexOf('const systemDomains = new Set(');
  const end=text.indexOf('const expectedNamespaces =',start);
  if(start>=0&&end>start){
    text=text.slice(0,start)+`const systemDomains = new Set(constitution.systemBoundaries?.production || []);
const registeredCommon = new Set(constitution.registeredCommonServiceBoundaries || []);
const registeredCommonPaths = new Set(constitution.registeredCommonServicePaths || []);
const registeredCore = new Set(constitution.registeredCoreServiceBoundaries || []);
const customerOwned = constitution.customerOwnedDomainMappings || {};
if (JSON.stringify([...systemDomains]) !== JSON.stringify(['ekodi.kr'])) fail('production system host set must contain only ekodi.kr');
if (constitution.domainPolicy?.newFeatureSubdomainsForbidden !== true) fail('new feature child hosts must be forbidden');
if (constitution.domainPolicy?.newTenantSubdomainsForbidden !== true) fail('new tenant/workspace child hosts must be forbidden');
if (constitution.domainPolicy?.allEkodiOwnedSubdomainsForbidden !== true) fail('all EKODI-owned child hosts must be forbidden');
if ('legacyDomainAllowlist' in constitution || 'legacyDomainTargets' in constitution || 'legacyPathAliases' in constitution) fail('retired EKODI child-host alias registries must be absent');
for (const p of ['/journal','/marketing','/developer','/experience']) if (!registeredCommon.has(p)) fail('registered common-service path missing: '+p);
if (!registeredCommonPaths.has('/invest')) fail('registered common-service path missing: /invest');
if (!registeredCore.has('/ai')) fail('registered core-service path missing: /ai');
const portals=constitution.publicPortalPolicy||{};
if (portals.developerPortal!=='https://ekodi.kr/developer' || portals.experiencePortal!=='https://ekodi.kr/experience') fail('public portal canonical path policy mismatch');
if (portals.sharedRuntimeAllowedAtS0!==true) fail('public portal S0 shared-runtime policy missing');
if (portals.experienceDataPolicy!=='synthetic-only' || portals.developerDataPolicy!=='public-contract-only') fail('public portal data projection policy mismatch');
const separation=constitution.userSurfaceEngineSeparation||{};
if (separation.canonicalMarketingProduct !== 'https://ekodi.kr/ekodibiz/marketing-ai') fail('Marketing product canonical drift');
if (separation.canonicalWorkspaceMarketingPattern !== 'https://ekodi.kr/{slug}/marketing') fail('workspace Marketing canonical pattern drift');
if (separation.marketingCore !== 'https://ekodi.kr/marketing') fail('Marketing Core path drift');
if (separation.aiGateway !== 'https://ekodi.kr/ai') fail('AI Gateway/Core path drift');
if (separation.customerAiSubdomains !== 'forbidden') fail('customer AI child hosts must remain forbidden');
if (separation.providerTopologyVisibleToOrdinaryUsers !== false) fail('provider topology must stay hidden from ordinary users');
if (customerOwned['cgma.or.kr'] !== 'https://ekodi.kr/cgma') fail('CGMA customer-owned domain mapping must target the canonical platform path');

`+text.slice(end);
  }
  text=text.replace("if (constitution.workspaceRoutingPolicy?.legacySpaceIsCompatibilityOnly !== true) fail('Space must remain compatibility-only during migration');",
    "if ('legacySpaceIsCompatibilityOnly' in (constitution.workspaceRoutingPolicy||{})) fail('retired Space compatibility classification must be absent');");
  const legacyStart=text.indexOf('const legacyPathAliases = constitution.legacyPathAliases');
  const coreStart=text.indexOf("if (!Array.isArray(coreData.protectedTables)",legacyStart);
  if(legacyStart>=0&&coreStart>legacyStart){
    text=text.slice(0,legacyStart)+`if ('legacyPathAliases' in constitution) fail('retired path aliases must be absent');
for (const [serviceId, service] of Object.entries(boundaries.platforms || {})) {
  for (const domain of service.domains || []) {
    if (/^(?:[a-z0-9-]+\\.)+ekodi\\.kr$/i.test(String(domain||''))) fail(serviceId+': EKODI child host remains in platform boundaries: '+domain);
  }
}

`+text.slice(coreStart);
  }
  text=text.replace(/console\.log\(\`- \$\{legacy\.size\} legacy domains registered with canonical migration targets\`\);?/g,
    "console.log('- EKODI-owned child-host aliases: 0; apex-path-only routing enforced');");
  return text;
}

function structuredPolicyEdits(file,text){
  if(file==='scripts/validate-constitution.mjs')return fixConstitutionValidator(text);
  if(file==='test/apex-mail-messenger-invest.test.mjs'){
    text=text.replace(/assert\.ok\(!appProbe\.expect\.includes\('https:\/\/ekodi\.kr\/workspace-api'\)\);?/g,'');
    text=text.replace(/assert\.equal\(probes\.some\(item=>item\.url\.startsWith\('https:\/\/ekodi\.kr\/messenger'\)\),false\);?/g,'');
    text=text.replace(/assert\.equal\(\[\.\.\.urls\]\.some\(url=>url\.startsWith\('https:\/\/ekodi\.kr\/invest'\)\),false\);?/g,'');
    return text;
  }
  if(file==='site-chrome-runtime.js'){
    text=text.replace(
      "const url=new URL(request.url);const path=url.pathname.replace(/\\/+$/,'');if(!path.startsWith('/v1/site-chrome'))return null;",
      "const url=new URL(request.url);let path=url.pathname.replace(/\\/+$/,'');if(path.startsWith('/workspace-api/'))path=path.slice('/workspace-api'.length);if(!path.startsWith('/v1/site-chrome'))return null;"
    );
    return text;
  }
  if(file==='governance/constitution/constitution.json'){
    const j=JSON.parse(text);j.version='1.26.0';j.effectiveDate='2026-09-24';
    j.systemBoundaries={production:['ekodi.kr'],development:[],rule:'All EKODI-owned human, admin, API, core and common-service surfaces use paths on ekodi.kr. EKODI-owned subdomains are forbidden.'};
    delete j.legacyDomainAllowlist;delete j.legacyDomainTargets;delete j.legacyPathAliases;if(j.workspaceRoutingPolicy)delete j.workspaceRoutingPolicy.legacySpaceIsCompatibilityOnly;
    j.domainPolicy={...(j.domainPolicy||{}),newFeatureSubdomainsForbidden:true,newTenantSubdomainsForbidden:true,allEkodiOwnedSubdomainsForbidden:true,commonOrCoreServiceSubdomainsRequireGovernanceRegistration:false,legacyAliasesMayRedirect:false,legacyAliasesMustBeRegistered:false,canonicalHumanAndManagementHost:'ekodi.kr',subdomainUserEntryForbidden:true};
    j.registeredCommonServiceBoundaries=['/journal','/marketing','/developer','/experience'];
    j.registeredCoreServiceBoundaries=['/ai'];
    if(j.userSurfaceEngineSeparation){j.userSurfaceEngineSeparation.marketingCore='https://ekodi.kr/marketing';j.userSurfaceEngineSeparation.aiGateway='https://ekodi.kr/ai';j.userSurfaceEngineSeparation.customerAiSubdomains='forbidden';}
    return JSON.stringify(j,null,2)+'\n';
  }
  if(file==='config/service-workspace-policy.json'){
    const j=JSON.parse(text);
    j.subdomainExceptions={personalHome:null,administration:null,authentication:null,api:null,status:null,commonAndCoreServices:'forbidden'};
    if(j.userSurfaceTopologyPolicy){j.userSurfaceTopologyPolicy.marketingCore='https://ekodi.kr/marketing';j.userSurfaceTopologyPolicy.aiGateway='https://ekodi.kr/ai';j.userSurfaceTopologyPolicy.customerSpecificAiSubdomains='forbidden';}
    return JSON.stringify(j,null,2)+'\n';
  }
  if(file==='config/ekodi-service-urls.json'){
    const j=JSON.parse(text);j.version=Math.max(4,Number(j.version||0)+1);
    delete j.policy.legacySurfaceSubdomains;j.policy.ekodiOwnedSubdomainsAllowed=false;j.policy.addressModel='apex-path-only';
    return JSON.stringify(j,null,2)+'\n';
  }
  if(file==='governance/constitution/domain.md')return `# Domain Constitution
1. EKODI가 소유하는 공개·사용자·관리자·인증·API·코어·공통서비스 주소는 모두 단일 호스트 \`ekodi.kr\` 아래의 경로를 사용한다.
2. EKODI 소유 child-host 주소는 생성·유지·리다이렉트·호환 별칭으로 보존하지 않는다.
3. 사용자·기관·사업체·교회·단체·프로젝트의 공개공간은 \`ekodi.kr/{slug}\`, 관리자 화면은 \`ekodi.kr/{slug}/admin\`을 사용한다.
4. 공통·전문 서비스는 \`ekodi.kr/{service}\`, 플랫폼 최고관리자는 \`ekodi.kr/admin\`, 인증은 \`ekodi.kr/auth\`, API는 \`ekodi.kr/api\`를 사용한다.
5. 내부 실행은 Service Binding 또는 비공개 Worker로 연결하며 내부 실행 경계를 DNS 하위도메인으로 노출하지 않는다.
6. 고객이 소유한 외부 도메인은 명시적 연결 계약에 따라 \`ekodi.kr/{slug}\` 공개공간에 매핑할 수 있다.
`;
  return text;
}

const textExt=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.md','.html','.css','.toml','.yml','.yaml','.txt','.sql','.sh','.cmd','.ps1','.xml']);
function walk(dir,base=''){
  const out=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','dist'].includes(e.name))continue;
    const rel=path.join(base,e.name),full=path.join(dir,e.name);
    if(e.isDirectory())out.push(...walk(full,rel));else if(textExt.has(path.extname(e.name).toLowerCase())||e.name.startsWith('.')||['_headers','_redirects'].includes(e.name))out.push(rel.replaceAll('\\','/'));
  }
  return out;
}
for(const file of walk(root)){
  if(file.startsWith('.github/workflows/'))continue;
  const full=path.join(root,file);let text;
  try{text=fs.readFileSync(full,'utf8')}catch{continue}
  const before=text;
  if(/^wrangler\..+\.toml$/.test(file))text=routeBlockCleanup(text);
  if(file==='platform-router-worker.js')text=fixPlatformRouterWorker(text);
  if(file==='platform-router-entry-worker.js')text=fixPlatformEntry(text);
  if(file==='canonical-surface-router.js')text=fixCanonicalRouter(text);
  text=knownReplace(text);
  text=text.replaceAll("validate-admin-apex-routes.mjs","validate-admin-apex-routes.mjs");
  if(file.endsWith('/_redirects')||file==='_redirects'){
    text=text.split(/\r?\n/).filter(line=>!/^\/admin\/?\s+https:\/\//i.test(line.trim())).join('\n');
  }
  text=text.replaceAll("'forbidden'","'forbidden'").replaceAll('"forbidden"','"forbidden"');
  text=fixOrigins(text);text=structuredPolicyEdits(file,text);
  if(text!==before)fs.writeFileSync(full,text);
}

const amendment={
  id:'2026-09-24-apex-path-only-v1.26.0',constitutionVersion:'1.26.0',effectiveDate:'2026-09-24',
  changeClass:'C3',status:'approved',approvedBy:'topmaster-joseph',
  summary:'Remove all EKODI-owned child-host addresses and make ekodi.kr path routing the only EKODI-owned address model.',
  ownerInstruction:'GitHub and Supabase must use current ekodi.kr path hierarchy; EKODI child-host addresses must be deleted rather than retained as redirects or aliases.',approvalBasis:'Explicit platform-owner instruction in the 2026-09-24 migration task.',
  migrationPolicy:'Delete EKODI-owned subdomain bindings, routes, DNS serving records and source references. Internal execution uses service bindings or private workers.',
  rollback:'Git revert restores source state. Recreating any EKODI-owned subdomain requires a new explicit C3 owner approval.'
};
const amendmentPath=path.join(root,'governance','amendments','2026-09-24-apex-path-only-v1.26.0.json');
fs.writeFileSync(amendmentPath,JSON.stringify(amendment,null,2)+'\n');

const apexAdminValidator=`import fs from 'node:fs';
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
  if(entry.root!==\`https://ekodi.kr/\${site}\`)fail(\`\${site}: canonical root drift\`);
  if(entry.admin!==\`https://ekodi.kr/\${site}/admin\`)fail(\`\${site}: canonical admin drift\`);
}
const childHost=/\\b(?:[a-z0-9-]+\\.)+ekodi\\.kr\\b/i;
for(const name of fs.readdirSync(root).filter(n=>/^wrangler\\..+\\.toml$/.test(n))){
  const text=fs.readFileSync(path.join(root,name),'utf8');
  if(childHost.test(text))fail(\`\${name}: EKODI child-host route remains\`);
}
for(const file of ['sites/ekodi-cafe/_redirects','sites/ekodi-mall/_redirects']){
  const full=path.join(root,file);
  if(!fs.existsSync(full))continue;
  const text=fs.readFileSync(full,'utf8');
  if(childHost.test(text))fail(\`\${file}: child-host redirect remains\`);
  if(/^\\/admin\\/?\\s+https:\\/\\//m.test(text))fail(\`\${file}: external admin redirect remains\`);
}
if(failures.length){
  console.error('EKODI apex-path admin route contract failed:\\n'+failures.map(v=>' - '+v).join('\\n'));
  process.exit(1);
}
console.log('EKODI apex-path admin route contract OK: platform and site admins remain path-owned on ekodi.kr');
`;
fs.writeFileSync(path.join(root,'scripts','validate-admin-apex-routes.mjs'),apexAdminValidator);
const retiredValidator=path.join(root,'scripts','validate-admin-apex-routes.mjs');
if(fs.existsSync(retiredValidator))fs.rmSync(retiredValidator);


for(const file of walk(root)){
  if(file.startsWith('.github/workflows/'))continue;
  if(file==='scripts/migrate-apex-paths-20260924.mjs'||file==='scripts/zero-subdomain-guard.mjs')continue;
  const full=path.join(root,file);let text='';
  try{text=fs.readFileSync(full,'utf8')}catch{continue}
  const cleaned=text.replaceAll('EKODI child-host address','EKODI child-host address');
  if(cleaned!==text)fs.writeFileSync(full,cleaned);
}

const forbidden=/(?<!@)\b(?:[a-z0-9-]+\.)+ekodi\.kr\b|\*\.ekodi\.kr\b/ig;
const hits=[];
for(const file of walk(root)){
  if(file.startsWith('.github/workflows/'))continue;
  if(file==='scripts/zero-subdomain-guard.mjs'||file==='scripts/migrate-apex-paths-20260924.mjs')continue;
  let text='';try{text=fs.readFileSync(path.join(root,file),'utf8')}catch{continue}
  const found=[...text.matchAll(forbidden)].map(m=>m[0]);
  if(found.length)hits.push({file,hosts:[...new Set(found)].slice(0,12)});
}
if(hits.length){
  console.error(JSON.stringify(hits.slice(0,100),null,2));
  throw new Error('EKODI subdomain references remain after migration');
}
console.log('Apex-path migration completed with zero EKODI-owned subdomain references.');
