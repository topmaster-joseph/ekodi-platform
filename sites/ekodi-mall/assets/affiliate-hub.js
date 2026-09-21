(() => {
  const API = 'https://ekodi.kr/api/affiliate/public/products?storefront=ekodi-mall&limit=100';
  const keys = String(document.body.dataset.affiliateProvider || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const grid = document.querySelector('#affiliateGrid');
  const form = document.querySelector('#affiliateSearch');
  const input = document.querySelector('#affiliateQuery');
  const summary = document.querySelector('#affiliateSummary');
  let products = [];

  const text = (tag, className, value) => { const node = document.createElement(tag); if (className) node.className = className; node.textContent = value; return node; };
  const clean = (value) => String(value || '').trim();
  const safeHttps = (value) => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
  const providerMatches = (item) => {
    const haystack = [item.providerKey, item.providerName, item.merchantKey, item.merchantName, item.affiliateNetworkName].map((value) => clean(value).toLowerCase()).join(' ');
    return keys.some((key) => haystack.includes(key));
  };
  const searchMatches = (item, query) => !query || [item.productName, item.category, item.providerName, item.merchantName].map(clean).join(' ').toLowerCase().includes(query);

  function render() {
    const query = clean(input?.value).toLowerCase();
    const visible = products.filter((item) => providerMatches(item) && searchMatches(item, query));
    grid.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('article'); empty.className = 'affiliate-empty';
      empty.append(text('strong', '', query ? '조건에 맞는 검증 상품이 아직 없습니다.' : '현재 공개 가능한 검증 상품을 준비 중입니다.'), text('span', '', '제휴 API에서 유효한 HTTPS 링크가 확인된 상품만 자동 노출됩니다.'));
      grid.append(empty); summary.textContent = '임의 상품이나 미검증 링크는 표시하지 않습니다.'; return;
    }
    visible.slice(0, 24).forEach((item) => {
      const url = safeHttps(item.clickUrl); if (!url) return;
      const card = document.createElement('article'); card.className = 'affiliate-card';
      const provider = text('small', 'affiliate-provider', clean(item.providerName) || '제휴 판매처');
      const title = text('h3', '', clean(item.productName) || '제휴 상품');
      const meta = text('p', '', [clean(item.category), Number(item.priceKrw) > 0 ? `${Number(item.priceKrw).toLocaleString('ko-KR')}원 표시` : '가격은 판매처에서 확인'].filter(Boolean).join(' · '));
      const link = text('a', 'btn primary', keys.includes('agoda') ? '아고다에서 확인' : '쿠팡에서 확인'); link.href = url; link.target = '_blank'; link.rel = 'noopener sponsored';
      card.append(provider, title, meta, link); grid.append(card);
    });
    summary.textContent = `${visible.length}개의 검증된 제휴상품을 찾았습니다. 가격·예약·재고는 판매처에서 다시 확인해 주세요.`;
  }

  form?.addEventListener('submit', (event) => { event.preventDefault(); render(); });
  fetch(API, { headers: { accept: 'application/json' }, credentials: 'omit' })
    .then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then((body) => { products = Array.isArray(body.products) ? body.products : []; render(); })
    .catch(() => { products = []; render(); });
})();
