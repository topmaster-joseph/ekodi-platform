import { getEkodiCommandTask, ingestEkodiPulse } from './ekodi-command-ledger.js';
import { runEkodiCommandQueue } from './ekodi-pulse-runtime.js';

const TERMINAL_STATES=new Set(['completed','blocked','failed','cancelled']);
const CANCELLABLE_STATES=new Set(['received','triaged','assigned']);
const NON_RELEASABLE_STATES=new Set(['blocked','failed','cancelled']);

const GITHUB_REPOSITORY='topmaster-joseph/ekodi-platform';
const GITHUB_API='https://api.github.com';
const REQUIRED_COMPLETION_WORKFLOWS=Object.freeze(['CI','EKODI AI Orchestration Gate']);
const LIVE_HEALTH_URL='https://ekodi.kr/api/health';

function githubHeaders(){return {Accept:'application/vnd.github+json','User-Agent':'ekodi-orchestrator-completion-reconciler','X-GitHub-Api-Version':'2022-11-28'}}

async function fetchJson(url,{fetchImpl=fetch}={}){
  let response=null;
  try{response=await fetchImpl(url,{headers:githubHeaders(),redirect:'follow'})}catch(error){return {ok:false,status:0,error:text(error?.message||error,160)}}
  if(!response?.ok)return {ok:false,status:Number(response?.status||0),error:`http_${Number(response?.status||0)}`};
  try{return {ok:true,status:response.status,data:await response.json()}}catch{return {ok:false,status:response.status,error:'invalid_json'}}
}

function completedSuccess(item){return item?.status==='completed'&&item?.conclusion==='success'}
function productionJob(job){
  const name=text(job?.name,160).toLowerCase();
  return !name.includes('staging')&&(name==='deploy'||name==='production'||name.endsWith(' / deploy')||name.endsWith(' / production')||name.includes('deploy-production')||name.includes('production deploy'));
}
function stagingJob(job){return text(job?.name,160).toLowerCase().includes('staging')}

async function commitContains(baseSha,headSha,{fetchImpl=fetch}={}){
  if(baseSha===headSha)return true;
  const comparison=await fetchJson(`${GITHUB_API}/repos/${GITHUB_REPOSITORY}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(headSha)}`,{fetchImpl});
  return comparison.ok&&['ahead','identical'].includes(text(comparison.data?.status,40).toLowerCase());
}

async function successfulSupersedingDeployRun(original,mergeSha,{fetchImpl=fetch}={}){
  const workflowId=Number(original?.workflow_id||0);
  if(!workflowId)return null;
  const url=new URL(`${GITHUB_API}/repos/${GITHUB_REPOSITORY}/actions/workflows/${workflowId}/runs`);
  url.searchParams.set('branch','main');
  url.searchParams.set('event','push');
  url.searchParams.set('status','success');
  url.searchParams.set('per_page','20');
  const response=await fetchJson(url,{fetchImpl});
  if(!response.ok)return null;
  const candidates=Array.isArray(response.data?.workflow_runs)?response.data.workflow_runs:[];
  for(const candidate of candidates){
    if(!completedSuccess(candidate)||Number(candidate.id)===Number(original.id))continue;
    if(await commitContains(mergeSha,text(candidate.head_sha,80),{fetchImpl}))return candidate;
  }
  return null;
}

