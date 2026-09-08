import { classifyCommerceAction } from './commerce-os.js';

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const eventId = () => `cev_${crypto.randomUUID().replaceAll('-', '')}`;

export async function commerceEventSchemaReady(env) {
  if (!env?.DB) return false;
  try {
    const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='commerce_events'").first();
    return row?.name === 'commerce_events';
  } catch {
    return false;
  }
}

function normalizeEvent(input = {}) {
  const eventType = clean(input.eventType, 120);
  const aggregateType = clean(input.aggregateType, 80);
  const aggregateId = clean(input.aggregateId, 160);
  const actor = clean(input.actor || 'system', 160);
  const idempotencyKey = clean(input.idempotencyKey, 240);
  if (!eventType || !aggregateType || !aggregateId || !idempotencyKey) return null;
  return {
    id: eventId(), eventType, aggregateType, aggregateId, actor, idempotencyKey,
    riskClass: clean(input.riskClass || classifyCommerceAction(input.action || eventType), 20),
    payloadJson: JSON.stringify(input.payload || {}).slice(0, 8000),
    occurredAt: clean(input.occurredAt || nowIso(), 80),
  };
}

export function commerceEventStatement(env, input = {}) {
  const event = normalizeEvent(input);
  if (!env?.DB || !event) return null;
  const statement = env.DB.prepare(`INSERT OR IGNORE INTO commerce_events
    (id,event_type,aggregate_type,aggregate_id,actor,risk_class,idempotency_key,payload_json,occurred_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(event.id,event.eventType,event.aggregateType,event.aggregateId,event.actor,event.riskClass,
      event.idempotencyKey,event.payloadJson,event.occurredAt);
  return { event, statement };
}

export async function appendCommerceEvent(env, input = {}) {
  const prepared = commerceEventStatement(env, input);
  if (!prepared) return { written:false, reason:'invalid-event-or-db' };
  const result = await prepared.statement.run();
  return {
    written:Number(result?.meta?.changes ?? result?.changes ?? 0) > 0,
    id:prepared.event.id,
    occurredAt:prepared.event.occurredAt,
  };
}
export async function listCommerceEvents(env, { limit = 40, riskClass = '' } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 40)));
  const risk = ['green','amber','red'].includes(riskClass) ? riskClass : '';
  const sql = `SELECT id,event_type AS eventType,aggregate_type AS aggregateType,aggregate_id AS aggregateId,
    actor,risk_class AS riskClass,payload_json AS payloadJson,occurred_at AS occurredAt
    FROM commerce_events ${risk ? 'WHERE risk_class=?' : ''} ORDER BY occurred_at DESC LIMIT ?`;
  const result = risk
    ? await env.DB.prepare(sql).bind(risk, safeLimit).all()
    : await env.DB.prepare(sql).bind(safeLimit).all();
  return (result.results || []).map((row) => {
    let payload = {};
    try { payload = JSON.parse(row.payloadJson || '{}'); } catch {}
    return { ...row, payload, payloadJson: undefined };
  });
}
