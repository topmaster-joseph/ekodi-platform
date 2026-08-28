(() => {
  'use strict';

  const API = 'https://api.ekodi.kr/api/affiliate/public/products?storefront=ekodi-mall&limit=100';
  const DEFAULT_DISCLOSURE = '쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
  const state = { products: [], category: '전체', query: '', status: 'loading' };
  const grid = document.querySelector('#productGrid');
  const empty = document.querySelector('#emptyState');
  const categories = document.querySelector('#categoryBar');
  const search = document.querySelector('#productSearch');
  const statusNode = document.querySelector('#catalogStatus');
  const imageCache = new Map();

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.toString() : '';
    } catch { return ''; }
  }

  function normalize(product) {
    const clickUrl = safeUrl(product?.clickUrl);
    if (!clickUrl) return null;
    const price = Number(product?.priceKrw || 0);
    return {
      id: String(product?.id || ''),
      productId: String(product?.productId || ''),
      productName: String(product?.productName || '상품').trim().slice(0, 240),
      priceKrw: Number.isFinite(price) && price > 0 ? Math.trunc(price) : 0,
      imageUrl: safeUrl(product?.imageUrl),
      clickUrl,
      category: String(product?.category || '추천').trim().slice(0, 60) || '추천',
      isRocket: Boolean(product?.isRocket),
      isFreeShipping: Boolean(product?.isFreeShipping),
    };
  }

  function formatPrice(value) {
    const amount = Number(value || 0);
    return amount > 0 ? `${new Intl.NumberFormat('ko-KR').format(amount)}원` : '가격 확인';
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error || new Error('IMAGE_READ_FAILED'));
      reader.readAsDataURL(blob);
    });
  }

  async function resolveImage(url) {
    if (!url) return '';
    if (imageCache.has(url)) return imageCache.get(url);
    const promise = fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const type = String(response.headers.get('content-type') || '').toLowerCase();
        if (!type.startsWith('image/')) throw new Error('NOT_IMAGE');
        return response.blob();
      })
      .then(blobToDataUrl)
      .catch(() => '');
    imageCache.set(url, promise);
    return promise;
  }

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      hydrateImage(entry.target);
    }
  }, { rootMargin: '180px 0px' }) : null;

  async function hydrateImage(img) {
    if (!img || img.dataset.loaded === '1') return;
    img.dataset.loaded = '1';
    const source = img.dataset.source || '';
    const dataUrl = await resolveImage(source);
    if (!dataUrl || !img.isConnected) return;
    img.src = dataUrl;
    img.classList.add('loaded');
  }

  function queueImage(img) {
    if (!img?.dataset.source) return;
    if (observer) observer.observe(img);
    else hydrateImage(img);
  }

  function makeBadge(text, light = false) {
    const badge = document.createElement('span');
    badge.className = `badge${light ? ' light' : ''}`;
    badge.textContent = text;
    return badge;
  }

  function makeCard(product) {
    const article = document.createElement('article');
    article.className = 'product-card';

    const media = document.createElement('div');
    media.className = 'product-media';
    const image = document.createElement('img');
    image.alt = product.productName;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.dataset.source = product.imageUrl;
    const placeholder = document.createElement('span');
    placeholder.className = 'product-placeholder';
    placeholder.textContent = 'EKODI MALL';
    const badges = document.createElement('div');
    badges.className = 'badge-row';
    if (product.isRocket) badges.append(makeBadge('로켓'));
    if (product.isFreeShipping) badges.append(makeBadge('무료배송', true));
    media.append(image, placeholder, badges);

    const body = document.createElement('div');
    body.className = 'product-body';
    const category = document.createElement('p');
    category.className = 'product-category';
    category.textContent = product.category;
    const title = document.createElement('h3');
    title.textContent = product.productName;
    const price = document.createElement('p');
    price.className = 'product-price';
    price.textContent = formatPrice(product.priceKrw);
    const link = document.createElement('a');
    link.className = 'buy-link';
    link.href = product.clickUrl;
    link.target = '_blank';
    link.rel = 'sponsored noopener noreferrer';
    link.textContent = '상품보기';
    body.append(category, title, price, link);
    article.append(media, body);
    queueMicrotask(() => queueImage(image));
    return article;
  }

  function filteredProducts() {
    const query = state.query.toLocaleLowerCase('ko-KR');
    return state.products.filter(product => {
      const categoryMatch = state.category === '전체' || product.category === state.category;
      const text = `${product.productName} ${product.category}`.toLocaleLowerCase('ko-KR');
      return categoryMatch && (!query || text.includes(query));
    });
  }

  function renderProducts() {
    const products = filteredProducts();
    grid.replaceChildren(...products.map(makeCard));
    empty.hidden = products.length > 0;
    if (!state.products.length) {
      statusNode.textContent = state.status === 'loading' ? '상품을 불러오고 있습니다.' : '';
    } else {
      statusNode.textContent = `${products.length}개 상품`;
    }
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
    const node = document.querySelector('#disclosureText');
    if (node) node.textContent = disclosure;
  }

  async function loadProducts() {
    state.status = 'loading';
    renderProducts();
    try {
      const response = await fetch(API, { method: 'GET', mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.products = Array.isArray(data.products) ? data.products.map(normalize).filter(Boolean) : [];
      state.status = state.products.length ? 'ready' : 'preparing';
      setDisclosure(data.disclosureText);
    } catch (error) {
      console.warn('EKODI Mall product catalog unavailable', error);
      state.products = [];
      state.status = 'preparing';
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
