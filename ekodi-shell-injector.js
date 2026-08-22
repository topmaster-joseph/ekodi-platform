import { serviceForId } from './ekodi-service-manifest.js';

const SHELL_ORIGIN='https://shell.ekodi.kr';
const SHELL_SCRIPT=`${SHELL_ORIGIN}/shell.js`;
const SHELL_WORKSPACE_STYLE=`${SHELL_ORIGIN}/workspace.css`;
const INTERNAL_SURFACES=new Set(['workspace','admin','form','document','data']);
const MOBILE_FIXED_HEADER_STYLE=`<style data-ekodi-mobile-fixed-header>@media(max-width:768px){:where(.site-header,.topbar,.app-header,.main-header,[data-ekodi-fixed-header],body>header){position:fixed!important;top:0!important;left:0!important;right:0!important;width:100%!important;z-index:2147482000!important}:where(body:has(.site-header),body:has(.app-header),body:has(.main-header),body:has([data-ekodi-fixed-header]))::before{content:"";display:block;height:calc(82px + env(safe-area-inset-top,0px));pointer-events:none}}</style>`;

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
function defaultSurface(serviceId){return cleanSurface(serviceForId(serviceId)?.defaultSurface)||'public';}

class HeadInjector{
  constructor(serviceId,surface){this.serviceId=serviceId;this.surface=surface;}
  element(element){
    const service=String(this.serviceId||'').replace(/[^a-z0-9-]/g,'');
    const surface=cleanSurface(this.surface)||defaultSurface(service);
    const sharedStyle=INTERNAL_SURFACES.has(surface)?`<link rel="stylesheet" href="${SHELL_WORKSPACE_STYLE}" data-ekodi-workspace-style>`:'';
    element.prepend(`${MOBILE_FIXED_HEADER_STYLE}${sharedStyle}<script src="${SHELL_SCRIPT}" data-ekodi-service="${service}" data-ekodi-surface="${surface}"></script>`,{html:true});
  }
}

export function injectEkodiShell(response,serviceId,surface=''){
  if(!response||!serviceId)return response;
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  if(!contentType.includes('text/html'))return response;
  const headers=new Headers(response.headers);
  headers.set('content-security-policy',shellCsp(headers.get('content-security-policy')));
  headers.set('x-ekodi-shell','v2');
  headers.set('x-ekodi-surface',cleanSurface(surface)||defaultSurface(serviceId));
  const transformed=new HTMLRewriter().on('head',new HeadInjector(serviceId,surface)).transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
  return transformed;
}

export function shellServiceForHost(hostname){
  const host=String(hostname||'').toLowerCase();
  const exact={
    'my.ekodi.kr':'my','marketing.ekodi.kr':'marketing','community.ekodi.kr':'community','church.ekodi.kr':'church','business.ekodi.kr':'business','biz.ekodi.kr':'biz','work.ekodi.kr':'work','author.ekodi.kr':'author','books.ekodi.kr':'books','lab.ekodi.kr':'lab','social.ekodi.kr':'social','energy.ekodi.kr':'energy','mall.ekodi.kr':'mall','mall.biz.ekodi.kr':'mall','trade.ekodi.kr':'trade','trade.biz.ekodi.kr':'trade','pay.ekodi.kr':'pay','pay.biz.ekodi.kr':'pay','edu.ekodi.kr':'edu','media.ekodi.kr':'media','messenger.ekodi.kr':'messenger','invest.ekodi.kr':'invest','ins.ekodi.kr':'insurance','mail.ekodi.kr':'mail','live.ekodi.kr':'live','cloud.ekodi.kr':'cloud'
  };
  return exact[host]||'';
}

export { SHELL_ORIGIN, SHELL_SCRIPT, SHELL_WORKSPACE_STYLE, shellCsp };
