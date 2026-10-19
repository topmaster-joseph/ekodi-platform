import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { resolveChargeOutcome, reconcileStaleCharges, cycleDateFromKey } from '../billing-charge-reconciliation.js';
import { runMembershipBillingSchedule } from '../membership-billing.js';
import { runAuthorBillingSchedule } from '../author-billing-control.js';

// Minimal D1 shim over node:sqlite (same shape as other repository tests).
class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  get stmt() { return this.db.prepare(this.sql); } // prepare lazily, like D1 batches
  async first() { return this.stmt.get(...this.args) ?? null; }
  async all() { return { results:this.stmt.all(...this.args) }; }
  async run() { const r = this.stmt.run(...this.args); return { meta:{ changes:r.changes } }; }
}
class D1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new Statement(this.db, sql); }
  async batch(statements) { const out = []; for (const s of statements) out.push(await s.run()); return out; }
}

const ENC_KEY = 'test-only-encryption-key';
async function encrypt(value) {
  const key = await webcrypto.subtle.importKey('raw', await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(ENC_KEY)), { name:'AES-GCM' }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = await webcrypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(value));
  const b64 = (bytes) => Buffer.from(bytes).toString('base64');
  return { cipher:b64(new Uint8Array(cipher)), iv:b64(iv) };
}

// Fake Toss endpoint. `charge` decides what POST /billing/{key} does.
function installToss({ charge, orders = new Map() }) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ method:init.method || 'GET', path:u.pathname });
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers:{ 'content-type':'application/json' } });
    if (u.pathname.startsWith('/v1/billing/') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      return charge(body, orders, reply);
    }
    const m = u.pathname.match(/^\/v1\/payments\/orders\/(.+)$/);
    if (m) {
      const found = orders.get(decodeURIComponent(m[1]));
      return found ? reply(200, found) : reply(404, { code:'NOT_FOUND_PAYMENT', message:'not found' });
    }
    return reply(500, { message:'unexpected' });
  };
  return calls;
}

const baseEnv = (db) => ({ DB:new D1(db), TOSS_BILLING_CLIENT_KEY:'ck', TOSS_BILLING_SECRET_KEY:'sk', MEMBERSHIP_BILLING_ENCRYPTION_KEY:ENC_KEY });
const DUE = '2026-10-01T00:00:00.000Z';

async function seedMembership() {
  const db = new DatabaseSync(':memory:');
  const env = baseEnv(db);
  await runMembershipBillingSchedule({ DB:env.DB }); // creates schema, billing not ready
  const { cipher, iv } = await encrypt('bk_test');
  db.prepare(`INSERT INTO service_subscriptions (subject_type,subject_key,site,plan_id,status,monthly_fee,provider,provider_customer_key,
    billing_key_cipher,billing_key_iv,current_period_start,current_period_end,next_billing_at,cancel_at_period_end,created_at,updated_at)
    VALUES ('person','u1','marketing','plus','active',39900,'toss','cust_1',?,?,'2026-09-01T00:00:00.000Z',?,?,0,?,?)`)
    .run(cipher, iv, DUE, DUE, DUE, DUE);
  return { db, env };
}

test('cycle date is parsed from the trailing segment of the cycle key', () => {
  assert.equal(cycleDateFromKey('renew:12:2026-10-01'), '2026-10-01');
  assert.equal(cycleDateFromKey('renew:user:with:colons:2026-10-01'), '2026-10-01');
});

test('outcome resolution: network loss after Toss captured money is DONE, never failed', async () => {
  const r = await resolveChargeOutcome({ error:new TypeError('fetch failed'), orderId:'o1', lookup:async () => ({ status:'DONE', paymentKey:'pk' }) });
  assert.equal(r.outcome, 'done');
  assert.equal(r.payment.paymentKey, 'pk');
});

test('outcome resolution: ambiguous network loss with no provider record stays unknown', async () => {
  const notFound = Object.assign(new Error('nf'), { status:404, data:{ code:'NOT_FOUND_PAYMENT' } });
  const r = await resolveChargeOutcome({ error:new TypeError('fetch failed'), orderId:'o1', lookup:async () => { throw notFound; } });
  assert.equal(r.outcome, 'unknown');
  assert.match(r.detail, /^pending_reconcile:/);
});

