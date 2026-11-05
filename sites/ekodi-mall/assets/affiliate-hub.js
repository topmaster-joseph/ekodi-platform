import {
  sharedProductId, shareUrlForProduct, prioritizeSharedProduct, safeAffiliateHttps,
  affiliateProviderMatches, conciseAffiliateDescription, affiliatePriceLabel, cleanAffiliateText
} from './affiliate-share.js';

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
  const initialSearch = new URLSearchParams(window.location.search).get('q');
  if (input && initialSearch) input.value = cleanAffiliateQuery(initialSearch);
  let products = [];
  let loadFailed = false;
  const detail = document.querySelector('#affiliateProductDialog');
  const detailContent = document.querySelector('#affiliateDetailContent');
  const closeDetail = document.querySelector('#affiliateDetailClose');

  function cleanAffiliateQuery(value) {
    return String(value ?? '').replace(/\\s+/g,' ').trim().slice(0,120);
  }
  const text = (tag, className, value) => { const node = document.createElement(tag); if (className) node.className = className; node.textContent = value; return node; };
  const clean = cleanAffiliateText;
  const safeHttps = safeAffiliateHttps;
  const providerMatches = item => affiliateProviderMatches(item, keys);
  const searchMatches = (item, query) => !query || query.split(/\s+/).every(term =>
    [item.productName, item.category, item.brand, item.model, item.providerName].map(clean).join(' ').toLowerCase().includes(term));
  const picture = (item, className, alt) => {
    const frame = document.createElement('div'); frame.className = className;
    const imageUrl = safeHttps(item?.imageUrl);
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => frame.replaceChildren(text('span','affiliate-image-missing','이미지 준비 중')), { once:true });
      frame.append(img);
    } else frame.append(text('span','affiliate-image-missing','이미지 준비 중'));
    return frame;
  };
  function showDetail(item) {
    if (!detail || !detailContent || typeof detail.showModal !== 'function') return;
    const url = safeHttps(item.clickUrl);
    if (!url) return;
    const title = clean(item.productName) || (isStay ? '숙소 정보' : '상품 정보');
    const header = document.createElement('div'); header.className = 'affiliate-detail-copy';
    const h2 = text('h2','',title); h2.id = 'affiliateDetailTitle';
    header.append(text('p','affiliate-provider',clean(item.providerName) || '제휴 판매처'), h2);
    const description = clean(item.description || item.shortDescription) || conciseAffiliateDescription(item, 160);
    header.append(text('p','affiliate-detail-description',description));
    header.append(text('p','affiliate-detail-price',affiliatePriceLabel(item)));
    const facts = document.createElement('dl'); facts.className = 'affiliate-detail-facts';
    const rows = [['분류',clean(item.category)],['브랜드',clean(item.brand)],['모델',clean(item.model)]];
    if(item.isRocket===true) rows.push(['배송','로켓배송 표시']);
    if(item.isFreeShipping===true) rows.push(['배송비','무료배송 표시']);
    rows.filter(([,v])=>v).forEach(([label,value])=>{facts.append(text('dt','',label),text('dd','',value));});
    header.append(facts);
    const external = text('a','btn primary',isStay?'아고다에서 예약 조건 확인':'쿠팡에서 상품 확인');
    external.href=url; external.target='_blank'; external.rel='noopener sponsored';
    header.append(external,text('p','affiliate-detail-note','상품정보는 참고용입니다. 최종 가격·재고·배송·취소 조건은 외부 판매처에서 확인합니다.'));
    const visual = picture(item,'affiliate-detail-image',title);
    const wrap = document.createElement('div'); wrap.className='affiliate-detail-layout';
    wrap.append(visual,header);
    detailContent.replaceChildren(wrap);
    detail.showModal();
    closeDetail?.focus();
  }
  closeDetail?.addEventListener('click',()=>detail?.close());

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
    const filtered = products.filter((item) => providerMatches(item) && safeHttps(item.clickUrl) && searchMatches(item, query));
    const { products: visible, matched } = prioritizeSharedProduct(filtered, requestedProductId);
    grid.replaceChildren();
    if (shareStatus) {
      const available = products.some((item) => providerMatches(item) && safeHttps(item.clickUrl) && String(item.id) === requestedProductId);
      shareStatus.textContent = requestedProductId && !available
        ? '공유된 상품이 현재 공개 목록에 없습니다. 다른 상품을 확인해 주세요.'
        : matched ? '공유받은 상품을 맨 앞에 표시했습니다. 최신 가격과 조건은 구매처에서 확인하세요.' : '';
    }
    if (!visible.length) {
      const empty = document.createElement('article'); empty.className = 'affiliate-empty';
      empty.append(text('strong','',loadFailed?'제휴상품 목록을 불러오지 못했습니다.':query?'검색 조건에 맞는 상품이 없습니다.':isStay?'현재 공개 가능한 아고다 숙소가 없습니다.':'현재 공개 가능한 쿠팡 제휴상품이 없습니다.'),text('span','','검증된 상품과 유효한 HTTPS 제휴링크만 표시합니다.'));
      grid.append(empty); summary.textContent = loadFailed?'잠시 후 다시 확인해 주세요.':'준비 중인 상품은 판매 가능한 것처럼 표시하지 않습니다.'; return;
    }
    visible.slice(0, 24).forEach((item) => {
      const url = safeHttps(item.clickUrl); if (!url) return;
      const card = document.createElement('article'); card.className = 'affiliate-card';
      if (String(item.id) === requestedProductId) card.classList.add('affiliate-shared');
      const provider = text('small', 'affiliate-provider', clean(item.providerName) || (isStay ? 'Agoda' : 'Coupang'));
      const thumbButton = text('button','affiliate-card-picture','');
      thumbButton.type='button'; thumbButton.setAttribute('aria-label',clean(item.productName)+' 상세보기');
      thumbButton.append(picture(item,'affiliate-card-image',clean(item.productName)));
      thumbButton.addEventListener('click',()=>showDetail(item));
      const h3 = document.createElement('h3');
      const title = text('button','affiliate-card-title',clean(item.productName) || '제휴 상품');
      title.type='button'; title.addEventListener('click',()=>showDetail(item)); h3.append(title);
      const desc = text('button','affiliate-card-description',conciseAffiliateDescription(item,62));
      desc.type='button'; desc.addEventListener('click',()=>showDetail(item));
      const meta = text('p','affiliate-card-price',affiliatePriceLabel(item));
      const link = text('a', 'btn primary', isStay ? '아고다에서 확인' : '쿠팡에서 보기'); link.href = url; link.target = '_blank'; link.rel = 'noopener sponsored';
      const actions = document.createElement('div'); actions.className = 'affiliate-card-actions'; actions.append(link);
      if (shareUrlForProduct(window.location.href, item.id)) {
        const share = text('button', 'btn affiliate-share', '상품 공유');
        share.type = 'button';
        share.setAttribute('aria-label', `${clean(item.productName)} 공유`);
        share.addEventListener('click', () => { void shareProduct(item); });
        actions.append(share);
      }
      card.append(thumbButton,provider,h3,desc,meta,actions); grid.append(card);
    });
    summary.textContent = isStay ? `${visible.length}개의 숙소 제휴 후보를 찾았습니다. 가격·예약 가능 여부는 판매처에서 다시 확인해 주세요.` : `${visible.length}개의 상품 제휴 후보를 찾았습니다. 가격·재고·배송 조건은 판매처에서 다시 확인해 주세요.`;
  }

  form?.addEventListener('submit', (event) => { event.preventDefault(); render(); });
  fetch(API, { headers: { accept: 'application/json' }, credentials: 'omit' })
    .then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then((body) => { products = Array.isArray(body.products) ? body.products : []; render(); })
    .catch(() => { products = []; loadFailed = true; render(); });
})();
