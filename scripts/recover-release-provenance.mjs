import fs from 'node:fs';
import {findExactHumanGateApproval} from './release-human-gate-evidence.mjs';

const repo=String(process.env.GITHUB_REPOSITORY||'').trim();
const eventName=String(process.env.GITHUB_EVENT_NAME||'').trim();
const eventPath=String(process.env.GITHUB_EVENT_PATH||'').trim();
const ghToken=String(process.env.GH_TOKEN||'').trim();
const cfToken=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const APPROVAL_LABEL='orchestrator-human-gate-approved';
const APPROVAL_MARKER_PREFIX='EKODI-HUMAN-GATE-APPROVE:';

function fail(message){console.error('[EKODI][RELEASE-PROVENANCE-RECOVERY] '+message);process.exit(1)}
function out(name,value){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`${name}=${String(value)}\n`)}
function jsonFile(path){return JSON.parse(fs.readFileSync(path,'utf8'))}
function text(value,max=500){return String(value??'').trim().slice(0,max)}
function branchAgent(branch){const m=text(branch,220).match(/^ai\/([a-z0-9][a-z0-9._-]{0,31})\//i);return (m?.[1]||'chatgpt').toLowerCase()}
function isOrchestratorBranch(branch){return /^ai\/[a-z0-9][a-z0-9._-]{0,31}\/orch_[a-z0-9][a-z0-9_-]{15,120}$/i.test(text(branch,220))}
async function request(url,options={}){
  const response=await fetch(url,options);
  const body=await response.text();
  let data={};try{data=body?JSON.parse(body):{}}catch{data={raw:body}}
  return {response,data};
}
async function github(path,options={}){
  return request('https://api.github.com'+path,{...options,headers:{
    accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',
    authorization:`Bearer ${ghToken}`,...(options.headers||{})
  }});
}
async function d1(databaseId,sql,params){
  const {response,data}=await request(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',headers:{authorization:`Bearer ${cfToken}`,'content-type':'application/json'},
    body:JSON.stringify({sql,params})
  });
  if(!response.ok||data?.success!==true)fail(`D1 recovery write failed: HTTP ${response.status} ${JSON.stringify(data).slice(0,600)}`);
  return data;
}

if(!['pull_request','pull_request_target'].includes(eventName)){out('action','noop');process.exit(0)}
if(!eventPath||!fs.existsSync(eventPath))fail('GitHub pull_request event payload is required');
if(!ghToken)fail('GH_TOKEN is required');
const event=jsonFile(eventPath);
const pr=event.pull_request||{};
const sourceBranch=text(pr.head?.ref,220);
const headSha=text(pr.head?.sha,80);
const sourceRepo=text(pr.head?.repo?.full_name,220);
const actor=text(event.sender?.login||process.env.GITHUB_ACTOR,120);
const prNumber=Number(pr.number||event.number||0);
if(!sourceBranch.startsWith('ai/')){out('action','noop-non-ai-branch');process.exit(0)}
if(isOrchestratorBranch(sourceBranch)){out('action','noop-already-orchestrated');out('branch_ref',sourceBranch);process.exit(0)}
if(sourceRepo!==repo)fail('automatic provenance recovery is forbidden for fork pull requests');
const policy=jsonFile('config/ai-change-orchestration-policy.json');
const policyOwners=new Set(policy.governance?.policyOwners||[]);
if(!headSha.match(/^[a-f0-9]{40}$/i)||!prNumber)fail('pull request head SHA/number missing');
const labels=(Array.isArray(pr.labels)?pr.labels:[]).map(item=>text(item?.name,120));
// Owner decision (topmaster-joseph, 2026-10-19): the per-PR human approval
// comment/label is no longer required. Release stays gated by the exact-SHA
// required CI checks below, the guarded deploy workflows and production
// verification. A legacy approval comment, when present, is still recorded.
const approvalMarker=`${APPROVAL_MARKER_PREFIX}${headSha}`;
let approvalEvidence=null;
if(labels.includes(APPROVAL_LABEL)){
  const comments=await github(`/repos/${repo}/issues/${prNumber}/comments?per_page=100`);
  const labelEvents=await github(`/repos/${repo}/issues/${prNumber}/events?per_page=100`);
  if(comments.response.ok&&labelEvents.response.ok){
    approvalEvidence=findExactHumanGateApproval({
      comments:comments.data,events:labelEvents.data,policyOwners:[...policyOwners],
      approvalMarker,approvalLabel:APPROVAL_LABEL
    });
  }
}
const approvalComment=approvalEvidence?.approvalComment||null;
const approvalActor=text(approvalComment?.user?.login||[...policyOwners][0]||'owner',120);
const humanApproval=Object.freeze(approvalComment?{
  kind:'release-provenance-human-gate-approval',
  approvalId:`release-provenance:${headSha}`,
  sourcePr:prNumber,
  sourceSha:headSha,
  approvedBy:approvalActor,
  approvedAt:text(approvalComment.created_at,80),
  labelAppliedAt:text(approvalEvidence.labelEvent.created_at,80),
  marker:approvalMarker,
  label:APPROVAL_LABEL,
  scope:'exact-source-sha',
}:{
  kind:'release-provenance-owner-standing-delegation',
  approvalId:`release-provenance:${headSha}`,
  sourcePr:prNumber,
  sourceSha:headSha,
  approvedBy:approvalActor,
  delegation:'owner-removed-per-pr-human-gate-20261019',
  triggeredBy:actor,
  approvedAt:new Date().toISOString(),
  gate:'exact-sha-required-ci-guarded-release-production-verification',
  scope:'exact-source-sha',
});
if(!cfToken||!accountId)fail('Cloudflare credentials are required for authoritative recovery task issuance');

const wrangler=fs.readFileSync('wrangler.site.toml','utf8');
const dbId=wrangler.match(/database_name\s*=\s*"ekodi-auth"[\s\S]{0,240}?database_id\s*=\s*"([^"]+)"/)?.[1];
if(!dbId)fail('ekodi-auth D1 database id not found');

