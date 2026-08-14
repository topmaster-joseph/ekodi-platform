(() => {
  const API = 'https://api.ekodi.kr';
  const STALE_DAYS = 14;
  const BOOK_LABELS = {
    not_started: '미등록',
    preparing: '등록 준비',
    submitted: '등록 제출',
    reviewing: '심사중',
    action_required: '조치 필요',
    approved: '승인',
    published: '판매중',
    paused: '판매중지',
    rejected: '반려',
  };
  const ACCOUNT_LABELS = {
    unknown: '확인 필요',
    not_registered: '미가입',
    registration_pending: '가입 심사중',
    active: '사용 가능',
    action_required: '조치 필요',
    suspended: '이용 정지',
  };
  let state = null;
  let installed = false;
  let loading = false;

  function token() { return sessionStorage.getItem('ekodi-auth-token') || ''; }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `Books distribution API 요청 실패 (${response.status})`);
    return data;
  }
  function flash(message, error = false) {
    const node = document.querySelector('#booksDistributionFlash');
    if (!node) return;
    node.textContent = message || '';
    node.style.color = error ? '#fda4af' : '';
  }
  function selectTab(name) {
    document.querySelectorAll('[data-books-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.booksTab === name));
    document.querySelectorAll('[data-books-pane]').forEach(pane => { pane.hidden = pane.dataset.booksPane !== name; });
  }
  function install() {
    if (installed) return true;
    const section = document.querySelector('#booksAdminSection');
    const tabs = section?.querySelector('.books-tabs');
    if (!section || !tabs) return false;
    installed = true;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'books-tab';
    tab.dataset.booksTab = 'distribution';
    tab.textContent = 'Distribution';
    const finance = tabs.querySelector('[data-books-tab="finance"]');
    const publications = tabs.querySelector('[data-books-tab="publications"]');
    const anchor = finance || publications;
    if (anchor?.nextSibling) tabs.insertBefore(tab, anchor.nextSibling);
    else tabs.append(tab);

    const pane = document.createElement('div');
    pane.className = 'books-pane books-distribution-pane';
    pane.dataset.booksPane = 'distribution';
    pane.hidden = true;
    pane.innerHTML = `
      <p class="books-distribution-note">외부 플랫폼은 로그인과 심사가 필요하므로 EKODI가 계정 내부 상태를 임의로 추정하지 않습니다. 실제 확인한 상태·판매 URL·최종 확인일을 기록하고, 14일 이상 확인되지 않은 항목은 자동으로 점검 필요로 표시합니다.</p>
      <p class="books-distribution-flash" id="booksDistributionFlash" role="status"></p>
      <div class="books-distribution-metrics" id="booksDistributionMetrics"></div>
      <section class="books-distribution-card">
        <div class="books-distribution-card-head">
          <div><small>CHANNEL ACCOUNTS</small><strong>채널 계정 · 제휴 현황</strong></div>
          <div class="books-distribution-toolbar"><button class="books-compact-button" id="booksDistributionFinance" type="button">Sales & Costs</button><button class="books-compact-button" id="booksDistributionExport" type="button">CSV Export</button><button class="books-compact-button" id="booksDistributionRefresh" type="button">↻ Refresh</button></div>
        </div>
        <div class="books-channel-grid" id="booksDistributionChannels"></div>
      </section>
      <section class="books-distribution-card" id="booksDistributionAttentionCard">
        <div class="books-distribution-card-head"><div><small>ACTION QUEUE</small><strong>확인 · 조치가 필요한 항목</strong></div><small class="books-distribution-rule">미확인 14일 · 조치 필요 · 반려</small></div>
        <div class="books-distribution-attention" id="booksDistributionAttention"></div>
      </section>
      <section class="books-distribution-card">
        <div class="books-distribution-card-head">
          <div><small>PUBLICATION MATRIX</small><strong>도서별 등록 · 배포 현황</strong></div>
          <div class="books-distribution-filter"><select id="booksDistributionBookFilter"><option value="all">All Publications</option></select><select id="booksDistributionStatusFilter"><option value="all">All Status</option></select></div>
        </div>
        <div class="books-distribution-table-wrap"><table class="books-distribution-table"><thead id="booksDistributionHead"></thead><tbody id="booksDistributionBody"></tbody></table></div>
        <form class="books-distribution-editor" id="booksDistributionEditor" hidden>
          <input type="hidden" name="publicationId"><input type="hidden" name="channelCode">
          <label>도서<input name="publicationTitle" readonly></label>
          <label>채널<input name="channelName" readonly></label>
          <label>상태<select name="status"></select></label>
          <label>외부 ID<input name="externalId" maxlength="160" placeholder="ASIN / Google ID / 채널 상품코드"></label>
          <label class="wide">판매 페이지 URL<input name="productUrl" type="url" maxlength="1000" placeholder="https://..."></label>
          <label>제출일<input name="submittedAt" type="date"></label>
          <label>판매 시작일<input name="publishedAt" type="date"></label>
          <label>최종 확인일<div class="books-distribution-date-row"><input name="lastCheckedAt" type="date"><button class="books-compact-button" id="booksDistributionCheckedToday" type="button">Today</button></div></label>
          <label class="full">메모<textarea name="note" maxlength="1200" placeholder="심사 요청, 수정 필요사항, 담당자 메모 등"></textarea></label>
          <div class="books-distribution-editor-actions">
            <div class="books-distribution-editor-links" id="booksDistributionEditorLinks"></div>
            <div><button class="books-compact-button" id="booksDistributionReset" type="button">Reset</button> <button class="books-compact-button" id="booksDistributionClose" type="button">Close</button> <button class="books-compact-button primary" type="submit">Save Status</button></div>
          </div>
        </form>
      </section>`;
    section.append(pane);

    tab.addEventListener('click', () => { selectTab('distribution'); load(); });
    pane.querySelector('#booksDistributionRefresh').addEventListener('click', load);
    pane.querySelector('#booksDistributionExport').addEventListener('click', exportCsv);
    pane.querySelector('#booksDistributionFinance').addEventListener('click', openFinance);
    pane.querySelector('#booksDistributionBookFilter').addEventListener('change', renderMatrix);
    pane.querySelector('#booksDistributionStatusFilter').addEventListener('change', renderMatrix);
    pane.querySelector('#booksDistributionEditor').addEventListener('submit', saveStatus);
    pane.querySelector('#booksDistributionClose').addEventListener('click', closeEditor);
    pane.querySelector('#booksDistributionReset').addEventListener('click', resetStatus);
    pane.querySelector('#booksDistributionCheckedToday').addEventListener('click', markCheckedToday);
    return true;
  }

  function statusFor(publicationId, channelCode) {
    return state?.statuses?.find(item => item.publicationId === publicationId && item.channelCode === channelCode) || null;
  }
  function inferredExternalId(publication, channelCode) {
    if (channelCode === 'amazon-kdp') return publication.identifiers?.amazonAsin || '';
    if (channelCode === 'google-play-books') return publication.identifiers?.googleBooks || '';
    return '';
  }
  function statusOptions(selected = 'not_started') {
    return Object.entries(BOOK_LABELS).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
  }
  function accountOptions(selected = 'unknown') {
    return Object.entries(ACCOUNT_LABELS).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
  }
  function link(label, href) {
    if (!href) return '';
    return `<a class="books-channel-link" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function ageDays(date) {
    if (!date) return Infinity;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return Infinity;
    return Math.floor((Date.now() - parsed.getTime()) / 86400000);
  }
  function isTracked(item) { return Boolean(item && item.status && item.status !== 'not_started'); }
  function isStale(item) { return isTracked(item) && ageDays(item.lastCheckedAt) >= STALE_DAYS; }
  function needsAttention(item) { return Boolean(item && (['action_required', 'rejected'].includes(item.status) || isStale(item))); }
  function attentionReason(item) {
    if (!item) return '';
    if (item.status === 'rejected') return '반려';
    if (item.status === 'action_required') return '조치 필요';
    if (isStale(item)) return item.lastCheckedAt ? `${ageDays(item.lastCheckedAt)}일 미확인` : '확인일 미기록';
    return '';
  }

  async function load() {
    if (loading) return;
    if (!token()) { flash('관리자 인증 후 배포 현황을 불러올 수 있습니다.', true); return; }
    loading = true;
    flash('채널 등록·배포 현황을 불러오는 중입니다.');
    try {
      state = await request('/api/books/admin/distribution');
      render();
      flash(`마지막 갱신 ${new Date().toLocaleTimeString('ko-KR')}`);
    } catch (error) {
      flash(error.message, true);
    } finally {
      loading = false;
    }
  }

  function render() {
    renderMetrics();
    renderChannels();
    renderAttention();
    renderFilters();
    renderMatrix();
  }
  function renderMetrics() {
    const node = document.querySelector('#booksDistributionMetrics');
    if (!node || !state) return;
    const staleCount = state.statuses.filter(isStale).length;
    const values = [
      ['Active Accounts', state.counts.activeAccounts],
      ['Published Placements', state.counts.published],
      ['In Review', state.counts.reviewing],
      ['Action Required', state.counts.actionRequired],
      ['Stale Checks', staleCount],
    ];
    node.innerHTML = values.map(([label, value]) => `<article class="books-distribution-metric"><small>${esc(label)}</small><strong>${Number(value || 0).toLocaleString('ko-KR')}</strong></article>`).join('');
  }
  function renderChannels() {
    const node = document.querySelector('#booksDistributionChannels');
    if (!node || !state) return;
    node.innerHTML = state.channels.map(channel => {
      const channelStatuses = state.statuses.filter(item => item.channelCode === channel.code);
      const published = channelStatuses.filter(item => item.status === 'published').length;
      const tracked = channelStatuses.filter(isTracked).length;
      const attention = channelStatuses.filter(needsAttention).length;
      return `
      <article class="books-channel-card" data-channel="${esc(channel.code)}">
        <div class="books-channel-head"><div><strong>${esc(channel.name)}</strong><small>${esc(channel.scope)} · ${published} 판매중 / ${tracked} 추적${attention ? ` · ${attention} 확인` : ''}</small></div><select class="books-channel-status" data-account-status="${esc(channel.code)}">${accountOptions(channel.accountStatus)}</select></div>
        <div class="books-channel-links">${link('관리센터', channel.portalUrl)}${link('가입/제휴', channel.onboardingUrl)}${link('도움말', channel.helpUrl)}</div>
      </article>`;
    }).join('');
    node.querySelectorAll('[data-account-status]').forEach(select => select.addEventListener('change', updateAccountStatus));
  }
  async function updateAccountStatus(event) {
    const select = event.currentTarget;
    const code = select.dataset.accountStatus;
    select.disabled = true;
    try {
      await request(`/api/books/admin/distribution/channels/${encodeURIComponent(code)}`, {
        method: 'PUT', body: JSON.stringify({ accountStatus: select.value }),
      });
      const channel = state.channels.find(item => item.code === code);
      if (channel) channel.accountStatus = select.value;
      state.counts.activeAccounts = state.channels.filter(item => item.accountStatus === 'active').length;
      renderMetrics();
      flash(`${channel?.name || code} 계정 상태를 저장했습니다.`);
    } catch (error) {
      flash(error.message, true);
      await load();
    } finally {
      select.disabled = false;
    }
  }
  function renderAttention() {
    const node = document.querySelector('#booksDistributionAttention');
    const card = document.querySelector('#booksDistributionAttentionCard');
    if (!node || !card || !state) return;
    const items = state.statuses.filter(needsAttention).sort((a, b) => {
      const priority = value => value.status === 'rejected' ? 0 : value.status === 'action_required' ? 1 : 2;
      return priority(a) - priority(b) || ageDays(b.lastCheckedAt) - ageDays(a.lastCheckedAt);
    });
    if (!items.length) {
      node.innerHTML = '<p class="books-dist-empty">현재 즉시 확인할 배포 항목이 없습니다.</p>';
      return;
    }
    node.innerHTML = items.slice(0, 16).map(item => {
      const book = state.publications.find(value => value.id === item.publicationId);
      const channel = state.channels.find(value => value.code === item.channelCode);
      return `<button type="button" class="books-attention-item" data-attention="${esc(item.publicationId)}|${esc(item.channelCode)}"><span><strong>${esc(book?.title || item.publicationId)}</strong><small>${esc(channel?.name || item.channelCode)} · ${esc(BOOK_LABELS[item.status] || item.status)}</small></span><em>${esc(attentionReason(item))}</em></button>`;
    }).join('');
    node.querySelectorAll('[data-attention]').forEach(button => button.addEventListener('click', () => {
      const [publicationId, channelCode] = button.dataset.attention.split('|');
      openEditor(publicationId, channelCode);
    }));
  }
  function renderFilters() {
    const bookFilter = document.querySelector('#booksDistributionBookFilter');
    const statusFilter = document.querySelector('#booksDistributionStatusFilter');
    if (!bookFilter || !statusFilter || !state) return;
    const currentBook = bookFilter.value;
    bookFilter.innerHTML = '<option value="all">All Publications</option>' + state.publications.map(book => `<option value="${esc(book.id)}">${esc(book.title)}</option>`).join('');
    if ([...bookFilter.options].some(option => option.value === currentBook)) bookFilter.value = currentBook;
    const currentStatus = statusFilter.value;
    statusFilter.innerHTML = '<option value="all">All Status</option><option value="attention">Needs Attention</option><option value="stale">Stale 14d+</option>' + Object.entries(BOOK_LABELS).map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('');
    if ([...statusFilter.options].some(option => option.value === currentStatus)) statusFilter.value = currentStatus;
  }
  function rowMatchesStatus(book, filter) {
    if (filter === 'all') return true;
    return state.channels.some(channel => {
      const item = statusFor(book.id, channel.code);
      if (filter === 'attention') return needsAttention(item);
      if (filter === 'stale') return isStale(item);
      return (item?.status || 'not_started') === filter;
    });
  }
  function renderMatrix() {
    const head = document.querySelector('#booksDistributionHead');
    const body = document.querySelector('#booksDistributionBody');
    if (!head || !body || !state) return;
    const bookFilter = document.querySelector('#booksDistributionBookFilter')?.value || 'all';
    const statusFilter = document.querySelector('#booksDistributionStatusFilter')?.value || 'all';
    head.innerHTML = `<tr><th>Publication</th>${state.channels.map(channel => `<th>${esc(channel.name)}</th>`).join('')}</tr>`;
    const books = state.publications.filter(book => bookFilter === 'all' || book.id === bookFilter).filter(book => rowMatchesStatus(book, statusFilter));
    if (!books.length) {
      body.innerHTML = `<tr><td class="books-dist-empty" colspan="${state.channels.length + 1}">조건에 맞는 출판물이 없습니다.</td></tr>`;
      return;
    }
    body.innerHTML = books.map(book => `<tr><td><div class="books-distribution-book"><strong>${esc(book.title)}</strong><small>${esc(book.author || '저자 미정')} · ${esc(book.identifiers?.isbnEbook || book.catalogNo || book.id)}</small></div></td>${state.channels.map(channel => {
      const item = statusFor(book.id, channel.code);
      const status = item?.status || 'not_started';
      const external = item?.externalId || inferredExternalId(book, channel.code);
      const stale = isStale(item);
      return `<td><div class="books-dist-cell"><button type="button" class="books-dist-chip" data-status="${esc(status)}" data-edit-dist="${esc(book.id)}|${esc(channel.code)}">${esc(BOOK_LABELS[status] || status)}</button>${stale ? `<small class="books-dist-stale">${esc(attentionReason(item))}</small>` : ''}${external ? `<small class="books-dist-external" title="${esc(external)}">${esc(external)}</small>` : ''}${item?.productUrl ? `<a class="books-channel-link" href="${esc(item.productUrl)}" target="_blank" rel="noopener">판매 ↗</a>` : ''}</div></td>`;
    }).join('')}</tr>`).join('');
    body.querySelectorAll('[data-edit-dist]').forEach(button => button.addEventListener('click', () => {
      const [publicationId, channelCode] = button.dataset.editDist.split('|');
      openEditor(publicationId, channelCode);
    }));
  }

  function openEditor(publicationId, channelCode) {
    const form = document.querySelector('#booksDistributionEditor');
    const book = state.publications.find(item => item.id === publicationId);
    const channel = state.channels.find(item => item.code === channelCode);
    if (!form || !book || !channel) return;
    const item = statusFor(publicationId, channelCode);
    form.hidden = false;
    form.elements.publicationId.value = publicationId;
    form.elements.channelCode.value = channelCode;
    form.elements.publicationTitle.value = book.title;
    form.elements.channelName.value = channel.name;
    form.elements.status.innerHTML = statusOptions(item?.status || 'not_started');
    form.elements.externalId.value = item?.externalId || inferredExternalId(book, channelCode);
    form.elements.productUrl.value = item?.productUrl || '';
    form.elements.submittedAt.value = item?.submittedAt || '';
    form.elements.publishedAt.value = item?.publishedAt || '';
    form.elements.lastCheckedAt.value = item?.lastCheckedAt || '';
    form.elements.note.value = item?.note || '';
    document.querySelector('#booksDistributionEditorLinks').innerHTML = `${link('관리센터', channel.portalUrl)}${link('가입/제휴', channel.onboardingUrl)}${link('도움말', channel.helpUrl)}${link('판매페이지', item?.productUrl)}`;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function closeEditor() {
    const form = document.querySelector('#booksDistributionEditor');
    if (form) form.hidden = true;
  }
  function markCheckedToday() {
    const form = document.querySelector('#booksDistributionEditor');
    if (form) form.elements.lastCheckedAt.value = today();
  }
  function openFinance() {
    const tab = document.querySelector('[data-books-tab="finance"]');
    if (tab) tab.click();
    else flash('Sales & Costs 탭을 찾을 수 없습니다.', true);
  }
  function csvCell(value) {
    const text = String(value ?? '').replace(/"/g, '""');
    return `"${text}"`;
  }
  function exportCsv() {
    if (!state) return;
    const header = ['Publication', 'Author', 'Channel', 'Account Status', 'Distribution Status', 'External ID', 'Product URL', 'Submitted', 'Published', 'Last Checked', 'Stale 14d+', 'Note'];
    const rows = [];
    state.publications.forEach(book => state.channels.forEach(channel => {
      const item = statusFor(book.id, channel.code);
      rows.push([
        book.title,
        book.author || '',
        channel.name,
        ACCOUNT_LABELS[channel.accountStatus] || channel.accountStatus,
        BOOK_LABELS[item?.status || 'not_started'] || item?.status || 'not_started',
        item?.externalId || inferredExternalId(book, channel.code),
        item?.productUrl || '',
        item?.submittedAt || '',
        item?.publishedAt || '',
        item?.lastCheckedAt || '',
        isStale(item) ? 'YES' : '',
        item?.note || '',
      ]);
    }));
    const csv = '\ufeff' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ekodi-books-distribution-${today()}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    flash('채널 등록·배포 현황 CSV를 내보냈습니다.');
  }
  async function saveStatus(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const publicationId = form.elements.publicationId.value;
    const channelCode = form.elements.channelCode.value;
    const payload = {
      status: form.elements.status.value,
      externalId: form.elements.externalId.value,
      productUrl: form.elements.productUrl.value,
      submittedAt: form.elements.submittedAt.value,
      publishedAt: form.elements.publishedAt.value,
      lastCheckedAt: form.elements.lastCheckedAt.value,
      note: form.elements.note.value,
    };
    try {
      await request(`/api/books/admin/distribution/status/${encodeURIComponent(publicationId)}/${encodeURIComponent(channelCode)}`, { method: 'PUT', body: JSON.stringify(payload) });
      flash('등록·배포 상태를 저장했습니다.');
      closeEditor();
      await load();
    } catch (error) {
      flash(error.message, true);
    }
  }
  async function resetStatus() {
    const form = document.querySelector('#booksDistributionEditor');
    const publicationId = form?.elements.publicationId.value;
    const channelCode = form?.elements.channelCode.value;
    if (!publicationId || !channelCode) return;
    if (!confirm('이 채널의 배포 기록을 미등록 상태로 초기화할까요?')) return;
    try {
      await request(`/api/books/admin/distribution/status/${encodeURIComponent(publicationId)}/${encodeURIComponent(channelCode)}`, { method: 'DELETE' });
      flash('배포 기록을 초기화했습니다.');
      closeEditor();
      await load();
    } catch (error) {
      flash(error.message, true);
    }
  }

  const observer = new MutationObserver(() => {
    if (install()) observer.disconnect();
  });
  if (!install()) observer.observe(document.documentElement, { childList: true, subtree: true });
})();