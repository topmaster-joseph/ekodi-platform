// EKODI-CONTENT-PROTECTION-001 — 단계형 콘텐츠 보호층 (Shared Site edge)
//
// What this layer can and cannot do (kept honest on purpose):
// - A web page cannot prevent OS screenshots, phone cameras or screen recorders.
//   Only hardware-backed EME DRM (see ekodi-media-shield.js) blacks out *video*.
// - What it does: (1) never ships source maps, (2) deters copy/print/save/devtools
//   shortcuts on protected (admin·member·reader) surfaces, (3) blurs the page when the
//   window loses focus (snipping overlays), and (4) stamps a per-request forensic
//   watermark so a leaked capture can be traced back to a request (ray) in the logs.
// - Public promotional pages are left untouched for SEO/AEO, accessibility and
//   payment-review visibility. Inputs, textareas and contenteditable stay copyable.

export const CONTENT_PROTECTION_VERSION='v2';
export const CONTENT_GUARD_SCRIPT_PATH='/__ekodi/content-guard.js';
export const CONTENT_GUARD_STYLE_PATH='/__ekodi/content-guard.css';
const ADMIN_SEGMENT=/(^|\/)admin(?:\/|$)/i;
// Surfaces that hold personal, member-only or paid content.
const PROTECTED_PREFIXES=Object.freeze([
  '/my','/workspace','/work','/mail','/singles','/invest/my','/invest/analysis',
  '/books/read','/books/reader','/books/library','/education/instructor','/edu',
  '/publishing/admin','/live/studio',
]);
const SOURCE_MAP_PATH=/\.(?:js|mjs|css)\.map$/i;
const encoder=new TextEncoder();

function cleanPath(pathname=''){return '/'+String(pathname||'/').split('?')[0].replace(/^\/+/,'');}

export function contentProtectionTier(pathname=''){
  const path=cleanPath(pathname).toLowerCase();
  if(path.startsWith('/__ekodi/')||path.startsWith('/api/'))return 'none';
  if(ADMIN_SEGMENT.test(path))return 'protected';
  for(const prefix of PROTECTED_PREFIXES){
    if(path===prefix||path.startsWith(prefix+'/'))return 'protected';
  }
  return 'public';
}

export function isSourceMapRequest(pathname=''){return SOURCE_MAP_PATH.test(cleanPath(pathname));}

function addSourceToDirective(csp,name,source){
  const parts=String(csp||'').split(';').map(v=>v.trim()).filter(Boolean);
  const index=parts.findIndex(part=>part===name||part.toLowerCase().startsWith(name+' '));
  if(index<0){
    // No explicit directive: default-src governs. Only add one when default-src exists.
    const def=parts.find(part=>part.toLowerCase().startsWith('default-src'));
    if(!def)return parts.join('; ');
    const inherited=def.split(/\s+/).slice(1).filter(token=>token!=="'none'");
    parts.push([name,...inherited,source].join(' '));
    return parts.join('; ');
  }
  const tokens=parts[index].split(/\s+/);
  if(tokens.includes(source)||tokens.includes("'self'"))return parts.join('; ');
  parts[index]=[tokens[0],...tokens.slice(1).filter(token=>token!=="'none'"),source].join(' ');
  return parts.join('; ');
}

export function contentGuardCsp(csp,origin){
  let next=String(csp||'').trim();
  if(!next)return next;
  next=addSourceToDirective(next,'script-src',origin+CONTENT_GUARD_SCRIPT_PATH);
  next=addSourceToDirective(next,'style-src',origin+CONTENT_GUARD_STYLE_PATH);
  return next;
}

async function traceId(request,env){
  const ray=String(request.headers.get('cf-ray')||'')||crypto.randomUUID();
  const secret=String(env?.EKODI_CONTENT_TRACE_SECRET||'');
  const material=`${ray}|${Date.now()}`;
  let bytes;
  if(secret){
    const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(material)));
  }else{
    bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(material)));
  }
  return {ray,trace:[...bytes.slice(0,6)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase()};
}

class GuardHeadInjector{
  constructor(trace){this.trace=trace;}
  element(element){
    element.append(`<link rel="stylesheet" href="${CONTENT_GUARD_STYLE_PATH}?v=${CONTENT_PROTECTION_VERSION}" data-ekodi-content-guard-style="${CONTENT_PROTECTION_VERSION}"><script src="${CONTENT_GUARD_SCRIPT_PATH}?v=${CONTENT_PROTECTION_VERSION}" defer data-ekodi-content-guard="${CONTENT_PROTECTION_VERSION}" data-ekodi-trace="${this.trace}"></script>`,{html:true});
  }
}
class GuardHtmlMarker{
  constructor(trace){this.trace=trace;}
  element(element){element.setAttribute('data-ekodi-content-guard',CONTENT_PROTECTION_VERSION);element.setAttribute('data-ekodi-trace',this.trace);}
}

