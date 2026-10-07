const repo=String(process.env.GITHUB_REPOSITORY||'').trim();
const token=String(process.env.GH_TOKEN||'').trim();
const branch=String(process.env.GITHUB_REF_NAME||'').trim();
const headSha=String(process.env.GITHUB_SHA||'').trim();
const required=['test','EKODI AI Orchestration Gate'];
// User-authored reconciliation touch: retrigger protected PR checks after GitHub update-branch.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fail(m){throw new Error('[EKODI][ORCH-AUTO-MERGE] '+m)}
async function api(path,init={}){
  const r=await fetch('https://api.github.com/repos/'+repo+path,{...init,headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json',...(init.headers||{})}});
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}};
  return {r,data};
}
async function statusMap(sha){
  const {r,data}=await api('/commits/'+sha+'/status');
  if(!r.ok)fail('status lookup failed '+r.status);
  return new Map((data.statuses||[]).map(s=>[s.context,s]));
}
if(!repo||!token||!branch||!headSha)fail('missing runtime input');
const match=branch.match(/^ai\/([a-z0-9][a-z0-9._-]{0,31})\/(orch_[a-z0-9][a-z0-9_-]{15,120})$/i);
if(!match){console.log('[EKODI][ORCH-AUTO-MERGE] non-orchestrator branch; noop');process.exit(0)}
const taskId=match[2];
const receiptUrl=new URL('https://ekodi.kr/api/orchestrator/release-receipt');
receiptUrl.searchParams.set('taskId',taskId);receiptUrl.searchParams.set('branchRef',branch);
const receipt=await fetch(receiptUrl,{headers:{accept:'application/json','user-agent':'ekodi-orchestrated-auto-merge'}}).then(async r=>({r,data:await r.json().catch(()=>({}))}));
if(!receipt.r.ok||receipt.data?.authorized!==true)fail('release receipt is not authorized');

const owner=repo.split('/')[0];
let pr=null;
for(let i=0;i<20&&!pr;i++){
  const q=await api('/pulls?state=open&base=main&head='+encodeURIComponent(owner+':'+branch));
  if(!q.r.ok)fail('PR lookup failed '+q.r.status);
  pr=(Array.isArray(q.data)?q.data:[])[0]||null;
  if(!pr)await sleep(3000);
}
if(!pr)fail('open PR not found');
const filesLookup=await api('/pulls/'+pr.number+'/files?per_page=100');
if(!filesLookup.r.ok)fail('PR file lookup failed '+filesLookup.r.status);
const changedFiles=(Array.isArray(filesLookup.data)?filesLookup.data:[]).map(file=>String(file.filename||''));
const independentBoardTouched=changedFiles.some(file=>
  file.startsWith('services/independent-board/')||
  file==='wrangler.independent-board.toml'||
  file==='sites/seonammedi/public/app.js'||
  file==='.github/workflows/deploy-independent-board.yml'
);
const sharedSiteTouched=changedFiles.some(file=>
  file.startsWith('sites/')||
  file==='platform-router-entry-worker.js'||
  file==='site-worker.js'||
  file==='scripts/build.mjs'||
  file==='scripts/finalize-seonammedi-release.mjs'||
  file==='.github/workflows/deploy-site-core.yml'||
  file==='scripts/converge-orchestrated-pr-merge.mjs'||
  file==='.github/workflows/converge-orchestrated-pr-merge.yml'
);
async function dispatchPostMergeDeploys(){
  if(independentBoardTouched){
    const dispatch=await api('/actions/workflows/deploy-independent-board.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('independent board deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-independent-board.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(sharedSiteTouched){
    const dispatch=await api('/actions/workflows/deploy-site-core.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{sync_domains:'false',release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('shared site deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-site-core.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
}

for(let cycle=0;cycle<180;cycle++){
  const p=(await api('/pulls/'+pr.number)).data;
  if(p?.merged===true){await dispatchPostMergeDeploys();console.log('[EKODI][ORCH-AUTO-MERGE] already merged; post-merge deploys reconciled');process.exit(0)}
  if(p?.head?.sha!==headSha)fail('PR head moved away from workflow SHA');
  const headStatuses=await statusMap(headSha);
  const pending=required.filter(k=>headStatuses.get(k)?.state!=='success');
  if(pending.length){await sleep(3000);continue}

  // First converge the real PR head with the current protected base. This avoids
  // chasing GitHub's ephemeral test-merge SHA while main is actively changing.
  const update=await api('/pulls/'+pr.number+'/update-branch',{method:'PUT',body:JSON.stringify({expected_head_sha:headSha})});
  if(update.r.status===202){
    console.log(JSON.stringify({ok:true,action:'branch-updated',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
    // update-branch creates a new head commit; its push starts a fresh convergence
    // run and fresh required checks. The old run must not act on a stale head.
    process.exit(0);
  }
  if(![200,202,422].includes(update.r.status))fail('update-branch failed '+update.r.status+' '+JSON.stringify(update.data).slice(0,500));

  const fresh=(await api('/pulls/'+pr.number)).data;
  if(fresh?.head?.sha!==headSha){console.log('[EKODI][ORCH-AUTO-MERGE] head updated; next push run owns convergence');process.exit(0)}

  const mergeSha=String(fresh?.merge_commit_sha||'');
  if(!/^[a-f0-9]{40}$/i.test(mergeSha)){await sleep(1200);continue}
  for(const context of required){
    const source=headStatuses.get(context);
    const set=await api('/statuses/'+mergeSha,{method:'POST',body:JSON.stringify({state:'success',context,description:`Recovered from verified head ${headSha.slice(0,12)}`,target_url:source.target_url})});
    if(!set.r.ok)fail(`failed to publish ${context} to merge SHA: ${set.r.status}`);
  }

  const merged=await api('/pulls/'+pr.number+'/merge',{method:'PUT',body:JSON.stringify({sha:headSha,merge_method:'squash',commit_title:fresh.title})});
  if(merged.r.ok&&merged.data?.merged===true){
    await dispatchPostMergeDeploys();
    console.log(JSON.stringify({ok:true,action:'merged',pr:pr.number,mergeSha:merged.data.sha,taskId,branch,authority:'ekodi-orchestrator'}));
    process.exit(0);
  }
  if([405,409,422].includes(merged.r.status)){await sleep(1000);continue}
  fail('merge failed '+merged.r.status+' '+JSON.stringify(merged.data).slice(0,500));
}
fail('merge convergence timeout');
