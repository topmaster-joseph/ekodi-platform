import { serviceForId } from './ekodi-service-manifest.js';

const SHELL_ORIGIN='https://shell.ekodi.kr';
const SHELL_SCRIPT=`${SHELL_ORIGIN}/shell.js`;
const SHELL_WORKSPACE_STYLE=`${SHELL_ORIGIN}/workspace.css`;
const INTERNAL_SURFACES=new Set(['workspace','admin','form','document','data']);
const USER_SURFACES=new Set(['public','workspace']);
const MY_SERVICE_ID='my';
const USER_UI_VERSION='v1';
const MOBILE_FIXED_HEADER_STYLE=`<style data-ekodi-mobile-fixed-header>@media(max-width:768px){:where(.site-header,.topbar,.app-header,.main-header,[data-ekodi-fixed-header],body>header){position:fixed!important;top:0!important;left:0!important;right:0!important;width:100%!important;z-index:2147482000!important}:where(body:has(.site-header),body:has(.app-header),body:has(.main-header),body:has([data-ekodi-fixed-header]))::before{content:"";display:block;height:calc(82px + env(safe-area-inset-top,0px));pointer-events:none}}</style>`;
const ADMIN_BOOT_STYLE=`<style data-ekodi-admin-shell-boot>:where(.side-brand,.sidebar-brand,.admin-sidebar-brand,[data-ekodi-admin-sidebar-header],[data-ekodi-admin-brand]){display:none!important}</style>`;
const USER_UI_STYLE=`<style data-ekodi-user-ui-shell-style>
.ekodi-user-ui-footer{position:relative;z-index:2;margin-top:32px;border-top:1px solid rgba(23,33,28,.12);background:rgba(250,250,247,.92);backdrop-filter:blur(12px);color:#536158;font:12px/1.65 system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif}
.ekodi-user-ui-footer__inner{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:24px 0 28px;display:grid;gap:7px}.ekodi-user-ui-footer__top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.ekodi-user-ui-footer__brand{font-weight:800;letter-spacing:.12em;color:#18251d}.ekodi-user-ui-footer__links,.ekodi-user-ui-footer__business{display:flex;gap:5px 12px;flex-wrap:wrap}.ekodi-user-ui-footer__links{gap:14px}.ekodi-user-ui-footer a{color:#315d48;text-decoration:none;text-underline-offset:3px}.ekodi-user-ui-footer a:hover,.ekodi-user-ui-footer a:focus-visible{text-decoration:underline}.ekodi-user-ui-footer a:focus-visible{outline:2px solid currentColor;outline-offset:3px}.ekodi-user-ui-footer__address{word-break:keep-all}.ekodi-user-ui-footer__copyright{margin-top:2px;color:#738077}.ekodi-user-ui-footer__scope{margin-top:3px;color:#829087;font-size:11px}
@media(prefers-color-scheme:dark){.ekodi-user-ui-footer{border-color:rgba(255,255,255,.12);background:rgba(16,21,18,.94);color:#adb9b1}.ekodi-user-ui-footer__brand{color:#edf4ef}.ekodi-user-ui-footer a{color:#9ed0b4}.ekodi-user-ui-footer__copyright,.ekodi-user-ui-footer__scope{color:#87958c}}
@media(max-width:640px){.ekodi-user-ui-footer__inner{width:min(100% - 24px,1180px);padding:20px 0 24px}.ekodi-user-ui-footer__top{align-items:flex-start;flex-direction:column}.ekodi-user-ui-footer__links{gap:8px 12px}.ekodi-user-ui-footer__business{display:grid;gap:2px}}
</style>`;
const USER_UI_FOOTER=`<footer class="ekodi-user-ui-footer" data-ekodi-user-footer="${USER_UI_VERSION}" data-ekodi-legal-footer="user-shell-v1" aria-label="EKODI 운영 및 법적 고지"><div class="ekodi-user-ui-footer__inner"><div class="ekodi-user-ui-footer__top"><strong class="ekodi-user-ui-footer__brand">EKODI</strong><nav class="ekodi-user-ui-footer__links" aria-label="법적 고지"><a href="https://ekodi.kr/privacy">개인정보처리방침</a><a href="https://ekodi.kr/terms">이용약관</a><a href="mailto:ekodibiz@gmail.com">문의</a></nav></div><div class="ekodi-user-ui-footer__business"><span>운영주체 에코디비즈</span><span>대표 정찬균</span><span>사업자등록번호 213-13-01959</span></div><div class="ekodi-user-ui-footer__address">사업장 소재지 전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층 · <a href="mailto:ekodibiz@gmail.com">ekodibiz@gmail.com</a></div><div class="ekodi-user-ui-footer__copyright">© 2026 EKODI · EKODIBIZ. All rights reserved.</div><div class="ekodi-user-ui-footer__scope">독립 운영주체 또는 개별 서비스에 별도 정책이 표시된 경우 해당 정책이 우선 적용됩니다.</div></div></footer>`;

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
function isMyEkodi(serviceId){return cleanServiceId(serviceId)===MY_SERVICE_ID;}
function defaultSurface(serviceId){return cleanSurface(serviceForId(serviceId)?.defaultSurface)||'public';}
function resolvedSurface(serviceId,surface=''){return cleanSurface(surface)||defaultSurface(serviceId);}
function surfaceBootStyle(surface){
  if(surface==='admin')return ADMIN_BOOT_STYLE;
  if(USER_SURFACES.has(surface))return MOBILE_FIXED_HEADER_STYLE;
  return '';
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
class UserFooterInjector{element(element){element.append(USER_UI_FOOTER,{html:true});}}

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
    .on('body',new UserFooterInjector())
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
  const host=String(hostname||'').toLowerCase();
  const exact={
    'my.ekodi.kr':'my','management.ekodi.kr':'management','marketing.ekodi.kr':'marketing','community.ekodi.kr':'community','church.ekodi.kr':'church','business.ekodi.kr':'business','biz.ekodi.kr':'biz','work.ekodi.kr':'work','author.ekodi.kr':'author','books.ekodi.kr':'books','lab.ekodi.kr':'lab','social.ekodi.kr':'social','energy.ekodi.kr':'energy','mall.ekodi.kr':'mall','mall.biz.ekodi.kr':'mall','trade.ekodi.kr':'trade','trade.biz.ekodi.kr':'trade','pay.ekodi.kr':'pay','pay.biz.ekodi.kr':'pay','edu.ekodi.kr':'edu','media.ekodi.kr':'media','messenger.ekodi.kr':'messenger','invest.ekodi.kr':'invest','ins.ekodi.kr':'insurance','mail.ekodi.kr':'mail','live.ekodi.kr':'live','cloud.ekodi.kr':'cloud'
  };
  return exact[host]||'';
}

export { SHELL_ORIGIN, SHELL_SCRIPT, SHELL_WORKSPACE_STYLE, USER_UI_VERSION, shellCsp };
