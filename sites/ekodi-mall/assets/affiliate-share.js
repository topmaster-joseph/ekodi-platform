const PRODUCT_ID_PATTERN = /^[1-9][0-9]{0,11}$/;
const HUB_PATHS = new Map([
  ['/ekodimall/coupang', '/ekodimall/coupang/'],
  ['/ekodimall/travel/stay', '/ekodimall/travel/stay/'],
]);

export function validAffiliateProductId(value) {
  return PRODUCT_ID_PATTERN.test(String(value ?? ''));
}

export function sharedProductId(search) {
  try {
    const value = new URLSearchParams(String(search || '')).get('product') || '';
    return validAffiliateProductId(value) ? value : '';
  } catch {
    return '';
  }
}

export function shareUrlForProduct(pageHref, productId) {
  if (!validAffiliateProductId(productId)) return '';
  try {
    const source = new URL(pageHref);
    const pathname = source.pathname.replace(/\/+$/, '');
    const targetPath = HUB_PATHS.get(pathname);
    if (!targetPath || !['https:', 'http:'].includes(source.protocol)) return '';
    const result = new URL(targetPath, 'https://ekodi.kr');
    result.searchParams.set('product', String(productId));
    return result.toString();
  } catch {
    return '';
  }
}

export function prioritizeSharedProduct(products, productId) {
  const list = Array.isArray(products) ? products : [];
  if (!validAffiliateProductId(productId)) return { products: [...list], matched: false };
  const selected = list.find(item => String(item?.id ?? '') === String(productId));
  if (!selected) return { products: [...list], matched: false };
  return {
    products: [selected, ...list.filter(item => String(item?.id ?? '') !== String(productId))],
    matched: true,
  };
}

/* The approved public API supplies exact product images and data.
 * Never substitute a search-engine image or a different SKU's photograph. */
export const cleanAffiliateText = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function safeAffiliateHttps(value) {
  try {
    const url = new URL(cleanAffiliateText(value));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function affiliateProviderMatches(item, keys = []) {
  const normalize = value => cleanAffiliateText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const allowed = new Set(keys.flatMap(value => {
    const id = normalize(value);
    return id === 'coupangpartners' || id === 'coupang' ? ['coupangpartners', 'coupang'] : [id];
  }).filter(Boolean));
  // Do not accept provider display names or titles as proof of a vendor.
  const source = normalize(item?.merchantKey || item?.providerKey);
  return Boolean(source && allowed.has(source));
}

export function conciseAffiliateDescription(item, max = 62) {
  const facts = [
    cleanAffiliateText(item?.category),
    cleanAffiliateText(item?.brand),
    item?.isRocket === true ? '로켓배송' : '',
    item?.isFreeShipping === true ? '무료배송' : ''
  ].filter(Boolean);
  const result = cleanAffiliateText(item?.shortDescription || item?.description) ||
    facts.join(' · ') || '상세 조건은 판매처에서 확인해 주세요.';
  return result.length > max ? result.slice(0, max - 1).trimEnd() + '…' : result;
}

export function affiliatePriceLabel(item) {
  const amount = Number(item?.priceKrw);
  return Number.isSafeInteger(amount) && amount > 0
    ? new Intl.NumberFormat('ko-KR').format(amount) + '원'
    : '가격은 판매처에서 확인';
}
