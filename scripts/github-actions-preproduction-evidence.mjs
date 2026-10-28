// Read-only verifier for EKODI's exact-release preproduction proof.
// Must run inside an authenticated first-party GitHub Actions/OIDC reconciler;
// the result by itself MUST NOT be accepted as a credential or deployment permit.
// No CLI side effects, production mutation, or synthetic success fallback.
const EXPECTED_REPO='topmaster-joseph/ekodi-platform';
const REQUIRED_PR_CHECKS=Object.freeze(['CI','EKODI AI Orchestration Gate','EKODI Dependency Security']);
const TASK=/^orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const BRANCH=/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const SHA=/^[a-f0-9]{40}$/i;
const DIGEST=/^sha256:[a-f0-9]{64}$/i;
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const pass=x=>x?.status==='completed'&&x?.conclusion==='success';
const reject=(reason,more={})=>Object.freeze({verified:false,reason,...more});
const latest=xs=>xs.slice().sort((a,b)=>
  String(b?.created_at||'').localeCompare(String(a?.created_at||''))||Number(b?.id||0)-Number(a?.id||0))[0]||null;

/**
 * The accepted digest must originate from GitHub's artifact API, never from
 * an input field or model-generated staging report. The artifact uploader is
 * separate and must be produced by the real guarded staging workflow.
 *
 * Only the canonical EKODI OIDC receiver may attach source
 * 'github-actions-oidc' and write the authoritative D1 audit event, after it
 * verifies its JWT and repository/ref/workflow boundary separately.
 */
export async function collectEkodiPreproductionEvidence({github,owner='topmaster-joseph',repo='ekodi-platform',taskId,branchRef}={}){
  const task=clean(taskId,160),branch=clean(branchRef,220);
  if(`${owner}/${repo}`!==EXPECTED_REPO)return reject('repository_not_authorized');
  if(!TASK.test(task)||!BRANCH.test(branch)||!branch.endsWith('/'+task))return reject('official_orchestrator_branch_required');
  if(!github?.rest?.pulls?.list||!github?.rest?.actions?.listWorkflowRunsForRepo)return reject('authenticated_github_client_required');
  try{
    const pulls=await github.rest.pulls.list({owner,repo,state:'closed',head:`${owner}:${branch}`,per_page:100});
    const merged=(pulls.data||[]).filter(p=>p.merged_at&&p.head?.ref===branch&&p.base?.ref==='main');
    if(merged.length!==1)return reject('unique_official_merged_pr_required');
    const pr=merged[0],releaseSha=clean(pr.merge_commit_sha,80),headSha=clean(pr.head?.sha,80);
    if(!SHA.test(releaseSha)||!SHA.test(headSha))return reject('exact_merge_and_review_sha_required');
    const checks=await github.rest.actions.listWorkflowRunsForRepo({owner,repo,head_sha:headSha,event:'pull_request',per_page:100});
    for(const name of REQUIRED_PR_CHECKS){
      const check=latest((checks.data?.workflow_runs||[]).filter(r=>r.name===name));
      if(!pass(check))return reject('required_pr_gate_unverified',{gate:name});
    }
    const runs=await github.rest.actions.listWorkflowRunsForRepo({owner,repo,head_sha:releaseSha,per_page:100});
    const candidates=(runs.data?.workflow_runs||[]).filter(r=>
      /^Deploy\b/.test(clean(r.name,100))&&r.head_branch==='main'&&
      ['workflow_dispatch','push'].includes(r.event)&&r.head_sha===releaseSha);
    if(!candidates.length)return reject('guarded_staging_run_missing');
    for(const run of candidates.sort((a,b)=>Number(b.id)-Number(a.id))){
      const id=Number(run.id);
      if(!Number.isSafeInteger(id)||id<1)continue;
      const jobs=await github.rest.actions.listJobsForWorkflowRun({owner,repo,run_id:id,per_page:100});
      // A successful staging job from a run that has *already begun*
      // production is post-hoc evidence, never a valid prepromotion approval.
      const productionAlreadyStarted=(jobs.data?.jobs||[]).some(j=>{
        const name=clean(j.name,120).toLowerCase();
        if(name.includes('staging')||name.includes('rollback'))return false;
        if(!/(production|promot|deploy-release|^deploy$|^release$)/.test(name))return false;
        return j.status==='in_progress'||
          (j.status==='completed'&&j.conclusion!=='skipped')||
          Boolean(j.started_at);
      });
      if(productionAlreadyStarted)continue;
      const stages=(jobs.data?.jobs||[]).filter(j=>/\bstaging\b/i.test(clean(j.name,120))&&pass(j));
      if(!stages.length)continue;
      // A successful staging job alone is insufficient proof of a tested
      // rollback. It must have a separately named, successful preflight.
      const rollbackVerified=stages.some(j=>(j.steps||[]).some(s=>
        /^Verify guarded rollback readiness$/.test(clean(s.name,160))&&pass(s)));
      if(!rollbackVerified)continue;
      const artifacts=await github.rest.actions.listWorkflowRunArtifacts({owner,repo,run_id:id,per_page:100});
      const expectedName=`ekodi-preproduction-${task}`;
      const qualifying=(artifacts.data?.artifacts||[]).filter(a=>
        a.name===expectedName&&a.expired===false&&Number(a.size_in_bytes)>0&&
        DIGEST.test(clean(a.digest,150))&&(!a.workflow_run?.id||Number(a.workflow_run.id)===id));
      if(qualifying.length!==1)continue;
      const a=qualifying[0],verifiedAt=new Date().toISOString();
      return Object.freeze({
        verified:true,authority:'ekodi-orchestrator',source:'github-actions-staging-verifier',
        taskId:task,branchRef:branch,releaseSha,
        artifactDigest:clean(a.digest,150),artifactId:Number(a.id),
        pullRequest:Number(pr.number),sourceHeadSha:headSha,
        requiredCiVerified:true,securityReviewVerified:true,stagingVerified:true,
        rollbackReady:true,stagingRunId:id,verifiedAt,
        releaseAuthorized:false,productionDeployed:false,
      });
    }
    return reject('staging_rollback_or_immutable_artifact_unverified');
  }catch(error){
    return reject('github_staging_evidence_unavailable',{detail:clean(error?.message,120)});
  }
}
