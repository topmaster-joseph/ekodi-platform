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
  // In-place catalog panel: the canonical #grid remains the source of product truth.
  const header = document.querySelector('.mall-header');
  const nav = header?.querySelector('.mall-primary-nav');
  const catalog = document.querySelector('#grid');
  if (header && nav && catalog) {
    const panel = document.createElement('section');
    panel.id = 'mallNavProducts';
    panel.setAttribute('aria-label', '선택한 카테고리 상품');
    panel.hidden = true;
    panel.innerHTML = '<div class="mall-nav-panel-inner"><div class="mall-nav-panel-heading"><h2 id="mallNavProductsTitle"></h2><button type="button" id="mallNavClose" aria-label="상품 목록 닫기">닫기 ×</button></div><div id="mallNavProductsGrid" class="grid" aria-live="polite"></div><p id="mallNavProductsEmpty" hidden>표시할 상품이 없습니다.</p><a id="mallNavMore" href="#shop">전체 목록 보기 →</a></div>';
    header.insertAdjacentElement('afterend', panel);
    const results = panel.querySelector('#mallNavProductsGrid');
    const empty = panel.querySelector('#mallNavProductsEmpty');
    const more = panel.querySelector('#mallNavMore');
    const title = panel.querySelector('#mallNavProductsTitle');
    const close = () => { panel.hidden = true; nav.querySelectorAll('[aria-current]').forEach(a => a.removeAttribute('aria-current')); };
    panel.querySelector('#mallNavClose').addEventListener('click', close);
    const sheet = document.createElement('style');
    sheet.textContent = '#mallNavProducts{background:#fff;border-bottom:1px solid #e3e9ef;padding:20px max(16px,calc((100vw - 1240px)/2));}#mallNavProducts[hidden]{display:none} .mall-nav-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px}.mall-nav-panel-heading h2{margin:0;font-size:22px}.mall-nav-panel-heading button{border:1px solid #d9e1e8;border-radius:20px;background:#fff;padding:7px 14px;cursor:pointer}#mallNavProductsGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:14px}#mallNavProductsGrid [data-wish]{pointer-events:none}#mallNavMore{display:inline-block;margin-top:14px;font-weight:700} .mall-primary-nav a[aria-current="true"]{border-bottom:3px solid #e65b36}';
    document.head.append(sheet);
    const map = {'전체상품':'all','로컬·특산물':'local','식품·건강':'general','생활·가전':'living','책·배움':'book','선물·기념품':'gift'};
    const redraw = (type) => {
      results.replaceChildren();
      const region = window.EkodiLocal?.getSelectedRegionId?.() || '';
      const matched = [...catalog.querySelectorAll('[data-product]')].filter(card => {
        if (type === 'all') return true;
        if (type === 'local') {
          const ids = (card.dataset.regionIds || '').split(',').map(s=>s.trim()).filter(Boolean);
          return ids.length && (!region || ids.includes(region));
        }
        return card.dataset.category === type;
      });
      matched.slice(0,12).forEach(card => {
        const copy = card.cloneNode(true);
        copy.hidden = false;
        copy.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
        copy.querySelectorAll('[data-wish]').forEach(button=>button.remove());
        results.append(copy);
      });
      empty.hidden = matched.length > 0;
    };
    nav.querySelectorAll('a').forEach(anchor => {
      const type = map[anchor.textContent.trim()];
      if (!type) return;
      anchor.addEventListener('click', event => {
        event.preventDefault();
        const same = !panel.hidden && anchor.getAttribute('aria-current') === 'true';
        close();
        if (same) return;
        anchor.setAttribute('aria-current','true');
        title.textContent = anchor.textContent.trim() + ' 상품';
        more.href = '#shop';
        panel.hidden = false;
        redraw(type);
        const filter = [...document.querySelectorAll('#filters [data-filter]')].find(btn=>btn.dataset.filter===type);
        filter?.click();
        history.replaceState(null,'',location.pathname+location.search+'#shop');
        panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      });
    });
    window.addEventListener('ekodi:marketplace-products-loaded',()=> {
      const current = nav.querySelector('a[aria-current="true"]');
      if (current && !panel.hidden) redraw(map[current.textContent.trim()]);
    });
  }

})();
