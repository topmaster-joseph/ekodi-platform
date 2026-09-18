import {buildExecutionPlan,buildOriginSynthesisPrompt,isOriginPreserved,resolveOriginResponseProvider,rolePrompt,summarizeRuns} from './ai-control-core.js';
import {providerCostClass} from './ai-router-score.js';
import {evaluateAiCostEligibility} from './ai-cost-policy.js';
import {createCloudflareWorkersAiProvider} from './cloudflare-workers-ai-provider-adapter.js';
import {createGroqFreeProvider} from './groq-free-provider-adapter.js';
import {createOpenRouterFreeProvider} from './openrouter-free-provider-adapter.js';
import {createEkodiAiProviderRegistry} from './ekodi-ai-provider-registry.js';

const clean=value=>String(value??'').trim();
const DEFAULT_WORKER_PROVIDERS=Object.freeze([]);
const DIRECT_PROVIDER_IDS=Object.freeze({
  'gemini-free':'gemini',
  'openai-api':'openai',
  'anthropic-api':'anthropic',
});

function enabled(value,fallback=false){const raw=clean(value).toLowerCase();if(!raw)return fallback;return ['1','true','yes','on','enabled'].includes(raw)}
function configuredProviderProfiles(env={}){
  const raw=clean(env.AI_ROUTER_PROVIDER_PROFILES);if(!raw)return{};
  try{const parsed=JSON.parse(raw);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}
}

function directProviderRegistry(env={}){
  return new Map(createEkodiAiProviderRegistry(env,{fetchImpl:globalThis.fetch,ai:env.AI}).map(provider=>[provider.id,provider]));
}

function directProvider(env={},providerId=''){
  const registryId=DIRECT_PROVIDER_IDS[clean(providerId).toLowerCase()];
  return registryId?directProviderRegistry(env).get(registryId)||null:null;
}

function directConfigured(env={},providerId=''){
  if(providerId==='gemini-free')return Boolean(clean(env.GEMINI_API_KEY||env.GOOGLE_AI_API_KEY));
  if(providerId==='openai-api')return Boolean(clean(env.OPENAI_API_KEY));
  if(providerId==='anthropic-api')return Boolean(clean(env.ANTHROPIC_API_KEY));
  return false;
}

