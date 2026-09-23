const API_PATH='/api/seonam-medi/monitor';
const MAX_ITEMS_PER_QUERY=20;
const RECENT_DAYS=7;
const MEDIA_ENRICH_LIMIT=8;
const RSS_MAX_ATTEMPTS=3;
const RETRYABLE_STATUS=new Set([429,500,502,503,504]);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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
async function fetchRss(query){
  let lastStatus=0;
  for(let attempt=1;attempt<=RSS_MAX_ATTEMPTS;attempt+=1){
    const response=await fetch(rssUrl(query),{headers:{'user-agent':'EKODI-SeonamMedi-Monitor/1.2','accept':'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.1'},cf:{cacheTtl:0,cacheEverything:false}});
    if(response.ok)return response.text();
    lastStatus=response.status;
    if(!RETRYABLE_STATUS.has(response.status)||attempt===RSS_MAX_ATTEMPTS)break;
    await wait(300*attempt);
  }
  throw new Error('HTTP '+lastStatus);
}
function parseRss(xml,key,label){
  const now=Date.now(),floor=now-RECENT_DAYS*86400000;
  return [...String(xml||'').matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,MAX_ITEMS_PER_QUERY).map(match=>{
    const block=match[1];const title=tag(block,'title');const url=tag(block,'link');const publishedRaw=tag(block,'pubDate');const publisher=sourceTag(block)||'Google News';const publishedMs=Date.parse(publishedRaw);
    return {queryKey:key,queryLabel:label,title,url,publisher,publishedAt:Number.isFinite(publishedMs)?new Date(publishedMs).toISOString():null,publishedMs,resolvedUrl:'',mediaType:'',mediaUrl:'',mediaSource:'',mediaPublishedAt:'',mediaState:'none'};
  }).filter(item=>item.title&&/^https:\/\//i.test(item.url)&&(!Number.isFinite(item.publishedMs)||item.publishedMs>=floor));
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
    const video=metaValue(html,'og:video:secure_url')||metaValue(html,'og:video:url')||metaValue(html,'og:video')||metaValue(html,'twitter:player');
    const image=metaValue(html,'og:image:secure_url')||metaValue(html,'og:image')||metaValue(html,'twitter:image');
    const mediaType=video?'video':image?'photo':'';
    const mediaUrl=httpsUrl(video||image,resolvedUrl);
    const mediaPublishedAt=metaValue(html,'article:published_time')||metaValue(html,'datePublished')||item.publishedAt||'';
    return {...item,resolvedUrl,mediaType:mediaType&&mediaUrl?mediaType:'',mediaUrl:mediaUrl||'',mediaSource:item.publisher||new URL(resolvedUrl).hostname,mediaPublishedAt:clean(mediaPublishedAt,80),mediaState:mediaType&&mediaUrl?'candidate':'none'};
  }catch{return item}
}
async function insertItem(env,item,seenAt){
  const fingerprint=await digest(item.title+'\n'+item.url);
  const existing=await env.DB.prepare('SELECT id FROM seonam_medi_monitor_items WHERE fingerprint=? LIMIT 1').bind(fingerprint).first();
  if(existing?.id){
    await env.DB.prepare('UPDATE seonam_medi_monitor_items SET last_seen_at=?,publisher=?,published_at=COALESCE(?,published_at),query_key=?,query_label=?,resolved_url=CASE WHEN ?<>\'\' THEN ? ELSE resolved_url END,media_type=CASE WHEN ?<>\'\' THEN ? ELSE media_type END,media_url=CASE WHEN ?<>\'\' THEN ? ELSE media_url END,media_source=CASE WHEN ?<>\'\' THEN ? ELSE media_source END,media_published_at=CASE WHEN ?<>\'\' THEN ? ELSE media_published_at END,media_state=CASE WHEN ?=\'candidate\' THEN \'candidate\' ELSE media_state END WHERE id=?')
      .bind(seenAt,item.publisher,item.publishedAt,item.queryKey,item.queryLabel,item.resolvedUrl,item.resolvedUrl,item.mediaType,item.mediaType,item.mediaUrl,item.mediaUrl,item.mediaSource,item.mediaSource,item.mediaPublishedAt,item.mediaPublishedAt,item.mediaState,existing.id).run();
    return false;
  }
  await env.DB.prepare("INSERT INTO seonam_medi_monitor_items (fingerprint,title,url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at,resolved_url,media_type,media_url,media_source,media_published_at,media_state) VALUES (?,?,?,?,?,?,?,'source_only',?,?,?,?,?,?,?,?)")
    .bind(fingerprint,item.title,item.url,item.publisher,item.publishedAt,item.queryKey,item.queryLabel,seenAt,seenAt,item.resolvedUrl,item.mediaType,item.mediaUrl,item.mediaSource,item.mediaPublishedAt,item.mediaState).run();
  return true;
}
export async function runSeonamMediDailyCheck(env,{scheduledAt=null,force=false}={}){
  if(!env?.DB?.prepare)return {ok:false,error:'storage_unavailable'};
  const startedAt=new Date(scheduledAt||Date.now()).toISOString();let runId=null;let checked=0,seen=0,added=0,mediaCandidates=0,mediaBudget=MEDIA_ENRICH_LIMIT;const errors=[];
  if(!force){
    try{
      const existing=await env.DB.prepare("SELECT id,status,completed_at FROM seonam_medi_monitor_runs WHERE date(datetime(started_at,'+9 hours'))=date(datetime(?,'+9 hours')) AND status IN ('running','ok','partial') ORDER BY id DESC LIMIT 1").bind(startedAt).first();
      if(existing?.id)return {ok:true,status:'already_checked',skipped:true,runId:existing.id,completedAt:existing.completed_at||null};
    }catch(error){
      const message=clean(error?.message||error,300);
      if(!/no such table|no such column/i.test(message))return {ok:false,error:'daily_guard_failed',message};
    }
  }
  try{
    const run=await env.DB.prepare("INSERT INTO seonam_medi_monitor_runs(started_at,status,sources_checked,items_seen,new_items,error_summary) VALUES (?,'running',0,0,0,'')").bind(startedAt).run();
    runId=run?.meta?.last_row_id||null;
  }catch(error){return {ok:false,error:'schema_unavailable',message:clean(error?.message,300)}}
  for(const query of QUERIES){
    try{
      const items=parseRss(await fetchRss(query.q),query.key,query.label);checked+=1;seen+=items.length;
      for(let item of items){
        if(mediaBudget>0){item=await enrichMedia(item);mediaBudget-=1;if(item.mediaState==='candidate')mediaCandidates+=1}
        if(await insertItem(env,item,startedAt))added+=1;
      }
    }catch(error){errors.push(query.key+':'+clean(error?.message||error,160))}
  }
  const completedAt=new Date().toISOString();const status=errors.length?(checked?'partial':'failed'):'ok';
  await env.DB.prepare('UPDATE seonam_medi_monitor_runs SET completed_at=?,status=?,sources_checked=?,items_seen=?,new_items=?,error_summary=? WHERE id=?')
    .bind(completedAt,status,checked,seen,added,clean(errors.join(' | '),1000),runId).run().catch(()=>{});
  return {ok:status!=='failed',status,checked,seen,added,mediaCandidates,completedAt,errors};
}
export async function handleSeonamMediMonitorApi(request,env){
  const url=new URL(request.url);if(url.pathname!==API_PATH)return null;
  if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405,'no-store');
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable',lastRun:null,items:[]},503,'no-store');
  try{
    const [lastRun,rows,mediaCount]=await Promise.all([
      env.DB.prepare('SELECT id,started_at,completed_at,status,sources_checked,items_seen,new_items,error_summary FROM seonam_medi_monitor_runs ORDER BY id DESC LIMIT 1').first(),
      env.DB.prepare("SELECT title,url,resolved_url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at,media_type,media_url,media_source,media_published_at,media_state FROM seonam_medi_monitor_items WHERE datetime(last_seen_at)>=datetime('now','-7 days') ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT 24").all(),
      env.DB.prepare("SELECT count(*) AS count FROM seonam_medi_monitor_items WHERE datetime(last_seen_at)>=datetime('now','-7 days') AND media_state='candidate' AND media_type IN ('photo','video')").first()
    ]);
    return json({ok:true,siteOwned:true,aiProvider:false,schedule:'daily 08:00 Asia/Seoul',scheduler:'existing-control-cron',lastRun:lastRun||null,mediaCandidateCount:Number(mediaCount?.count||0),items:rows?.results||[]});
  }catch(error){return json({ok:false,error:'monitor_schema_unavailable',message:'사이트 자동점검 저장소 준비 중입니다.',lastRun:null,items:[]},503,'no-store')}
}
