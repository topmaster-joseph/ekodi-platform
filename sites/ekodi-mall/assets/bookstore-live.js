/* MALL-BOOKS-APPROVAL-SYNC-001
 * The public Mall mirrors the bookstore's signed, file-bound approval state.
 * This is display-only: actual checkout, entitlement and payment remain guarded
 * by the BOOKS commerce worker on every request. Never trust a local flag.
 */
(() => {
  'use strict';
  const BOOKS_API = '/books/api/commerce';
  const mirrorUrl = '/ekodimall/provider-bookstore.json';
  const grid = document.getElementById('grid') || document.querySelector('[data-bookstore-store-grid]');
  const detailId = document.body?.dataset.bookstoreBookId || '';
  const validId = id => /^BOOK-[A-Z0-9-]{3,40}$/.test(String(id || ''));
  if (!grid && !validId(detailId)) return;
  const safe = value => String(value ?? '').trim();
  const element = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = safe(text);
    return node;
  };
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
  const detailHref = slug => /^book-[a-z0-9-]+$/.test(safe(slug))
    ? '/ekodimall/products/' + encodeURIComponent(slug) + '/' : '';
  const bookCover = image => {
    try {
      const url = new URL(safe(image), window.location.origin);
      return url.origin === window.location.origin && url.pathname.startsWith('/books/assets/')
        ? url.href : '';
    } catch { return ''; }
  };
  function productCard(book) {
    const href = detailHref(book.slug);
    if (!href) return null;
    const article = element('article', 'card');
    article.dataset.product = safe(book.id);
    article.dataset.bookstoreRuntimeId = safe(book.bookId);
    article.dataset.category = 'book';
    article.dataset.name = safe(book.name);
    article.dataset.status = '판매 중';
    article.dataset.saleReady = 'true';
    article.dataset.search = [book.name, book.description, '에코디서점', '전자책', '책·배움'].map(safe).join(' ').toLowerCase();
    article.dataset.href = href;
    const thumb = element('div', 'thumb book');
    const photo = element('a', 'thumb-link');
    photo.href = href;
    photo.setAttribute('aria-label', article.dataset.name + ' 자세히 보기');
    const source = bookCover(book.image);
    if (source) {
      const image = element('img');
      image.src = source; image.alt = article.dataset.name;
      image.loading = 'lazy'; image.decoding = 'async';
      photo.append(image); thumb.classList.add('has-image');
    }
    const badge = element('span', 'badge', '에코디서점');
    const heart = element('button', 'heart', '♡');
    heart.type = 'button'; heart.dataset.wish = article.dataset.product;
    heart.setAttribute('aria-label', article.dataset.name + ' 관심상품');
    heart.setAttribute('aria-pressed', 'false');
    thumb.append(photo, badge, heart);
    const body = element('div', 'card-body');
    const store = element('p', 'store-kicker');
    const storeLink = element('a', '', 'EKODI Books');
    storeLink.href = '/ekodimall/stores/ekodi-books/';
    store.append(storeLink);
    const heading = element('h3');
    const title = element('a', '', book.name); title.href = href; heading.append(title);
    const abstract = safe(book.description);
    const summary = element('p', 'card-summary', abstract.length > 34 ? abstract.slice(0, 33).trimEnd() + '…' : abstract);
    const meta = element('div', 'meta');
    const amount = Number(book.price);
    // Only show the amount returned by a verified live Books quote, never invent a list price.
    const priceLabel = Number.isFinite(amount) && amount > 0 ? new Intl.NumberFormat('ko-KR').format(amount) + '원' : '가격 확인';
    const status = element('span', 'status', priceLabel + ' · 판매 중');
    const more = element('a', 'smallbtn', '자세히'); more.href = href;
    meta.append(status, more); body.append(store, heading, summary, meta);
    article.append(thumb, body);
    return article;
  }
  async function syncCatalog() {
    if (!grid) return;
    let released = new Map();
    try {
      const [mirror, approvals] = await Promise.all([get(mirrorUrl), get(BOOKS_API + '/public/approvals')]);
      const approved = new Set((Array.isArray(approvals?.approvals) ? approvals.approvals : [])
        .map(record => record.bookId).filter(validId));
      const candidates = (Array.isArray(mirror?.products) ? mirror.products : [])
        .filter(book => validId(book?.bookId) &&
          (book.saleReady === true || approved.has(book.bookId)) &&
          /^book-[a-z0-9-]+$/.test(safe(book.slug)));
      await Promise.all(candidates.map(async book => {
        // A static bookstore card may predate the quote price; refresh its label
        // from the same live file- and checkout-ready quote used for purchase.
        const existing = grid.querySelector('[data-product="' +
          safe(book.id).replace(/[^a-zA-Z0-9_-]/g, '') + '"]');
        const label = existing?.querySelector('.meta .status');
        try {
          const quote = await quoteFor(book.bookId);
          if (!readyQuote(quote, book.bookId)) {
            if (existing) existing.dataset.bookstoreQuotePending = 'true';
            if (label) label.textContent = '가격 확인 · 판매 상태 확인 필요';
            return;
          }
          const verifiedAmount = Number(quote.price.amount);
          if (existing) existing.dataset.bookstoreQuotePending = 'false';
          if (label) label.textContent = new Intl.NumberFormat('ko-KR').format(verifiedAmount) + '원 · 판매 중';
          if (!existing) {
            released.set(book.bookId, { ...book, price: verifiedAmount });
          }
        } catch {
          if (existing) existing.dataset.bookstoreQuotePending = 'true';
          if (label) label.textContent = '가격 확인 · 판매 상태 확인 필요';
        }
      }));
    } catch { released = new Map(); } // Fail closed on transient source errors.
    grid.querySelectorAll('[data-bookstore-runtime-id]').forEach(card => card.remove());
    for (const book of released.values()) {
      if (grid.querySelector('[data-product="' + safe(book.id).replace(/[^a-zA-Z0-9_-]/g,'') + '"]')) continue;
      const card = productCard(book);
      if (card) grid.append(card);
    }
    // Dedicated EKODI Books storefront is the same public sale collection,
    // not a frozen build-time projection of the publisher's live approvals.
    const count = document.querySelector('[data-bookstore-public-count]');
    if (count) count.textContent = grid.querySelectorAll('.card:not([data-bookstore-quote-pending="true"])').length + '개';
    const state = document.querySelector('[data-bookstore-store-status]');
    if (state) state.textContent = grid.querySelector('.card:not([data-bookstore-quote-pending="true"])') ? '도서 판매 중' : '판매 준비 중';
    window.dispatchEvent(new CustomEvent('ekodi:marketplace-products-loaded', { detail: { category: 'book', count: released.size, source: 'books-approval' } }));
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
