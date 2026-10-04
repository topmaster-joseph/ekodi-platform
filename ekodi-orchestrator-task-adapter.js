import { getEkodiCommandTask, ingestEkodiPulse } from './ekodi-command-ledger.js';
import { runEkodiCommandQueue } from './ekodi-pulse-runtime.js';

const TERMINAL_STATES=new Set(['completed','blocked','failed','cancelled']);
const CANCELLABLE_STATES=new Set(['received','triaged','assigned']);
const NON_RELEASABLE_STATES=new Set(['blocked','failed','cancelled']);

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
    result:parseJson(row.result_json,null),
    evidence:parseJson(row.evidence_json,[]),
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
  if(['queued','retry'].includes(value))return'assigned';
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
  if(!next||next===row.state)return row;
  if(next==='completed'&&Number(row.deployment_requested||0)===1&&!row.production_evidence_json)next='production_verifying';
  const terminal=TERMINAL_STATES.has(next);
  const updated=now();
  const result=await db.prepare(`UPDATE ekodi_orchestrator_tasks SET state=?,state_version=state_version+1,
    result_json=?,evidence_json=?,updated_at=?,completed_at=? WHERE task_id=? AND requester_id=? AND state=?`)
    .bind(next,safeJson(command.result||{}),safeJson(command.evidence||{}),updated,terminal?updated:null,row.task_id,row.requester_id,row.state).run();
  if(changes(result)>0)await appendEvent(db,row.task_id,row.state,next,'ekodi-command-plane','command_ledger_sync',{commandState:command.state});
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
    await runEkodiCommandQueue(env,{limit:1,taskId:id});
    const assigned=now();
    await db.prepare("UPDATE ekodi_orchestrator_tasks SET state='assigned',state_version=state_version+1,assigned_worker='ekodi-command-plane',updated_at=? WHERE task_id=? AND requester_id=? AND state='received'").bind(assigned,id,requester).run();
    await appendEvent(db,id,'received','assigned','ekodi-orchestrator','queued_for_command_plane',{worker:'ekodi-command-plane'});
  }catch(error){
    const failed=now();
    await db.prepare("UPDATE ekodi_orchestrator_tasks SET state='failed',state_version=state_version+1,dead_letter_reason=?,updated_at=?,completed_at=? WHERE task_id=? AND requester_id=?").bind(text(error?.message||error,500),failed,failed,id,requester).run();
    await appendEvent(db,id,'received','failed','ekodi-orchestrator','queue_submission_failed');
  }
  return publicTask(await ownedTask(db,id,requester));
}

export async function getOrchestratorTaskStatus(env,identity,id){
  const db=dbFrom(env);const requester=requesterFrom(identity);if(!requester)throw new Error('EKODI_REQUESTER_REQUIRED');
  let row=await ownedTask(db,id,requester);if(!row)return null;
  row=await syncFromCommandLedger(db,env,row);return publicTask(row);
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
