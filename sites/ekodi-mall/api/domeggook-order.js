// EKODI-MALL-DOMEGGOOK-AUTOORDER-001
// 에코디몰에서 고객이 결제를 완료한 위탁상품만 도매꾹(도매매)에 자동 발주한다. 선발주는 없다.
// 흐름: 결제완료 주문 → (멱등 행 확보) → 공급처 상품 재확인 → 역마진 차단 → 이머니 잔액 확인
//      → setOrder → getOrderView 로 품목·수량 대조(불일치 시 즉시 구매취소) → 송장 추적 → 환불 시 구매취소.
// 근거: 도매꾹 Private API 문서(setLogin 4.1, setOrder 4.3, getOrderView 4.1, setOrdDeny 1.0, getMyAsset 1.0), 2026-10-25 확인.
// 확인필요: setOrder item[] 칸 의미는 연동 가이드(docx)에만 있어 문서 예시 형식을 기본값으로 쓰고,
//          DOMEGGOOK_ORDER_ITEM_TEMPLATE 변수로 바꿀 수 있게 했다. 발주 직후 실제 주문을 조회해 수량을 대조한다.
import { fetchDomeggookItem, PROVIDER } from './domeggook-import.js';
import { raiseAlert } from './ops-alerts.js';

const ENDPOINT = 'https://domeggook.com/ssl/api/';
const DEFAULT_ITEM_TEMPLATE = '{market}||P||01|{qty}||{sellerMemo}||{deliMemo}';
const TRACK_INTERVAL_MS = 60 * 60 * 1000;
const isoNow = () => new Date().toISOString();
const pipeSafe = (v, max = 120) => String(v ?? '').replace(/[|\r\n]/g, ' ').trim().slice(0, max);

export function autoOrderEnabled(env) {
  return String(env?.DOMEGGOOK_AUTO_ORDER_ENABLED || '').toLowerCase() === 'true'
    && Boolean(env.DOMEMAE_API_KEY && env.DOMEMAE_USER_ID && env.DOMEMAE_PASSWORD);
}

function redact(text, env) {
  let out = String(text || '');
  for (const secret of [env.DOMEMAE_API_KEY, env.DOMEMAE_PASSWORD]) if (secret) out = out.split(String(secret)).join('***');
  return out.slice(0, 300);
}

async function call(env, params, fetchImpl, method = 'POST') {
  const body = new URLSearchParams({ aid: env.DOMEMAE_API_KEY, om: 'json', ...params });
  const res = method === 'GET'
    ? await fetchImpl(`${ENDPOINT}?${body}`, { headers: { accept: 'application/json' } })
    : await fetchImpl(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body });
  const text = await res.text();
  let payload = null; try { payload = JSON.parse(text); } catch {}
  const root = payload?.domeggook && typeof payload.domeggook === 'object' ? payload.domeggook : payload;
  return { ok: res.ok && Boolean(root), status: res.status, root: root || {}, raw: text.slice(0, 300) };
}

function apiError(r, env) {
  const e = r.root?.errors || r.root?.error;
  if (e) return redact(e.message || e.msg || JSON.stringify(e), env);
  if (!r.ok) return redact(`HTTP ${r.status} ${r.raw}`, env);
  return '';
}

export async function login(env, fetchImpl = fetch) {
  const r = await call(env, { ver: '4.1', mode: 'setLogin', id: env.DOMEMAE_USER_ID, pw: env.DOMEMAE_PASSWORD, loginKeep: 'off', ip: env.DOMEGGOOK_CLIENT_IP || '127.0.0.1', device: 'Third Party' }, fetchImpl);
  const sId = r.root?.sId;
  if (!sId) throw new Error(`도매꾹 로그인 실패: ${apiError(r, env) || '세션 없음'}`);
  return { id: env.DOMEMAE_USER_ID, sId: String(sId) };
}

export async function emoneyBalance(env, session, fetchImpl = fetch) {
  const r = await call(env, { ver: '1.0', mode: 'getMyAsset', id: session.id, sId: session.sId }, fetchImpl);
  const total = Number(r.root?.data?.currEmoney?.total);
  return Number.isFinite(total) ? total : null;
}

export function buildItemValue(env, { market, qty, deliMemo }) {
  const template = String(env.DOMEGGOOK_ORDER_ITEM_TEMPLATE || DEFAULT_ITEM_TEMPLATE);
  return template.replaceAll('{market}', market === 'dome' ? 'dome' : 'supply').replaceAll('{qty}', String(qty))
    .replaceAll('{sellerMemo}', '에코디몰 위탁주문').replaceAll('{deliMemo}', pipeSafe(deliMemo, 80));
}

