// EKODI-MALL-PRODUCT-PHOTOS-001: seller product photos stored in R2 (env.MEDIA)
// under a fixed prefix, referenced from products.images_json, served publicly
// only through /api/public/media/<prefix>/... with an immutable cache.
export const MEDIA_PREFIX = 'ekodimall/products/';
export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TYPES = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);

export function parseImages(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter((item) => item && typeof item.key === 'string' && item.key.startsWith(MEDIA_PREFIX)) : [];
  } catch { return []; }
}

export function publicImages(raw, baseUrl) {
  const base = String(baseUrl || 'https://ekodi.kr/ekodimall').replace(/\/$/, '');
  return parseImages(raw).map((item) => ({ id: item.id, url: `${base}/api/public/media/${item.key}`, width: item.width || null, height: item.height || null }));
}

function sniffType(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

function imageId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Owner upload. Returns { status, body }. Caller has already authenticated `sellerId`. */
export async function uploadProductImage(env, sellerId, productId, request) {
  if (!env.MEDIA?.put) return { status: 503, body: { error: '사진 저장소가 연결되지 않았습니다.' } };
  const row = await env.DB.prepare('SELECT id,images_json FROM products WHERE id=? AND seller_id=?').bind(productId, sellerId).first();
  if (!row) return { status: 404, body: { error: '상품을 찾을 수 없습니다.' } };
  const images = parseImages(row.images_json);
  if (images.length >= MAX_IMAGES) return { status: 409, body: { error: `사진은 최대 ${MAX_IMAGES}장까지 등록할 수 있습니다.` } };
  const declared = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_IMAGE_BYTES) return { status: 413, body: { error: '사진은 4MB 이하로 올려 주세요.' } };
  const buffer = new Uint8Array(await request.arrayBuffer());
  if (!buffer.length) return { status: 400, body: { error: '사진 파일이 비어 있습니다.' } };
  if (buffer.length > MAX_IMAGE_BYTES) return { status: 413, body: { error: '사진은 4MB 이하로 올려 주세요.' } };
  const sniffed = sniffType(buffer);
  if (!sniffed || !TYPES.has(sniffed) || (declared && !TYPES.has(declared))) {
    return { status: 415, body: { error: 'JPG, PNG, WEBP 사진만 올릴 수 있습니다.' } };
  }
  const id = imageId();
  const key = `${MEDIA_PREFIX}${productId}/${id}.${TYPES.get(sniffed)}`;
  const width = Number(request.headers.get('x-image-width')) || null;
  const height = Number(request.headers.get('x-image-height')) || null;
  await env.MEDIA.put(key, buffer, { httpMetadata: { contentType: sniffed, cacheControl: 'public, max-age=31536000, immutable' } });
  images.push({ id, key, width: width && width < 10000 ? width : null, height: height && height < 10000 ? height : null, createdAt: new Date().toISOString() });
  await env.DB.prepare('UPDATE products SET images_json=?,updated_at=? WHERE id=? AND seller_id=?')
    .bind(JSON.stringify(images), new Date().toISOString(), productId, sellerId).run();
  return { status: 201, body: { images: publicImages(JSON.stringify(images), env.MALL_BASE_URL) } };
}

export async function deleteProductImage(env, sellerId, productId, imageIdValue) {
  const row = await env.DB.prepare('SELECT id,images_json FROM products WHERE id=? AND seller_id=?').bind(productId, sellerId).first();
  if (!row) return { status: 404, body: { error: '상품을 찾을 수 없습니다.' } };
  const images = parseImages(row.images_json);
  const target = images.find((item) => item.id === imageIdValue);
  if (!target) return { status: 404, body: { error: '사진을 찾을 수 없습니다.' } };
  const next = images.filter((item) => item.id !== imageIdValue);
  await env.DB.prepare('UPDATE products SET images_json=?,updated_at=? WHERE id=? AND seller_id=?')
    .bind(JSON.stringify(next), new Date().toISOString(), productId, sellerId).run();
  if (env.MEDIA?.delete) await env.MEDIA.delete(target.key).catch(() => {});
  return { status: 200, body: { images: publicImages(JSON.stringify(next), env.MALL_BASE_URL) } };
}

export async function reorderProductImages(env, sellerId, productId, order) {
  const row = await env.DB.prepare('SELECT id,images_json FROM products WHERE id=? AND seller_id=?').bind(productId, sellerId).first();
  if (!row) return { status: 404, body: { error: '상품을 찾을 수 없습니다.' } };
  const images = parseImages(row.images_json);
  const ids = Array.isArray(order) ? order.map(String) : [];
  const next = [...ids.map((id) => images.find((item) => item.id === id)).filter(Boolean), ...images.filter((item) => !ids.includes(item.id))];
  await env.DB.prepare('UPDATE products SET images_json=?,updated_at=? WHERE id=? AND seller_id=?')
    .bind(JSON.stringify(next), new Date().toISOString(), productId, sellerId).run();
  return { status: 200, body: { images: publicImages(JSON.stringify(next), env.MALL_BASE_URL) } };
}

/** Public read: only keys under MEDIA_PREFIX, no listing. */
export async function servePublicMedia(env, key, request) {
  if (!env.MEDIA?.get) return new Response('Not found', { status: 404 });
  if (!key.startsWith(MEDIA_PREFIX) || key.includes('..') || !/^[a-z0-9/_.-]+$/i.test(key)) return new Response('Not found', { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  if (request.method === 'HEAD') return new Response(null, { headers });
  return new Response(object.body, { headers });
}
