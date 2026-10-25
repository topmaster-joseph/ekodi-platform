/* Progressive enhancement: the existing marketplace filters, search and wishlist remain authoritative. */
(() => {
  const form = document.getElementById('mallGlobalSearch');
  const query = document.getElementById('mallGlobalQuery');
  const search = document.getElementById('search');
  const shop = document.getElementById('shop');

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!search || !shop) return;
    search.value = (query?.value || '').trim();
    search.dispatchEvent(new Event('input', { bubbles: true }));
    shop.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (search.value) search.focus({ preventScroll: true });
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