export function buildDeliInfo(buyer) {
  // 문서 예시 순서: 이름|이메일|우편번호|주소|상세주소|휴대폰|전화|회사명
  return [buyer.name, buyer.email, buyer.postcode, buyer.address1, buyer.address2, buyer.phone, buyer.phone, ''].map((v) => pipeSafe(v)).join('|');
}

async function orderView(env, session, supplierOrderNo, fetchImpl) {
  const r = await call(env, { ver: '4.1', mode: 'getOrderView', id: session.id, sId: session.sId, for: 'buy', no: String(supplierOrderNo) }, fetchImpl, 'GET');
  const raw = r.root?.items;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return item && typeof item === 'object' ? item : null;
}

async function denyOrder(env, session, supplierOrderNo, memo, fetchImpl) {
  const r = await call(env, { ver: '1.0', mode: 'setOrdDeny', id: session.id, sId: session.sId, type: 'buy', no: String(supplierOrderNo), memo }, fetchImpl);
  return String(r.root?.result || '').toLowerCase();
}

async function setRow(env, id, fields) {
  const keys = Object.keys(fields);
  await env.DB.prepare(`UPDATE supplier_orders SET ${keys.map((k) => `${k}=?`).join(',')},updated_at=? WHERE id=?`)
    .bind(...keys.map((k) => fields[k]), isoNow(), id).run();
}

/** 결제 완료된 위탁 주문을 발주한다. 한 번의 cron 에서 최대 limit 건. */
export async function placeSupplierOrders(env, fetchImpl = fetch, limit = 3) {
  if (!autoOrderEnabled(env) || !env.DB) return { skipped: 'disabled' };
  const due = await env.DB.prepare(`SELECT o.id,o.product_id,o.quantity,o.seller_settlement_amount,p.supply_item_no,p.supply_market,p.name,s.id AS so_id,s.last_error
    FROM orders o JOIN products p ON p.id=o.product_id LEFT JOIN supplier_orders s ON s.order_id=o.id
    WHERE o.status='paid' AND p.supply_provider=? AND (s.id IS NULL OR (s.status='failed' AND s.last_error LIKE 'EMONEY_SHORT%'))
    ORDER BY o.paid_at LIMIT ?`).bind(PROVIDER, limit).all();
  const rows = due.results || [];
  if (!rows.length) return { placed: 0 };
  let session;
  try { session = await login(env, fetchImpl); }
  catch (error) { await raiseAlert(env, { severity: 'error', kind: 'supply.login_failed', message: redact(error.message, env) }); return { placed: 0, error: 'login' }; }
  const summary = { placed: 0, failed: 0, unknown: 0 };
  for (const o of rows) {
    const now = isoNow();
    let soId = o.so_id;
    if (!soId) {
      soId = `so_${crypto.randomUUID().replaceAll('-', '')}`;
      try {
        await env.DB.prepare(`INSERT INTO supplier_orders (id,order_id,product_id,provider,item_no,quantity,status,created_at,updated_at) VALUES (?,?,?,?,?,?, 'placing',?,?)`)
          .bind(soId, o.id, o.product_id, PROVIDER, o.supply_item_no, o.quantity, now, now).run();
      } catch { continue; } // 다른 실행이 이미 잡은 주문
    } else {
      await setRow(env, soId, { status: 'placing', last_error: '' });
    }
    const fail = async (code, message, severity = 'error') => {
      await setRow(env, soId, { status: 'failed', last_error: `${code}: ${message}`.slice(0, 300) });
      await raiseAlert(env, { severity, kind: 'supply.auto_order_failed', orderId: o.id, productId: o.product_id, message: `${o.name}: ${message}` });
      summary.failed += 1;
    };
    const buyer = await env.DB.prepare('SELECT name,phone,email,postcode,address1,address2,memo FROM order_buyers WHERE order_id=?').bind(o.id).first();
    if (!buyer) { await fail('NO_BUYER', '받는 분 정보가 없어 발주할 수 없습니다'); continue; }
    const fetched = await fetchDomeggookItem(env, o.supply_item_no, fetchImpl);
    if (fetched.error) { await fail('ITEM_LOOKUP', fetched.error); continue; }
    const item = fetched.item;
    if (item.status && item.status !== '판매중') { await fail('ITEM_STOPPED', `공급처 판매상태 '${item.status}' — 고객 환불 필요`); continue; }
    if (item.inventory !== null && item.inventory < o.quantity) { await fail('ITEM_STOCK', `공급처 재고 ${item.inventory}개 — 고객 환불 필요`); continue; }
    const cost = (item.cost || 0) * o.quantity + (item.shipping || 0);
    if (!item.cost || cost > Number(o.seller_settlement_amount || 0)) { await fail('NEGATIVE_MARGIN', `공급비 ${cost.toLocaleString('ko-KR')}원이 정산액을 넘어 발주를 멈췄습니다`); continue; }
    const balance = await emoneyBalance(env, session, fetchImpl);
    if (balance !== null && balance < cost) {
      await setRow(env, soId, { status: 'failed', last_error: `EMONEY_SHORT: 잔액 ${balance} < 필요 ${cost}` });
      await raiseAlert(env, { severity: 'error', kind: 'supply.emoney_short', orderId: o.id, message: `도매꾹 이머니 충전 필요: 잔액 ${balance.toLocaleString('ko-KR')}원, 이 주문에 ${cost.toLocaleString('ko-KR')}원 필요. 충전되면 자동으로 발주합니다.` });
      summary.failed += 1;
      continue;
    }
    await setRow(env, soId, { expected_cost: cost });
    let r;
    try {
      r = await call(env, {
        ver: '4.3', mode: 'setOrder', id: session.id, sId: session.sId, receipt: '0', market: item.market === 'dome' ? 'dome' : 'supply',
        [`item[${o.supply_item_no}]`]: buildItemValue(env, { market: item.market, qty: o.quantity, deliMemo: buyer.memo }),
        deliinfo: buildDeliInfo(buyer), ie: 'utf-8', oe: 'utf-8'
      }, fetchImpl);
    } catch {
      // 요청이 공급처에 도달했는지 알 수 없으므로 재시도하지 않는다(이중 발주 방지).
      await setRow(env, soId, { status: 'unknown', last_error: 'NETWORK: 응답 없음' });
      await raiseAlert(env, { severity: 'error', kind: 'supply.auto_order_unknown', orderId: o.id, message: `${o.name}: 발주 응답을 받지 못했습니다. 도매꾹 구매내역에서 확인해 주세요.` });
      summary.unknown += 1;
      continue;
    }
    const orderNoRaw = r.root?.order?.orderNo ?? (Array.isArray(r.root?.order) ? r.root.order[0]?.orderNo : undefined);
    if (String(r.root?.result || '').toUpperCase() !== 'SUCCESS' || !orderNoRaw) { await fail('SET_ORDER', apiError(r, env) || `응답 ${r.status}`); continue; }
    const supplierOrderNo = String(orderNoRaw);
    await setRow(env, soId, { status: 'placed', supplier_order_no: supplierOrderNo, checked_at: isoNow() });
    // 발주 직후 실제 주문서를 조회해 품목·수량을 대조한다.
    const view = await orderView(env, session, supplierOrderNo, fetchImpl).catch(() => null);
    if (view && (String(view.itemNo || '') !== String(o.supply_item_no) || Number(view.orderQty) !== Number(o.quantity))) {
      const result = await denyOrder(env, session, supplierOrderNo, '에코디몰 자동발주 수량·품목 불일치 자동취소', fetchImpl).catch(() => '');
      await setRow(env, soId, { status: 'cancel_requested', last_error: `MISMATCH: item ${view.itemNo} qty ${view.orderQty}; deny=${result}` });
      await raiseAlert(env, { severity: 'error', kind: 'supply.auto_order_mismatch', orderId: o.id, message: `${o.name}: 도매꾹 주문서 수량/품목이 달라 자동 취소했습니다(주문 ${supplierOrderNo}).` });
      summary.failed += 1;
      continue;
    }
    if (view) await setRow(env, soId, { supplier_status: String(view.status || '').slice(0, 40) });
    summary.placed += 1;
  }
  return summary;
}

