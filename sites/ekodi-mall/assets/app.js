(() => {
  const grid = document.querySelector('#grid');
  if (!grid) return;

  const cards = [...grid.querySelectorAll('[data-product]')];
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
    } catch {
      return [];
    }
  }

  function saveWishes() {
    localStorage.setItem(storageKey, JSON.stringify(wishes));
  }

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
    cards.forEach((card) => {
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
    const selected = cards.filter((card) => wishes.includes(card.dataset.product));
    if (wishlistNode) {
      wishlistNode.innerHTML = selected.length
        ? selected.map((card) => {
            const id = card.dataset.product;
            const name = card.dataset.name;
            const status = card.dataset.status;
            const href = card.dataset.href;
            return `<div class="wishrow"><div><a href="${href}"><b>${name}</b></a><br><small>${status}</small></div><button class="smallbtn" data-remove="${id}">삭제</button></div>`;
          }).join('')
        : '<p style="color:#68726d">관심상품이 없습니다.</p>';
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
    saveWishes();
    render();
    openWishlist();
  });

  render();
})();
