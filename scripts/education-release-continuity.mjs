// EKODI Education post-merge continuity. Runs from trusted main only.
// Dispatches the EXISTING guarded release, never deploys a Worker itself.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {parseOrchestratorReleaseBranch,verifyOrchestratorReleaseReceipt} from './orchestrator-release-receipt.mjs';

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
 if(repo!=='topmaster-joseph/ekodi-platform'||!token||!eventPath||!fs.existsSync(eventPath))
   fail('trusted repository, Actions token and workflow_run event required');
 if(process.env.GITHUB_EVENT_NAME!=='workflow_run'||process.env.GITHUB_REF_NAME!=='main')
   fail('read-only release convergence must start on trusted main workflow_run');
 const event=JSON.parse(fs.readFileSync(eventPath,'utf8'));
 const run=event.workflow_run||{};
 if(event.action!=='completed'||run.conclusion!=='success'||!parseOrchestratorReleaseBranch(run.head_branch)){
   log('non_release_run');return;
 }
 // A completed convergence run may only *prepare* another release; never infer
 // actual merge solely from its success conclusion.
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
 const branch=run.head_branch;
 const pulls=await api('/pulls?state=all&base=main&head='+encodeURIComponent(owner+':'+branch)+'&per_page=100');
 const pr=Array.isArray(pulls)?pulls.find(p=>p.head?.sha===run.head_sha&&p.merged_at!=null):null;
 if(!pr){log('no_exact_verified_merge',{branch,sourceSha:run.head_sha});return;}
 const [main,changed]=await Promise.all([
  api('/git/ref/heads/main'),
  api('/pulls/'+pr.number+'/files?per_page=100')
 ]);
 if(!Array.isArray(changed)||changed.length===100)fail('PR files must be exhaustively inspectable (under 100)');
 const files=changed.map(item=>item.filename);
 const decision=approvedEducationMerge({event,pr,files,mainSha:main.object?.sha});
 if(!decision.ready){log('not_eligible',{reason:decision.reason,pr:pr.number});return;}
 const mergedPrs=await api('/commits/'+decision.mergeSha+'/pulls?per_page=100');
 if(!Array.isArray(mergedPrs)||!mergedPrs.some(item=>item.number===pr.number&&item.merged_at!=null))
   fail('merge commit not associated with the exact approved PR');
 await verifyOrchestratorReleaseReceipt(branch,{explicitTaskId:decision.taskId});
 const status=await api('/commits/'+decision.sourceSha+'/status');
 const statuses=new Map((status.statuses||[]).map(item=>[item.context,item.state]));
 for(const name of ['test','EKODI AI Orchestration Gate']){
  if(statuses.get(name)!=='success')fail('required source status not successful: '+name);
 }
 const history=await api('/actions/workflows/deploy-education.yml/runs?event=workflow_dispatch&per_page=100');
 const duplicate=(history.workflow_runs||[]).some(item=>
   item.head_sha===decision.mergeSha&&['queued','in_progress','completed','waiting'].includes(item.status));
 if(duplicate){log('previous_dispatch_exists',{pr:pr.number,mergeSha:decision.mergeSha});return;}
 await api('/actions/workflows/deploy-education.yml/dispatches',{method:'POST',body:JSON.stringify({
  ref:'main',inputs:{release_branch_ref:decision.branch,release_task_id:decision.taskId,release_sha:decision.mergeSha}
 })});
 log('guarded_release_dispatched',{pr:pr.number,mergeSha:decision.mergeSha,sourceSha:decision.sourceSha,
  branch:decision.branch,taskId:decision.taskId,verification:'pending'});
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{console.error(error);process.exitCode=1});
}