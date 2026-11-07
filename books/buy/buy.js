(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const bookId = (params.get('book') || '').toUpperCase();
  const source = params.get('from') || 'bookstore';
  let quote = null, busy = false;
  let activeBookTab = 'intro';
  const tabLabels = { intro: '책소개', toc: '목차', benefit: '구매혜택' };
  function renderBookTab() {
    if (!quote) return;
    const book = quote.book || {};
    const panel = $('bookTabPanel');
    panel.replaceChildren();
    const text = document.createElement('p');
    if (activeBookTab === 'toc') {
      const items = Array.isArray(book.toc) ? book.toc : Array.isArray(book.tableOfContents) ? book.tableOfContents : [];
      if (items.length) {
        const list = document.createElement('ol');
        items.forEach(item => { const li = document.createElement('li'); li.textContent = typeof item === 'string' ? item : (item.title || item.label || ''); list.append(li); });
        panel.append(list);
      } else { text.textContent = '공개된 목차를 준비하고 있습니다.'; panel.append(text); }
    } else if (activeBookTab === 'benefit') {
      text.textContent = '회원등급별 가격이 자동 적용됩니다. 구매한 도서는 내 서재에서 다시 열람할 수 있습니다.';
      panel.append(text);
    } else {
      text.textContent = book.abstract || book.description || book.summary || book.subtitle || '도서 소개를 준비하고 있습니다.';
      panel.append(text);
    }
    document.querySelectorAll('[data-book-tab]').forEach(tab => {
      const selected = tab.dataset.bookTab === activeBookTab;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      if (selected) panel.setAttribute('aria-labelledby', tab.id);
    });
  }
  function selectBookTab(tab, focus = false) {
    if (!Object.hasOwn(tabLabels, tab)) return;
    activeBookTab = tab; renderBookTab();
    if (focus) document.querySelector('[data-book-tab="' + tab + '"]')?.focus();
  }
  document.querySelectorAll('[data-book-tab]').forEach((tab, index, tabs) => {
    tab.addEventListener('click', () => selectBookTab(tab.dataset.bookTab));
    tab.addEventListener('keydown', e => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return; e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; selectBookTab(tabs[next].dataset.bookTab, true); });
  });
  $('bookCoverButton').addEventListener('click', () => { selectBookTab(activeBookTab === 'toc' ? 'intro' : 'toc', true); });
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
    renderBookTab();
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
      ? (quote.audiobook.ready ? '오디오북 무료 포함' : '오디오북 무료 제공 예정 · 검수 중')
      : '';
    bonusNote.hidden = !bonusNote.textContent;

    let langNote = $('languageEditionNote');
    if (!langNote) { langNote = document.createElement('p'); langNote.id = 'languageEditionNote'; langNote.className = 'buy-msg'; bonusNote.insertAdjacentElement('afterend', langNote); }
    const le = quote.languageEdition || {};
    langNote.textContent = le.applied ? `다른 언어판 보유 할인 ${Math.round((le.rate || 0.5) * 100)}% 적용`
      : le.available ? `다른 언어판 보유 시 ${Math.round((le.rate || 0.5) * 100)}% 할인` : '';
    langNote.hidden = !langNote.textContent;
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
    const notReady = quote.checkout.saleReady === false;
    const preparing = quote.checkout.fileReady === false && !quote.checkout.operator;
    if (notReady) {
      $('payBtn').textContent = quote.checkout.saleStatus || '출간 준비 중';
      $('payNote').textContent = '출판 검수와 판본 확정이 끝나면 이곳에서 구매하실 수 있습니다. 아직 결제·청구되지 않습니다.';
      return;
    }
    $('payBtn').textContent = !open ? (preparing ? '전자책 준비 중' : '결제 준비 중') : quote.signedIn ? `${C.won(p?.amount)} 결제하기` : '로그인 후 결제';
    $('payNote').textContent = !open ? (preparing ? '판매용 전자책 파일을 마무리하고 있습니다. 준비되는 대로 이곳에서 바로 구매하실 수 있습니다.' : '에코디서점 결제를 여는 중입니다. 지금은 아래의 다른 판매처를 이용하실 수 있습니다.') : quote.checkout.testOnly ? '운영자 시험 결제 모드입니다(실제 청구 없음).' : quote.checkout.operator && quote.checkout.fileReady === false ? '운영자 확인용 결제입니다. 전자책 파일이 아직 없어 일반 고객에게는 판매가 열리지 않았습니다(실제 청구됩니다).' : '안전한 토스페이먼츠 결제창이 열립니다. 결제 후 내 서재의 전자책 리더에서 열람할 수 있습니다.';
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
  $('signOut').addEventListener('click', async () => {
    const button = $('signOut');
    if (button.disabled) return;
    button.disabled = true;
    try { await C.signOut(); window.location.reload(); }
    catch { button.disabled = false; $('accountStatus').textContent = '로그아웃을 마치지 못했습니다. 다시 시도해 주세요.'; }
  });
  C.mountGoogle($('googleButton'), (t, err) => { $('accountStatus').textContent = t || ''; $('accountStatus').style.color = err ? 'var(--danger)' : ''; }, load);
  document.querySelectorAll('[data-books-base]').forEach(a => { a.href = C.under(a.getAttribute('data-books-base')); });
  if (!bookId) { $('buyRoot').hidden = true; $('buyError').hidden = false; $('buyErrorText').textContent = '도서를 선택해 주세요.'; }
  else load();
})();
