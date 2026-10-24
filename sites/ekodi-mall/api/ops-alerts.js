// EKODI-MALL-OPS-ALERTS-001: operator alerts. Never stores secrets or buyer PII;
// messages are short, sanitized diagnostics. One open alert per (kind, order).
const clean = (value, max = 300) => String(value ?? '').replace(/(live|test)_(g?sk|g?ck)_[A-Za-z0-9]+/g, '[key]').replace(/\s+/g, ' ').trim().slice(0, max);

export async function raiseAlert(env, { severity = 'warn', kind, orderId = null, productId = null, message = '' } = {}) {
  if (!env?.DB || !kind) return;
  const now = new Date().toISOString();
  try {
    const open = await env.DB.prepare("SELECT id FROM mall_ops_alerts WHERE status='open' AND kind=? AND COALESCE(order_id,'')=COALESCE(?,'') AND COALESCE(product_id,'')=COALESCE(?,'') LIMIT 1")
      .bind(clean(kind, 80), orderId, productId).first();
    if (open) {
      await env.DB.prepare('UPDATE mall_ops_alerts SET occurrences=occurrences+1, message=?, updated_at=? WHERE id=?').bind(clean(message), now, open.id).run();
      return;
    }
    await env.DB.prepare('INSERT INTO mall_ops_alerts (severity,kind,order_id,product_id,message,status,occurrences,created_at,updated_at) VALUES (?,?,?,?,?,\'open\',1,?,?)')
      .bind(['info', 'warn', 'error'].includes(severity) ? severity : 'warn', clean(kind, 80), orderId, productId, clean(message), now, now).run();
  } catch (error) {
    console.error('mall ops alert', error?.message);
  }
}

export async function resolveAlerts(env, { kind, orderId = null } = {}) {
  if (!env?.DB || !kind) return;
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE mall_ops_alerts SET status='resolved', resolved_at=?, updated_at=? WHERE status='open' AND kind=? AND COALESCE(order_id,'')=COALESCE(?,'')")
    .bind(now, now, kind, orderId).run().catch(() => {});
}

export async function openAlerts(env, limit = 20) {
  try {
    const rows = await env.DB.prepare("SELECT id,severity,kind,order_id AS orderId,product_id AS productId,message,occurrences,created_at AS createdAt,updated_at AS updatedAt FROM mall_ops_alerts WHERE status='open' ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, updated_at DESC LIMIT ?")
      .bind(Math.max(1, Math.min(100, limit))).all();
    return rows.results || [];
  } catch { return []; }
}
