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
    let bonusNote = $('audiobookBonusNote');
    if (!bonusNote) {
      bonusNote = document.createElement('p');
      bonusNote.id = 'audiobookBonusNote'; bonusNote.className = 'buy-msg';
      $('priceTier').insertAdjacentElement('afterend',bonusNote);
    }
    bonusNote.textContent = quote.audiobook?.included
      ? (quote.audiobook.ready
        ? '이 전자책에는 승인된 오디오북이 무료 포함됩니다. 구매 후 같은 서재에서 함께 받으세요.'
        : '오디오북 무료 제공 대상 도서입니다. 오디오북은 음성·권리 검수 중이며, 준비가 완료되면 기존 구매자에게 추가 결제 없이 열립니다.')
      : '전자책 출판 검수 완료 후 무료 오디오북 제공 여부를 확인합니다.';

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
    const preparing = quote.checkout.fileReady === false && !quote.checkout.operator;
    $('payBtn').textContent = !open ? (preparing ? '전자책 준비 중' : '결제 준비 중') : quote.signedIn ? `${C.won(p?.amount)} 결제하기` : '로그인 후 결제';
    $('payNote').textContent = !open ? (preparing ? '판매용 전자책 파일을 마무리하고 있습니다. 준비되는 대로 이곳에서 바로 구매하실 수 있습니다.' : '에코디서점 결제를 여는 중입니다. 지금은 아래의 다른 판매처를 이용하실 수 있습니다.') : quote.checkout.testOnly ? '운영자 시험 결제 모드입니다(실제 청구 없음).' : quote.checkout.operator && quote.checkout.fileReady === false ? '운영자 확인용 결제입니다. 전자책 파일이 아직 없어 일반 고객에게는 판매가 열리지 않았습니다(실제 청구됩니다).' : '안전한 토스페이먼츠 결제창이 열립니다. 결제 후 바로 내 서재에서 받으실 수 있습니다.';
  }
  async function load() {
    try { quote = await C.api(`quote?book=${encodeURIComponent(bookId)}`); render(); }
    catch (e) { $('buyRoot').hidden = true; $('buyError').hidden = false; $('buyErrorText').textContent = e.message; }
  }
  async function pay() {
    if (busy || !quote) return;
    msg('');
    if (!$('consent').checked) { msg('전자책 구매·환불 안내에 동의해 주세요.'); return; }
    busy = true; render();
    try {
      const order = await C.api('orders', { method: 'POST', body: { bookId: quote.book.id, consent: true, source } });
      if (typeof window.TossPayments !== 'function') throw new Error('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      try { sessionStorage.setItem('ekodi-books-last-order', JSON.stringify({ orderId: order.orderId, bookId: quote.book.id })); } catch {}
      const request = { orderId: order.orderId, orderName: order.orderName, successUrl: order.successUrl, failUrl: order.failUrl, customerEmail: order.customerEmail, customerName: order.customerName };
      if (order.widget) {
        // 결제위젯 연동 키(gck): 토스 결제 UI를 이 카드 안에 그리고, 고객이 수단을 고른 뒤 결제를 진행한다.
        const widgets = window.TossPayments(order.clientKey).widgets({ customerKey: order.customerKey });
        await widgets.setAmount({ currency: 'KRW', value: order.amount });
        $('widgetArea').hidden = false; $('payBtn').hidden = true;
        await Promise.all([
          widgets.renderPaymentMethods({ selector: '#paymentMethods', variantKey: order.variantKey || 'qtin' }),
          widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' }),
        ]);
        $('widgetPay').disabled = false;
        $('widgetPay').onclick = async () => {
          $('widgetPay').disabled = true; msg('');
          try { await widgets.requestPayment(request); }
          catch (e) { msg(e?.message || '결제를 진행하지 못했습니다.'); $('widgetPay').disabled = false; }
        };
        $('widgetArea').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const payment = window.TossPayments(order.clientKey).payment({ customerKey: order.customerKey });
        await payment.requestPayment({ ...request, method: 'CARD', amount: { currency: 'KRW', value: order.amount } });
      }
    } catch (e) { msg(e.code === 'ALREADY_OWNED' ? '이미 내 서재에 있는 도서입니다.' : (e.message || '결제를 시작하지 못했습니다.')); }
    finally { busy = false; render(); }
  }
  $('payBtn').addEventListener('click', pay);
  $('signOut').addEventListener('click', () => { C.forget(); load(); });
  C.mountGoogle($('googleButton'), (t, err) => { $('accountStatus').textContent = t || ''; $('accountStatus').style.color = err ? 'var(--danger)' : ''; }, load);
  document.querySelectorAll('[data-books-base]').forEach(a => { a.href = C.under(a.getAttribute('data-books-base')); });
  if (!bookId) { $('buyRoot').hidden = true; $('buyError').hidden = false; $('buyErrorText').textContent = '도서를 선택해 주세요.'; }
  else load();
})();
