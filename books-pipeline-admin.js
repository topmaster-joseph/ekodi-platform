(() => {
  const API = 'https://api.ekodi.kr';
  const CHECKLIST = [
    ['metadata', '메타데이터'], ['files', '파일'], ['identifiers', '식별자'],
    ['pricing', '가격'], ['rights', '권리/지역'], ['submitted', '제출'],
  ];
  const STATUS_LABELS = {
    not_started: '미등록', preparing: '준비', submitted: '제출', reviewing: '심사중',
    action_required: '조치 필요', approved: '승인', published: '판매중', paused: '중지', rejected: '반려',
  };
  let state = null;
  let installed = false;
  let loading = false;

  function token() { return sessionStorage.getItem('ekodi-auth-token') || ''; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
  function money(value) { return `${Number(value || 0).toLocaleString('ko-KR')}원`; }
  function localDate() { const d = new Date(); const o = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - o).toISOString().slice(0, 10); }
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `Books pipeline API 요청 실패 (${response.status})`);
    return data;
  }
  function flash(message, error = false) {
    const node = document.querySelector('#booksPipelineFlash');
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
    tab.dataset.booksTab = 'pipeline';
    tab.textContent = 'Pipeline';
    const overview = tabs.querySelector('[data-books-tab="overview"]');
    if (overview?.nextSibling) tabs.insertBefore(tab, overview.nextSibling); else tabs.prepend(tab);

    const pane = document.createElement('div');
    pane.className = 'books-pane books-pipeline-pane';
    pane.dataset.booksPane = 'pipeline';
    pane.hidden = true;
    pane.innerHTML = `
      <div class="books-pipeline-head">
        <div><small>BOOK LIFECYCLE CONTROL</small><strong>출판 · 배포 · 매출 통합 파이프라인</strong><p>한 권의 원고가 제작, 채널 배포, 판매, 정산으로 이어지는 전체 흐름을 한 화면에서 관리합니다.</p></div>
        <div class="books-pipeline-actions"><button class="books-compact-button" id="booksPipelineExport" type="button">CSV Export</button><button class="books-compact-button" id="booksPipelineRefresh" type="button">↻ Refresh</button></div>
      </div>
      <p class="books-flash" id="booksPipelineFlash" role="status"></p>
      <div class="books-pipeline-metrics" id="booksPipelineMetrics"></div>
      <section class="books-pipeline-card">
        <div class="books-pipeline-toolbar">
          <label>Stage<select id="booksPipelineStage"><option value="all">All Stages</option></select></label>
          <label>Action<select id="booksPipelineAction"><option value="all">All Actions</option><option value="attention">Needs Attention</option><option value="distribution_attention">Distribution Issue</option><option value="advance_stage">Production</option><option value="start_distribution">Start Distribution</option><option value="settlement">Settlement</option><option value="verify_distribution">Verify Status</option><option value="healthy">Healthy</option></select></label>
          <label>Search<input id="booksPipelineSearch" type="search" placeholder="도서명 · 저자 · ISBN"></label>
        </div>
        <div class="books-pipeline-list" id="booksPipelineList"></div>
      </section>
      <form class="books-pipeline-ops" id="booksPipelineOps" hidden>
        <input type="hidden" name="publicationId"><input type="hidden" name="channelCode">
        <div class="books-pipeline-ops-head"><div><small>CHANNEL OPS</small><strong id="booksPipelineOpsTitle">Channel Operations</strong></div><button class="books-compact-button" id="booksPipelineOpsClose" type="button">Close</button></div>
        <div class="books-pipeline-ops-grid">
          <label>원본 채널 상태<input name="sourceStatus" maxlength="200" placeholder="채널 화면의 원문 상태"></label>
          <label>담당자<input name="assignee" maxlength="120" placeholder="담당자명 / 팀"></label>
          <label>처리기한<input name="dueAt" type="date"></label>
          <label>동기화 방식<select name="syncMode"><option value="manual">Manual</option><option value="csv">CSV</option><option value="api">API</option></select></label>
          <label>동기화 확인일<input name="syncedAt" type="date"></label>
          <div class="books-pipeline-checklist"><span>등록 체크리스트</span>${CHECKLIST.map(([key,label]) => `<label><input type="checkbox" name="check_${key}">${label}</label>`).join('')}</div>
        </div>
        <div class="books-pipeline-ops-actions"><button class="books-compact-button" id="booksPipelineCheckedToday" type="button">확인일 Today</button><button class="books-compact-button primary" type="submit">Save Operations</button></div>
      </form>`;
    section.append(pane);

    tab.addEventListener('click', () => { selectTab('pipeline'); load(); });
    pane.querySelector('#booksPipelineRefresh').addEventListener('click', load);
    pane.querySelector('#booksPipelineExport').addEventListener('click', exportCsv);
    pane.querySelector('#booksPipelineStage').addEventListener('change', renderList);
    pane.querySelector('#booksPipelineAction').addEventListener('change', renderList);
    pane.querySelector('#booksPipelineSearch').addEventListener('input', renderList);
    pane.querySelector('#booksPipelineOps').addEventListener('submit', saveOps);
    pane.querySelector('#booksPipelineOpsClose').addEventListener('click', closeOps);
    pane.querySelector('#booksPipelineCheckedToday').addEventListener('click', () => {
      const form = document.querySelector('#booksPipelineOps');
      if (form) form.elements.syncedAt.value = localDate();
    });
    return true;
  }

  async function load() {
    if (loading || !token()) return;
    loading = true;
    flash('통합 출판 파이프라인을 불러오는 중입니다.');
    try {
      state = await request('/api/books/admin/pipeline');
      fillStageFilter();
      renderMetrics();
      renderList();
      flash(`마지막 갱신 ${new Date().toLocaleTimeString('ko-KR')}`);
    } catch (error) {
      flash(error.message, true);
    } finally {
      loading = false;
    }
  }

  function fillStageFilter() {
    const select = document.querySelector('#booksPipelineStage');
    if (!select || !state) return;
    const current = select.value || 'all';
    select.innerHTML = '<option value="all">All Stages</option>' + state.stages.map(stage => `<option value="${stage}">${stage}</option>`).join('');
    select.value = [...select.options].some(option => option.value === current) ? current : 'all';
  }

  function renderMetrics() {
    const node = document.querySelector('#booksPipelineMetrics');
    if (!node || !state) return;
    const t = state.totals;
    const values = [
      ['Publications', t.publications], ['Live Placements', t.publishedPlacements], ['Needs Attention', t.attention],
      ['Net Revenue', money(t.finance.netRevenue)], ['Profit', money(t.finance.profit)], ['Unsettled', money(t.finance.unsettled)],
    ];
    node.innerHTML = values.map(([label,value]) => `<article><small>${esc(label)}</small><strong>${typeof value === 'number' ? value.toLocaleString('ko-KR') : esc(value)}</strong></article>`).join('');
  }

  function filteredBooks() {
    if (!state) return [];
    const stage = document.querySelector('#booksPipelineStage')?.value || 'all';
    const action = document.querySelector('#booksPipelineAction')?.value || 'all';
    const q = (document.querySelector('#booksPipelineSearch')?.value || '').trim().toLowerCase();
    return state.publications.filter(book => stage === 'all' || book.stage === stage).filter(book => {
      if (action === 'all') return true;
      if (action === 'attention') return book.attentionCount > 0;
      return book.nextAction?.code === action;
    }).filter(book => !q || [book.title, book.author, book.catalogNo, book.identifiers?.isbnEbook, book.identifiers?.amazonAsin].some(value => String(value || '').toLowerCase().includes(q)));
  }

  function distributionCell(book, item) {
    const channel = state.channels.find(c => c.code === item.channelCode);
    const classes = ['books-pipeline-channel'];
    if (item.needsAttention) classes.push('attention');
    if (item.status === 'published') classes.push('live');
    const flags = [item.overdue ? '기한초과' : '', item.stale ? '14d+' : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="${classes.join(' ')}" data-pipeline-ops="${esc(book.id)}|${esc(item.channelCode)}" title="${esc(item.sourceStatus || item.note || '')}"><span>${esc(channel?.name || item.channelCode)}</span><strong>${esc(STATUS_LABELS[item.status] || item.status)}</strong>${flags ? `<small>${esc(flags)}</small>` : ''}</button>`;
  }

  function renderList() {
    const node = document.querySelector('#booksPipelineList');
    if (!node || !state) return;
    const books = filteredBooks();
    if (!books.length) { node.innerHTML = '<p class="books-empty">조건에 맞는 출판물이 없습니다.</p>'; return; }
    node.innerHTML = books.map(book => `
      <article class="books-pipeline-book ${book.attentionCount ? 'has-attention' : ''}">
        <div class="books-pipeline-book-main">
          <div class="books-pipeline-title"><div><small>${esc(book.catalogNo || book.id)}</small><strong>${esc(book.title)}</strong><span>${esc(book.author || '저자 미정')}</span></div><span class="books-stage">${esc(book.stage)}</span></div>
          <div class="books-pipeline-progress"><i style="width:${Number(book.stageProgress || 0)}%"></i></div>
          <div class="books-pipeline-next"><span>Next</span><strong>${esc(book.nextAction?.label || '')}</strong>${book.overdueCount ? `<em>${book.overdueCount} overdue</em>` : ''}</div>
          <div class="books-pipeline-identifiers"><span>ISBN ${esc(book.identifiers?.isbnEbook || '미등록')}</span><span>ASIN ${esc(book.identifiers?.amazonAsin || '미등록')}</span><span>Google ${esc(book.identifiers?.googleBooks || '미등록')}</span></div>
        </div>
        <div class="books-pipeline-distribution">${book.distribution.map(item => distributionCell(book, item)).join('')}</div>
        <div class="books-pipeline-finance"><div><small>Net</small><strong>${money(book.finance.netRevenue)}</strong></div><div><small>Costs</small><strong>${money(book.finance.costs)}</strong></div><div><small>Profit</small><strong>${money(book.finance.profit)}</strong></div><div><small>Units</small><strong>${Number(book.finance.units || 0).toLocaleString('ko-KR')}</strong></div><div><small>Unsettled</small><strong>${money(book.finance.unsettled)}</strong></div></div>
        <div class="books-pipeline-row-actions"><button class="books-compact-button" type="button" data-open-publication="${esc(book.id)}">Publication</button><button class="books-compact-button" type="button" data-open-distribution="${esc(book.id)}">Distribution</button><button class="books-compact-button" type="button" data-open-finance="${esc(book.id)}">Sales & Costs</button></div>
      </article>`).join('');

    node.querySelectorAll('[data-pipeline-ops]').forEach(button => button.addEventListener('click', () => {
      const [publicationId, channelCode] = button.dataset.pipelineOps.split('|'); openOps(publicationId, channelCode);
    }));
    node.querySelectorAll('[data-open-publication]').forEach(button => button.addEventListener('click', () => openPublication(button.dataset.openPublication)));
    node.querySelectorAll('[data-open-distribution]').forEach(button => button.addEventListener('click', () => openDistribution(button.dataset.openDistribution)));
    node.querySelectorAll('[data-open-finance]').forEach(button => button.addEventListener('click', () => openFinance(button.dataset.openFinance)));
  }

  function openPublication(id) {
    window.dispatchEvent(new CustomEvent('ekodi:books-open-publication', { detail: { id } }));
  }
  function openDistribution(id) {
    const tab = document.querySelector('[data-books-tab="distribution"]');
    tab?.click();
    setTimeout(() => {
      const select = document.querySelector('#booksDistributionBookFilter');
      if (select && [...select.options].some(option => option.value === id)) { select.value = id; select.dispatchEvent(new Event('change')); }
    }, 450);
  }
  function openFinance(id) {
    const tab = document.querySelector('[data-books-tab="finance"]');
    tab?.click();
    setTimeout(() => {
      const select = document.querySelector('#booksFinancePublication');
      if (select && [...select.options].some(option => option.value === id)) {
        select.value = id;
        document.querySelector('#booksFinanceApply')?.click();
      }
    }, 450);
  }

  function statusItem(publicationId, channelCode) {
    return state?.publications.find(book => book.id === publicationId)?.distribution.find(item => item.channelCode === channelCode) || null;
  }
  function openOps(publicationId, channelCode) {
    const book = state.publications.find(item => item.id === publicationId);
    const channel = state.channels.find(item => item.code === channelCode);
    const item = statusItem(publicationId, channelCode);
    const form = document.querySelector('#booksPipelineOps');
    if (!book || !channel || !item || !form) return;
    form.hidden = false;
    form.elements.publicationId.value = publicationId;
    form.elements.channelCode.value = channelCode;
    form.elements.sourceStatus.value = item.sourceStatus || '';
    form.elements.assignee.value = item.assignee || '';
    form.elements.dueAt.value = item.dueAt || '';
    form.elements.syncMode.value = item.syncMode || 'manual';
    form.elements.syncedAt.value = item.syncedAt || '';
    CHECKLIST.forEach(([key]) => { form.elements[`check_${key}`].checked = Boolean(item.checklist?.[key]); });
    document.querySelector('#booksPipelineOpsTitle').textContent = `${book.title} · ${channel.name}`;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function closeOps() { const form = document.querySelector('#booksPipelineOps'); if (form) form.hidden = true; }
  async function saveOps(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const publicationId = form.elements.publicationId.value;
    const channelCode = form.elements.channelCode.value;
    const checklist = Object.fromEntries(CHECKLIST.map(([key]) => [key, form.elements[`check_${key}`].checked]));
    try {
      await request(`/api/books/admin/distribution/status/${encodeURIComponent(publicationId)}/${encodeURIComponent(channelCode)}`, {
        method: 'PUT',
        body: JSON.stringify({ sourceStatus: form.elements.sourceStatus.value, assignee: form.elements.assignee.value, dueAt: form.elements.dueAt.value, syncMode: form.elements.syncMode.value, syncedAt: form.elements.syncedAt.value, checklist }),
      });
      closeOps();
      await load();
      flash('채널 운영 메타데이터를 저장했습니다.');
    } catch (error) { flash(error.message, true); }
  }

  function csv(value) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text; }
  function exportCsv() {
    if (!state) return;
    const rows = [['publication_id','title','author','stage','next_action','published_channels','attention','net_revenue_krw','costs_krw','profit_krw','unsettled_krw']];
    state.publications.forEach(book => rows.push([book.id,book.title,book.author,book.stage,book.nextAction?.label,book.publishedChannels,book.attentionCount,book.finance.netRevenue,book.finance.costs,book.finance.profit,book.finance.unsettled]));
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(csv).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `ekodi-books-pipeline-${localDate()}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const observer = new MutationObserver(() => { if (install()) observer.disconnect(); });
  if (!install()) observer.observe(document.documentElement, { childList: true, subtree: true });
})();