export async function collectOrchestratorCompletionEvidence({taskId:id,branchRef,fetchImpl=fetch}={}){
  const task=text(id,160),branch=text(branchRef,220);
  if(!validTaskId(task)||!validReleaseBranch(branch)||!branch.endsWith(`/${task}`))return Object.freeze({verified:false,reason:'invalid_task_or_branch'});

  const pullsUrl=new URL(`${GITHUB_API}/repos/${GITHUB_REPOSITORY}/pulls`);
  pullsUrl.searchParams.set('state','closed');
  pullsUrl.searchParams.set('head',`topmaster-joseph:${branch}`);
  pullsUrl.searchParams.set('per_page','20');
  const pulls=await fetchJson(pullsUrl,{fetchImpl});
  if(!pulls.ok)return Object.freeze({verified:false,reason:'github_pr_lookup_unavailable',status:pulls.status});
  const pr=(Array.isArray(pulls.data)?pulls.data:[])
    .filter(item=>item?.merged_at&&item?.head?.ref===branch&&item?.base?.ref==='main')
    .sort((a,b)=>String(b.merged_at).localeCompare(String(a.merged_at)))[0];
  if(!pr)return Object.freeze({verified:false,reason:'merged_pr_not_found'});
  const mergeSha=text(pr.merge_commit_sha,80);
  if(!/^[a-f0-9]{40}$/i.test(mergeSha))return Object.freeze({verified:false,reason:'merge_commit_missing'});

  const runsUrl=new URL(`${GITHUB_API}/repos/${GITHUB_REPOSITORY}/actions/runs`);
  runsUrl.searchParams.set('head_sha',mergeSha);
  runsUrl.searchParams.set('event','push');
  runsUrl.searchParams.set('per_page','100');
  const runsResponse=await fetchJson(runsUrl,{fetchImpl});
  if(!runsResponse.ok)return Object.freeze({verified:false,reason:'github_workflow_lookup_unavailable',status:runsResponse.status});
  const runs=Array.isArray(runsResponse.data?.workflow_runs)?runsResponse.data.workflow_runs:[];
  for(const required of REQUIRED_COMPLETION_WORKFLOWS){
    const run=runs.find(item=>item?.name===required);
    if(!completedSuccess(run))return Object.freeze({verified:false,reason:'required_workflow_not_successful',workflow:required,state:run?.status||'missing',conclusion:run?.conclusion||null});
  }

  const triggeredDeployRuns=runs.filter(item=>/^Deploy\b/i.test(text(item?.name,160)));
  if(!triggeredDeployRuns.length)return Object.freeze({verified:false,reason:'production_deployment_run_missing'});
  const deployRuns=[];
  for(const original of triggeredDeployRuns){
    let selected=original;
    if(!completedSuccess(selected)){
      const superseding=await successfulSupersedingDeployRun(original,mergeSha,{fetchImpl});
      if(!superseding)return Object.freeze({verified:false,reason:'deployment_run_not_successful',workflow:text(original.name,160),state:original.status||'unknown',conclusion:original.conclusion||null});
      selected={...superseding,_supersedesRunId:Number(original.id)};
    }
    deployRuns.push(selected);
  }

  const deploymentEvidence=[];
  let stagingVerified=false,productionVerified=false;
  for(const run of deployRuns){
    const jobs=await fetchJson(`${GITHUB_API}/repos/${GITHUB_REPOSITORY}/actions/runs/${encodeURIComponent(run.id)}/jobs?per_page=100`,{fetchImpl});
    if(!jobs.ok)return Object.freeze({verified:false,reason:'deployment_job_lookup_unavailable',workflow:text(run.name,160),status:jobs.status});
    const list=Array.isArray(jobs.data?.jobs)?jobs.data.jobs:[];
    const successfulStaging=list.filter(job=>stagingJob(job)&&completedSuccess(job));
    const successfulProduction=list.filter(job=>productionJob(job)&&completedSuccess(job));
    if(successfulStaging.length)stagingVerified=true;
    if(successfulProduction.length)productionVerified=true;
    deploymentEvidence.push(Object.freeze({
      workflow:text(run.name,160),runId:Number(run.id),htmlUrl:text(run.html_url,400),
      supersedesRunId:Number(run._supersedesRunId||0)||null,
      stagingJobs:successfulStaging.map(job=>text(job.name,160)),
      productionJobs:successfulProduction.map(job=>text(job.name,160)),
    }));
  }
  if(!stagingVerified)return Object.freeze({verified:false,reason:'staging_evidence_missing'});
  if(!productionVerified)return Object.freeze({verified:false,reason:'production_promotion_evidence_missing'});

  let healthResponse=null;
  try{healthResponse=await fetchImpl(LIVE_HEALTH_URL,{headers:{Accept:'application/json','User-Agent':'ekodi-orchestrator-completion-reconciler'},cache:'no-store'})}catch(error){return Object.freeze({verified:false,reason:'live_health_unavailable',detail:text(error?.message||error,120)})}
  let health={};
  try{health=await healthResponse.json()}catch{return Object.freeze({verified:false,reason:'live_health_invalid_json',status:Number(healthResponse?.status||0)})}
  if(!healthResponse?.ok||health?.ok!==true)return Object.freeze({verified:false,reason:'live_health_failed',status:Number(healthResponse?.status||0)});

  return Object.freeze({
    verified:true,
    source:'github-public-api-and-live-health',
    taskId:task,
    branchRef:branch,
    pr:Object.freeze({number:Number(pr.number),url:text(pr.html_url,400),mergedAt:text(pr.merged_at,80),mergeCommitSha:mergeSha}),
    requiredWorkflows:Object.freeze(REQUIRED_COMPLETION_WORKFLOWS.map(name=>{
      const run=runs.find(item=>item?.name===name);
      return Object.freeze({name,runId:Number(run.id),url:text(run.html_url,400),conclusion:run.conclusion});
    })),
    deployments:Object.freeze(deploymentEvidence),
    live:Object.freeze({url:LIVE_HEALTH_URL,ok:true,service:text(health.service,120),version:health.version??null,verifiedAt:now()}),
  });
}

