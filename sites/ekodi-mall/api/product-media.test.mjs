import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { uploadProductImage, deleteProductImage, reorderProductImages, servePublicMedia, publicImages, MAX_IMAGES } from './product-media.js';

function d1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind(...values) { args = values; return api; },
        async first() { return stmt.get(...args) ?? null; },
        async run() { stmt.run(...args); return { success: true }; },
        async all() { return { results: stmt.all(...args) }; }
      };
      return api;
    }
  };
}
function r2() {
  const store = new Map();
  return {
    store,
    async put(key, value, opts) { store.set(key, { body: value, type: opts?.httpMetadata?.contentType }); },
    async get(key) { const o = store.get(key); return o ? { body: o.body, httpEtag: '"e"', writeHttpMetadata(h) { h.set('content-type', o.type); } } : null; },
    async delete(key) { store.delete(key); }
  };
}
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE products (id TEXT PRIMARY KEY, seller_id TEXT, images_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT)");
  db.exec("INSERT INTO products (id,seller_id) VALUES ('prd_1','seller_a')");
  return { DB: d1(db), MEDIA: r2(), MALL_BASE_URL: 'https://ekodi.kr/ekodimall' };
}
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const req = (body, type = 'image/jpeg') => new Request('https://x/api/products/prd_1/images', { method: 'POST', body, headers: { 'content-type': type } });

test('owner uploads a JPEG; public URL is under the mall media path', async () => {
  const env = setup();
  const result = await uploadProductImage(env, 'seller_a', 'prd_1', req(JPEG));
  assert.equal(result.status, 201);
  assert.equal(result.body.images.length, 1);
  assert.match(result.body.images[0].url, /^https:\/\/ekodi\.kr\/ekodimall\/api\/public\/media\/ekodimall\/products\/prd_1\/[a-f0-9]{16}\.jpg$/);
  assert.equal(env.MEDIA.store.size, 1);
});

test('other sellers, non-images and oversize files are rejected', async () => {
  const env = setup();
  assert.equal((await uploadProductImage(env, 'seller_b', 'prd_1', req(JPEG))).status, 404);
  assert.equal((await uploadProductImage(env, 'seller_a', 'prd_1', req(new TextEncoder().encode('<svg></svg>'), 'image/svg+xml'))).status, 415);
  assert.equal((await uploadProductImage(env, 'seller_a', 'prd_1', req(new TextEncoder().encode('not an image')))).status, 415);
  const big = new Uint8Array(4 * 1024 * 1024 + 1); big.set(JPEG);
  assert.equal((await uploadProductImage(env, 'seller_a', 'prd_1', req(big))).status, 413);
  assert.equal(env.MEDIA.store.size, 0);
});

test('photo count is capped, delete and reorder work', async () => {
  const env = setup();
  const ids = [];
  for (let i = 0; i < MAX_IMAGES; i++) ids.push((await uploadProductImage(env, 'seller_a', 'prd_1', req(JPEG))).body.images.at(-1).id);
  assert.equal((await uploadProductImage(env, 'seller_a', 'prd_1', req(JPEG))).status, 409);
  const reordered = await reorderProductImages(env, 'seller_a', 'prd_1', [ids[2], ids[0]]);
  assert.deepEqual(reordered.body.images.slice(0, 2).map((i) => i.id), [ids[2], ids[0]]);
  const removed = await deleteProductImage(env, 'seller_a', 'prd_1', ids[2]);
  assert.equal(removed.body.images.length, MAX_IMAGES - 1);
  assert.equal(env.MEDIA.store.size, MAX_IMAGES - 1);
});

test('public media only serves the product prefix', async () => {
  const env = setup();
  const up = await uploadProductImage(env, 'seller_a', 'prd_1', req(JPEG));
  const key = up.body.images[0].url.split('/api/public/media/')[1];
  const ok = await servePublicMedia(env, key, new Request('https://x'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/jpeg');
  assert.match(ok.headers.get('cache-control'), /immutable/);
  for (const bad of ['backups/db.sql', 'ekodimall/products/../../secret', 'other/x.jpg']) {
    assert.equal((await servePublicMedia(env, bad, new Request('https://x'))).status, 404);
  }
  assert.deepEqual(publicImages('not json', null), []);
});
