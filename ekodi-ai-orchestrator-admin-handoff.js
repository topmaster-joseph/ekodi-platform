// Authenticated admin-to-Orchestrator handoff contract. No tokens or deploy rights issued here.
const clean=(v,max=1200)=>String(v??'').trim().slice(0,max);
const KEY=/^[a-zA-Z0-9_-]{16,100}$/;
const TARGET=/^[a-z0-9][a-z0-9._-]{0,79}$/;

export function isSameOriginAdminMutation(request){
  if(!request||typeof request.url!=='string')return false;
  const origin=request.headers?.get?.('origin')||'';
  const fetchSite=request.headers?.get?.('sec-fetch-site')||'';
  let expected;
  try { expected=new URL(request.url).origin; } catch { return false; }
  return origin===expected && !['cross-site','same-site'].includes(fetchSite);
}

export function prepareAdminOrchestratorSubmission(body={}){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('invalid_request');
  const intent=clean(body.intent||body.goal,1201);
  if(intent.length<10||intent.length>1200)throw new Error('intent_length_out_of_range');
  const key=clean(body.idempotencyKey,101);
  if(!KEY.test(key))throw new Error('idempotency_key_required');
  if(body.deploymentRequested!==true)throw new Error('explicit_deployment_request_required');
  const service=clean(body.service,80).toLowerCase();
  if(!TARGET.test(service))throw new Error('invalid_target_service');
  const risk=clean(body.risk,20).toLowerCase();
  if(!['high','critical'].includes(risk))throw new Error('release_requires_high_risk_gate');
  return Object.freeze({
    intent, risk, deploymentRequested:true,
    agent:'ekodi-admin', idempotencyKey:key,
    target:Object.freeze({service}),
  });
}

const ORCH_TASK=/^orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const ACCEPTABLE_STATES=new Set(['received','triaged','assigned','executing','production_verifying','completed']);

export function evaluateAdminOrchestratorSubmission(task={}){
  const id=clean(task?.taskId,160);
  const branch=clean(task?.branchRef,220);
  const state=clean(task?.state,40).toLowerCase();
  const humanGate=task?.humanGate?.required===true;
  const blockedForHumanGate=state==='blocked'&&humanGate;
  // Canonical, nonterminal human-gate work is accepted, not approved or deployed.
  const accepted=ORCH_TASK.test(id)&&branch===`ai/ekodi-admin/${id}`&&task.deploymentRequested===true
    &&(ACCEPTABLE_STATES.has(state)||blockedForHumanGate);
  return Object.freeze({
    accepted,
    taskId:id||null,
    branchRef:accepted?branch:null,
    state:state||'unknown',
    stateVersion:Math.max(0,Math.trunc(Number(task?.stateVersion)||0)),
    humanGate:blockedForHumanGate?Object.freeze({required:true}):null,
    executionAuthorized:false,
    deploymentAuthorized:false,
    productionVerified:false,
  });
}
