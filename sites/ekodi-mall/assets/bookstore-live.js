/* MALL-BOOKS-APPROVAL-SYNC-001
 * The public Mall mirrors the bookstore's signed, file-bound approval state.
 * This is display-only: actual checkout, entitlement and payment remain guarded
 * by the BOOKS commerce worker on every request. Never trust a local flag.
 */
(() => {
  'use strict';
  const BOOKS_API = '/books/api/commerce';
  const grid = document.getElementById('grid') || document.querySelector('[data-bookstore-store-grid]');
  const detailId = document.body?.dataset.bookstoreBookId || '';
  const validId = id => /^BOOK-[A-Z0-9-]{3,40}$/.test(String(id || ''));
  if (!grid && !validId(detailId)) return;
  const get = async url => {
    const response = await fetch(url, {
      method: 'GET', credentials: 'omit', cache: 'no-store',
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error('bookstore API ' + response.status);
    return response.json();
  };
  const readyQuote = (quote, bookId) =>
    validId(bookId) && quote?.book?.id === bookId &&
    quote?.saleReadiness?.ready === true &&
    quote?.checkout?.open === true &&
    quote?.checkout?.fileReady === true &&
    quote?.checkout?.saleReady === true &&
    quote?.checkout?.mode === 'live' &&
    Number(quote?.price?.amount) > 0;
  const quoteFor = bookId => get(BOOKS_API + '/quote?book=' + encodeURIComponent(bookId));
  // Stable cards come from the publishing-owned, allowlisted build projection.
  // Only the matching Buy CTA is revalidated. Never rebuild/remove a book card.
  let catalogRefresh = 0;
  const catalogCards = () => [...grid.querySelectorAll('[data-bookstore-runtime-id]')];
  function setBuyState(card, state, quote) {
    const button = card.querySelector('[data-bookstore-buy]');
    if (!button) return;
    const bookId = card.dataset.bookstoreRuntimeId;
    const ready = state === 'ready' && readyQuote(quote, bookId);
    // A link without href cannot trigger a payment or an unapproved checkout.
    if (ready) {
      button.href = '/ekodimall/checkout/book/?book=' + encodeURIComponent(bookId);
      button.removeAttribute('aria-disabled');
      button.removeAttribute('tabindex');
      button.textContent = new Intl.NumberFormat('ko-KR').format(Number(quote.price.amount)) + '원 구매하기';
    } else {
      button.removeAttribute('href');
      button.setAttribute('aria-disabled', 'true');
      button.setAttribute('tabindex', '-1');
      button.textContent = state === 'checking' ? '구매 확인 중' :
        state === 'unavailable' ? '구매 준비 중' : '구매 상태 확인 필요';
    }
    // Internal state informs sale-only search, never changes the card's book info.
    card.dataset.bookstoreQuotePending = ready ? 'false' : 'true';
    card.dataset.bookstoreInformational = 'true';
    card.dataset.saleReady = ready ? 'true' : 'false';
  }
  async function syncCatalog() {
    if (!grid) return;
    const version = ++catalogRefresh;
    const cards = catalogCards().filter(card => validId(card.dataset.bookstoreRuntimeId));
    // Every recognized book is checked independently, even when old static
    // publication workflow fields say "pending".
    const checks = cards.map(async card => {
      const bookId = card.dataset.bookstoreRuntimeId;
      setBuyState(card, 'checking');
      let quote = null;
      let state = 'error';
      try {
        quote = await quoteFor(bookId);
        state = readyQuote(quote, bookId) ? 'ready' : 'unavailable';
      } catch {
        state = 'error';
      }
      if (version !== catalogRefresh) return;
      setBuyState(card, state, quote);
    });
    await Promise.all(checks);
    if (version !== catalogRefresh) return;
    const count = document.querySelector('[data-bookstore-public-count]');
    const ready = cards.filter(card => card.dataset.saleReady === 'true').length;
    if (count) count.textContent = ready + '개 판매 가능';
    const status = document.querySelector('[data-bookstore-store-status]');
    if (status) status.textContent = ready ? '전자책 구매 가능' : '구매 가능 여부 확인 필요';
    window.dispatchEvent(new CustomEvent('ekodi:marketplace-products-loaded', {
      detail: { category: 'book', count: ready, source: 'books-quote', total: cards.length }
    }));
  }
  let detailRefresh = 0;
  async function syncDetail() {
    if (!validId(detailId)) return;
    const status = document.querySelector('[data-bookstore-sale-status] dd');
    const link = document.querySelector('[data-bookstore-purchase-link]');
    const note = document.querySelector('[data-bookstore-transaction-note]');
    const price = document.querySelector('[data-bookstore-price]');
    if (!link || !status) return;
    const setSection = (label, value) => {
      for (const block of document.querySelectorAll('.product-info-block')) {
        if (block.querySelector('small')?.textContent?.trim() !== label) continue;
        const body = block.querySelector('p');
        if (body) body.textContent = value;
      }
    };
    const detailsHref = '/books/book/?id=' + encodeURIComponent(detailId);
    const refresh = ++detailRefresh;
    let quote = null;
    try { quote = await quoteFor(detailId); } catch { /* Do not assume an approval. */ }
    if (refresh !== detailRefresh) return;
    if (readyQuote(quote, detailId)) {
      status.textContent = '판매 중';
      if (price) price.textContent = new Intl.NumberFormat('ko-KR').format(Number(quote.price.amount)) + '원';
      // MALL-BOOKS-DIRECT-CHECKOUT-001: 출처(에코디서점)는 안내하되 구매는 에코디몰 화면에서 바로 진행한다.
      const mallBase = String(window.location?.pathname || '').startsWith('/ekodimall') ? '/ekodimall' : '';
      link.href = mallBase + '/checkout/book/?book=' + encodeURIComponent(detailId);
      link.textContent = '에코디몰에서 바로 구매';
      link.classList.add('primary'); link.classList.remove('ghost');
      link.target = '_self'; link.rel = 'noopener';
      if (note) note.textContent = '에코디서점(출처)이 출판·승인한 전자책을 에코디몰에서 직접 판매합니다. 에코디몰에서 바로 결제하고, 구매한 전자책은 같은 EKODI 계정의 내 서재에서 열람합니다. 구매에는 로그인이 필요합니다.';
      setSection('STATUS', '판매 중. 에코디서점의 실시간 승인과 EPUB 파일을 확인했습니다.');
      setSection('COMMERCE', '에코디몰 직접판매 전자책입니다(출처: 에코디서점, 판매자: 에코디비즈). 로그인 후 에코디몰에서 안전하게 결제하고 내 서재에서 열람합니다.');
    } else {
      // A revoked edition or replaced EPUB cannot retain a stale purchase link.
      status.textContent = '판매 상태 확인 필요';
      if (price) price.textContent = '가격 확인 필요';
      link.href = detailsHref; link.textContent = '에코디서점에서 상태 확인';
      link.classList.remove('primary'); link.classList.add('ghost');
      link.target = '_self'; link.rel = 'noopener';
      if (note) note.textContent = '판매 상태와 전자책 파일을 확인하고 있습니다. 구매 가능 여부는 에코디서점에서 다시 확인해 주세요.';
      setSection('STATUS', '구매 상태를 다시 확인하고 있습니다. 승인 철회 또는 EPUB 파일 변경 시 구매가 중단됩니다.');
      setSection('COMMERCE', '현재 구매 가능 여부는 에코디서점에서 확인해 주세요.');
    }
  }
  async function refresh() { await Promise.all([syncCatalog(), syncDetail()]); }
  void refresh();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
})();
