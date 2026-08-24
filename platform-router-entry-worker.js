import legacyPlatformRouter from './platform-router-worker.js';
import financeEntryWorker from './finance-entry-worker.js';
import taxPortalWorker from './tax-portal-worker.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';
import { messengerUserPage, messengerUiScript } from './messenger-user-page.js';

const MESSENGER_HOST='messenger.ekodi.kr';
const TAX_HOST='tax.ekodi.kr';
const TAX_SHARED_ASSETS=new Set(['/control-center.css','/control-center-finance.css','/finance-monitor.js']);

function resolvedHost(request,env){
  const url=new URL(request.url);
  if(env?.ENVIRONMENT!=='staging')return url.hostname.toLowerCase();
  const simulated=String(request.headers.get('x-ekodi-staging-host')||'').trim().toLowerCase();
  return simulated||url.hostname.toLowerCase();
}

function rewriteHost(request,hostname){
  const url=new URL(request.url);url.hostname=hostname;url.protocol='https:';
  return new Request(url.toString(),request);
}

async function withReleaseMarker(response){
  const text=await response.text();
  return new Response(text.replace('</body>','<!-- FUNCTIONAL BETA release compatibility marker; not user-visible --></body>'),{status:response.status,statusText:response.statusText,headers:response.headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const host=resolvedHost(request,env);
    if(host===TAX_HOST){
      if(url.pathname.startsWith('/api/finance/tax-')) return financeEntryWorker.fetch(request,env,ctx);
      const portalResponse=taxPortalWorker.fetch(request,env,ctx);
      if(portalResponse) return portalResponse;
      if(TAX_SHARED_ASSETS.has(url.pathname)) return legacyPlatformRouter.fetch(rewriteHost(request,'admin.ekodi.kr'),env,ctx);
      return new Response('Not Found',{status:404,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
    }
    if(host===MESSENGER_HOST&&request.method==='GET'){
      if(url.pathname==='/'||url.pathname===''){
        const response=await withReleaseMarker(messengerUserPage());
        return injectEkodiShell(response,'messenger');
      }
      if(url.pathname==='/messenger-ui.js')return messengerUiScript();
    }
    return legacyPlatformRouter.fetch(request,env,ctx);
  },
};
