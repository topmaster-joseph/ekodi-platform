import {AI_CONTROL_POLICY,buildExecutionPlan,buildOriginSynthesisPrompt,createTaskId,evaluateTaskMissionPolicy,isOriginPreserved,normalizeTaskInput,resolveOriginResponseProvider,rolePrompt,summarizeRuns,taskOrigin} from './ai-control-core.js';
import {invokeProvider,providerCapabilities,providerStatus} from './ai-control-provider-router.js';
import {AI_ROUTER_SCORE_POLICY} from './ai-router-score.js';
import {loadAiCollaborationPolicy} from './ai-collaboration-settings.js';
import { LOCAL_EXECUTION_POLICY, compareLocalExecutionCandidates, localExecutionPolicySnapshot, normalizeLocalResource } from './local-execution-policy.js';
import capabilityRegistry from './config/capability-registry.json' with { type: 'json' };
import {AI_COMMONS_POLICY,canFinalPublish,executionCatalogSnapshot,listCommonCapabilities,normalizeAiIdeaInput,publicIdeaView,rankCommonCapabilities,rankExecutionServices,requestSimilarity,suggestedIdeaState} from './ai-commons.js';

const clean=value=>String(value??'').trim();
const now=()=>new Date().toISOString();
const ONLINE_WINDOW_MS=LOCAL_EXECUTION_POLICY.onlineWindowMs;
function headers(){return{'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()','content-security-policy':"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://ekodi.kr https://auth.ekodi.kr https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers()}})}
async function body(request){try{return await request.json()}catch{return null}}
function config(env={}){return{platform:'ai-control',architectureVersion:'1.9.0',hierarchy:['sovereign','autonomous','agentic','services'],mode:'parallel',policyVersion:AI_CONTROL_POLICY.version,missionPolicyVersion:AI_CONTROL_POLICY.missionPolicyVersion,maxParallelProviders:AI_CONTROL_POLICY.maxParallelProviders,originPreservation:true,routerScorePolicyVersion:AI_ROUTER_SCORE_POLICY.version,adminUrl:'https://ekodi.kr/admin/services/common-services?service=ai',authUrl:env.AUTH_URL||'https://ekodi.kr/auth/?site=ai&return_to=https%3A%2F%2Fekodi.kr%2Fai%2F',taskExecutionEnabled:env.AI_TASK_EXECUTION_ENABLED==='true',branchAllocationEnabled:env.AI_GITHUB_ORCHESTRATION_ENABLED==='true',humanApprovalRequired:true,nodePairingEnabled:true,localScheduler:localExecutionPolicySnapshot()}}
function dbReady(env){return Boolean(env.DB&&typeof env.DB.prepare==='function')}
async function collaborationPolicy(env){return loadAiCollaborationPolicy(env)}
function applyCollaborationPolicy(capabilities,loaded){const policy=loaded?.policy||{};const collaborators=Math.max(1,Math.min(4,Number(policy.governance?.maxParallelCollaborators)||4));return{...capabilities,openaiApi:capabilities.openaiApi&&policy.openai?.enabled!==false,routerPolicy:policy.router||{},maxParallelProviders:Math.min(AI_CONTROL_POLICY.maxParallelProviders,collaborators+1)}}
function supabaseReady(env){return Boolean(clean(env.SUPABASE_URL)&&clean(env.SUPABASE_PUBLISHABLE_KEY))}
function bearer(request){const value=clean(request.headers.get('authorization'));return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():''}
function safeId(value){const id=clean(value).toLowerCase();return /^[a-z0-9][a-z0-9._-]{2,79}$/.test(id)?id:''}
function safeProviders(values){return [...new Set((Array.isArray(values)?values:[]).map(v=>clean(v).toLowerCase()).filter(v=>['codex','gemini-cli','claude-code'].includes(v)))]}
function storedProviders(value){try{return safeProviders(JSON.parse(value||'[]'))}catch{return[]}}
function safeNodeTelemetry(input={}){
  const resource=normalizeLocalResource(input.system||{});
  const maxConcurrency=Math.max(1,Math.min(4,Number.parseInt(input.maxConcurrency,10)||1));
  return{
    currentLoad:resource.currentLoad,
    cpuLoadPct:Number.isFinite(resource.cpuLoadPct)?Math.round(resource.cpuLoadPct):100,
    memoryUsedPct:Number.isFinite(resource.memoryUsedPct)?Math.round(resource.memoryUsedPct):100,
    maxConcurrency,
    isPortable:resource.isPortable===true,
    autoExecutionEligible:resource.autoExecutionEligible===true&&resource.isPortable===false,
    systemJson:JSON.stringify(resource),
  };
}
async function sha256(value){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')}
function randomToken(bytes=32){const data=new Uint8Array(bytes);crypto.getRandomValues(data);return btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function randomPairCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const data=new Uint8Array(10);crypto.getRandomValues(data);return [...data].map(v=>alphabet[v%alphabet.length]).join('')}

async function exchangeAuth(request,env){
  if(!supabaseReady(env))return json({error:'identity_unavailable'},503);
  const input=await body(request);const tokenHash=clean(input?.tokenHash);const type=clean(input?.type)||'email';
  if(!tokenHash)return json({error:'token_required'},400);
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/verify`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({token_hash:tokenHash,type})});
  const data=await response.json().catch(()=>({}));if(!response.ok)return json({error:data?.message||data?.error||'identity_failed'},response.status);
  return json({accessToken:data.access_token||'',refreshToken:data.refresh_token||'',expiresIn:Number(data.expires_in||3600),user:{id:data.user?.id||'',email:data.user?.email||''}});
}
function capabilityGranted(authority,required){
  const need=clean(required).toLowerCase();
  const grants=Array.isArray(authority?.capabilities)?authority.capabilities:[];
  const denied=Array.isArray(authority?.deniedCapabilities)?authority.deniedCapabilities:[];
  const matches=grant=>{const value=clean(grant).toLowerCase();return value==='*'||value===need||(value.endsWith(':*')&&need.startsWith(value.slice(0,-1)))};
  if(denied.some(matches))return false;
  return grants.some(matches);
}
async function centralAdminSession(request,env,requiredCapability='ai:read'){
  const token=bearer(request);if(!token)return null;
  const base=(clean(env.CONTROL_API_URL)||'https://api.ekodi.kr').replace(/\/+$/,'');
  try{
    const response=await fetch(`${base}/api/session`,{headers:{accept:'application/json',authorization:`Bearer ${token}`},cache:'no-store'});
    if(!response.ok)return null;
    const data=await response.json().catch(()=>({}));
    if(data?.authenticated!==true||data?.authority?.kind!=='admin')return null;
    const role=clean(data.role||data.authority?.role).toLowerCase();
    if(!capabilityGranted(data.authority,requiredCapability)&&role!=='super_admin')return{error:json({error:'capability_required',capability:requiredCapability},403)};
    const email=clean(data.email).toLowerCase();if(!email)return{error:json({error:'admin_identity_missing'},403)};
    return{user:{id:email,email,role,authority:data.authority},source:'central-admin'};
  }catch(error){console.warn('central admin session unavailable',clean(error?.message||error));return null}
}
async function legacySupabaseAdmin(request,env){
  const token=bearer(request);if(!token)return{error:json({error:'authentication_required'},401)};
  if(!supabaseReady(env))return{error:json({error:'identity_unavailable'},503)};
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`}});
  const user=await response.json().catch(()=>({}));if(!response.ok)return{error:json({error:'invalid_session'},401)};
  const email=clean(user?.email).toLowerCase();const admins=clean(env.ADMIN_EMAILS||env.ADMIN_EMAIL).split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(!email||!admins.includes(email))return{error:json({error:'admin_required'},403)};
  return{user:{id:clean(user.id),email,role:'legacy_admin'},source:'legacy-supabase'};
}
async function requireAdmin(request,env,requiredCapability='ai:read'){
  const token=bearer(request);if(!token)return{error:json({error:'authentication_required'},401)};
  const central=await centralAdminSession(request,env,requiredCapability);
  if(central)return central;
  return legacySupabaseAdmin(request,env);
}
async function requireNode(request,env){
  if(!dbReady(env))return{error:json({error:'state_store_unavailable'},503)};
  const nodeId=safeId(request.headers.get('x-ekodi-node-id'));const token=bearer(request);if(!nodeId||!token)return{error:json({error:'node_auth_required'},401)};
  const row=await env.DB.prepare('SELECT id,name,secret_hash,providers,state FROM ai_control_nodes WHERE id=?').bind(nodeId).first();
  if(!row||row.state==='disabled'||await sha256(token)!==row.secret_hash)return{error:json({error:'invalid_node'},401)};
  await env.DB.prepare('UPDATE ai_control_nodes SET state=?,last_seen_at=?,updated_at=? WHERE id=?').bind('online',now(),now(),nodeId).run();
  return{node:{id:row.id,name:row.name,providers:JSON.parse(row.providers||'[]')}};
}

