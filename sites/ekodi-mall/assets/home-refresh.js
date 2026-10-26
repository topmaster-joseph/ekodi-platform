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
    window.EkodiContextCurator?.recommend(incomingQuery, true);
  }
  if (params.has('wishlist')) window.addEventListener('load', () => document.getElementById('wishBtn')?.click(), {once:true});

  form?.addEventListener('submit', (event) => {
    // Allow native GET form submission if this is not the Mall storefront.
    if (!search || !shop) return;
    event.preventDefault();
    const term = (query?.value || '').trim().slice(0, 120);
    search.value = term;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    if (term && window.EkodiContextCurator?.recommend) {
      const contextInput = document.getElementById('contextInput');
      if (contextInput) contextInput.value = term;
      window.EkodiContextCurator.recommend(term, true);
    } else {
      shop.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      search.focus({ preventScroll: true });
    }
  });

  document.querySelectorAll('a[data-filter-target]').forEach((link) => {
    link.addEventListener('click', () => {
      const type = link.getAttribute('data-filter-target');
      const button = [...document.querySelectorAll('#filters button[data-filter]')]
        .find((item) => item.dataset.filter === type);
      button?.click();
    });
  });
})();