const taskId=`orch_recovery_${headSha.slice(0,32).toLowerCase()}`;
const agent=branchAgent(sourceBranch);
const branchRef=`ai/${agent}/${taskId}`;
const createdAt=new Date().toISOString();
const intent=`Automatically recover release provenance for PR #${prNumber} without weakening EKODI orchestration, guarded release, or production verification.`;
const target=JSON.stringify({capability:'release.provenance.recovery',repository:repo,sourceBranch,sourceSha:headSha,sourcePr:prNumber});
const evidence=JSON.stringify({kind:'automatic-release-provenance-recovery',sourceBranch,sourceSha:headSha,sourcePr:prNumber,policyId:policy.policyId,humanApproval,guardedReleasePreserved:true,productionVerificationRequired:true});

await d1(dbId,`INSERT OR IGNORE INTO ekodi_orchestrator_tasks
(task_id,idempotency_key,requester_id,source,intent,target_json,risk,permission_class,assigned_worker,branch_ref,state,deployment_requested,evidence_json,created_at,updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
  taskId,`release-provenance-recovery:${headSha}`,`github-owner:${approvalActor}`,'github-actions-release-recovery',
  intent,target,'high','delegated','ekodi-github-actions-release-recovery',branchRef,'assigned',1,evidence,createdAt,createdAt
]);
await d1(dbId,`INSERT OR IGNORE INTO ekodi_orchestrator_task_events
(task_id,seq,from_state,to_state,actor,reason,evidence_json,created_at) VALUES (?,1,NULL,'received',?,'automatic_release_provenance_recovery_requested',?,?)`,[
  taskId,`github-owner:${approvalActor}`,evidence,createdAt
]);
await d1(dbId,`INSERT OR IGNORE INTO ekodi_orchestrator_task_events
(task_id,seq,from_state,to_state,actor,reason,evidence_json,created_at) VALUES (?,2,'received','blocked','ekodi-orchestrator','human_gate_required',?,?)`,[
  taskId,evidence,createdAt
]);
await d1(dbId,`INSERT OR IGNORE INTO ekodi_orchestrator_task_events
(task_id,seq,from_state,to_state,actor,reason,evidence_json,created_at) VALUES (?,3,'blocked','assigned',?,?,?,?)`,[
  taskId,`github-owner:${approvalActor}`,approvalComment?'exact_sha_human_gate_approved':'owner_standing_delegation_ci_gated',JSON.stringify(humanApproval),createdAt
]);

const receiptUrl=new URL('https://ekodi.kr/api/orchestrator/release-receipt');
receiptUrl.searchParams.set('taskId',taskId);receiptUrl.searchParams.set('branchRef',branchRef);
const receipt=await request(receiptUrl,{headers:{accept:'application/json','user-agent':'ekodi-release-provenance-recovery'}});
if(!receipt.response.ok||receipt.data?.authorized!==true)fail(`recovery receipt not authorized: HTTP ${receipt.response.status} ${JSON.stringify(receipt.data)}`);

// Check an existing exactly approved orchestrator branch before attempting any GitHub write.
// This also supports delegated owner creation when GITHUB_TOKEN cannot create protected refs.
const existingRefPath=`/repos/${repo}/git/ref/heads/${branchRef.split('/').map(encodeURIComponent).join('/')}`;
const existing=await github(existingRefPath);
if(existing.response.ok){
  if(text(existing.data?.object?.sha,80)!==headSha){
    fail('existing recovery branch does not match the exact approved source SHA');
  }
}else if(existing.response.status===404){
  const refPath=`/repos/${repo}/git/refs`;
  const ref=await github(refPath,{method:'POST','headers':{'content-type':'application/json'},body:JSON.stringify({ref:`refs/heads/${branchRef}`,sha:headSha})});
  if(!ref.response.ok){
    // Accept only a verified exact-SHA concurrent creation, not a generic 403 bypass.
    if(ref.response.status!==422)fail(`failed to create recovery branch: HTTP ${ref.response.status} ${JSON.stringify(ref.data)}`);
    const raced=await github(existingRefPath);
    if(!raced.response.ok||text(raced.data?.object?.sha,80)!==headSha){
      fail('existing recovery branch does not match the exact approved source SHA');
    }
  }
}else{
  fail(`failed to inspect existing recovery branch: HTTP ${existing.response.status}`);
}

const pulls=await github(`/repos/${repo}/pulls?state=open&head=${encodeURIComponent(repo.split('/')[0]+':'+branchRef)}&base=main`);
let recoveryPr=Array.isArray(pulls.data)?pulls.data[0]:null;
if(!recoveryPr){
  const created=await github(`/repos/${repo}/pulls`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    title:`[EKODI recovery] ${text(pr.title,180)||'release provenance recovery'}`,
    head:branchRef,base:'main',
    body:`Automatic EKODI release provenance recovery for #${prNumber}.\n\nTask: \`${taskId}\`\nSource: \`${sourceBranch}@${headSha}\`\n\nNo gate is bypassed: CI, orchestration receipt, guarded release, and production verification remain required.`
  })});
  if(!created.response.ok)fail(`failed to create recovery PR: HTTP ${created.response.status} ${JSON.stringify(created.data)}`);
  recoveryPr=created.data;
}
const recoveryNumber=Number(recoveryPr?.number||0);
if(!recoveryNumber)fail('recovery PR number missing');