test('outcome resolution: explicit card rejection with no capture is a definite failure', async () => {
  const rejected = Object.assign(new Error('reject'), { status:400, data:{ code:'REJECT_CARD_PAYMENT' } });
  const notFound = Object.assign(new Error('nf'), { status:404, data:{ code:'NOT_FOUND_PAYMENT' } });
  const r = await resolveChargeOutcome({ error:rejected, orderId:'o1', lookup:async () => { throw notFound; } });
  assert.equal(r.outcome, 'failed');
});

test('outcome resolution: provider 5xx and lookup outage stays unknown', async () => {
  const r = await resolveChargeOutcome({ error:Object.assign(new Error('x'), { status:503 }), orderId:'o1', lookup:async () => { throw new TypeError('down'); } });
  assert.equal(r.outcome, 'unknown');
});

test('outcome resolution: in-flight provider status is not treated as success or failure', async () => {
  const r = await resolveChargeOutcome({ payment:{ status:'IN_PROGRESS' }, orderId:'o1', lookup:async () => ({ status:'IN_PROGRESS' }) });
  assert.equal(r.outcome, 'unknown');
});

test('membership: timeout after capture renews the period instead of demoting the paying member', async () => {
  const { db, env } = await seedMembership();
  installToss({ charge:(body, orders) => { orders.set(body.orderId, { status:'DONE', paymentKey:'pk_ok', orderId:body.orderId }); throw new TypeError('network reset'); } });
  const result = await runMembershipBillingSchedule(env);
  const sub = db.prepare('SELECT status,next_billing_at FROM service_subscriptions').get();
  const ev = db.prepare('SELECT status,provider_payment_key FROM billing_charge_events').get();
  assert.equal(result.processed, 1);
  assert.equal(sub.status, 'active');
  assert.equal(sub.next_billing_at.slice(0, 10), '2026-11-01');
  assert.deepEqual({ ...ev }, { status:'done', provider_payment_key:'pk_ok' });
});

test('membership: unresolved outcome stays processing and is NOT demoted to past_due', async () => {
  const { db, env } = await seedMembership();
  installToss({ charge:() => { throw new TypeError('network reset'); } });
  const result = await runMembershipBillingSchedule(env);
  const sub = db.prepare('SELECT status FROM service_subscriptions').get();
  const ev = db.prepare('SELECT status,detail FROM billing_charge_events').get();
  assert.equal(result.pendingReconcile, 1);
  assert.equal(sub.status, 'active');
  assert.equal(ev.status, 'processing');
  assert.match(ev.detail, /^pending_reconcile:/);
});

test('membership: definite card rejection still becomes past_due (no regression)', async () => {
  const { db, env } = await seedMembership();
  installToss({ charge:(body, orders, reply) => reply(400, { code:'REJECT_CARD_PAYMENT', message:'한도초과' }) });
  await runMembershipBillingSchedule(env);
  assert.equal(db.prepare('SELECT status FROM service_subscriptions').get().status, 'past_due');
  assert.equal(db.prepare('SELECT status FROM billing_charge_events').get().status, 'failed');
});

test('membership: rerunning the schedule never charges the same cycle twice', async () => {
  const { db, env } = await seedMembership();
  const calls = installToss({ charge:() => { throw new TypeError('network reset'); } });
  await runMembershipBillingSchedule(env);
  await runMembershipBillingSchedule(env);
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billing_charge_events').get().n, 1);
});

test('reconciliation: stale processing row confirmed DONE by provider advances the period', async () => {
  const { db, env } = await seedMembership();
  installToss({ charge:() => { throw new TypeError('network reset'); } });
  await runMembershipBillingSchedule(env);
  const ev = db.prepare('SELECT order_id FROM billing_charge_events').get();
  const orders = new Map([[ev.order_id, { status:'DONE', paymentKey:'pk_late' }]]);
  installToss({ charge:() => { throw new Error('must not charge again'); }, orders });
  const later = new Date(Date.now() + 11 * 60 * 1000);
  const summary = await reconcileStaleCharges({ db:env.DB, now:later, addMonth:(v) => { const d = new Date(v); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString(); },
    lookup:async (id) => { const r = await fetch(`https://api.tosspayments.com/v1/payments/orders/${id}`); if (!r.ok) throw Object.assign(new Error('x'), { status:r.status, data:await r.json() }); return r.json(); },
    chargeTable:'billing_charge_events', subscriptionTable:'service_subscriptions', chargeOwnerColumn:'subscription_id', subscriptionKeyColumn:'id' });
  assert.equal(summary.settledDone, 1);
  assert.equal(db.prepare('SELECT status FROM billing_charge_events').get().status, 'done');
  assert.equal(db.prepare('SELECT next_billing_at FROM service_subscriptions').get().next_billing_at.slice(0, 10), '2026-11-01');
});

