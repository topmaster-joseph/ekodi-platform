#!/usr/bin/env node
// CONTROL-API-DISPATCH-RECEIPT-001 (2026-10-24): four workflows ran
// `gh workflow run deploy-control-api.yml` without the release_branch_ref and
// release_task_id inputs that lane requires, so every dispatch failed with HTTP
// 422 (marketing store connectors since 2026-10-09, AI provider control on the
// 55007bee release). This dispatcher replaces them:
//  - if a Deploy Control API run already releases this SHA, nothing is
//    dispatched (no guessing from path heuristics);
//  - otherwise the release receipt comes from the merged orchestrator-issued PR
//    (ai/<agent>/orch_<task-id>) that produced this SHA;
//  - without such a PR it fails closed: the release gate would refuse it anyway.
//
// CONTROL-API-DISPATCH-DEDUPE-001 (2026-10-24): on 964a8206 the four callers ran
// at once, each saw no run yet, and Control API was dispatched three times. The
// callers now share the concurrency group `control-api-release-dispatch-<sha>`,
// which runs them one at a time, and this script closes the remaining gaps:
//  - it re-checks immediately before dispatching;
//  - after dispatching it waits until the new run is visible, so the next caller
//    in the group sees it;
//  - a dispatched run releases every SHA its head contains, so a run whose head
//    moved past this SHA (main advanced before the dispatch) still counts.

const ORCHESTRATOR_BRANCH=/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/(orch_[a-z0-9][a-z0-9_-]{15,120})$/i;
const WORKFLOW='deploy-control-api.yml';
export const CONTROL_API_DISPATCH_GROUP_PREFIX='control-api-release-dispatch-';

export async function dispatchControlApiRelease({
  repo,sha,token,fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  lookupAttempts=3,lookupDelayMs=10_000,visibleAttempts=6,visibleDelayMs=5_000,
  now=()=>Date.now(),log=console.log,
}={}){
  if(!repo||!/^[a-f0-9]{40}$/i.test(String(sha||''))||!token)throw new Error('[CONTROL-API-DISPATCH] repository, exact SHA and token are required');
  const api=async(path,init={})=>{
    const response=await fetchImpl(`https://api.github.com/repos/${repo}${path}`,{...init,headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json',...(init.headers||{})}});
    const text=await response.text();
    let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
    return {status:response.status,ok:response.ok,data};
  };

  const commit=await api(`/commits/${sha}`);
  if(!commit.ok)throw new Error(`[CONTROL-API-DISPATCH] commit lookup failed: HTTP ${commit.status}`);
  const committedAt=Date.parse(commit.data?.commit?.committer?.date||'')||0;
  const contains=new Map();
  const headContainsSha=async head=>{
    if(head===sha)return true;
    if(!contains.has(head)){
      const comparison=await api(`/compare/${sha}...${head}`);
      contains.set(head,comparison.ok&&['ahead','identical'].includes(String(comparison.data?.status||'')));
    }
    return contains.get(head);
  };
  // A push run on this SHA, or any dispatched run created after it on a head that
  // contains it (converge, another caller, or main having advanced), releases it.
  const releasingRun=async({createdAfter=committedAt}={})=>{
    const runs=await api(`/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=20`);
    if(!runs.ok)throw new Error(`[CONTROL-API-DISPATCH] run lookup failed: HTTP ${runs.status}`);
    for(const run of runs.data?.workflow_runs||[]){
      if(!['push','workflow_dispatch'].includes(run?.event)||run?.conclusion==='cancelled')continue;
      if(run.event==='push'&&run.head_sha!==sha)continue;
      if(run.event==='workflow_dispatch'&&(Date.parse(run.created_at||'')||0)<createdAfter)continue;
      if(await headContainsSha(String(run.head_sha||'')))return run;
    }
    return null;
  };
  const skip=(run,stage)=>{
    log(JSON.stringify({ok:true,action:'already-triggered',stage,workflow:WORKFLOW,runId:run.id,runHead:run.head_sha,sha}));
    return {dispatched:false,reason:'already-triggered',stage,runId:run.id};
  };

  for(let attempt=1;attempt<=lookupAttempts;attempt++){
    const existing=await releasingRun();
    if(existing)return skip(existing,'lookup');
    if(attempt<lookupAttempts)await sleep(lookupDelayMs);
  }

  const pulls=await api(`/commits/${sha}/pulls`);
  if(!pulls.ok)throw new Error(`[CONTROL-API-DISPATCH] merged PR lookup failed: HTTP ${pulls.status}`);
  const pr=(Array.isArray(pulls.data)?pulls.data:[]).find(item=>item?.merged_at&&item?.base?.ref==='main'&&ORCHESTRATOR_BRANCH.test(String(item?.head?.ref||'')));
  if(!pr)throw new Error(`[CONTROL-API-DISPATCH] ${sha.slice(0,12)} was not produced by a merged orchestrator-issued PR; the Control API release gate requires one`);
  const branch=String(pr.head.ref);
  const taskId=branch.match(ORCHESTRATOR_BRANCH)[1];

  // Re-check right before dispatching: another caller may have dispatched meanwhile.
  const late=await releasingRun();
  if(late)return skip(late,'pre-dispatch');

  const dispatchedAt=now();
  const dispatch=await api(`/actions/workflows/${WORKFLOW}/dispatches`,{method:'POST',body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})});
  if(dispatch.status!==204)throw new Error(`[CONTROL-API-DISPATCH] dispatch failed: HTTP ${dispatch.status} ${JSON.stringify(dispatch.data).slice(0,300)}`);

  // Hold the concurrency slot until the run is visible, so the next caller skips it.
  let visible=null;
  for(let attempt=1;attempt<=visibleAttempts&&!visible;attempt++){
    await sleep(visibleDelayMs);
    visible=await releasingRun({createdAfter:dispatchedAt-5_000});
  }
  if(!visible)log(JSON.stringify({ok:true,warning:'dispatched-run-not-yet-visible',workflow:WORKFLOW,sha}));
  log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:WORKFLOW,pr:pr.number,branch,taskId,sha,runId:visible?.id||null}));
  return {dispatched:true,branch,taskId,pr:pr.number,runId:visible?.id||null};
}

if(import.meta.url===`file://${process.argv[1]}`||process.argv[1]?.endsWith('dispatch-control-api-release.mjs')){
  dispatchControlApiRelease({
    repo:String(process.env.GITHUB_REPOSITORY||'').trim(),
    sha:String(process.env.GITHUB_SHA||'').trim(),
    token:String(process.env.GH_TOKEN||'').trim(),
  }).catch(error=>{console.error(String(error?.message||error));process.exit(1)});
}
