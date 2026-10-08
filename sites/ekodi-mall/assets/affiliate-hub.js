import { sharedProductId, shareUrlForProduct, prioritizeSharedProduct } from './affiliate-share.js';

(() => {
  const API = 'https://ekodi.kr/api/affiliate/public/products?storefront=ekodi-mall&limit=100';
  const keys = String(document.body.dataset.affiliateProvider || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const mode = String(document.body.dataset.affiliateMode || 'shopping').trim().toLowerCase();
  const isStay = mode === 'stay';
  const grid = document.querySelector('#affiliateGrid');
  const form = document.querySelector('#affiliateSearch');
  const input = document.querySelector('#affiliateQuery');
  const summary = document.querySelector('#affiliateSummary');
  const shareStatus = document.querySelector('#affiliateShareStatus');
  const requestedProductId = sharedProductId(window.location.search);
  let products = [];

  const text = (tag, className, value) => { const node = document.createElement(tag); if (className) node.className = className; node.textContent = value; return node; };
  const clean = (value) => String(value || '').trim();
  const safeHttps = (value) => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
  const providerMatches = (item) => {
    const haystack = [item.providerKey, item.providerName, item.merchantKey, item.merchantName, item.affiliateNetworkName].map((value) => clean(value).toLowerCase()).join(' ');
    return keys.some((key) => haystack.includes(key));
  };
  const searchMatches = (item, query) => !query || [item.productName, item.category, item.providerName, item.merchantName].map(clean).join(' ').toLowerCase().includes(query);

  async function shareProduct(item) {
    const url = shareUrlForProduct(window.location.href, item.id);
    if (!url || !shareStatus) return;
    const title = clean(item.productName) || '에코디몰 추천 상품';
    // Share the disclosed EKODI landing page, not a direct affiliate redirect.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: '에코디몰에서 상품 정보 확인', url });
        shareStatus.textContent = '상품 정보를 공유했습니다.';
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        shareStatus.textContent = '상품 공유 링크를 복사했습니다.';
        return;
      } catch { /* Fall back to a selectable read-only URL. */ }
    }
    const field = document.createElement('input');
    field.type = 'text';
    field.value = url;
    field.readOnly = true;
    field.className = 'affiliate-share-link';
    field.setAttribute('aria-label', '상품 공유 링크');
    shareStatus.replaceChildren(field);
    field.focus();
    field.select();
  }

  function render() {
    const query = clean(input?.value).toLowerCase();
    const filtered = products.filter((item) => providerMatches(item) && searchMatches(item, query));
    const { products: visible, matched } = prioritizeSharedProduct(filtered, requestedProductId);
    grid.replaceChildren();
    if (shareStatus) {
      const available = products.some((item) => providerMatches(item) && String(item.id) === requestedProductId);
      shareStatus.textContent = requestedProductId && !available
        ? '공유된 상품이 현재 공개 목록에 없습니다. 다른 상품을 확인해 주세요.'
        : matched ? '공유받은 상품을 맨 앞에 표시했습니다. 최신 가격과 조건은 구매처에서 확인하세요.' : '';
    }
    if (!visible.length) {
      const empty = document.createElement('article'); empty.className = 'affiliate-empty';
      empty.append(text('strong', '', query ? (isStay ? '조건에 맞는 숙소 후보가 아직 없습니다.' : '조건에 맞는 상품 후보가 아직 없습니다.') : (isStay ? '현재 공개 가능한 숙소 후보를 준비 중입니다.' : '현재 공개 가능한 상품 후보를 준비 중입니다.')), text('span', '', '제휴 API에서 유효한 HTTPS 링크가 확인된 항목만 자동 노출됩니다.'));
      grid.append(empty); summary.textContent = '확인되지 않은 임의 링크는 표시하지 않습니다.'; return;
    }
    visible.slice(0, 24).forEach((item) => {
      const url = safeHttps(item.clickUrl); if (!url) return;
      const card = document.createElement('article'); card.className = 'affiliate-card';
      if (String(item.id) === requestedProductId) card.classList.add('affiliate-shared');
      const provider = text('small', 'affiliate-provider', clean(item.providerName) || '제휴 판매처');
      const title = text('h3', '', clean(item.productName) || '제휴 상품');
      const meta = text('p', '', [clean(item.category), Number(item.priceKrw) > 0 ? `${Number(item.priceKrw).toLocaleString('ko-KR')}원 표시` : '가격은 판매처에서 확인'].filter(Boolean).join(' · '));
      const link = text('a', 'btn primary', isStay ? '예약 가능 여부 확인' : '판매처에서 확인'); link.href = url; link.target = '_blank'; link.rel = 'noopener sponsored';
      const actions = document.createElement('div'); actions.className = 'affiliate-card-actions'; actions.append(link);
      if (shareUrlForProduct(window.location.href, item.id)) {
        const share = text('button', 'btn affiliate-share', '상품 공유');
        share.type = 'button';
        share.setAttribute('aria-label', `${clean(item.productName)} 공유`);
        share.addEventListener('click', () => { void shareProduct(item); });
        actions.append(share);
      }
      card.append(provider, title, meta, actions); grid.append(card);
    });
    summary.textContent = isStay ? `${visible.length}개의 숙소 제휴 후보를 찾았습니다. 가격·예약 가능 여부는 판매처에서 다시 확인해 주세요.` : `${visible.length}개의 상품 제휴 후보를 찾았습니다. 가격·재고·배송 조건은 판매처에서 다시 확인해 주세요.`;
  }

  form?.addEventListener('submit', (event) => { event.preventDefault(); render(); });
  fetch(API, { headers: { accept: 'application/json' }, credentials: 'omit' })
    .then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then((body) => { products = Array.isArray(body.products) ? body.products : []; render(); })
    .catch(() => { products = []; render(); });
})();