test('reconciliation: stale row with no provider payment becomes failed and past_due', async () => {
  const { db, env } = await seedMembership();
  installToss({ charge:() => { throw new TypeError('network reset'); } });
  await runMembershipBillingSchedule(env);
  const summary = await reconcileStaleCharges({ db:env.DB, now:new Date(Date.now() + 11 * 60 * 1000), addMonth:(v) => v,
    lookup:async () => { throw Object.assign(new Error('nf'), { status:404, data:{ code:'NOT_FOUND_PAYMENT' } }); },
    chargeTable:'billing_charge_events', subscriptionTable:'service_subscriptions', chargeOwnerColumn:'subscription_id', subscriptionKeyColumn:'id' });
  assert.equal(summary.settledFailed, 1);
  assert.equal(db.prepare('SELECT status FROM service_subscriptions').get().status, 'past_due');
});

test('reconciliation: row unresolved for over 24h is surfaced for human attention', async () => {
  const { env, db } = await seedMembership();
  installToss({ charge:() => { throw new TypeError('network reset'); } });
  await runMembershipBillingSchedule(env);
  const original = console.error; const logged = []; console.error = (...a) => logged.push(a.join(' '));
  try {
    const summary = await reconcileStaleCharges({ db:env.DB, now:new Date(Date.now() + 25 * 60 * 60 * 1000), addMonth:(v) => v,
      lookup:async () => { throw new TypeError('provider down'); },
      chargeTable:'billing_charge_events', subscriptionTable:'service_subscriptions', chargeOwnerColumn:'subscription_id', subscriptionKeyColumn:'id' });
    assert.equal(summary.needsAttention.length, 1);
    assert.ok(logged.some(l => l.includes('[billing-reconcile]')));
    assert.equal(db.prepare('SELECT status FROM service_subscriptions').get().status, 'active');
  } finally { console.error = original; }
});

test('author billing shares the same safe behaviour on timeout after capture', async () => {
  const db = new DatabaseSync(':memory:');
  const env = baseEnv(db);
  await runAuthorBillingSchedule({ DB:env.DB });
  const { cipher, iv } = await encrypt('bk_author');
  db.prepare(`INSERT INTO author_billing_subscriptions (user_id,email,plan_id,status,monthly_fee,provider,provider_customer_key,billing_key_cipher,billing_key_iv,
    current_period_start,current_period_end,next_billing_at,cancel_at_period_end,created_at,updated_at)
    VALUES ('user-1','a@example.com','author','active',9900,'toss','cust_a',?,?,'2026-09-01T00:00:00.000Z',?,?,0,?,?)`).run(cipher, iv, DUE, DUE, DUE, DUE);
  installToss({ charge:(body, orders) => { orders.set(body.orderId, { status:'DONE', paymentKey:'pk_a' }); throw new TypeError('network reset'); } });
  const result = await runAuthorBillingSchedule(env);
  assert.equal(result.processed, 1);
  assert.equal(db.prepare('SELECT status FROM author_billing_subscriptions').get().status, 'active');
  assert.equal(db.prepare('SELECT status FROM author_billing_charge_events').get().status, 'done');
});

test('author billing: unresolved outcome is held in processing (schema-compatible) without demotion', async () => {
  const db = new DatabaseSync(':memory:');
  const env = baseEnv(db);
  await runAuthorBillingSchedule({ DB:env.DB });
  const { cipher, iv } = await encrypt('bk_author');
  db.prepare(`INSERT INTO author_billing_subscriptions (user_id,email,plan_id,status,monthly_fee,provider,provider_customer_key,billing_key_cipher,billing_key_iv,
    current_period_start,current_period_end,next_billing_at,cancel_at_period_end,created_at,updated_at)
    VALUES ('user-1','a@example.com','author','active',9900,'toss','cust_a',?,?,'2026-09-01T00:00:00.000Z',?,?,0,?,?)`).run(cipher, iv, DUE, DUE, DUE, DUE);
  installToss({ charge:() => { throw new TypeError('network reset'); } });
  const result = await runAuthorBillingSchedule(env);
  assert.equal(result.pendingReconcile, 1);
  assert.equal(db.prepare('SELECT status FROM author_billing_subscriptions').get().status, 'active');
  assert.equal(db.prepare('SELECT status FROM author_billing_charge_events').get().status, 'processing');
});
