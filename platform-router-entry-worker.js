import legacyPlatformRouter from './platform-router-worker.js';
import financeEntryWorker from './finance-entry-worker.js';
import taxPortalWorker from './tax-portal-worker.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';
import { messengerUserPage, messengerUiScript } from './messenger-user-page.js';
import { investUserPage, investUiScript } from './invest-user-page.js';
import { investSubjectUiScript } from './invest-subject-ui.js';
import { AI_GATEWAY_HOST, aiGatewayPage, aiGatewayScript, proxyAiGatewayApi } from './ai-gateway-page.js';
import { MAIL_HOST, mailUserPage, handleMailApi } from './mail-user-page.js';
import { resolvePublicSpace, publicSpacePage } from './space-entry-page.js';

const MESSENGER_HOST='messenger.ekodi.kr';
const INVEST_HOST='invest.ekodi.kr';
const TAX_HOST='tax.ekodi.kr';
const ROOT_HOSTS=new Set(['ekodi.kr','www.ekodi.kr']);

function resolvedHost(request,env){
  const url=new URL(request.url);
  if(env?.ENVIRONMENT!=='staging')return url.hostname.toLowerCase();
  const simulated=String(request.headers.get('x-ekodi-staging-host')||'').trim().toLowerCase();
  return simulated||url.hostname.toLowerCase();
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

    if(ROOT_HOSTS.has(host)&&request.method==='GET'){
      const space=resolvePublicSpace(url.pathname);
      if(space){
        if(!url.pathname.endsWith('/')){
          const canonical=new URL(request.url);
          canonical.pathname=`/${space.slug}/`;
          return Response.redirect(canonical.toString(),308);
        }
        return publicSpacePage(space);
      }
    }

    if(host===TAX_HOST){
      if(url.pathname.startsWith('/api/finance/tax-'))return financeEntryWorker.fetch(request,env,ctx);
      const portal=taxPortalWorker.fetch(request,env,ctx);
      if(portal)return portal;
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
