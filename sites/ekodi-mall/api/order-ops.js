// EKODI-MALL-ORDER-OPS-001: 운영자용 주문·발주 관리.
// 주문(결제) ↔ 공급처 발주(도매꾹) ↔ 송장을 한 줄로 보여준다. 구매자 정보는 목록에서 가리고,
// 상세 열람은 운영자 감사기록(mall_ops_audit)을 남긴 뒤에만 보여준다.
import { authorizeVerificationOperations } from './verification.js';

const BASE = '/api/internal/operations/orders';
const isoNow = () => new Date().toISOString();
const maskName = (v) => { const s = String(v || ''); return s.length <= 1 ? s : s.length === 2 ? `${s[0]}*` : `${s[0]}${'*'.repeat(s.length - 2)}${s[s.length - 1]}`; };
const region = (addr) => String(addr || '').split(/\s+/).slice(0, 2).join(' ');

export async function listOrderOps(env, { status = '', limit = 50 } = {}) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const where = status === 'supply_issue' ? "WHERE s.status IN ('failed','unknown','cancel_requested')"
    : status === 'paid' ? "WHERE o.status='paid'" : status === 'refunded' ? "WHERE o.status IN ('refunded','partially_refunded')" : '';
  const rows = await env.DB.prepare(`SELECT o.id,o.status,o.quantity,o.gross_amount,o.created_at,o.paid_at,p.name AS product_name,p.share_code,p.supply_provider,p.supply_item_no,
      b.name AS buyer_name,b.address1,s.status AS supply_status,s.supplier_order_no,s.supplier_status,s.tracking_company,s.tracking_code,s.last_error,s.expected_cost,s.updated_at AS supply_updated_at
    FROM orders o JOIN products p ON p.id=o.product_id LEFT JOIN order_buyers b ON b.order_id=o.id LEFT JOIN supplier_orders s ON s.order_id=o.id
    ${where} ORDER BY o.created_at DESC LIMIT ?`).bind(lim).all();
  const orders = (rows.results || []).map((r) => ({
    id: r.id, status: r.status, quantity: r.quantity, amount: r.gross_amount, createdAt: r.created_at, paidAt: r.paid_at,
    product: { name: r.product_name, shareCode: r.share_code, supplier: r.supply_provider || '', supplierItemNo: r.supply_item_no || '' },
    buyer: r.buyer_name ? { name: maskName(r.buyer_name), region: region(r.address1) } : null,
    supply: r.supply_status ? { status: r.supply_status, orderNo: r.supplier_order_no || '', supplierStatus: r.supplier_status || '', trackingCompany: r.tracking_company || '',
      trackingCode: r.tracking_code || '', error: r.last_error || '', expectedCost: r.expected_cost, updatedAt: r.supply_updated_at } : null
  }));
  const one = async (sql) => Number((await env.DB.prepare(sql).first())?.n || 0);
  const summary = {
    paid: await one("SELECT COUNT(*) n FROM orders WHERE status='paid'"),
    placed: await one("SELECT COUNT(*) n FROM supplier_orders WHERE status IN ('placed','shipping','delivered')"),
    shipping: await one("SELECT COUNT(*) n FROM supplier_orders WHERE status='shipping'"),
    issues: await one("SELECT COUNT(*) n FROM supplier_orders WHERE status IN ('failed','unknown','cancel_requested')"),
    awaitingSupply: await one("SELECT COUNT(*) n FROM orders o JOIN products p ON p.id=o.product_id LEFT JOIN supplier_orders s ON s.order_id=o.id WHERE o.status='paid' AND p.supply_provider<>'' AND s.id IS NULL")
  };
  const probe = await env.DB.prepare("SELECT result_status,metadata_json,checked_at FROM supplier_connector_checks WHERE external_ref='probe:login' ORDER BY checked_at DESC LIMIT 1").first().catch(() => null);
  let emoney = null; try { emoney = JSON.parse(probe?.metadata_json || '{}').emoney ?? null; } catch {}
  return { orders, summary, supplier: { domeggookLogin: probe?.result_status || 'unknown', emoney, checkedAt: probe?.checked_at || null } };
}

async function audit(env, actor, action, orderId, meta = {}) {
  await env.DB.prepare('INSERT INTO mall_ops_audit (actor,action,seller_id,store_id,product_id,request_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(actor, action, null, null, null, orderId, JSON.stringify(meta).slice(0, 2000), isoNow()).run().catch(() => {});
}

export async function handleOrderOpsRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(BASE)) return null;
  if (!env.DB) return { status: 503, body: { error: 'Mall database is not bound.' } };
  const auth = await authorizeVerificationOperations(request, env);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (request.method === 'GET' && url.pathname === BASE) {
    return { status: 200, body: { ...(await listOrderOps(env, { status: url.searchParams.get('status') || '', limit: url.searchParams.get('limit') })), actor: auth.actor } };
  }
  const detail = url.pathname.match(/^\/api\/internal\/operations\/orders\/([A-Za-z0-9_-]{4,80})\/buyer$/);
  if (request.method === 'GET' && detail) {
    const buyer = await env.DB.prepare('SELECT name,phone,email,postcode,address1,address2,memo FROM order_buyers WHERE order_id=?').bind(detail[1]).first();
    if (!buyer) return { status: 404, body: { error: '받는 분 정보가 없습니다.' } };
    await audit(env, auth.actor, 'order.buyer.viewed', detail[1]);
    return { status: 200, body: { buyer } };
  }
  const retry = url.pathname.match(/^\/api\/internal\/operations\/orders\/([A-Za-z0-9_-]{4,80})\/retry-supply$/);
  if (request.method === 'POST' && retry) {
    // 실패(failed)만 재시도한다. 응답불명(unknown)은 이중 발주 위험이 있어 도매꾹 구매내역 확인 후 수동 처리.
    const row = await env.DB.prepare('SELECT id,status FROM supplier_orders WHERE order_id=?').bind(retry[1]).first();
    if (!row) return { status: 404, body: { error: '발주 기록이 없습니다. 결제완료 주문은 10분 안에 자동 발주됩니다.' } };
    if (row.status !== 'failed') return { status: 409, body: { error: row.status === 'unknown' ? '응답불명 발주는 이중 발주 방지를 위해 도매꾹 구매내역을 먼저 확인해 주세요.' : `재시도할 수 없는 상태입니다(${row.status}).` } };
    await env.DB.prepare("UPDATE supplier_orders SET last_error='EMONEY_SHORT: manual retry',updated_at=? WHERE id=?").bind(isoNow(), row.id).run();
    await audit(env, auth.actor, 'order.supply.retry_requested', retry[1]);
    return { status: 202, body: { ok: true, message: '다음 자동 실행(10분 이내)에 다시 발주합니다.' } };
  }
  return { status: 404, body: { error: 'Order ops route not found.' } };
}
