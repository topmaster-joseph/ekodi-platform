import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleTransactionRehearsal, transactionRehearsalEnabled } from './transaction-rehearsal.js';

class D1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  run() { return this.db.prepare(this.sql).run(...this.args); }
  first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
}

class D1TestDatabase {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new D1Statement(this.db, sql); }
  async batch(statements) { return statements.map((statement) => statement.run()); }
  exec(sql) { this.db.exec(sql); }
  close() { this.db.close(); }
}

function migratedDb() {
  const db = new D1TestDatabase();
  const dir = new URL('./migrations/', import.meta.url);
  for (const name of readdirSync(dir).filter((value) => value.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(name, dir), 'utf8'));
  }
  return db;
}
test('transaction rehearsal is invisible outside staging and requires its one-time token', async () => {
  const db = migratedDb();
  try {
    const request = new Request('https://example.test/api/internal/rehearsal/transaction', { method: 'POST' });
    const production = await handleTransactionRehearsal(request, { DB: db, ENVIRONMENT: 'production', TRANSACTION_REHEARSAL_ENABLED: 'true', TRANSACTION_REHEARSAL_TOKEN: 'secret' });
    assert.equal(production.status, 404);
    assert.equal(transactionRehearsalEnabled({ ENVIRONMENT: 'production', TRANSACTION_REHEARSAL_ENABLED: 'true' }), false);

    const unauthorized = await handleTransactionRehearsal(request, { DB: db, ENVIRONMENT: 'staging', TRANSACTION_REHEARSAL_ENABLED: 'true', TRANSACTION_REHEARSAL_TOKEN: 'secret' });
    assert.equal(unauthorized.status, 401);
  } finally {
    db.close();
  }
});

test('staging rehearsal proves order, synthetic payment, settlement idempotence and cleanup', async () => {
  const db = migratedDb();
  try {
    const env = {
      DB: db,
      ENVIRONMENT: 'staging',
      TRANSACTION_REHEARSAL_ENABLED: 'true',
      TRANSACTION_REHEARSAL_TOKEN: 'one-time-proof-token',
      PAYMENTS_ENABLED: 'false',
    };
    const request = new Request('https://example.test/api/internal/rehearsal/transaction', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ekodi-rehearsal-token': env.TRANSACTION_REHEARSAL_TOKEN },
      body: JSON.stringify({ runId: 'unit-proof-1' }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('network access is forbidden during rehearsal'); };
    let result;
    try { result = await handleTransactionRehearsal(request, env); }
    finally { globalThis.fetch = originalFetch; }
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.cleanup, true);
    assert.equal(result.body.proof.safetyGate.checkoutReady, false);
    assert.ok(result.body.proof.safetyGate.blockers.includes('payments-disabled'));
    assert.equal(result.body.proof.order.status, 'paid');
    assert.equal(result.body.proof.order.feeRatePercent, 10);
    assert.equal(result.body.proof.payment.provider, 'REHEARSAL');
    assert.equal(result.body.proof.payment.status, 'DONE');
    assert.equal(result.body.proof.settlement.status, 'pending');
    assert.equal(result.body.proof.settlement.count, 1);
    assert.equal(result.body.proof.realPaymentExecuted, false);
    assert.equal(result.body.proof.payoutExecuted, false);

    const leftovers = db.prepare("SELECT COUNT(*) AS count FROM seller_profiles WHERE user_id LIKE 'rehearsal-seller:%'").first();
    assert.equal(Number(leftovers.count), 0);
  } finally {
    db.close();
  }
});
