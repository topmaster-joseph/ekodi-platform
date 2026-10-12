// CGMA native WRITE verification is intentionally fail-closed until EKODI
// can issue and consume a server-side, one-use, scoped delegation.
// This module contains no credentials and does not authorize production writes.
export const CGMA_NATIVE_CANARY=Object.freeze({
  taskType:'board.cgma.authenticated-crud.verify',
  origin:'https://ekodi.kr',
  boardId:'site:cgma:main',
  siteId:'cgma',
  requiredCapability:'cgmaBoardWriteCanary',
  maxAttempts:1,
  maxLeaseMs:120000,
  operations:Object.freeze(['create-own-test-post','read-own-test-post','edit-own-test-post','soft-delete-own-test-post','verify-audit']),
  status:'delegation_not_configured',
});

const forbidden=new Set(['authorization','password','cookie','session','accessToken','refreshToken','secret','apiKey','bearer','token']);
export function inspectCgmaCanaryPayload(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))
    return {ok:false,code:'PAYLOAD_INVALID'};
  // The native queue must never receive a user's browser credentials.
  const stack=[value];
  while(stack.length){
    const current=stack.pop();
    for(const [key,item] of Object.entries(current)){
      if(forbidden.has(key)||forbidden.has(key.toLowerCase())||/credential|password|secret|token|cookie|authorization/i.test(key))
        return {ok:false,code:'CREDENTIAL_TRANSFER_FORBIDDEN'};
      if(item&&typeof item==='object'){
        if(Array.isArray(item)) return {ok:false,code:'PAYLOAD_INVALID'};
        stack.push(item);
      }
    }
  }
  if(value.boardId!==CGMA_NATIVE_CANARY.boardId||value.origin!==CGMA_NATIVE_CANARY.origin)
    return {ok:false,code:'BOARD_SCOPE_INVALID'};
  if(value.confirmed!==true)
    return {ok:false,code:'HUMAN_CONFIRMATION_REQUIRED'};
  if(typeof value.grantRef!=='string'||!/^cgma_grant_[a-f0-9-]{36}$/.test(value.grantRef))
    return {ok:false,code:'AUTH_REQUIRED'};
  if(typeof value.nonce!=='string'||!/^cgma_[a-f0-9-]{36}$/.test(value.nonce))
    return {ok:false,code:'NONCE_REQUIRED'};
  return {ok:true,grantRef:value.grantRef,nonce:value.nonce};
}

export function inspectCgmaCanaryReceipt(receipt) {
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))
    return {ok:false,code:'RECEIPT_MISSING'};
  if(receipt.boardId!==CGMA_NATIVE_CANARY.boardId||receipt.origin!==CGMA_NATIVE_CANARY.origin)
    return {ok:false,code:'BOARD_SCOPE_INVALID'};
  if(!/^hyb_[a-f0-9-]{36}$/.test(String(receipt.taskId||''))||
     !/^cgma_[a-f0-9-]{36}$/.test(String(receipt.nonce||''))||
     !Number.isSafeInteger(receipt.ownPostId)||receipt.ownPostId<1)
    return {ok:false,code:'RECEIPT_IDENTITY_INVALID'};
  if(receipt.cleanedUp!==true||receipt.userBrowserReused!==false||receipt.clipboardAccessed!==false)
    return {ok:false,code:'ISOLATION_OR_CLEANUP_UNVERIFIED'};
  const names=['health','anonymous-denial','create','read','edit','read-edited','delete','read-deleted','list-hidden'];
  const statuses=[200,403,201,200,200,200,200,404,200];
  if(!Array.isArray(receipt.steps)||receipt.steps.length!==names.length)
    return {ok:false,code:'RECEIPT_STEPS_INCOMPLETE'};
  for(let i=0;i<names.length;i++){
    if(receipt.steps[i]?.name!==names[i]||receipt.steps[i]?.httpStatus!==statuses[i]||
       receipt.steps[i]?.ok!==true)return {ok:false,code:'RECEIPT_STEP_INVALID'};
  }
  if(!Array.isArray(receipt.auditEvidenceRefs)||receipt.auditEvidenceRefs.length!==3||
     !receipt.auditEvidenceRefs.every(x=>typeof x==='string'&&/^audit_[a-z0-9_-]{8,96}$/.test(x)))
    return {ok:false,code:'AUTHORITATIVE_AUDIT_EVIDENCE_REQUIRED'};
  return {ok:true,code:'STRUCTURAL_RECEIPT_VALID_ONLY'};
}

// This is a structural validator, NOT an authorization grant or authoritative audit
// attestation. A future server-side evidence verifier must check grantRef, nonce,
// idempotency, lease expiry, device binding and audit IDs independently in D1.
