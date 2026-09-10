import legacyWorkspaceWorker from './workspace-platform-api-worker.js';
import { handleWorkspaceMessengerV2 } from './workspace-messenger-v2.js';
import { drainMessengerOutbox } from './messenger-outbox.js';
import { handleProfileEvidenceApi, profileSchemaReady } from './profile-evidence-runtime.js';
import { createOfficialProfileDataBinding, officialDataConnections } from './profile-official-data-adapter.js';
import { handleInvestPersonalizationApi } from './invest-personalization-runtime.js';
import { handleDesignProfileApi } from './design-profile-runtime.js';
import { d1SchemaReady } from './d1-schema-readiness.js';

async function designProfileSchemaReady(env){ return d1SchemaReady(env?.DB,['site_design_profiles']); }

async function conversationSchemaReady(env){ return d1SchemaReady(env?.DB,['messenger_outbox','messenger_identity_audit']); }

function scheduleOutboxRecovery(env,ctx,limit=8){
  const task=drainMessengerOutbox(env,{limit}).catch(error=>({processed:0,failed:1,error:String(error?.message||error)}));
  if(ctx?.waitUntil)ctx.waitUntil(task);
  return task;
}

function profileEnv(env){
  if(env?.PROFILE_DATA&&typeof env.PROFILE_DATA.fetch==='function')return env;
  return {...env,PROFILE_DATA:createOfficialProfileDataBinding(env)};
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/?route=workspace&source=workspace-api.ekodi.kr',307);
    if(url.pathname==='/v1/profiles'||url.pathname.startsWith('/v1/profiles/')){
      const response=await handleProfileEvidenceApi(request,profileEnv(env));
      if(response)return response;
    }
    if(['/v1/invest/context','/v1/invest/data-connections','/v1/invest/subjects'].includes(url.pathname)){
      const response=await handleInvestPersonalizationApi(request,env);
      if(response)return response;
    }
    if(url.pathname.startsWith('/v1/design-profiles')){
      const response=await handleDesignProfileApi(request,env);
      if(response)return response;
    }
    if(url.pathname.startsWith('/v1/messenger/')){
      scheduleOutboxRecovery(env,ctx,8);
      const response=await handleWorkspaceMessengerV2(request,env,ctx);
      if(response)return response;
    }
    if(url.pathname==='/health'){
      const response=await legacyWorkspaceWorker.fetch(request,env,ctx);
      try{
        const data=await response.clone().json();
        const [foundationReady,profileReady,designReady]=await Promise.all([conversationSchemaReady(env),profileSchemaReady(env),designProfileSchemaReady(env)]);
        const connections=officialDataConnections(env).map(({id,status})=>({id,status}));
        return new Response(JSON.stringify({...data,conversationFoundation:'v2',eventOutbox:true,conversationSchemaReady:foundationReady,profileEvidenceFoundation:'v1',profileSchemaReady:profileReady,officialDataFirst:true,officialDataProvider:'embedded-v1',investPersonalization:'v1',investDataConnections:connections,adaptiveDesign:'v1',designProfileSchemaReady:designReady}),{status:response.status,headers:response.headers});
      }catch{return response}
    }
    return legacyWorkspaceWorker.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    return scheduleOutboxRecovery(env,ctx,20);
  },
};
