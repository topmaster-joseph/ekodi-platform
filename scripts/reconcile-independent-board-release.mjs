// Trusted GitHub Actions reconciliation for approved but missing Independent Board releases.
// Never deploy directly. Only dispatch the established production-gated workflow once.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const WORKFLOW='deploy-independent-board.yml';
const ISSUE=4759;
const ORCH_BRANCH=/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/(orch_[a-z0-9][a-z0-9_-]{15,120})$/i;
const SHA=/^[0-9a-f]{40}$/i;
const MARKER=/^EKODI-BOARD-DEPLOY-RECOVER:([0-9a-f]{40})$/i;
const FILES=Object.freeze([
  'wrangler.independent-board.toml',
  'sites/seonammedi/public/app.js',
  '.github/workflows/deploy-independent-board.yml'
]);

export const boardOwnedFile=(file)=>
  String(file||'').startsWith('services/independent-board/')||FILES.includes(String(file||''));

export function latestMergedOrchestratorCandidates(pulls){
  return (Array.isArray(pulls)?pulls:[])
    .filter(pr=>pr?.state==='closed'&&pr?.merged_at&&pr?.base?.ref==='main'&&
      pr?.head?.ref&&ORCH_BRANCH.test(pr.head.ref)&&SHA.test(String(pr?.merge_commit_sha||'')))
    .sort((a,b)=>Date.parse(b.merged_at)-Date.parse(a.merged_at));
}

export function releaseRequired(mergedAt,latestRun){
  const t=Date.parse(mergedAt||'');
  if(!Number.isFinite(t))return {required:false,reason:'missing-merged-at'};
  if(!latestRun)return {required:true,reason:'no-prior-board-run'};
  const r=Date.parse(latestRun.created_at||'');
  if(!Number.isFinite(r))return {required:false,reason:'undated-run-fail-closed'};
  if(r>=t)return {required:false,reason:
    latestRun.status==='completed'&&latestRun.conclusion==='success'?'already-attempted-success':'release-already-attempted-no-blind-retry'};
  if(latestRun.status!=='completed')return {required:false,reason:'previous-board-release-still-active'};
  return {required:true,reason:'merged-board-change-after-last-release'};
}

