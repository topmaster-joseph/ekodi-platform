// EKODI-MALL-SUPPLIER-SEARCH-001
// Public reference lookup only: no checkout, provider impersonation, buyer data or order API.
// The user-facing supplier search is disabled until both catalog display rights and
// bounded public-query operations are expressly configured by the EKODI control plane.
const enabled = value => String(value ?? '').toLowerCase() === 'true';
const clean = (value, max = 100) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const ENDPOINT = 'https://www.domeggook.com/ssl/api/';
const NO_AUTH = 'rights-unverified';

export function supplierSearchReady(env = {}) {
  return enabled(env.DOMEGGOOK_PUBLIC_CATALOG_RIGHTS_APPROVED)
    && enabled(env.DOMEGGOOK_PUBLIC_SEARCH_RATE_GUARD_APPROVED)
    && enabled(env.DOMEMAE_LOOKUP_ENABLED) && Boolean(env.DOMEMAE_API_KEY)
    && typeof env?.MALL_SUPPLIER_SEARCH_LIMITER?.limit === 'function';
}
export function normalizeSupplierSearch(payload) {
  const root = payload?.domeggook || payload || {};
  const raw = root?.list?.item;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const seen = new Set();
  return list.slice(0, 20).map(item => {
    const no = clean(item?.no, 20);
    const title = clean(item?.title, 220);
    if (!/^\d{4,15}$/.test(no) || !title || enabled(item?.adultOnly) || seen.has(no)) return null;
    seen.add(no);
    const minimum = Number(item?.unitQty);
    return {
      itemNo: no, title,
      minimumQuantity: Number.isSafeInteger(minimum) && minimum > 0 ? minimum : null,
      // Only a fixed, known official host; untrusted vendor URLs never leave this proxy.
      url: 'https://www.domeggook.com/' + no,
      provider: '도매꾹·도매매',
      purchaseMode: 'external-reference-only'
    };
  }).filter(Boolean).slice(0, 12);
}
export async function handlePublicSupplierSearch(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/public/supplier/search') return null;
  if (request.method !== 'GET') return {status:405,body:{error:'METHOD_NOT_ALLOWED'}};
  const query = clean(url.searchParams.get('q'), 120);
  if (query.length < 2 || query.length > 70 || /[\x00-\x1F\x7F<>]/.test(query)) {
    return {status:400,body:{error:'INVALID_QUERY',items:[]}};
  }
  if (!supplierSearchReady(env)) {
    return {status:200,body:{enabled:false,state:NO_AUTH,items:[],checkoutReady:false}};
  }
  // Enforce an actual Cloudflare per-client rate-limit binding, not a boolean
  // readiness label. No client identifier is logged or stored in Mall D1.
  let budget;
  try {
    const key = clean(request.headers.get('cf-connecting-ip') || 'anonymous', 80);
    budget = await env.MALL_SUPPLIER_SEARCH_LIMITER.limit({key});
  } catch {
    return {status:503,body:{enabled:false,state:'rate-limit-unavailable',items:[],checkoutReady:false}};
  }
  if (!budget?.success) {
    return {status:429,body:{enabled:true,state:'rate-limited',items:[],checkoutReady:false}};
  }
  const upstream = new URL(ENDPOINT);
  const params = {ver:'4.1',mode:'getItemList',aid:env.DOMEMAE_API_KEY,
    market:'supply',om:'json',kw:query,sz:'12',pg:'1',so:'se'};
  for (const [key,value] of Object.entries(params)) upstream.searchParams.set(key,value);
  try {
    const response = await fetchImpl(upstream.href,{
      method:'GET',redirect:'manual',headers:{accept:'application/json'},
      signal:AbortSignal.timeout(5000)
    });
    // A redirect must not carry the API credential to any new location.
    if (!response.ok || (response.status >= 300 && response.status < 400)) throw Error('UPSTREAM');
    const raw = await response.text();
    if (raw.length > 256000) throw Error('OVERSIZE');
    const items = normalizeSupplierSearch(JSON.parse(raw));
    return {status:200,body:{enabled:true,state:'reference-only',items,
      checkoutReady:false,priceVerified:false,shippingVerified:false,
      message:'공급처 조회 결과는 참고용입니다. 에코디몰 주문·결제 승인이 아닙니다.'}};
  } catch {
    // Fail closed and do not expose API request parameters, keys, or raw response.
    return {status:502,body:{enabled:true,state:'unavailable',items:[],
      checkoutReady:false,error:'SUPPLIER_LOOKUP_UNAVAILABLE'}};
  }
}