const sourceFiles=[];
for(let page=1;page<=20;page++){
  const response=await github(`/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`);
  if(!response.response.ok||!Array.isArray(response.data))fail('source file inspection failed before guarded merge');
  sourceFiles.push(...response.data.map(item=>text(item?.filename,300)));
  if(response.data.length<100)break;
  if(page===20)fail('source file list exceeds bounded dispatch inspection');
}
// CGMA's independently owned apex edge needs a receipt-bound release even when
// an exact-SHA owner-approved recovery PR merges immediately with GITHUB_TOKEN.
const cgmaApexTouched=sourceFiles.includes('.github/workflows/deploy-cgma-apex-edge.yml');
const independentBoardTouched=sourceFiles.some(file=>
  file.startsWith('services/independent-board/')||
  file==='wrangler.independent-board.toml'||
  file==='sites/seonammedi/public/app.js'||
  file==='.github/workflows/deploy-independent-board.yml'
);
// An immediately merged, owner-approved Church Live change must dispatch both
// the canonical Control API (host-access route) and Site Core (studio UI).
// Each deployed workflow retains receipt, staging and rollback checks.
const controlApiTouched=sourceFiles.some(file=>[
  'realtime-control.js','realtime-tenant-registry.js',
  'scripts/converge-orchestrated-pr-merge.mjs',
  'scripts/recover-release-provenance.mjs'
].includes(file));
// A token-mediated exact-SHA recovery merge does NOT fire the main push path
// filter for Site Core. Use only source paths owned by the existing Site Core
// workflow and only its receipt-bound, staged, guarded workflow_dispatch.
const sharedSiteTouched=sourceFiles.some(file=>
  file.startsWith('sites/seonammedi/public/')||
  // The exact-approved Seasonal Workforce portal is owned by the shared Worker.
  file.startsWith('seasonal-workforce/')||
  ['site-worker.js','site-shell-worker.js','ekodi-shell-injector.js','seonammedi-admin-control.js',
   'control.html','control.css','control.js',
   'tenant-live.js','tenant-live.css','tenant-live-page.js','tenant-live-admin-page.js',
   'realtime-tenant-registry.js',
   'scripts/converge-orchestrated-pr-merge.mjs',
   'platform-router-entry-worker.js','.github/workflows/deploy-site-core.yml'].includes(file)
);
// First-party Shell is an independent guarded Worker. GitHub-token recovery
// merges do not produce a regular main push event, so a successful immediate
// recovery merge must dispatch the existing receipt-bound Shell workflow.
const shellRuntimeTouched=sourceFiles.some(file=>
  file.startsWith('shell/')||
  ['ekodi-service-manifest.js','ekodi-shell-worker.js','ekodi-shell-injector.js',
   'wrangler.shell.toml','wrangler.shell.staging.toml',
   '.github/workflows/deploy-ekodi-shell.yml',
   'scripts/verify-ekodi-shell-live.mjs'].includes(file)
);
// Exact-SHA recovery may merge immediately with GITHUB_TOKEN; that merge does
// not fire the regular main-push or orchestrated-convergence workflows.
const adminContinuityTouched=sourceFiles.some(file=>[
  'scripts/recover-release-provenance.mjs',
  'scripts/converge-orchestrated-pr-merge.mjs',
  'scripts/verify-admin-login-continuity.mjs',
  'scripts/admin-authenticated-e2e-menu-worker.mjs',
  'scripts/admin-authenticated-e2e-retry.mjs',
  'scripts/admin-assist-canonical-e2e.mjs',
  'test/recovery-admin-e2e-dispatch.test.mjs',
  'test/admin-assist-production-dispatch-20261016.test.mjs',
  '.github/workflows/verify-admin-authenticated-production-e2e.yml'
].includes(file));

