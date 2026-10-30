// EKODI Education post-merge continuity. Runs from trusted main only.
// Dispatches the EXISTING guarded release, never deploys a Worker itself.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {parseOrchestratorReleaseBranch,verifyOrchestratorReleaseReceipt} from './orchestrator-release-receipt.mjs';
import {verifyEducationReleaseSnapshot,validOfficialEducationCandidate} from './verify-education-release-snapshot.mjs';

export const EDUCATION_RELEASE_PATHS=Object.freeze(new Set([
 'education-worker.js','ekodi-service-manifest.js',
 'platform-boundaries.json','canonical-surface-router.js',
 'wrangler.education.toml','wrangler.education.staging.toml',
 'deploy/manifests/education.worker.json',
 '.github/workflows/deploy-education.yml',
 'scripts/verify-education-bootcamp-native.mjs',
 'scripts/education-release-continuity.mjs',
 'scripts/verify-education-release-snapshot.mjs',
 'scripts/verify-education-farm-marketing-native.mjs',
 '.github/workflows/education-release-continuity.yml',
]));
export function educationReleaseChanged(files){
 return Array.isArray(files)&&files.some(x=>typeof x==='string'&&(x.startsWith('education/')||EDUCATION_RELEASE_PATHS.has(x)));
}
export function approvedEducationMerge({event={},pr={},files=[],mainSha=''}={}){
 const run=event.workflow_run||{};
 const branch=String(run.head_branch||'');
 const parsed=parseOrchestratorReleaseBranch(branch);
 if(event.action!=='completed'||run.conclusion!=='success')return {ready:false,reason:'convergence_not_successful'};
 if(!parsed)return {ready:false,reason:'not_an_official_orchestrator_branch'};
 if(pr.merged_at==null||pr.state!=='closed'||pr.base?.ref!=='main')return {ready:false,reason:'not_merged'};
 if(pr.head?.ref!==branch||pr.head?.sha!==run.head_sha)return {ready:false,reason:'source_revision_mismatch'};
 const mergeSha=String(pr.merge_commit_sha||'');
 if(!/^[0-9a-f]{40}$/i.test(mergeSha)||mergeSha!==mainSha)return {ready:false,reason:'merge_not_current_main'};
 if(!educationReleaseChanged(files))return {ready:false,reason:'no_education_changes'};
 return {ready:true,reason:'verified_source_and_main',branch,taskId:parsed.taskId,mergeSha,sourceSha:run.head_sha,pr:pr.number};
}


// Only inspect local trusted main history. A shallow checkout without a matching
// Education change must NOT fall back to broad paginated GitHub API scans.
export const EDUCATION_LOCAL_PATHS=Object.freeze(['education/','education-worker.js',
 ...EDUCATION_RELEASE_PATHS].filter((value,i,all)=>all.indexOf(value)===i));
export function latestEducationMergeFromGit({run=execFileSync}={}){
 const commit=String(run('git',['log','--first-parent','-1','--format=%H','--',...EDUCATION_LOCAL_PATHS],
   {encoding:'utf8',timeout:20000})||'').trim();
 return /^[0-9a-f]{40}$/i.test(commit)?commit:'';
}
export function releaseQuotaBudget(data,minRemaining=24){
 const remaining=Number(data?.resources?.core?.remaining ?? data?.rate?.remaining);
 if(!Number.isFinite(remaining)||remaining<0)return {ok:false,reason:'quota_unknown'};
 if(remaining<minRemaining)return {ok:false,reason:'github_quota_low',remaining};
 return {ok:true,remaining};
}
async function availableReleaseQuota(token){
 const response=await fetch('https://api.github.com/rate_limit',{headers:{
   authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'
 },signal:AbortSignal.timeout(12000)});
 if(!response.ok)return {ok:false,reason:'quota_preflight_http_'+response.status};
 return releaseQuotaBudget(await response.json());
}

