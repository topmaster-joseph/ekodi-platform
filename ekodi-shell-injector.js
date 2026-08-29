import { EKODI_SERVICE_MANIFEST, serviceForId, serviceForHost as manifestServiceForHost } from './ekodi-service-manifest.js';
import { renderEkodiUserFooter } from './config/user-footer.js';

const SHELL_ORIGIN='https://shell.ekodi.kr';
const SHELL_SCRIPT=`${SHELL_ORIGIN}/shell.js`;
const SHELL_WORKSPACE_STYLE=`${SHELL_ORIGIN}/workspace.css`;
const SHELL_USER_UI_STYLE=`${SHELL_ORIGIN}/user-ui-shell.css`;
const INTERNAL_SURFACES=new Set(['workspace','admin','form','document','data']);
const USER_SURFACES=new Set(['public','workspace']);
const SERVICE_OWNED_FOOTER_SERVICES=new Set(['church']);
const MY_SERVICE_ID='my';
const USER_UI_VERSION='v1';
const USER_LAYOUT_VERSION='centered-v1';
const ADMIN_BOOT_STYLE=`<style data-ekodi-admin-shell-boot>:where(.side-brand,.sidebar-brand,.admin-sidebar-brand,[data-ekodi-admin-sidebar-header],[data-ekodi-admin-brand]){display:none!important}</style>`;
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
function serviceOwnsFooter(serviceId){return SERVICE_OWNED_FOOTER_SERVICES.has(cleanServiceId(serviceId));}
function defaultSurface(serviceId){return cleanSurface(serviceForId(serviceId)?.defaultSurface)||'public';}
function resolvedSurface(serviceId,surface=''){return cleanSurface(surface)||defaultSurface(serviceId);}
function userSurfaceForService(serviceId){return USER_SURFACES.has(defaultSurface(serviceId));}
function serviceLabel(serviceId){const service=serviceForId(serviceId);return service?.shortName||service?.name||(serviceId==='ekodi'?'EKODI':'');}
function surfaceBootStyle(surface){
  if(surface==='admin')return ADMIN_BOOT_STYLE;
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
    const service=cleanServiceId(this.serviceId)||'ekodi';
    element.setAttribute('data-ekodi-user-ui',USER_UI_VERSION);
    element.setAttribute('data-ekodi-service',service);
    element.setAttribute('data-ekodi-user-surface',resolvedSurface(this.serviceId,this.surface));
    element.setAttribute('data-ekodi-user-layout',USER_LAYOUT_VERSION);
    if(serviceOwnsFooter(service))element.setAttribute('data-ekodi-footer-mode','service');
  }
}
class UserUiHeadInjector{element(element){element.append(`<link rel="stylesheet" href="${SHELL_USER_UI_STYLE}" data-ekodi-user-ui-style="${USER_UI_VERSION}">`,{html:true});}}
class UserHeaderAdopter{
  constructor(){this.seen=false;}
  element(element){
    if(this.seen)return;
    this.seen=true;
    element.setAttribute('data-ekodi-user-header-root',USER_UI_VERSION);
    if(!element.getAttribute('role'))element.setAttribute('role','banner');
  }
}
class UserCanvasAdopter{
  constructor(){this.seen=false;}
  element(element){
    if(this.seen)return;
    this.seen=true;
    element.setAttribute('data-ekodi-user-canvas',USER_LAYOUT_VERSION);
  }
}
class UserChromeInjector{
  constructor(serviceId){this.serviceId=serviceId;}
  element(element){
    element.prepend(fallbackHeader(this.serviceId),{html:true});
    if(!serviceOwnsFooter(this.serviceId))element.append(renderEkodiUserFooter(),{html:true});
  }
}

export function injectEkodiUserUi(response,serviceId='ekodi',surface='public'){
  if(!response)return response;
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  const resolved=resolvedSurface(serviceId,surface);
  if(!contentType.includes('text/html')||!USER_SURFACES.has(resolved))return response;
  const headers=new Headers(response.headers);
  const csp=headers.get('content-security-policy');
  if(csp)headers.set('content-security-policy',extendDirective(csp,'style-src',SHELL_ORIGIN));
  headers.set('x-ekodi-user-ui',USER_UI_VERSION);
  headers.set('x-ekodi-user-ui-surface',resolved);
  headers.set('x-ekodi-user-layout',USER_LAYOUT_VERSION);
  headers.set('x-ekodi-user-footer',serviceOwnsFooter(serviceId)?'service':'shared');
  const headerAdopter=new UserHeaderAdopter();
  const canvasAdopter=new UserCanvasAdopter();
  return new HTMLRewriter()
    .on('html',new UserUiHtmlInjector(serviceId,resolved))
    .on('head',new UserUiHeadInjector())
    .on('main',canvasAdopter)
    .on('[role="main"]',canvasAdopter)
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

export { SHELL_ORIGIN, SHELL_SCRIPT, SHELL_WORKSPACE_STYLE, SHELL_USER_UI_STYLE, USER_UI_VERSION, USER_LAYOUT_VERSION, shellCsp };
