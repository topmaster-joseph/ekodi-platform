import {pathToFileURL} from 'node:url';

const RELEASE_RECEIPT='https://ekodi.kr/api/orchestrator/release-receipt';
const DEPLOY_WORKFLOW='deploy-ekodi-church-homepage.yml';
const TASK_PATTERN=/^orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const BRANCH_PATTERN=/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/(orch_[a-z0-9][a-z0-9_-]{15,120})$/i;

export function validateAuthorizedChurchReceipt(body,status,branch,task) {
  const match=String(branch||'').match(BRANCH_PATTERN);
  if(!match||!TASK_PATTERN.test(String(task||''))||match[1]!==task)
    throw new Error('Official EKODI branch and exact matching task are required');
  if(status!==200||body?.authorized!==true||body?.taskId!==task||
    body?.branchRef!==branch||body?.authority!=='ekodi-orchestrator'||
    ['blocked','failed','cancelled'].includes(String(body?.state||'').toLowerCase()))
    throw new Error('Current EKODI Orchestrator release receipt is not authorized');
  return {branch,task};
}

export async function dispatchChurchRelease({env=process.env,fetchImpl=fetch,log=console}={}) {
  const branch=String(env.EKODI_RELEASE_BRANCH_REF||'').trim();
  const task=String(env.EKODI_RELEASE_TASK_ID||'').trim();
  if(!branch&&!task){
    log.log('::notice::Church production drift detected; awaiting official EKODI Orchestrator release receipt. No deploy was dispatched.');
    return {dispatched:false,reason:'authorized_receipt_required'};
  }
  if(!branch||!task)throw new Error('Both official branch and matching task must be supplied; partial receipt is forbidden');
  const token=String(env.GH_TOKEN||'').trim();
  const repo=String(env.GITHUB_REPOSITORY||'').trim();
  if(!token||repo!=='topmaster-joseph/ekodi-platform')
    throw new Error('Canonical EKODI GitHub Actions identity required');
  const parsed=branch.match(BRANCH_PATTERN);
  if(!parsed||parsed[1]!==task||!TASK_PATTERN.test(task))
    throw new Error('Invalid EKODI release branch/task pair');
  const url=new URL(RELEASE_RECEIPT);
  url.searchParams.set('taskId',task);
  url.searchParams.set('branchRef',branch);
  const receipt=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'ekodi-church-guarded-reconciler'},signal:AbortSignal.timeout(8000)});
  const body=await receipt.json();
  validateAuthorizedChurchReceipt(body,receipt.status,branch,task);
  const response=await fetchImpl('https://api.github.com/repos/'+repo+'/actions/workflows/'+DEPLOY_WORKFLOW+'/dispatches',{
    method:'POST',
    headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28'},
    body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:task}}),
    signal:AbortSignal.timeout(8000)
  });
  if(response.status!==204)throw new Error('Guarded Church release dispatch rejected: HTTP '+response.status);
  log.log('Official receipt verified; canonical guarded Church Pages workflow accepted dispatch.');
  return {dispatched:true,taskId:task};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  dispatchChurchRelease().catch(error=>{console.error('::error::'+error.message);process.exitCode=1});
}
