const ALLOWED_KINDS=new Set(['post','notice','event','product','service','article','page']);
const ALLOWED_CHANGEFREQ=new Set(['always','hourly','daily','weekly','monthly','yearly','never']);

function clean(value,max=4000){return String(value??'').trim().slice(0,max)}
function normalizePath(value='/'){
  const raw=clean(value,1200).split('?')[0].split('#')[0]||'/';
  const path=('/'+raw.replace(/^\/+|\/+$/g,'')).replace(/\/{2,}/g,'/');
  return path==='/'?'/':path.replace(/\/$/,'');
}
function html(value=''){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function validPublicPath(pathname=''){
  const path=normalizePath(pathname).toLowerCase();
  if(!path||path==='/')return false;
  if(path.split('/').includes('admin'))return false;
  return !['/api','/auth','/oauth','/my','/workspace-admin','/preview','/_ekodi'].some(prefix=>path===prefix||path.startsWith(prefix+'/'));
}
function validPublicUrl(value=''){
  try{
    const url=new URL(clean(value,1600));
    if(url.protocol!=='https:'||url.hostname!=='ekodi.kr'||url.search||url.hash)return '';
    if(!validPublicPath(url.pathname))return '';
    return url.toString().replace(/\/$/,'');
  }catch{return ''}
}
async function tableExists(db,name){
  if(!db)return false;
  try{
    const row=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();
    return row?.name===name;
  }catch{return false}
}

export async function ensurePublicDiscoveryItemSchema(env){
  const db=env?.DB;if(!db)return false;
  await db.exec(`CREATE TABLE IF NOT EXISTS public_discovery_items (
    content_key TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'page',
    title TEXT NOT NULL DEFAULT '',
    canonical_path TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'public',
    source TEXT NOT NULL DEFAULT 'content-engine',
    published_at TEXT,
    updated_at TEXT NOT NULL,
    changefreq TEXT NOT NULL DEFAULT 'weekly',
    priority TEXT NOT NULL DEFAULT '0.6'
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_public_discovery_path ON public_discovery_items(canonical_path);
  CREATE INDEX IF NOT EXISTS idx_public_discovery_visibility ON public_discovery_items(visibility,site_id,updated_at DESC);`);
  return true;
}

export async function upsertPublicDiscoveryItem(env,item={}){
  if(!await ensurePublicDiscoveryItemSchema(env))throw new Error('public_discovery_db_unavailable');
  const siteId=clean(item.siteId||item.site_id,120).toLowerCase();
  const key=clean(item.key||item.contentKey||item.content_key,220);
  const path=normalizePath(item.path||item.canonicalPath||item.canonical_path);
  if(!siteId||!key||!validPublicPath(path))throw new Error('public_discovery_item_invalid');
  const kind=ALLOWED_KINDS.has(clean(item.kind,40))?clean(item.kind,40):'page';
  const changefreq=ALLOWED_CHANGEFREQ.has(clean(item.changefreq,20))?clean(item.changefreq,20):'weekly';
  const priority=String(Math.max(0,Math.min(1,Number(item.priority??0.6)||0.6)).toFixed(1));
  const visibility=clean(item.visibility,20)==='public'?'public':'hidden';
  const now=new Date().toISOString();
  const updatedAt=clean(item.updatedAt||item.updated_at,80)||now;
  const publishedAt=clean(item.publishedAt||item.published_at,80)||null;
  const imageUrl=clean(item.imageUrl||item.image_url,1600);
  await env.DB.prepare(`INSERT INTO public_discovery_items
    (content_key,site_id,kind,title,canonical_path,description,image_url,visibility,source,published_at,updated_at,changefreq,priority)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(content_key) DO UPDATE SET
      site_id=excluded.site_id,kind=excluded.kind,title=excluded.title,canonical_path=excluded.canonical_path,
      description=excluded.description,image_url=excluded.image_url,visibility=excluded.visibility,source=excluded.source,
      published_at=excluded.published_at,updated_at=excluded.updated_at,changefreq=excluded.changefreq,priority=excluded.priority`)
    .bind(key,siteId,kind,clean(item.title,500),path,clean(item.description,2000),imageUrl,visibility,clean(item.source,120)||'content-engine',publishedAt,updatedAt,changefreq,priority).run();
  return {key,siteId,path,visibility};
}

export async function hidePublicDiscoveryItem(env,key){
  if(!await ensurePublicDiscoveryItemSchema(env))return false;
  const result=await env.DB.prepare("UPDATE public_discovery_items SET visibility='hidden',updated_at=? WHERE content_key=?").bind(new Date().toISOString(),clean(key,220)).run();
  return Number(result?.meta?.changes||0)>0;
}

async function ledgerItems(env){
  if(!env?.DB||!await tableExists(env.DB,'public_discovery_items'))return [];
  try{
    const rows=await env.DB.prepare(`SELECT content_key,site_id,kind,title,canonical_path,description,image_url,source,published_at,updated_at,changefreq,priority
      FROM public_discovery_items WHERE visibility='public' ORDER BY updated_at DESC LIMIT 10000`).all();
    return (rows.results||[]).map(row=>{
      const path=normalizePath(row.canonical_path);const url=validPublicUrl('https://ekodi.kr'+path);
      if(!url)return null;
      return {
        id:'content:'+row.content_key,type:row.kind||'page',siteId:row.site_id||'',name:row.title||path,
        url,path,description:row.description||'',imageUrl:row.image_url||'',source:row.source||'content-engine',
        publishedAt:row.published_at||'',updatedAt:row.updated_at||'',changefreq:row.changefreq||'weekly',priority:row.priority||'0.6'
      };
    }).filter(Boolean);
  }catch{return []}
}

async function seonamNoticeItems(env){
  if(!env?.DB)return [];
  try{
    const rows=await env.DB.prepare(`SELECT id,title,body,notice_kind,published_at,updated_at
      FROM seonammedi_notices WHERE status='published' ORDER BY COALESCE(published_at,updated_at) DESC LIMIT 1000`).all();
    return (rows.results||[]).map(row=>{
      const id=Number(row.id);if(!Number.isInteger(id)||id<=0)return null;
      const kind=row.notice_kind==='event'?'event':'notice';
      const path=`/seonammedi/notices/${id}`;
      return {
        id:`seonammedi:${kind}:${id}`,type:kind,siteId:'seonammedi',name:row.title||'공지사항',
        url:'https://ekodi.kr'+path,path,description:clean(row.body,500),imageUrl:'',source:'seonammedi_notices',
        publishedAt:row.published_at||row.updated_at||'',updatedAt:row.updated_at||row.published_at||'',
        changefreq:kind==='event'?'daily':'weekly',priority:kind==='event'?'0.8':'0.7'
      };
    }).filter(Boolean);
  }catch{return []}
}

export async function collectPublicDiscoveryItems(env){
  const groups=await Promise.all([ledgerItems(env),seonamNoticeItems(env)]);
  const map=new Map();
  for(const item of groups.flat())if(item?.url)map.set(item.url,item);
  return [...map.values()];
}

async function seonamNoticePage(env,id){
  if(!env?.DB)return null;
  const row=await env.DB.prepare(`SELECT id,title,body,notice_kind,published_at,updated_at,image_key,image_keys_json
    FROM seonammedi_notices WHERE id=? AND status='published' LIMIT 1`).bind(id).first().catch(()=>null);
  if(!row)return null;
  const title=clean(row.title,500)||'공지사항';
  const body=clean(row.body,12000);
  const kind=row.notice_kind==='event'?'행사':'공지사항';
  const published=clean(row.published_at||row.updated_at,80);
  const canonical=`https://ekodi.kr/seonammedi/notices/${Number(row.id)}`;
  let imageCount=0;
  try{const keys=JSON.parse(row.image_keys_json||'[]');if(Array.isArray(keys))imageCount=Math.min(5,keys.filter(Boolean).length)}catch{}
  if(!imageCount&&row.image_key)imageCount=1;
  const images=Array.from({length:imageCount},(_,index)=>`<img src="/api/seonammedi/notices/${Number(row.id)}/image/${index}" alt="" loading="lazy">`).join('');
  const date=published?`<time datetime="${html(published)}">${html(published.slice(0,10))}</time>`:'';
  const jsonLd=JSON.stringify({
    '@context':'https://schema.org','@type':kind==='행사'?'Event':'Article',headline:title,url:canonical,
    datePublished:published||undefined,dateModified:clean(row.updated_at,80)||published||undefined,
    publisher:{'@type':'Organization',name:'서남권 국립의대 소통센터',url:'https://ekodi.kr/seonammedi'}
  }).replace(/</g,'\\u003c');
  const page=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(title)} | 서남권 국립의대 소통센터</title><meta name="description" content="${html(body.slice(0,180))}">
<link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:title" content="${html(title)}"><meta property="og:url" content="${canonical}">
<script type="application/ld+json">${jsonLd}</script>
<style>body{margin:0;background:#fff;color:#111;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif}.wrap{max-width:760px;margin:auto;padding:20px 16px 56px}a{color:#111}.back{display:inline-block;margin-bottom:28px;font-weight:800;text-decoration:none}.eyebrow{font-size:12px;font-weight:900;letter-spacing:.08em}.title{font-size:clamp(28px,6vw,46px);line-height:1.18;margin:8px 0 12px}.meta{font-size:13px;color:#555;margin-bottom:28px}.body{white-space:pre-wrap;font-size:17px;line-height:1.8}.images{display:grid;gap:10px;margin:0 0 24px}.images img{width:100%;height:auto;border-radius:12px}.share{margin-top:28px;padding-top:18px;border-top:1px solid #ddd}.share button{border:1px solid #111;background:#fff;color:#111;border-radius:8px;padding:10px 14px;font-weight:800;cursor:pointer}</style></head><body><main class="wrap"><a class="back" href="/seonammedi#notices">← 공지사항 목록</a><div class="eyebrow">${kind}</div><h1 class="title">${html(title)}</h1><div class="meta">${date}</div><div class="images">${images}</div><article class="body">${html(body)}</article><div class="share"><button type="button" id="share">공유</button></div></main><script>document.getElementById('share').onclick=async()=>{const url=location.href,title=document.title;try{if(navigator.share)await navigator.share({title,url});else{await navigator.clipboard.writeText(url);alert('링크를 복사했습니다.')}}catch{}}</script></body></html>`;
  return new Response(page,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=60, stale-while-revalidate=300','x-content-type-options':'nosniff','x-ekodi-route':'public-discovery-content'}});
}

export async function publicDiscoveryContentResponse(request,env){
  const url=new URL(request.url);
  const match=url.pathname.match(/^\/seonammedi\/notices\/(\d+)\/?$/);
  if(match){
    const response=await seonamNoticePage(env,Number(match[1]));
    if(!response)return new Response('Not Found',{status:404,headers:{'content-type':'text/plain; charset=utf-8','x-robots-tag':'noindex'}});
    if(request.method==='HEAD')return new Response(null,{status:response.status,headers:response.headers});
    return response;
  }
  return null;
}
