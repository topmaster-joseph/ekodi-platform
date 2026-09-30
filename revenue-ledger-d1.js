import { allocateRealizedRevenue, normalizeRealizedRevenue } from './revenue-ledger-core.js';

export async function ensureRevenueLedger(db) {
  if (!db?.prepare || !db?.batch) throw new TypeError('D1 database is required');
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS realized_revenue_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      external_ref TEXT NOT NULL,
      source TEXT NOT NULL,
      tenant_key TEXT NOT NULL DEFAULT '',
      site_key TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL,
      gross INTEGER NOT NULL,
      fee INTEGER NOT NULL,
      net INTEGER NOT NULL,
      status TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      confirmed_at TEXT,
      reversed_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS realized_revenue_provider_ref
      ON realized_revenue_events(provider, external_ref)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS realized_revenue_scope_time
      ON realized_revenue_events(status, tenant_key, site_key, occurred_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS realized_revenue_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      recipient TEXT NOT NULL,
      bps INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(event_id, recipient),
      FOREIGN KEY(event_id) REFERENCES realized_revenue_events(id) ON DELETE CASCADE
    )`),
  ]);
}

function iso(value = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('invalid date');
  return date.toISOString();
}

function assertSame(existing, event) {
  if (String(existing.provider) !== event.provider
      || String(existing.external_ref) !== event.externalRef
      || String(existing.currency) !== event.currency
      || Number(existing.gross) !== event.gross
      || Number(existing.fee) !== event.fee
      || Number(existing.net) !== event.net) {
    throw new Error('REVENUE_IDEMPOTENCY_CONFLICT');
  }
}

export async function recordProviderRevenue(db, input = {}) {
  await ensureRevenueLedger(db);
  const event = normalizeRealizedRevenue(input);
  const now = iso();
  const occurredAt = iso(input.occurredAt || now);
  const confirmedAt = event.status === 'confirmed' ? now : null;
  await db.prepare(`INSERT OR IGNORE INTO realized_revenue_events
    (event_key,provider,external_ref,source,tenant_key,site_key,currency,gross,fee,net,status,
      occurred_at,confirmed_at,metadata_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(event.eventKey,event.provider,event.externalRef,event.source,event.tenantKey,event.siteKey,event.currency,
      event.gross,event.fee,event.net,event.status,occurredAt,confirmedAt,
      JSON.stringify(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),now,now).run();
  const row = await db.prepare('SELECT * FROM realized_revenue_events WHERE event_key=?').bind(event.eventKey).first();
  if (!row) throw new Error('REVENUE_PERSIST_FAILED');
  assertSame(row,event);
  return row;
}

export async function confirmProviderRevenue(db, eventKey, metadata = {}) {
  await ensureRevenueLedger(db);
  const key = String(eventKey || '').trim().slice(0,220);
  if (!key) throw new TypeError('eventKey is required');
  const row = await db.prepare('SELECT * FROM realized_revenue_events WHERE event_key=?').bind(key).first();
  if (!row) throw new Error('REVENUE_EVENT_NOT_FOUND');
  if (row.status === 'reversed') throw new Error('REVERSED_REVENUE_CANNOT_CONFIRM');
  if (row.status === 'confirmed') return row;
  let prior = {};
  try { prior = JSON.parse(row.metadata_json || '{}'); } catch {}
  const now = iso();
  await db.prepare(`UPDATE realized_revenue_events
    SET status='confirmed',confirmed_at=?,metadata_json=?,updated_at=? WHERE event_key=? AND status='pending'`)
    .bind(now,JSON.stringify({ ...prior, ...(metadata || {}) }),now,key).run();
  return db.prepare('SELECT * FROM realized_revenue_events WHERE event_key=?').bind(key).first();
}

export async function reverseProviderRevenue(db, eventKey, reason = '') {
  await ensureRevenueLedger(db);
  const key = String(eventKey || '').trim().slice(0,220);
  if (!key) throw new TypeError('eventKey is required');
  const row = await db.prepare('SELECT * FROM realized_revenue_events WHERE event_key=?').bind(key).first();
  if (!row) throw new Error('REVENUE_EVENT_NOT_FOUND');
  if (row.status === 'reversed') return row;
  let prior = {};
  try { prior = JSON.parse(row.metadata_json || '{}'); } catch {}
  const now = iso();
  await db.prepare(`UPDATE realized_revenue_events
    SET status='reversed',reversed_at=?,metadata_json=?,updated_at=? WHERE event_key=?`)
    .bind(now,JSON.stringify({ ...prior, reversalReason:String(reason || '').trim().slice(0,300) }),now,key).run();
  return db.prepare('SELECT * FROM realized_revenue_events WHERE event_key=?').bind(key).first();
}

export async function allocateConfirmedRevenue(db, eventKey, splits) {
  await ensureRevenueLedger(db);
  const key = String(eventKey || '').trim().slice(0,220);
  const event = await db.prepare('SELECT * FROM realized_revenue_events WHERE event_key=?').bind(key).first();
  if (!event) throw new Error('REVENUE_EVENT_NOT_FOUND');
  if (event.status !== 'confirmed') throw new Error('REVENUE_NOT_CONFIRMED');
  const allocations = allocateRealizedRevenue(Number(event.net),splits);
  const now = iso();
  await db.prepare('DELETE FROM realized_revenue_allocations WHERE event_id=?').bind(event.id).run();
  await db.batch(allocations.map(item => db.prepare(`INSERT INTO realized_revenue_allocations
    (event_id,recipient,bps,amount,created_at) VALUES (?,?,?,?,?)`)
    .bind(event.id,item.recipient,item.bps,item.amount,now)));
  return allocations;
}

export async function realizedRevenueSummary(db, filters = {}) {
  await ensureRevenueLedger(db);
  const clauses = ["status='confirmed'"];
  const values = [];
  if (filters.tenantKey) { clauses.push('tenant_key=?'); values.push(String(filters.tenantKey).slice(0,160)); }
  if (filters.siteKey) { clauses.push('site_key=?'); values.push(String(filters.siteKey).slice(0,120)); }
  if (filters.from) { clauses.push('occurred_at>=?'); values.push(iso(filters.from)); }
  if (filters.to) { clauses.push('occurred_at<?'); values.push(iso(filters.to)); }
  const result = await db.prepare(`SELECT currency,source,COUNT(*) event_count,
      SUM(gross) gross,SUM(fee) fee,SUM(net) net
    FROM realized_revenue_events WHERE ${clauses.join(' AND ')}
    GROUP BY currency,source ORDER BY currency,source`).bind(...values).all();
  return result.results || [];
}
