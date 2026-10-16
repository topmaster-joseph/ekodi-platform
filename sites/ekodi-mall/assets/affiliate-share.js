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
