(() => {
  'use strict';

  const API = 'https://api.ekodi.kr/api/affiliate/public/products?storefront=ekodi-mall&limit=100';
  const DEFAULT_DISCLOSURE = '쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
  const SORT_LABELS = {
    registered: '등록순',
    popular: '인기순',
    'price-asc': '가격 낮은순',
    'price-desc': '가격 높은순',
  };
  const state = { products: [], category: '전체', query: '', sort: 'registered', status: 'loading', dialogProductId: '' };
  const grid = document.querySelector('#productGrid');
  const empty = document.querySelector('#emptyState');
  const categories = document.querySelector('#categoryBar');
  const search = document.querySelector('#productSearch');
  const sort = document.querySelector('#productSort');
  const statusNode = document.querySelector('#catalogStatus');
  const dialog = document.querySelector('#productDialog');
  const dialogClose = document.querySelector('#productDialogClose');
  const dialogImage = document.querySelector('#productDialogImage');
  const dialogPlaceholder = document.querySelector('#productDialogPlaceholder');
  const dialogCategory = document.querySelector('#productDialogCategory');
  const dialogTitle = document.querySelector('#productDialogTitle');
  const dialogPrice = document.querySelector('#productDialogPrice');
  const dialogBadges = document.querySelector('#productDialogBadges');
  const dialogBuy = document.querySelector('#productDialogBuy');
  const imageCache = new Map();

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.toString() : '';
    } catch { return ''; }
  }

  function normalize(product, popularityRank = 0) {
    const clickUrl = safeUrl(product?.clickUrl);
    if (!clickUrl) return null;
    const price = Number(product?.priceKrw || 0);
    const selectedAt = String(product?.selectedAt || '').trim();
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
      selectedAt,
      popularityRank: Number.isInteger(popularityRank) ? popularityRank : 0,
    };
  }

  function formatPrice(value) {
    const amount = Number(value || 0);
    return amount > 0 ? `${new Intl.NumberFormat('ko-KR').format(amount)}원` : '가격 확인';
  }

  function timestamp(value) {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
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

  function renderDialogBadges(product) {
    if (!dialogBadges) return;
    const items = [];
    if (product.isRocket) items.push(makeBadge('로켓'));
    if (product.isFreeShipping) items.push(makeBadge('무료배송', true));
    dialogBadges.replaceChildren(...items);
  }

  async function openProductDialog(product) {
    if (!dialog || !product) return;
    state.dialogProductId = product.id;
    if (dialogCategory) dialogCategory.textContent = product.category;
    if (dialogTitle) dialogTitle.textContent = product.productName;
    if (dialogPrice) dialogPrice.textContent = formatPrice(product.priceKrw);
    if (dialogBuy) dialogBuy.href = product.clickUrl;
    renderDialogBadges(product);
    if (dialogImage) {
      dialogImage.alt = product.productName;
      dialogImage.removeAttribute('src');
    }
    if (dialogPlaceholder) dialogPlaceholder.hidden = false;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    const dataUrl = await resolveImage(product.imageUrl);
    if (!dataUrl || state.dialogProductId !== product.id || !dialog.open || !dialogImage) return;
    dialogImage.src = dataUrl;
    if (dialogPlaceholder) dialogPlaceholder.hidden = true;
  }

  function closeProductDialog() {
    state.dialogProductId = '';
    if (dialog?.open) dialog.close();
  }

  function makeCard(product) {
    const article = document.createElement('article');
    article.className = 'product-card';

    const media = document.createElement('button');
    media.type = 'button';
    media.className = 'product-media product-media-trigger';
    media.setAttribute('aria-label', `${product.productName} 상품 정보 보기`);
    media.addEventListener('click', () => openProductDialog(product));
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
    const detail = document.createElement('button');
    detail.type = 'button';
    detail.className = 'detail-button';
    detail.textContent = '상품정보 보기';
    detail.addEventListener('click', () => openProductDialog(product));
    body.append(category, title, price, detail);
    article.append(media, body);
    queueMicrotask(() => queueImage(image));
    return article;
  }

  function sortProducts(products) {
    const list = [...products];
    const fallback = (a, b) => a.popularityRank - b.popularityRank;
    if (state.sort === 'popular') return list.sort(fallback);
    if (state.sort === 'price-asc') {
      return list.sort((a, b) => {
        if (!a.priceKrw && !b.priceKrw) return fallback(a, b);
        if (!a.priceKrw) return 1;
        if (!b.priceKrw) return -1;
        return a.priceKrw - b.priceKrw || fallback(a, b);
      });
    }
    if (state.sort === 'price-desc') {
      return list.sort((a, b) => {
        if (!a.priceKrw && !b.priceKrw) return fallback(a, b);
        if (!a.priceKrw) return 1;
        if (!b.priceKrw) return -1;
        return b.priceKrw - a.priceKrw || fallback(a, b);
      });
    }
    return list.sort((a, b) => timestamp(b.selectedAt) - timestamp(a.selectedAt) || Number(b.id || 0) - Number(a.id || 0) || fallback(a, b));
  }

  function filteredProducts() {
    const query = state.query.toLocaleLowerCase('ko-KR');
    const filtered = state.products.filter(product => {
      const categoryMatch = state.category === '전체' || product.category === state.category;
      const text = `${product.productName} ${product.category}`.toLocaleLowerCase('ko-KR');
      return categoryMatch && (!query || text.includes(query));
    });
    return sortProducts(filtered);
  }

  function renderProducts() {
    const products = filteredProducts();
    grid.replaceChildren(...products.map(makeCard));
    empty.hidden = products.length > 0;
    if (!state.products.length) {
      statusNode.textContent = state.status === 'loading' ? '상품을 불러오고 있습니다.' : '';
    } else {
      statusNode.textContent = `${products.length}개 상품 · ${SORT_LABELS[state.sort] || '등록순'}`;
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

  sort?.addEventListener('change', event => {
    const value = String(event.currentTarget.value || 'registered');
    state.sort = Object.hasOwn(SORT_LABELS, value) ? value : 'registered';
    renderProducts();
  });

  dialogClose?.addEventListener('click', closeProductDialog);
  dialog?.addEventListener('click', event => {
    if (event.target === dialog) closeProductDialog();
  });
  dialog?.addEventListener('close', () => {
    state.dialogProductId = '';
    if (dialogImage) dialogImage.removeAttribute('src');
    if (dialogPlaceholder) dialogPlaceholder.hidden = false;
  });

  loadProducts();
})();