async function onlineNodeProviders(env){
  if(!dbReady(env))return[];const cutoff=new Date(Date.now()-ONLINE_WINDOW_MS).toISOString();
  const data=await env.DB.prepare("SELECT providers FROM ai_control_nodes WHERE state='online' AND last_seen_at>=?").bind(cutoff).all();
  return [...new Set((data.results||[]).flatMap(row=>storedProviders(row.providers)).map(v=>clean(v).toLowerCase()).filter(Boolean))];
}
async function providerPerformanceMetrics(env){
  if(!dbReady(env))return{};
  const cutoff=new Date(Date.now()-AI_ROUTER_SCORE_POLICY.historyWindowHours*60*60*1000).toISOString();
  const recentCutoff=Date.now()-AI_ROUTER_SCORE_POLICY.recentHealthWindowHours*60*60*1000;
  const data=await env.DB.prepare('SELECT provider_id,state,started_at,finished_at FROM ai_control_runs WHERE started_at>=? ORDER BY started_at DESC LIMIT ?').bind(cutoff,AI_ROUTER_SCORE_POLICY.maxHistoryRuns).all();
  const out={};
  for(const row of data.results||[]){const id=clean(row.provider_id).toLowerCase();if(!id)continue;const m=out[id]||(out[id]={totalRuns:0,successfulRuns:0,failedRuns:0,recentRuns:0,recentFailures:0,activeRuns:0,averageLatencyMs:null,_latencyTotal:0,_latencyCount:0});const state=clean(row.state).toLowerCase();const terminal=state==='completed'||state==='failed';if(terminal){m.totalRuns++;if(state==='completed')m.successfulRuns++;else m.failedRuns++;}if(['queued','leased','running'].includes(state))m.activeRuns++;const started=Date.parse(row.started_at||'');if(terminal&&Number.isFinite(started)&&started>=recentCutoff){m.recentRuns++;if(state==='failed')m.recentFailures++;}const finished=Date.parse(row.finished_at||'');if(terminal&&Number.isFinite(started)&&Number.isFinite(finished)&&finished>=started){m._latencyTotal+=finished-started;m._latencyCount++;}}
  for(const m of Object.values(out)){m.averageLatencyMs=m._latencyCount?Math.round(m._latencyTotal/m._latencyCount):null;delete m._latencyTotal;delete m._latencyCount;}return out;
}
async function listNodes(env){
  if(!dbReady(env))throw new Error('state_store_unavailable');const cutoff=Date.now()-ONLINE_WINDOW_MS;
  const data=await env.DB.prepare('SELECT id,name,providers,state,current_load,cpu_load_pct,memory_used_pct,max_concurrency,is_portable,auto_execution_eligible,system_json,created_at,updated_at,last_seen_at FROM ai_control_nodes ORDER BY last_seen_at DESC').all();
  return (data.results||[]).map(row=>({
    ...row,
    providers:storedProviders(row.providers),
    online:row.state!=='disabled'&&Date.parse(row.last_seen_at)>=cutoff,
    scheduler:{
      currentLoad:Number(row.current_load??100),cpuLoadPct:Number(row.cpu_load_pct??100),memoryUsedPct:Number(row.memory_used_pct??100),
      maxConcurrency:Number(row.max_concurrency)||1,isPortable:Number(row.is_portable)===1,autoExecutionEligible:Number(row.auto_execution_eligible)===1,
    },
  }));
}
async function createPairing(env,email){
  if(!dbReady(env))throw new Error('state_store_unavailable');const code=randomPairCode();const created=now();const expires=new Date(Date.now()+10*60*1000).toISOString();
  await env.DB.prepare('INSERT INTO ai_control_node_pairings (code_hash,created_by,created_at,expires_at,used_at) VALUES (?,?,?,?,?)').bind(await sha256(code),email,created,expires,'').run();
  return{code,expiresAt:expires};
}
async function enrollNode(request,env){
  if(!dbReady(env))return json({error:'state_store_unavailable'},503);const input=await body(request)||{};const code=clean(input.code).toUpperCase();const id=safeId(input.nodeId);const name=clean(input.name).slice(0,120)||id;const providers=safeProviders(input.providers);
  if(!code||!id||!providers.length)return json({error:'invalid_enrollment'},400);const hash=await sha256(code);const pairing=await env.DB.prepare("SELECT * FROM ai_control_node_pairings WHERE code_hash=? AND used_at='' AND expires_at>=?").bind(hash,now()).first();
  if(!pairing)return json({error:'pairing_invalid_or_expired'},401);const token=randomToken();const stamp=now();
  await env.DB.prepare("INSERT INTO ai_control_nodes (id,name,secret_hash,providers,state,created_at,updated_at,last_seen_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,secret_hash=excluded.secret_hash,providers=excluded.providers,state='online',updated_at=excluded.updated_at,last_seen_at=excluded.last_seen_at").bind(id,name,await sha256(token),JSON.stringify(providers),'online',stamp,stamp,stamp).run();
  await env.DB.prepare('UPDATE ai_control_node_pairings SET used_at=? WHERE code_hash=?').bind(stamp,hash).run();return json({ok:true,nodeId:id,nodeToken:token,providers},201);
}

