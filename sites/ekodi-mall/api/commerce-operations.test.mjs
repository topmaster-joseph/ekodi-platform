import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { appendCommerceEvent } from './commerce-events.js';
import { handleCommerceOperationsRequest } from './commerce-operations.js';

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
test('operations cockpit is operator-authenticated and read-only', async () => {
  const db=migratedDb();
  try {
    await appendCommerceEvent({ DB:db }, { eventType:'catalog.observed', aggregateType:'product', aggregateId:'prd_1', actor:'test', action:'catalog.observe', idempotencyKey:'catalog:prd_1', payload:{} });
    const env={ DB:db, MALL_OPERATIONS_TOKEN:'ops-secret', PAYMENT_PROVIDER:'toss', PAYMENTS_ENABLED:'false' };
    const request=new Request('https://mall-api.ekodi.kr/api/internal/operations/cockpit',{ headers:{ 'x-ekodi-mall-ops-token':'ops-secret' } });
    const result=await handleCommerceOperationsRequest(request,env);
    assert.equal(result.status,200);
    assert.equal(result.body.actor,'mall-ops:service-token');
    assert.equal(result.body.cockpit.payment.id,'toss');
    assert.equal(result.body.cockpit.highImpact.paymentsEnabled,false);
    assert.equal(result.body.cockpit.latestEvents.length,1);
    assert.equal(JSON.stringify(result.body).includes('ops-secret'),false);
  } finally { db.close(); }
});

test('operations cockpit preserves auth and red high-impact visibility', async () => {
  const db=migratedDb();
  try {
    const unauth=await handleCommerceOperationsRequest(new Request('https://mall-api.ekodi.kr/api/internal/operations/cockpit'),{ DB:db, MALL_OPERATIONS_EMAILS:'ops@example.com' });
    assert.equal(unauth.status,401);
    const request=new Request('https://mall-api.ekodi.kr/api/internal/operations/cockpit',{ headers:{ 'x-ekodi-mall-ops-token':'ops-secret' } });
    const result=await handleCommerceOperationsRequest(request,{ DB:db, MALL_OPERATIONS_TOKEN:'ops-secret', PAYMENT_PROVIDER:'toss', BUYER_PII_RELEASE_ENABLED:'true' });
    assert.equal(result.status,200);
    assert.equal(result.body.cockpit.status,'attention');
    assert.ok(result.body.cockpit.exceptions.some((item) => item.code === 'buyer-pii-release-enabled' && item.riskClass === 'red'));
  } finally { db.close(); }
});
