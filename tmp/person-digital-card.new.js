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
  if(!name&&!title&&!description&&!url)return'';
  return `<section class="role-card" aria-label="선택된 역할"><p class="section-label">CURRENT CONTEXT</p>${name?`<h2>${escapeHtml(name)}</h2>`:''}${title?`<p class="role-title">${escapeHtml(title)}</p>`:''}${description?`<p class="role-description">${escapeHtml(description)}</p>`:''}${url?`<a href="${escapeHtml(url)}" rel="noreferrer">관련 사이트 <span aria-hidden="true">↗</span></a>`:''}</section>`;
}
function baseStyles(){
  return `:root{color-scheme:light;--ink:#172f25;--muted:#65756c;--line:#dce5dc;--paper:#fbfcf8;--green:#244d35;--green-soft:#edf4ec}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#edf4ec,#fbfcf8 34%,#fff);color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55;word-break:keep-all}header,main,footer{width:min(720px,calc(100% - 28px));margin-inline:auto}header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}.handle{font-weight:850}.surface{font-size:11px;color:var(--muted)}main{padding:36px 0 54px}.eyebrow,.section-label{margin:0 0 7px;font-size:10px;letter-spacing:.13em;font-weight:850;color:#5e7968}.name{font-size:clamp(38px,8vw,64px);line-height:1.03;letter-spacing:-.045em;margin:0}.headline{margin:14px 0 0;font-size:clamp(18px,4vw,23px);font-weight:720;color:#395344}.bio{white-space:pre-wrap;margin:20px 0 0;color:#53665a}.context-switcher{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:24px 0}.context-chip{display:grid;gap:2px;padding:12px 13px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--ink);text-decoration:none}.context-chip.active{border-color:#6b8f74;background:var(--green-soft)}.context-chip small{font-size:10px;color:var(--muted);font-weight:600}.context-prompt{margin:26px 0;padding:18px;border:1px solid var(--line);border-radius:16px;background:#fff}.context-prompt h2{margin:0;font-size:22px}.context-prompt p{margin:6px 0 0;color:var(--muted)}.actions{display:grid;grid-template-columns:1.1fr 1fr .8fr;gap:8px;margin-top:24px}.actions a,.actions button,.quick,.secondary,.primary{min-height:46px;border-radius:13px;border:1px solid #cad6cc;background:#fff;color:var(--ink);font:inherit;font-weight:800;text-decoration:none;display:flex;align-items:center;justify-content:center;cursor:pointer}.actions .primary,.primary{border-color:var(--green);background:var(--green);color:#fff}.contact-quick{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.quick{min-height:38px;padding:7px 12px;font-size:12px}.role-card,.exchange,.links{margin-top:30px}.role-card{padding:17px;border:1px solid var(--line);border-radius:17px;background:#fff}.role-card h2{font-size:20px;margin:0}.role-title{margin:3px 0 0;font-weight:780;color:#405b4b}.role-description{margin:10px 0 0;color:var(--muted);white-space:pre-wrap}.role-card>a{display:inline-flex;margin-top:9px;color:#2f5a3e;font-weight:800;text-decoration:none}.links{display:grid;gap:8px}.links a{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;color:#2f5a3e;font-weight:800;text-decoration:none}.exchange{padding:18px;border:1px solid var(--line);border-radius:18px;background:#f8faf7}.exchange-head{display:flex;align-items:start;justify-content:space-between;gap:12px}.exchange h2{margin:0;font-size:22px}.exchange-copy{margin:7px 0 16px;color:var(--muted);font-size:13px}.secondary{min-height:38px;padding:7px 11px;font-size:12px}.exchange form{display:grid;gap:10px}.two{display:grid;grid-template-columns:1fr 1fr;gap:9px}label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#486052}input{width:100%;border:1px solid #ccd8cf;border-radius:11px;padding:10px 11px;background:#fff;color:var(--ink);font:inherit;outline:none}input:focus{border-color:#557b61;box-shadow:0 0 0 3px rgba(76,118,92,.11)}.consent{display:flex;align-items:flex-start;gap:8px;font-weight:650;line-height:1.45}.consent input{width:auto;margin-top:3px;accent-color:var(--green)}.exchange-actions{display:flex;align-items:center;gap:10px;margin-top:3px}.exchange-actions .primary{padding:10px 14px}.exchange-actions span{font-size:12px;color:var(--muted)}.exchange-actions span.error{color:#9b3b38}.exchange-actions span.success{color:#2d6942;font-weight:800}.trap{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}footer{padding:18