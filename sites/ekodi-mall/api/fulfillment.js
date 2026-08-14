import { sourceExecution } from './sourcing.js';

const FULFILLMENT_TRANSITIONS = Object.freeze({
  awaiting_pii: new Set(['ready_to_forward','cancel_requested','failed']),
  ready_to_forward: new Set(['forwarded','cancel_requested','failed']),
  forwarded: new Set(['accepted','shipped','cancel_requested','failed']),
  accepted: new Set(['shipped','cancel_requested','failed']),
  shipped: new Set(['delivered','return_requested','failed']),
  delivered: new Set(['return_requested','closed']),
  cancel_requested: new Set(['cancelled','forwarded','accepted','failed']),
  cancelled: new Set(['closed']),
  return_requested: new Set(['returned','refund_pending','closed','failed']),
  returned: new Set(['refund_pending','closed']),
  refund_pending: new Set(['closed','failed']),
  closed: new Set(),
  failed: new Set(['awaiting_pii','ready_to_forward','closed'])
});
const RETURN_STATUSES = new Set(['requested','approved','rejected','in_transit','received','refund_pending','refunded','closed']);
const SHIPMENT_STATUSES = new Set(['label_pending','in_transit','delivered','exception','returned']);
const RAW_PII_KEYS = new Set(['name','recipient','recipientName','phone','phoneNumber','mobile','address','address1','address2','postalCode','postcode','zip','email']);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const randomId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const enabled = (value) => String(value || '').toLowerCase() === 'true';
const amount = (value) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : 0;
};

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function authenticate(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ') || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

function internalAuthorized(request, env) {
  const expected = clean(env.FULFILLMENT_INTERNAL_TOKEN || env.SOURCING_INTERNAL_TOKEN, 500);
  const supplied = clean(request.headers.get('x-ekodi-mall-internal-token'), 500);
  return Boolean(expected && supplied && expected === supplied);
}

function bodyContainsRawPii(body = {}) {
  return Object.keys(body || {}).some((key) => RAW_PII_KEYS.has(key));
}

export function fulfillmentTransitionAllowed(fromStatus, toStatus) {
  return Boolean(FULFILLMENT_TRANSITIONS[fromStatus]?.has(toStatus));
}

export function validatePiiReleaseInput(body = {}) {
  if (bodyContainsRawPii(body)) return { ok: false, error: '배송 개인정보 원문은 Mall D1에 전달하지 말고 승인된 PII 참조값만 사용해야 합니다.' };
  const ref = clean(body.piiReleaseRef, 220);
  if (!/^pii_[A-Za-z0-9_-]{12,200}$/.test(ref)) return { ok: false, error: '승인된 pii_ 참조값이 필요합니다.' };
  return { ok: true, ref };
}

export async function fulfillmentSchemaReady(env) {
  if (!env?.DB) return false;
  try {
    const rows = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (
      'supplier_contracts','fulfillment_orders','fulfillment_shipments','fulfillment_returns','supplier_settlement_ledger','fulfillment_events'
    )`).all();
    return new Set((rows.results || []).map((row) => row.name)).size === 6;
  } catch { return false; }
}

async function event(env, fulfillmentId, eventType, actorType, fromStatus = '', toStatus = '', metadata = {}) {
  await env.DB.prepare(`INSERT INTO fulfillment_events
    (fulfillment_id,event_type,actor_type,from_status,to_status,metadata_json,occurred_at)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(fulfillmentId,clean(eventType,80),actorType,clean(fromStatus,40),clean(toStatus,40),JSON.stringify(metadata || {}).slice(0,4000),nowIso()).run();
}

function fulfillmentView(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id || null,
    productName: row.product_name || '',
    sourceId: row.source_id,
    sourceLabel: row.source_label || '',
    status: row.status,
    executionMode: row.execution_mode,
    supplierCostAmount: Number(row.supplier_cost_amount || 0),
    supplierShippingAmount: Number(row.supplier_shipping_amount || 0),
    supplierPayableAmount: Number(row.supplier_payable_amount || 0),
    piiReleaseStatus: row.pii_release_status,
    providerOrderRef: row.provider_order_ref || '',
    forwardedAt: row.forwarded_at || null,
    acceptedAt: row.accepted_at || null,
    shippedAt: row.shipped_at || null,
    deliveredAt: row.delivered_at || null,
    cancelledAt: row.cancelled_at || null,
    closedAt: row.closed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const FULFILLMENT_SELECT = `SELECT fo.*,o.product_id,p.name AS product_name,ss.internal_label AS source_label
  FROM fulfillment_orders fo
  JOIN orders o ON o.id=fo.order_id
  JOIN products p ON p.id=o.product_id
  JOIN sourcing_sources ss ON ss.id=fo.source_id`;

async function getFulfillment(env, id) {
  return env.DB.prepare(`${FULFILLMENT_SELECT} WHERE fo.id=?`).bind(id).first();
}

async function listSellerFulfillments(env, sellerId) {
  const rows = await env.DB.prepare(`${FULFILLMENT_SELECT} WHERE fo.seller_id=? ORDER BY fo.created_at DESC LIMIT 100`).bind(sellerId).all();
  return (rows.results || []).map(fulfillmentView);
}

async function contractView(env, sourceId) {
  return env.DB.prepare(`SELECT sc.*,ss.internal_label AS source_label,ss.rights_status,ss.order_permission,ss.pii_permission,
    sp.provider_type,sp.auto_order_enabled AS provider_auto_order_enabled
    FROM supplier_contracts sc
    JOIN sourcing_sources ss ON ss.id=sc.source_id
    JOIN sourcing_providers sp ON sp.id=ss.provider_id
    WHERE sc.source_id=?`).bind(sourceId).first();
}

async function verifyContract(env, sourceId, body = {}) {
  const source = await env.DB.prepare(`SELECT ss.*,sp.provider_type FROM sourcing_sources ss
    JOIN sourcing_providers sp ON sp.id=ss.provider_id WHERE ss.id=?`).bind(sourceId).first();
  if (!source) return { status: 404, body: { error: '공급처를 찾을 수 없습니다.' } };
  if (!['contract_supplier','supplier_api'].includes(source.provider_type)) return { status: 409, body: { error: '계약 공급자만 Fulfillment 계약승인을 할 수 있습니다.' } };
  const contractRef = clean(body.contractRef,240);
  const piiProcessorRef = clean(body.piiProcessorRef,240);
  const returnsPolicyRef = clean(body.returnsPolicyRef,240);
  if (!contractRef || !piiProcessorRef || !returnsPolicyRef) return { status: 400, body: { error: '계약·개인정보 처리위탁·반품정책 참조값이 모두 필요합니다.' } };
  const csOwner = ['seller','supplier','ekodi','shared'].includes(body.csOwner) ? body.csOwner : 'seller';
  const shippingSlaDays = body.shippingSlaDays === '' || body.shippingSlaDays == null ? null : Math.max(0,Math.min(30,Math.trunc(Number(body.shippingSlaDays)||0)));
  const now = nowIso();
  const existing = await env.DB.prepare('SELECT id FROM supplier_contracts WHERE source_id=?').bind(sourceId).first();
  const id = existing?.id || randomId('ctr');
  await env.DB.prepare(`INSERT INTO supplier_contracts
    (id,source_id,seller_id,status,contract_ref,pii_processor_ref,returns_policy_ref,cs_owner,shipping_sla_days,effective_at,expires_at,approved_at,created_at,updated_at)
    VALUES (?,?,?,'verified',?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(source_id) DO UPDATE SET status='verified',contract_ref=excluded.contract_ref,pii_processor_ref=excluded.pii_processor_ref,
      returns_policy_ref=excluded.returns_policy_ref,cs_owner=excluded.cs_owner,shipping_sla_days=excluded.shipping_sla_days,
      effective_at=excluded.effective_at,expires_at=excluded.expires_at,approved_at=excluded.approved_at,updated_at=excluded.updated_at`)
    .bind(id,sourceId,source.seller_id,contractRef,piiProcessorRef,returnsPolicyRef,csOwner,shippingSlaDays,
      clean(body.effectiveAt,40) || now,clean(body.expiresAt,40) || null,now,now,now).run();
  const orderPermission = source.provider_type === 'supplier_api' ? 'api_approved' : 'manual_contract';
  await env.DB.prepare(`UPDATE sourcing_sources SET rights_status='contract_verified',order_permission=?,pii_permission='contracted_processor',updated_at=? WHERE id=?`)
    .bind(orderPermission,now,sourceId).run();
  const contract = await contractView(env,sourceId);
  return { status: 200, body: {
    contract: {
      id: contract.id, sourceId: contract.source_id, status: contract.status, contractRef: contract.contract_ref,
      piiProcessorRef: contract.pii_processor_ref, returnsPolicyRef: contract.returns_policy_ref,
      csOwner: contract.cs_owner, shippingSlaDays: contract.shipping_sla_days, effectiveAt: contract.effective_at,
      expiresAt: contract.expires_at, approvedAt: contract.approved_at
    },
    sourcePermissions: { rightsStatus: contract.rights_status, orderPermission: contract.order_permission, piiPermission: contract.pii_permission },
    note: '계약승인과 고객 배송정보 release는 별도 게이트입니다. 승인된 계약만으로 구매자 개인정보가 공급자에게 전달되지는 않습니다.'
  } };
}

async function prepareFulfillment(env, orderId, body = {}) {
  const sourceId = clean(body.sourceId,80);
  if (!sourceId) return { status: 400, body: { error: 'sourceId가 필요합니다.' } };
  const order = await env.DB.prepare(`SELECT o.*,p.name AS product_name FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=?`).bind(orderId).first();
  if (!order) return { status: 404, body: { error: '주문을 찾을 수 없습니다.' } };
  if (order.status !== 'paid') return { status: 409, body: { error: '결제 완료 주문만 공급자 Fulfillment로 전환할 수 있습니다.' } };
  const existing = await env.DB.prepare(`${FULFILLMENT_SELECT} WHERE fo.order_id=?`).bind(orderId).first();
  if (existing) return { status: 200, body: { fulfillment: fulfillmentView(existing), idempotent: true } };
  const source = await env.DB.prepare(`SELECT ss.*,sp.provider_type,sp.auto_order_enabled AS provider_auto_order_enabled,
    psl.min_margin_amount,psl.min_margin_percent FROM sourcing_sources ss
    JOIN sourcing_providers sp ON sp.id=ss.provider_id
    JOIN product_source_links psl ON psl.source_id=ss.id
    WHERE ss.id=? AND ss.seller_id=? AND psl.product_id=? AND ss.active=1 AND psl.active=1`)
    .bind(sourceId,order.seller_id,order.product_id).first();
  if (!source) return { status: 409, body: { error: '이 주문 상품에 연결된 활성 공급처가 아닙니다.' } };
  const contract = await env.DB.prepare(`SELECT * FROM supplier_contracts WHERE source_id=? AND seller_id=? AND status='verified'
    AND (expires_at IS NULL OR expires_at='') OR (source_id=? AND seller_id=? AND status='verified' AND expires_at>?)`)
    .bind(sourceId,order.seller_id,sourceId,order.seller_id,nowIso()).first();
  if (!contract) return { status: 409, body: { error: '유효한 공급계약 검증이 필요합니다.' } };
  const execution = sourceExecution(source,env);
  if (!['manual_forward','api_order'].includes(execution.mode)) return { status: 409, body: { error: `현재 공급처는 Fulfillment 실행 조건을 충족하지 않습니다: ${execution.reason}` } };
  if (source.cost_amount == null) return { status: 409, body: { error: '확정 공급원가가 필요합니다.' } };
  const supplierCostAmount = amount(source.cost_amount) * Number(order.quantity || 1);
  const supplierShippingAmount = amount(source.shipping_amount);
  const supplierPayableAmount = supplierCostAmount + supplierShippingAmount;
  const decision = await env.DB.prepare(`SELECT id FROM procurement_decisions WHERE product_id=? AND seller_id=? AND source_id=? ORDER BY created_at DESC LIMIT 1`)
    .bind(order.product_id,order.seller_id,sourceId).first();
  const id = randomId('ful');
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO fulfillment_orders
      (id,order_id,seller_id,source_id,contract_id,procurement_decision_id,status,execution_mode,supplier_cost_amount,supplier_shipping_amount,
       supplier_payable_amount,pii_release_status,pii_release_ref,provider_order_ref,idempotency_key,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'awaiting_pii',?,?,?,?,'blocked','','',?,?,?)`)
      .bind(id,orderId,order.seller_id,sourceId,contract.id,decision?.id || null,execution.mode,supplierCostAmount,supplierShippingAmount,supplierPayableAmount,`fulfill:${orderId}:${sourceId}`,now,now),
    env.DB.prepare(`INSERT INTO fulfillment_events
      (fulfillment_id,event_type,actor_type,from_status,to_status,metadata_json,occurred_at)
      VALUES (?,'prepared','internal','','awaiting_pii',?,?)`)
      .bind(id,JSON.stringify({ executionMode: execution.mode, sourceId }).slice(0,4000),now)
  ]);
  const row = await getFulfillment(env,id);
  return { status: 201, body: { fulfillment: fulfillmentView(row), note: '배송정보는 저장하지 않았습니다. 별도 PII Release gate가 열리고 승인된 참조값이 생겨야 다음 단계로 진행됩니다.' } };
}

async function releasePii(env, fulfillmentId, body = {}) {
  if (!enabled(env.BUYER_PII_RELEASE_ENABLED)) return { status: 503, body: { error: '구매자 배송정보 Release 전역 게이트가 비활성입니다.' } };
  const input = validatePiiReleaseInput(body);
  if (!input.ok) return { status: 400, body: { error: input.error } };
  const row = await getFulfillment(env,fulfillmentId);
  if (!row) return { status: 404, body: { error: 'Fulfillment를 찾을 수 없습니다.' } };
  if (row.status !== 'awaiting_pii') return { status: 409, body: { error: '현재 상태에서는 PII Release를 할 수 없습니다.' } };
  const contract = await env.DB.prepare(`SELECT status,pii_processor_ref,expires_at FROM supplier_contracts WHERE id=?`).bind(row.contract_id).first();
  if (!contract || contract.status !== 'verified' || !contract.pii_processor_ref || (contract.expires_at && contract.expires_at <= nowIso())) {
    return { status: 409, body: { error: '유효한 개인정보 처리위탁 계약이 필요합니다.' } };
  }
  const now = nowIso();
  await env.DB.prepare(`UPDATE fulfillment_orders SET pii_release_status='released',pii_release_ref=?,status='ready_to_forward',updated_at=? WHERE id=?`)
    .bind(input.ref,now,fulfillmentId).run();
  await event(env,fulfillmentId,'pii_released','internal','awaiting_pii','ready_to_forward',{ referenceOnly: true });
  return { status: 200, body: { fulfillment: fulfillmentView(await getFulfillment(env,fulfillmentId)), rawPiiStored: false } };
}

async function forwardManual(env, fulfillmentId, body = {}) {
  if (!enabled(env.SUPPLIER_FORWARD_ENABLED)) return { status: 503, body: { error: '공급자 발주 전역 게이트가 비활성입니다.' } };
  const row = await getFulfillment(env,fulfillmentId);
  if (!row) return { status: 404, body: { error: 'Fulfillment를 찾을 수 없습니다.' } };
  if (row.status !== 'ready_to_forward' || row.pii_release_status !== 'released') return { status: 409, body: { error: 'PII Release까지 완료된 ready_to_forward 상태가 필요합니다.' } };
  if (row.execution_mode !== 'manual_forward') return { status: 409, body: { error: '이 공급처는 수동 계약발주 대상이 아닙니다.' } };
  const providerOrderRef = clean(body.providerOrderRef,220);
  if (!providerOrderRef) return { status: 400, body: { error: '공급자 발주번호/참조값이 필요합니다.' } };
  const now = nowIso();
  await env.DB.prepare(`UPDATE fulfillment_orders SET status='forwarded',provider_order_ref=?,forwarded_at=?,updated_at=? WHERE id=?`)
    .bind(providerOrderRef,now,now,fulfillmentId).run();
  await event(env,fulfillmentId,'forwarded','internal','ready_to_forward','forwarded',{ providerOrderRef });
  return { status: 200, body: { fulfillment: fulfillmentView(await getFulfillment(env,fulfillmentId)) } };
}

async function acceptFulfillment(env, fulfillmentId) {
  const row = await getFulfillment(env,fulfillmentId);
  if (!row) return { status: 404, body: { error: 'Fulfillment를 찾을 수 없습니다.' } };
  if (!fulfillmentTransitionAllowed(row.status,'accepted')) return { status: 409, body: { error: '현재 상태에서 공급자 접수 처리할 수 없습니다.' } };
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(`UPDATE fulfillment_orders SET status='accepted',accepted_at=?,updated_at=? WHERE id=?`).bind(now,now,fulfillmentId),
    env.DB.prepare(`INSERT INTO supplier_settlement_ledger
      (fulfillment_id,source_id,entry_type,amount,status,effective_at,created_at)
      SELECT ?,?,'purchase',?,'pending',?,? WHERE NOT EXISTS (
        SELECT 1 FROM supplier_settlement_ledger WHERE fulfillment_id=? AND entry_type='purchase'
      )`).bind(fulfillmentId,row.source_id,row.supplier_payable_amount,now,now,fulfillmentId)
  ]);
  await event(env,fulfillmentId,'supplier_accepted','internal',row.status,'accepted',{});
  return { status: 200, body: { fulfillment: fulfillmentView(await getFulfillment(env,fulfillmentId)), supplierPayoutExecutionEnabled: false } };
}

async function updateShipment(env, fulfillmentId, body = {}) {
  const row = await getFulfillment(env,fulfillmentId);
  if (!row) return { status: 404, body: { error: 'Fulfillment를 찾을 수 없습니다.' } };
  const status = SHIPMENT_STATUSES.has(body.status) ? body.status : 'in_transit';
  const carrierCode = clean(body.carrierCode,80);
  const trackingNumber = clean(body.trackingNumber,160);
  if (status !== 'label_pending' && (!carrierCode || !trackingNumber)) return { status: 400, body: { error: '배송 상태 업데이트에는 택배사 코드와 송장번호가 필요합니다.' } };
  if (!['forwarded','accepted','shipped'].includes(row.status) && status !== 'returned') return { status: 409, body: { error: '현재 Fulfillment 상태에서는 배송 업데이트를 할 수 없습니다.' } };
  const now = nowIso();
  const shipment = await env.DB.prepare(`SELECT * FROM fulfillment_shipments WHERE fulfillment_id=? ORDER BY created_at DESC LIMIT 1`).bind(fulfillmentId).first();
  const shipmentId = shipment?.id || randomId('shp');
  const shippedAt = status === 'in_transit' || status === 'delivered' ? shipment?.shipped_at || now : shipment?.shipped_at || null;
  const deliveredAt = status === 'delivered' ? now : shipment?.delivered_at || null;
  await env.DB.prepare(`INSERT INTO fulfillment_shipments
    (id,fulfillment_id,carrier_code,tracking_number,status,shipped_at,delivered_at,last_checked_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET carrier_code=excluded.carrier_code,tracking_number=excluded.tracking_number,status=excluded.status,
      shipped_at=excluded.shipped_at,delivered_at=excluded.delivered_at,last_checked_at=excluded.last_checked_at,updated_at=excluded.updated_at`)
    .bind(shipmentId,fulfillmentId,carrierCode,trackingNumber,status,shippedAt,deliveredAt,now,shipment?.created_at || now,now).run();
  let nextStatus = row.status;
  if ((status === 'in_transit' || status === 'delivered') && ['forwarded','accepted'].includes(row.status)) nextStatus = 'shipped';
  if (status === 'delivered') nextStatus = 'delivered';
  if (nextStatus !== row.status) {
    await env.DB.prepare(`UPDATE fulfillment_orders SET status=?,shipped_at=COALESCE(shipped_at,?),delivered_at=?,updated_at=? WHERE id=?`)
      .bind(nextStatus,shippedAt,deliveredAt,now,fulfillmentId).run();
  }
  await event(env,fulfillmentId,'shipment_updated','internal',row.status,nextStatus,{ status, carrierCode, trackingNumber });
  return { status: 200, body: { fulfillment: fulfillmentView(await getFulfillment(env,fulfillmentId)), shipment: { id: shipmentId, status, carrierCode, trackingNumber, shippedAt, deliveredAt } } };
}

async function createReturn(env, sellerId, fulfillmentId, body = {}) {
  const row = await getFulfillment(env,fulfillmentId);
  if (!row || row.seller_id !== sellerId) return { status: 404, body: { error: '본인 Fulfillment를 찾을 수 없습니다.' } };
  if (!['shipped','delivered'].includes(row.status)) return { status: 409, body: { error: '배송 이후 주문만 반품 케이스를 만들 수 있습니다.' } };
  const existing = await env.DB.prepare(`SELECT id,status FROM fulfillment_returns WHERE fulfillment_id=? AND status NOT IN ('rejected','refunded','closed') ORDER BY created_at DESC LIMIT 1`)
    .bind(fulfillmentId).first();
  if (existing) return { status: 200, body: { returnCase: existing, idempotent: true } };
  const id = randomId('ret');
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO fulfillment_returns
      (id,fulfillment_id,order_id,requested_by,reason_code,status,created_at,updated_at)
      VALUES (?,?,?,'seller',?,'requested',?,?)`).bind(id,fulfillmentId,row.order_id,clean(body.reasonCode,80) || 'other',now,now),
    env.DB.prepare(`UPDATE fulfillment_orders SET status='return_requested',updated_at=? WHERE id=?`).bind(now,fulfillmentId)
  ]);
  await event(env,fulfillmentId,'return_requested','seller',row.status,'return_requested',{ reasonCode: clean(body.reasonCode,80) || 'other' });
  return { status: 201, body: { returnCase: { id, status: 'requested', reasonCode: clean(body.reasonCode,80) || 'other', createdAt: now } } };
}

async function updateReturn(env, returnId, body = {}) {
  const status = RETURN_STATUSES.has(body.status) ? body.status : '';
  if (!status || status === 'requested') return { status: 400, body: { error: '유효한 다음 반품 상태가 필요합니다.' } };
  const rc = await env.DB.prepare(`SELECT * FROM fulfillment_returns WHERE id=?`).bind(returnId).first();
  if (!rc) return { status: 404, body: { error: '반품 케이스를 찾을 수 없습니다.' } };
  const now = nowIso();
  const receivedAt = status === 'received' ? now : rc.return_received_at;
  const refundDueAt = clean(body.refundDueAt,40) || rc.refund_due_at || null;
  const refundCompletedAt = status === 'refunded' ? now : rc.refund_completed_at;
  await env.DB.prepare(`UPDATE fulfillment_returns SET status=?,return_received_at=?,refund_due_at=?,refund_completed_at=?,updated_at=? WHERE id=?`)
    .bind(status,receivedAt,refundDueAt,refundCompletedAt,now,returnId).run();
  const fulfillment = await getFulfillment(env,rc.fulfillment_id);
  let nextStatus = fulfillment.status;
  if (status === 'received') nextStatus = 'returned';
  if (status === 'refund_pending') nextStatus = 'refund_pending';
  if (status === 'refunded' || status === 'closed') nextStatus = 'closed';
  if (nextStatus !== fulfillment.status && fulfillmentTransitionAllowed(fulfillment.status,nextStatus)) {
    await env.DB.prepare(`UPDATE fulfillment_orders SET status=?,closed_at=?,updated_at=? WHERE id=?`)
      .bind(nextStatus,nextStatus === 'closed' ? now : fulfillment.closed_at,now,fulfillment.id).run();
  }
  if (status === 'refunded') {
    await env.DB.prepare(`INSERT INTO supplier_settlement_ledger
      (fulfillment_id,source_id,entry_type,amount,status,effective_at,created_at)
      SELECT ?,?,'refund',?,'pending',?,? WHERE NOT EXISTS (
        SELECT 1 FROM supplier_settlement_ledger WHERE fulfillment_id=? AND entry_type='refund'
      )`).bind(fulfillment.id,fulfillment.source_id,-Math.abs(fulfillment.supplier_payable_amount),now,now,fulfillment.id).run();
  }
  await event(env,fulfillment.id,'return_updated','internal',fulfillment.status,nextStatus,{ returnId, returnStatus: status, refundDueAt });
  return { status: 200, body: { returnCase: { id: returnId, status, returnReceivedAt: receivedAt, refundDueAt, refundCompletedAt }, fulfillment: fulfillmentView(await getFulfillment(env,fulfillment.id)), refundExecutionEnabled: false } };
}

export async function handleFulfillmentRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/fulfillment/') && !path.startsWith('/api/internal/fulfillment/')) return null;
  if (!env.DB) return { status: 503, body: { error: 'Mall 전용 데이터베이스 연결이 없습니다.' } };

  if (path.startsWith('/api/internal/fulfillment/')) {
    if (!internalAuthorized(request,env)) return { status: 403, body: { error: 'Fulfillment 내부 권한이 없습니다.' } };
    let match = path.match(/^\/api\/internal\/fulfillment\/sources\/(src_[a-f0-9]{32})\/contract\/verify$/i);
    if (request.method === 'POST' && match) return verifyContract(env,match[1],await readJson(request) || {});
    match = path.match(/^\/api\/internal\/fulfillment\/orders\/([^/]+)\/prepare$/);
    if (request.method === 'POST' && match) return prepareFulfillment(env,decodeURIComponent(match[1]),await readJson(request) || {});
    match = path.match(/^\/api\/internal\/fulfillment\/(ful_[a-f0-9]{32})\/pii-release$/i);
    if (request.method === 'POST' && match) return releasePii(env,match[1],await readJson(request) || {});
    match = path.match(/^\/api\/internal\/fulfillment\/(ful_[a-f0-9]{32})\/forward$/i);
    if (request.method === 'POST' && match) return forwardManual(env,match[1],await readJson(request) || {});
    match = path.match(/^\/api\/internal\/fulfillment\/(ful_[a-f0-9]{32})\/accept$/i);
    if (request.method === 'POST' && match) return acceptFulfillment(env,match[1]);
    match = path.match(/^\/api\/internal\/fulfillment\/(ful_[a-f0-9]{32})\/shipment$/i);
    if (request.method === 'POST' && match) return updateShipment(env,match[1],await readJson(request) || {});
    match = path.match(/^\/api\/internal\/fulfillment\/returns\/(ret_[a-f0-9]{32})$/i);
    if (request.method === 'POST' && match) return updateReturn(env,match[1],await readJson(request) || {});
    return { status: 404, body: { error: 'Fulfillment internal route not found.' } };
  }

  const user = await authenticate(request,env);
  if (!user) return { status: 401, body: { error: 'Google 판매자 로그인이 필요합니다.' } };
  if (request.method === 'GET' && path === '/api/fulfillment/orders') {
    return { status: 200, body: {
      fulfillments: await listSellerFulfillments(env,user.id),
      gates: { buyerPiiReleaseEnabled: enabled(env.BUYER_PII_RELEASE_ENABLED), supplierForwardEnabled: enabled(env.SUPPLIER_FORWARD_ENABLED), supplierPayoutExecutionEnabled: false, refundExecutionEnabled: false }
    } };
  }
  const detail = path.match(/^\/api\/fulfillment\/(ful_[a-f0-9]{32})$/i);
  if (request.method === 'GET' && detail) {
    const row = await getFulfillment(env,detail[1]);
    if (!row || row.seller_id !== user.id) return { status: 404, body: { error: '본인 Fulfillment를 찾을 수 없습니다.' } };
    const shipments = await env.DB.prepare(`SELECT id,carrier_code AS carrierCode,tracking_number AS trackingNumber,status,shipped_at AS shippedAt,delivered_at AS deliveredAt,last_checked_at AS lastCheckedAt FROM fulfillment_shipments WHERE fulfillment_id=? ORDER BY created_at DESC`).bind(row.id).all();
    const returns = await env.DB.prepare(`SELECT id,requested_by AS requestedBy,reason_code AS reasonCode,status,return_received_at AS returnReceivedAt,refund_due_at AS refundDueAt,refund_completed_at AS refundCompletedAt,created_at AS createdAt FROM fulfillment_returns WHERE fulfillment_id=? ORDER BY created_at DESC`).bind(row.id).all();
    return { status: 200, body: { fulfillment: fulfillmentView(row), shipments: shipments.results || [], returns: returns.results || [], rawPiiStored: false } };
  }
  const returnCreate = path.match(/^\/api\/fulfillment\/(ful_[a-f0-9]{32})\/returns$/i);
  if (request.method === 'POST' && returnCreate) return createReturn(env,user.id,returnCreate[1],await readJson(request) || {});
  return { status: 404, body: { error: 'Fulfillment route not found.' } };
}
