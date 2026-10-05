const REQUIRED_WORKFLOWS=Object.freeze(['CI','EKODI AI Orchestration Gate']);

function text(value,max=500){return String(value??'').trim().slice(0,max)}
function success(item){return item?.status==='completed'&&item?.conclusion==='success'}
function stagingJob(job){return text(job?.name,160).toLowerCase().includes('staging')}
function productionJob(job){
  const name=text(job?.name,160).toLowerCase();
  return !name.includes('staging')&&(name==='deploy'||name==='production'||name.endsWith(' / deploy')||name.endsWith(' / production')||name.includes('deploy-production')||name.includes('production deploy'));
}

async function laterSuccessfulRunContainingMerge({github,owner,repo,original,mergeSha}){
  const response=await github.rest.actions.listWorkflowRuns({
    owner,repo,workflow_id:original.workflow_id,branch:'main',event:'push',status:'success',per_page:20,
  });
  for(const candidate of response.data?.workflow_runs||[]){
    if(Number(candidate.id)===Number(original.id)||!success(candidate))continue;
    if(String(candidate.head_sha||'')===mergeSha)return candidate;
    const comparison=await github.rest.repos.compareCommits({owner,repo,base:mergeSha,head:String(candidate.head_sha||'')});
    if(['ahead','identical'].includes(String(comparison.data?.status||'').toLowerCase()))return candidate;
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

  const runResponse=await github.rest.actions.listWorkflowRunsForRepo({owner,repo,head_sha:mergeSha,event:'push',per_page:100});
  const runs=runResponse.data?.workflow_runs||[];
  const requiredWorkflows=[];
  for(const name of REQUIRED_WORKFLOWS){
    const run=runs.find(item=>item?.name===name);
    if(!success(run))return {verified:false,reason:'required_workflow_not_successful',workflow:name};
    requiredWorkflows.push({name,runId:Number(run.id),url:text(run.html_url,400),conclusion:'success'});
  }

  const triggered=runs.filter(item=>/^Deploy\b/i.test(text(item?.name,160)));
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
