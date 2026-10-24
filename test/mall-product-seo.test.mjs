import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateMallProductResponse, productSeo, productMetaTags } from '../mall-product-jsonld.js';
import { mallProductItems, collectPublicDiscoveryItems } from '../public-discovery-content.js';

const shell = '<html><head><meta name="description" content="EKODI MALL 개인 판매자 공개상품"><title>상품 | EKODI MALL</title></head><body><main id="publicProduct">loading</main></body></html>';
const product = { shareCode: 'abc123', product: { name: '수제 올리브 비누', oneLine: '천연 올리브유로 만든 저자극 비누', price: 9000, saleType: 'direct', images: ['https://ekodi.kr/ekodimall/api/public/media/a.jpg'] }, seller: { type: 'business', displayName: '에코디' }, checkoutReady: true };
const env = { MALL_API: { fetch: async req => /products\/abc123/.test(req.url) ? new Response(JSON.stringify({ product })) : new Response(JSON.stringify({ products: [{ shareCode: 'abc123', product: product.product, updatedAt: '2026-10-25' }, { shareCode: 'bad code!' }] })) } };

test('product pages get per-product title, description and Open Graph tags server-side', async () => {
  const res = await decorateMallProductResponse(new Response(shell, { headers: { 'content-type': 'text/html' } }), new Request('https://ekodi.kr/ekodimall/p/abc123'), env);
  const html = await res.text();
  assert.match(html, /<title>수제 올리브 비누 \| 에코디몰<\/title>/);
  assert.match(html, /<meta name="description" content="천연 올리브유로 만든 저자극 비누">/);
  assert.match(html, /property="og:title" content="수제 올리브 비누 \| 에코디몰"/);
  assert.match(html, /property="og:url" content="https:\/\/ekodi\.kr\/ekodimall\/p\/abc123"/);
  assert.match(html, /data-ekodi-product-jsonld/);
});

test('meta tags escape attribute content', () => {
  const tags = productMetaTags(productSeo({ product: { name: '"><script>x' } }, { url: 'https://ekodi.kr/ekodimall/p/x' }));
  assert.doesNotMatch(tags, /<script>/);
});

test('mall products flow into the public discovery set (sitemap/llms/IndexNow)', async () => {
  const items = await mallProductItems(env);
  assert.deepEqual(items.map(i => i.url), ['https://ekodi.kr/ekodimall/p/abc123']);
  assert.ok((await collectPublicDiscoveryItems(env)).some(i => i.url === 'https://ekodi.kr/ekodimall/p/abc123'));
  assert.deepEqual(await mallProductItems({}), []);
});
