(() => {
  const API = 'https://mall-api.ekodi.kr';
  const code = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const root = document.querySelector('#publicProduct');
  const status = document.querySelector('#publicStatus');
  let product = null;
  function el(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function priceLabel(value) { return Number.isFinite(value) ? `${new Intl.NumberFormat('ko-KR').format(value)}원` : '가격 확정 전'; }
  function shareChannel() { const value = new URLSearchParams(location.search).get('ch') || 'copy'; return ['copy','share','sms','kakao','qr','social'].includes(value) ? value : 'unknown'; }
  async function issueAttribution() {
    try {
      const response = await fetch(`${API}/api/public/attribution`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shareCode: code, channel: shareChannel() }) });
      const body = await response.json();
      if (response.ok && body.attribution?.token) sessionStorage.setItem(`ekodiMallAttribution:${code}`, JSON.stringify(body.attribution));
    } catch {}
  }
  async function copyLink() { await navigator.clipboard.writeText(location.href); if (status) status.textContent = '상품 링크를 복사했습니다.'; }
  async function nativeShare() { const data = { title: product?.product?.name || 'EKODI MALL 상품', text: product?.product?.oneLine || '', url: location.href }; if (navigator.share) await navigator.share(data).catch(() => {}); else await copyLink(); }
  function smsShare() { location.href = `sms:?&body=${encodeURIComponent(`${product?.product?.name || '상품'}\n${location.href}`)}`; }
  function infoBlock(label, title, body) { const article = el('article', 'product-info-block'); article.append(el('small', '', label), el('h3', '', title), el('p', '', body)); return article; }
  function render(data) {
    product = data; document.title = `${data.product.name} | EKODI MALL`; root.replaceChildren();
    const hero = el('section', 'product-hero'); const main = el('div', 'product-main');
    main.append(el('p', 'eyebrow', data.store ? 'STORE PRODUCT' : 'PERSONAL PRODUCT'), el('h1', '', data.product.name), el('p', 'detail-desc', data.product.oneLine || data.product.audience || '상품 소개'));
    const meta = el('div', 'product-meta'); meta.append(el('span', 'status', data.seller.displayName), el('span', 'status', priceLabel(data.product.price))); main.append(meta);
    const actions = el('div', 'cta');
    const copy = el('button', 'btn primary', '링크 복사'); copy.type = 'button'; copy.addEventListener('click', copyLink);
    const share = el('button', 'btn ghost', '공유'); share.type = 'button'; share.addEventListener('click', nativeShare);
    const sms = el('button', 'smallbtn', '문자'); sms.type = 'button'; sms.addEventListener('click', smsShare); actions.append(copy, share, sms);
    if (data.product.saleType === 'affiliate' && data.product.affiliateUrl) { const affiliate = el('a', 'btn primary', '외부 제휴 판매처에서 보기'); affiliate.href = data.product.affiliateUrl; affiliate.target = '_blank'; affiliate.rel = 'noopener sponsored'; actions.prepend(affiliate); }
    main.append(actions);
    const side = el('aside', 'product-summary'); side.append(infoBlock('SELLER', data.seller.displayName, data.store?.name || '개인 등록상품'), infoBlock('STATUS', data.checkoutReady ? '결제 가능' : '상품 공개 · 결제 준비 중', data.checkoutReady ? '서버 검증된 결제 흐름을 사용합니다.' : '현재는 상품 공유와 소개가 가능하며 직접판매 결제는 아직 활성화하지 않았습니다.'));
    hero.append(main, side); root.append(hero);
    const details = el('section', 'product-info-grid');
    details.append(infoBlock('WHO', '누구를 위한 상품인가', data.product.audience || '상품 대상 설명 준비 중'), infoBlock('STORY', '상품 이야기', data.product.story || '상품 이야기를 준비 중입니다.'), infoBlock('FULFILLMENT', '받는 방법', data.product.fulfillment || '배송·제공 방식 확인 필요'));
    if (data.product.benefits?.length) details.append(infoBlock('BENEFITS', '핵심 장점', data.product.benefits.join(' · ')));
    if (data.product.specs?.length) details.append(infoBlock('SPECS', '규격·구성', data.product.specs.join(' · ')));
    const feeText = data.seller.type === 'individual' ? '개인상품 수수료는 판매경로에 따라 7%·8%·9%이며 PG·VAT를 포함합니다. 실제 주문 시 서버가 유입경로를 판정합니다.' : '사업자 스토어 직접판매 기본수수료는 10%이며 실제 결제 활성화에는 사업자 검증이 필요합니다.';
    details.append(infoBlock('FEE POLICY', '판매수수료 안내', feeText)); root.append(details); if (status) status.textContent = '공개 상품 · 고유링크';
  }
  async function load() {
    if (!code) return;
    try { const response = await fetch(`${API}/api/public/products/${encodeURIComponent(code)}`); const body = await response.json(); if (!response.ok) throw new Error(body.error || '상품을 찾을 수 없습니다.'); render(body.product); issueAttribution(); }
    catch (error) { root.replaceChildren(infoBlock('NOT FOUND', '상품을 열 수 없습니다.', error.message)); if (status) status.textContent = '상품 확인 필요'; }
  }
  load();
})();
