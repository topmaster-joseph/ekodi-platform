(() => {
  const grid = document.querySelector('#grid');
  if (!grid) return;

  const cards = () => [...grid.querySelectorAll('[data-product]')];
  const search = document.querySelector('#search');
  const empty = document.querySelector('#empty');
  const filterButtons = [...document.querySelectorAll('#filters [data-filter]')];
  const dialog = document.querySelector('#wishDialog');
  const wishlistNode = document.querySelector('#wishList');
  const storageKey = 'ekodiMallWishes';
  let filter = 'all';
  let wishes = readWishes();

  function readWishes() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }
  function saveWishes() { localStorage.setItem(storageKey, JSON.stringify(wishes)); }
  function updateCount() {
    const count = String(wishes.length);
    const desktop = document.querySelector('#wishCount');
    const mobile = document.querySelector('#mobileCount');
    if (desktop) desktop.textContent = count;
    if (mobile) mobile.textContent = count;
  }
  function syncHearts() {
    document.querySelectorAll('[data-wish]').forEach((button) => {
      const active = wishes.includes(button.dataset.wish);
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }
  function render() {
    const query = (search?.value || '').trim().toLowerCase();
    let visible = 0;
    cards().forEach((card) => {
      const categoryMatch = filter === 'all' || card.dataset.category === filter;
      const searchMatch = !query || (card.dataset.search || '').includes(query);
      card.hidden = !(categoryMatch && searchMatch);
      if (!card.hidden) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
    syncHearts();
    updateCount();
  }

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      filterButtons.forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      filter = button.dataset.filter || 'all';
      render();
    });
  });
  search?.addEventListener('input', render);
  document.querySelector('#searchBtn')?.addEventListener('click', () => {
    location.hash = 'shop';
    window.setTimeout(() => search?.focus(), 220);
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-wish]');
    if (!button) return;
    const id = button.dataset.wish;
    wishes = wishes.includes(id) ? wishes.filter((item) => item !== id) : [...wishes, id];
    saveWishes();
    render();
  });

  function openWishlist() {
    const selected = cards().filter((card) => wishes.includes(card.dataset.product));
    if (wishlistNode) {
      wishlistNode.replaceChildren();
      if (!selected.length) {
        const emptyText = document.createElement('p'); emptyText.textContent = '관심상품이 없습니다.'; emptyText.style.color = '#68726d'; wishlistNode.append(emptyText);
      } else {
        selected.forEach((card) => {
          const row = document.createElement('div'); row.className = 'wishrow';
          const info = document.createElement('div');
          const link = document.createElement('a'); link.href = card.dataset.href || '#';
          const strong = document.createElement('b'); strong.textContent = card.dataset.name || '상품'; link.append(strong);
          const br = document.createElement('br');
          const small = document.createElement('small'); small.textContent = card.dataset.status || '상품';
          info.append(link, br, small);
          const remove = document.createElement('button'); remove.className = 'smallbtn'; remove.dataset.remove = card.dataset.product; remove.textContent = '삭제';
          row.append(info, remove); wishlistNode.append(row);
        });
      }
    }
    dialog?.showModal();
  }

  document.querySelector('#wishBtn')?.addEventListener('click', openWishlist);
  document.querySelector('#mobileWish')?.addEventListener('click', openWishlist);
  document.querySelector('#closeWish')?.addEventListener('click', () => dialog?.close());
  wishlistNode?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    wishes = wishes.filter((item) => item !== button.dataset.remove);
    saveWishes(); render(); openWishlist();
  });
  window.addEventListener('ekodi:marketplace-products-loaded', render);
  render();
})();
