import { EKODI_SERVICE_MANIFEST, serviceForId, serviceForHost as manifestServiceForHost } from './ekodi-service-manifest.js';

const SHELL_ORIGIN='https://shell.ekodi.kr';
const SHELL_SCRIPT=`${SHELL_ORIGIN}/shell.js`;
const SHELL_WORKSPACE_STYLE=`${SHELL_ORIGIN}/workspace.css`;
const INTERNAL_SURFACES=new Set(['workspace','admin','form','document','data']);
const USER_SURFACES=new Set(['public','workspace']);
const MY_SERVICE_ID='my';
const USER_UI_VERSION='v1';
const MOBILE_FIXED_HEADER_STYLE=`<style data-ekodi-mobile-fixed-header>@media(max-width:768px){:where(.site-header,.topbar,.app-header,.main-header,[data-ekodi-fixed-header],body>header:not(.ekodi-user-ui-fallback-header)){position:fixed!important;top:0!important;left:0!important;right:0!important;width:100%!important;z-index:2147482000!important}:where(body:has(.site-header),body:has(.app-header),body:has(.main-header),body:has([data-ekodi-fixed-header]))::before{content:"";display:block;height:calc(82px + env(safe-area-inset-top,0px));pointer-events:none}}</style>`;
const ADMIN_BOOT_STYLE=`<style data-ekodi-admin-shell-boot>:where(.side-brand,.sidebar-brand,.admin-sidebar-brand,[data-ekodi-admin-sidebar-header],[data-ekodi-admin-brand]){display:none!important}</style>`;
const USER_UI_STYLE=`<style data-ekodi-user-ui-shell-style>
.ekodi-user-ui-fallback-header{position:sticky;top:0;z-index:2147481900;border-bottom:1px solid rgba(23,33,28,.12);background:rgba(250,250,247,.94);backdrop-filter:blur(14px);color:#18251d;font:14px/1.4 system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif}.ekodi-user-ui-fallback-header__inner{width:min(1180px,calc(100% - 32px));min-height:64px;margin:0 auto;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px}.ekodi-user-ui-fallback-header__brand{font-weight:850;letter-spacing:.12em;color:inherit;text-decoration:none}.ekodi-user-ui-fallback-header__context{min-width:0;text-align:center;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ekodi-user-ui-fallback-header__nav{display:flex;align-items:center;gap:12px}.ekodi-user-ui-fallback-header__nav a{color:#315d48;text-decoration:none;font-weight:650}.ekodi-user-ui-fallback-header a:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:4px}
body:has([data-ekodi-user-header-root]:not(.ekodi-user-ui-fallback-header))>.ekodi-user-ui-fallback-header{display:none!important}
.ekodi-user-ui-footer{position:relative;z-index:2;margin-top:32px;border-top:1px solid rgba(23,33,28,.12);background:rgba(250,250,247,.92);backdrop-filter:blur(12px);color:#536158;font:12px/1.65 system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif}
.ekodi-user-ui-footer__inner{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:24px 0 28px;display:grid;gap:7px}.ekodi-user-ui-footer__top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.ekodi-user-ui-footer__brand{font-weight:800;letter-spacing:.12em;color:#18251d}.ekodi-user-ui-footer__links,.ekodi-user-ui-footer__business{display:flex;gap:5px 12px;flex-wrap:wrap}.ekodi-user-ui-footer__links{gap:14px}.ekodi-user-ui-footer a{color:#315d48;text-decoration:none;text-underline-offset:3px}.ekodi-user-ui-footer a:hover,.ekodi-user-ui-footer a:focus-visible{text-decoration:underline}.ekodi-user-ui-footer a:focus-visible{outline:2px solid currentColor;outline-offset:3px}.ekodi-user-ui-footer__address{word-break:keep-all}.ekodi-user-ui-footer__copyright{margin-top:2px;color:#738077}.ekodi-user-ui-footer__scope{margin-top:3px;color:#829087;font-size:11px}
[data-ekodi-legal-footer]:not(.ekodi-user-ui-footer){display:none!important}
@media(prefers-color-scheme:dark){.ekodi-user-ui-fallback-header,.ekodi-user-ui-footer{border-color:rgba(255,255,255,.12);background:rgba(16,21,18,.94);color:#adb9b1}.ekodi-user-ui-fallback-header{color:#edf4ef}.ekodi-user-ui-fallback-header__nav a,.ekodi-user-ui-footer a{color:#9ed0b4}.ekodi-user-ui-footer__brand{color:#edf4ef}.ekodi-user-ui-footer__copyright,.ekodi-user-ui-footer__scope{color:#87958c}}
@media(max-width:640px){.ekodi-user-ui-fallback-header__inner{width:min(100% - 24px,1180px);min-height:58px;grid-template-columns:auto minmax(0,1fr) auto;gap:10px}.ekodi-user-ui-fallback-header__context{font-size:13px}.ekodi-user-ui-fallback-header__nav{font-size:12px}.ekodi-user-ui-footer__inner{width:min(100% - 24px,1180px);padding:20px 0 24px}.ekodi-user-ui-footer__top{align-items:flex-start;flex-direction:column}.ekodi-user-ui-footer__links{gap:8px 12px}.ekodi-user-ui-footer__business{display:grid;gap:2px}}
</style>`;
const USER_UI_FOOTER=`<footer class="ekodi-user-ui-footer" data-ekodi-user-footer="${USER_UI_VERSION}" data-ekodi-legal-footer="user-shell-v1" aria-label="EKODI 운영 및 법적 고지"><div class="ekodi-user-ui-footer__inner"><div class="ekodi-user-ui-footer__top"><strong class="ekodi-user-ui-footer__brand">EKODI</strong><nav class="ekodi-user-ui-footer__links" aria-label="법적 고지"><a href="https://ekodi.kr/privacy">개인정보처리방침</a><a href="https://ekodi.kr/terms">이용약관</a><a href="mailto:ekodibiz@gmail.com">문의</a></nav></div><div class="ekodi-user-ui-footer__business"><span>운영주체 에코디비즈</span><span>대표 정찬균</span><span>사업자등록번호 213-13-01959</span></div><div class="ekodi-user-ui-footer__address">사업장 소재지 전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층 · <a href="mailto:ekodibiz@gmail.com">ekodibiz@gmail.com</a></div><div class="ekodi-user-ui-footer__copyright">© 2026 EKODI · EKODIBIZ. All rights reserved.</div><div class="ekodi-user-ui-footer__scope">독립 운영주체 또는 개별 서비스에 별도 정책이 표시된 경우 해당 정책이 우선 적용됩니다.</div></div></footer>`;
const SPECIAL_HOST_ALIASES=Object.freeze({
  'mall.ekodi.kr':'mall','mall.biz.ekodi.kr':'mall','trade.biz.ekodi.kr':'trade','pay.biz.ekodi.kr':'pay'
});
const ROOT_PATH_SERVICES=Object.freeze((EKODI_SERVICE_MANIFEST.services||[]).flatMap(service=>{
  try{
    const url=new URL(service.url);
    const path=url.pathname.replace(/\/+$/,'')||'/';
    if(url.hostname!=='ekodi.kr'||path==='/')return [];
    return [{path,serviceId:service.id}];
  }catch{return [];}
}).sort((a,b)=>b.path.length-a.path.length));

