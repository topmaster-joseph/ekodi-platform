import { hasRegionalMedicalContext, isPublicSeonamMediSource } from './seonammedi-relevance.js';

const API_PATH='/api/seonammedi/monitor';
const MAX_ITEMS_PER_QUERY=20;
const RECENT_DAYS=7;
const MEDIA_ENRICH_LIMIT=8;
// Deliberately rate-limited; sources outside the budget stay unpublished until verified.
async function ensureSourceVerificationColumn(db){
  try{await db.prepare('SELECT source_verified FROM seonammedi_monitor_items LIMIT 0').all();return}catch(error){
    if(!/no such column/i.test(String(error?.message||error)))throw error;
  }
  try{await db.prepare("ALTER TABLE seonammedi_monitor_items ADD COLUMN source_verified INTEGER NOT NULL DEFAULT 0").run()}
  catch(error){if(!/duplicate column name/i.test(String(error?.message||error)))throw error}
}
const QUERIES=Object.freeze([
  {key:'seonam-national-medical',label:'서남권 국립의대',q:'"서남권" 국립의대'},
  {key:'mokpo-national-medical',label:'목포대 국립의대',q:'목포대 국립의대'},
  {key:'jeonnam-national-medical',label:'전남 국립의대',q:'전남 국립의대'},
  {key:'seonam-committee',label:'서남권 의대 비상대책위원회',q:'"서남권 의대" 비상대책위원회'}
]);
const clean=(value,max=1000)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const json=(body,status=200,cache='public, max-age=300')=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':cache,'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const xmlText=value=>clean(String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'),1000);
const tag=(block,name)=>{const m=String(block||'').match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));return m?xmlText(m[1]):''};
const sourceTag=block=>{const m=String(block||'').match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);return m?xmlText(m[1]):''};
async function digest(value){const bytes=new TextEncoder().encode(String(value||''));const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('')}
function rssUrl(query){const q=encodeURIComponent(query);return 'https://news.google.com/rss/search?q='+q+'&hl=ko&gl=KR&ceid=KR:ko'}
function bingRssUrl(query){const q=encodeURIComponent(query);return 'https://www.bing.com/news/search?q='+q+'&format=RSS&setlang=ko-kr'}
// Cloudflare and upstream RSS gateways can briefly return 429/5xx.
// Keep retries small, honour Retry-After, and never publish an unverified result.
const RSS_RETRYABLE_STATUSES=new Set([429,500,502,503,504]);
const RSS_RETRY_ATTEMPTS=3;
const RSS_MAX_RETRY_DELAY_MS=2000;
function rssRetryAfterMs(value,nowMs){
  const text=String(value||'').trim();
  if(!text)return null;
  const seconds=Number(text);
  if(Number.isFinite(seconds)&&seconds>=0)return Math.ceil(seconds*1000);
  const date=Date.parse(text);
  return Number.isFinite(date)?Math.max(0,date-nowMs):null;
}
export async function fetchSeonamMediNewsRss(query,{fetchImpl=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now()}={}){
  const url=rssUrl(query);
  const options={headers:{'user-agent':'EKODI-SeonamMedi-Monitor/1.2','accept':'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8'},cf:{cacheTtl:0,cacheEverything:false}};
  let lastError=new Error('RSS fetch did not complete');
  for(let attempt=0;attempt<RSS_RETRY_ATTEMPTS;attempt++){
    let response;
    try{response=await fetchImpl(url,options)}
    catch(error){
      lastError=new Error('RSS network error: '+clean(error?.name||'fetch_failed',60));
      if(attempt===RSS_RETRY_ATTEMPTS-1)break;
      await wait(300*(attempt+1));
      continue;
    }
    if(response.ok)return response.text();
    lastError=new Error('HTTP '+response.status);
    if(!RSS_RETRYABLE_STATUSES.has(response.status)||attempt===RSS_RETRY_ATTEMPTS-1)break;
    const retryAfter=rssRetryAfterMs(response.headers?.get?.('retry-after'),now());
    // An upstream cooldown longer than our budget is a failure, not a license
    // to retry early or block all scheduled tasks for an unbounded period.
    if(retryAfter!==null&&retryAfter>RSS_MAX_RETRY_DELAY_MS){
      lastError=new Error('HTTP '+response.status+' (retry_after_deferred)');
      break;
    }
    const backoff=300*(2**attempt);
    const delay=Math.max(backoff,retryAfter||0);
    await wait(Math.min(delay,RSS_MAX_RETRY_DELAY_MS));
  }
  throw lastError;
}
export async function fetchSeonamMediBingNewsRss(query,{fetchImpl=fetch}={}){
  const response=await fetchImpl(bingRssUrl(query),{
    headers:{'user-agent':'EKODI-SeonamMedi-Monitor/1.2','accept':'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8'},
    cf:{cacheTtl:0,cacheEverything:false}
  });
  if(!response.ok)throw new Error('Bing HTTP '+response.status);
  const xml=await response.text();
  if(!isValidSeonamMediRssDocument(xml))throw new Error('bing_invalid_rss_document');
  return xml;
}
// A successful HTTP status is not proof of a valid RSS feed. Upstream
// gateways sometimes return HTML error pages with HTTP 200.
export function isValidSeonamMediRssDocument(xml){
  const body=String(xml||'').trim();
  return /<rss(?:\s[^>]*)?>/i.test(body)&&/<channel(?:\s[^>]*)?>/i.test(body)&&
    /<\/channel\s*>/i.test(body)&&/<\/rss\s*>/i.test(body);
}
function parseRss(xml,key,label,{defaultPublisher='Google News'}={}){
  if(!isValidSeonamMediRssDocument(xml))throw new Error('invalid_rss_document');
  const now=Date.now(),floor=now-RECENT_DAYS*86400000;
  return [...String(xml||'').matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,MAX_ITEMS_PER_QUERY).map(match=>{
    const block=match[1];const title=tag(block,'title');const url=tag(block,'link');const publishedRaw=tag(block,'pubDate');const publisher=sourceTag(block)||defaultPublisher;const publishedMs=Date.parse(publishedRaw);
    return {queryKey:key,queryLabel:label,title,url,publisher,publishedAt:Number.isFinite(publishedMs)?new Date(publishedMs).toISOString():null,publishedMs,resolvedUrl:'',mediaType:'',mediaUrl:'',mediaSource:'',mediaPublishedAt:'',mediaState:'none',sourceType:'news',summaryText:'',sourceVerified:false};
  }).filter(item=>item.title&&/^https:\/\//i.test(item.url)&&(!Number.isFinite(item.publishedMs)||item.publishedMs>=floor));
}
function stripMarkup(value){return clean(String(value||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'),1200)}
function naverBlogConfigured(env){return Boolean(env?.NAVER_CLIENT_ID&&env?.NAVER_CLIENT_SECRET)}
function naverBlogDate(value){const raw=String(value||'');if(!/^\d{8}$/.test(raw))return null;const iso=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8)+'T00:00:00+09:00';const ms=Date.parse(iso);return Number.isFinite(ms)?new Date(ms).toISOString():null}
async function fetchNaverBlogItems(env,query){
  if(!naverBlogConfigured(env))return [];
  const endpoint=new URL('https://openapi.naver.com/v1/search/blog.json');endpoint.searchParams.set('query',query.q);endpoint.searchParams.set('display',String(MAX_ITEMS_PER_QUERY));endpoint.searchParams.set('sort','date');
  const response=await fetch(endpoint,{headers:{'X-Naver-Client-Id':env.NAVER_CLIENT_ID,'X-Naver-Client-Secret':env.NAVER_CLIENT_SECRET,'user-agent':'EKODI-SeonamMedi-Monitor/1.2'}});
  if(!response.ok)throw new Error('Naver HTTP '+response.status);
  const payload=await response.json();const floor=Date.now()-RECENT_DAYS*86400000;
  return (Array.isArray(payload?.items)?payload.items:[]).map(row=>{
    const title=stripMarkup(row.title);const url=httpsUrl(row.link);const publishedAt=naverBlogDate(row.postdate);const publishedMs=publishedAt?Date.parse(publishedAt):NaN;
    let publisher='네이버 블로그';try{publisher=new URL(url).hostname==='blog.naver.com'?'네이버 블로그':new URL(url).hostname}catch{}
    return {queryKey:query.key,queryLabel:query.label,title,url,publisher,publishedAt,publishedMs,resolvedUrl:url,mediaType:'',mediaUrl:'',mediaSource:'',mediaPublishedAt:'',mediaState:'none',sourceType:'blog',summaryText:stripMarkup(row.description),sourceVerified:false};
  }).filter(item=>item.title&&item.url&&(!Number.isFinite(item.publishedMs)||item.publishedMs>=floor));
}
function metaValue(html,key){
  const escaped=String(key).replace(/[.*+?^$()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp('<meta[^>]+(?:property|name)=["\\\']'+escaped+'["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\'][^>]*>','i'),
    new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:property|name)=["\\\']'+escaped+'["\\\'][^>]*>','i')
  ];
  for(const pattern of patterns){const match=String(html||'').match(pattern);if(match?.[1])return clean(match[1],2048)}
  return '';
}
function httpsUrl(value,base=''){
  try{const url=new URL(String(value||''),base||undefined);return url.protocol==='https:'?url.toString():''}catch{return''}
}
async function enrichMedia(item){
  try{
    const response=await fetch(item.url,{redirect:'follow',headers:{'user-agent':'EKODI-SeonamMedi-Evidence/1.0','accept':'text/html,application/xhtml+xml'}});
    if(!response.ok)return item;
    const resolvedUrl=httpsUrl(response.url)||item.url;
    if(new URL(resolvedUrl).hostname==='news.google.com')return {...item,resolvedUrl};
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('text/html')&&!type.includes('application/xhtml+xml'))return {...item,resolvedUrl};
    const html=(await response.text()).slice(0,350000);
    // A Google search result alone is not proof: inspect the publisher's
    // actual page title and article text (or publisher-authored description).
    const originalTitle=stripMarkup(metaValue(html,'og:title')||metaValue(html,'twitter:title')||(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]);
    const articleHtml=(html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)||[])[1]||'';
    const articleText=articleHtml?stripMarkup(articleHtml.replace(/<(?:script|style|nav|aside|footer)\b[^>]*>[\s\S]*?<\/(?:script|style|nav|aside|footer)>/gi,' ')):'';
    const articleDescription=stripMarkup(metaValue(html,'og:description')||metaValue(html,'description')||metaValue(html,'twitter:description'));
    const authoritativeContent=hasRegionalMedicalContext(articleText)?articleText:articleText.length>=60?'':articleDescription;
    const articleEvidence=hasRegionalMedicalContext(item.title)&&hasRegionalMedicalContext(originalTitle)&&hasRegionalMedicalContext(authoritativeContent)
      ?authoritativeContent:'';
    const verifiedSummary=articleEvidence?clean(articleEvidence,900):'';
    const video=metaValue(html,'og:video:secure_url')||metaValue(html,'og:video:url')||metaValue(html,'og:video')||metaValue(html,'twitter:player');
    const image=metaValue(html,'og:image:secure_url')||metaValue(html,'og:image')||metaValue(html,'twitter:image');
    const mediaType=video?'video':image?'photo':'';
    const mediaUrl=httpsUrl(video||image,resolvedUrl);
    const mediaPublishedAt=metaValue(html,'article:published_time')||metaValue(html,'datePublished')||item.publishedAt||'';
    return {...item,resolvedUrl,summaryText:verifiedSummary||'',sourceVerified:Boolean(verifiedSummary),mediaType:mediaType&&mediaUrl?mediaType:'',mediaUrl:mediaUrl||'',mediaSource:item.publisher||new URL(resolvedUrl).hostname,mediaPublishedAt:clean(mediaPublishedAt,80),mediaState:mediaType&&mediaUrl?'candidate':'none'};
  }catch{return item}
}
async function insertItem(env,item,seenAt){
  await ensureSourceVerificationColumn(env.DB);
  const fingerprint=await digest(item.title+'\n'+item.url);
  const existing=await env.DB.prepare('SELECT id FROM seonammedi_monitor_items WHERE fingerprint=? LIMIT 1').bind(fingerprint).first();
  if(existing?.id){
    await env.DB.prepare('UPDATE seonammedi_monitor_items SET last_seen_at=?,publisher=?,published_at=COALESCE(?,published_at),query_key=?,query_label=?,resolved_url=CASE WHEN ?<>\'\' THEN ? ELSE resolved_url END,media_type=CASE WHEN ?<>\'\' THEN ? ELSE media_type END,media_url=CASE WHEN ?<>\'\' THEN ? ELSE media_url END,media_source=CASE WHEN ?<>\'\' THEN ? ELSE media_source END,media_published_at=CASE WHEN ?<>\'\' THEN ? ELSE media_published_at END,media_state=CASE WHEN ?=\'candidate\' THEN \'candidate\' ELSE media_state END,source_type=?,summary_text=CASE WHEN ?<>\'\' THEN ? ELSE summary_text END,source_verified=CASE WHEN ?=1 THEN 1 ELSE source_verified END WHERE id=?')
      .bind(seenAt,item.publisher,item.publishedAt,item.queryKey,item.queryLabel,item.resolvedUrl,item.resolvedUrl,item.mediaType,item.mediaType,item.mediaUrl,item.mediaUrl,item.mediaSource,item.mediaSource,item.mediaPublishedAt,item.mediaPublishedAt,item.mediaState,item.sourceType||'web',item.summaryText||'',item.summaryText||'',item.sourceVerified?1:0,existing.id).run();
    return false;
  }
  await env.DB.prepare("INSERT INTO seonammedi_monitor_items (fingerprint,title,url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at,resolved_url,media_type,media_url,media_source,media_published_at,media_state,source_type,summary_text,source_verified) VALUES (?,?,?,?,?,?,?,'source_only',?,?,?,?,?,?,?,?,?,?,?)")
    .bind(fingerprint,item.title,item.url,item.publisher,item.publishedAt,item.queryKey,item.queryLabel,seenAt,seenAt,item.resolvedUrl,item.mediaType,item.mediaUrl,item.mediaSource,item.mediaPublishedAt,item.mediaState,item.sourceType||'web',item.summaryText||'',item.sourceVerified?1:0).run();
  return true;
}
export async function runSeonamMediHourlyCheck(env,{scheduledAt=null,force=false}={}){
  if(!env?.DB?.prepare)return {ok:false,error:'storage_unavailable'};
  try{await ensureSourceVerificationColumn(env.DB)}catch(error){return {ok:false,error:'source_verification_schema_unavailable',message:clean(error?.message||error,300)}}
  const startedAt=new Date(scheduledAt||Date.now()).toISOString();let runId=null;let checked=0,seen=0,added=0,mediaCandidates=0,mediaBudget=MEDIA_ENRICH_LIMIT;const errors=[];
  if(!force){
    try{
      const existing=await env.DB.prepare("SELECT id,status,completed_at FROM seonammedi_monitor_runs WHERE strftime('%Y-%m-%d %H',datetime(started_at,'+9 hours'))=strftime('%Y-%m-%d %H',datetime(?,'+9 hours')) AND status IN ('running','ok','partial') ORDER BY id DESC LIMIT 1").bind(startedAt).first();
      if(existing?.id)return {ok:true,status:'already_checked',skipped:true,runId:existing.id,completedAt:existing.completed_at||null};
    }catch(error){
      const message=clean(error?.message||error,300);
      if(!/no such table|no such column/i.test(message))return {ok:false,error:'hourly_guard_failed',message};
    }
  }
  try{
    const run=await env.DB.prepare("INSERT INTO seonammedi_monitor_runs(started_at,status,sources_checked,items_seen,new_items,error_summary) VALUES (?,'running',0,0,0,'')").bind(startedAt).run();
    runId=run?.meta?.last_row_id||null;
  }catch(error){return {ok:false,error:'schema_unavailable',message:clean(error?.message,300)}}
  for(const query of QUERIES){
    let newsItems=null;
    let googleError=null;
    try{
      newsItems=parseRss(await fetchSeonamMediNewsRss(query.q),query.key,query.label);
    }catch(error){
      googleError=error;
      try{
        newsItems=parseRss(await fetchSeonamMediBingNewsRss(query.q),query.key,query.label,{defaultPublisher:'Bing News'});
      }catch(fallbackError){
        errors.push(query.key+':news:'+clean(error?.message||error,100)+' -> bing:'+clean(fallbackError?.message||fallbackError,100));
      }
    }
    if(Array.isArray(newsItems)){
      checked+=1;seen+=newsItems.length;
      for(let item of newsItems){
        if(mediaBudget>0&&hasRegionalMedicalContext(item.title)){item=await enrichMedia(item);mediaBudget-=1;if(item.mediaState==='candidate')mediaCandidates+=1}
        if(await insertItem(env,item,startedAt))added+=1;
      }
      if(googleError)errors.push(query.key+':google_degraded:'+clean(googleError?.message||googleError,120));
    }
    if(naverBlogConfigured(env)){
      try{
        const blogItems=await fetchNaverBlogItems(env,query);checked+=1;seen+=blogItems.length;
        for(let item of blogItems){if(mediaBudget>0&&hasRegionalMedicalContext(item.title)){item=await enrichMedia(item);mediaBudget-=1;if(item.mediaState==='candidate')mediaCandidates+=1}if(await insertItem(env,item,startedAt))added+=1}
      }catch(error){errors.push(query.key+':blog:'+clean(error?.message||error,160))}
    }
  }
  const completedAt=new Date().toISOString();const status=errors.length?(checked?'partial':'failed'):'ok';
  await env.DB.prepare('UPDATE seonammedi_monitor_runs SET completed_at=?,status=?,sources_checked=?,items_seen=?,new_items=?,error_summary=? WHERE id=?')
    .bind(completedAt,status,checked,seen,added,clean(errors.join(' | '),1000),runId).run().catch(()=>{});
  return {ok:status!=='failed',status,checked,seen,added,mediaCandidates,completedAt,errors};
}
// Public feed uses bounded batches so an old, unverified search hit cannot
// starve newer approved records or limit the archive to the last seven days.
const PUBLIC_NEWS_BATCH=160;
const PUBLIC_NEWS_PAGE_SIZE=60;
const PUBLIC_NEWS_MAX_SCANS=12;
export async function handleSeonamMediMonitorApi(request,env){
  const url=new URL(request.url);if(url.pathname!==API_PATH)return null;
  if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405,'no-store');
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable',lastRun:null,items:[]},503,'no-store');
  const cursorValue=url.searchParams.get('cursor');
  if(cursorValue!==null&&!/^(0|[1-9]\d{0,8})$/.test(cursorValue))return json({ok:false,error:'invalid_cursor'},400,'no-store');
  const initialOffset=cursorValue===null?0:Number(cursorValue);
  // Bound public requests; an absent limit remains backwards compatible.
  const requestedLimit=Number(url.searchParams.get('limit'));
  const pageSize=Number.isSafeInteger(requestedLimit)&&requestedLimit>0?Math.min(requestedLimit,PUBLIC_NEWS_PAGE_SIZE):48;
  try{
    await ensureSourceVerificationColumn(env.DB);
    const lastRun=await env.DB.prepare('SELECT id,started_at,completed_at,status,sources_checked,items_seen,new_items,error_summary FROM seonammedi_monitor_runs ORDER BY id DESC LIMIT 1').first();
    const collected=[];
    let offset=initialOffset,exhausted=false;
    for(let scan=0;scan<PUBLIC_NEWS_MAX_SCANS&&collected.length<pageSize;scan++){
      const rows=await env.DB.prepare("SELECT id,title,url,resolved_url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at,media_type,media_url,media_source,media_published_at,media_state,source_type,summary_text,source_verified FROM seonammedi_monitor_items WHERE review_state NOT IN ('rejected','archived') AND (review_state='verified' OR (source_verified=1 AND source_type='news')) ORDER BY COALESCE(published_at,first_seen_at) DESC,id DESC LIMIT ? OFFSET ?").bind(PUBLIC_NEWS_BATCH,offset).all();
      const candidates=rows?.results||[];
      if(!candidates.length){exhausted=true;break}
      const publicItems=candidates.filter(isPublicSeonamMediSource);
      const needed=pageSize-collected.length;
      const selected=publicItems.slice(0,needed);
      collected.push(...selected);
      if(publicItems.length>=needed){
        const lastId=selected.at(-1)?.id;
        offset+=candidates.findIndex(item=>item.id===lastId)+1;
        break;
      }
      offset+=candidates.length;
      if(candidates.length<PUBLIC_NEWS_BATCH){exhausted=true;break}
    }
    // Relevance and source verification remain enforced on each page, including
    // entries collected before the current publication policy was introduced.
    const publicItems=collected.map(item=>({...item,content_match:item.review_state==='verified'?'editor_verified':'source_confirmed'}));
    const recentCandidates=(initialOffset===0?(await env.DB.prepare("SELECT id,title,url,resolved_url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at,media_type,media_url,media_source,media_published_at,media_state,source_type,summary_text,source_verified FROM seonammedi_monitor_items WHERE datetime(last_seen_at)>=datetime('now','-7 days') ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT 160").all()).results||[]:[]);
    const mediaCandidateCount=publicItems.filter(item=>item.media_state==='candidate'&&['photo','video'].includes(item.media_type)).length;
    return json({ok:true,siteOwned:true,aiProvider:false,schedule:'hourly Asia/Seoul',scheduler:'existing-control-cron',channels:{news:true,naverBlog:naverBlogConfigured(env)},lastRun:lastRun||null,mediaCandidateCount,recentCandidateCount:recentCandidates.length,verifiedPublicCount:publicItems.length,items:publicItems,nextCursor:exhausted?null:String(offset),sort:'publication_desc',archive:true},200,'no-store');
  }catch(error){return json({ok:false,error:'monitor_schema_unavailable',message:'사이트 자동점검 저장소 준비 중입니다.',lastRun:null,items:[]},503,'no-store')}
}
