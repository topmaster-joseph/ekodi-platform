import { hasRegionalMedicalContext, isPublicSeonamMediSource, isRelevantHeadline } from './seonammedi-relevance.js';

const API_PATH='/api/seonammedi/monitor';
const MAX_ITEMS_PER_QUERY=20;
const RECENT_DAYS=7;
const MEDIA_ENRICH_LIMIT=8;
// Unverified candidates already stored (for example Google News redirect links
// collected before publisher-URL resolution existed) are re-checked a few at a
// time each hour so the public archive catches up without a burst of requests.
const REVERIFY_LIMIT=8;
const REVERIFY_SCAN=200;
const REVERIFY_RETRY_HOURS=12;
const SOURCE_FETCH_TIMEOUT_MS=7000;
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
  {key:'seonam-committee',label:'서남권 의대 비상대책위원회',q:'"서남권 의대" 비상대책위원회'},
  {key:'seonam-committee-short',label:'서남권 의대 비대위',q:'서남권 의대 비대위'}
]);
async function ensureVerifyCheckedColumn(db){
  try{await db.prepare('SELECT verify_checked_at FROM seonammedi_monitor_items LIMIT 0').all();return}catch(error){
    if(!/no such column/i.test(String(error?.message||error)))throw error;
  }
  try{await db.prepare('ALTER TABLE seonammedi_monitor_items ADD COLUMN verify_checked_at TEXT').run()}
  catch(error){if(!/duplicate column name/i.test(String(error?.message||error)))throw error}
}
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
// Naver Search moved to NAVER API HUB (NAVER Cloud): new keys are issued there
// since 2026-07-31; legacy developers.naver.com keys keep working until
// 2027-06-30. Try API HUB first, then the legacy endpoint for older keys.
const NAVER_API_HUB='https://naverapihub.apigw.ntruss.com/search/v1/';
const NAVER_LEGACY='https://openapi.naver.com/v1/search/';
export async function naverSearchRequest(env,kind,q,{fetchImpl=fetch}={}){
  const params=new URLSearchParams({query:q,display:String(MAX_ITEMS_PER_QUERY),sort:'date'});
  const attempts=[
    [NAVER_API_HUB+kind+'?'+params,{'X-NCP-APIGW-API-KEY-ID':env.NAVER_CLIENT_ID,'X-NCP-APIGW-API-KEY':env.NAVER_CLIENT_SECRET}],
    [NAVER_LEGACY+kind+'.json?'+params,{'X-Naver-Client-Id':env.NAVER_CLIENT_ID,'X-Naver-Client-Secret':env.NAVER_CLIENT_SECRET}]
  ];
  let last=null;
  for(const [url,auth] of attempts){
    const response=await fetchImpl(url,{headers:{...auth,'user-agent':'EKODI-SeonamMedi-Monitor/1.4'},signal:AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS)});
    if(response.ok)return response;
    last=response.status;
    if(![401,403,404].includes(response.status))break;
  }
  throw new Error('Naver '+kind+' HTTP '+last);
}
function naverBlogConfigured(env){return Boolean(env?.NAVER_CLIENT_ID&&env?.NAVER_CLIENT_SECRET)}
function naverBlogDate(value){const raw=String(value||'');if(!/^\d{8}$/.test(raw))return null;const iso=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8)+'T00:00:00+09:00';const ms=Date.parse(iso);return Number.isFinite(ms)?new Date(ms).toISOString():null}
async function fetchNaverBlogItems(env,query){
  if(!naverBlogConfigured(env))return [];
  const response=await naverSearchRequest(env,'blog',query.q);
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
// Search engines hand back their own redirect links. Publication requires the
// publisher's page, so resolve those links to the original article first.
const GOOGLE_NEWS_ARTICLE=/^https:\/\/news\.google\.com\/(?:rss\/)?(?:articles|read)\/([A-Za-z0-9_-]{16,})/;
function base64UrlBytes(value){
  const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  const binary=atob(padded);const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
// Older Google News ids embed the article URL directly (field 4, length-prefixed).
export function decodeLegacyGoogleNewsId(id){
  try{
    const bytes=base64UrlBytes(id);
    if(bytes[0]!==0x08||bytes[1]!==0x13||bytes[2]!==0x22)return'';
    let pos=3,length=0,shift=0;
    for(;pos<bytes.length&&shift<35;pos++){const b=bytes[pos];length|=(b&0x7f)<<shift;shift+=7;if(!(b&0x80)){pos++;break}}
    if(!length||pos+length>bytes.length)return'';
    const text=new TextDecoder().decode(bytes.slice(pos,pos+length));
    return /^https:\/\//.test(text)?httpsUrl(text):'';
  }catch{return''}
}
function googleBatchRequest(id,timestamp,signature){
  const inner=JSON.stringify(['garturlreq',[['X','X',['X','X'],null,null,1,1,'US:en',null,1,null,null,null,null,null,0,1],'X','X',1,[1,1,1],1,1,null,0,0,null,0],id,timestamp,signature]);
  return 'f.req='+encodeURIComponent(JSON.stringify([[['Fbv4je',inner,null,'generic']]]));
}
export function parseGoogleBatchResponse(text){
  const match=String(text||'').match(/\["wrb\.fr","Fbv4je","((?:\\.|[^"\\])*)"/);
  if(!match)return'';
  try{const payload=JSON.parse(JSON.parse('"'+match[1]+'"'));return payload?.[0]==='garturlres'?httpsUrl(payload[1]):''}catch{return''}
}
export async function resolveSeonamMediPublisherUrl(link,{fetchImpl=fetch}={}){
  let url;try{url=new URL(String(link||''))}catch{return''}
  const host=url.hostname.toLowerCase();
  if(host==='www.bing.com'||host==='bing.com'){
    const target=url.searchParams.get('url');
    return target?httpsUrl(target):'';
  }
  const google=String(link).match(GOOGLE_NEWS_ARTICLE);
  if(!google)return url.protocol==='https:'?url.href:'';
  const id=google[1];
  const legacy=decodeLegacyGoogleNewsId(id);
  if(legacy)return legacy;
  try{
    const page=await fetchImpl('https://news.google.com/rss/articles/'+id,{headers:{'user-agent':'Mozilla/5.0 (compatible; EKODI-SeonamMedi-Monitor/1.3)','accept':'text/html'},signal:AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS)});
    if(!page.ok)return'';
    const html=await page.text();
    const signature=(html.match(/data-n-a-sg="([^"]+)"/)||[])[1];
    const timestamp=Number((html.match(/data-n-a-ts="(\d+)"/)||[])[1]);
    if(!signature||!Number.isFinite(timestamp))return'';
    const response=await fetchImpl('https://news.google.com/_/DotsSplashUi/data/batchexecute',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','user-agent':'Mozilla/5.0 (compatible; EKODI-SeonamMedi-Monitor/1.3)'},body:googleBatchRequest(id,timestamp,signature),signal:AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS)});
    if(!response.ok)return'';
    const resolved=parseGoogleBatchResponse(await response.text());
    return resolved&&new URL(resolved).hostname!=='news.google.com'?resolved:'';
  }catch{return''}
}
function isSearchEngineUrl(value){try{return /(?:^|\.)(?:news\.google\.com|google\.com|bing\.com)$/i.test(new URL(value).hostname)}catch{return true}}
// Korean news CMSs rarely use <article>: also read JSON-LD articleBody and the
// common body containers (ndsoft article-view-content-div, itemprop=articleBody,
// *article_body*, *news_body*, *view_con*, ...).
const BODY_CONTAINER=/<(?:div|section|td)\b[^>]*(?:id|class|itemprop)\s*=\s*["'][^"']*(?:article-view-content-div|articleBody|article[_-]?body|article[_-]?content|article[_-]?txt|news[_-]?body|news[_-]?content|newsct_article|view[_-]?con(?:tent|t)?|art[_-]?body|cont[_-]?view|news_view|read[_-]?body|text[_-]?area|bo_v_con|news[_-]?txt|view[_-]?txt|articles?[_-]?detail|article[_-]?view|newsview|cont[_-]?area|detail[_-]?body|news[_-]?text)[^"']*["'][^>]*>/i;
// The container element only (balanced open/close of the same tag), so side
// columns with other headlines never count as article evidence.
function balancedElement(source,start){
  const tag=(source.slice(start).match(/^<([a-z]+)/i)||[])[1]?.toLowerCase()||'div';
  const pattern=new RegExp('<(/?)'+tag+'\\b[^>]*>','gi');pattern.lastIndex=start;
  let depth=0,match;const limit=start+200000;
  while((match=pattern.exec(source))&&match.index<limit){
    depth+=match[1]?-1:1;
    if(depth===0)return source.slice(start,pattern.lastIndex);
  }
  return source.slice(start,start+20000);
}
export function extractArticleBodies(html){
  const source=String(html||'');const out=[];
  const clean=fragment=>stripMarkup(String(fragment||'').replace(/<(?:script|style|nav|aside|footer|figure|figcaption)\b[^>]*>[\s\S]*?<\/(?:script|style|nav|aside|footer|figure|figcaption)>/gi,' '));
  const article=(source.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)||[])[1];
  if(article)out.push(clean(article));
  for(const block of source.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi)||[]){
    const body=(block.match(/"articleBody"\s*:\s*"((?:\\.|[^"\\])*)"/)||[])[1];
    if(body){try{out.push(stripMarkup(JSON.parse('"'+body+'"')))}catch{}}
  }
  const container=source.search(BODY_CONTAINER);
  if(container>=0)out.push(clean(balancedElement(source,container)));
  // Last resort: the page's own paragraphs (navigation and related-article
  // lists are links/list items, not <p>), only when they look like a body.
  const main=source.replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  const paragraphs=(main.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi)||[]).map(p=>stripMarkup(p)).filter(text=>text.length>=20&&!/^(?:ⓒ|©|Copyright|무단|저작권)/i.test(text));
  const joined=paragraphs.join(' ');
  if(paragraphs.length>=3&&joined.length>=150)out.push(clean(joined));
  return out.filter(Boolean);
}
async function verifySource(item){
  const resolvedUrl=item.resolvedUrl&&!isSearchEngineUrl(item.resolvedUrl)?item.resolvedUrl:await resolveSeonamMediPublisherUrl(item.url);
  if(!resolvedUrl)return item;
  return enrichMedia({...item,resolvedUrl});
}
async function enrichMedia(item){
  try{
    const response=await fetch(item.resolvedUrl||item.url,{redirect:'follow',headers:{'user-agent':'EKODI-SeonamMedi-Evidence/1.0','accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS)});
    if(!response.ok)return item;
    const resolvedUrl=httpsUrl(response.url)||item.url;
    if(new URL(resolvedUrl).hostname==='news.google.com')return {...item,resolvedUrl};
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('text/html')&&!type.includes('application/xhtml+xml'))return {...item,resolvedUrl};
    const html=(await response.text()).slice(0,350000);
    // A Google search result alone is not proof: inspect the publisher's
    // actual page title and article text (or publisher-authored description).
    const originalTitle=stripMarkup(metaValue(html,'og:title')||metaValue(html,'twitter:title')||(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]);
    const bodies=extractArticleBodies(html);
    const articleDescription=stripMarkup(metaValue(html,'og:description')||metaValue(html,'description')||metaValue(html,'twitter:description'));
    // Body text wins; the publisher description is used only when no body was found.
    const relevantBody=bodies.find(hasRegionalMedicalContext)||'';
    const authoritativeContent=relevantBody||(bodies.some(text=>text.length>=60)?'':articleDescription);
    const articleEvidence=isRelevantHeadline(item.title)&&isRelevantHeadline(originalTitle)&&hasRegionalMedicalContext(authoritativeContent)
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
// Naver News search returns the publisher's own link (originallink), so it is
// the most reliable Korean source when NAVER_CLIENT_ID/SECRET are configured.
async function fetchNaverNewsItems(env,query){
  if(!naverBlogConfigured(env))return [];
  const response=await naverSearchRequest(env,'news',query.q);
  const payload=await response.json();const floor=Date.now()-RECENT_DAYS*86400000;
  return (Array.isArray(payload?.items)?payload.items:[]).map(row=>{
    const url=httpsUrl(row.originallink)||httpsUrl(row.link);const publishedMs=Date.parse(row.pubDate);
    let publisher='';try{publisher=new URL(url).hostname.replace(/^www\./,'')}catch{}
    return {queryKey:query.key,queryLabel:query.label,title:stripMarkup(row.title),url,publisher:publisher||'네이버 뉴스',publishedAt:Number.isFinite(publishedMs)?new Date(publishedMs).toISOString():null,publishedMs,resolvedUrl:url,mediaType:'',mediaUrl:'',mediaSource:'',mediaPublishedAt:'',mediaState:'none',sourceType:'news',summaryText:'',sourceVerified:false};
  }).filter(item=>item.title&&item.url&&(!Number.isFinite(item.publishedMs)||item.publishedMs>=floor));
}
export async function reverifyStoredCandidates(env,checkedAt,{limit=REVERIFY_LIMIT,verify=verifySource}={}){
  await ensureVerifyCheckedColumn(env.DB);
  const retryBefore=new Date(Date.parse(checkedAt)-REVERIFY_RETRY_HOURS*3600000).toISOString();
  const rows=(await env.DB.prepare("SELECT id,title,url,resolved_url,publisher,published_at,query_key,query_label,source_type FROM seonammedi_monitor_items WHERE COALESCE(source_verified,0)=0 AND review_state NOT IN ('rejected','archived','verified') AND (verify_checked_at IS NULL OR verify_checked_at<?) ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT ?").bind(retryBefore,REVERIFY_SCAN).all())?.results||[];
  let attempted=0,verified=0;
  for(const row of rows){
    const relevant=isRelevantHeadline(row.title);
    if(relevant&&attempted>=limit)continue;
    if(relevant){
      attempted+=1;
      const item=await verify({queryKey:row.query_key||'',queryLabel:row.query_label||'',title:row.title,url:row.url,publisher:row.publisher||'',publishedAt:row.published_at||null,resolvedUrl:row.resolved_url||'',mediaType:'',mediaUrl:'',mediaSource:'',mediaPublishedAt:'',mediaState:'none',sourceType:row.source_type||'news',summaryText:'',sourceVerified:false});
      // Evidence fields only: discovery timestamps keep their original meaning.
      await env.DB.prepare("UPDATE seonammedi_monitor_items SET resolved_url=CASE WHEN ?<>'' THEN ? ELSE resolved_url END,summary_text=CASE WHEN ?<>'' THEN ? ELSE summary_text END,source_verified=CASE WHEN ?=1 THEN 1 ELSE source_verified END,media_type=CASE WHEN ?<>'' THEN ? ELSE media_type END,media_url=CASE WHEN ?<>'' THEN ? ELSE media_url END,media_source=CASE WHEN ?<>'' THEN ? ELSE media_source END,media_state=CASE WHEN ?='candidate' THEN 'candidate' ELSE media_state END,verify_checked_at=? WHERE id=?")
        .bind(item.resolvedUrl||'',item.resolvedUrl||'',item.summaryText||'',item.summaryText||'',item.sourceVerified?1:0,item.mediaType||'',item.mediaType||'',item.mediaUrl||'',item.mediaUrl||'',item.mediaSource||'',item.mediaSource||'',item.mediaState||'none',checkedAt,row.id).run();
      if(item.sourceVerified)verified+=1;
      continue;
    }
    await env.DB.prepare('UPDATE seonammedi_monitor_items SET verify_checked_at=? WHERE id=?').bind(checkedAt,row.id).run();
  }
  return verified;
}
// Workers egress is blocked by Google/Bing, and GitHub throttles scheduled
// workflows here, so the reliable hourly Worker cron wakes the runner crawl
// through workflow_dispatch. Needs SEONAMMEDI_DISPATCH_TOKEN (fine-grained,
// this repository, Actions read/write); absent token = no-op.
export const SEONAMMEDI_RUNNER_WORKFLOW='seonammedi-news-monitor-runner.yml';
// Records each hourly wake outcome (no secret values) so failures are visible.
export async function recordSeonamMediRunnerWake(env,result,at=new Date().toISOString()){
  if(!env?.DB?.prepare)return false;
  try{
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS seonammedi_runner_wakes (id INTEGER PRIMARY KEY AUTOINCREMENT, woke_at TEXT NOT NULL, ok INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '')").run();
    await env.DB.prepare('INSERT INTO seonammedi_runner_wakes(woke_at,ok,detail) VALUES (?,?,?)').bind(at,result?.ok?1:0,clean(result?.error||result?.skipped||(result?.dispatched?'dispatched':''),200)).run();
    await env.DB.prepare('DELETE FROM seonammedi_runner_wakes WHERE id NOT IN (SELECT id FROM seonammedi_runner_wakes ORDER BY id DESC LIMIT 500)').run();
    return true;
  }catch{return false}
}
export async function wakeSeonamMediRunner(env,options={}){
  const result=await dispatchSeonamMediRunner(env,options);
  await recordSeonamMediRunnerWake(env,result);
  return result;
}
export async function dispatchSeonamMediRunner(env,{fetchImpl=fetch}={}){
  const token=String(env?.SEONAMMEDI_DISPATCH_TOKEN||'').trim();
  if(!token)return {ok:false,skipped:'dispatch_token_not_configured'};
  const repo=String(env?.GITHUB_REPOSITORY||'').trim()||'topmaster-joseph/ekodi-platform';
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo))return {ok:false,error:'invalid_repository'};
  try{
    const response=await fetchImpl(`https://api.github.com/repos/${repo}/actions/workflows/${SEONAMMEDI_RUNNER_WORKFLOW}/dispatches`,{
      method:'POST',
      headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json','user-agent':'EKODI-SeonamMedi-Cron/1.0'},
      body:JSON.stringify({ref:'main'}),
      signal:AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS)
    });
    return response.status===204?{ok:true,dispatched:true}:{ok:false,error:'github_http_'+response.status};
  }catch(error){return {ok:false,error:'github_dispatch_failed:'+clean(error?.name||error,60)}}
}
// verifyBudget/reverifyLimit default to Workers-safe values; the GitHub runner
// (no Workers subrequest cap) passes larger budgets.
export async function runSeonamMediHourlyCheck(env,{scheduledAt=null,force=false,verifyBudget=MEDIA_ENRICH_LIMIT,reverifyLimit=REVERIFY_LIMIT}={}){
  if(!env?.DB?.prepare)return {ok:false,error:'storage_unavailable'};
  try{await ensureSourceVerificationColumn(env.DB)}catch(error){return {ok:false,error:'source_verification_schema_unavailable',message:clean(error?.message||error,300)}}
  const startedAt=new Date(scheduledAt||Date.now()).toISOString();let runId=null;let checked=0,seen=0,added=0,verified=0,reverified=0,mediaCandidates=0,mediaBudget=Math.max(0,Math.min(Number(verifyBudget)||0,120));const errors=[];
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
        if(mediaBudget>0&&isRelevantHeadline(item.title)){item=await verifySource(item);mediaBudget-=1;if(item.mediaState==='candidate')mediaCandidates+=1;if(item.sourceVerified)verified+=1}
        if(await insertItem(env,item,startedAt))added+=1;
      }
      if(googleError)errors.push(query.key+':google_degraded:'+clean(googleError?.message||googleError,120));
    }
    if(naverBlogConfigured(env)){
      try{
        const newsItems=await fetchNaverNewsItems(env,query);checked+=1;seen+=newsItems.length;
        for(let item of newsItems){if(mediaBudget>0&&isRelevantHeadline(item.title)){item=await verifySource(item);mediaBudget-=1;if(item.sourceVerified)verified+=1}if(await insertItem(env,item,startedAt))added+=1}
      }catch(error){errors.push(query.key+':naver_news:'+clean(error?.message||error,160))}
      try{
        const blogItems=await fetchNaverBlogItems(env,query);checked+=1;seen+=blogItems.length;
        for(let item of blogItems){if(mediaBudget>0&&isRelevantHeadline(item.title)){item=await verifySource(item);mediaBudget-=1;if(item.mediaState==='candidate')mediaCandidates+=1}if(await insertItem(env,item,startedAt))added+=1}
      }catch(error){errors.push(query.key+':blog:'+clean(error?.message||error,160))}
    }
  }
  try{reverified=await reverifyStoredCandidates(env,startedAt,{limit:Math.max(0,Math.min(Number(reverifyLimit)||0,80))})}catch(error){errors.push('reverify:'+clean(error?.message||error,160))}
  const completedAt=new Date().toISOString();const status=errors.length?(checked?'partial':'failed'):'ok';
  await env.DB.prepare('UPDATE seonammedi_monitor_runs SET completed_at=?,status=?,sources_checked=?,items_seen=?,new_items=?,error_summary=? WHERE id=?')
    .bind(completedAt,status,checked,seen,added,clean(errors.join(' | '),1000),runId).run().catch(()=>{});
  return {ok:status!=='failed',status,checked,seen,added,verified,reverified,mediaCandidates,completedAt,errors};
}
// The same article reaches us through several search results: a " - 매체명"
// suffix, a desktop and an AMP/mobile URL, or a syndicated copy. Show it once.
export function canonicalArticleUrl(value){
  try{
    const url=new URL(String(value||''));url.hash='';
    url.pathname=url.pathname.replace(/articleViewAmp\.html$/i,'articleView.html').replace(/\/amp(\/|$)/i,'/').replace(/\/mobile\/view\//i,'/view/');
    if(/^m\./i.test(url.hostname))url.hostname=url.hostname.slice(2);
    for(const key of [...url.searchParams.keys()])if(/^(utm_|fbclid|gclid|oc$|ref$)/i.test(key))url.searchParams.delete(key);
    return (url.hostname.replace(/^www\./i,'')+url.pathname.replace(/\/+$/,'')+(url.search||'')).toLowerCase();
  }catch{return''}
}
export function newsTitleKey(title,publisher=''){
  let text=String(title||'').replace(/\s+/g,' ').trim();
  const suffix=text.lastIndexOf(' - ');
  if(suffix>0&&text.length-suffix<=40)text=text.slice(0,suffix);
  if(publisher)text=text.split(String(publisher)).join(' ');
  return text.replace(/[\s"'“”‘’`.,·…!?()\[\]<>《》「」『』:;~\-–—_|/]+/g,'').toLowerCase();
}
export function dedupeSeonamMediNews(items){
  const seenUrls=new Set(),seenTitles=new Set(),out=[];
  for(const item of Array.isArray(items)?items:[]){
    const url=canonicalArticleUrl(item?.resolved_url||item?.url);
    const title=newsTitleKey(item?.title,item?.publisher);
    if((url&&seenUrls.has(url))||(title.length>=8&&seenTitles.has(title)))continue;
    if(url)seenUrls.add(url);if(title.length>=8)seenTitles.add(title);
    out.push(item);
  }
  return out;
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
    const publicItems=dedupeSeonamMediNews(collected).map(item=>({...item,content_match:item.review_state==='verified'?'editor_verified':'source_confirmed'}));
    const recentCandidates=(initialOffset===0?(await env.DB.prepare("SELECT id,title,url,resolved_url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at,media_type,media_url,media_source,media_published_at,media_state,source_type,summary_text,source_verified FROM seonammedi_monitor_items WHERE datetime(last_seen_at)>=datetime('now','-7 days') ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT 160").all()).results||[]:[]);
    const mediaCandidateCount=publicItems.filter(item=>item.media_state==='candidate'&&['photo','video'].includes(item.media_type)).length;
    return json({ok:true,siteOwned:true,aiProvider:false,schedule:'hourly Asia/Seoul',scheduler:'existing-control-cron',channels:{news:true,naverBlog:naverBlogConfigured(env)},lastRun:lastRun||null,mediaCandidateCount,recentCandidateCount:recentCandidates.length,verifiedPublicCount:publicItems.length,items:publicItems,nextCursor:exhausted?null:String(offset),sort:'publication_desc',archive:true},200,'no-store');
  }catch(error){return json({ok:false,error:'monitor_schema_unavailable',message:'사이트 자동점검 저장소 준비 중입니다.',lastRun:null,items:[]},503,'no-store')}
}