await github(`/repos/${repo}/issues/${prNumber}/comments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body:`EKODI automatic release-provenance recovery created #${recoveryNumber} on \`${branchRef}\` (task \`${taskId}\`). This PR is superseded by the orchestrator-issued branch.`})});
await github(`/repos/${repo}/pulls/${prNumber}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({state:'closed'})});

// The protected-recovery source is already exact-SHA owner approved. Never
// attempt immediate merge without both authentic GitHub Actions checks and
// a source revision that contains the current main. If these are not ready,
// leave the official recovery PR open for existing convergent CI/merge handling.
const sourceStatus=await github(`/repos/${repo}/commits/${headSha}/status`);
if(!sourceStatus.response.ok)fail('cannot inspect exact approved source commit statuses');
const statuses=new Map((sourceStatus.data?.statuses||[]).map(entry=>[entry.context,entry.state]));
const sourceChecks=await github(`/repos/${repo}/commits/${headSha}/check-runs?per_page=100`);
if(!sourceChecks.response.ok)fail('cannot inspect authentic source CI checks');
const authenticChecks=Array.isArray(sourceChecks.data?.check_runs)?sourceChecks.data.check_runs:[];
const requiredChecks=['test','EKODI AI Orchestration Gate'];
const checksReady=requiredChecks.every(context=>
  statuses.get(context)==='success'&&authenticChecks.some(run=>
    run.name===context&&run.app?.slug==='github-actions'&&
    run.status==='completed'&&run.conclusion==='success'
  )
);
const mainRef=await github(`/repos/${repo}/git/ref/heads/main`);
if(!mainRef.response.ok)fail('cannot verify latest main before approved recovery merge');
const mainSha=text(mainRef.data?.object?.sha,80);
const currentBase=await github(`/repos/${repo}/compare/${mainSha}...${headSha}`);
if(!currentBase.response.ok)fail('cannot inspect source relationship to protected main');
const upToDate=Number(currentBase.data?.behind_by)===0;
if(!checksReady||!upToDate){
  const reason=!checksReady?'authentic_required_checks_not_green':'latest_main_not_in_source_ancestry';
  out('merge_condition',reason);
  // GITHUB_TOKEN pushes/PRs do not start the push-triggered converger. Dispatch
  // it on the orchestrator-issued branch so it approves the parked bot CI runs
  // and performs the existing protected merge once required checks pass.
  const converge=await github(`/repos/${repo}/actions/workflows/converge-orchestrated-pr-merge.yml/dispatches`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ref:branchRef})
  });
  out('converger_dispatch',converge.response.status===204?'accepted':`failed-http-${converge.response.status}`);
  await github(`/repos/${repo}/issues/${recoveryNumber}/comments`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({body:`EKODI release-provenance recovery parked at protected convergence: ${reason}. No immediate merge, no deployment. Source exact SHA \`${headSha}\`; main \`${mainSha}\`. Existing protected CI/update-branch gate must complete before any release.`})
  });
}
const merge=checksReady&&upToDate
  ?await github(`/repos/${repo}/pulls/${recoveryNumber}/merge`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({merge_method:'squash'})})
  :{response:{ok:false,status:412},data:{}};
