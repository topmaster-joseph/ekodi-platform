// EKODI Growth OS Search Visibility Ledger — platform-super-admin only.
// Distinguish manually reviewed evidence from provider API assertions. No credentials,
// remote crawling, paid API calls, or external verification are performed here.
import authWorker from './auth-worker.js';
import { buildEkodiPublicRegistry } from './public-discovery-registry.js';

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
async function publicSites(env){
  const registry=await buildEkodiPublicRegistry(env);
  const items=(registry?.resources||[]).filter(r=>r.type==='site');
  const unique=new Map();
  for(const site of items){
    try{
      const u=new URL(site.url);
      if(u.protocol!=='https:'||u.hostname!=='ekodi.kr')continue;
      if(!unique.has(site.url))unique.set(site.url,{
        id:site.id||site.url,name:safe(site.name||site.path,160),
        url:site.url,host:u.hostname,path:u.pathname,updatedAt:site.updatedAt||null,
      });
    }catch{}
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
function validateEvidence(body,sites){
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
    await ensureSchema(env.DB);
    const sites=await publicSites(env);
    if(request.method==='GET'){
      const [evidence,history,indexNow]=await Promise.all([
        env.DB.prepare('SELECT site_url,provider_id,check_type,state,evidence_url,detail,source,actor,observed_at FROM search_visibility_evidence ORDER BY updated_at DESC LIMIT 6000').all(),
        env.DB.prepare('SELECT site_url,provider_id,check_type,previous_state,new_state,actor,observed_at FROM search_visibility_audit ORDER BY observed_at DESC LIMIT 50').all(),
        lastIndexNow(env.DB,sites),
      ]);
      return json({ok:true,schemaVersion:1,sites,providers:SEARCH_PROVIDER_CATALOG,
        evidence:(evidence.results||[]).filter(x=>sites.some(s=>s.url===x.site_url)),
        evidenceTruncated:(evidence.results||[]).length===6000,
        audit:history.results||[],indexNow,generatedAt:new Date().toISOString(),
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