const SHIPPING = new Set(['WAITOK']);
const DELIVERED = new Set(['WAITRCPT', 'WAITSERV', 'DONE']);
const CANCELLED = new Set(['DENYCONFIRM', 'DENYBUY', 'DENYSELL', 'WAITDENY']);

/** 송장·배송상태 추적 + 고객 환불 시 공급처 구매취소. */
export async function trackSupplierOrders(env, fetchImpl = fetch, limit = 10) {
  if (!autoOrderEnabled(env) || !env.DB) return { skipped: 'disabled' };
  const cutoff = new Date(Date.now() - TRACK_INTERVAL_MS).toISOString();
  const rows = (await env.DB.prepare(`SELECT s.*,o.status AS order_status FROM supplier_orders s JOIN orders o ON o.id=s.order_id
    WHERE s.status IN ('placed','shipping','cancel_requested') AND s.supplier_order_no IS NOT NULL
      AND (s.checked_at IS NULL OR s.checked_at<? OR (o.status='refunded' AND s.status<>'cancel_requested'))
    ORDER BY s.checked_at LIMIT ?`).bind(cutoff, limit).all()).results || [];
  if (!rows.length) return { tracked: 0 };
  let session;
  try { session = await login(env, fetchImpl); } catch { return { tracked: 0, error: 'login' }; }
  const summary = { tracked: 0, shipped: 0, cancelled: 0 };
  for (const s of rows) {
    const now = isoNow();
    const view = await orderView(env, session, s.supplier_order_no, fetchImpl).catch(() => null);
    if (!view) { await setRow(env, s.id, { checked_at: now }); continue; }
    const mode = String(view.statusMode || '').toUpperCase();
    const delivery = view.delivery || {};
    const fields = { checked_at: now, supplier_status: String(view.status || mode).slice(0, 40),
      tracking_code: String(delivery.code || s.tracking_code || '').slice(0, 60), tracking_company: String(delivery.companyName || s.tracking_company || '').slice(0, 60) };
    if (s.order_status === 'refunded' && s.status !== 'cancel_requested' && !SHIPPING.has(mode) && !DELIVERED.has(mode) && !CANCELLED.has(mode)) {
      const result = await denyOrder(env, session, s.supplier_order_no, '고객 결제취소(환불)로 구매취소', fetchImpl).catch(() => '');
      fields.status = 'cancel_requested';
      fields.last_error = `REFUND_CANCEL: ${result}`;
      await raiseAlert(env, { severity: 'warn', kind: 'supply.cancel_requested', orderId: s.order_id, message: `고객 환불로 도매꾹 주문 ${s.supplier_order_no} 구매취소를 신청했습니다(${result || '응답 확인필요'}).` });
    } else if (s.order_status === 'refunded' && (SHIPPING.has(mode) || DELIVERED.has(mode)) && s.status !== 'cancel_requested') {
      fields.status = 'cancel_requested';
      await raiseAlert(env, { severity: 'error', kind: 'supply.refund_after_ship', orderId: s.order_id, message: `고객은 환불됐지만 도매꾹 주문 ${s.supplier_order_no}이 이미 발송됐습니다. 반품 처리가 필요합니다.` });
    } else if (CANCELLED.has(mode)) {
      fields.status = 'cancelled';
      if (s.status !== 'cancel_requested') await raiseAlert(env, { severity: 'error', kind: 'supply.supplier_cancelled', orderId: s.order_id, message: `공급처가 도매꾹 주문 ${s.supplier_order_no}을 취소했습니다(${view.status || mode}). 고객 환불이 필요합니다.` });
      summary.cancelled += 1;
    } else if (DELIVERED.has(mode)) fields.status = 'delivered';
    else if (SHIPPING.has(mode) || fields.tracking_code) { if (s.status === 'placed') summary.shipped += 1; fields.status = 'shipping'; }
    await setRow(env, s.id, fields);
    summary.tracked += 1;
  }
  return summary;
}

