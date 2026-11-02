/* Progressive enhancement: the existing marketplace filters, search and wishlist remain authoritative. */
(() => {
  const form = document.getElementById('mallGlobalSearch');
  const query = document.getElementById('mallGlobalQuery');
  const search = document.getElementById('search');
  const shop = document.getElementById('shop');
  const params = new URLSearchParams(window.location.search);
  const incomingQuery = (params.get('q') || '').trim().slice(0,120);
  if (search && incomingQuery) {
    search.value = incomingQuery;
    if (query) query.value = incomingQuery;
    search.dispatchEvent(new Event('input', { bubbles:true }));
    // The entire catalog, including affiliate offers, is searched by the curator.
    window.EkodiContextCurator?.recommend(incomingQuery, false);
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
    if (term && window.EkodiContextCurator?.recommend) {
      const contextInput = document.getElementById('contextInput');
      if (contextInput) contextInput.value = term;
      window.EkodiContextCurator.recommend(term, false);
    } else {
      shop.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      search.focus({ preventScroll: true });
    }
  });

  // The Mall is one page with two explicit detail views: catalog and AI recommendations.
  // A single canonical #grid is retained: no cloned cards, duplicate hearts or overlay panels.
  const nav = document.querySelector('.mall-primary-nav');
  const allTypes = new Set(['all','general','living','book','gift','local']);
  const filterButtons = [...document.querySelectorAll('#filters button[data-filter]')];
  const aiForm = document.getElementById('mallRecommendSearchForm');
  const aiInput = document.getElementById('mallRecommendSearchInput');
  const viewFromUrl = () => {
    const current = new URL(window.location.href);
    if (current.hash === '#recommend') return 'recommend';
    if (current.hash === '#shop' || current.searchParams.has('category') || current.searchParams.has('q')) return 'catalog';
    return 'home';
  };
  const categoryFromUrl = () => {
    const value = new URLSearchParams(window.location.search).get('category') || 'all';
    return allTypes.has(value) ? value : 'all';
  };
  function syncView() {
    const mode = viewFromUrl();
    document.body.dataset.mallView = mode;
    const category = categoryFromUrl();
    nav?.querySelectorAll('a[aria-current]').forEach(anchor => anchor.removeAttribute('aria-current'));
    if (mode === 'catalog') {
      const button = filterButtons.find(item => item.dataset.filter === category);
      if (button && !button.classList.contains('active')) button.click();
      nav?.querySelector(`a[data-filter-target="${category}"]`)?.setAttribute('aria-current', 'page');
    } else if (mode === 'recommend') {
      nav?.querySelector('a[href="#recommend"]')?.setAttribute('aria-current', 'page');
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
    if (!['#shop', '#recommend', '#top'].includes(hash)) return;
    event.preventDefault();
    navigate(hash, 'all', { keepSearch: hash === '#recommend' });
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
  aiForm?.addEventListener('submit', event => {
    event.preventDefault();
    const term = (aiInput?.value || '').trim().slice(0,180);
    if (!term) { aiInput?.focus(); return; }
    const contextInput = document.getElementById('contextInput');
    if (contextInput) contextInput.value = term;
    window.EkodiContextCurator?.recommend(term, true);
  });
  window.addEventListener('popstate', syncView);
  window.addEventListener('hashchange', syncView);
  syncView();
})();
