(() => {
  const API = 'https://mall-api.ekodi.kr';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  if (!window.supabase) return;

  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  const blockerLabels = {
    'not-direct-sale': '직접판매 상품이 아님',
    'product-not-published': '상품 게시 필요',
    'price-not-confirmed': '확정 판매가격 필요',
    'seller-verification': '판매자 직접판매 검증 필요',
    'business-store-verification': '사업자 스토어 검증 필요',
    'product-checkout-gate': '상품 판매 게이트 승인 필요',
    'payments-disabled': '온라인 결제 전체 OFF',
    'toss-secret-missing': 'Toss 서버키 미연결'
  };

  const statusLabels = {
    pending: '검증 전',
    submitted: '검증 요청 접수',
    under_review: '검토 중',
    verified: '검증 완료',
    rejected: '재검토 필요',
    cancelled: '요청 취소',
    unverified: '검증 전',
    google_verified: 'Google 본인확인'
  };

  function ensureSection() {
    let section = document.querySelector('#commerceReadiness');
    if (section) return section;
    const anchor = document.querySelector('#sellerAuth');
    if (!anchor) return null;
    section = document.createElement('section');
    section.id = 'commerceReadiness';
    section.className = 'studio-shell';
    section.innerHTML = `
      <div class="studio-intro">
        <div>
          <p class="eyebrow">DIRECT SALE READINESS</p>
          <h2>판매 준비상태를<br>서버가 직접 판정</h2>
          <p>판매자 검증, 사업자 Store 검증, 상품 가격·게시·checkout gate, 결제 전체 스위치를 서로 분리해 확인합니다. 판매자가 브라우저에서 승인상태를 바꿀 수 없습니다.</p>
        </div>
        <div class="readiness-card">
          <small>직접판매 상태</small>
          <strong data-readiness-head>로그인 후 확인</strong>
          <p data-readiness-global>실제 결제는 계속 비활성 상태입니다.</p>
          <button class="smallbtn" type="button" data-readiness-refresh>상태 새로고침</button>
        </div>
      </div>
      <div class="module-grid" data-readiness-grid>
        <article><span>LOCKED</span><h3>Google 로그인 필요</h3><p>회원 세션을 확인하면 판매자·Store·상품별 준비상태를 표시합니다.</p></article>
      </div>`;
    anchor.insertAdjacentElement('afterend', section);
    section.querySelector('[data-readiness-refresh]')?.addEventListener('click', () => loadReadiness());
    return section;
  }

  async function token() {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token || '';
  }

  async function api(path, options = {}) {
    const accessToken = await token();
    if (!accessToken) throw new Error('Google 판매자 로그인이 필요합니다.');
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${accessToken}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Mall API ${response.status}`);
    return body;
  }

  const label = (value) => statusLabels[value] || String(value || '확인 필요');
  const blockersText = (items = []) => items.length ? items.map((item) => blockerLabels[item] || item).join(' · ') : '필수 조건 충족';

  function activeRequest(readiness, entityType, entityId) {
    return (readiness.requests || []).find((request) => request.entityType === entityType && request.entityId === entityId && ['submitted', 'under_review'].includes(request.status));
  }

  function staticArticle(kicker, title, description) {
    const article = document.createElement('article');
    const span = document.createElement('span');
    const h3 = document.createElement('h3');
    const p = document.createElement('p');
    span.textContent = kicker;
    h3.textContent = title;
    p.textContent = description;
    article.append(span, h3, p);
    return article;
  }

  function sellerArticle(readiness) {
    const profile = readiness.profile;
    const current = profile?.directSaleStatus || 'pending';
    const open = profile ? activeRequest(readiness, 'seller', profile.userId) : null;
    const article = staticArticle('SELLER', `판매자 · ${label(current)}`, profile
      ? `${profile.displayName || '판매자'} · ${profile.sellerType === 'business' ? '사업자' : '개인'} · 본인확인 ${label(profile.verificationStatus)}`
      : '판매자 프로필을 생성하면 검증을 요청할 수 있습니다.');
    if (current !== 'verified') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'smallbtn';
      button.textContent = open ? label(open.status) : '직접판매 검증 요청';
      button.disabled = Boolean(open);
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = '요청 저장 중...';
        try {
          const sellerType = document.querySelector('#sellerDraftForm [name="sellerType"]')?.value || profile?.sellerType || 'individual';
          await api('/api/verification/seller/submit', {
            method: 'POST',
            body: JSON.stringify({ sellerType, note: 'Seller Studio에서 직접판매 검증을 요청했습니다.' })
          });
          await loadReadiness();
        } catch (error) {
          button.disabled = false;
          button.textContent = '다시 요청';
          alert(error.message);
        }
      });
      article.append(button);
    }
    return article;
  }

  function storeArticle(store, readiness) {
    const open = activeRequest(readiness, 'store', store.id);
    const article = staticArticle('STORE', `${store.name} · ${label(store.verificationStatus)}`, `상태 ${store.status} · /${store.slug}`);
    if (readiness.profile?.sellerType === 'business' && store.verificationStatus !== 'verified') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'smallbtn';
      button.textContent = open ? label(open.status) : 'Store 검증 요청';
      button.disabled = Boolean(open);
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = '요청 저장 중...';
        try {
          await api(`/api/stores/${encodeURIComponent(store.id)}/verification/submit`, {
            method: 'POST',
            body: JSON.stringify({ note: 'Seller Studio에서 사업자 Store 검증을 요청했습니다.' })
          });
          await loadReadiness();
        } catch (error) {
          button.disabled = false;
          button.textContent = '다시 요청';
          alert(error.message);
        }
      });
      article.append(button);
    }
    return article;
  }

  function productArticle(product) {
    const state = product.livePaymentReady ? 'READY' : product.eligibleForCheckoutGate ? 'OPS GATE' : 'BLOCKED';
    const description = product.livePaymentReady
      ? '서버 기준 실결제 조건이 모두 충족되었습니다.'
      : product.eligibleForCheckoutGate
        ? `판매자·상품 요건 충족 · ${blockersText(product.liveBlockers)}`
        : blockersText(product.gateBlockers);
    return staticArticle(state, product.name || '상품', description);
  }

  function render(readiness) {
    const section = ensureSection();
    if (!section) return;
    const head = section.querySelector('[data-readiness-head]');
    const global = section.querySelector('[data-readiness-global]');
    const grid = section.querySelector('[data-readiness-grid]');
    const profile = readiness.profile;
    const summary = readiness.summary || {};
    head.textContent = profile ? `${label(profile.directSaleStatus)} · 상품 ${summary.productCount || 0}개` : '판매자 프로필 준비 전';
    global.textContent = readiness.global?.paymentsEnabled
      ? `결제 전역 ON · Toss ${readiness.global.tossSecretConfigured ? '연결' : '미연결'} · 운영검토 ${readiness.global.operationsReviewConfigured ? '연결' : '미연결'}`
      : `결제 전역 OFF · 운영검토 ${readiness.global?.operationsReviewConfigured ? '연결' : '미연결'} · 현재 실제 돈은 움직이지 않습니다.`;
    grid.replaceChildren();
    grid.append(sellerArticle(readiness));
    (readiness.stores || []).forEach((store) => grid.append(storeArticle(store, readiness)));
    (readiness.products || []).slice(0, 8).forEach((product) => grid.append(productArticle(product)));
    if (!(readiness.stores || []).length && !(readiness.products || []).length) {
      grid.append(staticArticle('START', '상품을 먼저 저장해 주세요', 'Seller Studio에서 첫 상품을 서버에 저장하면 상품별 준비상태가 표시됩니다.'));
    }
  }

  async function loadReadiness() {
    const section = ensureSection();
    if (!section) return;
    const head = section.querySelector('[data-readiness-head]');
    const grid = section.querySelector('[data-readiness-grid]');
    try {
      if (!(await token())) {
        head.textContent = '로그인 후 확인';
        grid.replaceChildren(staticArticle('LOCKED', 'Google 로그인 필요', '회원 세션을 확인하면 판매자·Store·상품별 준비상태를 표시합니다.'));
        return;
      }
      head.textContent = '서버 상태 확인 중...';
      const result = await api('/api/readiness');
      render(result.readiness || {});
    } catch (error) {
      head.textContent = '상태 확인 실패';
      grid.replaceChildren(staticArticle('RETRY', 'Mall API 상태를 확인해 주세요', error.message));
    }
  }

  ensureSection();
  sb.auth.onAuthStateChange(() => setTimeout(loadReadiness, 0));
  window.addEventListener('focus', () => loadReadiness());
  loadReadiness();
})();
