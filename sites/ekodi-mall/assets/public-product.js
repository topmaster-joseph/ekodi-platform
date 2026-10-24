(() => {
  const API = '/ekodimall/api';
  const VISITOR_KEY = 'ekodiMallAnonymousVisitorV1';
  const ATTR_PREFIX = 'ekodiMallAttributionV3:';
  const code = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const refCode = new URLSearchParams(location.search).get('ref') || '';
  const root = document.querySelector('#publicProduct');
  const status = document.querySelector('#publicStatus');
  let product = null;
  let attribution = null;

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function priceLabel(value) { return Number.isFinite(value) ? `${new Intl.NumberFormat('ko-KR').format(value)}원` : '가격 확정 전'; }
  function money(value) { return `${new Intl.NumberFormat('ko-KR').format(Math.max(0, Number(value) || 0))}원`; }
  function visitorId() {
    let id = '';
    try { id = localStorage.getItem(VISITOR_KEY) || ''; } catch {}
    if (!id) {
      id = crypto.randomUUID?.().replaceAll('-', '') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
      try { localStorage.setItem(VISITOR_KEY, id); } catch {}
    }
    return id.slice(0, 96);
  }
  async function issueAttribution() {
    try {
      const response = await fetch(`${API}/api/public/attribution/visit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shareCode: code, refCode, visitorId: visitorId() })
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.attribution?.token) {
        attribution = body.attribution;
        try { localStorage.setItem(`${ATTR_PREFIX}${code}`, JSON.stringify(body.attribution)); } catch {}
      }
    } catch {}
  }
  function storedAttribution() {
    if (attribution?.token) return attribution;
    try {
      const value = JSON.parse(localStorage.getItem(`${ATTR_PREFIX}${code}`) || 'null');
      if (value?.token && (!value.expiresAt || Date.parse(value.expiresAt) > Date.now())) return value;
    } catch {}
    return null;
  }
  async function loadQuote() {
    if (!product || product.product.saleType !== 'direct' || !Number.isFinite(product.product.price)) return null;
    try {
      const token = storedAttribution()?.token || '';
      const response = await fetch(`${API}/api/public/checkout/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shareCode: code, attributionToken: token, quantity: 1 })
      });
      const body = await response.json();
      return response.ok ? body.quote : null;
    } catch { return null; }
  }
  function canonicalShareUrl() {
    const url = new URL(location.href);
    url.searchParams.delete('ref');
    return url.toString();
  }
  async function copyLink() {
    await navigator.clipboard.writeText(location.href);
    if (status) status.textContent = refCode ? '판매자 공유링크를 복사했습니다.' : '상품 링크를 복사했습니다.';
  }
  async function nativeShare() {
    const data = { title: product?.product?.name || 'EKODI MALL 상품', text: product?.product?.oneLine || '', url: location.href };
    if (navigator.share) await navigator.share(data).catch(() => {}); else await copyLink();
  }
  function smsShare() { location.href = `sms:?&body=${encodeURIComponent(`${product?.product?.name || '상품'}\n${location.href}`)}`; }
  function infoBlock(label, title, body) {
    const article = el('article', 'product-info-block');
    article.append(el('small', '', label), el('h3', '', title), el('p', '', body));
    return article;
  }
  // EKODI-MALL-PREMIUM-PDP-001: compact, gallery-first product page.
  const CATEGORY_LABEL = { general: '일반', food: '식품', local: '로컬', craft: '공예', book: '도서', beauty: '뷰티', living: '리빙', fashion: '패션', digital: '디지털', service: '서비스' };
  function mediaBlock(data) {
    const figure = el('figure', 'pp-media');
    const photos = (data.product.images || []).map((item) => String(item?.url || item || '')).filter((url) => /^https:\/\//.test(url));
    if (photos.length) {
      const img = document.createElement('img');
      img.src = photos[0]; img.alt = data.product.name; img.loading = 'eager'; img.decoding = 'async';
      figure.append(img);
      if (photos.length > 1) {
        const thumbs = el('div', 'pp-thumbs');
        photos.forEach((url, index) => {
          const button = el('button', index === 0 ? 'is-active' : ''); button.type = 'button';
          button.setAttribute('aria-label', `사진 ${index + 1}`);
          const t = document.createElement('img'); t.src = url; t.alt = ''; t.loading = 'lazy';
          button.append(t);
          button.addEventListener('click', () => { img.src = url; thumbs.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === button)); });
          thumbs.append(button);
        });
        figure.append(thumbs);
      }
    } else {
      const visual = el('div', 'pp-visual');
      visual.setAttribute('role', 'img');
      visual.setAttribute('aria-label', `${data.product.name} 대표 사진 준비 중`);
      // Neutral still-life illustration (gift box on linen) until the seller uploads a real photo.
      visual.innerHTML = `<svg class="pp-still" viewBox="0 0 400 500" aria-hidden="true">
        <defs>
          <linearGradient id="ppBox" x1="0" x2="1"><stop offset="0" stop-color="#efe6d6"/><stop offset="1" stop-color="#ddd0ba"/></linearGradient>
          <linearGradient id="ppLid" x1="0" x2="1"><stop offset="0" stop-color="#f7f1e6"/><stop offset="1" stop-color="#e6dac5"/></linearGradient>
          <radialGradient id="ppShadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="rgba(60,48,30,.28)"/><stop offset="1" stop-color="rgba(60,48,30,0)"/></radialGradient>
        </defs>
        <ellipse cx="200" cy="372" rx="150" ry="22" fill="url(#ppShadow)"/>
        <rect x="88" y="210" width="224" height="158" rx="6" fill="url(#ppBox)"/>
        <rect x="78" y="186" width="244" height="34" rx="6" fill="url(#ppLid)"/>
        <rect x="190" y="186" width="20" height="182" fill="#1f3d33" opacity=".9"/>
        <path d="M200 186c-30-40-70-38-66-14 3 18 40 18 66 14zm0 0c30-40 70-38 66-14-3 18-40 18-66 14z" fill="none" stroke="#1f3d33" stroke-width="9" stroke-linecap="round" opacity=".9"/>
      </svg>`;
      visual.append(el('span', 'pp-visual-cap', '대표 사진 준비 중'));
      figure.append(visual);
    }
    return figure;
  }
  function section(title, body, open = false) {
    const details = document.createElement('details');
    details.className = 'pp-section';
    if (open) details.open = true;
    const summary = el('summary', '', title);
    details.append(summary);
    if (body instanceof Node) details.append(body); else details.append(el('p', '', body));
    return details;
  }
  function list(items) {
    const ul = el('ul', 'pp-list');
    for (const item of items) ul.append(el('li', '', item));
    return ul;
  }
  async function render(data) {
    product = data;
    document.title = `${data.product.name} | EKODI MALL`;
    document.body.classList.add('pp-page');
    root.replaceChildren();
    const wrap = el('section', 'pp-wrap');
    const info = el('div', 'pp-info');
    const crumbs = el('p', 'pp-crumbs', `${data.store?.name || data.seller.displayName} · ${CATEGORY_LABEL[data.product.category] || '상품'}`);
    const title = el('h1', 'pp-title', data.product.name);
    const lead = el('p', 'pp-lead', data.product.oneLine || data.product.audience || '');
    const price = el('p', 'pp-price', priceLabel(data.product.price));
    const facts = el('ul', 'pp-facts');
    if (data.product.fulfillment) facts.append(el('li', '', data.product.fulfillment));
    if (data.product.region?.label) facts.append(el('li', '', `${data.product.region.label}${data.product.region.verified ? '' : ' · 판매자 등록 지역'}`));
    facts.append(el('li', '', '토스페이먼츠 안전결제'));
    info.append(crumbs, title);
    if (lead.textContent) info.append(lead);
    info.append(price, facts);
    const buy = el('div', 'pp-buy');
    buy.id = 'ppBuy';
    info.append(buy);
    if (data.product.saleType === 'affiliate' && data.product.affiliateUrl) {
      const affiliate = el('a', 'btn primary pp-cta', '판매처에서 보기');
      affiliate.href = data.product.affiliateUrl; affiliate.target = '_blank'; affiliate.rel = 'noopener sponsored';
      buy.append(affiliate);
    }
    const share = el('div', 'pp-share');
    const copy = el('button', 'pp-link', '링크 복사'); copy.type = 'button'; copy.addEventListener('click', copyLink);
    const native = el('button', 'pp-link', '공유'); native.type = 'button'; native.addEventListener('click', nativeShare);
    const sms = el('button', 'pp-link', '문자'); sms.type = 'button'; sms.addEventListener('click', smsShare);
    share.append(copy, native, sms);
    if (refCode) { const canonical = el('a', 'pp-link', '일반 상품링크'); canonical.href = canonicalShareUrl(); share.append(canonical); }
    info.append(share);
    wrap.append(mediaBlock(data), info);
    root.append(wrap);

    const details = el('section', 'pp-details');
    const story = [data.product.story, data.product.audience ? `추천 대상 · ${data.product.audience}` : ''].filter(Boolean).join('\n\n');
    details.append(section('상품 설명', story || data.product.oneLine || '판매자가 상품 설명을 준비 중입니다.', true));
    if (data.product.benefits?.length) details.append(section('핵심 장점', list(data.product.benefits)));
    if (data.product.specs?.length) details.append(section('구성 · 규격', list(data.product.specs)));
    details.append(section('배송 · 교환 · 환불', `${data.product.fulfillment || '판매자가 배송·제공 방식을 안내합니다.'}\n\n결제 취소와 환불은 에코디몰 환불정책과 판매자 안내에 따릅니다.`));
    details.append(section('판매자 정보', `${data.seller.displayName}${data.store?.name ? ` · ${data.store.name}` : ' · 개인 판매자'}${data.product.contact ? `\n문의 · ${data.product.contact}` : ''}`));
    const feeText = data.seller.type === 'individual'
      ? '개인상품은 판매자 서버발급 공유링크 7%, 일반 EKODI Mall 유입 8%, AI 내부발급 링크 9%입니다. 최초 유입은 7일간 서버에 보존되며 PG·플랫폼 수수료 VAT 포함 기준입니다.'
      : '사업자 인증 스토어 직접판매 기본수수료는 10%이며 실제 결제 활성화에는 사업자 검증이 필요합니다.';
    const feeBody = el('div', 'pp-fee');
    feeBody.append(el('p', '', feeText));
    const fee = section('판매 수수료 안내', feeBody);
    fee.classList.add('pp-section-muted');
    details.append(fee);
    root.append(details);

    await issueAttribution();
    const quote = await loadQuote();
    if (quote) {
      const sourceLabel = quote.attributionType === 'direct' ? '판매자 직접공유' : quote.attributionType === 'ai' ? 'AI 기여' : 'EKODI Mall';
      feeBody.append(el('p', 'pp-quote', `SERVER QUOTE · ${sourceLabel} 경로 ${quote.feeRatePercent}% · 플랫폼 수수료 ${money(quote.platformFeeAmount)} · 판매자 정산예정 ${money(quote.sellerSettlementAmount)}`));
    }
    // EKODI-MALL-TOSS-WIDGET-007: buy now only when the order server says every gate is open.
    if (quote?.checkoutReady && window.EkodiMallCheckout) {
      window.EkodiMallCheckout.mount(buy, { api: API, shareCode: code, attributionToken: storedAttribution()?.token || '', quote });
      const bar = el('div', 'pp-mobile-bar');
      bar.append(el('strong', '', priceLabel(data.product.price)));
      const go = el('button', 'btn primary', '구매하기'); go.type = 'button';
      go.addEventListener('click', () => buy.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      bar.append(go);
      document.body.append(bar);
    } else if (data.product.saleType === 'direct') {
      const soldOut = quote?.blockers?.includes('out-of-stock');
      const soon = el('button', 'pp-soon', soldOut ? '품절' : '구매 준비 중'); soon.type = 'button'; soon.disabled = true;
      buy.append(soon);
      if (soldOut) buy.append(el('p', 'pp-soon-note', '재입고되면 이 페이지에서 바로 구매할 수 있습니다.'));
    }
    if (status) {
      const source = storedAttribution()?.sourceType;
      status.textContent = source === 'direct' ? '판매자 추천 링크로 방문하셨습니다' : '에코디몰 · 안전결제';
    }
  }
  function checkoutNotice(title, message, ok) {
    let box = document.querySelector('#checkoutResult');
    if (!box) { box = el('section', 'checkout-result'); box.id = 'checkoutResult'; box.setAttribute('role', 'status'); root.before(box); }
    box.className = `checkout-result ${ok ? 'ok' : 'bad'}`;
    box.replaceChildren(el('h2', '', title), el('p', '', message));
  }
  async function load() {
    if (!code) return;
    if (window.EkodiMallCheckout) window.EkodiMallCheckout.handleReturn(API, checkoutNotice);
    try {
      const response = await fetch(`${API}/api/public/products/${encodeURIComponent(code)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '상품을 찾을 수 없습니다.');
      await render(body.product);
    } catch (error) {
      root.replaceChildren(infoBlock('NOT FOUND', '상품을 열 수 없습니다.', error.message));
      if (status) status.textContent = '상품 확인 필요';
    }
  }
  load();
})();