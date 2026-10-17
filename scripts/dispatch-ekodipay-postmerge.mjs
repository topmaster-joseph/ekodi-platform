// EKODI-owned Pay post-merge dispatch. Do not mutate Cloudflare or create payments here.
import {parseOrchestratorReleaseBranch,verifyOrchestratorReleaseReceipt} from './orchestrator-release-receipt.mjs';

export const PAY_RELEASE_FILES=new Set([
  'ekodipay-worker.js','wrangler.ekodipay.toml',
  '.github/workflows/deploy-ekodipay.yml',
  '.github/workflows/audit-ekodipay-legacy-ingress.yml',
  '.github/workflows/verify-ekodipay-native.yml',
  'scripts/audit-ekodipay-legacy-ingress.mjs',
  'scripts/verify-ekodipay-native.mjs',
  'test/ekodipay-canonical.test.mjs',
  'test/ekodipay-demo-flow.test.mjs',
  'test/ekodipay-legacy-ingress.test.mjs',
]);
const repo=process.env.GITHUB_REPOSITORY||'';
const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN||'';
const verifyOnly=process.argv.includes('--verify');
const branch=verifyOnly?process.env.EKODI_RELEASE_BRANCH_REF:process.env.GITHUB_REF_NAME;
const task=parseOrchestratorReleaseBranch(branch);
function assert(value,message){if(!value)throw Error('[EKODI-PAY-DISPATCH] '+message);}
export function classifyMergedPayRelease({pr,files,branch,sha}={}){
  const parsed=parseOrchestratorReleaseBranch(branch);
  const pathList=Array.isArray(files)?files:[];
  return Object.freeze({
    eligible:Boolean(parsed&&pr?.merged_at&&pr?.base?.ref==='main'&&
      pr?.head?.ref===branch&&
      (!sha||pr?.head?.sha===sha)&&
      pathList.some(path=>PAY_RELEASE_FILES.has(path))),
    payFiles:pathList.filter(path=>PAY_RELEASE_FILES.has(path)),
  });
}
async function gh(path,init={}){
  const response=await fetch('https://api.github.com/repos/'+repo+path,{
    ...init,headers:{
      authorization:'Bearer '+token,accept:'application/vnd.github+json',
      'x-github-api-version':'2022-11-28',
      ...(init.body?{'content-type':'application/json'}:{}),
    },signal:AbortSignal.timeout(15000),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error('GitHub '+path.split('?')[0]+' returned HTTP '+response.status);
  return data;
}
async function findMergedPayPr() {
  const prs=await gh('/pulls?state=closed&head='+encodeURIComponent(repo.split('/')[0]+':'+branch)+'&per_page=100');
  const merged=(Array.isArray(prs)?prs:[]).filter(p=>p.merged_at&&p.base?.ref==='main'&&p.head?.ref===branch);
  const exact=verifyOnly?merged:merged.filter(p=>p.head.sha===process.env.GITHUB_SHA);
  assert(exact.length===1,'exactly one merged authorized Pay PR is required');
  const pr=exact[0];
  const files=[];
  for(let page=1;page<=5;page++){
    const chunk=await gh('/pulls/'+pr.number+'/files?per_page=100&page='+page);
    assert(Array.isArray(chunk),'file audit not available');
    for(const f of chunk)files.push(String(f.filename||''));
    if(chunk.length<100)break;
    assert(page!==5,'PR file audit pagination limit exceeded');
  }
  const check=classifyMergedPayRelease({pr,files,branch,
    sha:verifyOnly?'':process.env.GITHUB_SHA});
  // Normal unrelated orchestrator releases are successful no-ops.
  if(!check.eligible&&!verifyOnly&&check.payFiles.length===0){
    console.log('No EKODI Pay source changes in merged PR #'+pr.number+'; skip.');
    return null;
  }
  assert(check.eligible,'merged PR is not a canonical EKODI Pay source change');
  assert(/^[a-f0-9]{40}$/i.test(String(pr.merge_commit_sha||'')),'merged commit SHA unavailable');
  const behind=await gh('/compare/'+encodeURIComponent(pr.merge_commit_sha)+'...main');
  assert(['ahead','identical'].includes(behind.status),'Pay PR merged commit not present in main');
  return {prNumber:pr.number,mergeSha:pr.merge_commit_sha,payFiles:check.payFiles};
}
async function main(){
  if(!repo||!token)throw Error('repository and GitHub actions token required');
  if(repo!=='topmaster-joseph/ekodi-platform')throw Error('canonical EKODI source repository required');
  if(!task)throw Error('official EKODI Orchestrator release branch required');
  if(verifyOnly){
    assert(process.env.EKODI_RELEASE_TASK_ID===task.taskId,'release task ID mismatch');
  } else {
    assert(process.env.GITHUB_REF_NAME===task.branchRef,'push branch/ref mismatch');
    assert(/^[a-f0-9]{40}$/i.test(String(process.env.GITHUB_SHA||'')),'trusted head commit required');
  }
  await verifyOrchestratorReleaseReceipt(task.branchRef,{explicitTaskId:task.taskId});
  const evidence=await findMergedPayPr();
  if(!evidence)return;
  if(verifyOnly){
    console.log('EKODI Pay release scope validated: PR #'+evidence.prNumber+
      '; merged into main; task '+task.taskId+'; protected source evidence');
    return;
  }
  for(const workflow of ['deploy-ekodipay.yml','audit-ekodipay-legacy-ingress.yml']){
    await gh('/actions/workflows/'+workflow+'/dispatches',{method:'POST',body:JSON.stringify({
      ref:'main',inputs:{release_branch_ref:task.branchRef,release_task_id:task.taskId},
    })});
    console.log('Authorized post-merge workflow dispatch: '+workflow+
      '; PR #'+evidence.prNumber+'; no charges or domain mutations authorized.');
  }
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(e=>{console.error(e?.message||String(e));process.exitCode=1});
}
