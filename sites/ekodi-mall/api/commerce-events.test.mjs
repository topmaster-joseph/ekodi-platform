import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { appendCommerceEvent, commerceEventSchemaReady, listCommerceEvents } from './commerce-events.js';

class D1Statement {
  constructor(db, sql) { this.db=db; this.sql=sql; this.args=[]; }
  bind(...args) { this.args=args; return this; }
  run() { return this.db.prepare(this.sql).run(...this.args); }
  first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  all() { return { results:this.db.prepare(this.sql).all(...this.args) }; }
}
class D1TestDatabase {
  constructor() { this.db=new DatabaseSync(':memory:'); }
  prepare(sql) { return new D1Statement(this.db,sql); }
  async batch(statements) { return statements.map((statement) => statement.run()); }
  exec(sql) { this.db.exec(sql); }
  close() { this.db.close(); }
}
function migratedDb() {
  const db=new D1TestDatabase();
  const dir=new URL('./migrations/', import.meta.url);
  for (const name of readdirSync(dir).filter((value) => value.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(name,dir),'utf8'));
  return db;
}
test('commerce event ledger is migrated and idempotent', async () => {
  const db=migratedDb();
  try {
    assert.equal(await commerceEventSchemaReady({ DB:db }), true);
    const input={ eventType:'order.created', aggregateType:'order', aggregateId:'ord_1', actor:'test', action:'order.prepare', idempotencyKey:'order.created:ord_1', payload:{ amount:1000 } };
    const first=await appendCommerceEvent({ DB:db }, input);
    const second=await appendCommerceEvent({ DB:db }, input);
    assert.equal(first.written, true);
    assert.equal(second.written, false);
    const events=await listCommerceEvents({ DB:db });
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'order.created');
    assert.equal(events[0].riskClass, 'amber');
    assert.deepEqual(events[0].payload, { amount:1000 });
  } finally { db.close(); }
});

test('red commerce events can be filtered without exposing unrelated events', async () => {
  const db=migratedDb();
  try {
    await appendCommerceEvent({ DB:db }, { eventType:'payment.recorded', aggregateType:'order', aggregateId:'ord_2', actor:'test', action:'payment.capture', idempotencyKey:'payment:ord_2', payload:{} });
    await appendCommerceEvent({ DB:db }, { eventType:'catalog.observed', aggregateType:'product', aggregateId:'prd_1', actor:'test', action:'catalog.observe', idempotencyKey:'catalog:prd_1', payload:{} });
    const red=await listCommerceEvents({ DB:db }, { riskClass:'red' });
    assert.equal(red.length, 1);
    assert.equal(red[0].eventType, 'payment.recorded');
  } finally { db.close(); }
});
