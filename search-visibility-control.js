// EKODI Growth OS Search Visibility Ledger — platform-super-admin only.
// Distinguish manually reviewed evidence from provider API assertions. No credentials,
// remote crawling, paid API calls, or external verification are performed here.
import authWorker from './auth-worker.js';
import { buildEkodiPublicRegistry } from './public-discovery-registry.js';
import { listSitePublicationSettings } from './site-publication-runtime.js';
import { googleSearchConsoleReadOnly } from './google-search-console-readonly.js';
import { ADMIN_SERVICE_CATALOG, canonicalServiceChannelAdminPath } from './admin-service-catalog.js';
import { buildSiteSearchPromotionOversight } from './site-search-autonomy-summary.js';

export const SEARCH_CONTROL_PATH='/api/control/search-visibility';
export const SEARCH_PROVIDER_CATALOG=Object.freeze([
  {id:'naver',name:'네이버 서치어드바이저',group:'search',url:'https://searchadvisor.naver.com/',ownership:'host'},
  {id:'google',name:'Google Search Console',group:'search',url:'https://search.google.com/search-console',ownership:'property'},
  {id:'daum',name:'다음 검색등록·웹마스터',group:'search',url:'https://register.search.daum.net/',ownership:'site'},
  {id:'bing',name:'Bing Webmaster Tools',group:'search',url:'https://www.bing.com/webmasters/',ownership:'site'},
  {id:'indexnow-bing',name:'Bing IndexNow',group:'indexnow',url:'https://www.bing.com/indexnow',ownership:'host-key'},
  {id:'indexnow-naver',name:'Naver IndexNow',group:'indexnow',url:'https://searchadvisor.naver.com/indexnow',ownership:'host-key'},
  {id:'indexnow-yandex',name:'Yandex',group:'indexnow',url:'https://yandex.com/indexnow',ownership:'host-key'},
  {id:'indexnow-seznam',name:'Seznam.cz',group:'indexnow',url:'https://search.seznam.cz/indexnow',ownership:'host-key'},
  {id:'indexnow-yep',name:'Yep',group:'indexnow',url:'https://indexnow.yep.com/indexnow',ownership:'host-key'},
  {id:'indexnow-amazon',name:'Amazon',group:'indexnow',url:'https://indexnow.amazonbot.amazon/indexnow',ownership:'host-key'},
  {id:'ai-chatgpt',name:'ChatGPT Search',group:'ai',url:'https://developers.openai.com/api/docs/bots',ownership:'crawler'},
  {id:'ai-google',name:'Google AI Overviews / AI Mode',group:'ai',url:'https://search.google.com/search-console',ownership:'search-console'},
  {id:'ai-copilot',name:'Microsoft Copilot',group:'ai',url:'https://www.bing.com/webmasters/',ownership:'bing-ai-performance'},
  {id:'ai-perplexity',name:'Perplexity',group:'ai',url:'https://docs.perplexity.ai/',ownership:'crawler'},
  {id:'ai-claude',name:'Claude Search',group:'ai',url:'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler',ownership:'crawler'},
]);
const IDS=new Set(SEARCH_PROVIDER_CATALOG.map(p=>p.id));
const STATES=new Set(['unknown','pending','confirmed_manually','needs_action','not_applicable']);
const CHECKS=new Set(['registration','ownership','submission','discovery','citation']);
const safe=(s,n=320)=>String(s??'').trim().slice(0,n);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow',
  'referrer-policy':'no-referrer',
}});
const denied=(status,code)=>json({ok:false,code},status);
function sameOrigin(request){
  const origin=request.headers.get('origin');
  if(!origin)return true; // Non-browser requests still require administrator bearer auth.
  try{return origin===new URL(request.url).origin && new URL(origin).protocol==='https:';}catch{return false;}
}
async function superAdmin(request,env){
  const u=new URL(request.url);u.pathname='/api/session';u.search='';
  const response=await authWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return null;
  const session=await response.json().catch(()=>null);
  return session?.authenticated&&session?.role==='super_admin'?safe(session.email||'super_admin',160):null;
}
async function ensureSchema(db){
  await db.prepare("CREATE TABLE IF NOT EXISTS search_visibility_evidence ("+
    "site_url TEXT NOT NULL,provider_id TEXT NOT NULL,check_type TEXT NOT NULL,"+
    "state TEXT NOT NULL DEFAULT 'unknown',evidence_url TEXT NOT NULL DEFAULT '',"+
    "detail TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT 'manual',"+
    "actor TEXT NOT NULL,observed_at TEXT NOT NULL,updated_at TEXT NOT NULL,"+
    "PRIMARY KEY(site_url,provider_id,check_type))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS search_visibility_audit ("+
    "id TEXT PRIMARY KEY,site_url TEXT NOT NULL,provider_id TEXT NOT NULL,"+
    "check_type TEXT NOT NULL,previous_state TEXT NOT NULL,new_state TEXT NOT NULL,"+
    "actor TEXT NOT NULL,observed_at TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '')").run();
}
// Domain aliases are separate provider properties even when they 301 to a canonical /path.
// They must never inherit proof of ownership, indexing, or submitted sitemap.
// These are independent search-provider properties, not proof of indexing.
// Keep the public canonical host aligned with the live SeonamMedi gateway.
const DOMAIN_CANONICAL_FOR_PATH=Object.freeze({
  '/seonammedi':'https://xn--3e0b8b58jw4co4mnpll3k.kr/',
});
const REGISTERED_LEGACY_HOSTS=Object.freeze({
  '/seonammedi':['seonammedi.kr','서남권국립의대.kr'],
  // This original-domain property remains distinct even when it redirects to /ekodibiz.
  // Hosting the Naver proof file does not establish Search Advisor ownership or indexing.
  '/ekodibiz':['ekodibiz.kr'],
  '/ekodichurch':['ekodichurch.kr'],
  '/ekodilab':['ekodilab.kr'],
  '/ekodimall':['ekodimall.kr'],
});
const safeHost=value=>{
  // URL.hostname normalizes Unicode IDNs to ASCII Punycode. Reject URL
  // components/credentials to avoid treating an untrusted URL as ownership.
  const input=safe(value,255).toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(!input||/[\\\/?#@:\s]/.test(input))return '';
  let h='';
  try{h=new URL('https://'+input).hostname}catch{return ''}
  return h!=='ekodi.kr'&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(h)&&!h.startsWith('www.')?h:'';
};
async function publicSites(env){
  const registry=await buildEkodiPublicRegistry(env);
  const all=registry?.resources||[];
  const originals=all.filter(r=>r.type==='site');
  const items=originals.length?originals:all.filter(r=>r.type==='page'&&/^\/[^/]+\/?$/.test(r.path||''));
  const unique=new Map();
  for(const site of items){
    try{
      const u=new URL(site.url);
      if(u.protocol!=='https:'||u.hostname!=='ekodi.kr')continue;
      if(!unique.has(site.url))unique.set(site.url,{
        id:site.id||site.url,name:safe(site.name||site.path,160),
        url:site.url,host:u.hostname,path:u.pathname,propertyType:'canonical',
        updatedAt:site.updatedAt||null,
      });
    }catch{}
  }
  let settings=[];
  try{settings=await listSitePublicationSettings(env)}catch{settings=[]}
  for(const site of [...unique.values()]){
    const key=site.path.replace(/\/$/,'')||'/';
    const matched=settings.find(s=>(s.canonicalPath?.replace(/\/$/,'')||'/')===key&&s.publicStatus==='public');
    const aliases=[...(matched?.aliases||[]),...(REGISTERED_LEGACY_HOSTS[key]||[])];
    for(const raw of aliases){
      const host=safeHost(raw);
      if(!host)continue;
      const url='https://'+host+'/';
      if(!unique.has(url))unique.set(url,{
        id:'alias:'+host,name:site.name+' · '+(host==='xn--3e0b8b58jw4co4mnpll3k.kr'?'서남권국립의대.kr':host),url,host,path:'/',
        propertyType:'independent-domain',canonicalUrl:DOMAIN_CANONICAL_FOR_PATH[key]||site.url,updatedAt:site.updatedAt,
      });
    }
  }
  return [...unique.values()].slice(0,300);
}
async function lastIndexNow(db,sites){
  try{
    // Existing scheduler records successful Naver submission only, not partner acceptance or indexing.
    const reply=await db.prepare("SELECT url,submitted_at FROM marketing_indexnow_url_state ORDER BY submitted_at DESC LIMIT 5000").all();
    const list=reply.results||[];
    return {source:'marketing_indexnow_url_state',status:'naver_submission_only',truncated:list.length===5000,
      sites:sites.map(site=>{
        const prefix=site.url.endsWith('/')?site.url:site.url+'/';
        let count=0,last=null;
        for(const row of list){if(row.url===site.url||row.url.startsWith(prefix)){count++;if(!last||row.submitted_at>last)last=row.submitted_at;}}
        return {siteUrl:site.url,submittedPagesInSnapshot:count,lastSubmittedAt:last};
      })};
  }catch{return {source:'marketing_indexnow_url_state',status:'unavailable',truncated:false,sites:[]};}
}
// Platform-super-admin only: aggregate per-tenant marketing *status*, never credentials,
// account names, campaign text, customer data, or another tenant's private detail.
// A missing source stays null/unknown rather than being reported as zero or healthy.
export function summarizeAutomationForSites({catalog=ADMIN_SERVICE_CATALOG,connections=[],jobs=[],policies=[],sources={}}={}) {
  const byKey = rows => new Map((rows||[]).map(row=>[String(row.subject_key||''),row]));
  const connectionMap=byKey(connections), jobMap=byKey(jobs), policyMap=byKey(policies);
  const observed = name => sources[name] === 'ready';
  const count = value => Math.max(0, Number(value)||0);
  return catalog.filter(site=>site.kind==='site').map(site=>{
    const subjectKey=String(site.channelSubjectKey||'').trim();
    const link=site.channelAdminSection ? canonicalServiceChannelAdminPath(site) : '';
    const connected=subjectKey&&observed('connections') ? connectionMap.get(subjectKey) : null;
    const published=subjectKey&&observed('jobs') ? jobMap.get(subjectKey) : null;
    const policy=subjectKey&&observed('policies') ? policyMap.get(subjectKey) : null;
    return {
      id:site.id,name:site.name,basePath:site.basePath,adminPath:link,
      scope:subjectKey?'explicit_subject':'not_integrated',
      activeChannels:subjectKey&&observed('connections')?count(connected?.active):null,
      channelsTotal:subjectKey&&observed('connections')?count(connected?.total):null,
      publishedTotal:subjectKey&&observed('jobs')?count(published?.published):null,
      pendingJobs:subjectKey&&observed('jobs')?count(published?.pending):null,
      failedJobs:subjectKey&&observed('jobs')?count(published?.failed):null,
      lastPublishedAt:subjectKey&&observed('jobs')?published?.last_published_at||null:null,
      autonomousPolicy:subjectKey&&observed('policies')&&policy?Boolean(Number(policy.autonomous||0)):null,
    };
  });
}
async function siteAutomationSnapshot(db) {
  const specs=[
    ['connections',`SELECT subject_key,COUNT(*) AS total,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active
      FROM marketing_oauth_connections WHERE subject_type='tenant' GROUP BY subject_key`],
    ['jobs',`SELECT subject_key,COUNT(*) AS total,
      SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN status IN ('queued','scheduled','retrying') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status IN ('failed','credentials_required') THEN 1 ELSE 0 END) AS failed,
      MAX(published_at) AS last_published_at
      FROM marketing_publication_jobs WHERE subject_type='tenant' GROUP BY subject_key`],
    ['policies',`SELECT subject_key,
      MAX(CASE WHEN mode='autonomous' THEN 1 ELSE 0 END) AS autonomous
      FROM marketing_publish_policies WHERE subject_type='tenant' GROUP BY subject_key`],
  ];
  const replies=await Promise.all(specs.map(async([name,sql])=>{
    try {const rows=await db.prepare(sql).all();return [name,'ready',rows.results||[]];}
    catch {return [name,'unavailable',[]];}
  }));
  const sources=Object.fromEntries(replies.map(([name,status])=>[name,status]));
  const rows=Object.fromEntries(replies.map(([name,,items])=>[name,items]));
  return {status:Object.values(sources).every(x=>x==='ready')?'ready':'partial',
    sources,sites:summarizeAutomationForSites({...rows,sources}),
    caveat:'Aggregate observations only. No tenant actions, search ranking, or index acceptance is inferred.'};
}

// Combine the existing Naver IndexNow receipt ledger with the platform-only
// per-site summary. Successful URL submission is NOT evidence of search indexing.
// No tenant-local private records or credentials are exposed.
export function joinSiteIndexNowSubmissions(automation={},indexNow={}) {
  const ready=indexNow?.status==='naver_submission_only'&&Array.isArray(indexNow.sites);
  const truncated=ready&&indexNow.truncated===true;
  const normalize=value=>{
    let path=String(value||'');
    while(path.length>1&&path.endsWith('/'))path=path.slice(0,-1);
    return path||'/';
  };
  const safePath=new RegExp('^/[a-z0-9/_-]*$','i');
  const byPath=new Map();
  if(ready)for(const record of indexNow.sites){
    try{
      const url=new URL(String(record?.siteUrl||''));
      if(url.origin!=='https://ekodi.kr'||url.search||url.hash||url.username||url.password)continue;
      const path=normalize(url.pathname);
      if(!safePath.test(path)||path.includes('//')||byPath.has(path))continue;
      byPath.set(path,record);
    }catch{}
  }
  return {
    ...automation,
    status:automation?.status==='ready'&&ready&&!truncated?'ready':'partial',
    sources:{...(automation?.sources||{}),indexNow:ready?(truncated?'truncated':'ready'):'unavailable'},
    sites:(Array.isArray(automation?.sites)?automation.sites:[]).map(site=>{
      const path=normalize(site?.basePath);
      const recorded=ready?byPath.get(path):null;
      const raw=recorded?Number(recorded.submittedPagesInSnapshot):NaN;
      // A 5,000-row truncated sample cannot prove a missing URL was never sent.
      const submitted=Number.isFinite(raw)&&raw>=0
        ?(truncated&&raw===0?null:Math.trunc(raw)):null;
      return {...site,indexNowSubmittedPages:submitted,
        lastIndexNowSubmittedAt:recorded?.lastSubmittedAt||null,
        indexNowSampleTruncated:Boolean(recorded&&truncated)};
    }),
  };
}

// Pure validator exported for executable security/regression tests; HTTP entry still requires super_admin.
export function validateEvidence(body,sites){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('INVALID_BODY');
  const siteUrl=safe(body.siteUrl,500),providerId=safe(body.providerId,64);
  const checkType=safe(body.checkType,32),state=safe(body.state,32);
  if(!sites.some(s=>s.url===siteUrl))throw new Error('SITE_NOT_PUBLIC');
  if(!IDS.has(providerId))throw new Error('UNKNOWN_PROVIDER');
  if(!CHECKS.has(checkType)||!STATES.has(state))throw new Error('INVALID_CHECK_OR_STATE');
  const provider=SEARCH_PROVIDER_CATALOG.find(p=>p.id===providerId);
  if(provider.group==='ai'&&checkType==='registration'&&state==='confirmed_manually')throw new Error('AI_REGISTRATION_NOT_SUPPORTED');
  const evidenceUrl=safe(body.evidenceUrl,500),detail=safe(body.detail,700);
  if(evidenceUrl){
    let u;try{u=new URL(evidenceUrl)}catch{throw new Error('INVALID_EVIDENCE_URL')}
    if(u.protocol!=='https:'||u.username||u.password)throw new Error('EVIDENCE_MUST_BE_HTTPS');
  }
  if(state==='confirmed_manually'&&!evidenceUrl&&!detail)throw new Error('CONFIRMATION_REQUIRES_EVIDENCE');
  return {siteUrl,providerId,checkType,state,evidenceUrl,detail};
}
export async function handleSearchVisibilityControl(request,env){
  const url=new URL(request.url);
  if(url.pathname!==SEARCH_CONTROL_PATH)return null;
  if(!['GET','PATCH'].includes(request.method))return denied(405,'METHOD_NOT_ALLOWED');
  if(!sameOrigin(request))return denied(403,'ORIGIN_FORBIDDEN');
  const actor=await superAdmin(request,env);
  if(!actor)return denied(403,'SUPER_ADMIN_REQUIRED');
  if(!env?.DB?.prepare)return denied(503,'DATABASE_UNAVAILABLE');
  try{
    // Explicit opt-in read-only Google report: no D1 table creation or audit
    // writes. Authenticated super-admin and current public-registry match only.
    if(url.searchParams.has('googleSiteUrl')){
      if(request.method!=='GET')return denied(405,'METHOD_NOT_ALLOWED');
      const siteUrl=url.searchParams.get('googleSiteUrl');
      const allowed=await publicSites(env);
      const site=allowed.find(x=>x.url===siteUrl);
      if(!site)return denied(400,'SITE_NOT_PUBLIC');
      return json({ok:true,google:await googleSearchConsoleReadOnly({env,site})});
    }
    await ensureSchema(env.DB);
    const sites=await publicSites(env);
    if(request.method==='GET'){
      const [evidence,history,indexNow,automation]=await Promise.all([
        env.DB.prepare('SELECT site_url,provider_id,check_type,state,evidence_url,detail,source,actor,observed_at FROM search_visibility_evidence ORDER BY updated_at DESC LIMIT 6000').all(),
        env.DB.prepare('SELECT site_url,provider_id,check_type,previous_state,new_state,actor,observed_at FROM search_visibility_audit ORDER BY observed_at DESC LIMIT 50').all(),
        lastIndexNow(env.DB,sites),
        siteAutomationSnapshot(env.DB),
      ]);
      return json({ok:true,schemaVersion:1,sites,providers:SEARCH_PROVIDER_CATALOG,
        evidence:(evidence.results||[]).filter(x=>sites.some(s=>s.url===x.site_url)),
        evidenceTruncated:(evidence.results||[]).length===6000,
        audit:history.results||[],indexNow,
        automation:joinSiteIndexNowSubmissions(automation,indexNow),
        oversight:buildSiteSearchPromotionOversight({
          sites,automation:joinSiteIndexNowSubmissions(automation,indexNow),
        }),generatedAt:new Date().toISOString(),
        policy:'manual_confirmation_not_provider_api_verification'});
    }
    if(!String(request.headers.get('content-type')||'').includes('application/json'))return denied(415,'JSON_REQUIRED');
    if(Number(request.headers.get('content-length')||0)>4000)return denied(413,'PAYLOAD_TOO_LARGE');
    const body=await request.text();if(body.length>4000)return denied(413,'PAYLOAD_TOO_LARGE');
    let entry;
    try{entry=validateEvidence(JSON.parse(body),sites)}catch(error){return json({ok:false,code:safe(error.message,80)},400);}
    const now=new Date().toISOString();
    const prior=await env.DB.prepare('SELECT state FROM search_visibility_evidence WHERE site_url=? AND provider_id=? AND check_type=?')
      .bind(entry.siteUrl,entry.providerId,entry.checkType).first();
    const writes=[
      env.DB.prepare("INSERT INTO search_visibility_evidence(site_url,provider_id,check_type,state,evidence_url,detail,source,actor,observed_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) "+
        "ON CONFLICT(site_url,provider_id,check_type) DO UPDATE SET state=excluded.state,evidence_url=excluded.evidence_url,detail=excluded.detail,source='manual',actor=excluded.actor,observed_at=excluded.observed_at,updated_at=excluded.updated_at")
        .bind(entry.siteUrl,entry.providerId,entry.checkType,entry.state,entry.evidenceUrl,entry.detail,'manual',actor,now,now),
      env.DB.prepare('INSERT INTO search_visibility_audit(id,site_url,provider_id,check_type,previous_state,new_state,actor,observed_at,detail) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(),entry.siteUrl,entry.providerId,entry.checkType,prior?.state||'unknown',entry.state,actor,now,entry.detail),
    ];
    await env.DB.batch(writes);
    return json({ok:true,siteUrl:entry.siteUrl,providerId:entry.providerId,checkType:entry.checkType,
      state:entry.state,source:'manual',actor,observedAt:now});
  }catch(error){
    console.error('Search visibility ledger error',safe(error?.message,200));
    return denied(503,'SEARCH_LEDGER_UNAVAILABLE');
  }
}
