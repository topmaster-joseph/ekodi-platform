const HANDLE_RE=/^[a-z0-9][a-z0-9._-]{2,39}$/;
const CONTEXT_RE=/^[a-z0-9][a-z0-9_-]{0,39}$/;
const CARD_RE=/^\/([a-z0-9][a-z0-9._-]{2,39})\/card\/?$/;
const VCARD_RE=/^\/([a-z0-9][a-z0-9._-]{2,39})\/card\.vcf$/;
const EXCHANGE_RE=/^\/([a-z0-9][a-z0-9._-]{2,39})\/card\/exchange\/?$/;
const QR_RE=/^\/([a-z0-9][a-z0-9._-]{2,39})\/qr\/?$/;
const MAX_BODY_BYTES=8192;
const encoder=new TextEncoder();

function clean(value,max=1000){return String(value??'').replace(/\0/g,'').trim().slice(0,max)}
function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function safeUrl(value){
  const raw=clean(value,1000);if(!raw)return'';
  try{const url=new URL(raw);return ['https:','http:'].includes(url.protocol)?url.toString():''}catch{return''}
}
function contextFromUrl(url){
  const value=clean(url.searchParams.get('context'),40).toLowerCase();
  return CONTEXT_RE.test(value)?value:'';
}
function dataConfig(env={}){
  const enabled=env.DATA_ENABLED==='true'&&Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);
  return {enabled,url:enabled?String(env.SUPABASE_URL).replace(/\/$/,''):'',key:enabled?String(env.SUPABASE_PUBLISHABLE_KEY):''};
}
function commonHeaders(type='text/html; charset=utf-8'){
  return {
    'content-type':type,
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'x-ekodi-service':'my-ekodi',
    'x-ekodi-surface-context':'person-digital-card',
  };
}
function json(data,status=200,extra={}){
  return new Response(JSON.stringify(data),{status,headers:{...commonHeaders('application/json; charset=utf-8'),'cache-control':'no-store',...extra}});
}
async function shareForHandle(env,handle,context=''){
  const cfg=dataConfig(env);if(!cfg.enabled||!HANDLE_RE.test(handle))return null;
  const response=await fetch(`${cfg.url}/rest/v1/rpc/person_identity_share`,{
    method:'POST',
    headers:{apikey:cfg.key,'content-type':'application/json','cache-control':'no-store'},
    body:JSON.stringify({p_handle:handle,p_context:context||null}),
  });
  if(!response.ok)return null;
  const data=await response.json().catch(()=>null);
  return data?.ok===true?data:null;
}
function publicCardHeaders({found=true,ready=true,qr=false}={}){
  return {
    ...commonHeaders(),
    'cache-control':found?'public, max-age=45, s-maxage=90, stale-while-revalidate=180':'public, max-age=30',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    'x-robots-tag':qr||!found||!ready?'noindex, nofollow, noarchive':'index, follow, max-image-preview:large',
  };
}
function contextHref(handle,key,surface='card'){
  const path=surface==='qr'?`/${encodeURIComponent(handle)}/qr`:`/${encodeURIComponent(handle)}/card`;
  return `${path}?context=${encodeURIComponent(key)}`;
}
function contextsHtml(contexts=[],handle,selectedKey='',surface='card'){
  const items=(Array.isArray(contexts)?contexts:[]).slice(0,20);
  const links=items.map(item=>{
    const key=clean(item?.key,40),label=clean(item?.label,80);
    if(!CONTEXT_RE.test(key)||!label)return'';
    const href=contextHref(handle,key,surface);
    const meta=[clean(item?.role_name,120),clean(item?.role_title,120)].filter(Boolean).join(' · ');
    return `<a class="context-chip${key===selectedKey?' active':''}" href="${escapeHtml(href)}"><strong>${escapeHtml(label)}</strong>${meta?`<small>${escapeHtml(meta)}</small>`:''}</a>`;
  }).filter(Boolean).join('');
  return links?`<nav class="context-switcher" aria-label="공유모드 선택">${links}</nav>`:'';
}
function linksHtml(items=[]){
  const links=(Array.isArray(items)?items:[]).slice(0,20).map(item=>{
    const url=safeUrl(item?.url);if(!url)return'';
    return `<a href="${escapeHtml(url)}" rel="noreferrer"><strong>${escapeHtml(clean(item?.label,120)||new URL(url).hostname)}</strong><span aria-hidden="true">↗</span></a>`;
  }).filter(Boolean);
  return links.length?`<nav class="links" aria-label="관련 링크">${links.join('')}</nav>`:'';
}
function roleHtml(role){
  if(!role||typeof role!=='object')return'';
  const name=clean(role.name,120),title=clean(role.title,120),description=clean(role.description,800),url=safeUrl(role.url);
  if(!name&&!title&&!description&&!url)