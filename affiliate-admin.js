(() => {
  const API = 'https://api.ekodi.kr';
  const ACCOUNT_ID = 'coupang-ekodibiz';
  let loaded = false;
  let loading = false;
  let links = [];

  function token() {
    return sessionStorage.getItem('ekodi-auth-token') || '';
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `API 요청 실패 (${response.status})`);
    return data;
  }

  function krw(value) {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function text(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function message(value = '', kind = '') {
    const node = document.querySelector('#affiliateMessage');
    if (!node) return;
    node.textContent = value;
    node.className = `affiliate-message${kind ? ` ${kind}` : ''}`;
  }

  function panelHtml() {
    return `
      <div class="section-head">
        <div><p class="kicker">AFFILIATE OPERATIONS</p><h2>Affiliate Marketing</h2><p>제휴계정·링크·캠페인·성과를 EKODI에서 한 흐름으로 관리합니다.</p></div>
        <div class="affiliate-actions"><a class="secondary" href="https://partners.coupang.com" target="_blank" rel="noopener">Coupang Partners ↗</a><button class="secondary" id="affiliateRefresh" type="button">↻ Refresh</button></div>
      </div>
      <div class="affiliate-panel">
        <div class="affiliate-summary" aria-label="제휴마케팅 핵심 지표">
          <article><small>Providers</small><strong id="affiliateProviders">—</strong><span>활성 제휴 채널</span></article>
          <article><small>Active Links</small><strong id="affiliateActiveLinks">—</strong><span>등록 제휴링크</span></article>
          <article><small>Clicks · 30d</small><strong id="affiliateClicks">—</strong><span id="affiliateOrders">주문 —</span></article>
          <article><small>Revenue · 30d</small><strong id="affiliateRevenue">—</strong><span>수익 원장</span></article>
        </div>

        <div class="affiliate-layout">
          <article class="affiliate-card">
            <small>PRIMARY CONNECTOR</small>
            <div class="affiliate-status-row"><div><h3 id="affiliateAccountName">에코디비즈 쿠팡파트너스</h3><p id="affiliateAccountLabel">EKODIBIZ</p></div><span class="affiliate-badge" id="affiliateStatus">Manual ready</span></div>
            <div class="affiliate-note" id="affiliateApiNote"><strong>현재:</strong> 쿠팡파트너스에서 생성한 제휴링크를 EKODI가 중앙 등록·추적합니다. 비밀키는 브라우저에 저장하지 않습니다.</div>
            <form class="affiliate-form" id="affiliateAccountForm">
              <div class="affiliate-form-grid">
                <label>계정 표시 이름<input name="displayName" maxlength="120" required></label>
                <label>기본 채널<input name="defaultChannel" maxlength="120" placeholder="예: EKODI Mall / YouTube"></label>
              </div>
              <label>제휴 고지문<textarea name="disclosureText" maxlength="1000" placeholder="게시 채널의 최신 쿠팡파트너스 정책에 맞는 고지문을 등록하세요."></textarea></label>
              <div class="affiliate-actions"><button class="primary" type="submit">Account Settings 저장</button><span class="affiliate-badge warn" id="affiliateDisclosureState">고지문 확인 필요</span></div>
            </form>
          </article>

          <article class="affiliate-card">
            <small>LINK REGISTRY</small><h3>제휴링크 등록</h3><p>쿠팡파트너스에서 만든 링크를 상품·캠페인·채널 정보와 함께 중앙 관리합니다.</p>
            <form class="affiliate-form" id="affiliateLinkForm">
              <label>상품 / 콘텐츠 이름<input name="productName" maxlength="200" required placeholder="예: 대학생 자취 필수품"></label>
              <label>쿠팡파트너스 제휴링크<input name="affiliateUrl" type="url" inputmode="url" required placeholder="https://..."></label>
              <label>원본 상품 URL · 선택<input name="destinationUrl" type="url" inputmode="url" placeholder="https://..."></label>
              <div class="affiliate-form-grid">
                <label>채널<input name="channel" maxlength="120" placeholder="Instagram / Blog / Mall"></label>
                <label>캠페인<input name="campaignName" maxlength="160" placeholder="2026 여름추천"></label>
              </div>
              <label>고객 테넌트 · 선택<input name="tenantSlug" maxlength="80" placeholder="jadam / pizzamaru 등"></label>
              <button class="primary" type="submit">제휴링크 등록</button>
            </form>
          </article>
        </div>

        <div class="affiliate-layout">
          <article class="affiliate-card">
            <small>PERFORMANCE LEDGER</small><h3>일별 성과 입력</h3><p>자동 동기화 전까지 쿠팡파트너스 성과를 날짜별로 기록합니다. 같은 날짜는 덮어써서 중복을 막습니다.</p>
            <form class="affiliate-form" id="affiliateMetricForm">
              <div class="affiliate-form-grid">
                <label>일자<input name="metricDate" type="date" required></label>
                <label>클릭<input name="clicks" type="number" min="0" step="1" value="0" required></label>
                <label>주문<input name="orders" type="number" min="0" step="1" value="0" required></label>
                <label>수익(원)<input name="revenueKrw" type="number" min="0" step="1" value="0" required></label>
              </div>
              <button class="primary" type="submit">성과 원장 저장</button>
            </form>
          </article>
          <article class="affiliate-card">
            <small>AUTOMATION READINESS</small><h3>API 자동화 상태</h3>
            <div class="affiliate-note"><strong>링크 등록·성과 원장:</strong> 사용 가능<br><strong>상품검색·딥링크·성과 자동동기화:</strong> 공식 제휴 API 계약 확인 후 활성화<br><strong>보안:</strong> Access/Secret Key 입력은 관리자 브라우저에 두지 않음</div>
            <p style="margin-top:10px">쿠팡 판매자 Open API와 쿠팡파트너스 제휴 연동을 혼용하지 않도록 어댑터 경계를 분리해 두었습니다.</p>
          </article>
        </div>

        <article class="affiliate-card">
          <div class="affiliate-section-title"><div><small>RECENT LINKS</small><h3>최근 제휴링크</h3></div><p id="affiliateLinkCount">0건</p></div>
          <div class="affiliate-table-wrap"><table class="affiliate-table"><thead><tr><th>상품/콘텐츠</th><th>채널</th><th>캠페인</th><th>테넌트</th><th>등록일</th><th>링크</th><th></th></tr></thead><tbody id="affiliateLinkRows"><tr><td colspan="7" class="affiliate-empty">제휴링크를 불러오는 중입니다.</td></tr></tbody></table></div>
        </article>
        <p class="affiliate-message" id="affiliateMessage" role="status"></p>
      </div>`;
  }

  function install() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('#affiliatePanel')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav';
    button.dataset.section = 'affiliates';
    button.append(document.createTextNode('↗ '));
    const label = document.createElement('span');
    label.textContent = 'Affiliates';
    button.append(label);
    const policies = nav.querySelector('[data-section="policies"]');
    const activity = nav.querySelector('a[href="/legacy#activity"]');
    if (policies) nav.insertBefore(button, policies);
    else if (activity) nav.insertBefore(button, activity);
    else nav.append(button);

    const panel = document.createElement('section');
    panel.id = 'affiliatePanel';
    panel.className = 'section hidden-panel';
    panel.dataset.panel = 'affiliates';
    panel.innerHTML = panelHtml();
    content.append(panel);

    document.querySelector('#affiliateRefresh')?.addEventListener('click', () => load(true));
    document.querySelector('#affiliateAccountForm')?.addEventListener('submit', saveAccount);
    document.querySelector('#affiliateLinkForm')?.addEventListener('submit', saveLink);
    document.querySelector('#affiliateMetricForm')?.addEventListener('submit', saveMetric);
    document.querySelector('#affiliateLinkRows')?.addEventListener('click', handleLinkAction);
    const dateInput = document.querySelector('#affiliateMetricForm [name="metricDate"]');
    if (dateInput) dateInput.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

    button.addEventListener('click', activate);
    if (location.hash === '#affiliates') setTimeout(() => button.click(), 0);
  }

  function activate() {
    document.querySelectorAll('[data-panel]').forEach(panel => {
      const targets = String(panel.dataset.panel || '').split(' ');
      panel.classList.toggle('hidden-panel', !targets.includes('affiliates'));
    });
    document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'affiliates'));
    text('#pageTitle', 'Affiliates');
    document.querySelector('.sidebar')?.classList.remove('open');
    history.replaceState(null, '', '#affiliates');
    load();
  }

  function renderAccount(account, capabilities) {
    if (!account) return;
    text('#affiliateAccountName', account.displayName);
    text('#affiliateAccountLabel', account.accountLabel || account.ownerKey || 'EKODIBIZ');
    text('#affiliateStatus', account.connectionMode === 'manual' ? 'Manual ready' : account.status);
    const form = document.querySelector('#affiliateAccountForm');
    if (form) {
      form.elements.displayName.value = account.displayName || '';
      form.elements.defaultChannel.value = account.defaultChannel || '';
      form.elements.disclosureText.value = account.disclosureText || '';
    }
    const disclosure = document.querySelector('#affiliateDisclosureState');
    if (disclosure) {
      disclosure.textContent = account.disclosureText ? '고지문 등록됨' : '고지문 확인 필요';
      disclosure.classList.toggle('warn', !account.disclosureText);
    }
    const note = document.querySelector('#affiliateApiNote');
    if (note) {
      const automatic = capabilities?.automaticDeepLink;
      note.textContent = automatic
        ? '공식 제휴 API 자동화가 활성화되어 있습니다.'
        : '현재는 쿠팡파트너스에서 생성한 제휴링크를 EKODI가 중앙 등록·추적합니다. 비밀키는 브라우저에 저장하지 않습니다.';
    }
  }

  function renderLinks(items) {
    links = items || [];
    text('#affiliateLinkCount', `${links.length}건`);
    const body = document.querySelector('#affiliateLinkRows');
    if (!body) return;
    body.replaceChildren();
    if (!links.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.className = 'affiliate-empty';
      cell.textContent = '등록된 제휴링크가 없습니다.';
      row.append(cell);
      body.append(row);
      return;
    }
    for (const item of links) {
      const row = document.createElement('tr');
      const values = [item.productName, item.channel || '—', item.campaignName || '—', item.tenantSlug || '—', String(item.createdAt || '').slice(0, 10)];
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      const linkCell = document.createElement('td');
      const open = document.createElement('a');
      open.href = item.affiliateUrl;
      open.target = '_blank';
      open.rel = 'noopener';
      open.textContent = '열기 ↗';
      linkCell.append(open);
      row.append(linkCell);

      const actionCell = document.createElement('td');
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.dataset.action = 'copy';
      copy.dataset.id = String(item.id);
      copy.textContent = '복사';
      const archive = document.createElement('button');
      archive.type = 'button';
      archive.dataset.action = 'archive';
      archive.dataset.id = String(item.id);
      archive.textContent = '보관';
      actionCell.append(copy, archive);
      row.append(actionCell);
      body.append(row);
    }
  }

  async function load(force = false) {
    if (!token() || loading || (loaded && !force)) return;
    loading = true;
    message('제휴마케팅 정보를 불러오는 중입니다.');
    try {
      const [overview, linkData] = await Promise.all([
        api('/api/affiliate/overview'),
        api('/api/affiliate/links?limit=50'),
      ]);
      text('#affiliateProviders', overview.summary.providers);
      text('#affiliateActiveLinks', overview.summary.activeLinks);
      text('#affiliateClicks', new Intl.NumberFormat('ko-KR').format(overview.summary.clicks30d));
      text('#affiliateOrders', `주문 ${new Intl.NumberFormat('ko-KR').format(overview.summary.orders30d)}`);
      text('#affiliateRevenue', krw(overview.summary.revenue30dKrw));
      renderAccount(overview.accounts.find(account => account.id === ACCOUNT_ID) || overview.accounts[0], overview.capabilities);
      renderLinks(linkData.links);
      loaded = true;
      message('최신 제휴마케팅 운영정보를 불러왔습니다.', 'success');
    } catch (error) {
      if (/401|로그인|인증/.test(String(error.message))) message('관리자 로그인 후 제휴마케팅 정보를 확인할 수 있습니다.', 'error');
      else message(error.message || '제휴마케팅 정보를 불러오지 못했습니다.', 'error');
    } finally {
      loading = false;
    }
  }

  async function saveAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return form.reportValidity();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    message('계정 설정을 저장하는 중입니다.');
    try {
      const result = await api(`/api/affiliate/accounts/${ACCOUNT_ID}`, {
        method: 'PUT',
        body: JSON.stringify({
          displayName: form.elements.displayName.value,
          defaultChannel: form.elements.defaultChannel.value,
          disclosureText: form.elements.disclosureText.value,
        }),
      });
      renderAccount(result.account);
      loaded = false;
      message('쿠팡파트너스 계정 설정을 저장했습니다.', 'success');
    } catch (error) {
      message(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  }

  async function saveLink(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return form.reportValidity();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    message('제휴링크를 등록하는 중입니다.');
    try {
      await api('/api/affiliate/links', {
        method: 'POST',
        body: JSON.stringify({
          accountId: ACCOUNT_ID,
          productName: form.elements.productName.value,
          affiliateUrl: form.elements.affiliateUrl.value,
          destinationUrl: form.elements.destinationUrl.value,
          channel: form.elements.channel.value,
          campaignName: form.elements.campaignName.value,
          tenantSlug: form.elements.tenantSlug.value,
        }),
      });
      form.reset();
      loaded = false;
      await load(true);
      message('제휴링크를 등록했습니다.', 'success');
    } catch (error) {
      message(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  }

  async function saveMetric(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return form.reportValidity();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    message('성과 원장을 저장하는 중입니다.');
    try {
      await api('/api/affiliate/metrics', {
        method: 'POST',
        body: JSON.stringify({
          accountId: ACCOUNT_ID,
          metricDate: form.elements.metricDate.value,
          clicks: form.elements.clicks.value,
          orders: form.elements.orders.value,
          revenueKrw: form.elements.revenueKrw.value,
        }),
      });
      loaded = false;
      await load(true);
      message('일별 성과 원장을 저장했습니다.', 'success');
    } catch (error) {
      message(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  }

  async function handleLinkAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    const item = links.find(link => Number(link.id) === id);
    if (!item) return;
    if (button.dataset.action === 'copy') {
      try {
        await navigator.clipboard.writeText(item.affiliateUrl);
        button.textContent = '복사됨';
        setTimeout(() => { button.textContent = '복사'; }, 1200);
      } catch {
        message('브라우저에서 링크 복사를 허용하지 않았습니다.', 'error');
      }
      return;
    }
    if (button.dataset.action === 'archive') {
      button.disabled = true;
      try {
        await api(`/api/affiliate/links/${id}/archive`, { method: 'POST' });
        loaded = false;
        await load(true);
        message('제휴링크를 보관 처리했습니다.', 'success');
      } catch (error) {
        message(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
