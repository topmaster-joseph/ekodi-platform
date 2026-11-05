// MALL-MEMBER-POINT-001 — immutable, server-attested 1% purchase evidence.
// Production canonical EKODI points ledger is not installed; this outbox is
// pending proof, NOT a spendable points balance or a confirmed award.
const isOn=value=>String(value||'').toLowerCase()==='true';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MEMBER_PURCHASE_RATE_BPS=100;
export const memberEvidenceEnabled=env=>isOn(env?.MALL_MEMBER_POINT_EVIDENCE_ENABLED);
export function eligibleMember(user){
  if(!user||user.is_anonymous===true||!UUID.test(String(user.id||'')))return null;
  if(!user.email_confirmed_at&&!user.phone_confirmed_at&&!user.confirmed_at)return null;
  return user.id;
}
export function pointEstimate(grossKrw,refundedKrw=0){
  if(!Number.isSafeInteger(grossKrw)||grossKrw<=0)return 0;
  if(!Number.isSafeInteger(refundedKrw)||refundedKrw<0)return 0;
  return Math.floor(Math.max(0,grossKrw-Math.min(grossKrw,refundedKrw))/100);
}
export function memberPurchaseOrderStatement(env,orderId,authUserId,grossKrw,now){
  if(!memberEvidenceEnabled(env)||!UUID.test(String(authUserId||'')))return null;
  if(pointEstimate(grossKrw)===0)return null;
  return env.DB.prepare(`INSERT INTO member_purchase_point_orders
    (order_id,auth_user_id,rate_bps,gross_krw,eligible_points,refunded_krw,state,created_at,updated_at)
    VALUES (?,?,100,?,0,0,'awaiting_payment',?,?)`)
    .bind(orderId,authUserId,grossKrw,now,now);
}
export function paidPurchasePointStatements(env,order,payment,provider,now){
  if(!memberEvidenceEnabled(env)||provider!=='TOSS'||payment?.status!=='DONE')return [];
  const gross=Math.trunc(Number(order?.gross_amount));
  if(!Number.isSafeInteger(gross)||gross<=0||Number(payment.totalAmount)!==gross)return [];
  const points=pointEstimate(gross);
  if(!points)return [];
  const key=`mall:${order.id}:purchase-paid`;
  return [
    env.DB.prepare(`INSERT OR IGNORE INTO member_purchase_point_events
      (event_key,order_id,auth_user_id,event_kind,delta_points,verified_gross_krw,cumulative_refund_krw,created_at)
      SELECT ?,order_id,auth_user_id,'purchase_paid',?,gross_krw,0,?
      FROM member_purchase_point_orders WHERE order_id=? AND state='awaiting_payment'
        AND gross_krw=?`).bind(key,points,now,order.id,gross),
    env.DB.prepare(`UPDATE member_purchase_point_orders
      SET eligible_points=?,state='pending_core',updated_at=?
      WHERE order_id=? AND gross_krw=? AND state='awaiting_payment'`)
      .bind(points,now,order.id,gross),
  ];
}
// The negative delta must be derived from the existing ledger projection inside
// SQLite, not from a browser, so use this in all production refund paths.
export function verifiedRefundPointStatements(env,order,refundedKrw,now){
  if(!memberEvidenceEnabled(env))return [];
  const gross=Math.trunc(Number(order?.gross_amount));
  if(!Number.isSafeInteger(gross)||gross<=0)return [];
  const cumulative=Math.min(gross,Math.max(0,Math.trunc(Number(refundedKrw)||0)));
  if(cumulative<=0)return [];
  const newPoints=pointEstimate(gross,cumulative);
  const key=`mall:${order.id}:refund-total:${cumulative}`;
  return [
    env.DB.prepare(`INSERT OR IGNORE INTO member_purchase_point_events
      (event_key,order_id,auth_user_id,event_kind,delta_points,verified_gross_krw,cumulative_refund_krw,created_at)
      SELECT ?,order_id,auth_user_id,'purchase_refund',? - eligible_points,gross_krw,?,?
      FROM member_purchase_point_orders WHERE order_id=? AND state IN ('pending_core','reversed')
        AND refunded_krw<? AND eligible_points>?`)
      .bind(key,newPoints,cumulative,now,order.id,cumulative,newPoints),
    env.DB.prepare(`UPDATE member_purchase_point_orders
      SET refunded_krw=?,eligible_points=?,state=?,updated_at=?
      WHERE order_id=? AND state IN ('pending_core','reversed') AND refunded_krw<?`)
      .bind(cumulative,newPoints,newPoints===0?'reversed':'pending_core',now,order.id,cumulative),
  ];
}
export function memberPointsView(row){
  if(!row)return null;
  return {ratePercent:1,points:Math.max(0,Math.trunc(Number(row.eligible_points)||0)),
    status:row.state==='awaiting_payment'?'awaiting_payment':row.state==='reversed'?'reversed':'pending_central_ledger',
    spendable:false,description:'포인트 운영원장 활성화·검증 후 잔액에 반영됩니다.'};
}
