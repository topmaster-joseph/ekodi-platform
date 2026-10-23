// EKODI AI Social Growth Phase 6 — 에코디몰 공개 상품 페이지(/ekodimall/p/<shareCode>)의 schema.org Product/Offer JSON-LD.
// Site Core(site-worker.js)가 Pages 상품 HTML을 프록시할 때 Mall API 서비스 바인딩(MALL_API)으로 공개 상품을 읽어
// 서버에서 <head>에 JSON-LD를 넣는다. 데이터는 Mall API의 공개 상품 응답에서만 가져오며,
// aggregateRating·review는 절대 만들지 않는다(실제 검증된 리뷰 원장이 없음). 실패하면 원래 HTML을 그대로 돌려준다.

export const MALL_PRODUCT_PATH = /^\/ekodimall\/p\/([^/]+)\/?$/;
const PUBLIC_ORIGIN = 'https://ekodi.kr';
const SCHEMA_IN_STOCK = 'https://schema.org/InStock';
const SCHEMA_OUT_OF_STOCK = 'https://schema.org/OutOfStock';

const text = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function mallProductShareCode(pathname) {
  const match = String(pathname || '').match(MALL_PRODUCT_PATH);
  if (!match) return '';
  let code = '';
  try { code = decodeURIComponent(match[1]); } catch { return ''; }
  return /^[A-Za-z0-9_-]{3,80}$/.test(code) ? code : '';
}

export function isMallProductPath(pathname) {
  return Boolean(mallProductShareCode(pathname));
}

export function mallProductCanonicalUrl(shareCode) {
  return `${PUBLIC_ORIGIN}/ekodimall/p/${encodeURIComponent(shareCode)}`;
}

function httpsImages(content = {}) {
  const raw = [content?.images, content?.imageUrls, content?.image].flat().filter(Boolean);
  return [...new Set(raw.map(item => {
    try { const url = new URL(String(item?.url ?? item)); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
  }).filter(Boolean))].slice(0, 10);
}

function sellerEntity(data) {
  const name = text(data?.store?.name || data?.seller?.displayName, 120);
  if (!name) return null;
  return { '@type':data?.seller?.type === 'individual' ? 'Person' : 'Organization', name };
}

// data: Mall API GET /api/public/products/<shareCode> 응답의 product 객체(공개 투영).
export function buildMallProductJsonLd(data, { canonicalUrl = '' } = {}) {
  const product = data?.product;
  const name = text(product?.name, 200);
  const shareCode = text(data?.shareCode, 80);
  if (!name || !shareCode) return null;
  const url = canonicalUrl || mallProductCanonicalUrl(shareCode);
  const ld = {
    '@context':'https://schema.org',
    '@type':'Product',
    name,
    sku:shareCode,
    url,
  };
  const description = text(product.oneLine || product.audience || product.story, 500);
  if (description) ld.description = description;
  const images = httpsImages(data.content);
  if (images.length) ld.image = images;
  if (text(product.category, 60)) ld.category = text(product.category, 60);
  const seller = sellerEntity(data);
  const price = Number(product.price);
  const priceKnown = product.price !== null && product.price !== undefined && product.price !== '' && Number.isFinite(price) && price > 0;
  if (product.saleType === 'direct' && priceKnown) {
    const offer = { '@type':'Offer', price:String(Math.round(price)), priceCurrency:'KRW', url };
    const stock = product.stockQuantity;
    if (stock !== null && stock !== undefined && Number.isFinite(Number(stock))) offer.availability = Number(stock) > 0 ? SCHEMA_IN_STOCK : SCHEMA_OUT_OF_STOCK;
    if (seller) offer.seller = seller;
    ld.offers = offer;
  } else if (product.saleType === 'affiliate' && priceKnown) {
    // 제휴 상품: 가격이 등록된 경우에만 Offer. 재고·판매자는 외부 판매처 정보라 단정하지 않는다.
    ld.offers = { '@type':'Offer', price:String(Math.round(price)), priceCurrency:'KRW', url };
  }
  const modified = Date.parse(data.updatedAt || '');
  if (Number.isFinite(modified)) ld.dateModified = new Date(modified).toISOString();
  return ld;
}

export function productJsonLdScript(ld) {
  if (!ld) return '';
  const json = JSON.stringify(ld).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<script type="application/ld+json" data-ekodi-product-jsonld>${json}</script>`;
}

export function injectProductJsonLd(html, ld) {
  const source = String(html ?? '');
  const script = productJsonLdScript(ld);
  if (!script || source.includes('data-ekodi-product-jsonld')) return source;
  return source.includes('</head>') ? source.replace('</head>', `${script}\n</head>`) : source;
}

async function readPublicProduct(env, shareCode, timeoutMs) {
  if (!env?.MALL_API?.fetch) return null;
  const request = new Request(`${PUBLIC_ORIGIN}/api/public/products/${encodeURIComponent(shareCode)}`, { headers:{ accept:'application/json' } });
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
  try {
    const response = await Promise.race([env.MALL_API.fetch(request), timeout]);
    if (!response || !response.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.product && typeof body.product === 'object' ? body.product : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// 서버 측 주입. 상품 HTML(GET 200 text/html)일 때만 동작하고, 어떤 실패도 원 응답을 바꾸지 않는다.
export async function decorateMallProductResponse(response, request, env, { timeoutMs = 1500 } = {}) {
  try {
    if (!response || request.method !== 'GET' || response.status !== 200) return response;
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) return response;
    const shareCode = mallProductShareCode(new URL(request.url).pathname);
    if (!shareCode) return response;
    const data = await readPublicProduct(env, shareCode, timeoutMs);
    const ld = data && text(data.shareCode, 80) === shareCode ? buildMallProductJsonLd(data, { canonicalUrl:mallProductCanonicalUrl(shareCode) }) : null;
    if (!ld) return response;
    const script = productJsonLdScript(ld);
    if (typeof HTMLRewriter === 'function') {
      return new HTMLRewriter().on('head', { element(element) { element.append(script, { html:true }); } }).transform(response);
    }
    const html = injectProductJsonLd(await response.text(), ld);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(html, { status:response.status, statusText:response.statusText, headers });
  } catch {
    return response;
  }
}
