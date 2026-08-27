(() => {
  'use strict';

  const API = 'https://api.ekodi.kr/api/affiliate/public/products?storefront=ekodi-mall&limit=100';
  const DEFAULT_DISCLOSURE = '쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
  const INSTRUCTION = '아래 추천링크 클릭 후 검색하세요.';
  const FALLBACK_PRODUCTS = [{
    id: 'ekodi-coupang-search',
    productName: '에코디 추천상품 검색',
    affiliateUrl: 'https://link.coupang.com/a/cwWXWm',
    category: '추천',
    channel: 'EKODI Mall',
  }];

  const state = { products: [], category: '전체', query: '' };
  const grid = document.querySelector('#productGrid');
  const empty = document.querySelector('#emptyState');
  const categories = document.querySelector('#categoryBar');
  const search = document.querySelector('#productSearch');

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.toString() : '';
    } catch { return ''; }
  }

  function normalize(product) {
    const affiliateUrl = safeUrl(product?.affiliateUrl);
    if (!affiliateUrl) return null;
    return {
      id: String(product?.id || ''),
      productName: String(product?.productName || '추천상품').trim().slice(0, 200),
      affiliateUrl,
      category: String(product?.category || product?.campaignName || '추천').trim().slice(0, 60) || '추천',
      channel: String(product?.channel || 'EKODI Mall').trim().slice(0, 80),
    };
  }
  function makeCard(product) {
    const article = document.createElement('article');
    article.className = 'product-card';

    const visual = document.createElement('div');
    visual.className = 'product-visual';
    const badge = document.createElement('span');
    badge.textContent = product.category;
    visual.append(badge);

    const title = document.createElement('h3');
    title.textContent = product.productName;
    const meta = document.createElement('p');
    meta.className = 'product-meta';
    meta.textContent = `${product.channel} · 쿠팡 제휴`;

    const link = document.createElement('a');
    link.className = 'buy-link';
    link.href = product.affiliateUrl;
    link.target = '_blank';
    link.rel = 'sponsored noopener noreferrer';
    const label = document.createElement('span');
    label.textContent = '쿠팡에서 확인';
    const arrow = document.createElement('span');
    arrow.textContent = '↗';
    link.append(label, arrow);

    const instruction = document.createElement('p');
    instruction.className = 'instruction';
    instruction.textContent = INSTRUCTION;
    article.append(visual, title, meta, link, instruction);
    return article;
  }

  function filteredProducts() {
    const query = state.query.toLocaleLowerCase('ko-KR');
    return state.products.filter(product => {
      const categoryMatch = state.category === '전체' || product.category === state.category;
      const text = `${product.productName} ${product.category} ${product.channel}`.toLocaleLowerCase('ko-KR');
      return categoryMatch && (!query || text.includes(query));
    });
  }
  function renderProducts() {
    const products = filteredProducts();
    grid.replaceChildren(...products.map(makeCard));
    empty.hidden = products.length > 0;
  }

  function renderCategories() {
    const list = ['전체', ...new Set(state.products.map(product => product.category))];
    const buttons = list.map(name => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.classList.toggle('active', name === state.category);
      button.addEventListener('click', () => {
        state.category = name;
        renderCategories();
        renderProducts();
      });
      return button;
    });
    categories.replaceChildren(...buttons);
  }

  function setDisclosure(text) {
    const disclosure = String(text || DEFAULT_DISCLOSURE).trim() || DEFAULT_DISCLOSURE;
    document.querySelectorAll('#disclosureText,#affiliateDisclosure').forEach(node => { node.textContent = disclosure; });
  }

  async function loadProducts() {
    try {
      const response = await fetch(API, { method: 'GET', mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const products = Array.isArray(data.products) ? data.products.map(normalize).filter(Boolean) : [];
      state.products = products.length ? products : FALLBACK_PRODUCTS.map(normalize).filter(Boolean);
      setDisclosure(data.disclosureText);
    } catch (error) {
      console.warn('EKODI Mall affiliate API fallback', error);
      state.products = FALLBACK_PRODUCTS.map(normalize).filter(Boolean);
      setDisclosure(DEFAULT_DISCLOSURE);
    }
    renderCategories();
    renderProducts();
  }
  search?.addEventListener('input', event => {
    state.query = String(event.currentTarget.value || '').trim();
    renderProducts();
  });

  loadProducts();
})();
