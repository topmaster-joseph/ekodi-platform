const REQUIRED_WORKFLOWS=Object.freeze(['CI','EKODI AI Orchestration Gate']);
const STAGING_EQUIVALENTS=Object.freeze({
  'Deploy CGMA Apex Edge':Object.freeze({
    job:'validate',
    requiredSteps:Object.freeze(['Validate CGMA edge contract']),
  }),
  'Deploy Independent Board':Object.freeze({
    job:'validate',
    requiredSteps:Object.freeze(['Validate standalone board contract']),
  }),
});

// Explicit, non-generalizable release evidence for the approved EKODI native watch.
// Normal Worker deployments retain their staging and production requirements.
const NATIVE_WATCH_RELEASE=Object.freeze({
  taskId:'orch_recovery_dcf5dace563ac6da0488a29708afcf21',
  branchRef:'ai/gpt6/orch_recovery_dcf5dace563ac6da0488a29708afcf21',
  prNumber:4383,
  workflow:'EKODI Native Operations Watch',
  path:'.github/workflows/ekodi-native-operations-watch.yml',
  files:Object.freeze([
    '.github/workflows/ekodi-native-operations-watch.yml',
    'config/ekodi-native-monitoring-ownership.json',
    'scripts/ekodi-native-operations-watch.mjs',
    'test/ekodi-native-operations-watch.test.mjs',
  ]),
  steps:Object.freeze([
    'Collect EKODI-owned read-only operational evidence',
    'Preserve privacy-safe evidence, including failures',
  ]),
});

async function collectNativeWatchEvidence({github,owner,repo,task,branch,pr,mergeSha}){
  const expected=NATIVE_WATCH_RELEASE;
  if(task!==expected.taskId||branch!==expected.branchRef||Number(pr?.number)!==expected.prNumber)
    return {verified:false,reason:'native_release_not_allowlisted'};

  // An unrelated Worker/code change must never qualify as Actions-only.
  const changes=await github.rest.pulls.listFiles({owner,repo,pull_number:expected.prNumber,per_page:100});
  const files=(changes.data||[]).map(x=>x.filename).sort();
  if(files.length!==expected.files.length||files.some((x,i)=>x!==expected.files[i])||
     (changes.data||[]).some(x=>x.status==='removed'))
    return {verified:false,reason:'native_release_file_scope_invalid'};

  const wf=await github.rest.actions.getWorkflow({owner,repo,workflow_id:'ekodi-native-operations-watch.yml'});
  if(wf.data?.state!=='active'||wf.data?.path!==expected.path||!Number.isSafeInteger(Number(wf.data?.id)))
    return {verified:false,reason:'native_workflow_not_active'};

  let selected=null;
  for(const event of ['schedule','workflow_dispatch']){
    const response=await github.rest.actions.listWorkflowRuns({
      owner,repo,workflow_id:Number(wf.data.id),branch:'main',event,per_page:30,
    });
    for(const run of response.data?.workflow_runs||[]){
      if(!success(run)||run.name!==expected.workflow||run.event!==event||run.head_branch!=='main')continue;
      if(Date.parse(run.created_at)<=Date.parse(pr.merged_at))continue;
      const head=text(run.head_sha,80);
      if(!/^[a-f0-9]{40}$/i.test(head))continue;
      if(head!==mergeSha){
        const ancestry=await github.rest.repos.compareCommits({owner,repo,base:mergeSha,head});
        if(!['ahead','identical'].includes(String(ancestry.data?.status||'').toLowerCase()))continue;
      }
      if(!selected||String(run.created_at)>String(selected.created_at))selected=run;
    }
  }
  if(!selected)return {verified:false,reason:'native_observe_success_missing'};
  const jobsResult=await github.rest.actions.listJobsForWorkflowRun({
    owner,repo,run_id:Number(selected.id),per_page:100,
  });
  const observe=(jobsResult.data?.jobs||[]).find(x=>x.name==='observe'&&success(x));
  if(!observe||!expected.steps.every(n=>observe.steps?.some(x=>x.name===n&&success(x))))
    return {verified:false,reason:'native_observe_steps_missing'};
  const artifactResult=await github.rest.actions.listWorkflowRunArtifacts({
    owner,repo,run_id:Number(selected.id),per_page:100,
  });
  const artifactName='ekodi-native-operations-'+Number(selected.id);
  const artifact=(artifactResult.data?.artifacts||[]).find(x=>
    x.name===artifactName&&x.expired===false&&Number(x.size_in_bytes)>0&&
    (!x.workflow_run?.id||Number(x.workflow_run.id)===Number(selected.id)));
  if(!artifact)return {verified:false,reason:'native_evidence_artifact_missing'};
  return {verified:true,nativeWorkflow:{
    name:expected.workflow,path:expected.path,workflowId:Number(wf.data.id),
    runId:Number(selected.id),runEvent:selected.event,
    runHeadSha:text(selected.head_sha,80),runCreatedAt:text(selected.created_at,80),
    runUrl:text(selected.html_url,400),observeJob:'observe',
    verifiedSteps:[...expected.steps],
    artifactName,artifactId:Number(artifact.id),artifactBytes:Number(artifact.size_in_bytes),
  }};
}