function fail(message){throw new Error('[EKODI][BOARD-RELEASE-RECONCILE] '+message)}
function log(state,extra={}){console.log(JSON.stringify({boardReleaseReconcile:true,state,...extra}))}
const repo=String(process.env.GITHUB_REPOSITORY||'');
const token=String(process.env.GH_TOKEN||'');
async function github(path,options={}){
  const response=await fetch('https://api.github.com/repos/'+repo+path,{
    ...options,headers:{
      accept:'application/vnd.github+json',
      authorization:'Bearer '+token,
      'x-github-api-version':'2022-11-28',
      ...(options.headers||{})
    }
  });
  if(options.method==='POST'&&response.status===204)return {status:204,data:null};
  const data=await response.json().catch(()=>({}));
  if(!response.ok)fail('GitHub '+response.status+' at '+path+': '+String(data?.message||'').slice(0,120));
  return {status:response.status,data};
}
async function changedFiles(prNumber){
  const files=[];
  for(let page=1;page<=5;page++){
    const {data}=await github('/pulls/'+prNumber+'/files?per_page=100&page='+page);
    if(!Array.isArray(data))fail('PR file list malformed');
    files.push(...data.map(row=>String(row?.filename||'')));
    if(data.length<100)return files;
  }
  fail('PR file list exceeds bounded inspection');
}
async function getRuns(){
  const {data}=await github('/actions/workflows/'+WORKFLOW+'/runs?branch=main&per_page=30');
  if(!Array.isArray(data?.workflow_runs))fail('board workflow history missing');
  return data.workflow_runs.sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
}
async function verifyOwnerComment(event){
  if(event?.issue?.number!==ISSUE||event?.issue?.pull_request||
     event?.comment?.user?.login!=='topmaster-joseph') {
    log('ignored-untrusted-or-unrelated-comment');return null;
  }
  const marker=String(event.comment.body||'').trim().match(MARKER);
  if(!marker){log('ignored-comment-without-exact-marker');return null}
  // Validate against a repository-owned signed event, not the text alone.
  const comment=await github('/issues/comments/'+event.comment.id);
  if(comment.data?.user?.login!=='topmaster-joseph'||
      comment.data?.issue_url!=='https://api.github.com/repos/'+repo+'/issues/'+ISSUE||
      String(comment.data?.body||'').trim()!==String(event.comment.body||'').trim()){
    fail('owner comment provenance could not be verified');
  }
  return marker[1].toLowerCase();
}
async function receiptAuthorized(branch,task){
  const u=new URL('https://ekodi.kr/api/orchestrator/release-receipt');
  u.searchParams.set('taskId',task);
  u.searchParams.set('branchRef',branch);
  const response=await fetch(u,{headers:{accept:'application/json','user-agent':'ekodi-board-release-reconcile'}});
  if(!response.ok)fail('official EKODI release receipt unavailable HTTP '+response.status);
  const j=await response.json().catch(()=>({}));
  if(j.authorized!==true||j.authority!=='ekodi-orchestrator'||j.taskId!==task||j.branchRef!==branch||
      ['blocked','failed','cancelled'].includes(String(j.state||'').toLowerCase()))
    fail('EKODI release receipt does not authorize exact orchestrator branch');
}
async function main(){
  if(!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)||!token)fail('trusted GitHub repository and token required');
  if(!['schedule','workflow_dispatch','issue_comment'].includes(process.env.GITHUB_EVENT_NAME))fail('unsupported trigger');
  if(!SHA.test(String(process.env.GITHUB_SHA||'')))fail('valid exact GitHub main SHA required');
  let expectedSha=null;
  if(process.env.GITHUB_EVENT_NAME==='issue_comment'){
    const path=process.env.GITHUB_EVENT_PATH;
    if(!path||!fs.existsSync(path))fail('signed GitHub issue comment event required');
    expectedSha=await verifyOwnerComment(JSON.parse(fs.readFileSync(path,'utf8')));
    if(!expectedSha)return;
  }
  const mainHead=(await github('/branches/main')).data?.commit?.sha;
  if(mainHead!==process.env.GITHUB_SHA||expectedSha&&mainHead!==expectedSha){
    fail('main moved or approved issue comment SHA does not match current main');
  }
  let runs=await getRuns();
  const latest=runs[0]||null;
  // Inspect only merged official orchestrator changes newer than the previous board deployment.
  const {data:closed}=await github('/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100');
  const candidates=latestMergedOrchestratorCandidates(closed);
  let target=null;
  for(const pr of candidates){
    if(!releaseRequired(pr.merged_at,latest).required)break;
    const files=await changedFiles(pr.number);
    if(files.some(boardOwnedFile)){target=pr;break}
  }
  if(!target){log('no-missing-eligible-board-release',{mainSha:mainHead,lastRun:latest?.id||null});return}
  const branch=target.head.ref;
  const task=ORCH_BRANCH.exec(branch)?.[1];
  if(!task)fail('source branch is not a valid official orchestrator release');
  const {data:prNow}=await github('/pulls/'+target.number);
  if(prNow?.state!=='closed'||!prNow?.merged_at||
     prNow?.head?.sha!==target.head.sha||prNow?.merge_commit_sha!==target.merge_commit_sha)
    fail('merged source PR changed during inspection');
  const {data:compare}=await github('/compare/'+target.merge_commit_sha+'...'+mainHead);
  if(!['identical','ahead'].includes(compare?.status))fail('board merge SHA is not an ancestor of current main');
  const {data:checks}=await github('/commits/'+target.head.sha+'/check-runs?per_page=100');
  for(const name of ['test','EKODI AI Orchestration Gate']){
    if(!Array.isArray(checks?.check_runs)||!checks.check_runs.some(r=>r.name===name&&r.conclusion==='success'&&r.app?.slug==='github-actions'))
      fail('missing successful required source check: '+name);
  }
  await receiptAuthorized(branch,task);
  // Close the race with other agents/merges or another deploy dispatch.
  const currentMain=(await github('/branches/main')).data?.commit?.sha;
  if(currentMain!==mainHead)fail('main moved before production dispatch');
  runs=await getRuns();
  if(!releaseRequired(target.merged_at,runs[0]||null).required){
    log('another-board-release-attempt-exists',{pr:target.number,mainSha:mainHead});return
  }
  const payload=JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:task}});
  const posted=await github('/actions/workflows/'+WORKFLOW+'/dispatches',{
    method:'POST',headers:{'content-type':'application/json'},body:payload
  });
  if(posted.status!==204)fail('GitHub declined official board workflow dispatch');
  log('guarded-board-deployment-dispatched',{pr:target.number,mergeSha:target.merge_commit_sha,
    mainSha:mainHead,branch,task,workflow:WORKFLOW});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
