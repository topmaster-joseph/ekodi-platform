// EKODI Education post-merge continuity. Runs from trusted main only.
// Dispatches the EXISTING guarded release, never deploys a Worker itself.
import fs from 'node:fs';
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
 const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json',
  'x-github-api-version':'2022-11-28','content-type':'application/json'};
 const api=async(path,init={})=>{
  const response=await fetch('https://api.github.com/repos/'+repo+path,{...init,headers:{...headers,...(init.headers||{})},signal:AbortSignal.timeout(15000)});
  const body=await response.text();let data;
  try{data=body?JSON.parse(body):{}}catch{data={raw:body.slice(0,600)}}
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
   // Only a previously merged, source-checked and EKODI-receipted PR is eligible.
   // The schedule never manufactures an orchestration receipt or a successful CI result.
   const recent=await api('/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100');
   if(!Array.isArray(recent)||recent.length===100){log('pending_scan_incomplete');return;}
   const candidates=recent.filter(p=>p.merged_at&&p.base?.ref==='main'&&parseOrchestratorReleaseBranch(p.head?.ref))
     .sort((a,b)=>Date.parse(b.merged_at)-Date.parse(a.merged_at));
   for(const candidate of candidates){
     const changed=await api('/pulls/'+candidate.number+'/files?per_page=100');
     if(!Array.isArray(changed)||changed.length===100)fail('PR files must be exhaustively inspectable');
     const changedFiles=changed.map(item=>item.filename);
     if(validOfficialEducationCandidate(candidate,changedFiles)){pr=candidate;files=changedFiles;break;}
   }
   if(!pr){log('no_recent_official_education_merge');return;}
 }
 if(!validOfficialEducationCandidate(pr,files)){log('not_eligible',{reason:'no_education_changes_or_unapproved_pr',pr:pr.number});return;}
 const main=await api('/git/ref/heads/main');
 const releaseSha=String(main.object?.sha||'');
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
 main().catch(error=>{console.error(error);process.exitCode=1});
}