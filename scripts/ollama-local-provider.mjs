// Local-only Ollama adapter for an explicitly paired EKODI desktop node.
import {freemem} from 'node:os';
// Never use a network host supplied by a job or the cloud model catalog.
const ENDPOINT='http://127.0.0.1:11434';
const DEFAULT_MODEL='qwen3:0.6b';
const MIN_FREE_MEMORY_BYTES=1536*1024*1024;
const MODEL_ID=/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,79}(?::[a-zA-Z0-9][a-zA-Z0-9._-]{0,63})?$/;
const enabled=value=>['true','1','yes','on'].includes(String(value??'').trim().toLowerCase());

export function ollamaLocalModel(env=process.env){
  const model=String(env.EKODI_OLLAMA_MODEL||DEFAULT_MODEL).trim();
  if(!MODEL_ID.test(model)||/:cloud$/i.test(model))throw new Error('ollama_local_model_invalid');
  return model;
}

export function ollamaLocalEnabled(env=process.env){
  return enabled(env.EKODI_ENABLE_OLLAMA_LOCAL)&&enabled(env.OLLAMA_NO_CLOUD);
}

export async function ollamaLocalReady({env=process.env,fetchImpl=globalThis.fetch,freeMemoryBytes=freemem()}={}){
  if(!ollamaLocalEnabled(env)||freeMemoryBytes<MIN_FREE_MEMORY_BYTES)return false;
  const model=ollamaLocalModel(env);
  try{
    const response=await fetchImpl(ENDPOINT+'/api/tags',{method:'GET',signal:AbortSignal.timeout(4000)});
    if(!response.ok)return false;
    const data=await response.json();
    return Array.isArray(data.models)&&data.models.some(item=>item.name===model||item.model===model);
  }catch{return false}
}

export async function runOllamaLocal(prompt,{env=process.env,fetchImpl=globalThis.fetch,timeoutMs=120000,freeMemoryBytes=freemem()}={}){
  if(!ollamaLocalEnabled(env))throw new Error('ollama_local_disabled');
  // Model readiness can change between queue lease and execution.
  if(freeMemoryBytes<MIN_FREE_MEMORY_BYTES)throw new Error('ollama_local_insufficient_free_memory');
  const model=ollamaLocalModel(env);
  const content=String(prompt??'').trim();
  if(!content||content.length>6000)throw new Error('ollama_local_prompt_out_of_bounds');
  // No code branches, tools, shell commands or remote Ollama service are exposed.
  const response=await fetchImpl(ENDPOINT+'/api/chat',{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(Math.min(180000,Math.max(5000,timeoutMs))),
    body:JSON.stringify({
      model,stream:false,think:false,keep_alive:0,
      messages:[{role:'user',content}],
      options:{num_ctx:1024,num_predict:160,temperature:0.2},
    }),
  });
  if(!response.ok)throw new Error('ollama_local_http_'+response.status);
  const data=await response.json();
  const output=String(data?.message?.content??'').trim();
  if(!output)throw new Error('ollama_local_empty_response');
  return output.slice(0,12000);
}
