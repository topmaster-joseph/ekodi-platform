/* Progressive enhancement: the existing marketplace filters, search and wishlist remain authoritative. */
(() => {
  const form = document.getElementById('mallGlobalSearch');
  const query = document.getElementById('mallGlobalQuery');
  const search = document.getElementById('search');
  const shop = document.getElementById('shop');
  const params = new URLSearchParams(window.location.search);
  const incomingQuery = (params.get('q') || '').trim().slice(0,120);
  // Old AI-only Mall bookmarks now resolve to the weekly recommendation page.
  if (window.location.hash === '#recommend') {
    window.location.replace('/ekodimall/picks#recommend');
    return;
  }
  if (search && incomingQuery) {
    search.value = incomingQuery;
    if (query) query.value = incomingQuery;
    search.dispatchEvent(new Event('input', { bubbles:true }));
  }
  if (params.has('wishlist')) window.addEventListener('load', () => document.getElementById('wishBtn')?.click(), {once:true});

  form?.addEventListener('submit', (event) => {
    // Allow native GET form submission if this is not the Mall storefront.
    if (!search || !shop) return;
    event.preventDefault();
    const term = (query?.value || '').trim().slice(0, 120);
    navigate('#shop', 'all');
    const target = new URL(window.location.href);
    if (term) target.searchParams.set('q', term);
    window.history.replaceState(null, '', target.pathname + target.search + target.hash);
    syncView();
    shop.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    search.focus({ preventScroll: true });
  });

  // The storefront has only home and catalog views; AI discovery lives on weekly picks.
  // A single canonical #grid is retained: no cloned cards, duplicate hearts or overlay panels.
  const nav = document.querySelector('.mall-primary-nav');
  const allTypes = new Set(['all','general','living','book','gift','local']);
  const filterButtons = [...document.querySelectorAll('#filters button[data-filter]')];
  const viewFromUrl = () => {
    const current = new URL(window.location.href);
    if (current.hash === '#shop' || current.searchParams.has('category') || current.searchParams.has('q')) return 'catalog';
    return 'home';
  };
  const catalogHeadings = {all:['ALL MARKET','전체상품','에코디몰의 상품을 한눈에 살펴보세요.'],local:['LOCAL MARKET','로컬·특산물','지역의 가치와 이야기를 담은 상품을 만나보세요.'],general:['FOOD & WELLNESS','식품·건강','먹거리와 건강한 일상을 위한 상품을 살펴보세요.'],living:['LIVING & TECH','생활·가전','일상의 편리함을 더하는 상품을 만나보세요.'],book:['BOOKS & LEARNING','책·배움','읽고 배우며 성장하는 상품을 살펴보세요.'],gift:['GIFTS','선물·기념품','마음을 전하는 선물과 기념품을 만나보세요.']};
  const categoryFromUrl = () => {
    const value = new URLSearchParams(window.location.search).get('category') || 'all';
    return allTypes.has(value) ? value : 'all';
  };
  function syncView() {
    const mode = viewFromUrl();
    document.body.dataset.mallView = mode;
    const category = categoryFromUrl();
    const heading = shop?.querySelector('.heading');
    const copy = catalogHeadings[category] || catalogHeadings.all;
    const eyebrow = heading?.querySelector('.eyebrow');
    const title = heading?.querySelector('h2');
    const description = heading?.querySelector('div > p:not(.eyebrow)');
    if (eyebrow) eyebrow.textContent = copy[0];
    if (title) title.textContent = copy[1];
    if (description) description.textContent = copy[2];
    nav?.querySelectorAll('a[aria-current]').forEach(anchor => anchor.removeAttribute('aria-current'));
    if (mode === 'catalog') {
      const button = filterButtons.find(item => item.dataset.filter === category);
      if (button && !button.classList.contains('active')) button.click();
      nav?.querySelector(`a[data-filter-target="${category}"]`)?.setAttribute('aria-current', 'page');
    }
    const urlSearch = new URLSearchParams(window.location.search).get('q') || '';
    if (query) query.value = urlSearch;
    if (search && search.value !== urlSearch) {
      search.value = urlSearch;
      search.dispatchEvent(new Event('input', { bubbles:true }));
    }
  }
  function navigate(hash, category, { keepSearch = false } = {}) {
    const next = new URL(window.location.href);
    next.hash = hash;
    next.searchParams.delete('category');
    if (!keepSearch) next.searchParams.delete('q');
    if (hash === '#shop' && category && category !== 'all' && allTypes.has(category)) next.searchParams.set('category', category);
    window.history.pushState(null, '', next.pathname + next.search + next.hash);
    syncView();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  // Category tabs and mobile shortcuts show ONLY their actual products, directly under the header.
  document.querySelectorAll('a[data-filter-target]').forEach(link => {
    link.addEventListener('click', event => {
      const category = link.getAttribute('data-filter-target');
      if (!allTypes.has(category)) return;
      event.preventDefault();
      navigate('#shop', category);
    });
  });
  // Home, product and AI links (including back/forward/direct URLs) share one route contract.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('data-filter-target')) return;
    const hash = link.getAttribute('href');
    if (!['#shop', '#top'].includes(hash)) return;
    event.preventDefault();
    navigate(hash, 'all');
  });
  // Keep the selected filter deep-linkable, including /?category=book from the bookstore.
  filterButtons.forEach(button => button.addEventListener('click', () => {
    if (document.body.dataset.mallView !== 'catalog') return;
    const next = new URL(window.location.href);
    next.searchParams.delete('category');
    if (button.dataset.filter !== 'all') next.searchParams.set('category', button.dataset.filter);
    next.hash = '#shop';
    window.history.replaceState(null, '', next.pathname + next.search + next.hash);
    nav?.querySelectorAll('a[aria-current]').forEach(anchor => anchor.removeAttribute('aria-current'));
    nav?.querySelector(`a[data-filter-target="${button.dataset.filter}"]`)?.setAttribute('aria-current','page');
  }));
  // Homepage context chips use the weekly-picks recommendation form (no legacy AI page).
  document.addEventListener('click', event => {
    const chip = event.target.closest('[data-context-prompt]');
    if (!chip) return;
    const term = (chip.dataset.contextPrompt || '').trim().slice(0,180);
    const url = new URL('/ekodimall/picks', window.location.origin);
    if (term) url.searchParams.set('q', term);
    url.hash = 'recommend';
    window.location.assign(url.toString());
  });
  window.addEventListener('popstate', syncView);
  window.addEventListener('hashchange', syncView);
  syncView();
})();
