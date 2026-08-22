import legacyWorkspaceWorker from './workspace-platform-api-worker.js';
import { handleWorkspaceMessengerV2 } from './workspace-messenger-v2.js';
import { drainMessengerOutbox } from './messenger-outbox.js';
import { handleProfileEvidenceApi, profileSchemaReady } from './profile-evidence-runtime.js';

async function conversationSchemaReady(env){
  if(!env?.DB)return false;
  try{
    const names=['messenger_outbox','messenger_identity_audit'];
    const rows=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?)").bind(...names).all();
    return new Set((rows.results||[]).map(row=>row.name)).size===names.length;
  }catch{return false}
}

function scheduleOutboxRecovery(env,ctx,limit=8){
  const task=drainMessengerOutbox(env,{limit}).catch(error=>({processed:0,failed:1,error:String(error?.message||error)}));
  if(ctx?.waitUntil)ctx.waitUntil(task);
  return task;
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/v1/profiles'||url.pathname.startsWith('/v1/profiles/')){
      const response=await handleProfileEvidenceApi(request,env);
      if(response)return response;
    }
    if(url.pathname.startsWith('/v1/messenger/')){
      // User traffic also heals pending/failed events. Writes still schedule their own
      // immediate drain, while reads provide a free recovery path between shared cron runs.
      scheduleOutboxRecovery(env,ctx,8);
      const response=await handleWorkspaceMessengerV2(request,env,ctx);
      if(response)return response;
    }
    if(url.pathname==='/health'){
      const response=await legacyWorkspaceWorker.fetch(request,env,ctx);
      try{
        const data=await response.clone().json();
        const [foundationReady,profileReady]=await Promise.all([conversationSchemaReady(env),profileSchemaReady(env)]);
        return new Response(JSON.stringify({...data,conversationFoundation:'v2',eventOutbox:true,conversationSchemaReady:foundationReady,profileEvidenceFoundation:'v1',profileSchemaReady:profileReady,officialDataFirst:true}),{status:response.status,headers:response.headers});
      }catch{return response}
    }
    return legacyWorkspaceWorker.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    return scheduleOutboxRecovery(env,ctx,20);
  },
};