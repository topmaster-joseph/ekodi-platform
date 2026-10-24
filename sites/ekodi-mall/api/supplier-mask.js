// EKODI-MALL-SUPPLIER-MASK-001
// 에코디몰 직접판매(위탁 소싱) 상품은 외부에 에코디몰 고유 주소(ekodi.kr/ekodimall/p/{shareCode})로만 노출한다.
// 공개 응답·검색·홍보에 공급처(도매꾹·도매매) 주소, 상품번호 표기, API 키 파라미터가 섞여 나가지 않도록
// 공개 직렬화 직전에 텍스트를 한 번 더 걸러낸다(판매자가 문구에 붙여넣은 경우·과거 데이터 포함).

const SUPPLIER_HOSTS = '(?:[a-z0-9-]+\\.)*(?:domeggook\\.com|domeggook\\.co\\.kr|domeme\\.com|domeme\\.co\\.kr|domemedb\\.domeggook\\.com)';
const SUPPLIER_URL = new RegExp(`(?:https?:\\/\\/)?${SUPPLIER_HOSTS}(?::\\d+)?(?:[\\/?#][^\\s<>"')\\]]*)?`, 'gi');
const SUPPLIER_REF = /(?:도매꾹|도매매|domeggook|domeme)\s*(?:상품\s*)?(?:번호|no\.?|#)?\s*[:：]?\s*\d{4,15}/gi;
const API_KEY_PARAM = /[?&]aid=[^\s&"'<>]+/gi;

export function maskSupplierText(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const masked = value
    .replace(SUPPLIER_URL, '')
    .replace(SUPPLIER_REF, '')
    .replace(API_KEY_PARAM, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/[ \t]+\n/g, '\n');
  return masked === value ? value : masked.trim();
}

export function maskSupplierList(list) {
  return Array.isArray(list) ? list.map((item) => (typeof item === 'string' ? maskSupplierText(item) : maskSupplierObject(item))) : list;
}

function maskSupplierObject(value) {
  if (!value || typeof value !== 'object') return maskSupplierText(value);
  if (Array.isArray(value)) return maskSupplierList(value);
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = typeof item === 'string' ? maskSupplierText(item) : maskSupplierObject(item);
  return out;
}

/** 공개 상품 payload 의 사람이 읽는 필드만 걸러낸다. 주소(publicUrl)·이미지(에코디 R2)는 이미 에코디몰 고유값이다. */
export function maskPublicProductFields(product) {
  if (!product || typeof product !== 'object') return product;
  const out = { ...product };
  for (const key of ['name', 'audience', 'oneLine', 'story', 'fulfillment', 'contact']) {
    if (typeof out[key] === 'string') out[key] = maskSupplierText(out[key]);
  }
  if (Array.isArray(out.benefits)) out.benefits = maskSupplierList(out.benefits);
  if (Array.isArray(out.specs)) out.specs = maskSupplierList(out.specs);
  return out;
}

/** 공개 응답에 공급처 흔적이 남았는지 검사(테스트·빌드 가드용). */
export function containsSupplierTrace(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  SUPPLIER_URL.lastIndex = 0; SUPPLIER_REF.lastIndex = 0; API_KEY_PARAM.lastIndex = 0;
  const hit = SUPPLIER_URL.test(text) || SUPPLIER_REF.test(text) || API_KEY_PARAM.test(text);
  SUPPLIER_URL.lastIndex = 0; SUPPLIER_REF.lastIndex = 0; API_KEY_PARAM.lastIndex = 0;
  return hit;
}
