(() => {
  const API = '/ekodimall/api';
  const grid = document.querySelector('#grid');
  if (!grid) return;

  const text = (value) => String(value || '').trim();
  // Missing, zero, negative or malformed prices are never a verified buyer-facing offer.
  // Checkout truth remains server-side; this only avoids falsely advertising 0원.
  const price = (value) => {
    const amount = typeof value === 'number' ? value
      : (typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN);
    return Number.isSafeInteger(amount) && amount > 0
      ? `${new Intl.NumberFormat('ko-KR').format(amount)}원` : '가격 확인';
  };
  const category = (value) => ['general','living','book','gift'].includes(value) ? value : 'general';
  const regionIds = (region) => Array.isArray(region?.regionIds) ? region.regionIds.map(text).filter(Boolean).slice(0, 8) : [];
  function node(tag, className = '', value = '') { const element = document.createElement(tag); if (className) element.className = className; if (value) element.textContent = value; return element; }

  const isSaleReady = (item) => item?.checkoutReady === true || (item?.product?.saleType === 'affiliate' && /^https:\/\//i.test(text(item.product.affiliateUrl)));
  function productCard(item) {
    const id = `server:${item.shareCode}`;
    const href = item.publicUrl || `/p/${encodeURIComponent(item.shareCode)}`;
    const p = item.product || {}; const seller = item.seller || {}; const store = item.store || null; const region = p.region || null;
    const article = node('article', 'card');
    const externalSale = p.saleType === 'affiliate' && /^https:\/\//i.test(text(p.affiliateUrl));
    const saleLabel = externalSale ? '판매처에서 구매' : '판매 중';
    article.dataset.product = id;
    article.dataset.serverProduct = item.shareCode;
    article.dataset.category = category(p.category);
    article.dataset.name = text(p.name) || '상품';
    article.dataset.status = saleLabel;
    article.dataset.saleReady = 'true';
    article.dataset.href = href;
    article.dataset.regionIds = regionIds(region).join(',');
    article.dataset.primaryRegion = text(region?.primaryRegionId);
    article.dataset.regionLabel = text(region?.label);
    article.dataset.localRelationship = text(region?.relationship);
    article.dataset.regionVerified = region?.verified ? 'true' : 'false';
    article.dataset.search = `${text(p.name)} ${text(p.oneLine)} ${text(p.audience)} ${text(seller.displayName)} ${text(store?.name)} ${text(region?.label)} 개인상품`.toLowerCase();

    const thumb = node('div', `thumb ${category(p.category)}`);
    // MALL-LIST-IMAGE-001: 대표사진 + 썸네일 클릭 시 상세
    const thumbLink = node('a', 'thumb-link'); thumbLink.href = href; thumbLink.setAttribute('aria-label', `${article.dataset.name} 자세히 보기`);
    if (/^https:\/\//.test(text(item.image))) { const img = node('img'); img.src = item.image; img.alt = article.dataset.name; img.loading = 'lazy'; img.decoding = 'async'; thumbLink.append(img); thumb.classList.add('has-image'); }
    thumb.append(thumbLink);
    thumb.append(node('span', 'badge', saleLabel));
    const heart = node('button', 'heart', '♡'); heart.type = 'button'; heart.dataset.wish = id; heart.setAttribute('aria-label', `${article.dataset.name} 관심상품`); heart.setAttribute('aria-pressed', 'false'); thumb.append(heart);

    const body = node('div', 'card-body');
    body.append(node('p', 'store-kicker', store ? `${store.name} · ${seller.displayName}` : seller.displayName === '에코디몰' ? '에코디몰 추천상품' : `판매자 · ${seller.displayName || '판매자'}`));
    const h3 = node('h3'); const title = node('a', '', article.dataset.name); title.href = href; h3.append(title); body.append(h3);
    const summary = text(p.oneLine) || text(p.audience) || '판매자가 등록한 공개 상품입니다.';
    body.append(node('p', 'card-summary', summary.length > 46 ? `${summary.slice(0, 45).trimEnd()}…` : summary));
    if (region?.label) body.append(node('p', 'region-chip', `지역 · ${text(region.label)}${region.verified ? ' · 확인됨' : ''}`));
    const meta = node('div', 'meta'); meta.append(node('span', 'status', `${price(p.price)} · ${saleLabel}`));
    const detail = node('a', 'smallbtn', '자세히'); detail.href = href; meta.append(detail); body.append(meta);
    article.append(thumb, body);
    return article;
  }

  // Server-side category filtering and bounded pagination keep large curated catalogs usable on mobile.
  const pageSize = 48;
  let currentCategory = 'all';
  let offset = 0;
  let loading = false;
  let complete = false;
  let generation = 0;
  const footer = node('div', 'mall-load-more');
  const more = node('button', 'smallbtn', '상품 더 보기');
  more.type = 'button';
  footer.append(more);
  grid.after(footer);
  function selectedCategory() {
    const value = document.querySelector('#filters [data-filter].active')?.dataset.filter || 'all';
    return ['general','living','book','gift'].includes(value) ? value : 'all';
  }
  function updateMore() {
    more.hidden = complete;
    more.disabled = loading;
    more.textContent = loading ? '상품 불러오는 중' : '상품 더 보기';
  }
  async function loadPage() {
    if (loading || complete) return;
    loading = true;
    const requestGeneration = generation;
    const start = offset;
    updateMore();
    try {
      const args = new URLSearchParams({ limit: String(pageSize), offset: String(start) });
      if (currentCategory !== 'all') args.set('category', currentCategory);
      const response = await fetch(`${API}/api/public/products?${args}`, { headers: { accept: 'application/json' }, cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      if (requestGeneration !== generation) return;
      const items = Array.isArray(body.products) ? body.products : [];
      for (const item of items) {
        if (!item?.shareCode || !isSaleReady(item) || grid.querySelector(`[data-server-product="${CSS.escape(item.shareCode)}"]`)) continue;
        grid.append(productCard(item));
      }
      offset += items.length;
      complete = items.length < pageSize || offset >= 2000;
      window.dispatchEvent(new CustomEvent('ekodi:marketplace-products-loaded', { detail: { count: items.length, category: currentCategory } }));
    } catch {
      if (requestGeneration === generation) window.dispatchEvent(new CustomEvent('ekodi:marketplace-products-loaded', { detail: { count: 0, degraded: true } }));
    } finally {
      if (requestGeneration === generation) { loading = false; updateMore(); }
    }
  }
  function chooseCategory(value) {
    const next = ['general','living','book','gift'].includes(value) ? value : 'all';
    if (next === currentCategory) return;
    currentCategory = next;
    offset = 0; complete = false; generation += 1; loading = false;
    grid.querySelectorAll('[data-server-product]').forEach(item => item.remove());
    loadPage();
  }
  more.addEventListener('click', loadPage);
  document.querySelectorAll('#filters [data-filter]').forEach(button => button.addEventListener('click', () => chooseCategory(selectedCategory())));
  window.addEventListener('popstate', () => chooseCategory(selectedCategory()));
  currentCategory = selectedCategory();
  loadPage();
})();
