#!/usr/bin/env node
// CONTROL-API-DISPATCH-RECEIPT-001 (2026-10-24): four workflows ran
// `gh workflow run deploy-control-api.yml` without the release_branch_ref and
// release_task_id inputs that lane requires, so every dispatch failed with HTTP
// 422 (marketing store connectors since 2026-10-09, AI provider control on the
// 55007bee release). This dispatcher replaces them:
//  - if a push or dispatched Deploy Control API run already exists for this
//    exact SHA, nothing is dispatched (no guessing from path heuristics);
//  - otherwise the release receipt comes from the merged orchestrator-issued PR
//    (ai/<agent>/orch_<task-id>) that produced this SHA;
//  - without such a PR it fails closed: the release gate would refuse it anyway.

const ORCHESTRATOR_BRANCH=/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/(orch_[a-z0-9][a-z0-9_-]{15,120})$/i;
const WORKFLOW='deploy-control-api.yml';

export async function dispatchControlApiRelease({repo,sha,token,fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),lookupAttempts=3,lookupDelayMs=10_000,log=console.log}={}){
  if(!repo||!/^[a-f0-9]{40}$/i.test(String(sha||''))||!token)throw new Error('[CONTROL-API-DISPATCH] repository, exact SHA and token are required');
  const api=async(path,init={})=>{
    const response=await fetchImpl(`https://api.github.com/repos/${repo}${path}`,{...init,headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json',...(init.headers||{})}});
    const text=await response.text();
    let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
    return {status:response.status,ok:response.ok,data};
  };

  for(let attempt=1;attempt<=lookupAttempts;attempt++){
    // A push run, or a converge dispatch on the same SHA, already releases it.
    const runs=await api(`/actions/workflows/${WORKFLOW}/runs?head_sha=${sha}&per_page=20`);
    if(!runs.ok)throw new Error(`[CONTROL-API-DISPATCH] run lookup failed: HTTP ${runs.status}`);
    const existing=(runs.data?.workflow_runs||[]).find(run=>run?.head_sha===sha&&['push','workflow_dispatch'].includes(run?.event));
    if(existing){
      log(JSON.stringify({ok:true,action:'already-triggered',workflow:WORKFLOW,runId:existing.id,sha}));
      return {dispatched:false,reason:'already-triggered',runId:existing.id};
    }
    if(attempt<lookupAttempts)await sleep(lookupDelayMs);
  }

  const pulls=await api(`/commits/${sha}/pulls`);
  if(!pulls.ok)throw new Error(`[CONTROL-API-DISPATCH] merged PR lookup failed: HTTP ${pulls.status}`);
  const pr=(Array.isArray(pulls.data)?pulls.data:[]).find(item=>item?.merged_at&&item?.base?.ref==='main'&&ORCHESTRATOR_BRANCH.test(String(item?.head?.ref||'')));
  if(!pr)throw new Error(`[CONTROL-API-DISPATCH] ${sha.slice(0,12)} was not produced by a merged orchestrator-issued PR; the Control API release gate requires one`);
  const branch=String(pr.head.ref);
  const taskId=branch.match(ORCHESTRATOR_BRANCH)[1];

  const dispatch=await api(`/actions/workflows/${WORKFLOW}/dispatches`,{method:'POST',body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})});
  if(dispatch.status!==204)throw new Error(`[CONTROL-API-DISPATCH] dispatch failed: HTTP ${dispatch.status} ${JSON.stringify(dispatch.data).slice(0,300)}`);
  log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:WORKFLOW,pr:pr.number,branch,taskId,sha}));
  return {dispatched:true,branch,taskId,pr:pr.number};
}

if(import.meta.url===`file://${process.argv[1]}`||process.argv[1]?.endsWith('dispatch-control-api-release.mjs')){
  dispatchControlApiRelease({
    repo:String(process.env.GITHUB_REPOSITORY||'').trim(),
    sha:String(process.env.GITHUB_SHA||'').trim(),
    token:String(process.env.GH_TOKEN||'').trim(),
  }).catch(error=>{console.error(String(error?.message||error));process.exit(1)});
}
