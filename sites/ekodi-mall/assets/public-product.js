(() => {
  const API = 'https://mall-api.ekodi.kr';
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
  function quoteBlock(quote) {
    if (!quote) return null;
    const sourceLabel = quote.attributionType === 'direct' ? '판매자 직접공유' : quote.attributionType === 'ai' ? 'AI 기여' : 'EKODI Mall';
    const body = `${sourceLabel} 경로 · 수수료 ${quote.feeRatePercent}% · 플랫폼 수수료 ${money(quote.platformFeeAmount)} · 판매자 정산예정 ${money(quote.sellerSettlementAmount)}. PG와 플랫폼 수수료 VAT를 포함한 정책 기준이며 실제 주문 시 서버가 다시 확정합니다.`;
    return infoBlock('SERVER QUOTE', `${sourceLabel} · ${quote.feeRatePercent}%`, body);
  }
  async function render(data) {
    product = data;
    document.title = `${data.product.name} | EKODI MALL`;
    root.replaceChildren();
    const hero = el('section', 'product-hero');
    const main = el('div', 'product-main');
    main.append(el('p', 'eyebrow', data.store ? 'STORE PRODUCT' : 'PERSONAL PRODUCT'), el('h1', '', data.product.name), el('p', 'detail-desc', data.product.oneLine || data.product.audience || '상품 소개'));
    const meta = el('div', 'product-meta');
    meta.append(el('span', 'status', data.seller.displayName), el('span', 'status', priceLabel(data.product.price)));
    main.append(meta);
    const actions = el('div', 'cta');
    const copy = el('button', 'btn primary', '링크 복사'); copy.type = 'button'; copy.addEventListener('click', copyLink);
    const share = el('button', 'btn ghost', '공유'); share.type = 'button'; share.addEventListener('click', nativeShare);
    const sms = el('button', 'smallbtn', '문자'); sms.type = 'button'; sms.addEventListener('click', smsShare);
    actions.append(copy, share, sms);
    if (refCode) { const canonical = el('a', 'smallbtn', '일반 상품링크'); canonical.href = canonicalShareUrl(); actions.append(canonical); }
    if (data.product.saleType === 'affiliate' && data.product.affiliateUrl) {
      const affiliate = el('a', 'btn primary', '외부 제휴 판매처에서 보기');
      affiliate.href = data.product.affiliateUrl; affiliate.target = '_blank'; affiliate.rel = 'noopener sponsored'; actions.prepend(affiliate);
    }
    main.append(actions);
    const side = el('aside', 'product-summary');
    side.append(
      infoBlock('SELLER', data.seller.displayName, data.store?.name || '개인 등록상품'),
      infoBlock('STATUS', data.checkoutReady ? '결제 검증 준비' : '상품 공개 · 결제 준비 중', data.checkoutReady ? '결제 활성화 여부는 주문 서버가 최종 결정합니다.' : '현재는 상품 공유와 소개가 가능하며 직접판매 결제는 아직 활성화하지 않았습니다.')
    );
    hero.append(main, side); root.append(hero);
    const details = el('section', 'product-info-grid');
    details.append(
      infoBlock('WHO', '누구를 위한 상품인가', data.product.audience || '상품 대상 설명 준비 중'),
      infoBlock('STORY', '상품 이야기', data.product.story || '상품 이야기를 준비 중입니다.'),
      infoBlock('FULFILLMENT', '받는 방법', data.product.fulfillment || '배송·제공 방식 확인 필요')
    );
    if (data.product.benefits?.length) details.append(infoBlock('BENEFITS', '핵심 장점', data.product.benefits.join(' · ')));
    if (data.product.specs?.length) details.append(infoBlock('SPECS', '규격·구성', data.product.specs.join(' · ')));
    const feeText = data.seller.type === 'individual'
      ? '개인상품은 판매자 서버발급 공유링크 7%, 일반 EKODI Mall 유입 8%, AI 내부발급 링크 9%입니다. 최초 유입은 7일간 서버에 보존되며 PG·플랫폼 수수료 VAT 포함 기준입니다.'
      : '사업자 인증 스토어 직접판매 기본수수료는 10%이며 실제 결제 활성화에는 사업자 검증이 필요합니다.';
    details.append(infoBlock('FEE POLICY', '판매수수료 안내', feeText));
    root.append(details);
    await issueAttribution();
    const quote = await loadQuote();
    const quoteNode = quoteBlock(quote);
    if (quoteNode) details.append(quoteNode);
    if (status) {
      const source = storedAttribution()?.sourceType;
      status.textContent = source === 'direct' ? '공개 상품 · 판매자 직접공유 최초유입 보존' : source === 'ai' ? '공개 상품 · AI 기여 최초유입 보존' : '공개 상품 · EKODI Mall 최초유입 보존';
    }
  }
  async function load() {
    if (!code) return;
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