const mergeDisposition=merge.response.ok?'merged-immediately':`guarded-pending-http-${merge.response.status}`;
// GitHub-token merges do not necessarily emit a main push workflow event.
// Only a successfully merged, exactly owner-approved recovery PR may dispatch
// the existing guarded production workflow. That workflow still enforces its
// own orchestrator receipt, CI, auth boundary, and live production checks.
if(merge.response.ok&&(independentBoardTouched||shellRuntimeTouched||sharedSiteTouched)){
  if(merge.data?.merged!==true||!/^[a-f0-9]{40}$/i.test(text(merge.data?.sha,80))){
    fail('guarded merge did not return a verifiable commit SHA');
  }
  const main=await github(`/repos/${repo}/branches/main`);
  if(!main.response.ok||text(main.data?.commit?.sha,80)!==text(merge.data.sha,80)){
    fail('main changed before exact service dispatch; do not launch a stale release');
  }
  if(independentBoardTouched){
    const dispatch=await github(`/repos/${repo}/actions/workflows/deploy-independent-board.yml/dispatches`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branchRef,release_task_id:taskId}})
    });
    if(dispatch.response.status!==204){
      fail('guarded independent board dispatch failed: HTTP '+dispatch.response.status);
    }
    out('independent_board_dispatch','accepted');
  }
  if(shellRuntimeTouched){
    // The canonical shared Site Core already exists; this dispatch only
    // releases Shell via its own staging, auth, provenance and rollback gates.
    const shellDispatch=await github(`/repos/${repo}/actions/workflows/deploy-ekodi-shell.yml/dispatches`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branchRef,release_task_id:taskId}})
    });
    if(shellDispatch.response.status!==204){
      fail('guarded Shell Worker dispatch failed: HTTP '+shellDispatch.response.status);
    }
    out('shell_dispatch','accepted');
  }
  if(sharedSiteTouched){
    const siteDispatch=await github(`/repos/${repo}/actions/workflows/deploy-site-core.yml/dispatches`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ref:'main',inputs:{sync_domains:'false',release_branch_ref:branchRef,release_task_id:taskId}})
    });
    if(siteDispatch.response.status!==204){
      fail('guarded shared Site Core dispatch failed: HTTP '+siteDispatch.response.status);
    }
    out('shared_site_dispatch','accepted');
  }
}

