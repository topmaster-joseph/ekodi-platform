// EKODI-EDU-4813: one-time, exact-owner-approved guarded Shell release reconciliation.
// Never deploys directly. Only dispatches the EXISTING staged/guarded Shell workflow.
import fs from 'node:fs';

const REPO='topmaster-joseph/ekodi-platform';
const ISSUE=4813;
const SOURCE_PR=4808;
const SOURCE_SHA='6cdb44bb6d09cc6a8d9b30086b42ea050a4957de';
const RECOVERY_PR=4811;
const MERGE_SHA='9ac525bf9bd4f4514e11d77b9b55ac510682fa10';
const TASK='orch_recovery_6cdb44bb6d09cc6a8d9b30086b42ea05';
const BRANCH='ai/chatgpt/'+TASK;
const LABEL='ekodi-education-shell-reconcile';

function fail(message){throw new Error('[EKODI][EDU-4813-RECONCILE] '+message)}
async function main(){
  const repo=String(process.env.GITHUB_REPOSITORY||'');
  const actor=String(process.env.GITHUB_ACTOR||'');
  const ref=String(process.env.GITHUB_REF_NAME||'');
  const token=String(process.env.GH_TOKEN||'');
  const eventPath=String(process.env.GITHUB_EVENT_PATH||'');
  if(repo!==REPO||ref!=='main'||!token||!eventPath||!fs.existsSync(eventPath))
    fail('trusted main issue-event context is required');
  const event=JSON.parse(fs.readFileSync(eventPath,'utf8'));
  const policy=JSON.parse(fs.readFileSync('config/ai-change-orchestration-policy.json','utf8'));
  const owners=new Set(policy.governance?.policyOwners||[]);
  if(!owners.has(actor))fail('issue label actor is not the authorized policy owner');
  if(event.action!=='labeled'||event.issue?.number!==ISSUE||
     event.label?.name!==LABEL||event.issue?.state!=='open')
    fail('event must be owner-labeled open incident #4813');

  const api=async(path,options={})=>{
    const response=await fetch('https://api.github.com/repos/'+REPO+path,{
      ...options,headers:{
        authorization:'Bearer '+token,accept:'application/vnd.github+json',
        'x-github-api-version':'2022-11-28','content-type':'application/json',
        ...(options.headers||{})
      },signal:AbortSignal.timeout(15000)
    });
    const body=await response.text();
    let data={};try{data=body?JSON.parse(body):{}}catch{data={raw:body.slice(0,500)}}
    if(!response.ok)fail('GitHub '+path.split('?')[0]+' HTTP '+response.status+' '+JSON.stringify(data).slice(0,320));
    return data;
  };

  const [source,recovery,comments,mainRef]=await Promise.all([
    api('/pulls/'+SOURCE_PR),api('/pulls/'+RECOVERY_PR),
    api('/issues/'+SOURCE_PR+'/comments?per_page=100'),
    api('/git/ref/heads/main')
  ]);
  if(source.head?.sha!==SOURCE_SHA||source.state!=='closed')
    fail('approved source PR and immutable SHA mismatch');
  if(!Array.isArray(comments)||!comments.some(row=>
    owners.has(row.user?.login)&&String(row.body||'').includes('EKODI-HUMAN-GATE-APPROVE:'+SOURCE_SHA)))
    fail('exact-source owner Human Gate approval not confirmed');
  if(recovery.merged_at==null||recovery.state!=='closed'||
     recovery.base?.ref!=='main'||recovery.head?.ref!==BRANCH||
     recovery.head?.sha!==SOURCE_SHA||recovery.merge_commit_sha!==MERGE_SHA)
    fail('official verified recovery merge/branch/source mismatch');

  const mainSha=String(mainRef.object?.sha||'');
  if(!/^[0-9a-f]{40}$/.test(mainSha))fail('current protected main SHA invalid');
  const ancestry=await api('/compare/'+MERGE_SHA+'...'+mainSha);
  if(Number(ancestry.behind_by)!==0||
     !['ahead','identical'].includes(String(ancestry.status)))
    fail('approved recovery merge is not in protected main ancestry');
  const receiptUrl=new URL('https://ekodi.kr/api/orchestrator/release-receipt');
  receiptUrl.searchParams.set('taskId',TASK);
  receiptUrl.searchParams.set('branchRef',BRANCH);
  const receiptResponse=await fetch(receiptUrl,{headers:{
    accept:'application/json','user-agent':'ekodi-edu-incident-4813-guarded-reconcile'
  },signal:AbortSignal.timeout(15000)});
  const receipt=await receiptResponse.json().catch(()=>({}));
  if(!receiptResponse.ok||receipt.authorized!==true)
    fail('first-party Orchestrator release receipt is not authorized');

  // An issued run is not a green deployment. Suppress only active/succeeded
  // runs for exact current main, and leave past failures eligible for retry.
  const history=await api('/actions/workflows/deploy-ekodi-shell.yml/runs?event=workflow_dispatch&per_page=100');
  if((history.workflow_runs||[]).some(item=>item.head_sha===mainSha&&(
    ['queued','waiting','in_progress'].includes(item.status)||
    (item.status==='completed'&&item.conclusion==='success')
  ))){
    console.log(JSON.stringify({ok:true,action:'existing-current-main-shell-release',mainSha,verification:'pending'}));
    return;
  }

  // No Cloudflare credentials or direct mutation: guarded Shell staging,
  // provenance, production checks and rollback remain with the existing workflow.
  await api('/actions/workflows/deploy-ekodi-shell.yml/dispatches',{
    method:'POST',body:JSON.stringify({ref:'main',inputs:{
      release_branch_ref:BRANCH,release_task_id:TASK
    }})
  });
  console.log(JSON.stringify({ok:true,action:'existing-guarded-shell-dispatched',
    incident:ISSUE,sourceSha:SOURCE_SHA,mergeSha:MERGE_SHA,
    currentMainSha:mainSha,branchRef:BRANCH,taskId:TASK,
    verification:'pending-genuine-shell-and-education-native-acceptance'}));
}
main().catch(error=>{console.error(error);process.exitCode=1});