/**
 * Applied to every Shared Site response before the platform security headers.
 * Never throws: protection failures must not take a page down.
 */
export async function applyContentProtection(response,request,env={}){
  if(!response)return response;
  try{
    const headers=new Headers(response.headers);
    // Source maps are never published, even if a build accidentally emits one.
    headers.delete('SourceMap');
    headers.delete('X-SourceMap');
    const url=new URL(request.url);
    const tier=contentProtectionTier(url.pathname);
    const type=String(headers.get('content-type')||'').toLowerCase();
    const method=String(request.method||'GET').toUpperCase();
    if(tier!=='protected'||!type.includes('text/html')||method!=='GET'||response.status>=300
      ||headers.get('x-ekodi-content-guard')===CONTENT_PROTECTION_VERSION){
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }
    const {ray,trace}=await traceId(request,env);
    headers.set('x-ekodi-content-guard',CONTENT_PROTECTION_VERSION);
    headers.set('x-ekodi-trace',trace);
    // Protected documents are never stored. Keep an existing no-store value verbatim:
    // release verifiers and owner-frozen holds match the exact upstream directive.
    if(!String(headers.get('Cache-Control')||'').toLowerCase().includes('no-store'))headers.set('Cache-Control','no-store');
    const robots=String(headers.get('X-Robots-Tag')||'').split(',').map(v=>v.trim()).filter(Boolean);
    if(!robots.includes('noarchive')){
      for(const directive of ['noindex','noarchive','nosnippet'])if(!robots.includes(directive))robots.push(directive);
      headers.set('X-Robots-Tag',robots.join(', '));
    }
    const csp=headers.get('content-security-policy');
    if(csp)headers.set('content-security-policy',contentGuardCsp(csp,url.origin));
    console.info('EKODI content guard trace',{trace,ray,path:url.pathname});
    const base=new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    if(typeof HTMLRewriter!=='function')return base;
    return new HTMLRewriter().on('html',new GuardHtmlMarker(trace)).on('head',new GuardHeadInjector(trace)).transform(base);
  }catch(error){
    console.error('EKODI content protection skipped',error);
    return response;
  }
}

// ---------------------------------------------------------------- client asset
// Served as text; kept as a real function so `node --check` and tests parse it.
// Plain string on purpose: bundlers (wrangler keep_names) inject helpers such as __name()
// into function bodies, so Function.prototype.toString() would ship code that cannot run in a browser.
const CONTENT_GUARD_CLIENT_SOURCE=String.raw`function contentGuardClient(){
  'use strict';
  var doc=document,root=doc.documentElement;
  if(root.getAttribute('data-ekodi-content-guard-ready'))return;
  root.setAttribute('data-ekodi-content-guard-ready','1');
  var tag=doc.querySelector('script[data-ekodi-content-guard]');
  var trace=(tag&&tag.getAttribute('data-ekodi-trace'))||root.getAttribute('data-ekodi-trace')||'EKODI';
  function editable(node){
    for(var el=node&&node.nodeType===1?node:node&&node.parentElement;el;el=el.parentElement){
      var name=el.tagName;
      if(name==='INPUT'||name==='TEXTAREA'||name==='SELECT'||el.isContentEditable||el.hasAttribute('data-ekodi-allow-copy'))return true;
    }
    return false;
  }
  function block(event){if(!editable(event.target)){event.preventDefault();return false;}}
  ['contextmenu','copy','cut','dragstart','selectstart'].forEach(function(type){doc.addEventListener(type,block,true);});
  var shield=null,timer=0;
  // 관리자 문서 편집기의 [인쇄]처럼 페이지가 명시적으로 허용한 인쇄는 막지 않는다(body.ekodi-allow-print).
  function printAllowed(){return Boolean(doc.body&&doc.body.classList.contains('ekodi-allow-print'));}
  function showShield(ms){
    if(printAllowed())return;
    root.classList.add('ekodi-cg-shielded');
    clearTimeout(timer);
    if(ms)timer=setTimeout(hideShield,ms);
  }
  function hideShield(){root.classList.remove('ekodi-cg-shielded');}
  doc.addEventListener('keydown',function(event){
    var key=String(event.key||'').toLowerCase(),mod=event.ctrlKey||event.metaKey;
    var devtools=key==='f12'||(mod&&event.shiftKey&&(key==='i'||key==='j'||key==='c'))||(event.metaKey&&event.altKey&&(key==='i'||key==='j'||key==='c'));
    var sourceOrSave=mod&&!event.shiftKey&&(key==='u'||key==='s'||key==='p');
    if(devtools||(sourceOrSave&&!editable(event.target))){event.preventDefault();event.stopPropagation();showShield(800);}
  },true);
  doc.addEventListener('keyup',function(event){
    if(String(event.key||'')==='PrintScreen'){
      showShield(1500);
      try{navigator.clipboard&&navigator.clipboard.writeText&&navigator.clipboard.writeText('EKODI 보호 화면 — 추적코드 '+trace).catch(function(){});}catch(e){}
    }
  },true);
  // Snipping overlays (e.g. Win+Shift+S) take window focus: blur the page meanwhile.
  window.addEventListener('blur',function(){
    setTimeout(function(){
      var active=doc.activeElement;
      if(active&&active.tagName==='IFRAME')return; // focus moved into an embedded admin frame
      showShield(0);
    },0);
  });
  window.addEventListener('focus',hideShield);
  doc.addEventListener('visibilitychange',function(){if(doc.visibilityState==='hidden')showShield(0);else hideShield();});
  window.addEventListener('beforeprint',function(){showShield(0);});
  window.addEventListener('afterprint',hideShield);
  // Forensic watermark: low-contrast, non-interactive, re-attached if removed.
  function stamp(){
    var now=new Date();
    var when=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0')+' '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
    var who='';
    try{var user=window.EKODI_USER||window.__EKODI_USER__;if(user&&user.email){var parts=String(user.email).split('@');who=parts[0].slice(0,2)+'***@'+(parts[1]||'');}}catch(e){}
    var text=('EKODI '+trace+' '+when+' '+who).trim().replace(/[<&>"']/g,'');
    var svg='<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="10" y="110" transform="rotate(-24 180 100)" font-family="sans-serif" font-size="14" fill="rgba(110,110,110,0.13)">'+text+'</text></svg>';
    return 'url("data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)+'")';
  }
  function ensureMark(){
    if(!doc.body)return;
    if(!shield||!shield.isConnected){
      shield=doc.createElement('div');
      shield.className='ekodi-cg-watermark';
      shield.setAttribute('aria-hidden','true');
      doc.body.appendChild(shield);
    }
    shield.style.backgroundImage=stamp();
  }
  function start(){
    ensureMark();
    setInterval(ensureMark,60000);
    try{new MutationObserver(function(){if(!shield||!shield.isConnected)ensureMark();}).observe(doc.body,{childList:true});}catch(e){}
  }
  if(doc.body)start();else doc.addEventListener('DOMContentLoaded',start);
}`;