function text(value,max=500){return String(value??'').trim().slice(0,max)}
function success(item){return item?.status==='completed'&&item?.conclusion==='success'}
function stagingJob(job){return text(job?.name,160).toLowerCase().includes('staging')}
function stagingEquivalentJobs(run,jobs){
  const rule=STAGING_EQUIVALENTS[text(run?.name,160)];
  if(!rule)return [];
  const job=(jobs||[]).find(item=>text(item?.name,160)===rule.job&&success(item));
  if(!job)return [];
  const steps=Array.isArray(job.steps)?job.steps:[];
  const verified=rule.requiredSteps.every(required=>steps.some(step=>text(step?.name,160)===required&&success(step)));
  return verified?[`${rule.job} (preproduction-equivalent)`]:[];
}
function productionJob(job){
  const name=text(job?.name,160).toLowerCase();
  return !name.includes('staging')&&(name==='deploy'||name==='production'||name.endsWith(' / deploy')||name.endsWith(' / production')||name.includes('deploy-production')||name.includes('production deploy'));
}

// Production deploys are dispatched with the merge commit (a GITHUB_TOKEN merge
// emits no push run), so a superseding run may be `push` or `workflow_dispatch`.
// It must still be a successful run of the same workflow on main whose head
// contains the merge commit; staging and production jobs are checked by the caller.
const SUPERSEDING_EVENTS=Object.freeze(['push','workflow_dispatch']);
async function laterSuccessfulRunContainingMerge({github,owner,repo,original,mergeSha}){
  const runs=[];
  for(const event of SUPERSEDING_EVENTS){
    const response=await github.rest.actions.listWorkflowRuns({
      owner,repo,workflow_id:original.workflow_id,branch:'main',event,status:'success',per_page:20,
    });
    runs.push(...(response.data?.workflow_runs||[]).map(run=>({...run,event:run.event||event})));
  }
  runs.sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
  for(const candidate of runs){
    if(Number(candidate.id)===Number(original.id)||!success(candidate))continue;
    if(String(candidate.head_branch||'main')!=='main'||!SUPERSEDING_EVENTS.includes(String(candidate.event||'')))continue;
    if(String(candidate.created_at||'')<String(original.created_at||''))continue;
    if(String(candidate.head_sha||'')===mergeSha)return candidate;
    const comparison=await github.rest.repos.compareCommits({owner,repo,base:mergeSha,head:String(candidate.head_sha||'')});
    if(['ahead','identical'].includes(String(comparison.data?.status||'').toLowerCase()))return candidate;
  }
  return null;
}

// 2026-10-20: a completed run that executed zero jobs (e.g. an approval-gated
// run that never started) produced no verdict and must not mask the verdict of
// a run that actually executed on the same head SHA. Newest-first; the first run
// that is pending, or that executed and did not succeed, still fails closed.
async function latestVerdictRun({github,owner,repo,runs}){
  const ordered=runs.slice().sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||''))||Number(b?.id||0)-Number(a?.id||0));
  for(const run of ordered){
    if(success(run))return run;
    if(run?.status!=='completed')return run;
    const jobs=await github.rest.actions.listJobsForWorkflowRun({owner,repo,run_id:Number(run.id),filter:'all',per_page:1});
    const executed=Number(jobs.data?.total_count??(jobs.data?.jobs||[]).length);
    if(executed>0)return run;
  }
  return null;
}

