(() => {
  const KEY = 'ekodiMallInquiryBasketV1';
  const MAX_QTY = 99;

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(value)) return [];
      return value.filter((item) => item && typeof item.id === 'string').map((item) => ({
        id: item.id,
        name: String(item.name || '').slice(0, 140),
        store: String(item.store || '').slice(0, 120),
        status: String(item.status || '').slice(0, 80),
        href: String(item.href || '/').slice(0, 300),
        qty: Math.min(MAX_QTY, Math.max(1, Number(item.qty) || 1))
      }));
    } catch {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    syncCount(items);
  }

  function syncCount(items = read()) {
    const count = items.reduce((sum, item) => sum + item.qty, 0);
    document.querySelectorAll('[data-basket-count]').forEach((node) => {
      node.textContent = String(count);
      node.hidden = count === 0;
    });
  }

  function addFromButton(button) {
    const id = String(button.dataset.productId || '').trim();
    if (!id) return;
    const items = read();
    const existing = items.find((item) => item.id === id);
    if (existing) existing.qty = Math.min(MAX_QTY, existing.qty + 1);
    else items.push({
      id,
      name: button.dataset.productName || '상품',
      store: button.dataset.storeName || '',
      status: button.dataset.productStatus || '',
      href: button.dataset.productHref || location.pathname,
      qty: 1
    });
    save(items);
    const original = button.textContent;
    button.textContent = '담았습니다 ✓';
    button.disabled = true;
    window.setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
    }, 900);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderBasket() {
    const root = document.querySelector('#basketItems');
    if (!root) return;
    const items = read();
    root.replaceChildren();

    const empty = document.querySelector('#basketEmpty');
    const actions = document.querySelector('#basketActions');
    const summary = document.querySelector('#basketSummary');
    if (empty) empty.hidden = items.length > 0;
    if (actions) actions.hidden = items.length === 0;
    if (summary) summary.textContent = `${items.length}종 · 총 ${items.reduce((sum, item) => sum + item.qty, 0)}개`;

    items.forEach((item) => {
      const row = element('article', 'basket-row');
      const copy = element('div', 'basket-row-copy');
      const store = element('small', '', item.store || 'EKODI MALL');
      const link = element('a', '', item.name);
      link.href = item.href || '/';
      const status = element('span', 'basket-status', item.status || '상담 준비');
      copy.append(store, link, status);

      const controls = element('div', 'basket-controls');
      const minus = element('button', 'basket-qty', '−');
      minus.type = 'button';
      minus.dataset.basketMinus = item.id;
      minus.setAttribute('aria-label', `${item.name} 수량 줄이기`);
      const qty = element('b', 'basket-number', String(item.qty));
      const plus = element('button', 'basket-qty', '+');
      plus.type = 'button';
      plus.dataset.basketPlus = item.id;
      plus.setAttribute('aria-label', `${item.name} 수량 늘리기`);
      const remove = element('button', 'basket-remove', '삭제');
      remove.type = 'button';
      remove.dataset.basketRemove = item.id;
      controls.append(minus, qty, plus, remove);
      row.append(copy, controls);
      root.append(row);
    });
  }

  function mutate(id, delta) {
    const items = read();
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    item.qty = Math.min(MAX_QTY, Math.max(1, item.qty + delta));
    save(items);
    renderBasket();
  }

  function remove(id) {
    save(read().filter((item) => item.id !== id));
    renderBasket();
  }

  function inquiryText() {
    const items = read();
    const lines = ['[EKODI MALL 상품 상담 요청]', ''];
    items.forEach((item, index) => lines.push(`${index + 1}. ${item.name} × ${item.qty}${item.store ? ` · ${item.store}` : ''}`));
    lines.push('', '※ 현재 온라인 주문·결제가 아닌 상품 상담 요청용 목록입니다.');
    return lines.join('\n');
  }

  async function copyInquiry(button) {
    const text = inquiryText();
    try {
      await navigator.clipboard.writeText(text);
      const original = button.textContent;
      button.textContent = '상담 목록 복사 완료 ✓';
      window.setTimeout(() => { button.textContent = original; }, 1300);
    } catch {
      const area = document.querySelector('#basketCopyFallback');
      if (area) {
        area.hidden = false;
        area.value = text;
        area.focus();
        area.select();
      }
    }
  }

  document.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add-basket]');
    if (add) return addFromButton(add);
    const plus = event.target.closest('[data-basket-plus]');
    if (plus) return mutate(plus.dataset.basketPlus, 1);
    const minus = event.target.closest('[data-basket-minus]');
    if (minus) return mutate(minus.dataset.basketMinus, -1);
    const removeButton = event.target.closest('[data-basket-remove]');
    if (removeButton) return remove(removeButton.dataset.basketRemove);
    const clear = event.target.closest('[data-basket-clear]');
    if (clear) {
      if (window.confirm('상담 바구니를 비울까요?')) {
        save([]);
        renderBasket();
      }
      return;
    }
    const copy = event.target.closest('[data-basket-copy]');
    if (copy) copyInquiry(copy);
  });

  syncCount();
  renderBasket();
})();