function fail(message){throw new Error('[EKODI EDUCATION RELEASE CONTINUITY] '+message)}
const log=(kind,data={})=>console.log(JSON.stringify({kind,service:'ekodi-education',...data}));
async function main(){
 const repo=String(process.env.GITHUB_REPOSITORY||'');
 const token=String(process.env.GH_TOKEN||'');
 const eventPath=String(process.env.GITHUB_EVENT_PATH||'');
 const eventName=process.env.GITHUB_EVENT_NAME||'';
 if(repo!=='topmaster-joseph/ekodi-platform'||!token||!eventPath||!fs.existsSync(eventPath))
   fail('trusted repository, Actions token and event required');
 if(!['workflow_run','schedule'].includes(eventName)||process.env.GITHUB_REF_NAME!=='main')
   fail('protected main workflow_run or read-only scheduled recovery required');
 const event=JSON.parse(fs.readFileSync(eventPath,'utf8'));
 const run=event.workflow_run||{};
 if(eventName==='workflow_run'&&(event.action!=='completed'||run.conclusion!=='success'||!parseOrchestratorReleaseBranch(run.head_branch))){
   log('non_release_run');return;
 }
 const budget=await availableReleaseQuota(token);
 if(!budget.ok){log('github_quota_deferred',budget);return;}
 const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json',
  'x-github-api-version':'2022-11-28','content-type':'application/json'};
 const api=async(path,init={})=>{
  const response=await fetch('https://api.github.com/repos/'+repo+path,{...init,headers:{...headers,...(init.headers||{})},signal:AbortSignal.timeout(15000)});
  const body=await response.text();let data;
  try{data=body?JSON.parse(body):{}}catch{data={raw:body.slice(0,600)}}
  if([403,429].includes(response.status)&&(/API rate limit exceeded|rate limit exceeded|secondary rate limit/i.test(String(data.message||''))||response.headers.get('x-ratelimit-remaining')==='0')){
    const error=new Error('GitHub installation quota depleted; defer until reset');error.code='GITHUB_QUOTA_DEFERRED';throw error;
  }
  if(!response.ok)fail('GitHub '+path.split('?')[0]+' HTTP '+response.status+' '+JSON.stringify(data).slice(0,350));
  return data;
 };
 const owner=repo.split('/')[0];
 let pr=null,files=[];
 if(eventName==='workflow_run'){
   const branch=run.head_branch;
   const pulls=await api('/pulls?state=all&base=main&head='+encodeURIComponent(owner+':'+branch)+'&per_page=100');
   pr=Array.isArray(pulls)?pulls.find(p=>p.head?.sha===run.head_sha&&p.merged_at!=null):null;
   if(!pr){log('no_exact_verified_merge',{branch,sourceSha:run.head_sha});return;}
   const changed=await api('/pulls/'+pr.number+'/files?per_page=100');
   if(!Array.isArray(changed)||changed.length===100)fail('PR files must be exhaustively inspectable');
   files=changed.map(item=>item.filename);
 }else{
   // Schedule: 1 local git query + 1 exact commit/PR lookup instead of
   // listing 200 PRs and fetching up to 40 file lists every hour.
   const mergedSha=latestEducationMergeFromGit();
   if(!mergedSha){log('no_education_commit_in_bounded_local_history');return;}
   const linked=await api('/commits/'+mergedSha+'/pulls?per_page=10');
   const official=Array.isArray(linked)?linked.filter(p=>
      p.merge_commit_sha===mergedSha&&p.merged_at&&p.base?.ref==='main'&&
      parseOrchestratorReleaseBranch(p.head?.ref)):[];
   if(official.length!==1){log('no_unique_official_education_pr_for_latest_commit',{mergedSha});return;}
   pr=official[0];
   const changed=await api('/pulls/'+pr.number+'/files?per_page=100');
   if(!Array.isArray(changed)||changed.length===100)fail('PR files must be exhaustively inspectable');
   files=changed.map(item=>item.filename);
 }
 if(!validOfficialEducationCandidate(pr,files)){log('not_eligible',{reason:'no_education_changes_or_unapproved_pr',pr:pr.number});return;}
 const releaseSha=String(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:10000})||'').trim();
 if(!/^[a-f0-9]{40}$/i.test(releaseSha))fail('trusted main SHA missing');
 const branch=pr.head.ref;
 // A later unrelated protected merge is not new Education release authority.
 // Verify its ancestry and absence of all subsequent Education changes, in both
 // the dispatcher and the production workflow.
 const decision=await verifyEducationReleaseSnapshot({
   repo,token,branch,taskId:parseOrchestratorReleaseBranch(branch).taskId,releaseSha,
   receiptVerifier:verifyOrchestratorReleaseReceipt
 });
 // Preserve auditable individual source CI context independently of the snapshot check.
 const status=await api('/commits/'+decision.sourceSha+'/status');
 const statuses=new Map((status.statuses||[]).map(item=>[item.context,item.state]));
 for(const name of ['test','EKODI AI Orchestration Gate']){
   if(statuses.get(name)!=='success')fail('required source status not successful: '+name);
 }
 const history=await api('/actions/workflows/deploy-education.yml/runs?event=workflow_dispatch&per_page=100');
 const attempts=(history.workflow_runs||[]).filter(item=>item.head_sha===releaseSha);
 const duplicate=attempts.some(item=>['queued','in_progress','waiting'].includes(item.status)||
   (item.status==='completed'&&item.conclusion==='success'));
 if(duplicate){log('previous_dispatch_exists',{pr:pr.number,releaseSha});return;}
 // Bound unintended repeated actions when the same release consistently fails.
 if(attempts.filter(item=>item.status==='completed'&&item.conclusion!=='success').length>=3){
   log('release_attempt_limit_reached',{pr:pr.number,releaseSha});return;
 }
 await api('/actions/workflows/deploy-education.yml/dispatches',{method:'POST',body:JSON.stringify({
  ref:'main',inputs:{release_branch_ref:branch,release_task_id:decision.taskId,release_sha:releaseSha}
 })});
 log('guarded_release_dispatched',{pr:pr.number,mergeSha:decision.mergeSha,releaseSha,
   sourceSha:decision.sourceSha,branch,taskId:decision.taskId,verification:'pending',event:eventName});
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{
   if(error?.code==='GITHUB_QUOTA_DEFERRED'){log('github_quota_deferred',{reason:'remote_api_403_or_429'});return;}
   console.error(error);process.exitCode=1;
 });
}