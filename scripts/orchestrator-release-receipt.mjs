const CANONICAL_ENDPOINT='https://ekodi.kr/api/orchestrator/release-receipt';

function text(value,max=400){return String(value??'').trim().slice(0,max)}

export function parseOrchestratorReleaseBranch(branchRef){
  const branch=text(branchRef,220);
  const match=branch.match(/^ai\/([a-z0-9][a-z0-9._-]{0,31})\/(orch_[a-z0-9][a-z0-9_-]{15,120})$/i);
  if(!match)return null;
  return Object.freeze({agent:match[1],taskId:match[2],branchRef:branch});
}

export function validateOrchestratorReleaseReceiptPayload({status,body,branchRef,explicitTaskId=''}={}){
  const parsed=parseOrchestratorReleaseBranch(branchRef);
  if(!parsed)throw new Error(`production-bound release branch must be orchestrator-issued ai/<agent>/orch_<task-id>: ${branchRef||'missing'}`);
  if(text(explicitTaskId,160)&&text(explicitTaskId,160)!==parsed.taskId)throw new Error('release taskId does not match orchestrator branchRef');
  const payload=body&&typeof body==='object'?body:{};
  const reason=text(payload.reason||`http_${Number(status||0)}`,120);
  if(Number(status)!==200||payload.authorized!==true)throw new Error(`orchestrator release receipt rejected: ${reason}`);
  if(text(payload.taskId,160)!==parsed.taskId)throw new Error('orchestrator release receipt taskId mismatch');
  if(text(payload.branchRef,220)!==parsed.branchRef)throw new Error('orchestrator release receipt branch mismatch');
  if(text(payload.authority,80)!=='ekodi-orchestrator')throw new Error('orchestrator release receipt authority mismatch');
  const state=text(payload.state,40).toLowerCase();
  if(['blocked','failed','cancelled'].includes(state))throw new Error(`orchestrator release receipt is not releasable: ${state}`);
  return Object.freeze({taskId:parsed.taskId,branchRef:parsed.branchRef,authority:'ekodi-orchestrator',state:state||'unknown'});
}

export async function verifyOrchestratorReleaseReceipt(branchRef,{explicitTaskId='',fetchImpl=fetch,timeoutMs=5000}={}){
  const parsed=parseOrchestratorReleaseBranch(branchRef);
  if(!parsed)throw new Error(`production-bound release branch must be orchestrator-issued ai/<agent>/orch_<task-id>: ${branchRef||'missing'}`);
  const url=new URL(CANONICAL_ENDPOINT);
  url.searchParams.set('taskId',parsed.taskId);
  url.searchParams.set('branchRef',parsed.branchRef);
  let response;
  try{
    response=await fetchImpl(url,{method:'GET',headers:{Accept:'application/json','User-Agent':'ekodi-ai-orchestration-gate'},signal:AbortSignal.timeout(Math.max(500,Math.min(15000,Number(timeoutMs)||5000)))});
  }catch(error){
    throw new Error(`release receipt verifier unavailable: ${error?.name==='TimeoutError'?'timeout':error?.message||'network error'}`);
  }
  let body={};
  try{body=JSON.parse(await response.text())}catch{throw new Error(`release receipt verifier returned malformed JSON (HTTP ${response.status})`)}
  return validateOrchestratorReleaseReceiptPayload({status:response.status,body,branchRef:parsed.branchRef,explicitTaskId});
}

export const ORCHESTRATOR_RELEASE_RECEIPT_ENDPOINT=CANONICAL_ENDPOINT;
