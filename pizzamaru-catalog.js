export const PIZZAMARU_CATALOG_VERIFIED_AT = '2026-09-11';

export const PIZZAMARU_CATEGORIES = Object.freeze([
  { id: '10', label: '신메뉴' },
  { id: '11', label: '클래식' },
  { id: '32', label: '1인피자(8인치)' },
  { id: '13', label: '몬스터' },
  { id: '26', label: '골드&바이트' },
  { id: '12', label: '프리미엄' },
  { id: '27', label: '시카고&치즈폭탄' },
  { id: '31', label: '퍼스널(마루업)' },
  { id: '14', label: '투탑박스' },
  { id: '15', label: '사이드 및 기타' },
]);

export const PIZZAMARU_SOCIALS = Object.freeze([
  { label: 'Instagram', handle: '@pizzamaru_official', url: 'https://www.instagram.com/pizzamaru_official/' },
  { label: 'Facebook', handle: 'pizzamaruofficial', url: 'https://www.facebook.com/pizzamaruofficial' },
  { label: 'YouTube', handle: '피자마루 공식채널', url: 'https://www.youtube.com/user/pizzamaru' },
  { label: '공식 홈페이지', handle: 'pizzamaru.co.kr', url: 'https://www.pizzamaru.co.kr/' },
]);

const ORIGIN = 'https://www.pizzamaru.co.kr';
const CACHE_KEY = 'https://ekodi.internal/catalog/pizzamaru-v20260911';
const CACHE_SECONDS = 21600;
let catalogPromise = null;

const stripHtml = (value) => String(value || '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^-->/, '')
  .trim();

function cleanDescription(value) {
  return stripHtml(value)
    .replace(/\(본 가격은 포장 및 매장 내 취식 기준입니다\.\)/g, '')
    .replace(/\(본 사진은 이미지컷으로 실제와 다를 수 있습니다\.\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeOfficialUrl(value, base) {
  try {
    const url = new URL(String(value || ''), base);
    return url.protocol === 'https:' && ['www.pizzamaru.co.kr', 'pizzamaru.co.kr'].includes(url.hostname.toLowerCase()) ? url.href : '';
  } catch { return ''; }
}

export function parsePizzamaruCategory(html, category, categoryUrl) {
  const source = String(html || '');
  const items = [];
  let position = 0;
  while ((position = source.indexOf('class="t1', position)) >= 0) {
    const open = source.lastIndexOf('<p', position);
    const close = source.indexOf('</p>', position);
    if (open < 0 || close < 0) break;
    const name = stripHtml(source.slice(open, close + 4));
    position = close + 4;
    if (!name || name === '메뉴소개') continue;
    const before = source.slice(Math.max(0, open - 1800), open);
    const after = source.slice(close + 4, Math.min(source.length, close + 3200));
    const productMatches = [...before.matchAll(/href="(\/product\/[^\"]+)"/g)];
    const imageMatches = [...before.matchAll(/<img\s+src="([^\"]+)"/g)];
    const productUrl = safeOfficialUrl(productMatches.at(-1)?.[1], categoryUrl);
    const imageUrl = safeOfficialUrl(imageMatches.at(-1)?.[1], categoryUrl);
    if (!productUrl || !imageUrl) continue;
    const description = cleanDescription(after.match(/<p class="t2 c6 tov2">([\s\S]*?)<\/p>/i)?.[1] || '');
    const priceText = stripHtml(after.match(/<p class="t3 lh">([\s\S]*?)<\/p>/i)?.[1] || '');
    const price = Number((priceText.match(/[0-9,]+/)?.[0] || '').replace(/,/g, '')) || null;
    if (price == null) continue;
    items.push({ category, name, description, price, image_url: imageUrl, product_url: productUrl, category_url: categoryUrl });
  }
  return items;
}

async function fetchCategory(row) {
  const url = `${ORIGIN}/menu/${row.id}/`;
  const response = await fetch(url, { headers: { accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`pizzamaru_category_${row.id}_${response.status}`);
  return parsePizzamaruCategory(await response.text(), row.label, url);
}

async function fetchCatalog() {
  const results = await Promise.allSettled(PIZZAMARU_CATEGORIES.map(fetchCategory));
  const items = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  const failed = results.map((result, index) => result.status === 'rejected' ? PIZZAMARU_CATEGORIES[index].label : null).filter(Boolean);
  return { items, failed, complete: failed.length === 0 && items.length >= 70, verified_at: PIZZAMARU_CATALOG_VERIFIED_AT };
}

async function cacheCatalog(catalog) {
  const cache = globalThis.caches?.default;
  if (!cache) return;
  try {
    await cache.put(CACHE_KEY, new Response(JSON.stringify(catalog), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_SECONDS}` } }));
  } catch {}
}

async function readCachedCatalog() {
  const cache = globalThis.caches?.default;
  if (!cache) return null;
  try {
    const response = await cache.match(CACHE_KEY);
    return response?.ok ? await response.json() : null;
  } catch { return null; }
}

export async function loadPizzamaruOfficialCatalog() {
  const cached = await readCachedCatalog();
  if (cached?.items?.length >= 70) return cached;
  if (!catalogPromise) catalogPromise = fetchCatalog().then(async (catalog) => { if (catalog.items.length >= 70) await cacheCatalog(catalog); return catalog; }).finally(() => { catalogPromise = null; });
  return catalogPromise;
}
