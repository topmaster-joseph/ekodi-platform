(() => {
  const API = 'https://api.ekodi.kr';
  const ACCOUNT = 'coupang-ekodibiz';
  const MALL = 'https://ekodi.kr/ekodibiz/mall';
  const TRACKING_URL = 'https://renzehysxirjilvdxacv.supabase.co/rest/v1/mall_sales_events';
  const TRACKING_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
    return data;
  };

  async function mallEvents() {
    if (!token()) throw new Error('관리자 인증이 필요합니다.');
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const query = new URLSearchParams({
      select: 'created_at,event_type,campaign,source,medium,content,product_id,target_host,test',
      test: 'eq.false',
      created_at: `gte.${since}`,
      order: 'created_at.desc',
      limit: '2000',
    });
    const response = await fetch(`${TRACKING_URL}?${query}`, {
      headers: { apikey: TRACKING_KEY, authorization: `Bearer ${token()}` },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data?.message || `몰 영업 이벤트 요청 실패 (${response.status})`);
    return Array.isArray(data) ? data : [];
  }

  function keepMarketingReview() {
    const section = document.querySelector('#clientAccessSection');
    if (!section || section.dataset.marketingFunnelReady === 'true') return false;
    section.dataset.marketingFunnelReady = 'true';
    const head = section.querySelector('.client-access-head');
    if (head) {
      const link = document.createElement('a');
      link.className = 'secondary compact';
      link.href = 'https://auth.ekodi.kr/?site=marketing&review=1&return_to=https%3A%2F%2Fmarketing.ekodi.kr%2F';
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Marketing AI Pro 신청 검수 ↗';
      head.append(link);
    }
    return true;
  }

  function installAffiliate() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('#affiliatePanel')) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav';
    button.dataset.section = 'affiliates';
    const label = document.createElement('span');
    label.textContent = '🛒 에코디몰 AI 영업';
    button.append(label);
    const policies = nav.querySelector('[data-section="policies"]');
    if (policies) nav.insertBefore(button, policies); else nav.append(button);

    const panel = document.createElement('section');
    panel.id = 'affiliatePanel';
    panel.className = 'section hidden-panel';
    panel.dataset.panel = 'affiliates';
    panel.innerHTML = `
      <div class="section-head integration-head">
        <div>
          <p class="kicker">EKODI MALL · AI SALES</p>
          <h2>에코디몰 AI 영업</h2>
          <p>상품 운영 → 몰 유입 → 상품 확인 → 제휴 클릭 → 주문·수익 연결 상태를 실제 원장 기준으로 관리합니다.</p>
        </div>
        <a class="secondary compact" href="${MALL}" target="_blank" rel="noopener">에코디몰 열기 ↗</a>
      </div>

      <article class="integration-provider" aria-labelledby="mallFunnelTitle">
        <div class="integration-provider-top">
          <div class="integration-provider-brand"><span class="integration-provider-logo">AI</span><div><small>CANONICAL SALES FUNNEL</small><strong id="mallFunnelTitle">핵심 영업 퍼널</strong><p>${MALL}</p></div></div>
          <span class="integration-status connected">실데이터 원장</span>
        </div>
        <div class="integration-summary-grid" aria-label="최근 30일 에코디몰 실제 영업 이벤트">
          <article><small>몰 유입</small><strong id="mallVisits30d">—</strong></article>
          <article><small>상품 확인</small><strong id="mallProductViews30d">—</strong></article>
          <article><small>제휴 클릭</small><strong id="mallAffiliateClicks30d">—</strong></article>
          <article><small>추적 캠페인</small><strong id="mallCampaigns30d">—</strong></article>
        </div>
        <p class="integration-message" id="mallTrackingMessage">실제 방문·상품확인·제휴클릭 이벤트를 불러오는 중입니다.</p>
        <div class="integration-security-note"><strong>측정 원칙</strong><span>테스트 이벤트는 실제 성과에서 제외합니다. 쿠팡 주문·수익은 제휴사 보고 원장이 연결된 값만 별도로 표시하며 추정하지 않습니다.</span></div>
      </article>

      <article class="integration-provider" aria-labelledby="coupangProviderTitle">
        <div class="integration-provider-top">
          <div class="integration-provider-brand"><span class="integration-provider-logo">CP</span><div><small>PRODUCT PROVIDER</small><strong id="coupangProviderTitle">Coupang Partners</strong><p>운영 주체: EKODIBIZ</p></div></div>
          <span class="integration-status" id="affiliateConnectionState">연결 상태 확인 중</span>
        </div>

        <div class="integration-capabilities" id="affiliateCapabilities" aria-live="polite">
          <span>자동 상품운영 상태 확인 중</span>
        </div>

        <div class="cards integration-operation-cards">
          <article class="module">
            <div class="icon">↻</div>
            <div>
              <strong>에코디몰 자동 상품운영</strong>
              <p>상품 검색 → 선별 → 파트너 링크 발급 → 에코디몰 반영을 자동으로 처리합니다. AI를 사용할 수 없을 때는 규칙 기반 선별이 계속 동작합니다.</p>
              <div class="integration-summary-grid" aria-label="자동 상품운영 상태">
                <article><small>운영 상품</small><strong id="affiliateActiveProducts">—</strong></article>
                <article><small>선별 방식</small><strong id="affiliateAiMode">—</strong></article>
                <article><small>후보 상품</small><strong id="affiliateCandidates">—</strong></article>
                <article><small>마지막 갱신</small><strong id="affiliateLastRun">—</strong></article>
              </div>
              <div class="integration-form-actions">
                <button class="primary" id="affiliateAutomationRun" type="button">지금 상품 새로고침</button>
                <span id="affiliateAutomationState"></span>
              </div>
            </div>
          </article>
        </div>

        <form id="affiliateAccountForm" class="integration-account-form">
          <div class="integration-form-heading"><div><strong>에코디몰 운영 설정</strong><p>운영 이름, 기본 채널과 필수 제휴 고지 문구를 관리합니다.</p></div><span class="integration-mode" id="affiliateConnectionMode">AUTO</span></div>
          <div class="integration-form-grid">
            <label>연결 이름<input name="displayName" maxlength="120" placeholder="에코디비즈 쿠팡파트너스" required></label>
            <label>기본 채널<input name="defaultChannel" maxlength="120" placeholder="EKODI Mall"></label>
            <label class="integration-wide">제휴 고지 문구<textarea name="disclosureText" maxlength="1000" rows="3" placeholder="쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."></textarea></label>
            <label class="integration-toggle"><input name="enabled" type="checkbox"> 이 연결을 에코디몰 운영에 사용</label>
          </div>
          <div class="integration-form-actions"><button class="primary" type="submit">운영 설정 저장</button><span id="affiliateAccountUpdated"></span></div>
        </form>

        <div class="integration-security-note"><strong>보안 원칙</strong><span>Access Key와 Secret Key는 브라우저나 데이터베이스에 저장하지 않고 서버의 암호화된 Worker Secret으로만 사용합니다.</span></div>
      </article>

      <article class="integration-provider" aria-labelledby="multiAffiliateTitle">
        <div class="integration-provider-top">
          <div class="integration-provider-brand"><span class="integration-provider-logo">＋</span><div><small>MULTI AFFILIATE MARKETPLACE</small><strong id="multiAffiliateTitle">다른 제휴 판매처 상품 연결</strong><p id="affiliateProviderSummary">등록된 제휴처를 확인하는 중입니다.</p></div></div>
          <span class="integration-status connected">공통 커넥터</span>
        </div>
        <div id="affiliateFeedProviders" class="integration-capabilities" aria-live="polite"><span>서버 Feed 연결 상태를 확인하는 중입니다.</span></div>
        <form id="affiliateMerchantRouteForm" class="integration-account-form">
          <div class="integration-form-heading"><div><strong>판매처 제휴 경로 설정</strong><p>최저가여도 제휴 active, 추적링크 ready, 상품·가격 공급 ready, 추천 허용까지 모두 완료된 판매처만 사용자 추천에 올라갑니다.</p></div><span class="integration-mode">ROUTE</span></div>
          <div class="integration-form-grid">
            <label>판매처 코드<input name="merchantKey" maxlength="80" placeholder="예: elevenst" required></label>
            <label>판매처 이름<input name="merchantName" maxlength="120" placeholder="예: 11번가" required></label>
            <label>국가 코드<input name="marketCountry" maxlength="2" value="KR" placeholder="KR · US · JP"></label>
            <label>정산 통화<input name="settlementCurrency" maxlength="3" value="KRW" placeholder="KRW · USD · JPY"></label>
            <label>제휴 방식<select name="affiliateMode"><option value="network">간접 제휴망</option><option value="direct">직접 제휴</option></select></label>
            <label>제휴 상태<select name="affiliateStatus"><option value="candidate">후보</option><option value="pending">신청/승인 대기</option><option value="approved">승인됨</option><option value="active">활성</option><option value="suspended">중지</option></select></label>
            <label>추적링크 상태<select name="trackingStatus"><option value="not_ready">미준비</option><option value="pending">확인 중</option><option value="ready">추적 확인 완료</option><option value="failed">오류</option></select></label>
            <label>상품·가격 공급<select name="catalogStatus"><option value="not_ready">미준비</option><option value="manual_verified">수동 가격 검증</option><option value="feed_ready">Feed/API 정상</option><option value="stale">가격 만료</option><option value="failed">오류</option></select></label>
            <label>제휴망 코드<input name="networkKey" maxlength="80" value="linkprice" list="affiliateNetworkKeys" placeholder="linkprice · awin · impact"></label>
            <label>제휴망 이름<input name="networkName" maxlength="120" value="LinkPrice" placeholder="LinkPrice · Awin · impact.com"></label>
            <datalist id="affiliateNetworkKeys"><option value="linkprice"><option value="awin"><option value="impact"><option value="cj"><option value="rakuten"></datalist>
            <label class="integration-wide">제휴 프로그램/관리 URL<input name="programUrl" type="url" inputmode="url" placeholder="https://... (선택)"></label>
            <label class="integration-wide">운영 메모<textarea name="notes" maxlength="500" rows="2" placeholder="승인일, 담당자, 해외 세금/통화 메모 등"></textarea></label>
            <label class="integration-toggle"><input name="recommendationEnabled" type="checkbox"> 제휴 완료 후 이 판매처의 상품을 추천 후보로 허용</label>
          </div>
          <div class="integration-form-actions"><button class="primary" type="submit">제휴 경로 저장</button><span id="affiliateMerchantRouteState"></span></div>
        </form>
        <div id="affiliateMerchantRoutes" class="integration-capabilities" aria-live="polite"><span>제휴 경로를 확인하는 중입니다.</span></div>
        <form id="affiliateExternalProductForm" class="integration-account-form">
          <div class="integration-form-heading"><div><strong>제휴 완료 상품 등록</strong><p>판매처 코드는 실제 Merchant 기준으로 입력합니다. 간접 제휴망(LinkPrice 등)은 위 제휴 경로 설정에서 관리합니다.</p></div><span class="integration-mode">MANUAL</span></div>
          <div class="integration-form-grid">
            <label>판매처 코드<input name="providerKey" maxlength="80" placeholder="예: elevenst" required></label>
            <label>판매처 이름<input name="providerName" maxlength="120" placeholder="예: 11번가" required></label>
            <label>상품명<input name="productName" maxlength="240" required></label>
            <label>카테고리<input name="category" maxlength="120" placeholder="건강 · 식품 · 생활"></label>
            <label>검증 비교가격(원)<input name="priceKrw" type="number" min="1" step="1" required placeholder="해외상품도 현재 검증된 원화 환산값"></label>
            <label>원 판매가<input name="sourcePriceAmount" type="number" min="0" step="0.01" placeholder="해외 판매가 선택"></label>
            <label>원 판매가 통화<input name="sourcePriceCurrency" maxlength="3" placeholder="KRW · USD · JPY"></label>
            <label>제휴처 상품 ID<input name="sourceId" maxlength="160" placeholder="선택"></label>
            <label>GTIN/바코드<input name="gtin" inputmode="numeric" maxlength="32" placeholder="8?12?13?14자리"></label>
            <label>브랜드<input name="brand" maxlength="120" placeholder="선택"></label>
            <label>모델명<input name="model" maxlength="160" placeholder="선택"></label>
            <label>동일상품 묶음키<input name="productIdentityKey" maxlength="160" placeholder="검증된 동일 상품일 때만"></label>
            <label class="integration-wide">제휴 구매 링크<input name="affiliateUrl" type="url" inputmode="url" placeholder="https://..." required></label>
            <label class="integration-wide">원본 상품 링크<input name="destinationUrl" type="url" inputmode="url" placeholder="https://... (선택)"></label>
            <label class="integration-wide">상품 이미지 링크<input name="imageUrl" type="url" inputmode="url" placeholder="https://... (선택)"></label>
            <label class="integration-wide">제휴 고지 문구<textarea name="disclosureText" maxlength="1000" rows="2" placeholder="판매처별 제휴 고지 문구가 있으면 입력"></textarea></label>
          </div>
          <div class="integration-form-actions"><button class="primary" type="submit">에코디몰에 상품 등록</button><span id="affiliateExternalProductState"></span></div>
        </form>
        <div class="integration-security-note"><strong>추천 원칙</strong><span>제휴 완료(active + 추천 허용)는 추천의 입장권입니다. 그 안에서 실제 가격·배송·사용자 적합성으로 순위를 정하며 수수료율은 추천 점수에 넣지 않습니다.</span></div>
      </article>

      <div class="integration-summary-grid" aria-label="에코디몰 최근 운영 현황">
        <article><small>운영 상품</small><strong id="affiliateProducts30d">—</strong></article>
        <article><small>제휴 원장 클릭</small><strong id="affiliateClicks30d">—</strong></article>
        <article><small>주문 원장</small><strong id="affiliateOrders30d">—</strong></article>
        <article><small>수익 원장</small><strong id="affiliateRevenue30d">—</strong></article>
      </div>
      <p class="integration-message" id="affiliateMessage" role="status" aria-live="polite"></p>`;
    content.append(panel);

    const accountForm = document.querySelector('#affiliateAccountForm');
    const merchantRouteForm = document.querySelector('#affiliateMerchantRouteForm');
    const merchantRoutes = document.querySelector('#affiliateMerchantRoutes');
    const externalProductForm = document.querySelector('#affiliateExternalProductForm');
    const feedProviders = document.querySelector('#affiliateFeedProviders');
    const message = document.querySelector('#affiliateMessage');
    const trackingMessage = document.querySelector('#mallTrackingMessage');
    const runButton = document.querySelector('#affiliateAutomationRun');
    let accountLoaded = false;

    function setMessage(text, isError = false) {
      if (!message) return;
      message.textContent = text || '';
      message.classList.toggle('error', Boolean(isError));
    }

    function capabilityText(capabilities = {}, automation = {}) {
      if (!automation.configured) return '쿠팡 파트너스 API 자격정보가 연결되면 상품 검색·선별·링크 발급·몰 반영이 자동으로 시작됩니다.';
      if (automation.status === 'failed') return '최근 자동 갱신에 실패했습니다. 기존 운영 상품은 유지됩니다.';
      if (capabilities.automaticProductSearch && capabilities.automaticDeepLink) return '상품 검색·선별·파트너 링크 발급·몰 반영이 자동으로 운영됩니다.';
      return '자동 상품운영 상태를 확인하고 있습니다.';
    }

    function formatRunTime(value) {
      if (!value) return '아직 없음';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '아직 없음' : date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    }

    function renderAutomation(automation = {}) {
      const modeText = automation.aiMode === 'ai' ? 'AI + 규칙' : '규칙 기반';
      const active = Number(automation.activeProducts || 0);
      const candidates = Number(automation.candidateCount || 0);
      document.querySelector('#affiliateActiveProducts').textContent = `${active.toLocaleString('ko-KR')}개`;
      document.querySelector('#affiliateAiMode').textContent = modeText;
      document.querySelector('#affiliateCandidates').textContent = `${candidates.toLocaleString('ko-KR')}개`;
      document.querySelector('#affiliateLastRun').textContent = formatRunTime(automation.lastRunAt);
      const detail = document.querySelector('#affiliateAutomationState');
      if (detail) detail.textContent = automation.configured ? (automation.needsRefresh ? '갱신 준비' : '자동 운영 중') : 'API 자격정보 연결 필요';
    }

    function renderMallEvents(rows) {
      const visits = rows.filter(row => row.event_type === 'mall_visit').length;
      const views = rows.filter(row => row.event_type === 'product_view').length;
      const clicks = rows.filter(row => row.event_type === 'affiliate_click').length;
      const campaigns = new Set(rows.map(row => String(row.campaign || '')).filter(Boolean)).size;
      document.querySelector('#mallVisits30d').textContent = visits.toLocaleString('ko-KR');
      document.querySelector('#mallProductViews30d').textContent = views.toLocaleString('ko-KR');
      document.querySelector('#mallAffiliateClicks30d').textContent = clicks.toLocaleString('ko-KR');
      document.querySelector('#mallCampaigns30d').textContent = campaigns.toLocaleString('ko-KR');
      if (trackingMessage) trackingMessage.textContent = `최근 30일 실제 원장 ${rows.length.toLocaleString('ko-KR')}건 · 테스트 제외 · 마지막 확인 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;
    }

    function renderProviderFeeds(providers = []) {
      if (!feedProviders) return;
      feedProviders.replaceChildren();
      const feeds = providers.filter(item => item.feedConfigured);
      if (!feeds.length) {
        const empty = document.createElement('span');
        empty.textContent = '자동 Feed 커넥터는 준비되어 있습니다. 서버에 제휴처 Feed 설정이 추가되면 여기에 연결 상태가 표시됩니다.';
        feedProviders.append(empty);
        return;
      }
      for (const provider of feeds) {
        const row = document.createElement('div');
        row.className = 'integration-form-actions';
        const label = document.createElement('span');
        const syncState = provider.lastSyncedAt ? formatRunTime(provider.lastSyncedAt) : '아직 동기화 없음';
        const readiness = provider.secretRequired && !provider.secretConfigured ? '비밀키 필요' : provider.status;
        label.textContent = `${provider.displayName || provider.providerKey} · ${readiness} · ${provider.endpointHost || 'Feed'} · ${syncState}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary compact';
        button.dataset.providerSync = provider.providerKey;
        button.textContent = 'Feed 동기화';
        button.disabled = !provider.enabled || (provider.secretRequired && !provider.secretConfigured);
        row.append(label, button);
        feedProviders.append(row);
      }
    }

    function renderMerchantRoutes(routes = []) {
      if (!merchantRoutes) return;
      merchantRoutes.replaceChildren();
      if (!routes.length) {
        const empty = document.createElement('span');
        empty.textContent = '아직 판매처 제휴 경로가 없습니다. 최저가 후보를 발견하면 직접 또는 제휴망 경로를 먼저 등록하세요.';
        merchantRoutes.append(empty);
        return;
      }
      for (const route of routes) {
        const row = document.createElement('div');
        row.className = 'integration-form-actions';
        const label = document.createElement('span');
        const via = route.affiliateMode === 'network' ? `간접 · ${route.networkName || route.networkKey}` : '직접 제휴';
        const market = `${route.marketCountry || 'KR'} · ${route.settlementCurrency || 'KRW'}`;
        const eligible = route.recommendationReady ? '추천 가능' : '추천 차단';
        label.textContent = `${route.merchantName || route.merchantKey} · ${via} · 제휴 ${route.affiliateStatus} · 추적 ${route.trackingStatus || 'not_ready'} · 가격 ${route.catalogStatus || 'not_ready'} · ${eligible} · ${market}`;
        row.append(label);
        merchantRoutes.append(row);
      }
    }

    function renderOverview(data) {
      const s = data.summary || {};
      const automation = data.automation || {};
      document.querySelector('#affiliateProducts30d').textContent = Number(s.activeProducts || 0).toLocaleString('ko-KR');
      document.querySelector('#affiliateClicks30d').textContent = Number(s.clicks30d || 0).toLocaleString('ko-KR');
      document.querySelector('#affiliateOrders30d').textContent = Number(s.orders30d || 0).toLocaleString('ko-KR');
      document.querySelector('#affiliateRevenue30d').textContent = `${Number(s.revenue30dKrw || 0).toLocaleString('ko-KR')}원`;
      renderAutomation(automation);

      const accounts = data.accounts || [];
      const account = accounts.find(item => item.id === ACCOUNT) || accounts[0];
      const providerSummary = document.querySelector('#affiliateProviderSummary');
      if (providerSummary) {
        const names = [...new Set(accounts.map(item => item.displayName || item.providerKey).filter(Boolean))];
        providerSummary.textContent = names.length ? `현재 ${names.length}개 연결 · ${names.join(' · ')}` : '등록된 제휴처가 없습니다.';
      }
      const state = document.querySelector('#affiliateConnectionState');
      const mode = document.querySelector('#affiliateConnectionMode');
      const capabilities = document.querySelector('#affiliateCapabilities');
      if (capabilities) capabilities.textContent = capabilityText(data.capabilities || {}, automation);

      if (state) {
        state.textContent = automation.configured ? (automation.activeProducts > 0 ? '자동 운영 중' : 'API 연결됨') : 'API 연결 필요';
        state.classList.toggle('connected', Boolean(automation.configured));
      }
      if (mode) mode.textContent = automation.configured ? 'AUTO' : 'SETUP';
      if (!account) return;

      if (!accountLoaded && accountForm) {
        accountForm.elements.displayName.value = account.displayName || '';
        accountForm.elements.defaultChannel.value = account.defaultChannel || '';
        accountForm.elements.disclosureText.value = account.disclosureText || '';
        accountForm.elements.enabled.checked = Boolean(account.enabled);
        const updated = document.querySelector('#affiliateAccountUpdated');
        if (updated) updated.textContent = account.updatedAt ? `최근 설정 ${new Date(account.updatedAt).toLocaleString('ko-KR')}` : '';
        accountLoaded = true;
      }
    }

    async function loadOverview() {
      const [affiliate, providerData, routeData, events] = await Promise.all([api('/api/affiliate/overview'), api('/api/affiliate/providers').catch(() => ({ providers: [] })), api('/api/affiliate/routes').catch(() => ({ routes: [] })), mallEvents().catch(() => [])]);
      renderOverview(affiliate);
      renderProviderFeeds(providerData.providers || []);
      renderMerchantRoutes(routeData.routes || []);
      renderMallEvents(events);
      return affiliate;
    }

    const show = async () => {
      document.querySelectorAll('[data-panel]').forEach(item => item.classList.toggle('hidden-panel', !String(item.dataset.panel || '').split(' ').includes('affiliates')));
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'affiliates'));
      const title = document.querySelector('#pageTitle'); if (title) title.textContent = '에코디몰 AI 영업';
      history.replaceState(null, '', '#mall-ai-sales');
      try {
        setMessage('');
        if (trackingMessage) trackingMessage.textContent = '실제 영업 이벤트 원장을 확인하는 중입니다.';
        await loadOverview();
      } catch (error) {
        setMessage(error.message, true);
        if (trackingMessage) trackingMessage.textContent = `영업 이벤트 원장 확인 필요 · ${error.message}`;
      }
    };

    button.addEventListener('click', show);

    runButton?.addEventListener('click', async () => {
      runButton.disabled = true;
      const original = runButton.textContent;
      runButton.textContent = '상품 새로고침 중…';
      setMessage('');
      try {
        const result = await api('/api/affiliate/automation/run', { method: 'POST', body: '{}' });
        setMessage(result.selectedCount ? `${Number(result.selectedCount).toLocaleString('ko-KR')}개 상품을 새로 반영했습니다.` : '자동 상품운영 상태를 갱신했습니다.');
        await loadOverview();
      } catch (error) {
        setMessage(error.message, true);
      } finally {
        runButton.disabled = false;
        runButton.textContent = original;
      }
    });

    accountForm?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const data = await api(`/api/affiliate/accounts/${ACCOUNT}`, {
          method: 'PUT',
          body: JSON.stringify({
            displayName: form.elements.displayName.value,
            defaultChannel: form.elements.defaultChannel.value,
            disclosureText: form.elements.disclosureText.value,
            enabled: form.elements.enabled.checked,
          }),
        });
        accountLoaded = false;
        setMessage('에코디몰 운영 설정을 저장했습니다.');
        const updated = document.querySelector('#affiliateAccountUpdated');
        if (updated) updated.textContent = data.account?.updatedAt ? `최근 설정 ${new Date(data.account.updatedAt).toLocaleString('ko-KR')}` : '방금 저장';
        await loadOverview();
      } catch (error) {
        setMessage(error.message, true);
      } finally {
        submit.disabled = false;
      }
    });

    merchantRouteForm?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      const state = document.querySelector('#affiliateMerchantRouteState');
      submit.disabled = true;
      if (state) state.textContent = '저장 중…';
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.recommendationEnabled = form.elements.recommendationEnabled.checked;
        const data = await api('/api/affiliate/routes', { method: 'POST', body: JSON.stringify(payload) });
        const route = data.route || {};
        setMessage(`${route.merchantName || route.merchantKey} 제휴 경로를 저장했습니다.${route.recommendationReady ? ' 제휴·추적·가격 검증을 통과해 추천 가능합니다.' : ' 모든 게이트를 통과하기 전에는 추천되지 않습니다.'}`);
        if (state) state.textContent = route.recommendationReady ? '검증 완료 · 추천 가능' : `제휴 ${route.affiliateStatus || 'candidate'} · 추적 ${route.trackingStatus || 'not_ready'} · 가격 ${route.catalogStatus || 'not_ready'}`;
        await loadOverview();
      } catch (error) {
        setMessage(error.message, true);
        if (state) state.textContent = '저장 실패';
      } finally {
        submit.disabled = false;
      }
    });

    feedProviders?.addEventListener('click', async event => {
      const button = event.target.closest('[data-provider-sync]');
      if (!button || button.disabled) return;
      const providerKey = String(button.dataset.providerSync || '');
      if (!/^[a-z0-9_-]+$/.test(providerKey)) return;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = '동기화 중…';
      setMessage('');
      try {
        const result = await api(`/api/affiliate/providers/${encodeURIComponent(providerKey)}/sync`, { method: 'POST', body: '{}' });
        setMessage(`${result.providerName || providerKey} Feed 동기화 완료 · ${Number(result.synced || 0).toLocaleString('ko-KR')}개 반영`);
        await loadOverview();
      } catch (error) {
        setMessage(error.message, true);
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });

    externalProductForm?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      const state = document.querySelector('#affiliateExternalProductState');
      submit.disabled = true;
      if (state) state.textContent = '등록 중…';
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.priceKrw = Number(payload.priceKrw || 0);
        const data = await api('/api/affiliate/products', { method: 'POST', body: JSON.stringify(payload) });
        setMessage(`${data.providerName} 상품을 에코디몰에 등록했습니다.`);
        if (state) state.textContent = `등록 완료 · 링크 #${data.linkId}`;
        const keep = { providerKey: form.elements.providerKey.value, providerName: form.elements.providerName.value, disclosureText: form.elements.disclosureText.value };
        form.reset();
        form.elements.providerKey.value = keep.providerKey;
        form.elements.providerName.value = keep.providerName;
        form.elements.disclosureText.value = keep.disclosureText;
        await loadOverview();
      } catch (error) {
        setMessage(error.message, true);
        if (state) state.textContent = '등록 실패';
      } finally {
        submit.disabled = false;
      }
    });

    if (location.hash === '#affiliates' || location.hash === '#mall-ai-sales') setTimeout(show, 0);
    return true;
  }

  const run = () => { keepMarketingReview(); installAffiliate(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
