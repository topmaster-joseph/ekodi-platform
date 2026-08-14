(() => {
  const API = 'https://mall-api.ekodi.kr';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  if (!window.supabase) return;

  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const money = (value) => `${new Intl.NumberFormat('ko-KR').format(Number(value) || 0)}원`;
  const number = (value) => new Intl.NumberFormat('ko-KR').format(Number(value) || 0);

  function metric(label, value, note = '') {
    const node = document.createElement('article');
    const span = document.createElement('span');
    const h3 = document.createElement('h3');
    const p = document.createElement('p');
    span.textContent = label;
    h3.textContent = value;
    p.textContent = note;
    node.append(span, h3, p);
    return node;
  }

  function ensureSection() {
    let section = document.querySelector('#sellerAnalytics');
    if (section) return section;
    const readiness = document.querySelector('#commerceReadiness');
    const anchor = readiness || document.querySelector('#sellerAuth');
    if (!anchor) return null;
    section = document.createElement('section');
    section.id = 'sellerAnalytics';
    section.className = 'seller-modules';
    section.innerHTML = `
      <div class="heading analytics-heading">
        <div>
          <p class="eyebrow">SELLER ANALYTICS</p>
          <h2>숫자는 크게 말하지 않고<br>정확히 말하도록</h2>
          <p>페이지뷰를 추정하지 않습니다. 7일 first-touch로 실제 기록된 유입, 익명 방문자, paid 주문만 집계합니다.</p>
        </div>
        <label class="analytics-period">기간
          <select data-analytics-days aria-label="분석 기간">
            <option value="7">최근 7일</option>
            <option value="30" selected>최근 30일</option>
            <option value="90">최근 90일</option>
          </select>
        </label>
      </div>
      <div class="module-grid" data-analytics-summary>
        <article><span>LOCKED</span><h3>Google 로그인 필요</h3><p>판매자 본인 데이터만 서버에서 집계합니다.</p></article>
      </div>
      <div class="analytics-source-wrap">
        <div class="heading analytics-subheading"><div><p class="eyebrow">FIRST TOUCH</p><h2>유입 경로</h2></div></div>
        <div class="module-grid" data-analytics-sources></div>
      </div>
      <div class="analytics-products-wrap">
        <div class="heading analytics-subheading"><div><p class="eyebrow">PRODUCTS</p><h2>상품별 성과</h2><p data-analytics-definition>유입 기록은 일반 페이지뷰가 아니라 first-touch 기록 기준입니다.</p></div></div>
        <div class="analytics-product-list" data-analytics-products></div>
      </div>
      <p class="studio-local-note" data-analytics-status>로그인 후 Mall D1에서 읽기 전용으로 집계합니다. visitor ID, attribution token, 구매자 개인정보는 반환하지 않습니다.</p>`;
    anchor.insertAdjacentElement('afterend', section);
    section.querySelector('[data-analytics-days]')?.addEventListener('change', loadAnalytics);
    return section;
  }

  async function token() {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token || '';
  }

  async function fetchAnalytics(days) {
    const accessToken = await token();
    if (!accessToken) throw new Error('Google 판매자 로그인이 필요합니다.');
    const response = await fetch(`${API}/api/analytics/summary?days=${encodeURIComponent(days)}`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Mall API ${response.status}`);
    return body.analytics || {};
  }

  function renderProducts(container, products = []) {
    container.replaceChildren();
    if (!products.length) {
      container.append(metric('START', '아직 상품이 없습니다', '상품을 서버에 저장하면 성과가 상품별로 표시됩니다.'));
      return;
    }
    products.forEach((product) => {
      const row = document.createElement('article');
      row.className = 'analytics-product-row';
      const title = document.createElement('div');
      const kicker = document.createElement('small');
      const h3 = document.createElement('h3');
      const status = document.createElement('p');
      kicker.textContent = `${product.status === 'published' ? 'PUBLISHED' : String(product.status || 'DRAFT').toUpperCase()} · ${String(product.saleType || '').toUpperCase()}`;
      h3.textContent = product.name || '상품';
      status.textContent = `유입 기록 ${number(product.entryEvents)} · first-touch ${number(product.attributedProductVisits)} · Direct ${number(product.sourceCounts?.direct)} / Mall ${number(product.sourceCounts?.marketplace)} / AI ${number(product.sourceCounts?.ai)}`;
      title.append(kicker, h3, status);

      const orders = document.createElement('div');
      orders.className = 'analytics-product-orders';
      const paid = document.createElement('strong');
      const orderNote = document.createElement('span');
      paid.textContent = money(product.paidGrossAmount);
      orderNote.textContent = `paid ${number(product.paidOrders)}건 · pending ${number(product.pendingOrders)}건`;
      orders.append(paid, orderNote);
      row.append(title, orders);
      container.append(row);
    });
  }

  function render(analytics) {
    const section = ensureSection();
    if (!section) return;
    const summary = analytics.summary || {};
    const summaryBox = section.querySelector('[data-analytics-summary]');
    const sourcesBox = section.querySelector('[data-analytics-sources]');
    const productsBox = section.querySelector('[data-analytics-products]');
    const status = section.querySelector('[data-analytics-status]');
    const definition = section.querySelector('[data-analytics-definition]');

    summaryBox.replaceChildren(
      metric('ENTRY RECORDS', number(summary.entryEvents), '7일 first-touch 창에서 새 attribution이 기록된 횟수'),
      metric('UNIQUE VISITORS', number(summary.uniqueVisitors), '선택 기간 first-touch 익명 방문자 중복 제거'),
      metric('PUBLISHED', `${number(summary.publishedCount)} / ${number(summary.productCount)}`, '게시상품 / 전체 서버상품'),
      metric('PAID ORDERS', number(summary.paidOrders), `pending ${number(summary.pendingOrders)}건은 매출 제외`),
      metric('PAID GROSS', money(summary.paidGrossAmount), 'status=paid 주문만 합산'),
      metric('SELLER LEDGER', money(summary.recognizedSellerAmount), 'payable 또는 paid 정산원장의 seller_amount')
    );

    const sources = summary.sourceCounts || {};
    sourcesBox.replaceChildren(
      metric('DIRECT · 7%', number(sources.direct), '판매자 직접공유 first-touch'),
      metric('MALL · 8%', number(sources.marketplace), '몰 탐색·일반 상품링크 first-touch'),
      metric('AI · 9%', number(sources.ai), '서버가 발급한 AI attribution first-touch')
    );

    renderProducts(productsBox, analytics.products || []);
    if (definition && analytics.definitions?.entryEvents) definition.textContent = analytics.definitions.entryEvents;
    if (status) status.textContent = `최근 ${analytics.period?.days || 30}일 · ${analytics.period?.generatedAt ? new Date(analytics.period.generatedAt).toLocaleString('ko-KR') : '방금'} 서버 집계 · 원본 visitor ID와 attribution token은 노출하지 않습니다.`;
  }

  async function loadAnalytics() {
    const section = ensureSection();
    if (!section) return;
    const summaryBox = section.querySelector('[data-analytics-summary]');
    const status = section.querySelector('[data-analytics-status]');
    const days = section.querySelector('[data-analytics-days]')?.value || '30';
    try {
      if (!(await token())) {
        summaryBox.replaceChildren(metric('LOCKED', 'Google 로그인 필요', '판매자 본인 데이터만 서버에서 집계합니다.'));
        if (status) status.textContent = '로그인하면 Mall D1에서 본인 상품 데이터만 읽기 전용 집계합니다.';
        return;
      }
      summaryBox.replaceChildren(metric('LOADING', '집계 중...', 'Mall D1에서 기간별 데이터를 확인하고 있습니다.'));
      const analytics = await fetchAnalytics(days);
      render(analytics);
    } catch (error) {
      summaryBox.replaceChildren(metric('RETRY', '분석을 불러오지 못했습니다', error.message));
      if (status) status.textContent = error.message;
    }
  }

  ensureSection();
  sb.auth.onAuthStateChange(() => setTimeout(loadAnalytics, 0));
  window.addEventListener('focus', loadAnalytics);
  loadAnalytics();
})();
