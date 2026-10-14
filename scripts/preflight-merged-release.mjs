#!/usr/bin/env node
// Read-only preflight for a previously merged release. Never issues authority.
const sha=String(process.env.RELEASE_SHA||'').trim();
const branch=String(process.env.ORCHESTRATOR_BRANCH||'').trim();
const repo=String(process.env.GITHUB_REPOSITORY||'').trim();
const token=String(process.env.GITHUB_TOKEN||'').trim();
const fail=(msg)=>{console.error('[EKODI][MERGED-RELEASE-PREFLIGHT] '+msg);process.exitCode=1};
if(!/^[a-f0-9]{40}$/i.test(sha))fail('exact 40-character release SHA required');
if(!/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/orch_[a-z0-9][a-z0-9_-]{15,120}$/i.test(branch))fail('official orchestrator branch required');
if(!/^[\w.-]+\/[\w.-]+$/.test(repo))fail('GITHUB_REPOSITORY required');
if(!token)fail('GitHub token required');
if(process.exitCode)process.exit();
const headers={accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'x-github-api-version':'2022-11-28'};
const get=async(path)=>{const r=await fetch('https://api.github.com'+path,{headers});if(!r.ok)throw Error(`GitHub ${path}: HTTP ${r.status}`);return r.json()};
try{
 const commit=await get(`/repos/${repo}/commits/${sha}`);
 const main=await get(`/repos/${repo}/compare/${sha}...main`);
 if(!['identical','ahead'].includes(main.status))throw Error('release SHA is not an ancestor of main');
 const task=branch.split('/')[2];
 const u=new URL('https://ekodi.kr/api/orchestrator/release-receipt');
 u.searchParams.set('taskId',task);u.searchParams.set('branchRef',branch);
 const receiptResponse=await fetch(u,{headers:{accept:'application/json'}});
 const receipt=await receiptResponse.json();
 if(!receiptResponse.ok||receipt.authorized!==true||receipt.taskId!==task||receipt.branchRef!==branch||receipt.authority!=='ekodi-orchestrator'||['blocked','failed','cancelled'].includes(receipt.state))throw Error('canonical orchestrator receipt not authorized');
 console.log(JSON.stringify({ok:true,releaseSha:sha,mainRelation:main.status,orchestratorBranch:branch,taskId:task,commit:commit.sha,mode:'preflight-only',productionDeployed:false}));
}catch(e){fail(e.message)}