export function providerCapabilities(env={},nodeProviders=[]){
  const workerReady=Boolean(clean(env.AI_WORKER_URL)&&clean(env.AI_WORKER_TOKEN));
  const configuredWorkers=clean(env.AI_WORKER_PROVIDERS)
    ? clean(env.AI_WORKER_PROVIDERS).split(',').map(v=>v.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_WORKER_PROVIDERS;
  const registry=directProviderRegistry(env);
  return {
    cloudflareWorkersAi:enabled(env.EKODI_PROVIDER_WORKERS_AI_ENABLED,false)&&Boolean(env.AI&&typeof env.AI.run==='function'),
    geminiFree:registry.get('gemini')?.available===true,
    openrouterFree:enabled(env.EKODI_PROVIDER_OPENROUTER_FREE_ENABLED,true)&&Boolean(clean(env.OPENROUTER_API_KEY)),
    groqFree:enabled(env.EKODI_PROVIDER_GROQ_FREE_ENABLED,false)&&Boolean(clean(env.GROQ_API_KEY)),
    nodeProviders:[...new Set((nodeProviders||[]).map(v=>clean(v).toLowerCase()).filter(Boolean))],
    openaiApi:registry.get('openai')?.available===true,
    anthropicApi:registry.get('anthropic')?.available===true,
    workerProviders:workerReady?configuredWorkers:[],
    providerProfiles:configuredProviderProfiles(env),
  };
}

export function providerStatus(env={},nodeProviders=[]){
  const capabilities=providerCapabilities(env,nodeProviders);const providers=[];const registry=directProviderRegistry(env);
  const push=item=>{const override=item.id.startsWith('worker:')?capabilities.providerProfiles?.[item.id]?.costClass:'';const costClass=override||item.costClass;providers.push({...item,costClass,automaticEligible:evaluateAiCostEligibility({costClass},{}).eligible})};
  const gemini=registry.get('gemini'),openai=registry.get('openai'),anthropic=registry.get('anthropic');
  push({id:'cloudflare-workers-ai',kind:'account-ai',costClass:providerCostClass('cloudflare-workers-ai'),available:capabilities.cloudflareWorkersAi,configured:capabilities.cloudflareWorkersAi,model:clean(env.EKODI_WORKERS_AI_MODEL)||'@cf/meta/llama-3.1-8b-instruct-fast'});
  push({id:'gemini-free',kind:'official-api',costClass:providerCostClass('gemini-free'),available:gemini?.available===true,configured:directConfigured(env,'gemini-free'),model:gemini?.model||clean(env.GEMINI_MODEL)||'gemini-3.7-flash'});
  push({id:'openrouter-free',kind:'official-api',costClass:providerCostClass('openrouter-free'),available:capabilities.openrouterFree,configured:capabilities.openrouterFree,model:clean(env.EKODI_OPENROUTER_FREE_MODEL)||'openrouter/free'});
  push({id:'groq-free',kind:'official-api',costClass:providerCostClass('groq-free'),available:capabilities.groqFree,configured:capabilities.groqFree,model:clean(env.EKODI_GROQ_FREE_MODEL)||'openai/gpt-oss-20b'});
  for(const id of capabilities.nodeProviders){const providerId=`node:${id}`;push({id:providerId,kind:'account-cli',costClass:providerCostClass(providerId),available:true,configured:true,model:'account-managed'});}
  push({id:'openai-api',kind:'official-api',costClass:providerCostClass('openai-api'),available:openai?.available===true,configured:directConfigured(env,'openai-api'),model:openai?.model||clean(env.OPENAI_MODEL)||'gpt-5.6-luna'});
  push({id:'anthropic-api',kind:'official-api',costClass:providerCostClass('anthropic-api'),available:anthropic?.available===true,configured:directConfigured(env,'anthropic-api'),model:anthropic?.model||clean(env.ANTHROPIC_MODEL)||'claude-haiku-4-5-20251001'});
  for(const id of capabilities.workerProviders){const providerId=`worker:${id}`;push({id:providerId,kind:'external-worker',costClass:providerCostClass(providerId),available:true,configured:true,model:'provider-managed'});}
  return providers;
}

async function invokeDirectProvider(env,providerId,prompt,task,role){
  const provider=directProvider(env,providerId);
  if(!provider||provider.available!==true)throw new Error(`${providerId.replace(/-api$|-free$/,'')}_not_configured`);
  return provider.invoke({
    taskName:clean(task?.title)||clean(role)||'ekodi-orchestrator',
    context:{
      message:prompt,
      request:prompt,
      collaborationRole:clean(role),
      commandPlane:{role:clean(role)},
      taskId:clean(task?.id),
      origin:task?.origin||task?.governance?.origin||null,
    },
  });
}

async function invokeWorker(env,provider,prompt,task,role){
  const base=clean(env.AI_WORKER_URL).replace(/\/+$/,'');
  const token=clean(env.AI_WORKER_TOKEN);
  if(!base||!token)throw new Error('worker_unavailable');
  const response=await fetch(`${base}/v1/execute`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','x-ekodi-task-id':task.id},body:JSON.stringify({task_id:task.id,provider,role,prompt,origin:task.origin||task.governance?.origin||null})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw new Error(data?.error||`worker_${response.status}`);
  const output=clean(data.output||data.text||data.result);
  if(!output)throw new Error('worker_empty_response');
  return output;
}

export async function invokeProviderWithMeta(env,providerId,prompt,task,role){
  if(providerId==='cloudflare-workers-ai'){
    const provider=createCloudflareWorkersAiProvider(env,{ai:env.AI});
    const result=await provider.invoke({taskName:task?.title||role||'ekodi-ai-task',context:{prompt,taskId:task?.id||'',role}});
    return Object.freeze({text:result.text,quota:null,usage:result.usage||null});
  }
  if(providerId==='gemini-free'){const result=await invokeDirectProvider(env,providerId,prompt,task,role);return Object.freeze({text:result.text,quota:null,usage:result.usage||null});}
  if(providerId==='openrouter-free'){
    const result=await createOpenRouterFreeProvider(env).invoke({prompt});
    return Object.freeze({text:result.text,quota:result.quota||null});
  }
  if(providerId==='groq-free'){
    const result=await createGroqFreeProvider(env).invoke({prompt});
    return Object.freeze({text:result.text,quota:result.quota||null});
  }
  if(providerId==='openai-api'||providerId==='anthropic-api'){const result=await invokeDirectProvider(env,providerId,prompt,task,role);return Object.freeze({text:result.text,quota:null,usage:result.usage||null});}
  if(providerId.startsWith('node:'))throw new Error('node_provider_requires_queue');
  if(providerId.startsWith('worker:'))return Object.freeze({text:await invokeWorker(env,providerId.slice(7),prompt,task,role),quota:null});
  throw new Error('unsupported_provider');
}

export async function invokeProvider(env,providerId,prompt,task,role){
  return (await invokeProviderWithMeta(env,providerId,prompt,task,role)).text;
}

export async function runExecutionPlan(env,task,onRun=async()=>{},nodeProviders=[]){
  const capabilities=providerCapabilities(env,nodeProviders);
  const plan=buildExecutionPlan(task,capabilities);
  if(!plan.length)throw new Error('no_provider_available');
  if(plan.some(entry=>entry.providerId.startsWith('node:')))throw new Error('node_provider_requires_queue');
  const execute=async entry=>{
    const run={id:crypto.randomUUID(),taskId:task.id,providerId:entry.providerId,role:entry.role,state:'running',output:'',error:'',startedAt:new Date().toISOString(),finishedAt:'',routerScore:entry.routerScore,routerScoreBreakdown:entry.routerScoreBreakdown,routerScorePolicyVersion:entry.routerScorePolicyVersion};
    await onRun(run,'start');
    try{run.output=await invokeProvider(env,entry.providerId,rolePrompt(task,entry.role,{branch:task.branch,missionDecision:task.missionDecision}),task,entry.role);run.state='completed'}catch(error){run.state='failed';run.error=clean(error?.message||error)}
    run.finishedAt=new Date().toISOString();
    await onRun(run,'finish');
    return{...run,ok:run.state==='completed'};
  };
  const runs=await Promise.all(plan.map(execute));
  const successful=runs.filter(run=>run.ok);
  if(!successful.length)return{runs,summary:summarizeRuns(runs),finalResponse:'',responseProvider:'',originPreserved:false,error:'all_providers_failed'};
  const responseProvider=resolveOriginResponseProvider(task,capabilities);
  if(!responseProvider||responseProvider.startsWith('node:'))throw new Error('origin_response_provider_requires_queue');
  const synthesisRun={id:crypto.randomUUID(),taskId:task.id,providerId:responseProvider,role:'origin-synthesis',state:'running',output:'',error:'',startedAt:new Date().toISOString(),finishedAt:''};
  await onRun(synthesisRun,'start');
  try{synthesisRun.output=await invokeProvider(env,responseProvider,buildOriginSynthesisPrompt(task,successful),task,'origin-synthesis');synthesisRun.state='completed'}catch(error){synthesisRun.state='failed';synthesisRun.error=clean(error?.message||error)}
  synthesisRun.finishedAt=new Date().toISOString();
  await onRun(synthesisRun,'finish');
  const allRuns=[...runs,{...synthesisRun,ok:synthesisRun.state==='completed'}];
  return{runs:allRuns,summary:summarizeRuns(allRuns),finalResponse:synthesisRun.output||'',responseProvider,originPreserved:isOriginPreserved(task,responseProvider),error:synthesisRun.error||''};
}