async function reconcileCompletionRow(db,env,row,{fetchImpl=fetch}={}){
  if(!row||TERMINAL_STATES.has(row.state)||Number(row.deployment_requested||0)!==1)return row;
  const evidence=await collectOrchestratorCompletionEvidence({taskId:row.task_id,branchRef:row.branch_ref,fetchImpl});
  if(!evidence.verified)return row;
  const updated=now();
  const existingEvidence=parseJson(row.evidence_json,[]);
  const evidenceList=Array.isArray(existingEvidence)?existingEvidence:[existingEvidence].filter(Boolean);
  const completionRecord={kind:'production-completion-reconciliation',source:evidence.source,pr:evidence.pr,requiredWorkflows:evidence.requiredWorkflows,deployments:evidence.deployments,live:evidence.live};
  const previousResult=parseJson(row.result_json,{});
  const resultJson={...(previousResult&&typeof previousResult==='object'&&!Array.isArray(previousResult)?previousResult:{}),ok:true,completion:'reconciled',mergeCommitSha:evidence.pr.mergeCommitSha,completedBy:'ekodi-orchestrator'};
  const result=await db.prepare(`UPDATE ekodi_orchestrator_tasks SET state='completed',state_version=state_version+1,pr_ref=?,
    result_json=?,evidence_json=?,production_evidence_json=?,updated_at=?,completed_at=?
    WHERE task_id=? AND requester_id=? AND state NOT IN ('completed','blocked','failed','cancelled') AND branch_ref=?`)
    .bind(evidence.pr.url,safeJson(resultJson),safeJson([...evidenceList,completionRecord]),safeJson(evidence),updated,updated,row.task_id,row.requester_id,row.branch_ref).run();
  if(changes(result)<1)return ownedTask(db,row.task_id,row.requester_id);
  await db.prepare(`UPDATE ai_command_tasks SET state='verified',result_json=?,evidence_json=?,updated_at=?,closed_at=?,lease_until=NULL
    WHERE id=? AND state NOT IN ('verified','ignored','failed')`)
    .bind(safeJson(resultJson),safeJson(completionRecord),updated,updated,row.task_id).run().catch(()=>null);
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO ekodi_orchestrator_external_refs (task_id,provider,ref_type,ref_value,created_at) VALUES (?,?,?,?,?)').bind(row.task_id,'github','pull_request',String(evidence.pr.number),updated),
    db.prepare('INSERT OR IGNORE INTO ekodi_orchestrator_external_refs (task_id,provider,ref_type,ref_value,created_at) VALUES (?,?,?,?,?)').bind(row.task_id,'github','merge_commit',evidence.pr.mergeCommitSha,updated),
  ]).catch(()=>null);
  await appendEvent(db,row.task_id,row.state,'completed','ekodi-orchestrator-reconciler','verified_production_evidence_reconciled',completionRecord);
  return ownedTask(db,row.task_id,row.requester_id);
}

export async function reconcileOrchestratorTaskCompletion(env,identity,id,{fetchImpl=fetch}={}){
  const db=dbFrom(env),requester=requesterFrom(identity);
  if(!requester)throw new Error('EKODI_REQUESTER_REQUIRED');
  const row=await ownedTask(db,id,requester);
  if(!row)return null;
  return publicTask(await reconcileCompletionRow(db,env,row,{fetchImpl}));
}

