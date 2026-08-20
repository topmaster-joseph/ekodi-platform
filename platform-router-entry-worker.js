import legacyPlatformRouter from './platform-router-worker.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';
import { messengerUserPage, messengerUiScript } from './messenger-user-page.js';

const MESSENGER_HOST='messenger.ekodi.kr';

function resolvedHost(request,env){
  const url=new URL(request.url);
  if(env?.ENVIRONMENT!=='staging')return url.hostname.toLowerCase();
  const simulated=String(request.headers.get('x-ekodi-staging-host')||'').trim().toLowerCase();
  return simulated||url.hostname.toLowerCase();
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const host=resolvedHost(request,env);
    if(host===MESSENGER_HOST&&request.method==='GET'){
      if(url.pathname==='/'||url.pathname===''){
        return injectEkodiShell(messengerUserPage(),'messenger');
      }
      if(url.pathname==='/messenger-ui.js')return messengerUiScript();
    }
    return legacyPlatformRouter.fetch(request,env,ctx);
  },
};
