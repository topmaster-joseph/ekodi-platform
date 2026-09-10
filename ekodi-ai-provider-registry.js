import { createOpenAiProvider } from './openai-provider-adapter.js';
import { createAnthropicProvider } from './anthropic-provider-adapter.js';
import { createGeminiOrchestratorProvider } from './gemini-orchestrator-provider-adapter.js';

const ENABLED_VALUES=new Set(['1','true','yes','on','enabled']);
function enabled(value,fallback=true){if(value===undefined||value===null||String(value).trim()==='')return fallback;return ENABLED_VALUES.has(String(value).trim().toLowerCase())}
function priority(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback}
function overrideEnv(env,id){const prefix=`EKODI_PROVIDER_${id.toUpperCase()}_`,model=env[`${prefix}MODEL`];if(!model)return env;const modelKey=id==='openai'?'OPENAI_MODEL':id==='gemini'?'GEMINI_MODEL':'ANTHROPIC_MODEL';return{...env,[modelKey]:model}}
function fundingSource(env,id){const value=String(env[`EKODI_PROVIDER_${id.toUpperCase()}_FUNDING_SOURCE`]||'personal').trim().toLowerCase();return value==='ekodi'?'ekodi':'personal'}
function costClass(id){if(id==='gemini')return'free-preferred';if(id==='openai'||id==='anthropic')return'paid-opt-in';return'unknown'}
function decorate(provider,metadata={}){return Object.freeze({...provider,available:provider.available!==false&&metadata.enabled!==false,priority:priority(metadata.priority??provider.priority,100),capabilities:Object.freeze([...(metadata.capabilities||provider.capabilities||['text'])]),trustClass:String(metadata.trustClass||provider.trustClass||'external').trim().toLowerCase()||'external',resourceClass:metadata.resourceClass||'personal-api',fundingSource:metadata.fundingSource||'personal',officialPath:true,automationAllowed:true,costClass:metadata.costClass||provider.costClass||'unknown',freeQuotaRemaining:metadata.freeQuotaRemaining??provider.freeQuotaRemaining??null})}

export function createEkodiAiProviderRegistry(env={},options={}){
  const openaiEnv=overrideEnv(env,'openai'),anthropicEnv=overrideEnv(env,'anthropic'),geminiEnv=overrideEnv(env,'gemini');
  const source=id=>fundingSource(env,id),resource=id=>source(id)==='ekodi'?'ekodi-shared-api':'personal-api';
  return Object.freeze([
    decorate(createOpenAiProvider(openaiEnv,{fetchImpl:options.fetchImpl}),{enabled:enabled(env.EKODI_PROVIDER_OPENAI_ENABLED??env.OPENAI_ENABLED),priority:priority(env.EKODI_PROVIDER_OPENAI_PRIORITY??env.OPENAI_PRIORITY,10),capabilities:['text','reasoning','code','vision'],fundingSource:source('openai'),resourceClass:resource('openai'),costClass:costClass('openai')}),
    decorate(createAnthropicProvider(anthropicEnv,{fetchImpl:options.fetchImpl}),{enabled:enabled(env.EKODI_PROVIDER_ANTHROPIC_ENABLED??env.ANTHROPIC_ENABLED),priority:priority(env.EKODI_PROVIDER_ANTHROPIC_PRIORITY??env.ANTHROPIC_PRIORITY,20),fundingSource:source('anthropic'),resourceClass:resource('anthropic'),costClass:costClass('anthropic')}),
    decorate(createGeminiOrchestratorProvider(geminiEnv,{fetchImpl:options.fetchImpl}),{enabled:enabled(env.EKODI_PROVIDER_GEMINI_ENABLED??env.GEMINI_ENABLED),priority:priority(env.EKODI_PROVIDER_GEMINI_PRIORITY??env.GEMINI_PRIORITY,30),fundingSource:source('gemini'),resourceClass:resource('gemini'),costClass:costClass('gemini')}),
  ]);
}

export function getEkodiAiProviderRegistryStatus(env={}){
  return Object.freeze(createEkodiAiProviderRegistry(env).map(provider=>Object.freeze({id:provider.id,model:provider.model||null,available:provider.available,priority:provider.priority,capabilities:provider.capabilities,trustClass:provider.trustClass,resourceClass:provider.resourceClass,fundingSource:provider.fundingSource,officialPath:provider.officialPath,automationAllowed:provider.automationAllowed,costClass:provider.costClass,freeQuotaRemaining:provider.freeQuotaRemaining})));
}
