// EKODI-MALL-PROVIDER-UNIFIED-VIEW-001
// Read-only projections of public sources. Never copy external affiliate or
// bookstore entries into Mall's own seller products or checkout tables.
(function (global) {
  'use strict';
  const BASE = 'https://ekodi.kr';
  function safeUrl(raw, kind) {
    try {
      const url = new URL(String(raw || ''), BASE);
      if (url.origin !== BASE) return '';
      const allowed = kind === 'bookstore' ? /^\/((books|ekodimall)\/)/ : /^\/api\/affiliate\/public\/(click|link)\//;
      return allowed.test(url.pathname) ? url.href : '';
    } catch { return ''; }
  }
  function bookstoreRows(items) {
    if (!Array.isArray(items)) throw new Error('서점 카탈로그 형식 오류');
    const found = new Map();
    for (const item of items.slice(0, 1000)) {
      const bookId = String(item?.id || '').trim().slice(0, 100);
      const title = String(item?.name || '').trim().slice(0, 240);
      if (!bookId || !title) continue;
      const url = safeUrl(item.detailUrl, 'bookstore');
      if (!url) continue;
      const connected = item.saleReady === true;
      found.set(bookId, {
        id: 'bookstore:' + bookId, status: connected ? 'published' : 'draft',
        readOnly: true, externalChannel: 'bookstore', externalReady: connected,
        externalUrl: url, source: { kind: 'ekodi-bookstore' },
        product: { name: title, saleType: 'publisher', category: 'book', price: item.price || null },
        seller: { displayName: '에코디서점' }
      });
    }
    return [...found.values()];
  }
  function affiliateRows(items) {
    if (!Array.isArray(items)) throw new Error('제휴상품 카탈로그 형식 오류');
    const found = new Map();
    for (const item of items.slice(0, 100)) {
      if (item?.providerKey !== 'coupang_partners') continue;
      const productId = String(item.productId || '').trim().slice(0, 80);
      const title = String(item.productName || '').trim().slice(0, 240);
      const url = safeUrl(item.clickUrl, 'affiliate');
      if (!productId || !title || !url) continue;
      found.set(productId, {
        id: 'coupang:' + productId, status: 'published',
        readOnly: true, externalChannel: 'affiliate', externalReady: true,
        externalUrl: url, source: { kind: 'coupang_partners' },
        product: { name: title, saleType: 'affiliate', category: 'general', price: item.priceKrw || null },
        seller: { displayName: '쿠팡파트너스' }
      });
    }
    return [...found.values()];
  }
  async function readCatalogs(fetchImpl = fetch) {
    const sources = [
      { key: 'bookstore', url: '/ekodimall/provider-bookstore.json', adapt: bookstoreRows },
      { key: 'coupang', url: '/api/affiliate/public/products?storefront=ekodi-mall&limit=100', adapt: affiliateRows }
    ];
    const settled = await Promise.all(sources.map(async ({ key, url, adapt }) => {
      try {
        const response = await fetchImpl(url, { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const payload = await response.json();
        return { key, rows: adapt(payload.products), status: 'ok' };
      } catch { return { key, rows: [], status: 'error' }; }
    }));
    return { rows: settled.flatMap(result => result.rows), status: Object.fromEntries(settled.map(result => [result.key, result.status])) };
  }
  global.ekodiMallProviderCatalog = { bookstoreRows, affiliateRows, readCatalogs };
})(window);
