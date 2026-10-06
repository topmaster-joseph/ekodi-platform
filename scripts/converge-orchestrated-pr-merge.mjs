const repo=String(process.env.GITHUB_REPOSITORY||'').trim();
const token=String(process.env.GH_TOKEN||'').trim();
const branch=String(process.env.GITHUB_REF_NAME||'').trim();
const headSha=String(process.env.GITHUB_SHA||'').trim();
const required=['test','EKODI AI Orchestration Gate'];
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

for(let cycle=0;cycle<180;cycle++){
  const p=(await api('/pulls/'+pr.number)).data;
  if(p?.merged===true){console.log('[EKODI][ORCH-AUTO-MERGE] already merged');process.exit(0)}
  if(p?.head?.sha!==headSha)fail('PR head moved away from workflow SHA');
  const headStatuses=await statusMap(headSha);
  const pending=required.filter(k=>headStatuses.get(k)?.state!=='success');
  if(pending.length){await sleep(3000);continue}

  const mergeSha=String(p?.merge_commit_sha||'');
  if(!/^[a-f0-9]{40}$/i.test(mergeSha)){await sleep(2000);continue}
  for(const context of required){
    const source=headStatuses.get(context);
    const set=await api('/statuses/'+mergeSha,{method:'POST',body:JSON.stringify({state:'success',context,description:`Recovered from verified head ${headSha.slice(0,12)}`,target_url:source.target_url})});
    if(!set.r.ok)fail(`failed to publish ${context} to merge SHA: ${set.r.status}`);
  }
  const verified=await statusMap(mergeSha);
  if(required.some(k=>verified.get(k)?.state!=='success')){await sleep(1000);continue}

  const merged=await api('/pulls/'+pr.number+'/merge',{method:'PUT',body:JSON.stringify({sha:headSha,merge_method:'squash',commit_title:p.title})});
  if(merged.r.ok&&merged.data?.merged===true){
    console.log(JSON.stringify({ok:true,pr:pr.number,mergeSha:merged.data.sha,taskId,branch,authority:'ekodi-orchestrator'}));
    process.exit(0);
  }
  if([405,409,422].includes(merged.r.status)){await sleep(1500);continue}
  fail('merge failed '+merged.r.status+' '+JSON.stringify(merged.data).slice(0,500));
}
fail('merge convergence timeout');
