import {buildExecutionPlan,rolePrompt,summarizeRuns} from './ai-control-core.js';

const clean=value=>String(value??'').trim();

export function providerCapabilities(env={}){
  return {
    geminiFree:Boolean(clean(env.GEMINI_API_KEY)),
    workerProviders:clean(env.AI_WORKER_PROVIDERS).split(',').map(v=>v.trim().toLowerCase()).filter(Boolean),
  };
}

export function providerStatus(env={}){
  const capabilities=providerCapabilities(env);
  const providers=[];
  if(capabilities.geminiFree)providers.push({id:'gemini-free',kind:'official-api',costClass:'free-preferred',available:true});
  for(const id of capabilities.workerProviders)providers.push({id:`worker:${id}`,kind:'external-worker',costClass:'account-or-provider-managed',available:Boolean(clean(env.AI_WORKER_URL))});
  return providers;
}

async function invokeGemini(env,prompt){
  const key=clean(env.GEMINI_API_KEY);if(!key)throw new Error('gemini_not_configured');
  const model=clean(env.GEMINI_MODEL)||'gemini-2.5-flash';
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.2}})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||`gemini_${response.status}`);
  const text=(data?.candidates?.[0]?.content?.parts||[]).map(part=>part.text||'').join('\n').trim();
  if(!text)throw new Error('gemini_empty_response');
  return text;
}

async function invokeWorker(env,provider,prompt,task,role){
  const base=clean(env.AI_WORKER_URL).replace(/\/+$/,'');
  const token=clean(env.AI_WORKER_TOKEN);
  if(!base)throw new Error('worker_unavailable');
  if(!token)throw new Error('worker_token_missing');
  const response=await fetch(`${base}/v1/execute`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','x-ekodi-task-id':task.id},body:JSON.stringify({task_id:task.id,provider,role,prompt})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw new Error(data?.error||`worker_${response.status}`);
  const output=clean(data.output||data.text||data.result);
  if(!output)throw new Error('worker_empty_response');
  return output;
}

export async function invokeProvider(env,providerId,prompt,task,role){
  if(providerId==='gemini-free')return invokeGemini(env,prompt);
  if(providerId.startsWith('worker:'))return invokeWorker(env,providerId.slice(7),prompt,task,role);
  throw new Error('unsupported_provider');
}

export async function runExecutionPlan(env,task,onRun=async()=>{}){
  const plan=buildExecutionPlan(task,providerCapabilities(env));
  if(!plan.length)throw new Error('no_provider_available');
  const execute=async entry=>{
    const run={id:crypto.randomUUID(),taskId:task.id,providerId:entry.providerId,role:entry.role,state:'running',output:'',error:'',startedAt:new Date().toISOString(),finishedAt:''};
    await onRun(run,'start');
    try{run.output=await invokeProvider(env,entry.providerId,rolePrompt(task,entry.role,{branch:task.branch}),task,entry.role);run.state='completed'}catch(error){run.state='failed';run.error=clean(error?.message||error)}
    run.finishedAt=new Date().toISOString();
    await onRun(run,'finish');
    return{...run,ok:run.state==='completed'};
  };
  const runs=task.mode==='parallel'?await Promise.all(plan.map(execute)):await (async()=>{const out=[];for(const entry of plan)out.push(await execute(entry));return out})();
  return{runs,summary:summarizeRuns(runs)};
}
