import fs from 'node:fs';

const repo=String(process.env.GITHUB_REPOSITORY||'').trim();
const eventName=String(process.env.GITHUB_EVENT_NAME||'').trim();
const eventPath=String(process.env.GITHUB_EVENT_PATH||'').trim();
const ghToken=String(process.env.GH_TOKEN||'').trim();
const cfToken=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();

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

if(eventName!=='pull_request'){out('action','noop');process.exit(0)}
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
if(!(policy.governance?.policyOwners||[]).includes(actor))fail(`automatic release provenance recovery requires policy-owner actor; actor=${actor}`);
if(!headSha.match(/^[a-f0-9]{40}$/i)||!prNumber)fail('pull request head SHA/number missing');
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
const evidence=JSON.stringify({kind:'automatic-release-provenance-recovery',sourceBranch,sourceSha:headSha,sourcePr:prNumber,policyId:policy.policyId,guardedReleasePreserved:true,productionVerificationRequired:true});

await d1(dbId,`INSERT OR IGNORE INTO ekodi_orchestrator_tasks
(task_id,idempotency_key,requester_id,source,intent,target_json,risk,permission_class,assigned_worker,branch_ref,state,deployment_requested,evidence_json,created_at,updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
  taskId,`release-provenance-recovery:${headSha}`,`github-owner:${actor}`,'github-actions-release-recovery',
  intent,target,'normal','delegated','ekodi-github-actions-release-recovery',branchRef,'assigned',1,evidence,createdAt,createdAt
]);
await d1(dbId,`INSERT OR IGNORE INTO ekodi_orchestrator_task_events
(task_id,seq,from_state,to_state,actor,reason,evidence_json,created_at) VALUES (?,1,NULL,'assigned',?,'automatic_release_provenance_recovery',?,?)`,[
  taskId,`github-owner:${actor}`,evidence,createdAt
]);

const receiptUrl=new URL('https://ekodi.kr/api/orchestrator/release-receipt');
receiptUrl.searchParams.set('taskId',taskId);receiptUrl.searchParams.set('branchRef',branchRef);
const receipt=await request(receiptUrl,{headers:{accept:'application/json','user-agent':'ekodi-release-provenance-recovery'}});
if(!receipt.response.ok||receipt.data?.authorized!==true)fail(`recovery receipt not authorized: HTTP ${receipt.response.status} ${JSON.stringify(receipt.data)}`);

const refPath=`/repos/${repo}/git/refs`;
const ref=await github(refPath,{method:'POST','headers':{'content-type':'application/json'},body:JSON.stringify({ref:`refs/heads/${branchRef}`,sha:headSha})});
if(!ref.response.ok&&ref.response.status!==422)fail(`failed to create recovery branch: HTTP ${ref.response.status} ${JSON.stringify(ref.data)}`);

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

await github(`/repos/${repo}/issues/${prNumber}/comments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body:`EKODI automatic release-provenance recovery created #${recoveryNumber} on \`${branchRef}\` (task \`${taskId}\`). This PR is superseded by the orchestrator-issued branch.`})});
await github(`/repos/${repo}/pulls/${prNumber}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({state:'closed'})});

let mergeDisposition='guarded-auto-merge-requested';
const pullRequestId=text(recoveryPr?.node_id,160);
if(!pullRequestId)fail('recovery PR GraphQL node id missing');
const autoMerge=await request('https://api.github.com/graphql',{
  method:'POST',
  headers:{accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28',authorization:`Bearer ${ghToken}`},
  body:JSON.stringify({query:'mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number autoMergeRequest{enabledAt}}}}',variables:{id:pullRequestId}})
});
if(!autoMerge.response.ok||autoMerge.data?.errors?.length){
  const merge=await github(`/repos/${repo}/pulls/${recoveryNumber}/merge`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({merge_method:'squash'})});
  mergeDisposition=merge.response.ok?'merged-immediately':`guarded-pending-http-${merge.response.status}`;
  if(!merge.response.ok){
    await github(`/repos/${repo}/issues/${recoveryNumber}/comments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body:'EKODI recovery branch issued successfully. Required checks still protect merge. If repository auto-merge is unavailable, the guarded merge queue remains the only unresolved transport step.'})});
  }
}

out('action','recovered');out('task_id',taskId);out('branch_ref',branchRef);out('recovery_pr',recoveryNumber);out('merge_disposition',mergeDisposition);
console.log(JSON.stringify({ok:true,authority:'ekodi-orchestrator',action:'recovered',taskId,branchRef,recoveryPr:recoveryNumber,mergeDisposition}));
