import { projectForExternalAi } from './secure-projection.js';

const DEFAULT_PRIORITY=45;
const MAX_OUTPUT_CHARS=40000;
const ENABLED_VALUES=new Set(['1','true','yes','on','enabled']);
const clean=(value,max=MAX_OUTPUT_CHARS)=>String(value??'').trim().slice(0,max);
const enabled=value=>ENABLED_VALUES.has(clean(value,20).toLowerCase());

function outputText(data){
  if(typeof data?.text==='string'&&data.text.trim())return data.text.trim();
  if(typeof data?.output==='string'&&data.output.trim())return data.output.trim();
  if(typeof data?.result==='string'&&data.result.trim())return data.result.trim();
  if(typeof data?.message==='string'&&data.message.trim())return data.message.trim();
  return '';
}

export function createGensparkProvider(env={},options={}){
  const endpoint=clean(env.GENSPARK_AGENT_ENDPOINT,2048);
  const token=clean(env.GENSPARK_AGENT_TOKEN,8192);
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const configured=Boolean(endpoint&&token);
  const available=Boolean(enabled(env.EKODI_PROVIDER_GENSPARK_ENABLED)&&configured&&typeof fetchImpl==='function');
  const model=clean(env.EKODI_GENSPARK_AGENT_PROFILE,160)||'genspark-super-agent';

  return Object.freeze({
    id:'genspark',
    model,
    available,
    priority:DEFAULT_PRIORITY,
    capabilities:Object.freeze(['text','reasoning','research','browser','document','code']),
    trustClass:'external-agent',
    resourceClass:'external-agent',
    fundingSource:'provider-managed',
    officialPath:false,
    automationAllowed:false,
    costClass:'provider-managed',
    async invoke({taskName,context={}}={}){
      if(!available)throw new Error('GENSPARK_PROVIDER_NOT_CONFIGURED');
      const projected=await projectForExternalAi(context,{
        profile:'ai_minimum',
        purpose:'genspark-agent-fabric',
        salt:crypto.randomUUID(),
      });
      const response=await fetchImpl(endpoint,{
        method:'POST',
        headers:{
          authorization:`Bearer ${token}`,
          'content-type':'application/json',
          'x-ekodi-agent-fabric':'genspark',
        },
        body:JSON.stringify({
          schemaVersion:1,
          taskName:clean(taskName,120)||'ekodi-agent-fabric',
          profile:model,
          capabilities:['research','browser','document','code'],
          input:projected,
          authority:Object.freeze({
            ekodiOrchestratorFinal:true,
            authorityTransfer:false,
            sideEffectsAuthorized:false,
          }),
        }),
        signal:AbortSignal.timeout(90000),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(`GENSPARK_HTTP_${response.status}`);
      const text=clean(outputText(data));
      if(!text)throw new Error('GENSPARK_EMPTY_RESPONSE');
      return Object.freeze({
        text,
        model:clean(data?.model,160)||model,
        responseId:clean(data?.id||data?.responseId,240),
        provider:'genspark',
        authorityTransferred:false,
      });
    },
  });
}

export function getGensparkProviderStatus(env={}){
  const endpoint=clean(env.GENSPARK_AGENT_ENDPOINT,2048);
  const configured=Boolean(endpoint&&clean(env.GENSPARK_AGENT_TOKEN,8192));
  const provider=createGensparkProvider(env,{fetchImpl:globalThis.fetch});
  return Object.freeze({
    id:provider.id,
    configured,
    enabled:enabled(env.EKODI_PROVIDER_GENSPARK_ENABLED),
    available:provider.available,
    model:provider.model,
    endpointConfigured:Boolean(endpoint),
    officialDirectApi:false,
    inboundMcp:'https://ekodi.kr/mcp',
  });
}

export const GENSPARK_PROVIDER_DEFAULTS=Object.freeze({
  priority:DEFAULT_PRIORITY,
  inboundMcp:'https://ekodi.kr/mcp',
  officialDirectApi:false,
  defaultEnabled:false,
});