export async function collectAuthenticatedCompletionEvidence({github,owner='topmaster-joseph',repo='ekodi-platform',taskId,branchRef}={}){
  const task=text(taskId,160),branch=text(branchRef,220);
  if(!/^orch_[a-z0-9][a-z0-9_-]{15,120}$/i.test(task)||!branch.endsWith(`/${task}`))return {verified:false,reason:'invalid_task_or_branch'};

  const pulls=await github.rest.pulls.list({owner,repo,state:'closed',head:`${owner}:${branch}`,per_page:20});
  const pr=(pulls.data||[])
    .filter(item=>item?.merged_at&&item?.head?.ref===branch&&item?.base?.ref==='main')
    .sort((a,b)=>String(b.merged_at).localeCompare(String(a.merged_at)))[0];
  if(!pr)return {verified:false,reason:'merged_pr_not_found'};
  const mergeSha=text(pr.merge_commit_sha,80);
  if(!/^[a-f0-9]{40}$/i.test(mergeSha))return {verified:false,reason:'merge_commit_missing'};

  // A guarded GITHUB_TOKEN squash merge does not emit a new main push run.
  // Bind mandatory checks to the exact head SHA of the merged PR instead.
  const validatedHeadSha=text(pr.head?.sha,80);
  if(!/^[a-f0-9]{40}$/i.test(validatedHeadSha))return {verified:false,reason:'merged_pr_head_missing'};
  const checkResponse=await github.rest.actions.listWorkflowRunsForRepo({owner,repo,head_sha:validatedHeadSha,event:'pull_request',per_page:100});
  const checkRuns=checkResponse.data?.workflow_runs||[];
  const requiredWorkflows=[];
  for(const name of REQUIRED_WORKFLOWS){
    const run=await latestVerdictRun({github,owner,repo,runs:checkRuns.filter(item=>item?.name===name)});
    if(!success(run))return {verified:false,reason:'required_workflow_not_successful',workflow:name};
    requiredWorkflows.push({name,runId:Number(run.id),url:text(run.html_url,400),conclusion:'success'});
  }

  if(task===NATIVE_WATCH_RELEASE.taskId){
    const native=await collectNativeWatchEvidence({github,owner,repo,task,branch,pr,mergeSha});
    if(native.verified!==true)return native;
    return {
      verified:true,source:'github-actions-native-operations-verified',
      deliveryKind:'github-actions-schedule',taskId:task,branchRef:branch,
      pr:{number:Number(pr.number),url:text(pr.html_url,400),mergedAt:text(pr.merged_at,80),mergeCommitSha:mergeSha},
      requiredWorkflows,nativeWorkflow:native.nativeWorkflow,deployments:[],
    };
  }

  // The production deployment is explicitly dispatched with the merge commit.
  // Never treat PR preview workflows as promoted production deployments.
  const deploymentResponse=await github.rest.actions.listWorkflowRunsForRepo({owner,repo,head_sha:mergeSha,per_page:100});
  const triggered=(deploymentResponse.data?.workflow_runs||[]).filter(item=>/^(?:Deploy)\b/i.test(text(item?.name,160))&&['push','workflow_dispatch'].includes(text(item?.event,40)));
  if(!triggered.length)return {verified:false,reason:'production_deployment_run_missing'};
  const deployments=[];
  let hasStaging=false,hasProduction=false;
  for(const original of triggered){
    let run=original;
    let supersedesRunId=null;
    if(!success(run)){
      run=await laterSuccessfulRunContainingMerge({github,owner,repo,original,mergeSha});
      if(!run)return {verified:false,reason:'deployment_run_not_successful',workflow:text(original.name,160)};
      supersedesRunId=Number(original.id);
    }
    const jobsResponse=await github.rest.actions.listJobsForWorkflowRun({owner,repo,run_id:Number(run.id),per_page:100});
    const jobs=jobsResponse.data?.jobs||[];
    const stagingJobs=jobs.filter(job=>stagingJob(job)&&success(job)).map(job=>text(job.name,160));
    if(!stagingJobs.length)stagingJobs.push(...stagingEquivalentJobs(run,jobs));
    const productionJobs=jobs.filter(job=>productionJob(job)&&success(job)).map(job=>text(job.name,160));
    if(stagingJobs.length)hasStaging=true;
    if(productionJobs.length)hasProduction=true;
    deployments.push({
      workflow:text(run.name,160),
      runId:Number(run.id),
      htmlUrl:text(run.html_url,400),
      supersedesRunId,
      stagingJobs,
      productionJobs,
    });
  }
  if(!hasStaging)return {verified:false,reason:'staging_evidence_missing'};
  if(!hasProduction)return {verified:false,reason:'production_promotion_evidence_missing'};

  return {
    verified:true,
    source:'github-actions-authenticated-api',
    taskId:task,
    branchRef:branch,
    pr:{number:Number(pr.number),url:text(pr.html_url,400),mergedAt:text(pr.merged_at,80),mergeCommitSha:mergeSha},
    requiredWorkflows,
    deployments,
  };
}
