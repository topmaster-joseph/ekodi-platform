// EKODI Pay private, read-only merchant status adapter.
// NOT mounted on a public route. The owning Worker must inject independently
// authenticated identity and tenant-scoped authorization callbacks.
// This file neither changes D1 nor contacts a PG/bank nor enables payments.
const ROUTE=/^\/ekodipay\/private\/merchants\/([a-z][a-z0-9_-]{2,39})\/status$/;
const BASE_HEADERS=Object.freeze({
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'vary':'Cookie, Authorization',
});
function reply(status,data,head=false,extra={}) {
  return new Response(head?null:JSON.stringify(data),{status,headers:{...BASE_HEADERS,...extra}});
}
const QUERY=`
SELECT m.merchant_id, m.state,
 EXISTS(SELECT 1 FROM ekodipay_merchant_mid p
   WHERE p.merchant_id=m.merchant_id AND p.pg_mode='test'
     AND p.verified_at IS NOT NULL AND p.proof_ref IS NOT NULL) AS test_mid_verified,
 EXISTS(SELECT 1 FROM ekodipay_merchant_mid p
   WHERE p.merchant_id=m.merchant_id AND p.pg_mode='live'
     AND p.verified_at IS NOT NULL AND p.proof_ref IS NOT NULL) AS live_mid_verified,
 EXISTS(SELECT 1 FROM ekodipay_merchant_bank_verification b
   WHERE b.merchant_id=m.merchant_id AND b.review_state='verified') AS bank_verified,
 (SELECT COUNT(*) FROM ekodipay_merchant_service_issuers i
   WHERE i.merchant_id=m.merchant_id AND i.is_enabled=1) AS approved_issuer_count,
 (SELECT COUNT(*) FROM ekodipay_merchant_approval_evidence e
   WHERE e.merchant_id=m.merchant_id AND e.status='verified'
     AND e.proof_ref IS NOT NULL AND e.approved_at IS NOT NULL) AS evidence_count
FROM ekodipay_merchants m WHERE m.merchant_id=?
`.trim();

function safeCount(value){const n=Number(value);return Number.isSafeInteger(n)&&n>=0?Math.min(n,100000):0;}
export function sanitizePrivateMerchantStatus(row) {
  if(!row||typeof row.merchant_id!=='string'||!['pending','verified','suspended'].includes(row.state))
    throw new Error('invalid_merchant_state');
  // Never send raw MID, binding ref, legal entity, account HMAC, proof, secret,
  // bank digits, customer/order data, approval identities, or SQL row objects.
  return {
    merchantId:row.merchant_id,
    state:row.state,
    checks:{
      testMidVerified:Number(row.test_mid_verified)===1,
      liveMidVerified:Number(row.live_mid_verified)===1,
      bankOwnershipVerified:Number(row.bank_verified)===1,
      enabledIssuerCount:safeCount(row.approved_issuer_count),
      verifiedEvidenceCount:safeCount(row.evidence_count),
    },
    // MID/evidence flags alone never prove live credentials or runtime issuer
    // authorization. No financial capability is available through this adapter.
    canCharge:false,
    readiness:'review-only-not-payment-authorization',
  };
}
export async function handlePrivateMerchantStatus(request,{db,authenticate,authorize}={}) {
  const url=new URL(request.url);
  const match=url.pathname.match(ROUTE);
  if(!match)return null; // Caller must enforce 404 for unmounted/unknown paths.
  const head=request.method==='HEAD';
  if(url.hostname!=='ekodi.kr')return reply(404,{error:'not_found'},head);
  if(request.method!=='GET'&&!head)
    return reply(405,{error:'method_not_allowed'},false,{'allow':'GET, HEAD'});
  if(url.search)return reply(400,{error:'unexpected_query'},head);
  // A missing adapter is an outage, never a guest or platform-admin bypass.
  if(typeof authenticate!=='function'||typeof authorize!=='function'||!db?.prepare)
    return reply(503,{error:'private_authority_unavailable'},head);
  const merchantId=match[1];
  try {
    const principal=await authenticate(request);
    if(!principal||typeof principal.subjectRef!=='string'||!principal.subjectRef)
      return reply(401,{error:'authentication_required'},head);
    const permitted=await authorize({principal,merchantId,capability:'ekodipay.merchant.status.read'});
    if(permitted!==true)return reply(403,{error:'forbidden'},head);
    const row=await db.prepare(QUERY).bind(merchantId).first();
    if(!row)return reply(404,{error:'merchant_not_found'},head);
    return reply(200,sanitizePrivateMerchantStatus(row),head);
  } catch {
    // Never leak authentication, database, evidence or provider internals.
    return reply(503,{error:'private_status_unavailable'},head);
  }
}