function text(value,max=1200){return String(value??'').trim().slice(0,max)}
function safeJson(value,fallback={}){try{return JSON.stringify(value??fallback)}catch{return JSON.stringify(fallback)}}
function parseJson(value,fallback={}){try{return JSON.parse(value||JSON.stringify(fallback))}catch{return fallback}}
function now(){return new Date().toISOString()}
function taskId(){const id=typeof crypto?.randomUUID==='function'?crypto.randomUUID():`${Date.now()}_${Math.random().toString(16).slice(2)}`;return `orch_${id}`}
function dbFrom(env){const db=env?.DB||env;if(!db?.prepare)throw new Error('EKODI_ORCHESTRATOR_DB_REQUIRED');return db}
function requesterFrom(identity){return text(identity?.personId||identity?.ekodiId,160)}
function changes(result){return Number(result?.meta?.changes??result?.changes??0)}
function agentId(value){
  const normalized=text(value,32).toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
  return /^[a-z0-9][a-z0-9._-]{0,31}$/.test(normalized)?normalized:'external-ai';
}
function generatedBranchRef(agent,id){return `ai/${agentId(agent)}/${id}`}
function validTaskId(value){return /^orch_[a-z0-9][a-z0-9_-]{15,120}$/i.test(text(value,160))}
function validReleaseBranch(value){return /^ai\/[a-z0-9][a-z0-9._-]{0,31}\/orch_[a-z0-9][a-z0-9_-]{15,120}$/i.test(text(value,220))}

