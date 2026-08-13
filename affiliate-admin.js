(() => {
  const API = 'https://api.ekodi.kr';
  const ACCOUNT = 'coupang-ekodibiz';
  let loaded = false;
  let links = [];

  const $ = selector => document.querySelector(selector);
  const setText = (selector, value) => { const node = $(selector); if (node) node.textContent = value; };
  const auth = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const money = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const say = (value, kind = '') => { const node = $('#affiliateMessage'); if (node) { node.textContent = value; node.className = `affiliate-message${kind ? ` ${kind}` : ''}`; } };

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (auth()) headers.set('authorization', `Bearer ${auth()}`);
    if (options.body) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
    return data;
  }

  function markup() {
    return `<div class="section-head"><div><p class="kicker">AFFILIATE OPERATIONS</p><h2>Affiliate Marketing</h2><p>에코디비즈 제휴링크와 캠페인 성과를 한곳에서 관리합니다.</p></div><div class="affiliate-actions"><a class="secondary" href="https://partners.coupang.com" target="_blank" rel="noopener">Coupang Partners ↗</a><button class="secondary" id="affiliateRefresh" type="button">↻ Refresh</button></div></div>
    <div class="affiliate-panel">
      <div class="affiliate-summary"><article><small>Providers</small><strong id="affiliateProviders">—</strong><span>제휴 채널</span></article><article><small>Active Links</small><strong id="affiliateActiveLinks">—</strong><span>활성 링크</span></article><article><small>Clicks · 30d</small><strong id="affiliateClicks">—</strong><span id="affiliateOrders">주문 —</span></article><article><small>Revenue · 30d</small><strong id="affiliateRevenue">—</strong><span>성과 원장</span></article></div>
      <div class="affiliate-grid">
        <article class="affiliate-card"><small>COUPANG PARTNERS</small><h3 id="affiliateAccountName">에코디비즈 쿠팡파트너스</h3><p>현재는 쿠팡파트너스에서 생성한 링크를 EKODI에 등록해 중앙 관리합니다.</p><form class="affiliate-form" id="affiliateAccountForm"><div class="affiliate-form-row"><label>계정 표시 이름<input name="displayName" maxlength="120" required></label><label>기본 채널<input name="defaultChannel" maxlength="120" placeholder="EKODI Mall / YouTube"></label></div><label>제휴 고지문<textarea name="disclosureText" maxlength="1000" placeholder="현재 운영정책에 맞는 고지문을 등록하세요."></textarea></label><div class="affiliate-actions"><button class="primary" type="submit">설정 저장</button><span class="affiliate-badge" id="affiliateStatus">Manual ready</span></div></form></article>
        <article class="affiliate-card"><small>LINK REGISTRY</small><h3>제휴링크 등록</h3><form class="affiliate-form" id="affiliateLinkForm"><label>상품 / 콘텐츠 이름<input name="productName" maxlength="200" required></label><label>제휴링크<input name="affiliateUrl" type="url" required placeholder="https://..."></label><div class="affiliate-form-row"><label>채널<input name="channel" maxlength="120" placeholder="Instagram / Blog / Mall"></label><label>캠페인<input name="campaignName" maxlength="160"></label></div><label>고객 테넌트 · 선택<input name="tenantSlug" maxlength="80" placeholder="jadam / pizzamaru"></label><button class="primary" type="submit">링크 등록</button></form></article>
      </div>
      <article class="affiliate-card"><small>PERFORMANCE LEDGER</small><h3>일별 성과 입력</h3><form class="affiliate-form" id="affiliateMetricForm"><div class="affiliate-form-row"><label>일자<input name="metricDate" type="date" required></label><label>클릭<input name="clicks" type="number" min="0" value="0" required></label><label>주문<input name="orders" type="number" min="0" value="0" required></label><label>수익(원)<input name="revenueKrw" type="number" min="0" value="0" required></label></div><button class="primary" type="submit">성과 저장</button></form></article>
      <article class="affiliate-card"><small>RECENT LINKS</small><h3>최근 제휴링크</h3><div class="affiliate-table-wrap"><table class="affiliate-table"><thead><tr><th>상품/콘텐츠</th><th>채널</th><th>캠페인</th><th>테넌트</th><th>등록일</th><th>링크</th><th></th></tr></thead><tbody id="affiliateRows"><tr><td colspan="7">불러오는 중입니다.</td></tr></tbody></table></div></article>
      <p class="affiliate-message" id="affiliateMessage" role="status"></p>
    </div>`;
  }

  function install() {
    const nav = $('.sidebar nav');
    const content = $('.content');
    if (!nav || !content || $('#affiliatePanel')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'nav'; button.dataset.section = 'affiliates'; button.innerHTML = '<span>↗ Affiliates</span>';
    const policies = nav.querySelector('[data-section="policies"]');
    if (policies) nav.insertBefore(button, policies); else nav.append(button);
    const panel = document.createElement('section');
    panel.id = 'affiliatePanel'; panel.className = 'section hidden-panel'; panel.dataset.panel = 'affiliates'; panel.innerHTML = markup(); content.append(panel);
    button.addEventListener('click', activate);
    $('#affiliateRefresh')?.addEventListener('click', () => load(true));
    $('#affiliateAccountForm')?.addEventListener('submit', saveAccount);
    $('#affiliateLinkForm')?.addEventListener('submit', saveLink);
    $('#affiliateMetricForm')?.addEventListener('submit', saveMetric);
    $('#affiliateRows')?.addEventListener('click', linkAction);
    const date = $('#affiliateMetricForm [name="metricDate"]');
    if (date) date.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    if (location.hash === '#affiliates') setTimeout(() => button.click(), 0);
  }

  function activate() {
    document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('hidden-panel', !String(panel.dataset.panel || '').split(' ').includes('affiliates')));
    document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'affiliates'));
    setText('#pageTitle', 'Affiliates');
    history.replaceState(null, '', '#affiliates');
    load();
  }

  function renderAccount(account) {
    if (!account) return;
    setText('#affiliateAccountName', account.displayName || '에코디비즈 쿠팡파트너스');
    setText('#affiliateStatus', account.connectionMode === 'manual' ? 'Manual ready' : account.status);
    const form = $('#affiliateAccountForm');
    if (form) { form.elements.displayName.value = account.displayName || ''; form.elements.defaultChannel.value = account.defaultChannel || ''; form.elements.disclosureText.value = account.disclosureText || ''; }
  }

  function renderLinks(items) {
    links = items || [];
    const body = $('#affiliateRows');
    if (!body) return;
    body.replaceChildren();
    if (!links.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 7; cell.textContent = '등록된 제휴링크가 없습니다.'; row.append(cell); body.append(row); return; }
    for (const item of links) {
      const row = document.createElement('tr');
      for (const value of [item.productName, item.channel || '—', item.campaignName || '—', item.tenantSlug || '—', String(item.createdAt || '').slice(0, 10)]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
      const linkCell = document.createElement('td'); const a = document.createElement('a'); a.href = item.affiliateUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '열기 ↗'; linkCell.append(a); row.append(linkCell);
      const action = document.createElement('td'); const copy = document.createElement('button'); copy.type = 'button'; copy.dataset.copy = item.id; copy.textContent = '복사'; const archive = document.createElement('button'); archive.type = 'button'; archive.dataset.archive = item.id; archive.textContent = '보관'; action.append(copy, archive); row.append(action); body.append(row);
    }
  }

  async function load(force = false) {
    if (!auth() || (loaded && !force)) return;
    try {
      const [overview, recent] = await Promise.all([request('/api/affiliate/overview'), request('/api/affiliate/links?limit=50')]);
      setText('#affiliateProviders', overview.summary.providers); setText('#affiliateActiveLinks', overview.summary.activeLinks); setText('#affiliateClicks', Number(overview.summary.clicks30d || 0).toLocaleString('ko-KR')); setText('#affiliateOrders', `주문 ${Number(overview.summary.orders30d || 0).toLocaleString('ko-KR')}`); setText('#affiliateRevenue', money(overview.summary.revenue30dKrw));
      renderAccount(overview.accounts.find(item => item.id === ACCOUNT) || overview.accounts[0]); renderLinks(recent.links); loaded = true; say('제휴마케팅 운영정보를 불러왔습니다.', 'success');
    } catch (error) { say(error.message, 'error'); }
  }

  async function saveAccount(event) {
    event.preventDefault(); const form = event.currentTarget;
    try { await request(`/api/affiliate/accounts/${ACCOUNT}`, { method: 'PUT', body: JSON.stringify({ displayName: form.elements.displayName.value, defaultChannel: form.elements.defaultChannel.value, disclosureText: form.elements.disclosureText.value }) }); loaded = false; await load(true); say('계정 설정을 저장했습니다.', 'success'); } catch (error) { say(error.message, 'error'); }
  }

  async function saveLink(event) {
    event.preventDefault(); const form = event.currentTarget;
    try { await request('/api/affiliate/links', { method: 'POST', body: JSON.stringify({ accountId: ACCOUNT, productName: form.elements.productName.value, affiliateUrl: form.elements.affiliateUrl.value, channel: form.elements.channel.value, campaignName: form.elements.campaignName.value, tenantSlug: form.elements.tenantSlug.value }) }); form.reset(); loaded = false; await load(true); say('제휴링크를 등록했습니다.', 'success'); } catch (error) { say(error.message, 'error'); }
  }

  async function saveMetric(event) {
    event.preventDefault(); const form = event.currentTarget;
    try { await request('/api/affiliate/metrics', { method: 'POST', body: JSON.stringify({ accountId: ACCOUNT, metricDate: form.elements.metricDate.value, clicks: form.elements.clicks.value, orders: form.elements.orders.value, revenueKrw: form.elements.revenueKrw.value }) }); loaded = false; await load(true); say('일별 성과를 저장했습니다.', 'success'); } catch (error) { say(error.message, 'error'); }
  }

  async function linkAction(event) {
    const copyId = event.target.dataset.copy; const archiveId = event.target.dataset.archive;
    if (copyId) { const item = links.find(link => String(link.id) === String(copyId)); if (item) { await navigator.clipboard.writeText(item.affiliateUrl); event.target.textContent = '복사됨'; } return; }
    if (archiveId) { try { await request(`/api/affiliate/links/${archiveId}/archive`, { method: 'POST' }); loaded = false; await load(true); } catch (error) { say(error.message, 'error'); } }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();