// PUBLISH-RELEASE-GATE-001 — server-owned entitlement, contract and audiobook checks.
// No user/browser body may assert verified membership or signed commercial contracts.
const SHA=/^[a-f0-9]{64}$/, UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPABASE='https://renzehysxirjilvdxacv.supabase.co';
const isTrue=x=>x===1||x===true;
export async function activePaidAuthorPlan(env,authorUserId,at=new Date()) {
  if(!UUID.test(String(authorUserId||'')))return {active:false,reason:'AUTHOR_ID_INVALID'};
  const secret=String(env?.PUBLISH_SUBSCRIPTION_READ_KEY||'');
  if(secret.length<32)return {active:false,reason:'MEMBERSHIP_READ_NOT_CONFIGURED'};
  try {
    const u=new URL('/rest/v1/human_author_subscriptions',SUPABASE);
    u.searchParams.set('select','plan_id,status,verified_payment_at,paid_until');
    u.searchParams.set('owner_user_id','eq.'+authorUserId);
    u.searchParams.set('limit','1');
    const response=await fetch(u,{headers:{apikey:secret,authorization:'Bearer '+secret,
      accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(6500)});
    if(!response.ok)return {active:false,reason:'MEMBERSHIP_READ_FAILED'};
    const list=await response.json();
    const row=Array.isArray(list)?list[0]:null;
    if(!row||!['writer1','writer3'].includes(row.plan_id)||row.status!=='active'||
       !row.verified_payment_at||!row.paid_until||!Number.isFinite(Date.parse(row.paid_until))||
       Date.parse(row.paid_until)<=at.getTime())return {active:false,reason:'NO_VERIFIED_PAID_MEMBERSHIP'};
    return {active:true,planId:row.plan_id,expiresAt:row.paid_until,reason:'VERIFIED_SUBSCRIPTION'};
  }catch {return {active:false,reason:'MEMBERSHIP_READ_FAILED'};}
}
async function approvedChief(db,env,authorUserId){
  const allowed=String(env?.PUBLISH_CHIEF_AUTHOR_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!UUID.test(String(authorUserId||''))||!allowed.includes(authorUserId))return false;
  // Chief scope is a conjunction of the protected server configuration and publisher DB role.
  const result=await db.prepare("SELECT role FROM publishing_workflow_roles WHERE user_id=?")
    .bind(authorUserId).first();
  return result?.role==='admin';
}
export async function verifyCommercialRelease(env,project,at=new Date()){
  if(!env?.PUBLISH_DB||!project?.id||!SHA.test(String(project.releaseDigest||'')))
    return {ready:false,reason:'PUBLISHING_RELEASE_NOT_CONFIGURED'};
  const db=env.PUBLISH_DB;
  const chief=await approvedChief(db,env,project.authorUserId);
  const plan=chief?{active:true,planId:'publisher_editor'}:
    await activePaidAuthorPlan(env,project.authorUserId,at);
  if(!plan.active)return {ready:false,reason:'PAID_OR_CHIEF_REQUIRED'};
  const contract=await db.prepare("SELECT author_user_id,edition_digest,status,author_signed_at,publisher_signed_at,royalty_terms_accepted,commission_terms_accepted,distribution_license_accepted FROM publishing_workflow_release_contracts WHERE project_id=? AND edition_digest=?")
    .bind(project.id,project.releaseDigest).first();
  if(!contract||contract.status!=='signed'||contract.author_user_id!==project.authorUserId||
    !contract.author_signed_at||!contract.publisher_signed_at||
    !isTrue(contract.distribution_license_accepted)||
    (!chief&&(!isTrue(contract.royalty_terms_accepted)||!isTrue(contract.commission_terms_accepted))))
    return {ready:false,reason:'SEPARATE_SIGNED_PUBLISHING_CONTRACT_REQUIRED'};
  const audio=await db.prepare("SELECT edition_digest,stage,master_sha256,voice_license_verified,dialogue_qa_passed,full_track_qa_passed,buyer_access_verified,refund_revoke_verified,bonus_price_krw FROM publishing_workflow_audio_release_qa WHERE project_id=? AND edition_digest=?")
    .bind(project.id,project.releaseDigest).first();
  if(!audio||audio.stage!=='approved'||!SHA.test(String(audio.master_sha256||''))||
    !isTrue(audio.voice_license_verified)||!isTrue(audio.dialogue_qa_passed)||
    !isTrue(audio.full_track_qa_passed)||!isTrue(audio.buyer_access_verified)||
    !isTrue(audio.refund_revoke_verified)||audio.bonus_price_krw!==0)
    return {ready:false,reason:'FREE_PREMIUM_AUDIOBOOK_QA_REQUIRED'};
  // Rights and QC records are private attestations. A future independent asset/retailer
  // attestation is still necessary before any real commercial dispatch.
  return {ready:true,planId:plan.planId,chief,reason:'PRIVATE_QA_ATTESTED'};
}
