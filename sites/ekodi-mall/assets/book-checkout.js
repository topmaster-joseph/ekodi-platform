/* MALL-BOOKS-DIRECT-CHECKOUT-001
 * 에코디몰 책·배움 전자책 직접판매 결제 화면.
 * - 출처(에코디서점)는 안내하되 구매·결제는 에코디몰 화면 안에서 끝난다.
 * - 가격·판매가능 여부·주문·결제 승인은 에코디서점 도서 정본 API가 매 요청 서버에서 다시 검증한다.
 *   이 화면은 표시와 결제창 호출만 담당하며 브라우저 값을 신뢰하지 않는다.
 * - 주문은 source=mall로 기록되어 서점 관리자(주문 관리)에서 '에코디몰' 판매로 집계된다.
 */
(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  const mode = document.body?.dataset.bookCheckoutMode || 'checkout';
  const $ = id => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const MALL = location.pathname.startsWith('/ekodimall') ? '/ekodimall' : '';
  const LAST = 'ekodi-mall-book-last-order';
  const validId = id => /^BOOK-[A-Z0-9-]{3,40}$/.test(String(id || ''));
  const text = (id, value) => { const n = $(id); if (n) n.textContent = value || ''; };
  const show = (id, on = true) => { const n = $(id); if (n) n.hidden = !on; };
  const won = n => (C ? C.won(n) : `${new Intl.NumberFormat('ko-KR').format(Number(n) || 0)}원`);
  const checkoutHref = bookId => `${MALL}/checkout/book/?book=${encodeURIComponent(bookId)}`;
  const libraryHref = 'https://ekodi.kr/books/library/';

  if (!C) {
    text('bcTitle', '결제 모듈을 불러오지 못했습니다');
    text('bcMsg', '새로고침 후 다시 시도해 주세요. 문제가 계속되면 ekodibiz@gmail.com 으로 알려 주세요.');
    return;
  }

  function loginLink() {
    const a = document.createElement('a');
    const target = new URL('https://ekodi.kr/auth/');
    target.searchParams.set('site', 'mall');
    target.searchParams.set('return_to', location.href);
    a.href = target.toString();
    a.className = 'btn primary';
    a.textContent = 'EKODI 계정으로 로그인';
    return a;
  }

  if (mode === 'fail') {
    const reason = q.get('message');
    text('bcText', `${reason ? reason + ' ' : ''}결제가 완료되지 않았습니다. 청구된 금액은 없습니다.`);
    let last = null; try { last = JSON.parse(sessionStorage.getItem(LAST) || 'null'); } catch {}
    const retry = $('bcRetry');
    if (retry && validId(last?.bookId)) retry.href = checkoutHref(last.bookId);
    return;
  }

  if (mode === 'success') {
    const paymentKey = q.get('paymentKey'), orderId = q.get('orderId'), amount = Number(q.get('amount'));
    const done = () => { show('bcActions'); history.replaceState(null, '', location.pathname); };
    if (!paymentKey || !orderId || !Number.isFinite(amount)) {
      text('bcTitle', '결제 정보를 찾을 수 없습니다');
      text('bcText', '내 서재에서 구매 내역을 확인해 주세요.');
      done(); return;
    }
    C.api('confirm', { method: 'POST', body: { paymentKey, orderId, amount } })
      .then(() => {
        text('bcTitle', '구매가 완료되었습니다');
        text('bcText', '에코디몰에서 결제가 완료되어 같은 EKODI 계정의 내 서재에 전자책이 담겼습니다. 영수증은 결제하신 이메일로도 발송됩니다.');
        try { sessionStorage.removeItem(LAST); } catch {}
      })
      .catch(e => {
        const seal = document.querySelector('.bc-seal'); if (seal) seal.textContent = '!';
        text('bcTitle', '결제 확인이 필요합니다');
        text('bcText', `${e.message} 이미 결제되었다면 자동으로 확인되며, 문의는 ekodibiz@gmail.com 으로 주세요.`);
      })
      .finally(done);
    return;
  }

  // checkout
  const bookId = String(q.get('book') || '').toUpperCase();
  let quote = null, busy = false;
  const msg = (value, ok = false) => { const n = $('bcMsg'); if (!n) return; n.textContent = value || ''; n.classList.toggle('ok', ok); };

  function render() {
    const b = quote.book || {};
    document.title = `${b.title} 바로 구매 | EKODI MALL`;
    text('bcTitle', b.title);
    text('bcSubtitle', b.subtitle || ''); show('bcSubtitle', Boolean(b.subtitle));
    text('bcAuthor', `${b.author || ''} 지음 · 전자책(${(b.format || []).join(' · ') || 'EPUB'})`);
    const cover = $('bcCover'); if (cover) cover.replaceChildren(C.cover(b));
    const p = quote.price || {};
    text('bcPrice', won(p.amount));
    text('bcListPrice', p.amount < p.listPrice ? won(p.listPrice) : '');
    text('bcTier', quote.signedIn ? `${quote.buyerEmail} · ${p.tierLabel || ''} 가격 적용` : '로그인하면 회원등급 가격이 자동 적용됩니다.');
    const extras = [];
    if (quote.audiobook?.included) extras.push(quote.audiobook.ready ? '오디오북 무료 포함' : '오디오북 무료 제공 예정');
    if (quote.languageEdition?.applied) extras.push(`다른 언어판 보유 할인 ${Math.round((quote.languageEdition.rate || 0.5) * 100)}% 적용`);
    text('bcExtras', extras.join(' · ')); show('bcExtras', extras.length > 0);

    show('bcOwned', Boolean(quote.owned));
    show('bcPayArea', !quote.owned);
    if (quote.owned) return;
    const login = $('bcLogin');
    if (login) { login.replaceChildren(); if (!quote.signedIn) login.append(loginLink()); }
    show('bcLogin', !quote.signedIn);
    show('bcSignedIn', quote.signedIn); text('bcBuyer', quote.buyerEmail || '');
    const c = quote.checkout || {};
    const open = c.open === true && c.saleReady !== false;
    const btn = $('bcPay');
    btn.disabled = busy || !open || !quote.signedIn;
    btn.textContent = !open ? (c.saleReady === false ? (c.saleStatus || '출간 준비 중') : c.fileReady === false ? '전자책 준비 중' : '결제 준비 중')
      : quote.signedIn ? `${won(p.amount)} 에코디몰에서 결제하기` : '로그인 후 결제';
    text('bcNote', !open ? '판매가 열리면 이곳에서 바로 구매하실 수 있습니다. 아직 결제·청구되지 않습니다.'
      : c.testOnly ? '운영자 시험 결제 모드입니다(실제 청구 없음).'
      : '안전한 토스페이먼츠 결제창이 에코디몰 화면에서 열립니다.');
  }

  async function load() {
    try { quote = await C.api(`quote?book=${encodeURIComponent(bookId)}`); show('bcBody'); show('bcError', false); render(); }
    catch (e) { show('bcBody', false); show('bcError'); text('bcErrorText', e.message || '도서 정보를 불러오지 못했습니다.'); }
  }

  async function pay() {
    if (busy || !quote) return;
    msg('');
    if (!$('bcConsent').checked) { msg('전자책 구매·환불 안내에 동의해 주세요.'); return; }
    busy = true; render();
    try {
      const order = await C.api('orders', { method: 'POST', body: { bookId: quote.book.id, consent: true, source: 'mall' } });
      // 서버가 에코디몰 반환 주소를 발급했는지 확인한다(다른 채널로 새지 않게).
      if (!/\/ekodimall\/checkout\/book\/success\/$/.test(String(order.successUrl || ''))) throw new Error('에코디몰 결제 주소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      if (typeof window.TossPayments !== 'function') throw new Error('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      try { sessionStorage.setItem(LAST, JSON.stringify({ orderId: order.orderId, bookId: quote.book.id })); } catch {}
      const request = { orderId: order.orderId, orderName: order.orderName, successUrl: order.successUrl, failUrl: order.failUrl, customerEmail: order.customerEmail, customerName: order.customerName };
      if (order.widget) {
        const widgets = window.TossPayments(order.clientKey).widgets({ customerKey: order.customerKey });
        await widgets.setAmount({ currency: 'KRW', value: order.amount });
        show('bcWidget'); show('bcPay', false);
        await Promise.all([
          widgets.renderPaymentMethods({ selector: '#bcMethods', variantKey: order.variantKey || 'qtin' }),
          widgets.renderAgreement({ selector: '#bcAgreement', variantKey: 'AGREEMENT' }),
        ]);
        const go = $('bcWidgetPay');
        go.disabled = false;
        go.onclick = async () => {
          go.disabled = true; msg('');
          try { await widgets.requestPayment(request); }
          catch (e) { msg(e?.message || '결제를 진행하지 못했습니다.'); go.disabled = false; }
        };
        $('bcWidget').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const payment = window.TossPayments(order.clientKey).payment({ customerKey: order.customerKey });
        await payment.requestPayment({ ...request, method: 'CARD', amount: { currency: 'KRW', value: order.amount } });
      }
    } catch (e) { msg(e.code === 'ALREADY_OWNED' ? '이미 내 서재에 있는 도서입니다.' : (e.message || '결제를 시작하지 못했습니다.')); }
    finally { busy = false; render(); }
  }

  const libraryLink = $('bcLibrary'); if (libraryLink) libraryLink.href = libraryHref;
  const source = $('bcSource'); if (source && validId(bookId)) source.href = `https://ekodi.kr/books/book/?id=${encodeURIComponent(bookId)}`;
  $('bcPay')?.addEventListener('click', pay);
  $('bcSignOut')?.addEventListener('click', async () => { try { await C.signOut(); } finally { location.reload(); } });
  if (!validId(bookId)) { show('bcBody', false); show('bcError'); text('bcErrorText', '구매할 도서를 선택해 주세요.'); }
  else load();
})();
