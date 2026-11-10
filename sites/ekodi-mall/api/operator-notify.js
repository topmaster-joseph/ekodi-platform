// EKODI-OPERATOR-NOTIFY-001 (2026-11-11 운영자 지시)
// 내부 자동 운영은 그대로 진행하고, 사람이 알아야 할 진행상황만 운영자에게 메시지로 보낸다.
// - 즉시: 새 주문 결제완료·발주 필요·자동발주 실패·결제/환불 이상·심각(error) 알림
// - 재알림: 발주 필요가 12시간 넘게 열려 있으면 1회
// - 하루 1회(KST 08시대): 자동운영 요약(건수만)
// 발송은 서비스 바인딩 OPERATOR_NOTIFY(ekodi-auth-api 의 OperatorNotifier RPC)로만 한다.
// 구매자 개인정보는 메시지에 넣지 않는다(주문관리 화면 링크로 확인).
export const ORDER_OPS_URL = 'https://ekodi.kr/ekodimall/order-ops';
export const NOTIFY_SINCE = '2026-11-11T00:00:00.000Z'; // 이전 누적 알림은 보내지 않는다.
const IMMEDIATE_KINDS = ['order.paid', 'supply.order_needed', 'supply.auto_order_failed', 'supply.auto_order_unknown'];
const IMMEDIATE_PREFIXES = ['payment.'];
const REMIND_KINDS = ['supply.order_needed'];
const REMIND_AFTER_MS = 12 * 3600 * 1000;
const MAX_ATTEMPTS = 6;
const WAITING_CODES = new Set(['SENDER_NOT_CONNECTED', 'SENDER_SEND_SCOPE_REQUIRED', 'NOTIFY_DISABLED', 'MAIL_GOOGLE_NOT_CONFIGURED', 'BINDING_UNAVAILABLE']);
const KIND_LABEL = {
  'order.paid': '새 주문 결제완료', 'supply.order_needed': '발주 필요', 'supply.auto_order_failed': '자동발주 실패',
  'supply.auto_order_unknown': '자동발주 확인 필요', 'supply.unavailable': '공급처 품절·판매중지', 'supply.sync_failed': '공급처 동기화 실패',
  'supply.release_held': '판매 개시 보류', 'supply.release_started': '판매 개시', 'supply.curation_exhausted': '자동 소싱 후보 소진',
  'payment.refund_recorded': '환불 기록', 'payment.reconcile_not_found': '결제 대조 불일치'
};
const PII = /(01[016789][-\s.]?\d{3,4}[-\s.]?\d{4})|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const scrub = (value, max = 220) => String(value ?? '').replace(PII, '[가림]').replace(/\s+/g, ' ').trim().slice(0, max);
export const labelOf = (kind) => KIND_LABEL[kind] || kind;

export function isImmediate(alert) {
  return alert.severity === 'error' || IMMEDIATE_KINDS.includes(alert.kind) || IMMEDIATE_PREFIXES.some((p) => String(alert.kind).startsWith(p));
}