function extendDirective(csp,name,value){
  const parts=String(csp||'').split(';').map(v=>v.trim()).filter(Boolean);
  const index=parts.findIndex(part=>part===name||part.startsWith(`${name} `));
  if(index<0){parts.push(`${name} 'self' ${value}`);return parts.join('; ')}
  if(!parts[index].split(/\s+/).includes(value))parts[index]=`${parts[index]} ${value}`;
  return parts.join('; ');
}

function shellCsp(csp){
  let next=String(csp||'').trim();
  if(!next)next="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'";
  next=extendDirective(next,'script-src',SHELL_ORIGIN);
  next=extendDirective(next,'style-src',SHELL_ORIGIN);
  next=extendDirective(next,'connect-src',SHELL_ORIGIN);
  return next;
}

function cleanSurface(value){const v=String(value||'').trim().toLowerCase();return /^[a-z-]{1,24}$/.test(v)?v:'';}
function cleanServiceId(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'');}
function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function isMyEkodi(serviceId){return cleanServiceId(serviceId)===MY_SERVICE_ID;}
function defaultSurface(serviceId){return cleanSurface(serviceForId(serviceId)?.defaultSurface)||'public';}
function resolvedSurface(serviceId,surface=''){return cleanSurface(surface)||defaultSurface(serviceId);}
function userSurfaceForService(serviceId){return USER_SURFACES.has(defaultSurface(serviceId));}
function serviceLabel(serviceId){const service=serviceForId(serviceId);return service?.shortName||service?.name||(serviceId==='ekodi'?'EKODI':'');}
function surfaceBootStyle(surface){
  if(surface==='admin')return ADMIN_BOOT_STYLE;
  if(USER_SURFACES.has(surface))return MOBILE_FIXED_HEADER_STYLE;
  return '';
}
function fallbackHeader(serviceId){
  const label=escapeHtml(serviceLabel(cleanServiceId(serviceId)));
  const context=label&&label!=='EKODI'?`<span class="ekodi-user-ui-fallback-header__context">${label}</span>`:'<span class="ekodi-user-ui-fallback-header__context" aria-hidden="true"></span>';
  return `<header class="ekodi-user-ui-fallback-header" data-ekodi-user-header-root="${USER_UI_VERSION}" data-ekodi-user-header-fallback="${USER_UI_VERSION}" role="banner"><div class="ekodi-user-ui-fallback-header__inner"><a class="ekodi-user-ui-fallback-header__brand" href="https://ekodi.kr/" aria-label="EKODI 홈">EKODI</a>${context}<nav class="ekodi-user-ui-fallback-header__nav" aria-label="사용자 계정"><a href="https://my.ekodi.kr/">My EKODI</a></nav></div></header>`;
}