export const CONTENT_GUARD_SCRIPT=`/* EKODI content guard ${CONTENT_PROTECTION_VERSION} */(${CONTENT_GUARD_CLIENT_SOURCE})();`;

export const CONTENT_GUARD_STYLE=`/* EKODI content guard ${CONTENT_PROTECTION_VERSION} */
html[data-ekodi-content-guard] body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
html[data-ekodi-content-guard] :is(input,textarea,select,[contenteditable],[contenteditable] *,[data-ekodi-allow-copy],[data-ekodi-allow-copy] *){-webkit-user-select:text;user-select:text}
html[data-ekodi-content-guard] img,html[data-ekodi-content-guard] video{-webkit-user-drag:none}
.ekodi-cg-watermark{position:fixed;inset:0;pointer-events:none;z-index:2147483646;background-repeat:repeat}
html.ekodi-cg-shielded body>*:not(.ekodi-cg-watermark){filter:blur(18px)!important;transition:filter .08s}
@media print{html[data-ekodi-content-guard] body:not(.ekodi-allow-print)>*{display:none!important}html[data-ekodi-content-guard] body:not(.ekodi-allow-print)::after{content:"EKODI 보호 화면은 인쇄할 수 없습니다.";display:block;padding:40px;font:16px sans-serif}}
`;

const ASSET_HEADERS=type=>({
  'content-type':type,
  'cache-control':'public, max-age=600',
  'x-content-type-options':'nosniff',
  'x-ekodi-route':'content-guard-asset',
});

/** Early router hook: serves the guard assets and refuses any source map. */
export function contentProtectionAssetResponse(request){
  const method=String(request.method||'GET').toUpperCase();
  if(method!=='GET'&&method!=='HEAD')return null;
  const path=cleanPath(new URL(request.url).pathname);
  const body=text=>method==='HEAD'?null:text;
  if(path===CONTENT_GUARD_SCRIPT_PATH)return new Response(body(CONTENT_GUARD_SCRIPT),{status:200,headers:ASSET_HEADERS('text/javascript; charset=utf-8')});
  if(path===CONTENT_GUARD_STYLE_PATH)return new Response(body(CONTENT_GUARD_STYLE),{status:200,headers:ASSET_HEADERS('text/css; charset=utf-8')});
  if(isSourceMapRequest(path))return new Response(body('Not found'),{status:404,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600','x-ekodi-route':'source-map-denied'}});
  return null;
}