async function appendEvent(db,id,fromState,toState,actor,reason,evidence=null){
  const row=await db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS seq FROM ekodi_orchestrator_task_events WHERE task_id = ?').bind(id).first();
  const seq=Number(row?.seq||1);
  await db.prepare(`INSERT INTO ekodi_orchestrator_task_events
    (task_id,seq,from_state,to_state,actor,reason,evidence_json,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(id,seq,fromState||null,toState,actor,reason||null,evidence?safeJson(evidence):null,now()).run();
}

function publicTask(row){
  if(!row)return null;
  const result=parseJson(row.result_json,null);
  const evidence=parseJson(row.evidence_json,[]);
  const commandMeta=evidence&&typeof evidence==='object'&&!Array.isArray(evidence)?evidence.commandLedger:null;
  return Object.freeze({
    taskId:row.task_id,
    state:row.state,
    stateVersion:Number(row.state_version||1),
    intent:row.intent,
    target:parseJson(row.target_json,{}),
    risk:row.risk,
    permissionClass:row.permission_class,
    assignedWorker:row.assigned_worker||null,
    branchRef:row.branch_ref||null,
    prRef:row.pr_ref||null,
    deploymentRequested:Number(row.deployment_requested||0)===1,
    commandState:commandMeta?.state||null,
    attemptCount:Number(commandMeta?.attemptCount||0),
    maxAttempts:Number(commandMeta?.maxAttempts||0),
    nextAttemptAt:commandMeta?.nextAttemptAt||null,
    leaseUntil:commandMeta?.leaseUntil||null,
    lastError:commandMeta?.lastError||'',
    result,
    evidence,
    productionEvidence:parseJson(row.production_evidence_json,null),
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    completedAt:row.completed_at||null,
  });
}

async function ownedTask(db,id,requester){
  return db.prepare('SELECT * FROM ekodi_orchestrator_tasks WHERE task_id = ? AND requester_id = ?').bind(text(id,160),requester).first();
}

function mapCommandState(state){
  const value=text(state,40).toLowerCase();
  if(value==='queued')return'assigned';
  if(value==='retry')return'assigned';
  if(value==='running')return'executing';
  if(['verified','core_only'].includes(value))return'completed';
  if(['human_gate','degraded'].includes(value))return'blocked';
  if(value==='ignored')return'cancelled';
  if(value==='failed')return'failed';
  return null;
}

async function syncFromCommandLedger(db,env,row){
  if(!row||TERMINAL_STATES.has(row.state))return row;
  let command=null;
  try{command=await getEkodiCommandTask(env,row.task_id)}catch{return row}
  if(!command)return row;
  let next=mapCommandState(command.state);
  if(!next)return row;
  if(next==='completed'&&Number(row.deployment_requested||0)===1&&!row.production_evidence_json)next='production_verifying';
  const terminal=TERMINAL_STATES.has(next);
  const updated=now();
  const stateChanged=next!==row.state;
  const commandMeta={
    state:command.state,
    attemptCount:Number(command.attemptCount||0),
    maxAttempts:Number(command.maxAttempts||0),
    nextAttemptAt:command.nextAttemptAt||null,
    leaseUntil:command.leaseUntil||null,
    lastError:command.lastError||'',
    updatedAt:command.updatedAt||null,
  };
  const rawEvidence=command.evidence;
  const evidencePayload=rawEvidence&&typeof rawEvidence==='object'&&!Array.isArray(rawEvidence)
    ? {...rawEvidence,commandLedger:commandMeta}
    : {items:Array.isArray(rawEvidence)?rawEvidence:[],commandLedger:commandMeta};
  const result=await db.prepare(`UPDATE ekodi_orchestrator_tasks SET state=?,state_version=state_version+?,
    result_json=?,evidence_json=?,updated_at=?,completed_at=? WHERE task_id=? AND requester_id=? AND state=?`)
    .bind(next,stateChanged?1:0,safeJson(command.result||{}),safeJson(evidencePayload),updated,terminal?updated:null,row.task_id,row.requester_id,row.state).run();
  if(changes(result)>0&&stateChanged)await appendEvent(db,row.task_id,row.state,next,'ekodi-command-plane','command_ledger_sync',commandMeta);
  return ownedTask(db,row.task_id,row.requester_id);
}

export async function submitOrchestratorTask(env,identity,args={}){
  const db=dbFrom(env);const requester=requesterFrom(identity);if(!requester)throw new Error('EKODI_REQUESTER_REQUIRED');
  const intent=text(args.intent||args.goal,1200);if(!intent)throw new Error('EKODI_TASK_INTENT_REQUIRED');
  const risk=['low','normal','high','critical'].includes(text(args.risk,20).toLowerCase())?text(args.risk,20).toLowerCase():'normal';
  const target=args.target&&typeof args.target==='object'?args.target:{};
  const deploymentRequested=args.deploymentRequested===true;
  const agent=agentId(args.agent||'external-ai');
  const rawKey=text(args.idempotencyKey,100);const idempotencyKey=rawKey?`${requester}:${rawKey}`.slice(0,220):null;
  if(idempotencyKey){const existing=await db.prepare('SELECT * FROM ekodi_orchestrator_tasks WHERE idempotency_key = ? AND requester_id = ?').bind(idempotencyKey,requester).first();if(existing)return publicTask(await syncFromCommandLedger(db,env,existing))}
  const id=taskId();const created=now();
  const branchRef=deploymentRequested?generatedBranchRef(agent,id):null;
  await db.batch([
    db.prepare(`INSERT INTO ekodi_orchestrator_tasks
      (task_id,idempotency_key,requester_id,source,intent,target_json,risk,permission_class,branch_ref,state,deployment_requested,evidence_json,created_at,updated_at)
      VALUES (?,?,?,'mcp',?,?,?,'delegated',?,'received',?,'[]',?,?)`)
      .bind(id,idempotencyKey,requester,intent,safeJson(target),risk,branchRef,deploymentRequested?1:0,created,created),
    db.prepare(`INSERT INTO ekodi_orchestrator_task_events
      (task_id,seq,from_state,to_state,actor,reason,evidence_json,created_at) VALUES (?,1,NULL,'received','mcp','authorized_external_submission',NULL,?)`).bind(id,created),
  ]);
  try{
    await ingestEkodiPulse(env,{
      taskId:id,goal:intent,risk,target,
      delegation:{allowed:true,reversible:true,audited:true,preflightVerified:true,verificationDefined:true},
      context:{source:'mcp',orchestratorTaskId:id,requesterBound:true,authorityTransfer:false,branchRef,deploymentRequested},
      event:{id:`pulse_${id}`.slice(0,120),kind:'external_ai_request',source:'mcp',summary:intent,changeClass:deploymentRequested?'yellow':'green',actionable:true,requiresHumanDecision:risk==='high'||risk==='critical'},
    });
    const assigned=now();
    await db.prepare("UPDATE ekodi_orchestrator_tasks SET state='assigned',state_version=state_version+1,assigned_worker='ekodi-command-plane',updated_at=? WHERE task_id=? AND requester_id=? AND state='received'").bind(assigned,id,requester).run();
    await appendEvent(db,id,'received','assigned','ekodi-orchestrator','queued_for_command_plane',{worker:'ekodi-command-plane'});
    await runEkodiCommandQueue(env,{limit:1,taskId:id});
  }catch(error){
    const failed=now();
    await db.prepare("UPDATE ekodi_orchestrator_tasks SET state='failed',state_version=state_version+1,dead_letter_reason=?,updated_at=?,completed_at=? WHERE task_id=? AND requester_id=?").bind(text(error?.message||error,500),failed,failed,id,requester).run();
    await appendEvent(db,id,'received','failed','ekodi-orchestrator','queue_submission_failed');
  }
  return publicTask(await syncFromCommandLedger(db,env,await ownedTask(db,id,requester)));
}

export async function getOrchestratorTaskStatus(env,identity,id){
  const db=dbFrom(env);const requester=requesterFrom(identity);if(!requester)throw new Error('EKODI_REQUESTER_REQUIRED');
  let row=await ownedTask(db,id,requester);if(!row)return null;
  if(Number(row.deployment_requested||0)===1&&!TERMINAL_STATES.has(row.state)){
    try{row=await reconcileCompletionRow(db,env,row,{fetchImpl:fetch})}catch{}
  }
  if(!TERMINAL_STATES.has(row.state))row=await syncFromCommandLedger(db,env,row);
  return publicTask(row);
}

export async function cancelOrchestratorTask(env,identity,id){
  const db=dbFrom(env);const requester=requesterFrom(identity);if(!requester)throw new Error('EKODI_REQUESTER_REQUIRED');
  const row=await ownedTask(db,id,requester);if(!row)return null;
  if(TERMINAL_STATES.has(row.state))return Object.freeze({...publicTask(row),cancelled:false,reason:'already_terminal'});
  if(!CANCELLABLE_STATES.has(row.state))return Object.freeze({...publicTask(row),cancelled:false,reason:'task_in_flight'});
  const updated=now();
  const result=await db.prepare("UPDATE ekodi_orchestrator_tasks SET state='cancelled',state_version=state_version+1,updated_at=?,completed_at=? WHERE task_id=? AND requester_id=? AND state IN ('received','triaged','assigned')").bind(updated,updated,row.task_id,requester).run();
  if(changes(result)<1)return Object.freeze({...publicTask(await ownedTask(db,row.task_id,requester)),cancelled:false,reason:'state_changed'});
  await db.prepare("UPDATE ai_command_tasks SET state='ignored',updated_at=?,closed_at=?,lease_until=NULL WHERE id=? AND state IN ('queued','retry')").bind(updated,updated,row.task_id).run().catch(()=>null);
  await appendEvent(db,row.task_id,row.state,'cancelled','mcp','requester_cancelled');
  return Object.freeze({...publicTask(await ownedTask(db,row.task_id,requester)),cancelled:true});
}


export async function verifyOrchestratorReleaseReceipt(env,{taskId:id,branchRef}={}){
  const task=text(id,160),branch=text(branchRef,220);
  if(!validTaskId(task)||!validReleaseBranch(branch))return Object.freeze({authorized:false,reason:'invalid_receipt'});
  const db=dbFrom(env);
  const row=await db.prepare('SELECT task_id,branch_ref,state,permission_class,deployment_requested FROM ekodi_orchestrator_tasks WHERE task_id = ?').bind(task).first();
  if(!row)return Object.freeze({authorized:false,reason:'not_found',taskId:task});
  if(text(row.branch_ref,220)!==branch)return Object.freeze({authorized:false,reason:'branch_mismatch',taskId:task});
  if(Number(row.deployment_requested||0)!==1)return Object.freeze({authorized:false,reason:'deployment_not_delegated',taskId:task});
  if(text(row.permission_class,40)!=='delegated')return Object.freeze({authorized:false,reason:'permission_not_delegated',taskId:task});
  if(NON_RELEASABLE_STATES.has(text(row.state,40)))return Object.freeze({authorized:false,reason:'task_not_releasable',taskId:task,state:text(row.state,40)});
  return Object.freeze({authorized:true,taskId:task,branchRef:branch,state:text(row.state,40),authority:'ekodi-orchestrator'});
}

export async function handleOrchestratorReleaseReceipt(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/api/orchestrator/release-receipt')return null;
  if(!['GET','HEAD'].includes(request.method))return new Response(JSON.stringify({ok:false,authorized:false,reason:'method_not_allowed'}),{status:405,headers:{allow:'GET, HEAD','content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  const result=await verifyOrchestratorReleaseReceipt(env,{taskId:url.searchParams.get('taskId'),branchRef:url.searchParams.get('branchRef')});
  const status=result.authorized?200:result.reason==='invalid_receipt'?400:404;
  return new Response(request.method==='HEAD'?null:JSON.stringify({ok:result.authorized,...result}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}
