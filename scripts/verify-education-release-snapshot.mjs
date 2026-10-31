#!/usr/bin/env node
// Validate a protected, orchestrator-issued Education merge even if unrelated main
// commits followed it. This validates provenance; only deploy-education.yml deploys.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {educationReleaseChanged} from './education-release-continuity.mjs';
import {parseOrchestratorReleaseBranch,verifyOrchestratorReleaseReceipt} from './orchestrator-release-receipt.mjs';

const isSha=s=>/^[a-f0-9]{40}$/i.test(String(s||''));
export function validateEducationSnapshot({mergeSha='',releaseSha='',comparison=null}={}){
 if(!isSha(mergeSha)||!isSha(releaseSha))return {ok:false,reason:'invalid_commit_sha'};
 if(mergeSha===releaseSha)return {ok:true,reason:'exact_merge',releaseSha};
 if(!comparison||comparison.status!=='ahead'||!Number.isInteger(comparison.ahead_by)||comparison.ahead_by<1)
   return {ok:false,reason:'not_a_verified_main_ancestor'};
 if(!Array.isArray(comparison.files)||comparison.files.length>=300)
   return {ok:false,reason:'compare_file_list_incomplete'};
 if(educationReleaseChanged(comparison.files.map(x=>x.filename)))
   return {ok:false,reason:'newer_education_change_requires_own_orchestrator_authority'};
 return {ok:true,reason:'verified_unrelated_main_advance',releaseSha};
}
export function validOfficialEducationCandidate(pr,files=[]){
 if(!pr||pr.state!=='closed'||!pr.merged_at||pr.base?.ref!=='main')return false;
 if(!parseOrchestratorReleaseBranch(pr.head?.ref)||!isSha(pr.head?.sha)||!isSha(pr.merge_commit_sha))return false;
 return educationReleaseChanged(files);
}
function fail(message){throw Error('[EDUCATION RELEASE SNAPSHOT] '+message)}
export async function verifyEducationReleaseSnapshot({repo,token,branch,taskId,releaseSha,fetchImpl=fetch,receiptVerifier=verifyOrchestratorReleaseReceipt}={}){
 if(repo!=='topmaster-joseph/ekodi-platform'||!token||!isSha(releaseSha))fail('trusted repo, token and exact protected release SHA required');
 const parsed=parseOrchestratorReleaseBranch(branch);
 if(!parsed||parsed.taskId!==taskId)fail('exact orchestrator branch and task required');
 const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'};
 const api=async route=>{
   const res=await fetchImpl('https://api.github.com/repos/'+repo+route,{headers,signal:AbortSignal.timeout(15000)});
   if(!res.ok)fail('GitHub '+route.split('?')[0]+' returned HTTP '+res.status);
   return res.json();
 };
 const owner=repo.split('/')[0];
 const pulls=await api('/pulls?state=closed&base=main&head='+encodeURIComponent(owner+':'+branch)+'&per_page=100');
 const candidates=Array.isArray(pulls)?pulls.filter(pr=>pr.head?.ref===branch&&pr.merged_at&&pr.state==='closed'):[];
 if(candidates.length!==1)fail('one exact previously merged official PR required');
 const pr=candidates[0];
 const changed=await api('/pulls/'+pr.number+'/files?per_page=100');
 if(!Array.isArray(changed)||changed.length===100||!validOfficialEducationCandidate(pr,changed.map(x=>x.filename)))
   fail('merged PR must have exhaustively inspected Education-owned files');
 const mergeSha=pr.merge_commit_sha;
 const associated=await api('/commits/'+mergeSha+'/pulls?per_page=100');
 if(!Array.isArray(associated)||!associated.some(x=>x.number===pr.number&&x.merged_at))fail('verified merge commit to PR association required');
 const comparison=mergeSha===releaseSha?null:await api('/compare/'+mergeSha+'...'+releaseSha);
 const snapshot=validateEducationSnapshot({mergeSha,releaseSha,comparison});
 if(!snapshot.ok)fail(snapshot.reason);
 const status=await api('/commits/'+pr.head.sha+'/status');
 const checks=new Map((status.statuses||[]).map(x=>[x.context,x.state]));
 for(const name of ['test','EKODI AI Orchestration Gate'])
   if(checks.get(name)!=='success')fail('original required source check not green: '+name);
 await receiptVerifier(branch,{explicitTaskId:taskId});
 return {ok:true,releaseSha,mergeSha,branch,taskId,pr:pr.number,sourceSha:pr.head.sha,reason:snapshot.reason};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 verifyEducationReleaseSnapshot({
  repo:process.env.GITHUB_REPOSITORY,token:process.env.GH_TOKEN||process.env.GITHUB_TOKEN,
  branch:process.env.REQUESTED_BRANCH,taskId:process.env.REQUESTED_TASK,
  releaseSha:process.env.REQUESTED_SHA
 }).then(x=>console.log(JSON.stringify({...x,productionDeployed:false})))
 .catch(e=>{console.error(String(e.message||e));process.exitCode=1});
}
