(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const bookId = (params.get('book') || '').toUpperCase();
  const source = params.get('from') || 'bookstore';
  let quote = null, busy = false;
  const msg = (text, ok = false) => { const n = $('buyMsg'); n.textContent = text || ''; n.classList.toggle('ok', ok); };

  function renderTiers() {
    const body = $('tierRows'); body.replaceChildren();
    for (const tier of quote.tiers) {
      const tr = document.createElement('tr');
      if (tier.id === quote.price?.tierId && quote.signedIn) tr.className = 'is-mine';
      const name = document.createElement('td'); name.textContent = tier.label;
      const small = document.createElement('small'); small.textContent = tier.description; name.append(small);
      const price = document.createElement('td'); price.textContent = C.won(tier.price);
      tr.append(name, price); body.append(tr);
    }
  }
  function render() {
    const b = quote.book;
    document.title = `${b.title} 구매 | 에코디서점`;
    $('crumbTitle').textContent = b.title;
    $('bookTitle').textContent = b.title;
    $('bookSubtitle').textContent = b.subtitle || '';
    $('bookSubtitle').hidden = !b.subtitle;
    $('bookAuthor').textContent = `${b.author} 지음 · ${(b.format || []).join(' · ') || 'EPUB 3'}${b.edition ? ' · ' + b.edition : ''}`;
    $('bookCover').replaceChildren(C.cover(b));
    const p = quote.price;
    $('priceNow').textContent = C.won(p?.amount);
    $('priceList').textContent = p && p.amount < p.listPrice ? C.won(p.listPrice) : '';
    $('priceTier').textContent = quote.signedIn ? `${quote.buyerEmail} · ${p?.tierLabel || ''} 가격` : '로그인하면 회원등급 가격이 적용됩니다.';
    renderTiers();
    const list = $('channelList'); list.replaceChildren();
    const channels = [['유페이퍼', b.links?.upaper], ['Google Play Books', b.links?.google], ['Amazon Kindle', b.links?.amazon]].filter(([, url]) => url);
    for (const [name, url] of channels) { const li = document.createElement('li'); const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = name + ' ↗'; const sp = document.createElement('span'); sp.textContent = '외부 판매처'; li.append(a, sp); list.append(li); }
    $('otherChannels').hidden = channels.length === 0;
    $('signedOut').hidden = quote.signedIn; $('signedIn').hidden = !quote.signedIn;
    $('buyerEmail').textContent = quote.buyerEmail;
    if (quote.owned) { $('ownedBox').hidden = false; $('payArea').hidden = true; return; }
    $('ownedBox').hidden = true; $('payArea').hidden = false;
    const open = quote.checkout.open;
    $('payBtn').disabled = busy || !open || !quote.signedIn;
    $('payBtn').textContent = !open ? '결제 준비 중' : quote.signedIn ? `${C.won(p?.amount)} 결제하기` : '로그인 후 결제';
    $('payNote').textContent = !open ? '에코디서점 결제를 여는 중입니다. 지금은 아래의 다른 판매처를 이용하실 수 있습니다.' : quote.checkout.testOnly ? '운영자 시험 결제 모드입니다(실제 청구 없음).' : '안전한 토스페이먼츠 결제창이 열립니다. 결제 후 바로 내 서재에서 받으실 수 있습니다.';
  }
  async function load() {
    try { quote = await C.api(`/quote?book=${encodeURIComponent(bookId)}`); render(); }
    catch (e) { $('buyRoot').hidden = true; $('buyError').hidden = false; $('buyErrorText').textContent = e.message; }
  }
  async function pay() {
    if (busy || !quote) return;
    msg('');
    if (!$('consent').checked) { msg('전자책 구매·환불 안내에 동의해 주세요.'); return; }
    busy = true; render();
    try {
      const order = await C.api('/orders', { method: 'POST', body: { bookId: quote.book.id, consent: true, source } });
      if (typeof window.TossPayments !== 'function') throw new Error('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      try { sessionStorage.setItem('ekodi-books-last-order', JSON.stringify({ orderId: order.orderId, bookId: quote.book.id })); } catch {}
      const payment = window.TossPayments(order.clientKey).payment({ customerKey: order.customerKey });
      await payment.requestPayment({ method: 'CARD', amount: { currency: 'KRW', value: order.amount }, orderId: order.orderId, orderName: order.orderName,
        successUrl: order.successUrl, failUrl: order.failUrl, customerEmail: order.customerEmail, customerName: order.customerName });
    } catch (e) { msg(e.code === 'ALREADY_OWNED' ? '이미 내 서재에 있는 도서입니다.' : (e.message || '결제를 시작하지 못했습니다.')); }
    finally { busy = false; render(); }
  }
  $('payBtn').addEventListener('click', pay);
  $('signOut').addEventListener('click', () => { C.forget(); load(); });
  C.mountGoogle($('googleButton'), (t, err) => { $('accountStatus').textContent = t || ''; $('accountStatus').style.color = err ? 'var(--danger)' : ''; }, load);
  document.querySelectorAll('[data-books-base]').forEach(a => { a.href = C.BASE + a.getAttribute('data-books-base'); });
  if (!bookId) { $('buyRoot').hidden = true; $('buyError').hidden = false; $('buyErrorText').textContent = '도서를 선택해 주세요.'; }
  else load();
})();
