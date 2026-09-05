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
import { isStoreAdminPathShape, resolveStoreAdminRoute, storeAdminPage, storeAdminCss, storeAdminScript } from './store-admin-engine.js';
import { churchPastorAdminPage, churchPastorAdminScript, isChurchPastorAdminPath } from './church-pastor-admin-page.js';
import { isEkodiBizInvestAdminPath } from './ekodibiz-invest-admin-page.js';
import { workspaceTradeAdminScript } from './workspace-trade-admin-page.js';
import { isTradePartnerPath, tradePartnerPage, tradePartnerCss, tradePartnerScript } from './workspace-trade-portal.js';
import { isPublicWorkspacePath } from './workspace-route-policy.js';
import { marketingProjectionForPath, proxyCanonicalMarketing } from './marketing-canonical-projection.js';

const PUBLIC_HOST='ekodi.kr';
const CGMA_HOSTS=new Set(['cgma.or.kr','www.cgma.or.kr']);
const CGMA_SITE=Object.freeze({
  id:'cgma',
  workspaceId:'cgma',
  domain:'cgma.or.kr',
  title:'현재 사이트 개발중입니다',
  message:'더 좋은 서비스로 준비 중입니다.'
});
const MESSENGER_HOST='messenger.ekodi.kr';
const INVEST_HOST='invest.ekodi.kr';
const TAX_HOST='tax.ekodi.kr';
const EKODIBIZ_PUBLIC_ROUTE=/^\/ekodibiz\/?$/i;
const EKODIBIZ_ASSET_PREFIX='/_ekodi/ekodibiz/';
const EKODIBIZ_ASSETS=new Set(['style.css']);
const WORKSPACE_ASSET_PREFIX='/_ekodi/space/';
const DEPLOYMENT_PROBE_PATH='/deployment-probe';
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
function escapeHtml(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function validPublicRedirectUrl(value){
  const raw=String(value||'').trim();if(!raw)return'';
  try{const url=new URL(raw);if(!['https:','http:'].includes(url.protocol))return'';return url.toString()}catch{return''}
}
function maintenanceHtml(site){
  const title=escapeHtml(site.maintenanceTitle||site.title||CGMA_SITE.title);
  const message=escapeHtml(site.maintenanceMessage||site.message||CGMA_SITE.message);
  const redirectUrl=validPublicRedirectUrl(site.maintenanceRedirectUrl);
  const showButton=site.maintenanceDisplayType==='url'&&redirectUrl&&site.redirectMode!=='auto';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:radial-gradient(circle at top,#f3f8ff,#e9edf3 52%,#dde4ee);color:#152033}main{width:min(92vw,560px);padding:42px 28px;border:1px solid rgba(80,105,135,.18);border-radius:28px;background:rgba(255,255,255,.78);box-shadow:0 22px 70px rgba(25,50,80,.14);text-align:center;backdrop-filter:blur(16px)}.eyebrow{display:inline-flex;gap:8px;align-items:center;padding:6px 12px;border-radius:999px;background:#edf5ff;color:#35628e;font-size:13px;font-weight:700;letter-spacing:.04em}h1{margin:18px 0 10px;font-size:clamp(28px,5vw,42px);line-height:1.12;letter-spacing:-.04em}p{margin:0 auto;color:#536273;font-size:17px;line-height:1.65;word-break:keep-all}a{display:inline-flex;margin-top:26px;padding:13px 18px;border-radius:14px;background:#163454;color:#fff;text-decoration:none;font-weight:800}footer{margin-top:28px;color:#8390a1;font-size:12px}</style></head><body><main><div class="eyebrow">CGMA</div><h1>${title}</h1><p>${message}</p>${showButton?`<a href="${escapeHtml(redirectUrl)}" rel="noopener noreferrer">임시 안내 페이지 보기</a>`:''}<footer>cgma.or.kr</footer></main></body></html>`;
}
function maintenanceResponse(site,status=200){return new Response(maintenanceHtml(site),{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-ekodi-public-site-mode':'maintenance'}})}
async function ensurePublicSiteControlSchema(env){
  if(!env?.DB)return;
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS public_site_controls (site_id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,domain TEXT NOT NULL UNIQUE,public_status TEXT NOT NULL DEFAULT 'maintenance',maintenance_display_type TEXT NOT NULL DEFAULT 'default',maintenance_redirect_url TEXT NOT NULL DEFAULT '',maintenance_title TEXT NOT NULL DEFAULT '현재 사이트 개발중입니다',maintenance_message TEXT NOT NULL DEFAULT '더 좋은 서비스로 준비 중입니다.',redirect_mode TEXT NOT NULL DEFAULT 'button',updated_at TEXT NOT NULL,updated_by INTEGER)`),
    env.DB.prepare(`INSERT OR IGNORE INTO public_site_controls (site_id,workspace_id,domain,public_status,maintenance_display_type,maintenance_redirect_url,maintenance_title,maintenance_message,redirect_mode,updated_at) VALUES ('cgma','cgma','cgma.or.kr','maintenance','default','','현재 사이트 개발중입니다','더 좋은 서비스로 준비 중입니다.','button',?)`).bind(now)
  ]);
}
async function readCgmaSiteControl(env){
  if(!env?.DB)return{...CGMA_SITE,publicStatus:'maintenance',maintenanceDisplayType:'default',maintenanceRedirectUrl:'',maintenanceTitle:CGMA_SITE.title,maintenanceMessage:CGMA_SITE.message,redirectMode:'button'};
  try{
    await ensurePublicSiteControlSchema(env);
    const row=await env.DB.prepare('SELECT * FROM public_site_controls WHERE site_id = ? OR domain = ? ORDER BY site_id = ? DESC LIMIT 1').bind('cgma','cgma.or.kr','cgma').first();
    return{...CGMA_SITE,publicStatus:row?.public_status||'maintenance',maintenanceDisplayType:row?.maintenance_display_type||'default',maintenanceRedirectUrl:row?.maintenance_redirect_url||'',maintenanceTitle:row?.maintenance_title||CGMA_SITE.title,maintenanceMessage:row?.maintenance_message||CGMA_SITE.message,redirectMode:row?.redirect_mode||'button'};
  }catch(error){
    console.error('CGMA public site control fallback',error);
    return{...CGMA_SITE,publicStatus:'maintenance',maintenanceDisplayType:'default',maintenanceRedirectUrl:'',maintenanceTitle:CGMA_SITE.title,maintenanceMessage:CGMA_SITE.message,redirectMode:'button'};
  }
}
function cgmaCanonicalRedirect(request){
  const source=new URL(request.url);
  const target=new URL('https://ekodi.kr/cgma');
  if(source.pathname&&source.pathname!=='/')target.pathname=`/cgma${source.pathname}`.replace(/\/+/g,'/');
  target.search=source.search;
  return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-public-site-mode':'public-redirect'}});
}
async function routeCgmaPublic(request,env){
  const site=await readCgmaSiteControl(env);
  if(site.publicStatus!=='maintenance')return cgmaCanonicalRedirect(request);
  const redirectUrl=validPublicRedirectUrl(site.maintenanceRedirectUrl);
  if(site.maintenanceDisplayType==='url'&&redirectUrl&&site.redirectMode==='auto')return new Response(null,{status:302,headers:{location:redirectUrl,'cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-public-site-mode':'maintenance-auto-redirect'}});
  return maintenanceResponse(site);
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
async function routeDeploymentProbe(request,env){
  if(!env?.SPACE?.fetch)return workspaceServiceUnavailable();
  const upstream=await env.SPACE.fetch(workspaceUpstreamRequest(request,'/'));const routed=new Response(upstream.body,upstream);routed.headers.set('x-ekodi-workspace-gateway','space-service-binding');
  return injectEkodiShell(rewriteWorkspaceShellAssets(routed),'space','workspace');
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

    if(CGMA_HOSTS.has(host)&&['GET','HEAD'].includes(request.method))return routeCgmaPublic(request,env);

    if(host===PUBLIC_HOST){
      if(request.method==='GET'){
        if(['/store-admin.css','/jadam-admin.css','/pizzamaru-admin.css','/yogurt-admin.css'].includes(url.pathname))return storeAdminCss();
        if(['/store-admin.js','/jadam-admin.js','/pizzamaru-admin.js','/yogurt-admin.js'].includes(url.pathname))return storeAdminScript();
        if(isStoreAdminPathShape(url.pathname)){const storeRoute=await resolveStoreAdminRoute(url.pathname);if(storeRoute)return storeAdminPage(storeRoute);}
        if(url.pathname==='/workspace-admin.css')return workspaceAdminCss();
        if(url.pathname==='/workspace-admin.js')return workspaceAdminScript();
        if(url.pathname==='/workspace-trade-admin.js')return workspaceTradeAdminScript();
        if(url.pathname==='/church-pastor-admin.js')return churchPastorAdminScript();
        if(url.pathname==='/workspace-trade-portal.css')return tradePartnerCss();
        if(url.pathname==='/workspace-trade-portal.js')return tradePartnerScript();
        if(isTradePartnerPath(url.pathname))return tradePartnerPage();
        if(url.pathname==='/mall/admin'||url.pathname.startsWith('/mall/admin/')){const target=new URL(request.url);target.pathname=`/ekodibiz${url.pathname}`;return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-content-type-options':'nosniff'}});}
        if(isChurchPastorAdminPath(url.pathname))return churchPastorAdminPage();
        if(isWorkspaceAdminPath(url.pathname)&&!isEkodiBizInvestAdminPath(url.pathname))return workspaceAdminPage();
      }
      if(marketingProjectionForPath(url.pathname)){const projected=await proxyCanonicalMarketing(request);if(projected)return projected;}
      if(['GET','HEAD'].includes(request.method)&&EKODIBIZ_PUBLIC_ROUTE.test(url.pathname))return routeEkodiBizPublic(request,env);
      if(['GET','HEAD'].includes(request.method)&&url.pathname.startsWith(EKODIBIZ_ASSET_PREFIX))return routeEkodiBizAsset(request,env);
      if(['GET','HEAD'].includes(request.method)&&url.pathname===DEPLOYMENT_PROBE_PATH)return routeDeploymentProbe(request,env);
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