/** 로그인·이머니 잔액 확인(6시간 1회, 비밀값·세션은 기록하지 않음). 자동발주 준비상태를 운영자가 볼 수 있게 남긴다. */
export async function probeDomeggookLogin(env, fetchImpl = fetch) {
  if (!autoOrderEnabled(env) || !env.DB) return { skipped: 'disabled' };
  const last = await env.DB.prepare("SELECT checked_at FROM supplier_connector_checks WHERE external_ref='probe:login' ORDER BY checked_at DESC LIMIT 1").first().catch(() => null);
  if (last && Date.now() - Date.parse(last.checked_at) < 6 * 60 * 60 * 1000) return { skipped: 'recent' };
  let ok = false; let meta = {};
  try {
    const session = await login(env, fetchImpl);
    const balance = await emoneyBalance(env, session, fetchImpl);
    ok = true; meta = { login: 'ok', emoney: balance };
    await env.DB.prepare("UPDATE mall_ops_alerts SET status='resolved',resolved_at=?,updated_at=? WHERE status='open' AND kind='supply.login_failed'").bind(isoNow(), isoNow()).run().catch(() => {});
    if (balance !== null && balance < Number(env.DOMEGGOOK_EMONEY_MIN || 30000)) {
      await raiseAlert(env, { severity: 'warn', kind: 'supply.emoney_low', message: `도매꾹 이머니 잔액 ${balance.toLocaleString('ko-KR')}원 — 자동발주를 위해 충전을 권장합니다.` });
    }
  } catch (error) {
    meta = { login: 'failed', error: redact(error.message, env) };
    await raiseAlert(env, { severity: 'error', kind: 'supply.login_failed', message: meta.error });
  }
  await env.DB.prepare('INSERT INTO supplier_connector_checks (id,provider_id,check_type,external_ref,result_status,metadata_json,checked_at) VALUES (?,?,?,?,?,?,?)')
    .bind(`chk_${crypto.randomUUID().replaceAll('-', '')}`, 'domemae-official', 'order_readiness', 'probe:login', ok ? 'ok' : 'failed', JSON.stringify(meta), isoNow()).run().catch(() => {});
  return { ok, ...meta };
}