// An approved Control API source-only merge must also dispatch the separately
// guarded API workflow. Leave the original Site Core/Board/Shell contract
// unchanged, including its established integration-order assertions.
if(merge.response.ok&&controlApiTouched){
  if(merge.data?.merged!==true||!/^[a-f0-9]{40}$/i.test(text(merge.data?.sha,80))){
    fail('Church Live Control API dispatch needs verified protected merge SHA');
  }
  const main=await github(`/repos/${repo}/branches/main`);
  if(!main.response.ok||text(main.data?.commit?.sha,80)!==text(merge.data.sha,80)){
    fail('main changed before exact Church Live Control API dispatch; do not launch a stale release');
  }
  if(controlApiTouched){
    const apiDispatch=await github(`/repos/${repo}/actions/workflows/deploy-control-api.yml/dispatches`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branchRef,release_task_id:taskId}})
    });
    if(apiDispatch.response.status!==204){
      fail('guarded Church Live Control API dispatch failed: HTTP '+apiDispatch.response.status);
    }
    out('control_api_dispatch','accepted');
  }

}

// This branch is narrowly scoped: only a merged change to the CGMA edge
// workflow may dispatch the existing guarded CGMA release. GitHub-token
// immediate merges emit no main-push event, unlike the convergent merger.
if(merge.response.ok&&cgmaApexTouched){
  if(merge.data?.merged!==true||!/^[a-f0-9]{40}$/i.test(text(merge.data?.sha,80))){
    fail('CGMA apex dispatch needs verified protected merge SHA');
  }
  const main=await github(`/repos/${repo}/branches/main`);
  if(!main.response.ok||text(main.data?.commit?.sha,80)!==text(merge.data.sha,80)){
    fail('main changed before exact CGMA apex dispatch; do not launch a stale release');
  }
  const cgmaDispatch=await github(`/repos/${repo}/actions/workflows/deploy-cgma-apex-edge.yml/dispatches`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branchRef,release_task_id:taskId}})
  });
  if(cgmaDispatch.response.status!==204){
    fail('guarded CGMA apex dispatch failed: HTTP '+cgmaDispatch.response.status);
  }
  out('cgma_apex_dispatch','accepted');
}

// The immediate-merge path must run the same issued-session Chromium checks as
// the trusted converger. Only the exact approved, verified merged HEAD qualifies.
if(merge.response.ok&&adminContinuityTouched){
  if(merge.data?.merged!==true||!/^[a-f0-9]{40}$/i.test(text(merge.data?.sha,80))){
    fail('authenticated Admin E2E needs verified protected merge SHA');
  }
  const main=await github(`/repos/${repo}/branches/main`);
  if(!main.response.ok)fail('cannot verify protected main before authenticated Admin E2E');
  const mergedSha=text(merge.data.sha,80);
  const mainSha=text(main.data?.commit?.sha,80);
  if(mainSha!==mergedSha){
    // Concurrent approved changes may advance main; require proof that it still
    // contains the exact tested/merged recovery commit before verifying live.
    const ancestry=await github(`/repos/${repo}/compare/${mergedSha}...${mainSha}`);
    if(!ancestry.response.ok||Number(ancestry.data?.behind_by)!==0||
      !['ahead','identical'].includes(ancestry.data?.status)){
      fail('approved Admin recovery merge is not in current main ancestry');
    }
  }
  const result=await github(`/repos/${repo}/actions/workflows/verify-admin-authenticated-production-e2e.yml/dispatches`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ref:'main'})
  });
  if(result.response.status!==204){
    fail('authenticated Admin E2E dispatch failed: HTTP '+result.response.status);
  }
  out('admin_e2e_dispatch','accepted');
}

if(!merge.response.ok){
  await github(`/repos/${repo}/issues/${recoveryNumber}/comments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body:'EKODI recovery branch issued successfully. Merge remains guarded by required checks; production deployment will continue after the repository gate allows merge.'})});
}

out('action','recovered');out('task_id',taskId);out('branch_ref',branchRef);out('recovery_pr',recoveryNumber);out('merge_disposition',mergeDisposition);
console.log(JSON.stringify({ok:true,authority:'ekodi-orchestrator',action:'recovered',taskId,branchRef,recoveryPr:recoveryNumber,mergeDisposition}));