async function insertTask(env,task){
  if(!dbReady(env))throw new Error('state_store_unavailable');
  const m=task.missionDecision||{};
  await env.DB.prepare('INSERT INTO ai_control_tasks (id,title,prompt,mode,state,requested_providers,needs_code_branch,branch,governance_json,mission_policy_version,mission_tier,mission_reason,mission_explanation,analysis_only,created_by,created_at,updated_at,approval_state,result_summary,error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(task.id,task.title,task.prompt,'parallel',task.state,JSON.stringify(task.requestedProviders),task.needsCodeBranch?1:0,'',JSON.stringify(task.governance||{}),m.policyVersion||'',m.tier||'',m.reason||'',m.explanation||'',m.analysisOnly?1:0,task.createdBy,task.createdAt,task.updatedAt,'pending','','').run();
}
function taskRow(row){if(!row)return null;const tier=row.mission_tier||'';const governance=JSON.parse(row.governance_json||'{}');return{id:row.id,title:row.title,prompt:row.prompt,mode:'parallel',requestedMode:row.mode||'parallel',state:row.state,requestedProviders:JSON.parse(row.requested_providers||'[]'),needsCodeBranch:Boolean(row.needs_code_branch),branch:row.branch||'',origin:governance.origin||null,executionEnvironment:'development',governance,missionDecision:{policyVersion:row.mission_policy_version||'',tier,reason:row.mission_reason||'',explanation:row.mission_explanation||'',analysisOnly:Boolean(row.analysis_only),forbidden:tier==='forbidden',humanGate:tier==='human_gate',allowModelConsultation:tier!=='forbidden',autonomousActionAllowed:['observe','execute_reversible'].includes(tier),humanApprovalRequired:tier!=='forbidden'},createdBy:row.created_by,createdAt:row.created_at,updatedAt:row.updated_at,approvalState:row.approval_state||'pending',resultSummary:row.result_summary?JSON.parse(row.result_summary):null,error:row.error||''}}
async function getTask(env,id){return dbReady(env)?taskRow(await env.DB.prepare('SELECT * FROM ai_control_tasks WHERE id=?').bind(id).first()):null}
async function listTasks(env){if(!dbReady(env))throw new Error('state_store_unavailable');const data=await env.DB.prepare('SELECT * FROM ai_control_tasks ORDER BY created_at DESC LIMIT 100').all();return(data.results||[]).map(taskRow)}
async function patchTask(env,id,fields){const entries=Object.entries(fields);if(!entries.length)return;await env.DB.prepare(`UPDATE ai_control_tasks SET ${entries.map(([key])=>`${key}=?`).join(',')} WHERE id=?`).bind(...entries.map(([,value])=>typeof value==='object'?JSON.stringify(value):value),id).run()}
async function createRun(env,run){await env.DB.prepare('INSERT INTO ai_control_runs (id,task_id,provider_id,role,state,output,error,started_at,finished_at,router_score,router_score_breakdown,router_score_policy_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(run.id,run.taskId,run.providerId,run.role,run.state,'','',run.startedAt,'',Number(run.routerScore)||0,JSON.stringify(run.routerScoreBreakdown||{}),clean(run.routerScorePolicyVersion)).run()}
async function finishRun(env,run){await env.DB.prepare('UPDATE ai_control_runs SET state=?,output=?,error=?,finished_at=? WHERE id=?').bind(run.state,run.output||'',run.error||'',run.finishedAt||now(),run.id).run()}
async function runs(env,id){if(!dbReady(env))return[];const data=await env.DB.prepare('SELECT * FROM ai_control_runs WHERE task_id=? ORDER BY started_at ASC').bind(id).all();return(data.results||[]).map(row=>({id:row.id,providerId:row.provider_id,role:row.role,state:row.state,ok:row.state==='completed',output:row.output||'',error:row.error||'',startedAt:row.started_at,finishedAt:row.finished_at,routerScore:Number(row.router_score)||0,routerScoreBreakdown:JSON.parse(row.router_score_breakdown||'{}'),routerScorePolicyVersion:row.router_score_policy_version||''}))}
async function allocateBranch(env,task){
  if(!task.needsCodeBranch||env.AI_GITHUB_ORCHESTRATION_ENABLED!=='true')return'';const token=clean(env.GITHUB_TASK_TOKEN);if(!token)throw new Error('branch_allocator_not_configured');const repo=clean(env.GITHUB_REPOSITORY)||'topmaster-joseph/ekodi-platform';
  const response=await fetch(`https://api.github.com/repos/${repo}/actions/workflows/ai-task-allocator.yml/dispatches`,{method:'POST',headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'EKODI-AI-Control'},body:JSON.stringify({ref:'main',inputs:{agent:'generic',task_id:task.id,base_ref:'main'}})});if(!response.ok)throw new Error(`branch_allocator_${response.status}`);return `ai/generic/${task.id.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').slice(0,64)}`;
}
async function enqueueNodeRun(env,task,entry,prompt){
  const stamp=now();const run={id:crypto.randomUUID(),taskId:task.id,providerId:entry.providerId,role:entry.role,state:'queued',startedAt:stamp,routerScore:entry.routerScore,routerScoreBreakdown:entry.routerScoreBreakdown,routerScorePolicyVersion:entry.routerScorePolicyVersion};await createRun(env,run);const jobId=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO ai_control_jobs (id,task_id,run_id,provider_id,role,prompt,branch,repository,needs_code_branch,state,lease_owner,lease_until,output,error,created_at,updated_at,finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(jobId,task.id,run.id,entry.providerId,entry.role,prompt,task.branch||'',clean(env.GITHUB_REPOSITORY)||'topmaster-joseph/ekodi-platform',task.needsCodeBranch?1:0,'queued','','','','',stamp,stamp,'').run();
}
async function executeDirectRun(env,task,entry,prompt){
  const stamp=now();const run={id:crypto.randomUUID(),taskId:task.id,providerId:entry.providerId,role:entry.role,state:'running',output:'',error:'',startedAt:stamp,finishedAt:'',routerScore:entry.routerScore,routerScoreBreakdown:entry.routerScoreBreakdown,routerScorePolicyVersion:entry.routerScorePolicyVersion};await createRun(env,run);
  try{run.output=await invokeProvider(env,entry.providerId,prompt,task,entry.role);run.state='completed'}catch(error){run.state='failed';run.error=clean(error?.message||error)}run.finishedAt=now();await finishRun(env,run);return{...run,ok:run.state==='completed'};
}
async function finalizeTask(env,id){
  const all=await runs(env,id);if(!all.length)return;
  const synthesis=all.find(run=>run.role===AI_CONTROL_POLICY.finalSynthesisRole)||null;
  const collaboration=all.filter(run=>run.role!==AI_CONTROL_POLICY.finalSynthesisRole);
  if(collaboration.some(run=>['queued','leased','running'].includes(run.state)))return;
  const successful=collaboration.filter(run=>run.ok);
  if(!successful.length){const summary=summarizeRuns(all);await patchTask(env,id,{state:'failed',updated_at:now(),result_summary:summary,error:'all_providers_failed'});return}
  if(synthesis){
    if(['queued','leased','running'].includes(synthesis.state))return;
    const task=await getTask(env,id);const origin=taskOrigin(task);const summary={...summarizeRuns(all),origin,responseProvider:synthesis.providerId,originPreserved:isOriginPreserved(task,synthesis.providerId),returnRoute:{provider:origin.provider,channel:origin.channel,requestId:origin.requestId},finalResponse:clean(synthesis.output).slice(0,250000)};
    await patchTask(env,id,{state:synthesis.ok?'approval_required':'failed',updated_at:now(),result_summary:summary,error:synthesis.ok?'':`origin_synthesis_failed:${synthesis.error||'unknown'}`});return;
  }
  const claim=await env.DB.prepare("UPDATE ai_control_tasks SET state='synthesizing',updated_at=? WHERE id=? AND state NOT IN ('synthesizing','approval_required','completed','failed')").bind(now(),id).run();
  if(!claim.meta?.changes)return;
  const task=await getTask(env,id);const nodes=await onlineNodeProviders(env);const capabilities=providerCapabilities(env,nodes);const responseProvider=resolveOriginResponseProvider(task,capabilities);
  if(!responseProvider){await patchTask(env,id,{state:'failed',updated_at:now(),error:'origin_response_provider_unavailable'});return}
  const entry={providerId:responseProvider,role:AI_CONTROL_POLICY.finalSynthesisRole};const prompt=buildOriginSynthesisPrompt(task,successful);
  if(responseProvider.startsWith('node:'))await enqueueNodeRun(env,task,entry,prompt);else{await executeDirectRun(env,task,entry,prompt);await finalizeTask(env,id)}
}
async function execute(env,id){
  let task=await getTask(env,id);if(!task)throw new Error('task_not_found');
  const currentMission=evaluateTaskMissionPolicy(task);
  if(currentMission.forbidden){await patchTask(env,id,{state:'blocked_policy',updated_at:now(),error:`mission_policy:${currentMission.reason}`});return}
  task={...task,mode:'parallel',missionDecision:currentMission};
  await patchTask(env,id,{state:'allocating',updated_at:now(),error:''});
  try{const branch=await allocateBranch(env,task);if(branch){await patchTask(env,id,{branch,updated_at:now()});task={...task,branch}}const nodes=await onlineNodeProviders(env);const metrics=await providerPerformanceMetrics(env);const collaboration=await collaborationPolicy(env);const capabilities=applyCollaborationPolicy(providerCapabilities(env,nodes),collaboration);const plan=buildExecutionPlan(task,{...capabilities,providerMetrics:metrics});if(!plan.length)throw new Error('no_provider_available');await patchTask(env,id,{state:'running',updated_at:now()});
    await Promise.all(plan.map(entry=>{const prompt=rolePrompt(task,entry.role,{branch:task.branch,missionDecision:task.missionDecision});return entry.providerId.startsWith('node:')?enqueueNodeRun(env,task,entry,prompt):executeDirectRun(env,task,entry,prompt)}));await finalizeTask(env,id);
  }catch(error){await patchTask(env,id,{state:'failed',updated_at:now(),error:clean(error?.message||error)});throw error}
}
async function leaseNodeJob(request,env,node){
  const input=await body(request)||{};
  const detected=safeProviders(input.providers);
  const telemetry=safeNodeTelemetry(input);
  const stamp=now();
  await env.DB.prepare(`UPDATE ai_control_nodes SET providers=?,current_load=?,cpu_load_pct=?,memory_used_pct=?,max_concurrency=?,is_portable=?,auto_execution_eligible=?,system_json=?,state='online',updated_at=?,last_seen_at=? WHERE id=?`).bind(
    JSON.stringify(detected.length?detected:node.providers),telemetry.currentLoad,telemetry.cpuLoadPct,telemetry.memoryUsedPct,telemetry.maxConcurrency,
    telemetry.isPortable?1:0,telemetry.autoExecutionEligible?1:0,telemetry.systemJson,stamp,stamp,node.id,
  ).run();
  if(!telemetry.autoExecutionEligible)return json({job:null,scheduler:{eligible:false,reason:telemetry.isPortable?'portable_device':'hardware_eligibility_unknown'}});
  const providers=(detected.length?detected:node.providers).map(v=>`node:${v}`);
  if(!providers.length)return json({job:null,scheduler:{eligible:true,reason:'no_provider'}});
  const placeholders=providers.map(()=>'?').join(',');
  const leaseUntil=new Date(Date.now()+3*60*1000).toISOString();
  const cutoff=new Date(Date.now()-ONLINE_WINDOW_MS).toISOString();
  const [jobRows,nodeRows,activeRows]=await Promise.all([
    env.DB.prepare(`SELECT * FROM ai_control_jobs WHERE (state='queued' OR (state='leased' AND lease_until<?)) AND provider_id IN (${placeholders}) ORDER BY created_at ASC LIMIT 20`).bind(stamp,...providers).all(),
    env.DB.prepare(`SELECT id,name,providers,current_load,max_concurrency,last_seen_at FROM ai_control_nodes WHERE state='online' AND auto_execution_eligible=1 AND is_portable=0 AND last_seen_at>=? ORDER BY current_load ASC,last_seen_at DESC`).bind(cutoff).all(),
    env.DB.prepare("SELECT lease_owner AS node_id,COUNT(*) AS active_count FROM ai_control_jobs WHERE state='leased' AND lease_until>=? AND lease_owner!='' GROUP BY lease_owner").bind(stamp).all(),
  ]);
  const active=new Map((activeRows.results||[]).map(row=>[row.node_id,Number(row.active_count)||0]));
  const nodes=(nodeRows.results||[]).map(row=>({
    id:row.id,name:row.name,providers:storedProviders(row.providers),currentLoad:Number(row.current_load??100),
    maxConcurrency:Math.max(1,Number(row.max_concurrency)||1),activeJobs:active.get(row.id)||0,lastSeenAt:row.last_seen_at,
  }));
  for(const job of jobRows.results||[]){
    const candidates=nodes.filter(candidate=>candidate.providers.some(provider=>`node:${provider}`===job.provider_id)&&candidate.activeJobs<candidate.maxConcurrency);
    candidates.sort(compareLocalExecutionCandidates);
    const chosen=candidates[0];
    if(!chosen||chosen.id!==node.id)continue;
    const result=await env.DB.prepare("UPDATE ai_control_jobs SET state='leased',lease_owner=?,lease_until=?,updated_at=? WHERE id=? AND (state='queued' OR (state='leased' AND lease_until<?))").bind(node.id,leaseUntil,stamp,job.id,stamp).run();
    if(!result.meta?.changes)continue;
    await env.DB.prepare("UPDATE ai_control_runs SET state='leased' WHERE id=?").bind(job.run_id).run();
    return json({job:{id:job.id,taskId:job.task_id,runId:job.run_id,providerId:job.provider_id,role:job.role,prompt:job.prompt,branch:job.branch,repository:job.repository,needsCodeBranch:Boolean(job.needs_code_branch),leaseUntil},scheduler:{eligible:true,strategy:'least_loaded_parallel',selectedNodeId:node.id,currentLoad:chosen.currentLoad,activeJobs:chosen.activeJobs,maxConcurrency:chosen.maxConcurrency}});
  }
  return json({job:null,scheduler:{eligible:true,strategy:'least_loaded_parallel',reason:'another_node_preferred_or_queue_empty'}});
}
async function completeNodeJob(request,env,node,jobId){
  const input=await body(request)||{};const job=await env.DB.prepare('SELECT * FROM ai_control_jobs WHERE id=?').bind(jobId).first();if(!job)return json({error:'job_not_found'},404);if(job.lease_owner!==node.id)return json({error:'job_lease_owner_mismatch'},409);const ok=input.ok===true;const stamp=now();const output=clean(input.output).slice(0,250000);const error=clean(input.error).slice(0,8000);
  await env.DB.prepare('UPDATE ai_control_jobs SET state=?,output=?,error=?,updated_at=?,finished_at=? WHERE id=?').bind(ok?'completed':'failed',output,error,stamp,stamp,jobId).run();await finishRun(env,{id:job.run_id,state:ok?'completed':'failed',output,error,finishedAt:stamp});await finalizeTask(env,job.task_id);return json({ok:true});
}

function commonsConfig(env={}){return{policy:AI_COMMONS_POLICY,authUrl:'https://ekodi.kr/auth/?site=ai&return_to=https%3A%2F%2Fekodi.kr%2Fai%2F',supabaseUrl:clean(env.SUPABASE_URL),supabasePublishableKey:clean(env.SUPABASE_PUBLISHABLE_KEY)}}
async function requireCommonsMember(request,env){
  const token=bearer(request);if(!token)return{error:json({error:'authentication_required'},401)};
  if(!supabaseReady(env))return{error:json({error:'identity_unavailable'},503)};
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`}});
  const user=await response.json().catch(()=>({}));if(!response.ok||!user?.id)return{error:json({error:'invalid_session'},401)};
  return{user:{id:clean(user.id),email:clean(user.email)}};
}
async function ideaFingerprint(input){
  const data=new TextEncoder().encode([input.problem,input.outcome].join('|').toLocaleLowerCase('ko-KR'));
  const digest=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function similarIdeaFingerprint(env,input,fallback){
  if(!dbReady(env))return fallback;
  try{const rows=await env.DB.prepare('SELECT fingerprint,MAX(problem) problem,MAX(outcome) outcome FROM ai_commons_ideas GROUP BY fingerprint ORDER BY MAX(updated_at) DESC LIMIT 200').all();
    const source=input.problem+' '+input.outcome;let best={score:0,fingerprint:fallback};for(const row of rows.results||[]){const score=requestSimilarity(source,(row.problem||'')+' '+(row.outcome||''));if(score>best.score)best={score,fingerprint:row.fingerprint};}
    return best.score>=0.74?best.fingerprint:fallback;
  }catch{return fallback;}
}
async function commonsPage(request,env){
  const target=new URL(request.url);target.pathname='/commons';target.search='';
  const asset=await env.ASSETS.fetch(new Request(target.toString(),request));const out=new Response(asset.body,asset);
  for(const [key,value] of Object.entries(headers()))out.headers.set(key,value);out.headers.set('cache-control','no-store');out.headers.set('x-ekodi-ai-surface','commons');return out;
}


async function requireCommonsSuperAdmin(request,env){
  const central=await centralAdminSession(request,env,'ai:publish');
  if(central){if(central.error)return central;if(central.user?.role!=='super_admin')return{error:json({error:'super_admin_required'},403)};return central;}
  const legacy=await legacySupabaseAdmin(request,env);if(legacy.error)return legacy;
  const allowed=clean(env.SUPER_ADMIN_EMAILS||env.SUPER_ADMIN_EMAIL).split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(!allowed.length||!allowed.includes(legacy.user.email))return{error:json({error:'super_admin_required'},403)};
  return legacy;
}
async function aggregateCommonsIdeas(env,limit=100){
  const sql='SELECT MIN(id) id,fingerprint,MAX(problem) problem,MAX(outcome) outcome,MAX(audience) audience,MAX(current_way) current_way,MAX(status) status,MAX(matched_capability_id) matched_capability_id,MAX(development_task_id) development_task_id,MAX(review_decision) review_decision,(SELECT GROUP_CONCAT(DISTINCT src.source_service_id) FROM ai_commons_idea_sources src WHERE src.fingerprint=ai_commons_ideas.fingerprint) source_services,COUNT(DISTINCT user_id) request_count,MIN(created_at) created_at,MAX(updated_at) updated_at FROM ai_commons_ideas GROUP BY fingerprint ORDER BY request_count DESC,updated_at DESC LIMIT ?';
  const rows=await env.DB.prepare(sql).bind(Math.max(1,Math.min(200,Number(limit)||100))).all();return(rows.results||[]).map(publicIdeaView);
}
async function updateIdeaGroup(env,fingerprint,fields={}){const entries=Object.entries(fields);if(!entries.length)return;await env.DB.prepare('UPDATE ai_commons_ideas SET '+entries.map(([key])=>key+'=?').join(',')+' WHERE fingerprint=?').bind(...entries.map(([,value])=>value),fingerprint).run();}
async function recordCommonsSource(env,userId,fingerprint,sourceServiceId){if(!sourceServiceId)return;try{await env.DB.prepare('INSERT OR IGNORE INTO ai_commons_idea_sources (id,user_id,fingerprint,source_service_id,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),userId,fingerprint,sourceServiceId,now()).run();}catch(error){console.warn('ai commons source',clean(error?.message||error));}}

function commonsVerifiedEvidence(allRuns=[]){
  for(const run of allRuns){if(!String(run.providerId||'').startsWith('node:')||run.state!=='completed')continue;
    const match=String(run.output||'').match(/EKODI_COMMONS_EVIDENCE:\s*(\{[^\r\n]+\})/i);if(!match)continue;
    try{const e=JSON.parse(match[1]);if(e.implementation===true&&e.tests===true&&e.security===true&&e.rollback===true)return{providerId:run.providerId,evidence:e};}catch{}
  }return null;
}
async function startCommonsPipeline(env,ctx,auth,input,fingerprint){
  if(env.AI_TASK_EXECUTION_ENABLED!=='true')return null;const stamp=now();
  const devInput=normalizeTaskInput({title:'AI Commons build: '+input.outcome.slice(0,90),prompt:[
    'Implement the requested EKODI AI Commons execution service in the isolated development branch.',
    'Request: '+input.outcome,'Problem: '+input.problem,'Audience: '+input.audience,
    'Reuse existing EKODI capabilities and shared modules first. Do not deploy to production.',
    'Implement, run relevant tests, perform security and regression checks, and define rollback.',
    'Only after real verification, end your output with exactly one line: EKODI_COMMONS_EVIDENCE: {"implementation":true,"tests":true,"security":true,"rollback":true}',
    'If any item is not verified, do not emit that evidence line. Final public availability is decided only by the EKODI super administrator.'
  ].join('\n'),mode:'parallel',needsCodeBranch:true,governance:{agentId:'chief',area:'software_change',delegated:true,reversible:true,logged:true,preflightVerified:true,existingBoundary:true,rollbackDefined:true,verificationDefined:true,postVerificationRequired:true,production:false}});
  const missionDecision=evaluateTaskMissionPolicy(devInput);const task={...devInput,missionDecision,id:createTaskId(),state:missionDecision.forbidden?'blocked_policy':'queued',createdBy:auth.user.email||auth.user.id,createdAt:stamp,updatedAt:stamp};
  await insertTask(env,task);await updateIdeaGroup(env,fingerprint,{status:'candidate',development_task_id:task.id,updated_at:stamp});
  const work=(async()=>{try{await execute(env,task.id);const finished=await getTask(env,task.id);const evidence=commonsVerifiedEvidence(await runs(env,task.id));
    if(finished?.state==='approval_required'&&evidence){await patchTask(env,task.id,{approval_state:'system_verified',state:'completed',updated_at:now()});await updateIdeaGroup(env,fingerprint,{status:'verified',updated_at:now()});await updateIdeaGroup(env,fingerprint,{status:'staged',updated_at:now()});}
    else if(finished?.state==='approval_required')await updateIdeaGroup(env,fingerprint,{status:'sandboxed',updated_at:now()});else await updateIdeaGroup(env,fingerprint,{status:'triaged',updated_at:now()});
  }catch{await updateIdeaGroup(env,fingerprint,{status:'triaged',updated_at:now()});}})();if(ctx?.waitUntil)ctx.waitUntil(work);return task;
}
async function handleCommonsAdmin(request,env,url){
  const auth=await requireCommonsSuperAdmin(request,env);if(auth.error)return auth.error;if(!dbReady(env))return json({error:'state_store_unavailable'},503);
  if(request.method==='GET'&&url.pathname==='/api/commons/admin/requests')return json({requests:await aggregateCommonsIdeas(env,200),finalPublishAuthority:'super_admin'});
  const match=url.pathname.match(/^\/api\/commons\/admin\/requests\/([a-f0-9]{64})\/decision$/);if(request.method==='POST'&&match){
    const input=await body(request)||{};const decision=clean(input.decision).toLowerCase();const fingerprint=match[1];const rows=await aggregateCommonsIdeas(env,200);const idea=rows.find(item=>item.fingerprint===fingerprint);if(!idea)return json({error:'request_not_found'},404);
    if(decision==='publish'){if(!canFinalPublish(idea.status))return json({error:'request_not_staged'},409);await updateIdeaGroup(env,fingerprint,{status:'shared',review_decision:'publish',reviewed_by:auth.user.email,reviewed_at:now(),published_service_id:clean(input.serviceId),updated_at:now()});}
    else if(decision==='hold')await updateIdeaGroup(env,fingerprint,{review_decision:'hold',reviewed_by:auth.user.email,reviewed_at:now(),updated_at:now()});
    else if(decision==='reject')await updateIdeaGroup(env,fingerprint,{status:'rejected',review_decision:'reject',reviewed_by:auth.user.email,reviewed_at:now(),updated_at:now()});
    else return json({error:'invalid_decision'},400);return json({ok:true,decision});
  }
  return json({error:'not_found'},404);
}

async function handleCommonsApi(request,env,ctx){
  const url=new URL(request.url);if(!url.pathname.startsWith('/api/commons/'))return null;
  if(url.pathname.startsWith('/api/commons/admin/'))return handleCommonsAdmin(request,env,url);
  if(request.method==='GET'&&url.pathname==='/api/commons/config')return json(commonsConfig(env));
  if(request.method==='GET'&&url.pathname==='/api/commons/services')return json(executionCatalogSnapshot(capabilityRegistry));
  if(request.method==='GET'&&url.pathname==='/api/commons/capabilities')return json({policy:AI_COMMONS_POLICY,capabilities:listCommonCapabilities(capabilityRegistry)});
  if(request.method==='GET'&&url.pathname==='/api/commons/requests'){
    if(!dbReady(env))return json({requests:[]});try{return json({requests:await aggregateCommonsIdeas(env,100)})}catch{return json({requests:[],schemaReady:false})}
  }
  if(request.method==='POST'&&url.pathname==='/api/commons/match'){
    const input=await body(request)||{};const job=clean(input.job);if(!job||job.length>1200)return json({error:'invalid_job'},400);
    return json({services:rankExecutionServices(job,capabilityRegistry,5),matches:rankCommonCapabilities(job,capabilityRegistry,5)});
  }
  if(url.pathname==='/api/commons/ideas'){
    const auth=await requireCommonsMember(request,env);if(auth.error)return auth.error;if(!dbReady(env))return json({error:'state_store_unavailable'},503);
    if(request.method==='GET'){
      try{const rows=await env.DB.prepare('SELECT id,fingerprint,problem,outcome,audience,current_way,source_service_id,status,matched_capability_id,development_task_id,review_decision,created_at,updated_at FROM ai_commons_ideas WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(auth.user.id).all();return json({ideas:(rows.results||[]).map(publicIdeaView)})}catch{return json({error:'ai_commons_schema_unavailable'},503)}
    }
    if(request.method==='POST'){
      let input;try{input=normalizeAiIdeaInput(await body(request)||{})}catch(error){return json({error:error.message},400)}
      const services=rankExecutionServices(input.job,capabilityRegistry,5);const matches=rankCommonCapabilities(input.job,capabilityRegistry,5);const status=suggestedIdeaState(matches);const matchedCapabilityId=matches[0]?.id||null;const exactFingerprint=await ideaFingerprint(input);const fingerprint=await similarIdeaFingerprint(env,input,exactFingerprint);const stamp=now();
      try{
        const mine=await env.DB.prepare('SELECT id,fingerprint,problem,outcome,audience,current_way,source_service_id,status,matched_capability_id,development_task_id,review_decision,created_at,updated_at FROM ai_commons_ideas WHERE user_id=? AND fingerprint=? LIMIT 1').bind(auth.user.id,fingerprint).first();
        if(mine){await recordCommonsSource(env,auth.user.id,fingerprint,input.sourceServiceId);const count=await env.DB.prepare('SELECT COUNT(DISTINCT user_id) n FROM ai_commons_ideas WHERE fingerprint=?').bind(fingerprint).first();return json({idea:publicIdeaView({...mine,request_count:count?.n||1}),services,matches,reusedSubmission:true});}
        const group=await env.DB.prepare('SELECT status,matched_capability_id,development_task_id,review_decision FROM ai_commons_ideas WHERE fingerprint=? ORDER BY created_at ASC LIMIT 1').bind(fingerprint).first();
        const inheritedStatus=group?.status||status;const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO ai_commons_ideas (id,user_id,user_email,fingerprint,problem,outcome,audience,current_way,source_service_id,status,matched_capability_id,development_task_id,review_decision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,auth.user.id,auth.user.email||null,fingerprint,input.problem,input.outcome,input.audience,input.currentWay,input.sourceServiceId||'',inheritedStatus,group?.matched_capability_id||matchedCapabilityId,group?.development_task_id||null,group?.review_decision||null,stamp,stamp).run();
        await recordCommonsSource(env,auth.user.id,fingerprint,input.sourceServiceId);
        if(!group&&inheritedStatus==='submitted')await startCommonsPipeline(env,ctx,auth,input,fingerprint);
        const count=await env.DB.prepare('SELECT COUNT(DISTINCT user_id) n FROM ai_commons_ideas WHERE fingerprint=?').bind(fingerprint).first();const latest=await env.DB.prepare('SELECT * FROM ai_commons_ideas WHERE id=?').bind(id).first();return json({idea:publicIdeaView({...latest,request_count:count?.n||1}),services,matches,reusedSubmission:Boolean(group)},201);
      }catch(error){console.error('ai commons idea',clean(error?.message||error));return json({error:'ai_commons_schema_unavailable'},503)}
    }
  }
  return json({error:'not_found'},404);
}

function adminControlRedirect(){
  const target='https://ekodi.kr/admin/services/common-services?service=ai';
  const redirect=Response.redirect(target,307);
  const response=new Response(redirect.body,redirect);
  response.headers.set('cache-control','no-store');
  response.headers.set('x-content-type-options','nosniff');
  response.headers.set('x-robots-tag','noindex, nofollow, noarchive');
  response.headers.set('x-ekodi-route','ai-runtime-admin-handoff');
  return response;
}
function taskId(path,suffix=''){const match=path.match(new RegExp(`^/api/tasks/([^/]+)${suffix}$`));return match?decodeURIComponent(match[1]):''}
function nodeJobId(path){const match=path.match(/^\/api\/node\/jobs\/([^/]+)\/complete$/);return match?decodeURIComponent(match[1]):''}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(['GET','HEAD'].includes(request.method)&&(url.pathname==='/admin'||url.pathname==='/admin/'))return adminControlRedirect();
  if(['GET','HEAD'].includes(request.method)&&(url.pathname==='/'||url.pathname==='/index.html'))return commonsPage(request,env);
  if(url.pathname==='/config.js')return json({error:'operator_surface_moved',adminUrl:config(env).adminUrl},410);
  if(request.method==='GET'&&url.pathname==='/__health')return json({ok:true,platform:'ai-control',architectureVersion:config(env).architectureVersion,surface:'runtime-and-commons',commons:true,commonsPolicy:AI_COMMONS_POLICY.version});
  const commons=await handleCommonsApi(request,env,ctx);if(commons)return commons;
  if(request.method==='GET'&&url.pathname==='/api/status'){const auth=await requireAdmin(request,env,'ai:read');if(auth.error)return auth.error;const nodes=await onlineNodeProviders(env);const metrics=await providerPerformanceMetrics(env);let collaboration;try{collaboration=await collaborationPolicy(env)}catch{return json({error:'collaboration_policy_invalid'},503)}const providers=providerStatus(env,nodes).map(item=>({...item,routingEnabled:item.automaticEligible!==false&&(item.id!=='openai-api'||collaboration.policy?.openai?.enabled!==false),routerMetrics:metrics[item.id]||null}));const weights=collaboration.policy?.router?.weights||AI_ROUTER_SCORE_POLICY.weights;return json({ok:true,platform:'ai-control',config:config(env),providers,costPolicy:collaboration.policy?.resources?.funding||null,routerScorePolicy:{version:AI_ROUTER_SCORE_POLICY.version,weights,historyWindowHours:AI_ROUTER_SCORE_POLICY.historyWindowHours,recentHealthWindowHours:AI_ROUTER_SCORE_POLICY.recentHealthWindowHours},collaboration:{revision:collaboration.revision||0,source:collaboration.source||'defaults',maxParallelCollaborators:Number(collaboration.policy?.governance?.maxParallelCollaborators)||4},stateStore:dbReady(env)?'ready':'unavailable',onlineNodeProviders:nodes,authoritySource:auth.source||'admin'})}
  if(url.pathname==='/api/auth/exchange')return json({error:'service_local_auth_retired',adminUrl:config(env).adminUrl},410);
  if(request.method==='POST'&&url.pathname==='/api/node/enroll')return enrollNode(request,env);
  if(url.pathname.startsWith('/api/node/')){
    const auth=await requireNode(request,env);if(auth.error)return auth.error;
    if(request.method==='POST'&&url.pathname==='/api/node/lease')return leaseNodeJob(request,env,auth.node);
    const jobId=nodeJobId(url.pathname);if(request.method==='POST'&&jobId)return completeNodeJob(request,env,auth.node,jobId);
    return json({error:'not_found'},404);
  }
  if(url.pathname.startsWith('/api/')){
    const writeAction=request.method!=='GET'&&request.method!=='HEAD';
    const auth=await requireAdmin(request,env,writeAction?'ai:operate':'ai:read');if(auth.error)return auth.error;
    if(request.method==='GET'&&url.pathname==='/api/session')return json({ok:true,user:auth.user,authoritySource:auth.source||'admin'});
    if(request.method==='GET'&&url.pathname==='/api/nodes'){try{return json({nodes:await listNodes(env)})}catch(error){return json({error:error.message},503)}}
    if(request.method==='POST'&&url.pathname==='/api/nodes/pair'){try{return json(await createPairing(env,auth.user.email),201)}catch(error){return json({error:error.message},503)}}
    if(request.method==='GET'&&url.pathname==='/api/tasks'){try{return json({tasks:await listTasks(env)})}catch(error){return json({error:error.message},503)}}
    if(request.method==='POST'&&url.pathname==='/api/tasks'){
      if(env.AI_TASK_EXECUTION_ENABLED!=='true')return json({error:'task_execution_disabled'},503);
      try{const input=normalizeTaskInput(await body(request)||{});const missionDecision=evaluateTaskMissionPolicy(input);const stamp=now();const task={...input,missionDecision,id:createTaskId(),state:missionDecision.forbidden?'blocked_policy':'queued',createdBy:auth.user.email,createdAt:stamp,updatedAt:stamp};await insertTask(env,task);return json({task},201)}catch(error){return json({error:error.message},error.message==='state_store_unavailable'?503:400)}
    }
    const runId=taskId(url.pathname,'/run');if(request.method==='POST'&&runId){const task=await getTask(env,runId);if(!task)return json({error:'task_not_found'},404);const missionDecision=evaluateTaskMissionPolicy(task);if(!missionDecision.allowModelConsultation)return json({error:'mission_policy_forbidden',reason:missionDecision.reason},409);await patchTask(env,runId,{state:'allocating',updated_at:now()});ctx.waitUntil(execute(env,runId).catch(()=>{}));return json({ok:true,taskId:runId,state:'allocating',mode:'parallel',maxParallelProviders:AI_CONTROL_POLICY.maxParallelProviders,origin:taskOrigin(task),missionDecision},202)}
    const approveId=taskId(url.pathname,'/approve');if(request.method==='POST'&&approveId){const task=await getTask(env,approveId);if(!task)return json({error:'task_not_found'},404);if(task.state!=='approval_required')return json({error:'task_not_ready_for_approval'},409);await patchTask(env,approveId,{approval_state:'approved',state:'completed',updated_at:now()});return json({ok:true,task:await getTask(env,approveId)})}
    const id=taskId(url.pathname);if(request.method==='GET'&&id){const task=await getTask(env,id);return task?json({task,runs:await runs(env,id)}):json({error:'task_not_found'},404)}
    return json({error:'not_found'},404);
  }
  return env.ASSETS.fetch(request);
}};
