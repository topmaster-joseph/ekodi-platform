// Server-only CGMA native canary audit verifier.
// Read authoritative D1 rows, never trust a device-supplied "success" receipt.
// No HTTP route, credential delegation, or production mutation is enabled.
import { CGMA_NATIVE_CANARY, inspectCgmaCanaryReceipt } from './cgma-native-canary-policy.js';

const validPostId = id => Number.isSafeInteger(id) && id > 0;
const validTime = t => Number.isSafeInteger(t) && t > 0;
const actionOrder = Object.freeze(['post.create','post.edit','post.delete']);
const testTitlePrefix = '[EKODI native canary] ';
const fail = code => Object.freeze({ok:false,code});
const reference = id => 'audit_' + String(id).padStart(8,'0');

export const CGMA_NATIVE_AUDIT_RULES = Object.freeze({
  boardId:CGMA_NATIVE_CANARY.boardId,
  testTitlePrefix,
  requiredActions:actionOrder,
  maxAfterConsumptionMs:CGMA_NATIVE_CANARY.maxLeaseMs,
});

export async function verifyCgmaNativeAuthoritativeAudit(db,{
  grantRef,taskId,postId,nowMs,receipt,
}={}){
  if(typeof db?.prepare!=='function')return fail('AUDIT_DATABASE_REQUIRED');
  if(typeof grantRef!=='string'||!/^cgma_grant_[a-f0-9-]{36}$/.test(grantRef)||
     typeof taskId!=='string'||!/^hyb_[a-f0-9-]{36}$/.test(taskId)||
     !validPostId(postId)||!validTime(nowMs))
    return fail('AUDIT_IDENTITY_INVALID');
  if(inspectCgmaCanaryReceipt(receipt).ok!==true)
    return fail('RECEIPT_STRUCTURE_INVALID');
  if(receipt.taskId!==taskId||receipt.ownPostId!==postId||receipt.boardId!==CGMA_NATIVE_CANARY.boardId)
    return fail('RECEIPT_SCOPE_MISMATCH');

  try {
    const grant=await db.prepare('SELECT grant_ref,nonce,origin,board_id,principal_id,device_id,task_type,status,consumed_job_id,consumed_at_ms,issued_at_ms,expires_at_ms FROM cgma_native_canary_grants WHERE grant_ref=? LIMIT 1')
      .bind(grantRef).first();
    if(!grant||grant.status!=='consumed'||grant.board_id!==CGMA_NATIVE_CANARY.boardId||
       grant.origin!==CGMA_NATIVE_CANARY.origin||grant.task_type!==CGMA_NATIVE_CANARY.taskType||
       grant.consumed_job_id!==taskId||grant.nonce!==receipt.nonce)
      return fail('AUTHORITATIVE_GRANT_UNVERIFIED');
    if(!validTime(grant.consumed_at_ms)||grant.consumed_at_ms<grant.issued_at_ms||
       grant.consumed_at_ms>=grant.expires_at_ms||
       nowMs<grant.consumed_at_ms||nowMs-grant.consumed_at_ms>CGMA_NATIVE_CANARY.maxLeaseMs)
      return fail('AUTHORITATIVE_LEASE_EXPIRED');

    const post=await db.prepare('SELECT id,board_id,author_person_id,title,status FROM ekodi_board_posts WHERE board_id=? AND id=? LIMIT 1')
      .bind(CGMA_NATIVE_CANARY.boardId,postId).first();
    if(!post||post.id!==postId||post.board_id!==CGMA_NATIVE_CANARY.boardId||
       post.author_person_id!==grant.principal_id||
       post.status!=='deleted'||typeof post.title!=='string'||!post.title.startsWith(testTitlePrefix))
      return fail('AUTHORITATIVE_OWN_TEST_POST_NOT_DELETED');

    const rows=await db.prepare("SELECT id,actor_person_id,action,created_at FROM ekodi_board_audit WHERE board_id=? AND target_type='post' AND target_id=? AND action IN ('post.create','post.edit','post.delete') ORDER BY id LIMIT 12")
      .bind(CGMA_NATIVE_CANARY.boardId,String(postId)).all();
    const entries=rows?.results;
    if(!Array.isArray(entries)||entries.length!==actionOrder.length)
      return fail('AUTHORITATIVE_AUDIT_INCOMPLETE');
    let lastTimestamp=grant.consumed_at_ms;
    for(let i=0;i<actionOrder.length;i++){
      const item=entries[i];
      const stamp=Date.parse(item?.created_at||'');
      if(item?.action!==actionOrder[i]||item.actor_person_id!==grant.principal_id||
         !validPostId(item.id)||!Number.isFinite(stamp)||
         stamp<lastTimestamp||stamp>nowMs)
        return fail('AUTHORITATIVE_AUDIT_MISMATCH');
      if(receipt.auditEvidenceRefs[i]!==reference(item.id))
        return fail('AUTHORITATIVE_AUDIT_REFERENCE_MISMATCH');
      lastTimestamp=stamp;
    }
    // No browser token, text body, email, or raw audit record is returned.
    return Object.freeze({ok:true,code:'AUTHORITATIVE_AUDIT_VERIFIED',boardId:CGMA_NATIVE_CANARY.boardId,postId});
  }catch{
    // A missing table/binding can never be interpreted as verified success.
    return fail('AUTHORITATIVE_AUDIT_UNAVAILABLE');
  }
}
