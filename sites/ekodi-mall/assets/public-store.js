(() => {
  const API = 'https://mall-api.ekodi.kr';
  const main = document.querySelector('#publicStore');
  const status = document.querySelector('#storeStatus');
  const slug = (() => {
    const match = location.pathname.match(/^\/store\/([^/?#]+)/);
    try { return match ? decodeURIComponent(match[1]).toLowerCase() : ''; } catch { return ''; }
  })();
  const money = (value) => value === null || value === undefined ? '가격 문의' : `${new Intl.NumberFormat('ko-KR').format(Number(value) || 0)}원`;
  const saleLabel = (type) => type === 'direct' ? '직접판매' : type === 'affiliate' ? '제휴판매' : '상담형';

  function text(tag, value, className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  }

  function productCard(product) {
    const article = document.createElement('article');
    article.className = 'card storefront-product';
    const thumb = document.createElement('a');
    thumb.className = `thumb ${product.category || 'living'}`;
    thumb.href = `/p/${encodeURIComponent(product.shareCode)}`;
    const badge = text('span', `${saleLabel(product.saleType)} · Mall 8%`, 'badge');
    thumb.append(badge);

    const body = document.createElement('div');
    body.className = 'card-body';
    const h3 = document.createElement('h3');
    const link = document.createElement('a');
    link.href = thumb.href;
    link.textContent = product.name || '상품';
    h3.append(link);
    const desc = text('p', product.oneLine || '상품 상세페이지에서 자세한 내용을 확인하세요.');
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.append(text('span', money(product.price), 'status'));
    const detail = document.createElement('a');
    detail.className = 'smallbtn'; detail.href = thumb.href; detail.textContent = '상품 보기';
    meta.append(detail);
    body.append(h3, desc, meta);
    article.append(thumb, body);
    return article;
  }

  function render(store) {
    document.title = `${store.name} | EKODI MALL`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', `${store.name}의 EKODI MALL Storefront. 게시된 상품을 확인하세요.`);
    if (status) status.textContent = `${store.name} · 게시상품 ${store.products?.length || 0}개 · 실제 결제는 상품별 준비상태에 따릅니다.`;
    main.replaceChildren();

    const hero = document.createElement('section');
    hero.className = 'storefront-public-hero';
    const mark = document.createElement('div');
    mark.className = 'storefront-public-mark';
    mark.textContent = (store.name || 'S').slice(0, 1);
    const copy = document.createElement('div');
    copy.append(
      text('p', 'SELLER STOREFRONT', 'eyebrow'),
      text('h1', store.name || 'Store'),
      text('p', `${store.seller?.displayName || '판매자'} · ${store.seller?.type === 'business' ? '사업자 판매자' : '개인 판매자'}`, 'detail-desc')
    );
    const trust = document.createElement('div');
    trust.className = 'storefront-trust';
    trust.append(
      text('span', store.verificationStatus === 'verified' ? 'Store 검증 완료' : 'Store 검증 전'),
      text('span', '게시상품만 표시'),
      text('span', 'Mall 탐색 8%')
    );
    copy.append(trust);
    hero.append(mark, copy);

    const notice = document.createElement('section');
    notice.className = 'storefront-attribution-note';
    notice.append(text('strong', '유입 기준'), text('p', store.attributionNotice || 'Storefront 상품 탐색은 Mall 경로로 분류됩니다.'));

    const collection = document.createElement('section');
    collection.className = 'store-products storefront-collection';
    const heading = document.createElement('div');
    heading.className = 'heading';
    const headingCopy = document.createElement('div');
    headingCopy.append(text('p', 'STORE COLLECTION', 'eyebrow'), text('h2', '이 Store의 게시상품'), text('p', '상품을 선택하면 공개 상세페이지로 이동합니다.'));
    heading.append(headingCopy);
    const grid = document.createElement('div');
    grid.className = 'grid';
    (store.products || []).forEach((product) => grid.append(productCard(product)));
    collection.append(heading, grid);
    main.append(hero, notice, collection);
  }

  async function load() {
    if (!slug) {
      if (status) status.textContent = '올바른 Store 주소가 아닙니다.';
      if (main) main.replaceChildren(text('p', 'Store 주소를 확인해 주세요.', 'empty'));
      return;
    }
    try {
      const response = await fetch(`${API}/api/public/stores/${encodeURIComponent(slug)}`, { headers: { accept: 'application/json' } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Mall API ${response.status}`);
      render(body.store || {});
    } catch (error) {
      if (status) status.textContent = 'Store를 표시할 수 없습니다.';
      if (main) main.replaceChildren(text('p', error.message, 'empty'));
    }
  }

  load();
})();
