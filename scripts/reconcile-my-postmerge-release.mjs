// Reconcile a missing My EKODI deployment after a GITHUB_TOKEN-mediated squash merge.
// This script dispatches only the EXISTING guarded workflow. It never deploys directly.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {parseOrchestratorReleaseBranch,verifyOrchestratorReleaseReceipt} from './orchestrator-release-receipt.mjs';

const REPO='topmaster-joseph/ekodi-platform';
const SHA_RE=/^[a-f0-9]{40}$/i;
const ACTIVE=new Set(['queued','in_progress','waiting','requested','pending']);
const MY_CHANGED=new Set(['my-worker.js','wrangler.my.toml','wrangler.my.staging.toml',
  'deploy/manifests/my.worker.json','.github/workflows/deploy-my.yml']);

export function myReleaseChange(files){
  return Array.isArray(files)&&files.some(file=>typeof file==='string'&&
    (file.startsWith('my/')||MY_CHANGED.has(file)));
}

export function classifyMyRelease({pr,mainSha,changedFiles,runs=[],now=Date.now()}={}){
  const branch=String(pr?.head?.ref||'');
  const source=parseOrchestratorReleaseBranch(branch);
  if(!source)return {dispatch:false,reason:'not_official_orchestrator_branch'};
  if(!SHA_RE.test(String(mainSha||''))||pr?.merge_commit_sha!==mainSha||
     pr?.state!=='closed'||!pr?.merged_at||pr?.base?.ref!=='main')
    return {dispatch:false,reason:'not_exact_merged_main'};
  if(pr?.head?.repo?.full_name!==REPO)
    return {dispatch:false,reason:'foreign_source_repository'};
  const age=now-Date.parse(pr.merged_at);
  if(!Number.isFinite(age)||age<0||age>3*24*60*60*1000)
    return {dispatch:false,reason:'stale_or_invalid_merge'};
  if(!myReleaseChange(changedFiles))return {dispatch:false,reason:'no_my_worker_changes'};
  if(!Array.isArray(runs))return {dispatch:false,reason:'deployment_history_unavailable'};
  const related=runs.filter(x=>x.head_sha===mainSha);
  if(related.some(x=>ACTIVE.has(x.status)||(x.status==='completed'&&x.conclusion==='success')))
    return {dispatch:false,reason:'already_running_or_deployed'};
  // A failed guarded deployment needs diagnosis and source repair, NOT a blind retry.
  if(related.length)return {dispatch:false,reason:'previous_release_requires_repair'};
  return {dispatch:true,reason:'verified_missing_release',mainSha,branch,taskId:source.taskId,prNumber:pr.number};
}

function fail(message){throw Error('[EKODI MY RELEASE CONTINUITY] '+message)}
async function execute(){
  const repo=String(process.env.GITHUB_REPOSITORY||'');
  const token=String(process.env.GH_TOKEN||'');
  if(repo!==REPO||!token||String(process.env.GITHUB_REF||'')!=='refs/heads/main')
    fail('trusted main and actions token required');
  const headers={accept:'application/vnd.github+json',
    authorization:'Bearer '+token,'x-github-api-version':'2022-11-28','content-type':'application/json'};
  const api=async(path,opts={})=>{
    const res=await fetch('https://api.github.com/repos/'+repo+path,{
      ...opts,headers:{...headers,...opts.headers},signal:AbortSignal.timeout(15000)});
    if(!res.ok)fail('GitHub '+path.split('?')[0]+' HTTP '+res.status);
    const raw=await res.text();
    return raw?JSON.parse(raw):{};
  };
  const latest=await api('/git/ref/heads/main');
  const mainSha=String(latest.object?.sha||'');
  if(!SHA_RE.test(mainSha))fail('invalid main SHA');
  const candidates=await api('/commits/'+mainSha+'/pulls?per_page=100');
  if(!Array.isArray(candidates)||candidates.length>=100)fail('merge provenance not exhaustive');
  const merged=candidates.filter(pr=>pr.merge_commit_sha===mainSha&&pr.merged_at);
  if(merged.length!==1){
    console.log(JSON.stringify({result:'no_unique_exact_merge',count:merged.length,mainSha}));return;
  }
  const pr=await api('/pulls/'+merged[0].number);
  const changed=await api('/pulls/'+pr.number+'/files?per_page=100');
  if(!Array.isArray(changed)||changed.length>=100)fail('changed files not exhaustive');
  const history=await api('/actions/workflows/deploy-my.yml/runs?event=workflow_dispatch&per_page=100');
  if(!Array.isArray(history.workflow_runs)||history.workflow_runs.length>=100)
    fail('My workflow history not exhaustive: preserve fail-closed duplicate prevention');
  const decision=classifyMyRelease({pr,mainSha,changedFiles:changed.map(x=>x.filename),
    runs:history.workflow_runs});
  if(!decision.dispatch){
    console.log(JSON.stringify({result:'deferred',reason:decision.reason,pr:pr.number,mainSha}));return;
  }
  await verifyOrchestratorReleaseReceipt(decision.branch,{explicitTaskId:decision.taskId});
  // Reconfirm main and history immediately before dispatch (no approval authority is minted).
  const fresh=await api('/git/ref/heads/main');
  if(fresh.object?.sha!==mainSha)fail('main moved before release dispatch');
  const newer=await api('/actions/workflows/deploy-my.yml/runs?event=workflow_dispatch&per_page=100');
  if(!Array.isArray(newer.workflow_runs)||newer.workflow_runs.length>=100)
    fail('cannot certify latest deployment history');
  const verified=classifyMyRelease({pr,mainSha,changedFiles:changed.map(x=>x.filename),
    runs:newer.workflow_runs});
  if(!verified.dispatch)fail('release became ineligible: '+verified.reason);
  await api('/actions/workflows/deploy-my.yml/dispatches',{method:'POST',
    body:JSON.stringify({ref:'main',inputs:{release_branch_ref:decision.branch,
      release_task_id:decision.taskId}})});
  console.log(JSON.stringify({result:'guarded_release_dispatched',pr:pr.number,
    mainSha,taskId:decision.taskId,branch:decision.branch,verified:false}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  execute().catch(error=>{console.error(String(error?.message||error));process.exitCode=1});
}
