import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildMallProductJsonLd, decorateMallProductResponse, injectProductJsonLd, isMallProductPath, mallProductShareCode,
} from '../mall-product-jsonld.js';

const base = (product = {}, extra = {}) => ({
  id:'p1', status:'published', shareCode:'SHARE1', publicUrl:'https://ekodi.kr/ekodimall/p/SHARE1', checkoutReady:true,
  seller:{ type:'business', displayName:'EKODIBIZ' }, store:{ id:'st1', name:'EKODIBIZ', slug:'ekodibiz', contact:'' },
  product:{ saleType:'direct', category:'general', name:'에코디 텀블러', audience:'', oneLine:'보온·보냉 텀블러', price:15000, stockQuantity:10,
    benefits:[], specs:[], story:'', fulfillment:'', contact:'', affiliateUrl:'', ...product },
  content:{ images:['https://ekodi.kr/assets/t.jpg', 'http://insecure.example/x.jpg'] }, updatedAt:'2026-10-20T01:02:03.000Z', publishedAt:null, ...extra,
});

test('direct-sale product emits Product + Offer with KRW price, InStock and canonical url', () => {
  const ld = buildMallProductJsonLd(base());
  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.name, '에코디 텀블러');
  assert.equal(ld.sku, 'SHARE1');
  assert.equal(ld.url, 'https://ekodi.kr/ekodimall/p/SHARE1');
  assert.equal(ld.description, '보온·보냉 텀블러');
  assert.deepEqual(ld.image, ['https://ekodi.kr/assets/t.jpg']);
  assert.equal(ld.dateModified, '2026-10-20T01:02:03.000Z');
  assert.deepEqual(ld.offers, { '@type':'Offer', price:'15000', priceCurrency:'KRW', url:'https://ekodi.kr/ekodimall/p/SHARE1',
    availability:'https://schema.org/InStock', seller:{ '@type':'Organization', name:'EKODIBIZ' } });
  assert.equal(ld.aggregateRating, undefined);
  assert.equal(ld.review, undefined);
});

test('stock 0 → OutOfStock; unknown stock omits availability; individual seller is a Person', () => {
  assert.equal(buildMallProductJsonLd(base({ stockQuantity:0 })).offers.availability, 'https://schema.org/OutOfStock');
  assert.equal(buildMallProductJsonLd(base({ stockQuantity:null })).offers.availability, undefined);
  const personal = buildMallProductJsonLd(base({}, { seller:{ type:'individual', displayName:'김판매' }, store:null }));
  assert.deepEqual(personal.offers.seller, { '@type':'Person', name:'김판매' });
});

test('affiliate products never get a fabricated offer, rating or review', () => {
  const noPrice = buildMallProductJsonLd(base({ saleType:'affiliate', price:null, affiliateUrl:'https://link.coupang.com/a/x' }));
  assert.equal(noPrice['@type'], 'Product');
  assert.equal(noPrice.offers, undefined);
  const priced = buildMallProductJsonLd(base({ saleType:'affiliate', price:9900, stockQuantity:null }));
  assert.deepEqual(priced.offers, { '@type':'Offer', price:'9900', priceCurrency:'KRW', url:'https://ekodi.kr/ekodimall/p/SHARE1' });
  for (const ld of [noPrice, priced]) {
    assert.doesNotMatch(JSON.stringify(ld), /aggregateRating|"review"|ratingValue/);
  }
  assert.equal(buildMallProductJsonLd({ product:{} }), null);
});

test('path matching and HTML injection are safe and idempotent', () => {
  assert.equal(mallProductShareCode('/ekodimall/p/ABC123'), 'ABC123');
  assert.equal(isMallProductPath('/ekodimall/p/ABC123/'), true);
  assert.equal(isMallProductPath('/ekodimall/store/ABC123'), false);
  assert.equal(isMallProductPath('/ekodimall/p/%3Cscript%3E'), false);
  const ld = buildMallProductJsonLd(base({ name:'</script><b>x' }));
  const html = injectProductJsonLd('<html><head><title>t</title></head><body></body></html>', ld);
  assert.match(html, /<script type="application\/ld\+json" data-ekodi-product-jsonld>/);
  assert.doesNotMatch(html, /<\/script><b>/);
  assert.equal(injectProductJsonLd(html, ld), html);
  const parsed = JSON.parse(html.match(/data-ekodi-product-jsonld>(.*?)<\/script>/s)[1]);
  assert.equal(parsed.name, '</script><b>x');
});

test('server decoration reads the Mall API binding and falls back untouched on any failure', async () => {
  const page = () => new Response('<html><head><title>상품</title></head><body></body></html>', { status:200, headers:{ 'content-type':'text/html; charset=utf-8' } });
  const request = new Request('https://ekodi.kr/ekodimall/p/SHARE1?ref=x');
  let seen = '';
  const env = { MALL_API:{ async fetch(req) { seen = new URL(req.url).pathname; return Response.json({ product:base({ stockQuantity:0 }) }); } } };
  const decorated = await (await decorateMallProductResponse(page(), request, env)).text();
  assert.equal(seen, '/api/public/products/SHARE1');
  const ld = JSON.parse(decorated.match(/data-ekodi-product-jsonld>(.*?)<\/script>/s)[1]);
  assert.equal(ld.offers.availability, 'https://schema.org/OutOfStock');
  assert.equal(ld.url, 'https://ekodi.kr/ekodimall/p/SHARE1');

  const missing = await (await decorateMallProductResponse(page(), request, { MALL_API:{ fetch:async () => new Response('{}', { status:404 }) } })).text();
  assert.doesNotMatch(missing, /ld\+json/);
  const throwing = await (await decorateMallProductResponse(page(), request, { MALL_API:{ fetch:async () => { throw new Error('down'); } } })).text();
  assert.doesNotMatch(throwing, /ld\+json/);
  const unbound = await (await decorateMallProductResponse(page(), request, {})).text();
  assert.doesNotMatch(unbound, /ld\+json/);
  const mismatch = await (await decorateMallProductResponse(page(), request, { MALL_API:{ fetch:async () => Response.json({ product:base({}, { shareCode:'OTHER1' }) }) } })).text();
  assert.doesNotMatch(mismatch, /ld\+json/);
});

test('site-worker injects JSON-LD for public product pages before the generic Pages proxy', () => {
  const source = fs.readFileSync(new URL('../site-worker.js', import.meta.url), 'utf8');
  const product = source.indexOf('isMallProductPath(url.pathname)) return decorateMallProductResponse(await proxyMallService(request), request, env)');
  const proxy = source.indexOf('if (isMallPath(url.pathname)) return proxyMallService(request);');
  assert.ok(product > 0 && proxy > product);
  assert.match(fs.readFileSync(new URL('../wrangler.site.toml', import.meta.url), 'utf8'), /binding = "MALL_API"/);
});
