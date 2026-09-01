import {AI_CONTROL_POLICY,buildExecutionPlan,createTaskId,normalizeTaskInput,rolePrompt,summarizeRuns} from './ai-control-core.js';
import {invokeProvider,providerCapabilities,providerStatus} from './ai-control-provider-router.js';

const clean=value=>String(value??'').trim();
const now=()=>new Date().toISOString();
const ONLINE_WINDOW_MS=10*60*1000;
function headers(){return{'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://auth.ekodi.kr https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers()}})}
async function body(request){try{return await request.json()}catch{return null}}
function config(env={}){return{platform:'ai-control',mode:env.AI_CONTROL_MODE||'free-first',policyVersion:AI_CONTROL_POLICY.version,authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=ai&return_to=https%3A%2F%2Fai.ekodi.kr%2F',taskExecutionEnabled:env.AI_TASK_EXECUTION_ENABLED==='true',branchAllocationEnabled:env.AI_GITHUB_ORCHESTRATION_ENABLED==='true',humanApprovalRequired:true,nodePairingEnabled:true}}
function dbReady(env){return Boolean(env.DB&&typeof env.DB.prepare==='function')}
function supabaseReady(env){return Boolean(clean(env.SUPABASE_URL)&&clean(env.SUPABASE_PUBLISHABLE_KEY))}
function bearer(request){const value=clean(request.headers.get('authorization'));return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():''}
function safeId(value){const id=clean(value).toLowerCase();return /^[a-z0-9][a-z0-9._-]{2,79}$/.test(id)?id:''}
function safeProviders(values){return [...new Set((Array.isArray(values)?values:[]).map(v=>clean(v).toLowerCase()).filter(v=>['codex','gemini-cli','claude-code'].includes(v)))]}
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
async function requireAdmin(request,env){
  const token=bearer(request);if(!token)return{error:json({error:'authentication_required'},401)};
  if(!supabaseReady(env))return{error:json({error:'identity_unavailable'},503)};
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`}});
  const user=await response.json().catch(()=>({}));if(!response.ok)return{error:json({error:'invalid_session'},401)};
  const email=clean(user?.email).toLowerCase();const admins=clean(env.ADMIN_EMAILS||env.ADMIN_EMAIL).split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(!email||!admins.includes(email))return{error:json({error:'admin_required'},403)};
  return{user:{id:clean(user.id),email}};
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
  return [...new Set((data.results||[]).flatMap(row=>JSON.parse(row.providers||'[]')).map(v=>clean(v).toLowerCase()).filter(Boolean))];
}
async function listNodes(env){
  if(!dbReady(env))throw new Error('state_store_unavailable');const cutoff=Date.now()-ONLINE_WINDOW_MS;
  const data=await env.DB.prepare('SELECT id,name,providers,state,created_at,updated_at,last_seen_at FROM ai_control_nodes ORDER BY last_seen_at DESC').all();
  return (data.results||[]).map(row=>({...row,providers:JSON.parse(row.providers||'[]'),online:row.state!=='disabled'&&Date.parse(row.last_seen_at)>=cutoff}));
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
  await env.DB.prepare('INSERT INTO ai_control_tasks (id,title,prompt,mode,state,requested_providers,needs_code_branch,branch,created_by,created_at,updated_at,approval_state,result_summary,error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(task.id,task.title,task.prompt,task.mode,task.state,JSON.stringify(task.requestedProviders),task.needsCodeBranch?1:0,'',task.createdBy,task.createdAt,task.updatedAt,'pending','','').run();
}
function taskRow(row){if(!row)return null;return{id:row.id,title:row.title,prompt:row.prompt,mode:row.mode,state:row.state,requestedProviders:JSON.parse(row.requested_providers||'[]'),needsCodeBranch:Boolean(row.needs_code_branch),branch:row.branch||'',createdBy:row.created_by,createdAt:row.created_at,updatedAt:row.updated_at,approvalState:row.approval_state||'pending',resultSummary:row.result_summary?JSON.parse(row.result_summary):null,error:row.error||''}}
async function getTask(env,id){return dbReady(env)?taskRow(await env.DB.prepare('SELECT * FROM ai_control_tasks WHERE id=?').bind(id).first()):null}
async function listTasks(env){if(!dbReady(env))throw new Error('state_store_unavailable');const data=await env.DB.prepare('SELECT * FROM ai_control_tasks ORDER BY created_at DESC LIMIT 100').all();return(data.results||[]).map(taskRow)}
async function patchTask(env,id,fields){const entries=Object.entries(fields);if(!entries.length)return;await env.DB.prepare(`UPDATE ai_control_tasks SET ${entries.map(([key])=>`${key}=?`).join(',')} WHERE id=?`).bind(...entries.map(([,value])=>typeof value==='object'?JSON.stringify(value):value),id).run()}
async function createRun(env,run){await env.DB.prepare('INSERT INTO ai_control_runs (id,task_id,provider_id,role,state,output,error,started_at,finished_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(run.id,run.taskId,run.providerId,run.role,run.state,'','',run.startedAt,'').run()}
async function finishRun(env,run){await env.DB.prepare('UPDATE ai_control_runs SET state=?,output=?,error=?,finished_at=? WHERE id=?').bind(run.state,run.output||'',run.error||'',run.finishedAt||now(),run.id).run()}
async function runs(env,id){if(!dbReady(env))return[];const data=await env.DB.prepare('SELECT * FROM ai_control_runs WHERE task_id=? ORDER BY started_at ASC').bind(id).all();return(data.results||[]).map(row=>({id:row.id,providerId:row.provider_id,role:row.role,state:row.state,ok:row.state==='completed',output:row.output||'',error:row.error||'',startedAt:row.started_at,finishedAt:row.finished_at}))}
async function finalizeTask(env,id){
  const all=await runs(env,id);if(!all.length||all.some(run=>['queued','leased','running'].includes(run.state)))return;
  const summary=summarizeRuns(all);await patchTask(env,id,{state:summary.successful?'approval_required':'failed',updated_at:now(),result_summary:summary,error:summary.successful?'':'all_providers_failed'});
}
async function allocateBranch(env,task){
  if(!task.needsCodeBranch||env.AI_GITHUB_ORCHESTRATION_ENABLED!=='true')return'';const token=clean(env.GITHUB_TASK_TOKEN);if(!token)throw new Error('branch_allocator_not_configured');const repo=clean(env.GITHUB_REPOSITORY)||'topmaster-joseph/ekodi-platform';
  const response=await fetch(`https://api.github.com/repos/${repo}/actions/workflows/ai-task-allocator.yml/dispatches`,{method:'POST',headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'EKODI-AI-Control'},body:JSON.stringify({ref:'main',inputs:{agent:'generic',task_id:task.id,base_ref:'main'}})});if(!response.ok)throw new Error(`branch_allocator_${response.status}`);return `ai/generic/${task.id.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').slice(0,64)}`;
}
async function enqueueNodeRun(env,task,entry,prompt){
  const stamp=now();const run={id:crypto.randomUUID(),taskId:task.id,providerId:entry.providerId,role:entry.role,state:'queued',startedAt:stamp};await createRun(env,run);const jobId=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO ai_control_jobs (id,task_id,run_id,provider_id,role,prompt,branch,repository,needs_code_branch,state,lease_owner,lease_until,output,error,created_at,updated_at,finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(jobId,task.id,run.id,entry.providerId,entry.role,prompt,task.branch||'',clean(env.GITHUB_REPOSITORY)||'topmaster-joseph/ekodi-platform',task.needsCodeBranch?1:0,'queued','','','','',stamp,stamp,'').run();
}
async function executeDirectRun(env,task,entry,prompt){
  const stamp=now();const run={id:crypto.randomUUID(),taskId:task.id,providerId:entry.providerId,role:entry.role,state:'running',output:'',error:'',startedAt:stamp,finishedAt:''};await createRun(env,run);
  try{run.output=await invokeProvider(env,entry.providerId,prompt,task,entry.role);run.state='completed'}catch(error){run.state='failed';run.error=clean(error?.message||error)}run.finishedAt=now();await finishRun(env,run);
}
async function execute(env,id){
  let task=await getTask(env,id);if(!task)throw new Error('task_not_found');await patchTask(env,id,{state:'allocating',updated_at:now(),error:''});
  try{const branch=await allocateBranch(env,task);if(branch){await patchTask(env,id,{branch,updated_at:now()});task={...task,branch}}const nodes=await onlineNodeProviders(env);const plan=buildExecutionPlan(task,providerCapabilities(env,nodes));if(!plan.length)throw new Error('no_provider_available');await patchTask(env,id,{state:'running',updated_at:now()});
    for(const entry of plan){const prompt=rolePrompt(task,entry.role,{branch:task.branch});if(entry.providerId.startsWith('node:'))await enqueueNodeRun(env,task,entry,prompt);else await executeDirectRun(env,task,entry,prompt)}await finalizeTask(env,id);
  }catch(error){await patchTask(env,id,{state:'failed',updated_at:now(),error:clean(error?.message||error)});throw error}
}
async function leaseNodeJob(request,env,node){
  const input=await body(request)||{};const detected=safeProviders(input.providers);if(detected.length)await env.DB.prepare('UPDATE ai_control_nodes SET providers=?,updated_at=?,last_seen_at=? WHERE id=?').bind(JSON.stringify(detected),now(),now(),node.id).run();const providers=(detected.length?detected:node.providers).map(v=>`node:${v}`);if(!providers.length)return json({job:null});
  const placeholders=providers.map(()=>'?').join(',');const stamp=now();const leaseUntil=new Date(Date.now()+3*60*1000).toISOString();const job=await env.DB.prepare(`SELECT * FROM ai_control_jobs WHERE (state='queued' OR (state='leased' AND lease_until<?)) AND provider_id IN (${placeholders}) ORDER BY created_at ASC LIMIT 1`).bind(stamp,...providers).first();if(!job)return json({job:null});
  const result=await env.DB.prepare("UPDATE ai_control_jobs SET state='leased',lease_owner=?,lease_until=?,updated_at=? WHERE id=? AND (state='queued' OR (state='leased' AND lease_until<?))").bind(node.id,leaseUntil,stamp,job.id,stamp).run();if(!result.meta?.changes)return json({job:null});await env.DB.prepare("UPDATE ai_control_runs SET state='leased' WHERE id=?").bind(job.run_id).run();return json({job:{id:job.id,taskId:job.task_id,runId:job.run_id,providerId:job.provider_id,role:job.role,prompt:job.prompt,branch:job.branch,repository:job.repository,needsCodeBranch:Boolean(job.needs_code_branch),leaseUntil}});
}
async function completeNodeJob(request,env,node,jobId){
  const input=await body(request)||{};const job=await env.DB.prepare('SELECT * FROM ai_control_jobs WHERE id=?').bind(jobId).first();if(!job)return json({error:'job_not_found'},404);if(job.lease_owner!==node.id)return json({error:'job_lease_owner_mismatch'},409);const ok=input.ok===true;const stamp=now();const output=clean(input.output).slice(0,250000);const error=clean(input.error).slice(0,8000);
  await env.DB.prepare('UPDATE ai_control_jobs SET state=?,output=?,error=?,updated_at=?,finished_at=? WHERE id=?').bind(ok?'completed':'failed',output,error,stamp,stamp,jobId).run();await finishRun(env,{id:job.run_id,state:ok?'completed':'failed',output,error,finishedAt:stamp});await finalizeTask(env,job.task_id);return json({ok:true});
}
function taskId(path,suffix=''){const match=path.match(new RegExp(`^/api/tasks/([^/]+)${suffix}$`));return match?decodeURIComponent(match[1]):''}
function nodeJobId(path){const match=path.match(/^\/api\/node\/jobs\/([^/]+)\/complete$/);return match?decodeURIComponent(match[1]):''}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/config.js')return new Response(`window.EKODI_AI_CONFIG=${JSON.stringify(config(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...headers()}});
  if(request.method==='GET'&&url.pathname==='/api/status'){const nodes=await onlineNodeProviders(env);return json({ok:true,platform:'ai-control',config:config(env),providers:providerStatus(env,nodes),stateStore:dbReady(env)?'ready':'unavailable',onlineNodeProviders:nodes})}
  if(request.method==='POST'&&url.pathname==='/api/auth/exchange')return exchangeAuth(request,env);
  if(request.method==='POST'&&url.pathname==='/api/node/enroll')return enrollNode(request,env);
  if(url.pathname.startsWith('/api/node/')){
    const auth=await requireNode(request,env);if(auth.error)return auth.error;
    if(request.method==='POST'&&url.pathname==='/api/node/lease')return leaseNodeJob(request,env,auth.node);
    const jobId=nodeJobId(url.pathname);if(request.method==='POST'&&jobId)return completeNodeJob(request,env,auth.node,jobId);
    return json({error:'not_found'},404);
  }
  if(url.pathname.startsWith('/api/')){
    const auth=await requireAdmin(request,env);if(auth.error)return auth.error;
    if(request.method==='GET'&&url.pathname==='/api/session')return json({ok:true,user:auth.user});
    if(request.method==='GET'&&url.pathname==='/api/nodes'){try{return json({nodes:await listNodes(env)})}catch(error){return json({error:error.message},503)}}
    if(request.method==='POST'&&url.pathname==='/api/nodes/pair'){try{return json(await createPairing(env,auth.user.email),201)}catch(error){return json({error:error.message},503)}}
    if(request.method==='GET'&&url.pathname==='/api/tasks'){try{return json({tasks:await listTasks(env)})}catch(error){return json({error:error.message},503)}}
    if(request.method==='POST'&&url.pathname==='/api/tasks'){
      if(env.AI_TASK_EXECUTION_ENABLED!=='true')return json({error:'task_execution_disabled'},503);
      try{const input=normalizeTaskInput(await body(request)||{});const stamp=now();const task={...input,id:createTaskId(),state:'queued',createdBy:auth.user.email,createdAt:stamp,updatedAt:stamp};await insertTask(env,task);return json({task},201)}catch(error){return json({error:error.message},error.message==='state_store_unavailable'?503:400)}
    }
    const runId=taskId(url.pathname,'/run');if(request.method==='POST'&&runId){if(!await getTask(env,runId))return json({error:'task_not_found'},404);await patchTask(env,runId,{state:'allocating',updated_at:now()});ctx.waitUntil(execute(env,runId).catch(()=>{}));return json({ok:true,taskId:runId,state:'allocating'},202)}
    const approveId=taskId(url.pathname,'/approve');if(request.method==='POST'&&approveId){const task=await getTask(env,approveId);if(!task)return json({error:'task_not_found'},404);if(task.state!=='approval_required')return json({error:'task_not_ready_for_approval'},409);await patchTask(env,approveId,{approval_state:'approved',state:'completed',updated_at:now()});return json({ok:true,task:await getTask(env,approveId)})}
    const id=taskId(url.pathname);if(request.method==='GET'&&id){const task=await getTask(env,id);return task?json({task,runs:await runs(env,id)}):json({error:'task_not_found'},404)}
    return json({error:'not_found'},404);
  }
  return env.ASSETS.fetch(request);
}};
