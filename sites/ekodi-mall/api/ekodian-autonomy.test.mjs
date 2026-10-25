import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker, { isEkodian } from './worker.js';

function d1(db) {
  const wrap = (sql) => {
    const stmt = db.prepare(sql);
    let args = [];
    const api = {
      bind(...v) { args = v.map((x) => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x)); return api; },
      async first() { return stmt.get(...args) ?? null; },
      async run() { stmt.run(...args); return { success: true, meta: { changes: 1 } }; },
      async all() { return { results: stmt.all(...args) }; }
    };
    return api;
  };
  return { prepare: wrap, async batch(list) { for (const s of list) await s.run(); return []; } };
}
function setup() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const env = { DB: d1(db), SUPABASE_URL: 'https://sb.test', SUPABASE_PUBLISHABLE_KEY: 'k', MALL_BASE_URL: 'https://ekodi.kr/ekodimall',
    ALLOWED_ORIGINS: 'https://ekodi.kr', MALL_EKODIAN_EMAILS: 'joseph@ekodi.kr,topmaster.joseph@gmail.com,ekodibiz@gmail.com' };
  return { db, env };
}
function withUser(user, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).startsWith('https://sb.test/auth/v1/user') ? new Response(JSON.stringify(user), { status: 200 }) : original(url);
  return fn().finally(() => { globalThis.fetch = original; });
}
const call = (env, method, path, body) => worker.fetch(new Request(`https://x${path}`, { method, headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env);
const simple = { seller: { type: 'individual', displayName: '판매자' }, product: { saleType: 'direct', name: '청계 햅쌀 10kg', price: 32000, stockQuantity: 5, oneLine: '갓 도정한 햅쌀', fulfillment: '택배 배송' }, content: {} };

test('only Google-verified allowlisted emails are EKODIan', () => {
  const env = { MALL_EKODIAN_EMAILS: 'joseph@ekodi.kr, EKODIBIZ@gmail.com' };
  assert.equal(isEkodian({ email: 'joseph@ekodi.kr', email_confirmed_at: 't' }, env), true);
  assert.equal(isEkodian({ email: 'ekodibiz@gmail.com', confirmed_at: 't' }, env), true);
  assert.equal(isEkodian({ email: 'joseph@ekodi.kr' }, env), false, 'unverified email must not count');
  assert.equal(isEkodian({ email: 'someone@gmail.com', email_confirmed_at: 't' }, env), false);
});

test('EKODIan simple listing: defaults filled, seller auto-verified, checkout gate opens on publish', async () => {
  const { db, env } = setup();
  const user = { id: 'u-ekodian', email: 'joseph@ekodi.kr', email_confirmed_at: '2026-01-01' };
  await withUser(user, async () => {
    const created = await call(env, 'POST', '/api/products', simple);
    assert.equal(created.status, 201);
    const product = (await created.json()).product;
    assert.equal(product.seller.displayName, '에코디몰');
    assert.equal(db.prepare('SELECT direct_sale_status FROM seller_profiles WHERE user_id=?').get('u-ekodian').direct_sale_status, 'verified');
    const published = await call(env, 'POST', `/api/products/${product.id}/publish`);
    assert.equal(published.status, 200);
    assert.equal(db.prepare('SELECT checkout_ready FROM products WHERE id=?').get(product.id).checkout_ready, 1);
    const audits = db.prepare('SELECT action FROM mall_ops_audit ORDER BY id').all().map((r) => r.action);
    assert.deepEqual(audits, ['seller.direct_sale.auto_verified', 'product.checkout_gate.auto_enabled']);
    const pub = await (await worker.fetch(new Request(`https://x/api/public/products/${product.shareCode}`), env)).json();
    assert.equal(pub.product.seller.official, true);
    assert.equal(pub.product.seller.verified, true);
    assert.equal(pub.product.product.contact, 'joseph@ekodi.kr');
  });
});

test('regular sellers keep the human approval gate', async () => {
  const { db, env } = setup();
  const user = { id: 'u-free', email: 'someone@gmail.com', email_confirmed_at: '2026-01-01', user_metadata: { full_name: '홍길동' } };
  await withUser(user, async () => {
    const product = (await (await call(env, 'POST', '/api/products', simple)).json()).product;
    assert.equal(product.seller.displayName, '홍길동');
    await call(env, 'POST', `/api/products/${product.id}/publish`);
    assert.equal(db.prepare('SELECT checkout_ready FROM products WHERE id=?').get(product.id).checkout_ready, 0);
    assert.equal(db.prepare('SELECT direct_sale_status FROM seller_profiles WHERE user_id=?').get('u-free').direct_sale_status, 'pending');
    const pub = await (await worker.fetch(new Request(`https://x/api/public/products/${product.shareCode}`), env)).json();
    assert.equal(pub.product.seller.official, false);
  });
});

test('EKODIan merchant-consigned product records the provider and shows it publicly only with consent', async () => {
  const { db, env } = setup();
  const user = { id: 'u-ekodian', email: 'joseph@ekodi.kr', email_confirmed_at: '2026-01-01' };
  await withUser(user, async () => {
    const body = { ...simple, product: { ...simple.product, source: { kind: 'consigned_merchant', name: '청계상회 홍길동', contact: '010-1234-5678', public: 1 } } };
    const product = (await (await call(env, 'POST', '/api/products', body)).json()).product;
    assert.deepEqual(product.source, { kind: 'consigned_merchant', name: '청계상회 홍길동', contact: '010-1234-5678', public: true });
    await call(env, 'POST', `/api/products/${product.id}/publish`);
    const pub = await (await worker.fetch(new Request(`https://x/api/public/products/${product.shareCode}`), env)).json();
    assert.deepEqual(pub.product.source, { label: '상품 제공', name: '청계상회 홍길동', contact: '010-1234-5678' });
    // 동의 해제 → 비공개, 내부 기록은 유지
    const off = { ...body, product: { ...body.product, source: { ...body.product.source, public: 0 } } };
    await call(env, 'PUT', `/api/products/${product.id}`, off);
    const pub2 = await (await worker.fetch(new Request(`https://x/api/public/products/${product.shareCode}`), env)).json();
    assert.equal(pub2.product.source, null);
    assert.equal(db.prepare('SELECT source_name FROM products WHERE id=?').get(product.id).source_name, '청계상회 홍길동');
  });
});

test('regular sellers cannot set a product source', async () => {
  const { db, env } = setup();
  const user = { id: 'u-free', email: 'someone@gmail.com', email_confirmed_at: '2026-01-01' };
  await withUser(user, async () => {
    const body = { ...simple, product: { ...simple.product, source: { kind: 'consigned_merchant', name: '사칭 상회', contact: '010', public: 1 } } };
    const product = (await (await call(env, 'POST', '/api/products', body)).json()).product;
    assert.equal(db.prepare('SELECT source_kind FROM products WHERE id=?').get(product.id).source_kind, '');
  });
});