/** KST 날짜와 시(hour). */
export function kst(now) {
  const d = new Date(new Date(now).getTime() + 9 * 3600 * 1000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

export function buildImmediateNotice(fresh, reminders) {
  const lines = [];
  for (const a of fresh) lines.push(`${labelOf(a.kind)} — ${scrub(a.message)}${a.order_id ? ` (주문 ${a.order_id})` : ''}`);
  for (const a of reminders) lines.push(`아직 발주 대기 12시간 경과 — ${scrub(a.message)}${a.order_id ? ` (주문 ${a.order_id})` : ''}`);
  const paid = fresh.filter((a) => a.kind === 'order.paid').length;
  const needs = fresh.filter((a) => a.kind === 'supply.order_needed').length + reminders.length;
  const subject = paid ? `에코디몰 새 주문 ${paid}건${needs ? ` · 발주 필요 ${needs}건` : ''}`
    : needs ? `에코디몰 발주 필요 ${needs}건` : `에코디몰 운영 알림 ${lines.length}건`;
  if (needs) lines.push('도매꾹(ekodibiz@gmail.com)에서 위탁배송으로 발주한 뒤 송장번호를 고객에게 안내해 주세요.');
  return { source: 'mall', subject, lines: lines.slice(0, 30), link: ORDER_OPS_URL };
}

export function buildDailyNotice(rows, orders) {
  const lines = [`최근 24시간 결제완료 주문 ${orders.paid}건 · 발주 대기 ${orders.waiting}건`];
  for (const r of rows) lines.push(`${labelOf(r.kind)} ${r.n}건`);
  if (!rows.length) lines.push('새 자동운영 알림 없음');
  return { source: 'mall', subject: '에코디몰 자동운영 일일 요약', lines, link: ORDER_OPS_URL };
}

async function send(env, notice) {
  if (!env.OPERATOR_NOTIFY?.notify) return { ok: false, code: 'BINDING_UNAVAILABLE' };
  try { return await env.OPERATOR_NOTIFY.notify(notice); } catch (error) { return { ok: false, code: 'RPC_FAILED', detail: scrub(error?.message, 120) }; }
}

export async function deliverOperatorNotices(env, { now = new Date().toISOString(), limit = 20 } = {}) {
  if (!env?.DB) return { skipped: true };
  const out = { sent: 0, waiting: '', failed: 0, daily: false };
  const open = await env.DB.prepare(`SELECT id,severity,kind,order_id,product_id,message,created_at,notified_at,reminded_at,notify_attempts FROM mall_ops_alerts
    WHERE status='open' AND created_at>=? AND (notified_at IS NULL OR (reminded_at IS NULL AND kind IN (${REMIND_KINDS.map(() => '?').join(',')}))) AND notify_attempts<? ORDER BY id LIMIT 200`)
    .bind(NOTIFY_SINCE, ...REMIND_KINDS, MAX_ATTEMPTS).all().catch(() => ({ results: [] }));
  const nowMs = new Date(now).getTime();
  const fresh = [], reminders = [], quiet = [];
  for (const a of open.results || []) {
    if (!a.notified_at) (isImmediate(a) ? fresh : quiet).push(a);
    else if (REMIND_KINDS.includes(a.kind) && !a.reminded_at && nowMs - new Date(a.notified_at).getTime() >= REMIND_AFTER_MS) reminders.push(a);
  }
  // 즉시 대상이 아닌 알림은 일일 요약에서 건수로만 보이므로 개별 발송 표시만 남긴다.
  for (const a of quiet) await env.DB.prepare("UPDATE mall_ops_alerts SET notified_at=?,notify_error='digest' WHERE id=?").bind(now, a.id).run();
  const batchFresh = fresh.slice(0, limit), batchRemind = reminders.slice(0, limit);
  if (batchFresh.length || batchRemind.length) {
    const result = await send(env, buildImmediateNotice(batchFresh, batchRemind));
    if (result?.ok) {
      // 결제완료 안내는 알림으로 끝나는 정보성 항목이므로 보낸 뒤 닫는다. 발주 필요는 발주 처리 때까지 열어 둔다.
      for (const a of batchFresh) await env.DB.prepare(`UPDATE mall_ops_alerts SET notified_at=?,notify_error=''${a.kind === 'order.paid' ? ",status='resolved',resolved_at=?" : ''} WHERE id=?`).bind(...(a.kind === 'order.paid' ? [now, now, a.id] : [now, a.id])).run();
      for (const a of batchRemind) await env.DB.prepare("UPDATE mall_ops_alerts SET reminded_at=? WHERE id=?").bind(now, a.id).run();
      out.sent = batchFresh.length + batchRemind.length;
    } else {
      const code = scrub(result?.code || 'SEND_FAILED', 60);
      const waiting = WAITING_CODES.has(code);
      for (const a of [...batchFresh, ...batchRemind]) {
        await env.DB.prepare(`UPDATE mall_ops_alerts SET notify_error=?, notify_attempts=notify_attempts+? WHERE id=?`).bind(code, waiting ? 0 : 1, a.id).run();
      }
      if (waiting) out.waiting = code; else out.failed = batchFresh.length + batchRemind.length;
    }
  }
  out.daily = await deliverDailySummary(env, now).catch((error) => { console.error('mall daily notice', error?.message); return false; });
  return out;
}

/** KST 8시대 1회 일일 요약. 같은 날 두 번 보내지 않는다(commerce 요약 키는 mall_ops_alerts 의 info 행으로 기록). */
export async function deliverDailySummary(env, now) {
  const { day, hour } = kst(now);
  if (hour !== 8) return false;
  const key = `ops.daily_summary:${day}`;
  const done = await env.DB.prepare("SELECT id FROM mall_ops_alerts WHERE kind=? AND notified_at IS NOT NULL LIMIT 1").bind(key).first().catch(() => null);
  if (done) return false;
  const since = new Date(new Date(now).getTime() - 24 * 3600 * 1000).toISOString();
  const rows = (await env.DB.prepare(`SELECT kind,COUNT(*) n FROM mall_ops_alerts WHERE created_at>=? AND kind NOT LIKE 'ops.daily_summary:%' GROUP BY kind ORDER BY n DESC LIMIT 12`).bind(since).all().catch(() => ({ results: [] }))).results || [];
  const paid = await env.DB.prepare("SELECT COUNT(*) n FROM orders WHERE status='paid' AND paid_at>=?").bind(since).first().catch(() => ({ n: 0 }));
  const waiting = await env.DB.prepare("SELECT COUNT(*) n FROM mall_ops_alerts WHERE kind='supply.order_needed' AND status='open'").first().catch(() => ({ n: 0 }));
  const result = await send(env, buildDailyNotice(rows, { paid: Number(paid?.n || 0), waiting: Number(waiting?.n || 0) }));
  if (!result?.ok) return false;
  await env.DB.prepare("INSERT INTO mall_ops_alerts (severity,kind,order_id,product_id,message,status,occurrences,created_at,updated_at,notified_at) VALUES ('info',?,NULL,NULL,'일일 요약 발송','resolved',1,?,?,?)")
    .bind(key, now, now, now).run();
  return true;
}
