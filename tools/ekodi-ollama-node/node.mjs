import os from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

export const AI_CONTROL_BASE = 'https://ekodi.kr/ai';
export const OLLAMA_BASE = 'http://127.0.0.1:11434';
export const MODEL = 'qwen2.5-coder:1.5b';
export const PROVIDER = 'node:ollama-local';
const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const UUID_PATTERN = /^[a-z0-9-]{16,90}$/i;

function apiUrl(base, route) {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.hostname !== 'ekodi.kr' || !['/ai', '/ai/'].includes(url.pathname))
    throw new Error('AI Control must use https://ekodi.kr/ai');
  return url.origin + '/ai/api/node/' + route;
}
function authHeaders({nodeId, token}) {
  if (!NODE_ID_PATTERN.test(nodeId || '') || !token || token.length < 20) throw new Error('node_not_enrolled');
  return { authorization: 'Bearer ' + token, 'x-ekodi-node-id': nodeId, 'content-type': 'application/json' };
}
async function postJson(url, payload, headers = {}, fetchImpl = fetch, timeoutMs = 30000) {
  const response = await fetchImpl(url, {
    method: 'POST', headers: {'content-type':'application/json', ...headers},
    body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('http_' + response.status + ':' + String(data.error || 'unavailable').slice(0,100));
  return data;
}
export async function checkModels({fetchImpl = fetch} = {}) {
  const response = await fetchImpl(OLLAMA_BASE + '/api/tags', {signal: AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error('ollama_unavailable_' + response.status);
  const data = await response.json();
  return Array.isArray(data.models) && data.models.some(item => item.name === MODEL);
}
export function resourceDecision({memUsedPct, cpuLoadPct, desktopConfirmed, enabled} = {}) {
  const eligible = enabled === true && desktopConfirmed === true &&
    Number.isFinite(memUsedPct) && Number.isFinite(cpuLoadPct) &&
    memUsedPct < 80 && cpuLoadPct < 85;
  return {isPortable: desktopConfirmed === true ? false : true,
    autoExecutionEligible: eligible, memoryUsedPct: Math.max(0,Math.min(100,Math.round(memUsedPct ?? 100))),
    cpuLoadPct: Math.max(0,Math.min(100,Math.round(cpuLoadPct ?? 100))),
    currentLoad: Math.max(Math.round(memUsedPct ?? 100), Math.round(cpuLoadPct ?? 100)),
    maxConcurrency: 1};
}
function sumCpu() {
  return os.cpus().reduce((acc,cpu) => {
    const times = cpu.times;
    acc.idle += times.idle;
    acc.total += Object.values(times).reduce((a,b) => a+b,0);
    return acc;
  }, {idle:0,total:0});
}
export async function machineLoad() {
  const start=sumCpu();
  await delay(250);
  const end=sumCpu();
  const elapsed = end.total - start.total;
  const cpuLoadPct = elapsed > 0 ? 100*(1 - (end.idle - start.idle)/elapsed) : 100;
  return {memUsedPct:100*(1-os.freemem()/os.totalmem()), cpuLoadPct};
}
export function validateJob(job) {
  if (!job || !UUID_PATTERN.test(String(job.id || ''))) throw new Error('invalid_job_id');
  if (job.providerId !== PROVIDER || job.needsCodeBranch !== false) throw new Error('unsupported_job');
  if (typeof job.prompt !== 'string' || job.prompt.length < 1 || job.prompt.length > 2500) throw new Error('unsupported_prompt_length');
  if (job.branch || job.needsCodeBranch === true) throw new Error('source_mutation_not_supported');
  return {id:job.id, prompt:job.prompt};
}
export async function answerLocal(prompt, {fetchImpl = fetch} = {}) {
  const result=await postJson(OLLAMA_BASE + '/api/generate', {
    // 8GB Windows agents must release model RAM after each queued job.
    model: MODEL, prompt, stream:false, keep_alive:'0s',
    options:{num_ctx:2048, num_predict:400, temperature:0},
  }, {}, fetchImpl, 110000);
  if (!result.done || typeof result.response !== 'string' || !result.response.trim())
    throw new Error('empty_model_response');
  return result.response.slice(0,12000);
}
export function createNode({base=AI_CONTROL_BASE, nodeId, token, fetchImpl=fetch, loadFn=machineLoad,
  modelFn=checkModels, answerFn=answerLocal, desktopConfirmed=false, enabled=false} = {}) {
  const headers=authHeaders({nodeId, token});
  const call=(route,payload) => postJson(apiUrl(base,route),payload,headers,fetchImpl);
  async function once() {
    const load=await loadFn();
    const telemetry=resourceDecision({...load,desktopConfirmed,enabled});
    let modelReady=false;
    try{modelReady=await modelFn({fetchImpl});}catch{modelReady=false;}
    telemetry.autoExecutionEligible=telemetry.autoExecutionEligible && modelReady;
    const lease=await call('lease',{providers:['ollama-local'],system:{
      isPortable:telemetry.isPortable,deviceClass:desktopConfirmed?'desktop':'unknown',
      cpuLoadPct:telemetry.cpuLoadPct,memoryUsedPct:telemetry.memoryUsedPct,
      currentLoad:telemetry.currentLoad,autoExecutionEligible:telemetry.autoExecutionEligible,
      measuredAt:new Date().toISOString()},maxConcurrency:1});
    if (!lease.job) return {state:'idle',eligible:telemetry.autoExecutionEligible,reason:lease.scheduler?.reason||'queue_empty'};
    const job=lease.job;
    let outcome;
    try {
      const validated=validateJob(job);
      const check=resourceDecision({...await loadFn(),desktopConfirmed,enabled});
      if(!check.autoExecutionEligible)throw new Error('resource_capacity_exceeded');
      const output=await answerFn(validated.prompt,{fetchImpl});
      outcome={ok:true,output};
    } catch (error) {
      outcome={ok:false,error:String(error.message||'worker_failure').slice(0,200)};
    }
    await call('jobs/'+encodeURIComponent(job.id)+'/complete',outcome);
    return {state:'reported',jobId:job.id,ok:outcome.ok,reason:outcome.error||''};
  }
  return {once};
}
async function main() {
  const mode=process.argv[2]||'doctor';
  if(mode==='doctor'){
    const load=await machineLoad();
    const modelsAvailable=await checkModels().catch(()=>false);
    console.log(JSON.stringify({model:MODEL,modelAvailable:modelsAvailable,resource:resourceDecision({
      ...load,desktopConfirmed:process.env.EKODI_NODE_DESKTOP==='true',
      enabled:process.env.EKODI_NODE_ENABLED==='true'}),
      paired:!!process.env.EKODI_NODE_TOKEN,endpoint:AI_CONTROL_BASE},null,2));
    return;
  }
  if(mode!=='once'&&mode!=='run')throw new Error('command_must_be_doctor_once_or_run');
  const node=createNode({
    nodeId:process.env.EKODI_NODE_ID,token:process.env.EKODI_NODE_TOKEN,
    desktopConfirmed:process.env.EKODI_NODE_DESKTOP==='true',
    enabled:process.env.EKODI_NODE_ENABLED==='true'
  });
  do {
    try {console.log(JSON.stringify({time:new Date().toISOString(),...await node.once()}));}
    catch(error) {console.error(JSON.stringify({state:'error',error:String(error.message).slice(0,130)}));if(mode==='once')process.exitCode=1;}
    if(mode==='run')await delay(60000);
  }while(mode==='run');
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error(JSON.stringify({state:'fatal',error:String(e.message).slice(0,140)}));process.exitCode=1;});
}