class ShellHtmlInjector{
  constructor(serviceId){this.serviceId=serviceId;}
  element(element){if(!isMyEkodi(this.serviceId))element.setAttribute('data-ekodi-global-nav','off');}
}

class ShellHeadInjector{
  constructor(serviceId,surface){this.serviceId=serviceId;this.surface=surface;}
  element(element){
    const service=cleanServiceId(this.serviceId);
    const surface=resolvedSurface(service,this.surface);
    const sharedStyle=INTERNAL_SURFACES.has(surface)?`<link rel="stylesheet" href="${SHELL_WORKSPACE_STYLE}" data-ekodi-workspace-style>`:'';
    const bootStyle=surfaceBootStyle(surface);
    const visualShellMode=isMyEkodi(service)?'':` data-ekodi-shell="off"`;
    element.prepend(`${bootStyle}${sharedStyle}<script src="${SHELL_SCRIPT}" data-ekodi-service="${service}" data-ekodi-surface="${surface}"${visualShellMode}></script>`,{html:true});
  }
}

class UserUiHtmlInjector{
  constructor(serviceId,surface){this.serviceId=serviceId;this.surface=surface;}
  element(element){
    element.setAttribute('data-ekodi-user-ui',USER_UI_VERSION);
    element.setAttribute('data-ekodi-service',cleanServiceId(this.serviceId)||'ekodi');
    element.setAttribute('data-ekodi-user-surface',resolvedSurface(this.serviceId,this.surface));
  }
}
class UserUiHeadInjector{element(element){element.append(USER_UI_STYLE,{html:true});}}
class UserHeaderAdopter{
  constructor(){this.seen=false;}
  element(element){
    if(this.seen)return;
    this.seen=true;
    element.setAttribute('data-ekodi-user-header-root',USER_UI_VERSION);
    if(!element.getAttribute('role'))element.setAttribute('role','banner');
  }
}
class UserChromeInjector{
  constructor(serviceId){this.serviceId=serviceId;}
  element(element){element.prepend(fallbackHeader(this.serviceId),{html:true});element.append(USER_UI_FOOTER,{html:true});}
}

export function injectEkodiUserUi(response,serviceId='ekodi',surface='public'){
  if(!response)return response;
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  const resolved=resolvedSurface(serviceId,surface);
  if(!contentType.includes('text/html')||!USER_SURFACES.has(resolved))return response;
  const headers=new Headers(response.headers);
  headers.set('x-ekodi-user-ui',USER_UI_VERSION);
  headers.set('x-ekodi-user-ui-surface',resolved);
  const headerAdopter=new UserHeaderAdopter();
  return new HTMLRewriter()
    .on('html',new UserUiHtmlInjector(serviceId,resolved))
    .on('head',new UserUiHeadInjector())
    .on('header',headerAdopter)
    .on('.site-header',headerAdopter)
    .on('.topbar',headerAdopter)
    .on('.app-header',headerAdopter)
    .on('.main-header',headerAdopter)
    .on('[data-ekodi-fixed-header]',headerAdopter)
    .on('body',new UserChromeInjector(serviceId))
    .transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
}

export function injectEkodiShell(response,serviceId,surface=''){
  if(!response||!serviceId)return response;
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  if(!contentType.includes('text/html'))return response;
  const resolved=resolvedSurface(serviceId,surface);
  const headers=new Headers(response.headers);
  headers.set('content-security-policy',shellCsp(headers.get('content-security-policy')));
  headers.set('x-ekodi-shell','v2');
  headers.set('x-ekodi-surface',resolved);
  headers.set('x-ekodi-user-shortcuts',isMyEkodi(serviceId)?'my-only':'hidden');
  const transformed=new HTMLRewriter()
    .on('html',new ShellHtmlInjector(serviceId))
    .on('head',new ShellHeadInjector(serviceId,resolved))
    .transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
  return injectEkodiUserUi(transformed,serviceId,resolved);
}

export function shellServiceForHost(hostname){
  const host=String(hostname||'').trim().toLowerCase();
  if(!host||host==='ekodi.kr'||host==='www.ekodi.kr'||host==='admin.ekodi.kr')return '';
  const alias=SPECIAL_HOST_ALIASES[host];
  if(alias&&userSurfaceForService(alias))return alias;
  const service=manifestServiceForHost(host);
  if(!service||!userSurfaceForService(service.id))return '';
  return service.id;
}

export function shellServiceForRootPath(pathname){
  const path=`/${String(pathname||'/').split('?')[0].split('#')[0].replace(/^\/+|\/+$/g,'')}`.replace(/\/$/,'')||'/';
  for(const entry of ROOT_PATH_SERVICES){
    if((path===entry.path||path.startsWith(`${entry.path}/`))&&userSurfaceForService(entry.serviceId))return entry.serviceId;
  }
  return '';
}

export { SHELL_ORIGIN, SHELL_SCRIPT, SHELL_WORKSPACE_STYLE, USER_UI_VERSION, shellCsp };
