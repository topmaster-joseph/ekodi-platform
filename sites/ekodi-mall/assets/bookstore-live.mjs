// MALL-BOOKSTORE-LIVE-APPROVAL-001
// Public, read-only bridge from the bookstore's authoritative file-bound approval
// and LIVE checkout quote to Mall discovery. Never grant checkout or publish a
// title using static JSON alone; Books independently re-checks before payment.
const BOOK_ID = /^BOOK-EKODI-[0-9]{6}$/;
const BOOKS_API = '/books/api/commerce';
const MIRROR = '/ekodimall/provider-bookstore.json';

export function eligibleApprovedBookOffer(record, approvals, quote) {
  const bookId = String(record?.bookId || '');
  const listingId = String(record?.id || '');
  if (!BOOK_ID.test(bookId) || listingId !== `bookstore-${bookId}`) return false;
  if (record.saleReady === true || !Array.isArray(approvals?.approvals)) return false;
  if (!approvals.approvals.some(item => item?.bookId === bookId && item?.edition && item?.approvedAt)) return false;
  const title = String(quote?.book?.title || '').trim();
  const listingTitle = String(record?.name || '').trim();
  const listPrice = Number(record?.price);
  if (!title || !(listingTitle === title || listingTitle.startsWith(`${title} — `))) return false;
  if (quote?.book?.id !== bookId || quote?.saleReadiness?.ready !== true || quote?.saleReadiness?.source !== 'approval') return false;
  if (quote?.checkout?.open !== true || quote?.checkout?.fileReady !== true || quote?.checkout?.saleReady !== true || quote?.checkout?.mode !== 'live') return false;
  if (!(listPrice > 0) || !Number.isSafeInteger(listPrice) || Number(quote?.price?.listPrice) !== listPrice) return false;
  return true;
}

function dom(tag, className = '', content = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content) element.textContent = content;
  return element;
}

function makeCard(record, quote) {
  const bookId = record.bookId;
  const href = `/books/buy/?book=${encodeURIComponent(bookId)}&from=mall`;
  const card = dom('article', 'card');
  card.dataset.product = record.id;
  card.dataset.category = 'book';
  card.dataset.name = record.name;
  card.dataset.status = '판매 중';
  card.dataset.saleReady = 'true';
  card.dataset.bookstoreApproved = 'true';
  card.dataset.href = href;
  card.dataset.search = `${record.name} ${quote.book.author || ''} 전자책 에코디서점 책 배움 판매 중`.toLowerCase();

  const thumb = dom('div', 'thumb book');
  const coverLink = dom('a', 'thumb-link');
  coverLink.href = href;
  coverLink.setAttribute('aria-label', `${record.name} 전자책 구매하기`);
  try {
    const cover = new URL(String(record.image || ''), location.origin);
    if (cover.protocol === 'https:' && cover.origin === location.origin && cover.pathname.startsWith('/books/assets/')) {
      const img = dom('img');
      img.src = cover.href;
      img.alt = record.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      coverLink.append(img);
      thumb.classList.add('has-image');
    }
  } catch { /* An unavailable or malformed cover never grants sale access. */ }
  thumb.append(coverLink, dom('span', 'badge', '에코디서점 · 판매 중'));
  const heart = dom('button', 'heart', '♡');
  heart.type = 'button';
  heart.dataset.wish = record.id;
  heart.setAttribute('aria-label', `${record.name} 관심상품`);
  heart.setAttribute('aria-pressed', 'false');
  thumb.append(heart);

  const body = dom('div', 'card-body');
  const store = dom('p', 'store-kicker');
  const storeLink = dom('a', '', '에코디서점');
  storeLink.href = '/books/';
  store.append(storeLink);
  const title = dom('h3');
  const titleLink = dom('a', '', record.name);
  titleLink.href = href;
  title.append(titleLink);
  const summary = dom('p', 'card-summary', '출판사가 승인한 전자책입니다. 구매 후 에코디서점 내 서재에서 읽을 수 있습니다.');
  const meta = dom('div', 'meta');
  meta.append(dom('span', 'status', `${Number(record.price).toLocaleString('ko-KR')}원 · 판매 중`));
  const buy = dom('a', 'smallbtn', '전자책 구매하기');
  buy.href = href;
  meta.append(buy);
  body.append(store, title, summary, meta);
  card.append(thumb, body);
  return card;
}

async function getJson(fetcher, path) {
  const response = await fetcher(path, { cache:'no-store', credentials:'omit', headers:{accept:'application/json'}, signal:AbortSignal.timeout(8500) });
  if (!response.ok) throw new Error('Bookstore status could not be verified');
  return response.json();
}

export function mountApprovedBookstoreProducts({ grid, render, fetcher = fetch }) {
  if (!grid || typeof render !== 'function') return;
  let running = false;
  const refresh = async () => {
    if (running) return;
    running = true;
    // Fail closed if approvals were withdrawn, files changed or the Books API fails.
    for (const card of grid.querySelectorAll('[data-bookstore-approved="true"]')) card.remove();
    render();
    try {
      const [mirror, approvals] = await Promise.all([
        getJson(fetcher, MIRROR), getJson(fetcher, `${BOOKS_API}/public/approvals`)
      ]);
      if (!Array.isArray(mirror?.products) || !Array.isArray(approvals?.approvals)) return;
      const pending = mirror.products.filter(item => item?.saleReady !== true &&
        BOOK_ID.test(String(item?.bookId || '')) && !grid.querySelector(`[data-product="bookstore-${item.bookId}"]`)
      ).slice(0, 24);
      for (const item of pending) {
        const approved = approvals.approvals.some(a => a?.bookId === item.bookId);
        if (!approved) continue;
        try {
          const quote = await getJson(fetcher, `${BOOKS_API}/quote?book=${encodeURIComponent(item.bookId)}`);
          if (eligibleApprovedBookOffer(item, approvals, quote)) grid.append(makeCard(item, quote));
        } catch { /* No verification = no public sale tile. */ }
      }
    } catch { /* Keep existing static sale items and no unverified live items. */ }
    finally { running = false; render(); }
  };
  void refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
}
