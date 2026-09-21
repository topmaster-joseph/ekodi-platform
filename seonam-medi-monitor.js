const API_PATH='/api/seonam-medi/monitor';
const MAX_ITEMS_PER_QUERY=20;
const RECENT_DAYS=7;
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
function rssUrl(query){const q=encodeURIComponent(query);return `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`}
function parseRss(xml,key,label){
  const now=Date.now(),floor=now-RECENT_DAYS*86400000;
  return [...String(xml||'').matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,MAX_ITEMS_PER_QUERY).map(match=>{
    const block=match[1];const title=tag(block,'title');const url=tag(block,'link');const publishedRaw=tag(block,'pubDate');const publisher=sourceTag(block)||'Google News';const publishedMs=Date.parse(publishedRaw);
    return {queryKey:key,queryLabel:label,title,url,publisher,publishedAt:Number.isFinite(publishedMs)?new Date(publishedMs).toISOString():null,publishedMs};
  }).filter(item=>item.title&&/^https:\/\//i.test(item.url)&&(!Number.isFinite(item.publishedMs)||item.publishedMs>=floor));
}
async function insertItem(env,item,seenAt){
  const fingerprint=await digest(`${item.title}\n${item.url}`);
  const existing=await env.DB.prepare('SELECT id FROM seonam_medi_monitor_items WHERE fingerprint=? LIMIT 1').bind(fingerprint).first();
  if(existing?.id){
    await env.DB.prepare('UPDATE seonam_medi_monitor_items SET last_seen_at=?,publisher=?,published_at=COALESCE(?,published_at),query_key=?,query_label=? WHERE id=?')
      .bind(seenAt,item.publisher,item.publishedAt,item.queryKey,item.queryLabel,existing.id).run();
    return false;
  }
  await env.DB.prepare(`INSERT INTO seonam_medi_monitor_items
    (fingerprint,title,url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at)
    VALUES (?,?,?,?,?,?,?,'source_only',?,?)`)
    .bind(fingerprint,item.title,item.url,item.publisher,item.publishedAt,item.queryKey,item.queryLabel,seenAt,seenAt).run();
  return true;
}
export async function runSeonamMediDailyCheck(env){
  if(!env?.DB?.prepare)return {ok:false,error:'storage_unavailable'};
  const startedAt=new Date().toISOString();let runId=null;let checked=0,seen=0,added=0;const errors=[];
  try{
    const run=await env.DB.prepare(`INSERT INTO seonam_medi_monitor_runs(started_at,status,sources_checked,items_seen,new_items,error_summary)
      VALUES (?,'running',0,0,0,'')`).bind(startedAt).run();
    runId=run?.meta?.last_row_id||null;
  }catch(error){return {ok:false,error:'schema_unavailable',message:clean(error?.message,300)}}
  for(const query of QUERIES){
    try{
      const response=await fetch(rssUrl(query.q),{headers:{'user-agent':'EKODI-SeonamMedi-Monitor/1.0'},cf:{cacheTtl:0,cacheEverything:false}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const items=parseRss(await response.text(),query.key,query.label);checked+=1;seen+=items.length;
      for(const item of items){if(await insertItem(env,item,startedAt))added+=1}
    }catch(error){errors.push(`${query.key}:${clean(error?.message||error,160)}`)}
  }
  const completedAt=new Date().toISOString();const status=errors.length?(checked?'partial':'failed'):'ok';
  await env.DB.prepare(`UPDATE seonam_medi_monitor_runs SET completed_at=?,status=?,sources_checked=?,items_seen=?,new_items=?,error_summary=? WHERE id=?`)
    .bind(completedAt,status,checked,seen,added,clean(errors.join(' | '),1000),runId).run().catch(()=>{});
  return {ok:status!=='failed',status,checked,seen,added,completedAt,errors};
}
export async function handleSeonamMediMonitorApi(request,env){
  const url=new URL(request.url);if(url.pathname!==API_PATH)return null;
  if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405,'no-store');
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable',lastRun:null,items:[]},503,'no-store');
  try{
    const [lastRun,rows]=await Promise.all([
      env.DB.prepare('SELECT id,started_at,completed_at,status,sources_checked,items_seen,new_items,error_summary FROM seonam_medi_monitor_runs ORDER BY id DESC LIMIT 1').first(),
      env.DB.prepare(`SELECT title,url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at
        FROM seonam_medi_monitor_items WHERE datetime(last_seen_at)>=datetime('now','-7 days')
        ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT 24`).all()
    ]);
    return json({ok:true,siteOwned:true,aiProvider:false,schedule:'daily 08:00 Asia/Seoul',lastRun:lastRun||null,items:rows?.results||[]});
  }catch(error){return json({ok:false,error:'monitor_schema_unavailable',message:'사이트 자동점검 저장소 준비 중입니다.',lastRun:null,items:[]},503,'no-store')}
}
