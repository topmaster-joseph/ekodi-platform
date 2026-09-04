import legacyPlatformRouter from './platform-router-worker.js';
import financeEntryWorker from './finance-entry-worker.js';
import taxPortalWorker from './tax-portal-worker.js';
import { injectTaxLocalFallback } from './tax-local-fallback.js';
import { injectTaxHometaxLedger } from './tax-hometax-ledger.js';
import { injectTaxBusinessRegistry } from './tax-business-registry.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';
import { messengerUserPage, messengerUiScript } from './messenger-user-page.js';
import { investUserPage, investUiScript } from './invest-user-page.js';
import { investSubjectUiScript } from './invest-subject-ui.js';
import { AI_GATEWAY_HOST, aiGatewayPage, aiGatewayScript, proxyAiGatewayApi } from './ai-gateway-page.js';
import { MAIL_HOST, mailUserPage, handleMailApi } from './mail-user-page.js';
import { mailAdminPage } from './mail-admin-page.js';
import { isWorkspaceAdminPath, workspaceAdminPage, workspaceAdminCss, workspaceAdminScript } from './workspace-admin-page.js';
import { isEkodiBizInvestAdminPath } from './ekodibiz-invest-admin-page.js';
import { workspaceTradeAdminScript } from './workspace-trade-admin-page.js';
import { isTradePartnerPath, tradePartnerPage, tradePartnerCss, tradePartnerScript } from './workspace-trade-portal.js';
import { isPublicWorkspacePath } from './workspace-route-policy.js';

const PUBLIC_HOST='ekodi.kr';
const MESSENGER_HOST='messenger.ekodi.kr';
const INVEST_HOST='invest.ekodi.kr';
const TAX_HOST='tax.ekodi.kr';
const EKODIBIZ_PUBLIC_ROUTE=/^\/ekodibiz\/?$/i;
const EKODIBIZ_ASSET_PREFIX='/_ekodi/ekodibiz/';
const EKODIBIZ_ASSETS=new Set(['style.css']);
const WORKSPACE_ASSET_PREFIX='/_ekodi/space/';
const WORKSPACE_ASSETS=new Set(['style.css','config.js','app.js']);

function resolvedHost(request,env){
  const url=new URL(request.url);
  if(env?.ENVIRONMENT!=='staging')return url.hostname.toLowerCase();
  const simulated=String(request.headers.get('x-ekodi-staging-host')||'').trim().toLowerCase();
  return simulated||url.hostname.toLowerCase();
}

function workspaceServiceUnavailable(){
  return new Response('Workspace service unavailable',{status:503,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-workspace-gateway':'space-binding-unavailable'}});
}
function workspaceUpstreamRequest(request,pathname){
  const url=new URL(request.url);url.pathname=pathname;
  return new Request(url,{method:request.method,headers:request.headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:request.redirect});
}
function rewriteWorkspaceShellAssets(response){
  const rewrite=(element,name)=>{const value=element.getAttribute(name)||'';for(const asset of WORKSPACE_ASSETS){const rootPath=`/${asset}`;if(value===rootPath||value.startsWith(`${rootPath}?`)){element.setAttribute(name,`${WORKSPACE_ASSET_PREFIX}${asset}${value.slice(rootPath.length)}`);break}}};
  return new HTMLRewriter().on('link[href]',{element:e=>rewrite(e,'href')}).on('script[src]',{element:e=>rewrite(e,'src')}).transform(response);
}
function safeWorkspaceReturnTo(value){
  try{const target=new URL(String(value||''));target.hash='';if(target.origin!=='https://ekodi.kr'||!(isPublicWorkspacePath(target.pathname)||EKODIBIZ_PUBLIC_ROUTE.test(target.pathname)||isWorkspaceAdminPath(target.pathname)))return null;return target}catch{return null}
}
function workspaceAuthRedirect(request){
  const url=new URL(request.url);const returnTo=safeWorkspaceReturnTo(url.searchParams.get('return_to'));if(!returnTo)return null;
  const target=new URL('https://auth.ekodi.kr/');target.searchParams.set('site','space');target.searchParams.set('return_to',returnTo.toString());
  return new Response(null,{status:302,headers:{location:target.toString(),'cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-workspace-gateway':'auth-handoff'}});
}
async function routeWorkspaceAsset(request,env){
  if(!env?.SPACE?.fetch)return workspaceServiceUnavailable();
  const url=new URL(request.url);const asset=url.pathname.slice(WORKSPACE_ASSET_PREFIX.length);if(!WORKSPACE_ASSETS.has(asset))return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});
  const upstream=await env.SPACE.fetch(workspaceUpstreamRequest(request,`/${asset}`));const routed=new Response(upstream.body,upstream);routed.headers.set('x-ekodi-workspace-gateway','space-service-binding');return routed;
}
async function routeEkodiBizAsset(request,env){
  if(!env?.EKODIBIZ?.fetch)return workspaceServiceUnavailable();const url=new URL(request.url);const asset=url.pathname.slice(EKODIBIZ_ASSET_PREFIX.length);if(!EKODIBIZ_ASSETS.has(asset))return new Response('Not Found',{status:404});
  const upstream=await env.EKODIBIZ.fetch(workspaceUpstreamRequest(request,`/${asset}`));const out=new Response(upstream.body,upstream);out.headers.set('x-ekodi-workspace-gateway','ekodibiz-service-binding');return out;
}
async function routeEkodiBizPublic(request,env){
  if(!env?.EKODIBIZ?.fetch)return workspaceServiceUnavailable();const upstream=await env.EKODIBIZ.fetch(workspaceUpstreamRequest(request,'/'));const routed=new Response(upstream.body,upstream);routed.headers.set('x-ekodi-workspace-gateway','ekodibiz-service-binding');
  return new HTMLRewriter().on('link[href]',{element:e=>{const v=e.getAttribute('href')||'';if(v==='/style.css'||v.startsWith('/style.css?'))e.setAttribute('href',EKODIBIZ_ASSET_PREFIX+'style.css'+v.slice('/style.css'.length));}}).transform(routed);
}
async function routePublicWorkspace(request,env){
  if(!env?.SPACE?.fetch)return workspaceServiceUnavailable();
  const upstream=await env.SPACE.fetch(request);const routed=new Response(upstream.body,upstream);routed.headers.set('x-ekodi-workspace-gateway','space-service-binding');
  return injectEkodiShell(rewriteWorkspaceShellAssets(routed),'space','workspace');
}

