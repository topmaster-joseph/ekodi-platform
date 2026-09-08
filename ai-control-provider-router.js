import {buildExecutionPlan,buildOriginSynthesisPrompt,isOriginPreserved,resolveOriginResponseProvider,rolePrompt,summarizeRuns} from './ai-control-core.js';
import {providerCostClass} from './ai-router-score.js';

const clean=value=>String(value??'').trim();
const DEFAULT_WORKER_PROVIDERS=Object.freeze([]);

function configuredProviderProfiles(env={}){
  const raw=clean(env.AI_ROUTER_PROVIDER_PROFILES);if(!raw)return{};
  try{const parsed=JSON.parse(raw);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}
}

export function providerCapabilities(env={},nodeProviders=[]){
  const workerReady=Boolean(clean(env.AI_WORKER_URL)&&clean(env.AI_WORKER_TOKEN));
  const configuredWorkers=clean(env.AI_WORKER_PROVIDERS)
    ? clean(env.AI_WORKER_PROVIDERS).split(',').map(v=>v.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_WORKER_PROVIDERS;
  return {
    geminiFree:Boolean(clean(env.GEMINI_API_KEY)),
    nodeProviders:[...new Set((nodeProviders||[]).map(v=>clean(v).toLowerCase()).filter(Boolean))],
    openaiApi:Boolean(clean(env.OPENAI_API_KEY)),
    anthropicApi:Boolean(clean(env.ANTHROPIC_API_KEY)),
    workerProviders:workerReady?configuredWorkers:[],
    providerProfiles:configuredProviderProfiles(env),
  };
}

export function providerStatus(env={},nodeProviders=[]){
  const capabilities=providerCapabilities(env,nodeProviders);const providers=[];
  providers.push({id:'gemini-free',kind:'official-api',costClass:providerCostClass('gemini-free'),available:capabilities.geminiFree,configured:capabilities.geminiFree,model:clean(env.GEMINI_MODEL)||'gemini-3.7-flash'});
  for(const id of capabilities.nodeProviders){const providerId=`node:${id}`;providers.push({id:providerId,kind:'account-cli',costClass:providerCostClass(providerId),available:true,configured:true,model:'account-managed'});}
  providers.push({id:'openai-api',kind:'official-api',costClass:providerCostClass('openai-api'),available:capabilities.openaiApi,configured:capabilities.openaiApi,model:clean(env.OPENAI_MODEL)||'gpt-5.6-luna'});
  providers.push({id:'anthropic-api',kind:'official-api',costClass:providerCostClass('anthropic-api'),available:capabilities.anthropicApi,configured:capabilities.anthropicApi,model:clean(env.ANTHROPIC_MODEL)||'claude-haiku-4-5-20251001'});
  for(const id of capabilities.workerProviders){const providerId=`worker:${id}`;providers.push({id:providerId,kind:'external-worker',costClass:providerCostClass(providerId),available:true,configured:true,model:'provider-managed'});}
  return providers;
}

async function invokeGemini(env,prompt){
  const key=clean(env.GEMINI_API_KEY);if(!key)throw new Error('gemini_not_configured');
  const model=clean(env.GEMINI_MODEL)||'gemini-3.7-flash';
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key,'x-goog-api-client':'ekodi-ai-control/0.3.0'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}]})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||`gemini_${response.status}`);
  const text=(data?.candidates?.[0]?.content?.parts||[]).map(part=>part.text||'').join('\n').trim();
  if(!text)throw new Error('gemini_empty_response');
  return text;
}

async function invokeOpenAI(env,prompt){
  const key=clean(env.OPENAI_API_KEY);if(!key)throw new Error('openai_not_configured');
  const model=clean(env.OPENAI_MODEL)||'gpt-5.6-luna';
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,input:prompt,reasoning:{effort:'low'}})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||`openai_${response.status}`);
  const text=clean(data.output_text)||clean((data.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('\n'));
  if(!text)throw new Error('openai_empty_response');
  return text;
}

async function invokeAnthropic(env,prompt){
  const key=clean(env.ANTHROPIC_API_KEY);if(!key)throw new Error('anthropic_not_configured');
  const model=clean(env.ANTHROPIC_MODEL)||'claude-haiku-4-5-20251001';
  const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model,max_tokens:4096,messages:[{role:'user',content:prompt}]})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||`anthropic_${response.status}`);
  const text=clean((data.content||[]).filter(item=>item.type==='text').map(item=>item.text||'').join('\n'));
  if(!text)throw new Error('anthropic_empty_response');
  return text;
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

export async function invokeProvider(env,providerId,prompt,task,role){
  if(providerId==='gemini-free')return invokeGemini(env,prompt);
  if(providerId==='openai-api')return invokeOpenAI(env,prompt);
  if(providerId==='anthropic-api')return invokeAnthropic(env,prompt);
  if(providerId.startsWith('node:'))throw new Error('node_provider_requires_queue');
  if(providerId.startsWith('worker:'))return invokeWorker(env,providerId.slice(7),prompt,task,role);
  throw new Error('unsupported_provider');
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
