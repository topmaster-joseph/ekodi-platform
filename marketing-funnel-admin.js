(() => {
  const API = 'https://api.ekodi.kr';
  const ACCOUNT = 'coupang-ekodibiz';
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
    label.textContent = '⛓ Integrations';
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
          <p class="kicker">INTEGRATIONS</p>
          <h2>외부 서비스 연결</h2>
          <p>EKODI에서 사용하는 외부 서비스 계정과 제휴 운영을 한곳에서 관리합니다.</p>
        </div>
      </div>

      <article class="integration-provider" aria-labelledby="coupangProviderTitle">
        <div class="integration-provider-top">
          <div class="integration-provider-brand"><span class="integration-provider-logo">CP</span><div><small>AFFILIATE</small><strong id="coupangProviderTitle">Coupang Partners</strong><p>운영 주체: EKODIBIZ</p></div></div>
          <span class="integration-status" id="affiliateConnectionState">연결 상태 확인 중</span>
        </div>

        <div class="integration-capabilities" id="affiliateCapabilities" aria-live="polite">
          <span>계정 설정 확인 중</span>
        </div>

        <form id="affiliateAccountForm" class="integration-account-form">
          <div class="integration-form-heading"><div><strong>쿠팡파트너스 계정 연결 설정</strong><p>계정의 운영 이름, 기본 채널, 제휴 고지 문구를 저장합니다.</p></div><span class="integration-mode" id="affiliateConnectionMode">MANUAL</span></div>
          <div class="integration-form-grid">
            <label>연결 이름<input name="displayName" maxlength="120" placeholder="에코디비즈 쿠팡파트너스" required></label>
            <label>기본 채널<input name="defaultChannel" maxlength="120" placeholder="EKODI Mall / YouTube / Blog 등"></label>
            <label class="integration-wide">제휴 고지 문구<textarea name="disclosureText" maxlength="1000" rows="3" placeholder="이 포스팅은 쿠팡 파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다."></textarea></label>
            <label class="integration-toggle"><input name="enabled" type="checkbox"> 이 계정을 EKODI 제휴 운영에 사용</label>
          </div>
          <div class="integration-form-actions"><button class="primary" type="submit">계정 연결 설정 저장</button><span id="affiliateAccountUpdated"></span></div>
        </form>

        <div class="integration-security-note"><strong>보안 원칙</strong><span>Access Key, Secret Key 같은 민감 자격정보는 이 화면이나 브라우저에 저장하지 않습니다.</span></div>
      </article>

      <div class="integration-summary-grid" aria-label="쿠팡파트너스 최근 30일 성과">
        <article><small>활성 링크</small><strong id="affiliateLinks30d">—</strong></article>
        <article><small>클릭</small><strong id="affiliateClicks30d">—</strong></article>
        <article><small>주문</small><strong id="affiliateOrders30d">—</strong></article>
        <article><small>수익</small><strong id="affiliateRevenue30d">—</strong></article>
      </div>

      <div class="cards integration-operation-cards">
        <article class="module">
          <div class="icon">↗</div>
          <div><strong>제휴링크 등록</strong><p>쿠팡파트너스에서 발급받은 링크를 EKODI 채널·캠페인과 연결합니다.</p>
            <form id="affiliateLinkForm" class="integration-inline-form">
              <input name="productName" placeholder="상품/콘텐츠 이름" required>
              <input name="affiliateUrl" type="url" placeholder="https://..." required>
              <input name="channel" placeholder="채널">
              <input name="campaignName" placeholder="카테고리/캠페인">
              <label class="integration-toggle"><input name="publishToEkodiMall" type="checkbox" checked> 에코디몰(ekodi.kr/mall)에 공개</label>
              <button class="primary" type="submit">등록</button>
            </form>
          </div>
        </article>
        <article class="module">
          <div class="icon">₩</div>
          <div><strong>일별 성과</strong><p>클릭·주문·수익을 날짜별로 기록합니다.</p>
            <form id="affiliateMetricForm" class="integration-inline-form metric-form">
              <input name="metricDate" type="date" required>
              <input name="clicks" type="number" min="0" value="0" aria-label="클릭" required>
              <input name="orders" type="number" min="0" value="0" aria-label="주문" required>
              <input name="revenueKrw" type="number" min="0" value="0" aria-label="수익 원" required>
              <button class="primary" type="submit">저장</button>
            </form>
          </div>
        </article>
      </div>
      <p class="integration-message" id="affiliateMessage" role="status" aria-live="polite"></p>`;
    content.append(panel);

    const accountForm = document.querySelector('#affiliateAccountForm');
    const message = document.querySelector('#affiliateMessage');
    let accountLoaded = false;

    function setMessage(text, isError = false) {
      if (!message) return;
      message.textContent = text || '';
      message.classList.toggle('error', Boolean(isError));
    }

    function capabilityText(capabilities = {}) {
      const automated = Boolean(capabilities.automaticProductSearch || capabilities.automaticDeepLink || capabilities.automaticPerformanceSync);
      return automated
        ? 'API 자동연동 기능이 활성화되어 있습니다.'
        : '현재 수동 연결 모드입니다. 계정 설정·제휴링크·성과 기록을 사용할 수 있으며 API 자동연동은 별도 자격정보 구성 후 활성화됩니다.';
    }

    function renderOverview(data) {
      const s = data.summary || {};
      document.querySelector('#affiliateLinks30d').textContent = Number(s.activeLinks || 0).toLocaleString('ko-KR');
      document.querySelector('#affiliateClicks30d').textContent = Number(s.clicks30d || 0).toLocaleString('ko-KR');
      document.querySelector('#affiliateOrders30d').textContent = Number(s.orders30d || 0).toLocaleString('ko-KR');
      document.querySelector('#affiliateRevenue30d').textContent = `${Number(s.revenue30dKrw || 0).toLocaleString('ko-KR')}원`;

      const account = (data.accounts || []).find(item => item.id === ACCOUNT) || (data.accounts || [])[0];
      const state = document.querySelector('#affiliateConnectionState');
      const mode = document.querySelector('#affiliateConnectionMode');
      const capabilities = document.querySelector('#affiliateCapabilities');
      if (capabilities) capabilities.textContent = capabilityText(data.capabilities || {});

      if (!account) {
        if (state) state.textContent = '계정 연결 필요';
        if (mode) mode.textContent = 'NOT CONNECTED';
        return;
      }

      if (state) {
        state.textContent = account.enabled ? (account.connectionMode === 'manual' ? '수동 연결됨' : '연결됨') : '사용 중지';
        state.classList.toggle('connected', Boolean(account.enabled));
      }
      if (mode) mode.textContent = String(account.connectionMode || 'manual').toUpperCase();
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
      const data = await api('/api/affiliate/overview');
      renderOverview(data);
      return data;
    }

    const show = async () => {
      document.querySelectorAll('[data-panel]').forEach(item => item.classList.toggle('hidden-panel', !String(item.dataset.panel || '').split(' ').includes('affiliates')));
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'affiliates'));
      const title = document.querySelector('#pageTitle'); if (title) title.textContent = 'Integrations';
      history.replaceState(null, '', '#affiliates');
      try {
        setMessage('');
        await loadOverview();
      } catch (error) {
        setMessage(error.message, true);
      }
    };

    button.addEventListener('click', show);

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
        setMessage('쿠팡파트너스 계정 연결 설정을 저장했습니다.');
        const updated = document.querySelector('#affiliateAccountUpdated');
        if (updated) updated.textContent = data.account?.updatedAt ? `최근 설정 ${new Date(data.account.updatedAt).toLocaleString('ko-KR')}` : '방금 저장';
        await loadOverview();
      } catch (error) {
        setMessage(error.message, true);
      } finally {
        submit.disabled = false;
      }
    });

    document.querySelector('#affiliateLinkForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api('/api/affiliate/links', {
          method: 'POST',
          body: JSON.stringify({
            accountId: ACCOUNT,
            productName: form.elements.productName.value,
            affiliateUrl: form.elements.affiliateUrl.value,
            channel: form.elements.channel.value,
            campaignName: form.elements.campaignName.value,
            tenantSlug: form.elements.publishToEkodiMall?.checked ? 'ekodi-mall' : '',
          }),
        });
        form.reset();
        setMessage('제휴링크를 등록했습니다.');
        await loadOverview();
      } catch (error) {
        setMessage(error.message, true);
      }
    });

    document.querySelector('#affiliateMetricForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api('/api/affiliate/metrics', {
          method: 'POST',
          body: JSON.stringify({
            accountId: ACCOUNT,
            metricDate: form.elements.metricDate.value,
            clicks: form.elements.clicks.value,
            orders: form.elements.orders.value,
            revenueKrw: form.elements.revenueKrw.value,
          }),
        });
        setMessage('성과를 저장했습니다.');
        await loadOverview();
      } catch (error) {
        setMessage(error.message, true);
      }
    });

    const date = document.querySelector('#affiliateMetricForm [name="metricDate"]');
    if (date) date.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    if (location.hash === '#affiliates') setTimeout(show, 0);
    return true;
  }

  const run = () => { keepMarketingReview(); installAffiliate(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();