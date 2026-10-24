import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';
import { maskSupplierText, maskPublicProductFields, containsSupplierTrace } from './supplier-mask.js';

test('supplier URLs, item references and API key params are stripped from public text', () => {
  assert.equal(maskSupplierText('대나무 칫솔 https://domeggook.com/55501234 최저가'), '대나무 칫솔 최저가');
  assert.equal(maskSupplierText('원본: domeme.domeggook.com/s/55501234?aid=SECRET'), '원본:');
  assert.equal(maskSupplierText('도매꾹 상품번호: 55501234 정품'), '정품');
  assert.equal(maskSupplierText('www.domeme.com 에서 공급'), '에서 공급');
  assert.equal(maskSupplierText('평범한 상품 설명 2024년형 10개입'), '평범한 상품 설명 2024년형 10개입', 'ordinary text and numbers stay');
  assert.equal(maskSupplierText('https://ekodi.kr/ekodimall/p/abc'), 'https://ekodi.kr/ekodimall/p/abc', 'EKODI own URL stays');
  assert.equal(maskSupplierText(null), null);
  const masked = maskPublicProductFields({ name: 'A https://domeggook.com/1234567', story: '보기 domeggook.co.kr/x', specs: ['도매매 12345678', '크기 10cm'], benefits: ['무료배송'], price: 9900 });
  assert.ok(!containsSupplierTrace(masked));
  assert.equal(masked.price, 9900);
  assert.deepEqual(masked.specs, ['', '크기 10cm']);
  assert.ok(containsSupplierTrace('https://cdn1.domeggook.com/a.jpg'));
  assert.ok(!containsSupplierTrace('에코디몰 엄선 상품'));
});

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
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const detail = { domeggook: {
  basis: { no: '55501234', title: '대나무 칫솔 10개입 domeggook.com/55501234', status: '판매중' },
  price: { dome: 9000, supply: '1+8000', resale: { minumum: 12000 } },
  qty: { inventory: 120, domeMoq: 1, supplyMoq: 1 },
  deli: { supply: { type: '고정', fee: 3000 } },
  thumb: { original: 'https://cdn1.domeggook.com/upload/item/a.jpg' },
  desc: { license: { usable: true, msg: '' }, contents: { item: '' } }
} };
const fakeFetch = async (url) => {
  const u = String(url);
  if (u.startsWith('https://sb.test/auth/v1/user')) return new Response(JSON.stringify({ id: 'u-1', email: 'joseph@ekodi.kr', email_confirmed_at: 't' }), { status: 200 });
  if (u.startsWith('https://domeggook.com/ssl/api/')) return new Response(JSON.stringify(detail), { status: 200 });
  if (u.includes('domeggook.com')) return new Response(JPEG, { status: 200 });
  return new Response('blocked', { status: 403 });
};

test('auto-sourced Domeggook product is exposed only under its EKODI Mall URL', async () => {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const env = { DB: d1(db), SUPABASE_URL: 'https://sb.test', SUPABASE_PUBLISHABLE_KEY: 'k', MALL_BASE_URL: 'https://ekodi.kr/ekodimall',
    ALLOWED_ORIGINS: 'https://ekodi.kr', MALL_EKODIAN_EMAILS: 'joseph@ekodi.kr', DOMEMAE_API_KEY: 'SECRETKEY123',
    MEDIA: { async put() {} } };
  const original = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    const imported = await worker.fetch(new Request('https://x/api/products/import/domeggook', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify({ itemNo: '55501234' }) }), env);
    assert.equal(imported.status, 201, await imported.clone().text());
    // A later manual edit pastes the supplier link into the story — it must still never reach the public.
    db.prepare("UPDATE products SET status='published', published_at='2026-10-25T00:00:00Z', story='원본 https://domeggook.com/main/item/itemView.php?no=55501234&aid=SECRETKEY123 참고'").run();
    const row = db.prepare('SELECT share_code,public_url,supply_item_no FROM products').get();
    assert.equal(row.supply_item_no, '55501234', 'supplier link is kept internally for auto-ordering');
    assert.equal(row.public_url, `https://ekodi.kr/ekodimall/p/${row.share_code}`);
    assert.ok(!row.share_code.includes('55501234'), 'EKODI share code is independent of the supplier item number');

    const res = await worker.fetch(new Request(`https://x/api/public/products/${row.share_code}`), env);
    const text = await res.text();
    assert.equal(res.status, 200, text);
    assert.ok(!containsSupplierTrace(text), `public payload leaks supplier trace: ${text}`);
    assert.ok(!text.includes('SECRETKEY123'));
    assert.ok(!text.includes('55501234'));
    const body = JSON.parse(text);
    const product = body.product || body;
    assert.equal(product.publicUrl, row.public_url);
    for (const image of product.product.images) assert.match(image.url, /^https:\/\/ekodi\.kr\/ekodimall\/api\/public\/media\//);
  } finally {
    globalThis.fetch = original;
  }
});

test('affiliate guard checks values, not field names', async () => {
  const { containsAffiliateSource } = await import('./worker.js');
  assert.equal(containsAffiliateSource({ name: '칫솔', affiliateUrl: '', action: { url: '' } }), false, 'empty affiliateUrl key must not block direct sale');
  assert.equal(containsAffiliateSource({ story: '구매 https://link.coupang.com/a/xyz' }), true);
  assert.equal(containsAffiliateSource({ specs: ['amzn.to/abc'] }), true);
});
