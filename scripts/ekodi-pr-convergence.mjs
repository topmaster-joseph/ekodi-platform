import fs from 'node:fs';

const token=String(process.env.GITHUB_TOKEN||process.env.GH_TOKEN||'').trim();
const repository=String(process.env.GITHUB_REPOSITORY||'').trim();
const explicitPr=Number.parseInt(String(process.env.EKODI_PR_NUMBER||''),10);
const policy=JSON.parse(fs.readFileSync('config/ai-change-orchestration-policy.json','utf8'));
const convergence=policy.sourceControl?.prConvergence||{};
const defaultBranch=policy.sourceControl?.defaultBranch||'main';
const branchPattern=new RegExp(policy.sourceControl?.branchNaming?.requiredPattern||'^ai/');
const [owner,repo]=repository.split('/');

if(!token||!owner||!repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required.');
if(convergence.enabled!==true||convergence.status!=='enforced') throw new Error('PR convergence policy is not enforced.');

const headers={
  accept:'application/vnd.github+json',
  authorization:`Bearer ${token}`,
  'x-github-api-version':'2022-11-28',
  'user-agent':'ekodi-pr-convergence',
  'content-type':'application/json',
};
async function api(path,{method='GET',body=null,allow=[200]}={}){
  const response=await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`,{
    method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)
  });
  const text=await response.text();
  const data=text?JSON.parse(text):{};
  if(!allow.includes(response.status)){
    const error=new Error(`GitHub API ${method} ${path} -> ${response.status}: ${data?.message||text}`);
    error.status=response.status; error.data=data; throw error;
  }
  return {status:response.status,data};
}
async function listOpenPulls(){
  if(Number.isInteger(explicitPr)&&explicitPr>0){
    return [(await api(`/pulls/${explicitPr}`)).data];
  }
  return (await api(`/pulls?state=open&base=${encodeURIComponent(defaultBranch)}&per_page=100`)).data;
}
async function changedFiles(number){
  return (await api(`/pulls/${number}/files?per_page=100`)).data.map(item=>item.filename);
}
function humanGateFiles(files){
  const patterns=[
    /^config\/ai-change-orchestration-policy\.json$/,
    /(^|\/)(secrets?|credentials?)(\/|\.|$)/i,
    /(^|\/)(payment|finance)(\/|\.|-|$)/i,
    /(^|\/)migrations?\//i,
    /(^|\/)(dns|domain)(\/|\.|-|$)/i,
    /(^|\/)(auth|authorization)(\/|\.|-|$)/i,
  ];
  return files.filter(file=>patterns.some(pattern=>pattern.test(file)));
}
async function compare(pr){
  return (await api(`/compare/${encodeURIComponent(pr.base.sha)}...${encodeURIComponent(pr.head.sha)}`)).data;
}
async function refresh(pr){
  const result=await api(`/pulls/${pr.number}/update-branch`,{
    method:'PUT',
    body:{expected_head_sha:pr.head.sha},
    allow:[202,422]
  });
  if(result.status===202){
    console.log(`[EKODI][PR-CONVERGENCE-001] PR #${pr.number} base drift refreshed; checks will rerun.`);
    return 'refreshed';
  }
  console.log(`[EKODI][PR-CONVERGENCE-001] PR #${pr.number} refresh deferred: ${result.data?.message||'unprocessable'}`);
  return 'deferred';
}
async function merge(pr){
  const result=await api(`/pulls/${pr.number}/merge`,{
    method:'PUT',
    body:{sha:pr.head.sha,merge_method:convergence.mergeMethod||'squash'},
    allow:[200,405,409,422]
  });
  if(result.status===200&&result.data?.merged){
    console.log(`[EKODI][PR-CONVERGENCE-001] PR #${pr.number} merged through branch protection.`);
    return 'merged';
  }
  const message=result.data?.message||'merge deferred';
  if([405,422].includes(result.status)){
    console.log(`[EKODI][PR-CONVERGENCE-001] PR #${pr.number} waiting for required protection/check state: ${message}`);
    return 'waiting';
  }
  console.log(`[EKODI][PR-CONVERGENCE-001] PR #${pr.number} merge conflict requires safe conflict resolution: ${message}`);
  return 'conflict';
}
async function converge(pr){
  if(pr.state!=='open'||pr.draft||pr.base?.ref!==defaultBranch) return 'ignored';
  const head=String(pr.head?.ref||'');
  if(!branchPattern.test(head)){
    console.log(`[EKODI][PR-CONVERGENCE-001] PR #${pr.number} ignored: non-EKODI branch ${head}`);
    return 'ignored';
  }
  const files=await changedFiles(pr.number);
  const gated=humanGateFiles(files);
  if(gated.length){
    console.log(`[EKODI][PR-CONVERGENCE-001] PR #${pr.number} human gate preserved for: ${gated.join(', ')}`);
    return 'human-gate';
  }
  const comparison=await compare(pr);
  if(Number(comparison.behind_by||0)>0) return refresh(pr);
  return merge(pr);
}

const pulls=await listOpenPulls();
if(!pulls.length){
  console.log('[EKODI][PR-CONVERGENCE-001] no eligible open PRs.');
  process.exit(0);
}
const results=[];
for(const pr of pulls){
  try{results.push({pr:pr.number,result:await converge(pr)});}
  catch(error){
    console.error(`[EKODI][PR-CONVERGENCE-001] PR #${pr.number} reconciliation error: ${error.message}`);
    results.push({pr:pr.number,result:'error'});
  }
}
console.log(JSON.stringify({policy:'PR-CONVERGENCE-001',results}));
if(results.some(item=>item.result==='error')) process.exit(1);
