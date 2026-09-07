import { createOpenAiProvider } from './openai-provider-adapter.js';
import { createAnthropicProvider } from './anthropic-provider-adapter.js';
import { createGeminiOrchestratorProvider } from './gemini-orchestrator-provider-adapter.js';

const ENABLED_VALUES=new Set(['1','true','yes','on','enabled']);
function enabled(value,fallback=true){if(value===undefined||value===null||String(value).trim()==='')return fallback;return ENABLED_VALUES.has(String(value).trim().toLowerCase())}
function priority(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback}
function overrideEnv(env,id){const prefix=`EKODI_PROVIDER_${id.toUpperCase()}_`,model=env[`${prefix}MODEL`];if(!model)return env;const modelKey=id==='openai'?'OPENAI_MODEL':id==='gemini'?'GEMINI_MODEL':'ANTHROPIC_MODEL';return{...env,[modelKey]:model}}
function decorate(provider,metadata={}){return Object.freeze({...provider,available:provider.available!==false&&metadata.enabled!==false,priority:priority(metadata.priority??provider.priority,100),capabilities:Object.freeze([...(metadata.capabilities||provider.capabilities||['text'])]),trustClass:String(metadata.trustClass||provider.trustClass||'external').trim().toLowerCase()||'external'})}

export function createEkodiAiProviderRegistry(env={},options={}){
  const openaiEnv=overrideEnv(env,'openai'),anthropicEnv=overrideEnv(env,'anthropic'),geminiEnv=overrideEnv(env,'gemini');
  return Object.freeze([
    decorate(createOpenAiProvider(openaiEnv,{fetchImpl:options.fetchImpl}),{enabled:enabled(env.EKODI_PROVIDER_OPENAI_ENABLED??env.OPENAI_ENABLED),priority:priority(env.EKODI_PROVIDER_OPENAI_PRIORITY??env.OPENAI_PRIORITY,10),capabilities:['text','reasoning','code','vision']}),
    decorate(createAnthropicProvider(anthropicEnv,{fetchImpl:options.fetchImpl}),{enabled:enabled(env.EKODI_PROVIDER_ANTHROPIC_ENABLED??env.ANTHROPIC_ENABLED),priority:priority(env.EKODI_PROVIDER_ANTHROPIC_PRIORITY??env.ANTHROPIC_PRIORITY,20)}),
    decorate(createGeminiOrchestratorProvider(geminiEnv,{fetchImpl:options.fetchImpl}),{enabled:enabled(env.EKODI_PROVIDER_GEMINI_ENABLED??env.GEMINI_ENABLED),priority:priority(env.EKODI_PROVIDER_GEMINI_PRIORITY??env.GEMINI_PRIORITY,30)}),
  ]);
}

export function getEkodiAiProviderRegistryStatus(env={}){
  return Object.freeze(createEkodiAiProviderRegistry(env).map(provider=>Object.freeze({id:provider.id,model:provider.model||null,available:provider.available,priority:provider.priority,capabilities:provider.capabilities,trustClass:provider.trustClass})));
}
