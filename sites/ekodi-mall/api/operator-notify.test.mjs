import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { deliverOperatorNotices, buildImmediateNotice, isImmediate, kst, NOTIFY_SINCE } from './operator-notify.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./migrations/0019_mall_ops_alerts.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('./migrations/0029_ops_alert_notify.sql', import.meta.url), 'utf8'));
  db.exec("CREATE TABLE orders (id TEXT, status TEXT, paid_at TEXT)");
  const wrap = (sql) => ({ bind: (...a) => ({
    all: async () => ({ results: db.prepare(sql).all(...a) }),
    first: async () => db.prepare(sql).get(...a) ?? null,
    run: async () => db.prepare(sql).run(...a)
  }), all: async () => ({ results: db.prepare(sql).all() }), first: async () => db.prepare(sql).get() ?? null, run: async () => db.prepare(sql).run() });
  return { db, DB: { prepare: wrap } };
}
const add = (db, kind, severity, created, extra = '') => db.prepare(`INSERT INTO mall_ops_alerts (severity,kind,order_id,product_id,message,status,occurrences,created_at,updated_at) VALUES (?,?,?,NULL,?,'open',1,?,?)`).run(severity, kind, 'mall_o1', `메시지 ${extra}`, created, created);

test('immediate kinds and noise separation', () => {
  assert.equal(isImmediate({ kind: 'order.paid', severity: 'info' }), true);
  assert.equal(isImmediate({ kind: 'supply.order_needed', severity: 'warn' }), true);
  assert.equal(isImmediate({ kind: 'payment.refund_recorded', severity: 'info' }), true);
  assert.equal(isImmediate({ kind: 'supply.unavailable', severity: 'warn' }), false);
  assert.equal(isImmediate({ kind: 'anything', severity: 'error' }), true);
});

test('sends only new immediate alerts once, skips backlog, never leaks PII', async () => {
  const { db, DB } = d1();
  add(db, 'supply.order_needed', 'warn', '2026-10-27T00:00:00.000Z', 'old');      // backlog before NOTIFY_SINCE
  add(db, 'order.paid', 'info', '2026-11-11T01:00:00.000Z', '010-1234-5678 a@b.co');
  add(db, 'supply.order_needed', 'warn', '2026-11-11T01:00:00.000Z');
  add(db, 'supply.unavailable', 'warn', '2026-11-11T01:00:00.000Z');
  const sent = [];
  const env = { DB, OPERATOR_NOTIFY: { notify: async (n) => { sent.push(n); return { ok: true }; } } };
  const r = await deliverOperatorNotices(env, { now: '2026-11-11T02:00:00.000Z' });
  assert.equal(r.sent, 2);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /새 주문 1건 · 발주 필요 1건/);
  assert.doesNotMatch(JSON.stringify(sent[0]), /010-1234-5678|a@b\.co/);
  assert.equal(sent[0].link, 'https://ekodi.kr/ekodimall/order-ops');
  const paid = db.prepare("SELECT status FROM mall_ops_alerts WHERE kind='order.paid'").get();
  assert.equal(paid.status, 'resolved');
  const quiet = db.prepare("SELECT notify_error FROM mall_ops_alerts WHERE kind='supply.unavailable'").get();
  assert.equal(quiet.notify_error, 'digest');
  const old = db.prepare("SELECT notified_at FROM mall_ops_alerts WHERE message LIKE '%old%'").get();
  assert.equal(old.notified_at, null);
  // second run: nothing new
  const r2 = await deliverOperatorNotices(env, { now: '2026-11-11T02:10:00.000Z' });
  assert.equal(r2.sent, 0); assert.equal(sent.length, 1);
  // 12h later: one reminder for the still-open order_needed
  const r3 = await deliverOperatorNotices(env, { now: '2026-11-11T14:10:00.000Z' });
  assert.equal(r3.sent, 1); assert.match(sent[1].lines[0], /12시간 경과/);
  const r4 = await deliverOperatorNotices(env, { now: '2026-11-12T03:00:00.000Z' });
  assert.equal(r4.sent, 0);
});

test('sender not connected keeps alerts pending without burning attempts', async () => {
  const { db, DB } = d1();
  add(db, 'order.paid', 'info', '2026-11-11T01:00:00.000Z');
  const env = { DB, OPERATOR_NOTIFY: { notify: async () => ({ ok: false, code: 'SENDER_NOT_CONNECTED' }) } };
  const r = await deliverOperatorNotices(env, { now: '2026-11-11T02:00:00.000Z' });
  assert.equal(r.waiting, 'SENDER_NOT_CONNECTED');
  const row = db.prepare('SELECT notified_at,notify_attempts,notify_error FROM mall_ops_alerts').get();
  assert.equal(row.notified_at, null); assert.equal(row.notify_attempts, 0); assert.equal(row.notify_error, 'SENDER_NOT_CONNECTED');
});

test('missing binding (staging) is a safe no-op', async () => {
  const { db, DB } = d1();
  add(db, 'order.paid', 'info', '2026-11-11T01:00:00.000Z');
  const r = await deliverOperatorNotices({ DB }, { now: '2026-11-11T02:00:00.000Z' });
  assert.equal(r.waiting, 'BINDING_UNAVAILABLE');
});

test('daily summary once per KST day at 08h', async () => {
  const { db, DB } = d1();
  add(db, 'supply.unavailable', 'warn', '2026-11-11T20:00:00.000Z');
  const sent = [];
  const env = { DB, OPERATOR_NOTIFY: { notify: async (n) => { sent.push(n); return { ok: true }; } } };
  assert.deepEqual(kst('2026-11-11T23:10:00.000Z'), { day: '2026-11-12', hour: 8 });
  const a = await deliverOperatorNotices(env, { now: '2026-11-11T23:10:00.000Z' });
  const b = await deliverOperatorNotices(env, { now: '2026-11-11T23:20:00.000Z' });
  assert.equal(a.daily, true); assert.equal(b.daily, false);
  assert.equal(sent.filter((n) => n.subject.includes('일일 요약')).length, 1);
});

test('wrangler binds the internal RPC entrypoint above the D1 block', () => {
  const toml = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /\[\[services\]\]\nbinding = "OPERATOR_NOTIFY"\nservice = "ekodi-auth-api"\nentrypoint = "OperatorNotifier"/);
  assert.ok(toml.indexOf('OPERATOR_NOTIFY') < toml.indexOf('[[d1_databases]]'));
  assert.ok(NOTIFY_SINCE.startsWith('2026-11-11'));
});
