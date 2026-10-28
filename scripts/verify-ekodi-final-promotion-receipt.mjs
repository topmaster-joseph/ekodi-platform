// Run only from a protected production-promotion job after staging and the
// final owner confirmation. This module does not approve or deploy anything.
// Strictly validates the first-party read-only receipt against the *exact*
// immutable application artifact supplied by the guarded release manifest.
const ENDPOINT='https://ekodi.kr/api/orchestrator/final-promotion-receipt';
const TASK=/^orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const BRANCH=/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const SHA=/^[a-f0-9]{40}$/i;
const DIGEST=/^sha256:[a-f0-9]{64}$/i;
const clean=(v,max=220)=>String(v??'').trim().slice(0,max);

export async function verifyEkodiProtectedPromotion({taskId,branchRef,releaseSha,artifactDigest,fetchImpl=fetch}={}){
  const task=clean(taskId,160),branch=clean(branchRef,220),sha=clean(releaseSha,80),digest=clean(artifactDigest,150);
  if(!TASK.test(task)||!BRANCH.test(branch)||!branch.endsWith('/'+task)||
     !SHA.test(sha)||!DIGEST.test(digest)){
    throw new Error('EKODI_FINAL_PROMOTION_EXACT_ARTIFACT_REQUIRED');
  }
  const url=new URL(ENDPOINT);
  url.searchParams.set('taskId',task);
  url.searchParams.set('branchRef',branch);
  url.searchParams.set('releaseSha',sha);
  url.searchParams.set('artifactDigest',digest);
  let response;
  try{
    response=await fetchImpl(url,{
      method:'GET',headers:{Accept:'application/json','Cache-Control':'no-store'},
      signal:AbortSignal.timeout(5000),
    });
  }catch{throw new Error('EKODI_FINAL_PROMOTION_RECEIPT_UNAVAILABLE')}
  let body;
  try{body=await response.json()}catch{throw new Error('EKODI_FINAL_PROMOTION_RECEIPT_INVALID')}
  if(response.status!==200||body?.authorized!==true||
     body?.authority!=='ekodi-orchestrator'||body?.taskId!==task||
     body?.branchRef!==branch||body?.releaseSha!==sha||
     body?.artifactDigest!==digest||body?.purpose!=='guarded-production-promotion-only'||
     body?.productionDeployed!==false||!String(body.approvalId||'').startsWith('final_promotion_'+task+'_v')){
    throw new Error('EKODI_FINAL_PROMOTION_OWNER_APPROVAL_REQUIRED');
  }
  return Object.freeze({
    verified:true,taskId:task,branchRef:branch,releaseSha:sha,
    artifactDigest:digest,approvalId:body.approvalId,
    productionDeployed:false,
  });
}
