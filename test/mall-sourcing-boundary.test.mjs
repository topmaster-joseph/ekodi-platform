import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { normalizeProductInput, containsAffiliateSource } from '../sites/ekodi-mall/api/worker.js';

const base = { seller: { displayName: '에코디' }, product: { name: '수제 비누', contact: '010', saleType: 'direct', stockQuantity: 5, price: 9000 } };

test('direct-sale products reject affiliate (Coupang Partners) sources', () => {
  const viaLink = normalizeProductInput({ ...base, product: { ...base.product, affiliateUrl: 'https://link.coupang.com/a/abc' } });
  assert.ok(viaLink.errors.some(e => /직접판매로 등록할 수 없습니다/.test(e)));
  const viaImage = normalizeProductInput({ ...base, product: { ...base.product, images: ['https://ads-partners.coupang.com/image1/x.jpg'] } });
  assert.ok(viaImage.errors.some(e => /직접판매로 등록할 수 없습니다/.test(e)));
});

test('manual direct-sale and affiliate-type listings are unaffected', () => {
  assert.deepEqual(normalizeProductInput(base).errors, []);
  const aff = normalizeProductInput({ ...base, product: { ...base.product, saleType: 'affiliate', affiliateUrl: 'https://link.coupang.com/a/abc' } });
  assert.ok(!aff.errors.some(e => /직접판매로 등록할 수 없습니다/.test(e)));
  assert.equal(containsAffiliateSource({ img: 'https://ekodi.kr/media/a.jpg' }), false);
});

test('mall direct-sale code never reads the affiliate catalog', async () => {
  const dir = new URL('../sites/ekodi-mall/api/', import.meta.url);
  for (const f of (await readdir(dir)).filter(n => n.endsWith('.js'))) {
    const src = await readFile(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /affiliate_storefront_products/, f);
  }
});
