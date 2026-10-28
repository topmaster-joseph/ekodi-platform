import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';
import { parseItemNo, firstPrice, normalizeDomeggookDetail, quoteSalePrice, unitProfit, importBlockers, syncSupplyProducts, probeDomeggookKey, notifySupplyOrder, backfillSupplyImages } from './domeggook-import.js';

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
function setup(extra = {}) {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stored = new Map();
  const env = { DB: d1(db), SUPABASE_URL: 'https://sb.test', SUPABASE_PUBLISHABLE_KEY: 'k', MALL_BASE_URL: 'https://ekodi.kr/ekodimall',
    ALLOWED_ORIGINS: 'https://ekodi.kr', MALL_EKODIAN_EMAILS: 'joseph@ekodi.kr', DOMEMAE_API_KEY: 'SECRETKEY123',
    MEDIA: { async put(key, bytes) { stored.set(key, bytes); } }, ...extra };
  return { db, env, stored };
}
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
function detail({ status = '판매중', supply = '1+8000|10+7500', fee = 3000, inventory = 120, usable = true, moq = 1 } = {}) {
  return { domeggook: {
    basis: { no: '55501234', title: '대나무 칫솔 10개입', status },
    price: { dome: 9000, supply, resale: { minumum: 12000 } },
    qty: { inventory, domeMoq: moq, supplyMoq: moq },
    deli: { supply: { type: '고정', fee }, dome: { type: '고정', fee: 3500 }, feeExtra: { jeju: 3000 } },
    thumb: { original: 'https://cdn1.domeggook.com/upload/item/a.jpg' },
    desc: { license: { usable, msg: '' }, contents: { item: '<p><img src="https://cdn1.domeggook.com/d/1.jpg"><img src="https://evil.example/x.jpg"></p>' } }
  } };
}
function fakeFetch(payload, calls = []) {
  return async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith('https://sb.test/auth/v1/user')) return new Response(JSON.stringify({ id: 'u-1', email: 'joseph@ekodi.kr', email_confirmed_at: 't' }), { status: 200 });
    if (u.startsWith('https://domeggook.com/ssl/api/')) return new Response(JSON.stringify(typeof payload === 'function' ? payload(u) : payload), { status: 200 });
    if (u.includes('domeggook.com')) return new Response(JSON_IMG(), { status: 200 });
    return new Response('blocked', { status: 403 });
  };
}
const JSON_IMG = () => JPEG;
async function withFetch(fn, f) { const o = globalThis.fetch; globalThis.fetch = f; try { return await fn(); } finally { globalThis.fetch = o; } }
const call = (env, method, path, body) => worker.fetch(new Request(`https://x${path}`, { method, headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env);

test('item number parsing and tiered prices', () => {
  assert.equal(parseItemNo('55501234'), '55501234');
  assert.equal(parseItemNo('https://domeggook.com/main/item/itemView.php?no=55501234'), '55501234');
  assert.equal(parseItemNo('https://domeme.domeggook.com/s/55501234'), '55501234');
  assert.equal(parseItemNo('abc'), '');
  assert.equal(firstPrice('1+3800|20+3500'), 3800);
  assert.equal(firstPrice('4,500'), 4500);
  assert.equal(firstPrice(2900), 2900);
  assert.equal(firstPrice(''), null);
});

test('normalize uses dropship (supply) price and fee, license and moq', () => {
  const item = normalizeDomeggookDetail(detail());
  assert.equal(item.market, 'supply');
  assert.equal(item.cost, 8000);
  assert.equal(item.shipping, 3000);
  assert.equal(item.inventory, 120);
  assert.equal(item.licenseUsable, true);
  assert.equal(item.resaleMin, 12000);
  assert.deepEqual(importBlockers(item), []);
  assert.match(importBlockers(normalizeDomeggookDetail(detail({ status: '판매종료' })))[0], /판매종료/);
  assert.match(importBlockers(normalizeDomeggookDetail(detail({ moq: 5 })))[0], /최소구매수량/);
  const price = quoteSalePrice(item, 25);
  assert.equal(price % 100, 0);
  assert.ok(unitProfit(price, 8000, 3000) > 0, 'price must leave a profit after cost, shipping and PG fee');
  assert.equal(quoteSalePrice({ cost: 1000, shipping: 0, resaleMin: 9900 }, 25), 9900, 'respects supplier minimum resale price');
});

test('EKODIan imports a draft with images, supply link and no key leakage; others are refused', async () => {
  const { env, db, stored } = setup();
  const calls = [];
  const res = await withFetch(() => call(env, 'POST', '/api/products/import/domeggook', { itemNo: '55501234' }), fakeFetch(detail(), calls));
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body.product.status, 'draft');
  assert.equal(body.product.product.name, '대나무 칫솔 10개입');
  assert.ok(body.product.product.oneLine && body.product.product.fulfillment);
  assert.equal(body.product.images.length, 2, 'thumb + allowed-host detail image only');
  assert.equal(stored.size, 2);
  assert.ok(!JSON.stringify(body).includes('SECRETKEY123'));
  const row = db.prepare('SELECT supply_provider,supply_item_no,supply_market,supply_cost,supply_shipping,price,stock_quantity FROM products').get();
  assert.deepEqual({ ...row }, { supply_provider: 'domeggook', supply_item_no: '55501234', supply_market: 'supply', supply_cost: 8000, supply_shipping: 3000, price: body.pricing.salePrice, stock_quantity: 50 });
  assert.ok(calls.every((u) => !u.includes('evil.example')));

  // Re-import refreshes price/stock without overwriting seller edits.
  db.prepare("UPDATE products SET name='내가 고친 이름'").run();
  const again = await withFetch(() => call(env, 'POST', '/api/products/import/domeggook', { itemNo: '55501234' }), fakeFetch(detail({ inventory: 7 })));
  assert.equal(again.status, 200);
  const after = db.prepare('SELECT name,stock_quantity FROM products').get();
  assert.equal(after.name, '내가 고친 이름');
  assert.equal(after.stock_quantity, 7);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM products').get().n, 1);

  const other = setup({ MALL_EKODIAN_EMAILS: 'someone@else.kr' });
  const denied = await withFetch(() => call(other.env, 'POST', '/api/products/import/domeggook', { itemNo: '55501234' }), fakeFetch(detail()));
  assert.equal(denied.status, 403);
});

test('no image copy when supplier forbids reuse; unsellable items are rejected', async () => {
  const { env, stored } = setup();
  const res = await withFetch(() => call(env, 'POST', '/api/products/import/domeggook', { itemNo: '55501234' }), fakeFetch(detail({ usable: false })));
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(stored.size, 0);
  assert.match(body.imageNote, /허용하지 않아/);
  const bad = await withFetch(() => call(setup().env, 'POST', '/api/products/import/domeggook', { itemNo: '55501234' }), fakeFetch(detail({ inventory: 0 })));
  assert.equal(bad.status, 422);
});

test('sync sells out and alerts on supplier stop or negative margin; order alert on paid supply order', async () => {
  const { env, db } = setup();
  await withFetch(() => call(env, 'POST', '/api/products/import/domeggook', { itemNo: '55501234' }), fakeFetch(detail()));
  db.prepare("UPDATE products SET status='published', supply_synced_at=NULL").run();
  const ok = await syncSupplyProducts(env, fakeFetch(detail({ inventory: 9 })));
  assert.equal(ok.synced, 1);
  assert.equal(db.prepare('SELECT stock_quantity FROM products').get().stock_quantity, 9);
  db.prepare('UPDATE products SET supply_synced_at=NULL').run();
  const stop = await syncSupplyProducts(env, fakeFetch(detail({ supply: 30000 })));
  assert.equal(stop.soldOut, 1);
  assert.equal(db.prepare('SELECT stock_quantity FROM products').get().stock_quantity, 0);
  const alert = db.prepare("SELECT kind,message FROM mall_ops_alerts WHERE kind='supply.unavailable'").get();
  assert.match(alert.message, /역마진/);

  const product = db.prepare('SELECT id FROM products').get();
  assert.equal(await notifySupplyOrder(env, { id: 'ord_1', product_id: product.id, quantity: 2 }), true);
  assert.match(db.prepare("SELECT message FROM mall_ops_alerts WHERE kind='supply.order_needed'").get().message, /55501234/);
});

test('key probe records ok/failed without the key, at most every 6 hours', async () => {
  const { env, db } = setup();
  const r1 = await probeDomeggookKey(env, async () => new Response(JSON.stringify({ errors: { message: 'invalid aid SECRETKEY123' } }), { status: 200 }));
  assert.equal(r1.ok, false);
  const row = db.prepare("SELECT result_status,metadata_json FROM supplier_connector_checks WHERE external_ref='probe:getItemList'").get();
  assert.equal(row.result_status, 'failed');
  assert.ok(!row.metadata_json.includes('SECRETKEY123'));
  assert.ok(db.prepare("SELECT 1 FROM mall_ops_alerts WHERE kind='supply.key_failed' AND status='open'").get());
  assert.equal((await probeDomeggookKey(env, async () => { throw new Error('should not call'); })).skipped, 'recent');
  db.prepare('DELETE FROM supplier_connector_checks').run();
  const r2 = await probeDomeggookKey(env, async () => new Response(JSON.stringify({ domeggook: { header: { numberOfItems: 3 }, list: { item: [] } } }), { status: 200 }));
  assert.equal(r2.ok, true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mall_ops_alerts WHERE kind='supply.key_failed' AND status='open'").get().n, 0);
});

test('image backfill fills licensed photos, falls back to smaller thumb, holds unlicensed', async () => {
  const { db, env, stored } = setup();
  const ins = (id, itemNo) => db.prepare(`INSERT INTO products (id,seller_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,price,status,images_json,supply_provider,supply_item_no,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, 'u-1', id, 'u', '에코디몰', 'individual', 'direct', 'living', 'n', 1000, 'published', '[]', 'domeggook', itemNo, 't', 't', 't');
  db.exec('PRAGMA foreign_keys=OFF');
  ins('prd_a', '111'); ins('prd_b', '222');
  const big = new Uint8Array(5 * 1024 * 1024); big[0] = 0xff; big[1] = 0xd8;
  const f = async (url) => {
    const u = String(url);
    if (u.startsWith('https://domeggook.com/ssl/api/')) {
      const no = new URL(u).searchParams.get('no');
      const d = detail({ usable: no === '111' });
      d.domeggook.thumb = { original: 'https://img.supplier-cdn.co.kr/o.jpg', large: 'https://img.supplier-cdn.co.kr/l.jpg' };
      d.domeggook.desc.contents.item = '';
      return new Response(JSON.stringify(d), { status: 200 });
    }
    if (u.endsWith('/o.jpg')) return new Response(big, { status: 200 });
    if (u.endsWith('/l.jpg')) return new Response(JPEG, { status: 200 });
    return new Response('no', { status: 404 });
  };
  const r = await backfillSupplyImages(env, f);
  assert.equal(r.filled, 1); assert.equal(r.held, 1);
  const a = db.prepare("SELECT status,images_json FROM products WHERE id='prd_a'").get();
  assert.equal(a.status, 'published'); assert.equal(JSON.parse(a.images_json).length, 1);
  const b = db.prepare("SELECT status,supply_release FROM products WHERE id='prd_b'").get();
  assert.equal(b.status, 'draft'); assert.equal(b.supply_release, 'image_hold');
  assert.equal(stored.size, 1);
  const again = await backfillSupplyImages(env, f);
  assert.equal(again.tried, 0); // 12시간 내 재시도 안 함
});
