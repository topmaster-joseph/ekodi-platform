import { EKODI_SERVICE_MANIFEST, serviceForHost, serviceForId, serviceForUrl } from './ekodi-service-manifest.js';
import { EKODI_USER_FOOTER } from './config/user-footer.js';

const USER_SHORTCUT_GUARD=`(()=>{try{if(typeof document==='undefined')return;const current=document.currentScript;const serviceId=String(current?.dataset?.ekodiService||'').trim().toLowerCase();if(serviceId!=='my'){if(current)current.dataset.ekodiShell='off';document.documentElement.dataset.ekodiGlobalNav='off';}}catch{}})();`;
const USER_FOOTER_BOOTSTRAP=`window.__EKODI_USER_FOOTER_CONFIG__=${JSON.stringify(EKODI_USER_FOOTER).replace(/</g,'\\u003c')};`;

function corsHeaders(){return {'access-control-allow-origin':'*','access-control-allow-methods':'GET,HEAD,OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400','x-content-type-options':'nosniff'};}
function json(data,status=200,cache='public, max-age=60, stale-while-revalidate=300'){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':cache,...corsHeaders()}});}
function withHeaders(response){const headers=new Headers(response.headers);headers.set('access-control-allow-origin','*');headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','no-referrer');headers.set('cross-origin-resource-policy','cross-origin');if(!headers.has('cache-control'))headers.set('cache-control','public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
async function bundledShell(request,env){
  const shellUrl=new URL(request.url);shellUrl.pathname='/shell.js';
  const navUrl=new URL(request.url);navUrl.pathname='/user-global-nav.js';
  const contextUrl=new URL(request.url);contextUrl.pathname='/user-context.js';
  const userHeaderUrl=new URL(request.url);userHeaderUrl.pathname='/user-ui-header.js';
  const userFooterUrl=new URL(request.url);userFooterUrl.pathname='/user-ui-footer.js';
  const userLanguageUrl=new URL(request.url);userLanguageUrl.pathname='/user-language.js';
  const ccmMrUrl=new URL(request.url);ccmMrUrl.pathname='/ccm-mr-player.js';
  const adminShellUrl=new URL(request.url);adminShellUrl.pathname='/admin-ui-shell.js';
  const headerUrl=new URL(request.url);headerUrl.pathname='/mobile-fixed-header.js';
  const messageUrl=new URL(request.url);messageUrl.pathname='/message-ui.js';
  const illustrationUrl=new URL(request.url);illustrationUrl.pathname='/illustration-system.js';
  const designInheritanceUrl=new URL(request.url);designInheritanceUrl.pathname='/service-design-inheritance.js';
  const linkCompatUrl=new URL(request.url);linkCompatUrl.pathname='/ecosystem-link-compat.js';
  const [shellResponse,navResponse,contextResponse,userHeaderResponse,userFooterResponse,userLanguageResponse,userCharacterResponse,ccmMrResponse,adminShellResponse,headerResponse,messageResponse,illustrationResponse,designInheritanceResponse,linkCompatResponse]=await Promise.all([
    env.ASSETS.fetch(new Request(shellUrl,request)),
    env.ASSETS.fetch(new Request(navUrl,request)),
    env.ASSETS.fetch(new Request(contextUrl,request)),
    env.ASSETS.fetch(new Request(userHeaderUrl,request)),
    env.ASSETS.fetch(new Request(userFooterUrl,request)),
    env.ASSETS.fetch(new Request(userLanguageUrl,request)),
    env.ASSETS.fetch(new Request(ccmMrUrl,request)),
    env.ASSETS.fetch(new Request(adminShellUrl,request)),
    env.ASSETS.fetch(new Request(headerUrl,request)),
    env.ASSETS.fetch(new Request(messageUrl,request)),
    env.ASSETS.fetch(new Request(illustrationUrl,request)),
    env.ASSETS.fetch(new Request(designInheritanceUrl,request)),
    env.ASSETS.fetch(new Request(linkCompatUrl,request)),
  ]);
  if(!shellResponse.ok)return withHeaders(shellResponse);
  const shell=await shellResponse.text();
  const globalNav=navResponse.ok?await navResponse.text():'';
  const userContext=contextResponse.ok?await contextResponse.text():'';
  const userHeader=userHeaderResponse.ok?await userHeaderResponse.text():'';
  const userFooter=userFooterResponse.ok?await userFooterResponse.text():'';
  const userLanguage=userLanguageResponse.ok?await userLanguageResponse.text():'';
  const ccmMrPlayer=ccmMrResponse.ok?await ccmMrResponse.text():'';
  const adminShell=adminShellResponse.ok?await adminShellResponse.text():'';
  const fixedHeader=headerResponse.ok?await headerResponse.text():'';
  const messageUI=messageResponse.ok?await messageResponse.text():'';
  const illustrationSystem=illustrationResponse.ok?await illustrationResponse.text():'';
  const designInheritance=designInheritanceResponse.ok?await designInheritanceResponse.text():'';
  const linkCompat=linkCompatResponse.ok?await linkCompatResponse.text():'';
  const headers=new Headers(shellResponse.headers);
  headers.set('content-type','application/javascript; charset=utf-8');
  headers.set('cache-control','public, max-age=60, stale-while-revalidate=300');
  headers.set('x-ekodi-user-ui-header',userHeader?'v1':'missing');
  headers.set('x-ekodi-user-ui-footer',userFooter?`v${EKODI_USER_FOOTER.version}`:'missing');
  headers.set('x-ekodi-user-language',userLanguage?'v1':'missing');
  headers.set('x-ekodi-ccm-mr',ccmMrPlayer?'v1':'missing');
  headers.set('x-ekodi-admin-ui-shell',adminShell?'v1':'missing');
  headers.set('x-ekodi-message-ui',messageUI?'v1':'missing');
  headers.set('x-ekodi-illustration-system',illustrationSystem?'v1':'missing');
  headers.set('x-ekodi-service-design',designInheritance?'v1':'missing');
  headers.set('x-ekodi-link-compat',linkCompat?'v1':'missing');
  headers.set('x-ekodi-user-shortcuts','my-only');
  return withHeaders(new Response(`${USER_SHORTCUT_GUARD}\n${USER_FOOTER_BOOTSTRAP}\n${shell}\n${globalNav}\n${userContext}\n${userHeader}\n${userFooter}\n${userLanguage}\n${userCharacter}\n${ccmMrPlayer}\n${adminShell}\n${fixedHeader}\n${messageUI}\n${illustrationSystem}\n${designInheritance}\n${linkCompat}\n`,{status:200,headers}));
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders()});
    if(url.pathname==='/health')return json({ok:true,service:'ekodi-shell',environment:env.ENVIRONMENT||'unknown',manifestVersion:EKODI_SERVICE_MANIFEST.version,shellVersion:EKODI_SERVICE_MANIFEST.shellVersion,userUIHeaderVersion:1,userUIFooterVersion:EKODI_USER_FOOTER.version,userLanguageVersion:1,userCharacterVersion:2,ccmMrVersion:1,adminUIShellVersion:1,messageUIVersion:1,illustrationSystemVersion:1,serviceDesignVersion:3,linkCompatVersion:1,userAccessPolicyVersion:1,identityModel:EKODI_SERVICE_MANIFEST.identityModel,services:EKODI_SERVICE_MANIFEST.services.length},200,'no-store');
    if(url.pathname==='/manifest.json')return json(EKODI_SERVICE_MANIFEST);
    if(url.pathname==='/user-footer.json')return json(EKODI_USER_FOOTER,200,'public, max-age=300, stale-while-revalidate=3600');
    if(url.pathname==='/service'){
      const id=url.searchParams.get('id');
      const canonicalUrl=url.searchParams.get('url');
      const host=url.searchParams.get('host');
      const service=id?serviceForId(id):canonicalUrl?serviceForUrl(canonicalUrl):host?serviceForHost(host):null;
      return service?json(service):json({error:'service_not_found'},404,'no-store');
    }
    if(url.pathname==='/shell.js')return bundledShell(request,env);
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/?source=shell.ekodi.kr',307);
    if(url.pathname==='/')return Response.redirect('https://my.ekodi.kr/',302);
    return withHeaders(await env.ASSETS.fetch(request));
  }
};