async function routeTaxFinance(request,env,ctx){
  if(env?.FINANCE?.fetch){
    try{
      const response=await env.FINANCE.fetch(request);
      const routed=new Response(response.body,response);
      routed.headers.set('x-ekodi-tax-data-route','finance-service-binding');
      return routed;
    }catch{}
  }
  const response=await financeEntryWorker.fetch(request,env,ctx);
  const fallback=new Response(response.body,response);
  fallback.headers.set('x-ekodi-tax-data-route','local-finance-fallback');
  return fallback;
}

async function withReleaseMarker(response){
  const text=await response.text();
  return new Response(text.replace('</body>','<!-- FUNCTIONAL BETA release compatibility marker; not user-visible --></body>'),{status:response.status,statusText:response.statusText,headers:response.headers});
}
async function withInvestSubjectScript(response){
  const text=await response.text();
  const marker='<script src="/invest-ui.js" defer></script>';
  const patched=text.replace(marker,'<script src="/invest-subject-ui.js" defer></script>'+marker);
  return new Response(patched,{status:response.status,statusText:response.statusText,headers:response.headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const host=resolvedHost(request,env);

    if(host===PUBLIC_HOST){
      if(request.method==='GET'){
        if(url.pathname==='/workspace-admin.css')return workspaceAdminCss();
        if(url.pathname==='/workspace-admin.js')return workspaceAdminScript();
        if(url.pathname==='/workspace-trade-admin.js')return workspaceTradeAdminScript();
        if(url.pathname==='/workspace-trade-portal.css')return tradePartnerCss();
        if(url.pathname==='/workspace-trade-portal.js')return tradePartnerScript();
        if(isTradePartnerPath(url.pathname))return tradePartnerPage();
        if(isWorkspaceAdminPath(url.pathname)&&!isEkodiBizInvestAdminPath(url.pathname))return workspaceAdminPage();
      }
      if(['GET','HEAD'].includes(request.method)&&EKODIBIZ_PUBLIC_ROUTE.test(url.pathname))return routeEkodiBizPublic(request,env);
      if(['GET','HEAD'].includes(request.method)&&url.pathname.startsWith(EKODIBIZ_ASSET_PREFIX))return routeEkodiBizAsset(request,env);
      if(['GET','HEAD'].includes(request.method)&&isPublicWorkspacePath(url.pathname))return routePublicWorkspace(request,env);
      if(['GET','HEAD'].includes(request.method)&&url.pathname.startsWith(WORKSPACE_ASSET_PREFIX))return routeWorkspaceAsset(request,env);
      if(['GET','HEAD'].includes(request.method)&&url.pathname==='/auth/start'){
        const auth=workspaceAuthRedirect(request);if(auth)return auth;
      }
    }

    if(host===TAX_HOST){
      if(url.pathname.startsWith('/api/finance/tax-'))return routeTaxFinance(request,env,ctx);
      const portal=taxPortalWorker.fetch(request,env,ctx);
      if(portal){
        if(url.pathname==='/tax-portal.js'){
          const withFallback=await injectTaxLocalFallback(portal);
          const withLedger=await injectTaxHometaxLedger(withFallback);
          return injectTaxBusinessRegistry(withLedger);
        }
        return portal;
      }
      return new Response('Not Found',{status:404,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
    }

    if(host===AI_GATEWAY_HOST){
      if(request.method==='GET'&&(url.pathname==='/'||url.pathname===''))return aiGatewayPage();
      if(request.method==='GET'&&url.pathname==='/ai-gateway.js')return aiGatewayScript();
      const proxied=await proxyAiGatewayApi(request);
      if(proxied)return proxied;
    }

    if(host===MAIL_HOST){
      const apiResponse=await handleMailApi(request,env);
      if(apiResponse)return apiResponse;
      if(request.method==='GET'&&url.pathname==='/admin')return mailAdminPage();
      if(request.method==='GET'&&(url.pathname==='/'||url.pathname===''))return injectEkodiShell(mailUserPage(),'mail');
    }

    if(host===MESSENGER_HOST&&request.method==='GET'){
      if(url.pathname==='/'||url.pathname===''){
        const response=await withReleaseMarker(messengerUserPage());
        return injectEkodiShell(response,'messenger');
      }
      if(url.pathname==='/messenger-ui.js')return messengerUiScript();
    }

    if(host===INVEST_HOST&&request.method==='GET'){
      if(url.pathname==='/'||url.pathname==='')return injectEkodiShell(await withInvestSubjectScript(investUserPage()),'invest');
      if(url.pathname==='/invest-ui.js')return investUiScript();
      if(url.pathname==='/invest-subject-ui.js')return investSubjectUiScript();
    }
    return legacyPlatformRouter.fetch(request,env,ctx);
  },
};