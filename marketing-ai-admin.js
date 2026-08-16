(() => {
  const API = 'https://api.ekodi.kr';
  const LIVE = 'https://marketing.ekodi.kr/';
  const REVIEW = 'https://auth.ekodi.kr/?site=marketing&review=1&return_to=https%3A%2F%2Fmarketing.ekodi.kr%2F';
  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const TABS = [
    ['overview','Overview'],['customers','Customers'],['workspaces','Workspaces'],['campaigns','Campaigns'],['crm','CRM'],
    ['channels','Channels'],['automation','Automation'],['approvals','Approvals'],['billing','Billing'],['reports','Reports'],
  ];
  const WORKSPACE_LABELS = {
    'jadam.ai.ekodi.kr':'자담치킨 목포대점',
    'pizzamaru.ai.ekodi.kr':'피자마루 목포대점',
    'yogurt.ai.ekodi.kr':'요거트퍼플 목포대점',
    'cgma.ai.ekodi.kr':'청계면상인회',
  };
  const CONTRACT_COPY = {
    campaigns:['캠페인 운영','캠페인 원장을 연결하면 생성·검수·예약·게시·완료 상태와 채널별 성과를 이곳에서 관리합니다.'],
    crm:['CRM · 고객관계','CRM 집계 계약을 연결하면 신규·재방문·휴면 고객, 세그먼트와 후속 제안을 개인정보 원문 없이 관리합니다.'],
    channels:['채널 연결','네이버·카카오·YouTube·Instagram·배달 채널의 연결상태와 마지막 동기화 시각을 이곳에서 확인합니다.'],
    automation:['자동화 운영','예약 작업과 AI 에이전트 실행, 성공·실패·재시도 이력을 실행권한과 분리해 관찰합니다.'],
    approvals:['승인 대기','고객 발송·광고예산·게시 같은 사람 승인 필요 행동을 한곳에서 검토하도록 연결할 자리입니다.'],
  };

  let state = { tab:'overview', data:null, loading:false };

  const api = async path => {
    const headers = new Headers();
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    const response = await fetch(`${API}${path}`, { headers, cache:'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `MarketingAI 관리자 API 요청 실패 (${response.status})`);
    return data;
  };
  const won = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const num = value => Number(value || 0).toLocaleString('ko-KR');
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const dateText = value => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  };
  const shortKey = value => {
    const text = String(value || '');
    return text.length > 22 ? `${text.slice(0, 8)}…${text.slice(-7)}` : text || '—';
  };
  const workspaceLabel = workspace => WORKSPACE_LABELS[String(workspace?.canonicalDomain || '').toLowerCase()]
    || String(workspace?.slug || workspace?.tenantSlug || workspace?.canonicalDomain || 'Workspace');
  const workspaceForSubject = (data, subject) => (data?.workspaces || []).find(item => item.storeId === subject);
  const subjectLabel = (data, row) => {
    if (String(row?.subject_type || '').toLowerCase() === 'store') {
      const workspace = workspaceForSubject(data, String(row.subject_key || ''));
      if (workspace) return workspaceLabel(workspace);
      return `점포 · ${shortKey(row.subject_key)}`;
    }
    if (String(row?.subject_type || '').toLowerCase() === 'tenant') return `조직 · ${row.subject_key || '—'}`;
    return `개인 계정 · ${shortKey(row?.subject_key)}`;
  };
  const planLabel = row => `${String(row?.plan_id || 'free').toUpperCase()} · ${String(row?.status || 'free').toUpperCase()}`;

  function fallbackSummary(subscriptions, charges) {
    const marketing = subscriptions.filter(row => String(row.site || '').toLowerCase() === 'marketing');
    const activePaid = marketing.filter(row => String(row.status || '').toLowerCase() === 'active' && Number(row.monthly_fee || 0) > 0);
    const cutoff = Date.now() - 30 * 86400000;
    const recent = charges.filter(row => String(row.site || '').toLowerCase() === 'marketing' && String(row.status || '').toLowerCase() === 'done')
      .filter(row => Date.parse(row.completed_at || row.created_at || '') >= cutoff);
    return {
      generatedAt:new Date().toISOString(),
      summary:{
        customers:new Set(marketing.map(row => `${row.subject_type}:${row.subject_key}`)).size,
        subscriptions:marketing.length,
        paidSubscriptions:activePaid.length,
        mrr:activePaid.reduce((sum, row) => sum + Number(row.monthly_fee || 0), 0),
        workspaces:0, activeWorkspaces:0, attention:0,
        charges30d:recent.length,
        revenue30d:recent.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      },
      subscriptions:marketing,
      charges:charges.filter(row => String(row.site || '').toLowerCase() === 'marketing'),
      workspaces:[], attention:[],
      dataContracts:{subscriptions:'connected',billing:'connected',workspaces:'temporarily_unavailable',campaigns:'not_connected',crm:'not_connected',channels:'not_connected',automation:'not_connected',approvals:'not_connected'},
      safety:{readOnly:true,customerPiiIncluded:false,externalExecution:false},
      degraded:true,
    };
  }

  async function loadData() {
    try {
      return await api('/api/marketing/admin/overview');
    } catch (overviewError) {
      try {
        const [subscriptions, charges] = await Promise.all([
          api('/api/membership/admin/subscriptions'),
          api('/api/membership/admin/charges'),
        ]);
        const data = fallbackSummary(subscriptions.subscriptions || [], charges.charges || []);
        data.degradedReason = overviewError.message;
        return data;
      } catch {
        throw overviewError;
      }
    }
  }

  function install() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return false;

    let button = nav.querySelector('[data-section="marketing-ai"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav';
      button.dataset.section = 'marketing-ai';
      button.append(document.createTextNode('AI '));
      const span = document.createElement('span');
      span.textContent = 'MarketingAI';
      button.append(span);
      const services = nav.querySelector('[data-section="services"]');
      if (services) services.insertAdjacentElement('afterend', button); else nav.prepend(button);
    }

    let panel = document.querySelector('#marketingAiAdminPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'marketingAiAdminPanel';
      panel.className = 'section marketing-ai-admin-panel hidden-panel';
      panel.dataset.panel = 'marketing-ai';
      panel.innerHTML = `
        <div class="marketing-ai-admin-toolbar">
          <div class="marketing-ai-admin-toolbar-copy">
            <div class="marketing-ai-admin-eyebrow"><span>MARKETING AI</span><span class="marketing-ai-admin-mode">OPERATIONS CONSOLE</span></div>
            <h2>Marketing AI 운영 관제센터</h2>
            <p>고객·Workspace·구독·결제를 한눈에 보고, 연결될 캠페인·CRM·자동화 운영까지 같은 흐름에서 관리합니다.</p>
          </div>
          <div class="marketing-ai-admin-actions">
            <button type="button" class="secondary" data-marketing-refresh>↻ 운영 데이터</button>
            <a class="secondary" href="${REVIEW}" target="_blank" rel="noopener">Pro 신청 검수 ↗</a>
            <a class="primary marketing-ai-user-link" href="${LIVE}" target="_blank" rel="noopener">사용자 페이지 ↗</a>
          </div>
        </div>
        <div class="marketing-ai-admin-status" aria-label="MarketingAI 핵심 운영 지표">
          <article><small>전체 고객</small><strong id="marketingAiCustomers">—</strong><span>Marketing AI 구독 주체</span></article>
          <article><small>유료 구독</small><strong id="marketingAiPaid">—</strong><span>활성 월 구독</span></article>
          <article><small>월 반복매출</small><strong id="marketingAiMrr">—</strong><span>활성 월 구독 합계</span></article>
          <article><small>활성 Workspace</small><strong id="marketingAiWorkspaces">—</strong><span>전용 AI 운영면</span></article>
          <article><small>주의 필요</small><strong id="marketingAiAttention">—</strong><span>결제·Workspace 신호</span></article>
          <article><small>최근 30일 결제</small><strong id="marketingAiRevenue30d">—</strong><span id="marketingAiChargeCount">확인 중</span></article>
        </div>
        <nav class="marketing-ai-console-tabs" aria-label="MarketingAI 운영 메뉴">
          ${TABS.map(([key,label], index) => `<button type="button" data-marketing-tab="${key}" class="${index === 0 ? 'active' : ''}">${label}</button>`).join('')}
        </nav>
        <div class="marketing-ai-console-meta">
          <p id="marketingAiAdminMessage">관리 데이터를 불러오는 중입니다.</p>
          <span class="marketing-ai-readonly">READ-ONLY OPS · 외부 자동실행 없음</span>
        </div>
        <div class="marketing-ai-console-view" id="marketingAiConsoleView" aria-live="polite"></div>`;
      content.prepend(panel);
    }

    const message = panel.querySelector('#marketingAiAdminMessage');
    const view = panel.querySelector('#marketingAiConsoleView');
    const tabs = [...panel.querySelectorAll('[data-marketing-tab]')];

    function setMessage(text, error = false) {
      if (!message) return;
      message.textContent = text || '';
      message.classList.toggle('error', Boolean(error));
    }
    function setText(selector, value) {
      const target = panel.querySelector(selector);
      if (target) target.textContent = value;
    }
    function setKpis(data) {
      const summary = data?.summary || {};
      setText('#marketingAiCustomers', num(summary.customers));
      setText('#marketingAiPaid', num(summary.paidSubscriptions));
      setText('#marketingAiMrr', won(summary.mrr));
      setText('#marketingAiWorkspaces', `${num(summary.activeWorkspaces)} / ${num(summary.workspaces)}`);
      setText('#marketingAiAttention', num(summary.attention));
      setText('#marketingAiRevenue30d', won(summary.revenue30d));
      setText('#marketingAiChargeCount', `완료 ${num(summary.charges30d)}건`);
    }

    function attentionHtml(data) {
      const rows = data?.attention || [];
      if (!rows.length) return '<div class="marketing-ai-empty good"><strong>현재 즉시 확인할 신호가 없습니다.</strong><span>결제·구독·Workspace 상태 기준</span></div>';
      return rows.slice(0, 8).map(row => `<article class="marketing-ai-attention-item ${esc(row.severity || 'medium')}">
        <div><span>${esc(row.kind || 'OPS')}</span><strong>${esc(row.title)}</strong><p>${esc(row.detail)}</p></div>
        <time>${esc(dateText(row.updatedAt))}</time>
      </article>`).join('');
    }

    function workspaceHtml(data, limit = 8) {
      const rows = (data?.workspaces || []).slice(0, limit);
      if (!rows.length) return '<div class="marketing-ai-empty"><strong>저장된 전용 Workspace가 없습니다.</strong><span>Plus 이상 점포 Workspace가 생성되면 이곳에 나타납니다.</span></div>';
      return rows.map(row => `<article class="marketing-ai-workspace-row">
        <div class="marketing-ai-workspace-state ${esc(row.status)}"></div>
        <div class="marketing-ai-workspace-copy"><strong>${esc(workspaceLabel(row))}</strong><span>${esc(row.canonicalDomain || row.slug || row.storeId)}</span></div>
        <span class="marketing-ai-plan-chip">${esc(String(row.planId || 'free').toUpperCase())}</span>
        <span class="marketing-ai-state-chip ${esc(row.status)}">${esc(String(row.status || 'unknown').toUpperCase())}</span>
        ${row.canonicalUrl ? `<a href="${esc(row.canonicalUrl)}" target="_blank" rel="noopener" aria-label="${esc(workspaceLabel(row))} 열기">↗</a>` : '<span>—</span>'}
      </article>`).join('');
    }

    function recentActivity(data) {
      const activity = [];
      for (const row of data?.subscriptions || []) activity.push({ at:row.updated_at, type:'SUBSCRIPTION', title:subjectLabel(data,row), detail:planLabel(row) });
      for (const row of data?.workspaces || []) activity.push({ at:row.updatedAt, type:'WORKSPACE', title:workspaceLabel(row), detail:`${row.status} · ${row.canonicalDomain || row.slug}` });
      for (const row of data?.charges || []) activity.push({ at:row.completed_at || row.created_at, type:'PAYMENT', title:`${String(row.plan_id || '').toUpperCase()} ${won(row.amount)}`, detail:String(row.status || '').toUpperCase() });
      activity.sort((a,b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
      if (!activity.length) return '<div class="marketing-ai-empty"><strong>최근 운영 이력이 없습니다.</strong></div>';
      return activity.slice(0, 10).map(item => `<div class="marketing-ai-activity-row"><span>${esc(item.type)}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></div><time>${esc(dateText(item.at))}</time></div>`).join('');
    }

    function renderOverview(data) {
      view.innerHTML = `<div class="marketing-ai-overview-grid">
        <section class="marketing-ai-console-card marketing-ai-attention-card">
          <div class="marketing-ai-card-head"><div><small>NEEDS ATTENTION</small><h3>확인할 일</h3></div><b>${num(data?.summary?.attention)}</b></div>
          <div class="marketing-ai-attention-list">${attentionHtml(data)}</div>
        </section>
        <section class="marketing-ai-console-card">
          <div class="marketing-ai-card-head"><div><small>WORKSPACES</small><h3>전용 AI 운영면</h3></div><button type="button" data-open-tab="workspaces">전체 보기</button></div>
          <div class="marketing-ai-workspace-list">${workspaceHtml(data,6)}</div>
        </section>
        <section class="marketing-ai-console-card marketing-ai-activity-card">
          <div class="marketing-ai-card-head"><div><small>ACTIVITY</small><h3>최근 운영 변화</h3></div><span>${esc(dateText(data?.generatedAt))}</span></div>
          <div class="marketing-ai-activity-list">${recentActivity(data)}</div>
        </section>
        <section class="marketing-ai-console-card marketing-ai-readiness-card">
          <div class="marketing-ai-card-head"><div><small>DATA READINESS</small><h3>운영 데이터 연결</h3></div></div>
          ${readinessHtml(data)}
        </section>
      </div>`;
    }

    function readinessHtml(data) {
      const labels = { subscriptions:'구독', billing:'결제', workspaces:'Workspace', campaigns:'캠페인', crm:'CRM', channels:'채널', automation:'자동화', approvals:'승인함' };
      const contracts = data?.dataContracts || {};
      return `<div class="marketing-ai-readiness-list">${Object.entries(labels).map(([key,label]) => {
        const status = contracts[key] || 'not_connected';
        const connected = status === 'connected';
        return `<div><span>${esc(label)}</span><strong class="${connected ? 'connected' : 'pending'}">${connected ? '연결됨' : status === 'temporarily_unavailable' ? '일시 확인 불가' : '연결 대기'}</strong></div>`;
      }).join('')}</div>`;
    }

    function renderCustomers(data) {
      const groups = new Map();
      for (const row of data?.subscriptions || []) {
        const key = `${row.subject_type}:${row.subject_key}`;
        const current = groups.get(key);
        if (!current || String(row.updated_at || '') > String(current.updated_at || '')) groups.set(key,row);
      }
      const rows = [...groups.values()].sort((a,b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      view.innerHTML = `<section class="marketing-ai-console-card marketing-ai-table-card">
        <div class="marketing-ai-card-head"><div><small>CUSTOMERS</small><h3>Marketing AI 고객</h3><p>구독 주체 기준이며 개인정보 원문은 표시하지 않습니다.</p></div><b>${num(rows.length)}</b></div>
        <div class="marketing-ai-table-wrap"><table><thead><tr><th>고객/주체</th><th>유형</th><th>플랜</th><th>상태</th><th>월 요금</th><th>최근 변경</th></tr></thead><tbody>
        ${rows.length ? rows.map(row => `<tr><td><strong>${esc(subjectLabel(data,row))}</strong><small>${esc(shortKey(row.subject_key))}</small></td><td>${esc(row.subject_type)}</td><td>${esc(String(row.plan_id || 'free').toUpperCase())}</td><td><span class="marketing-ai-state-chip ${esc(String(row.status || ''))}">${esc(String(row.status || '').toUpperCase())}</span></td><td>${esc(won(row.monthly_fee))}</td><td>${esc(dateText(row.updated_at))}</td></tr>`).join('') : '<tr><td colspan="6">저장된 Marketing AI 고객 구독이 없습니다.</td></tr>'}
        </tbody></table></div>
      </section>`;
    }

    function renderWorkspaces(data) {
      const rows = data?.workspaces || [];
      view.innerHTML = `<section class="marketing-ai-console-card marketing-ai-table-card">
        <div class="marketing-ai-card-head"><div><small>WORKSPACES</small><h3>전용 AI Workspace</h3><p>Plus 이상 고객에게 제공되는 독립 운영면을 조회합니다.</p></div><b>${num(rows.filter(row => row.status === 'active').length)} active</b></div>
        <div class="marketing-ai-workspace-grid">${rows.length ? rows.map(row => `<article class="marketing-ai-workspace-card">
          <div class="marketing-ai-workspace-card-top"><span class="marketing-ai-state-chip ${esc(row.status)}">${esc(String(row.status).toUpperCase())}</span><span class="marketing-ai-plan-chip">${esc(String(row.planId || 'free').toUpperCase())}</span></div>
          <h3>${esc(workspaceLabel(row))}</h3><p>${esc(row.canonicalDomain || row.slug || '주소 준비 중')}</p>
          <dl><div><dt>Tenant</dt><dd>${esc(row.tenantSlug || '—')}</dd></div><div><dt>Store ID</dt><dd title="${esc(row.storeId)}">${esc(shortKey(row.storeId))}</dd></div><div><dt>최근 변경</dt><dd>${esc(dateText(row.updatedAt))}</dd></div></dl>
          ${row.canonicalUrl ? `<a class="marketing-ai-workspace-open" href="${esc(row.canonicalUrl)}" target="_blank" rel="noopener">Workspace 열기 ↗</a>` : '<span class="marketing-ai-workspace-open disabled">주소 연결 대기</span>'}
        </article>`).join('') : '<div class="marketing-ai-empty"><strong>전용 Workspace 레코드가 없습니다.</strong><span>Plus 이상 점포가 전용 주소를 생성하면 여기에 자동 반영됩니다.</span></div>'}</div>
      </section>`;
    }

    function renderPlaceholder(data, tab) {
      const [title, copy] = CONTRACT_COPY[tab] || [tab,'운영 데이터 계약을 연결할 영역입니다.'];
      const status = data?.dataContracts?.[tab] || 'not_connected';
      view.innerHTML = `<section class="marketing-ai-console-card marketing-ai-contract-card">
        <div class="marketing-ai-contract-icon">◎</div><small>${esc(tab.toUpperCase())}</small><h3>${esc(title)}</h3><p>${esc(copy)}</p>
        <div class="marketing-ai-contract-state"><span>현재 상태</span><strong>${status === 'connected' ? 'CONNECTED' : 'DATA CONTRACT NOT CONNECTED'}</strong></div>
        <div class="marketing-ai-contract-note"><b>원칙</b><span>연결 전에는 0을 실제 성과처럼 표시하지 않습니다. 데이터가 없으면 없다고 보여줍니다.</span></div>
      </section>`;
    }

    function renderBilling(data) {
      const subscriptions = data?.subscriptions || [];
      const charges = data?.charges || [];
      const counts = subscriptions.reduce((acc,row) => { const key=String(row.plan_id || 'free').toLowerCase(); acc[key]=(acc[key]||0)+1; return acc; },{});
      view.innerHTML = `<div class="marketing-ai-billing-grid">
        <section class="marketing-ai-console-card"><div class="marketing-ai-card-head"><div><small>PLAN MIX</small><h3>플랜 구성</h3></div></div>
          <div class="marketing-ai-plan-count-grid"><div><span>FREE</span><strong>${num((counts.free||0)+(counts.basic||0))}</strong></div><div><span>FLEX</span><strong>${num(counts.flex)}</strong></div><div><span>PLUS</span><strong>${num(counts.plus)}</strong></div><div><span>PRO</span><strong>${num(counts.pro)}</strong></div><div><span>AUTO</span><strong>${num(counts.auto)}</strong></div><div><span>MRR</span><strong>${esc(won(data?.summary?.mrr))}</strong></div></div>
        </section>
        <section class="marketing-ai-console-card"><div class="marketing-ai-card-head"><div><small>RECENT CHARGES</small><h3>최근 결제</h3></div><b>30일 ${esc(won(data?.summary?.revenue30d))}</b></div>
          <div class="marketing-ai-billing-list">${charges.length ? charges.slice(0,12).map(row => `<div><span><strong>${esc(subjectLabel(data,row))}</strong><small>${esc(String(row.plan_id || '').toUpperCase())}</small></span><b>${esc(won(row.amount))}</b><em class="${esc(String(row.status || ''))}">${esc(String(row.status || '').toUpperCase())}</em><time>${esc(dateText(row.completed_at || row.created_at))}</time></div>`).join('') : '<div class="marketing-ai-empty">결제 이력이 없습니다.</div>'}</div>
        </section>
        <section class="marketing-ai-console-card marketing-ai-billing-subscriptions"><div class="marketing-ai-card-head"><div><small>SUBSCRIPTIONS</small><h3>최근 구독 변경</h3></div></div>
          <div class="marketing-ai-subscription-grid">${subscriptions.length ? subscriptions.slice(0,16).map(row => `<article><div><strong>${esc(subjectLabel(data,row))}</strong><span class="marketing-ai-plan-chip">${esc(planLabel(row))}</span></div><small>${Number(row.monthly_fee || 0) ? `월 ${esc(won(row.monthly_fee))}` : '무료/종량제'} · ${esc(dateText(row.updated_at))}</small></article>`).join('') : '<div class="marketing-ai-empty">구독 레코드가 없습니다.</div>'}</div>
        </section>
      </div>`;
    }

    function renderReports(data) {
      const s = data?.summary || {};
      view.innerHTML = `<div class="marketing-ai-report-grid">
        <section class="marketing-ai-console-card marketing-ai-report-brief"><div class="marketing-ai-card-head"><div><small>OPS BRIEF</small><h3>현재 운영 요약</h3></div><span>${esc(dateText(data?.generatedAt))}</span></div>
          <p>Marketing AI 고객 <strong>${num(s.customers)}</strong>개 주체 가운데 활성 월 유료 구독은 <strong>${num(s.paidSubscriptions)}</strong>건이고, MRR은 <strong>${esc(won(s.mrr))}</strong>입니다. 전용 Workspace는 <strong>${num(s.activeWorkspaces)}</strong>개가 활성 상태이며, 현재 확인이 필요한 운영 신호는 <strong>${num(s.attention)}</strong>건입니다.</p>
          <p>최근 30일 완료 결제는 <strong>${num(s.charges30d)}</strong>건, 합계 <strong>${esc(won(s.revenue30d))}</strong>입니다. 이 요약은 저장된 운영 데이터만 사용하며 추정 매출을 섞지 않습니다.</p>
        </section>
        <section class="marketing-ai-console-card"><div class="marketing-ai-card-head"><div><small>DATA CONTRACTS</small><h3>보고서 확장 준비도</h3></div></div>${readinessHtml(data)}</section>
        <section class="marketing-ai-console-card marketing-ai-report-safety"><div class="marketing-ai-card-head"><div><small>SAFETY</small><h3>관리 경계</h3></div></div>
          <div><span>조회 전용</span><strong>${data?.safety?.readOnly ? 'ON' : '확인 필요'}</strong></div><div><span>고객 PII 포함</span><strong>${data?.safety?.customerPiiIncluded ? 'YES' : 'NO'}</strong></div><div><span>외부 자동 실행</span><strong>${data?.safety?.externalExecution ? 'ON' : 'OFF'}</strong></div>
        </section>
      </div>`;
    }

    function render() {
      const data = state.data;
      if (!view) return;
      if (!data) {
        view.innerHTML = '<div class="marketing-ai-loading">Marketing AI 운영 데이터를 준비하고 있습니다.</div>';
        return;
      }
      if (state.tab === 'overview') renderOverview(data);
      else if (state.tab === 'customers') renderCustomers(data);
      else if (state.tab === 'workspaces') renderWorkspaces(data);
      else if (state.tab === 'billing') renderBilling(data);
      else if (state.tab === 'reports') renderReports(data);
      else renderPlaceholder(data,state.tab);
      view.querySelectorAll('[data-open-tab]').forEach(link => link.addEventListener('click', () => selectTab(link.dataset.openTab)));
    }

    function selectTab(tab) {
      if (!TABS.some(([key]) => key === tab)) return;
      state.tab = tab;
      tabs.forEach(item => item.classList.toggle('active', item.dataset.marketingTab === tab));
      render();
    }

    async function refreshData() {
      if (!token()) {
        setMessage('관리자 로그인 후 운영 데이터를 확인할 수 있습니다.', true);
        return;
      }
      if (state.loading) return;
      state.loading = true;
      setMessage('고객·Workspace·구독·결제 운영 데이터를 불러오는 중입니다.');
      try {
        const data = await loadData();
        state.data = data;
        setKpis(data);
        render();
        setMessage(`${data.degraded ? '일부 데이터만 연결됨 · ' : ''}마지막 확인 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}${data.degradedReason ? ` · Workspace API: ${data.degradedReason}` : ''}`, Boolean(data.degraded));
      } catch (error) {
        setMessage(error.message || 'MarketingAI 관리 데이터를 불러오지 못했습니다.', true);
        if (view) view.innerHTML = `<div class="marketing-ai-empty error"><strong>운영 데이터를 불러오지 못했습니다.</strong><span>${esc(error.message || '')}</span></div>`;
      } finally {
        state.loading = false;
      }
    }

    function show() {
      document.querySelectorAll('[data-panel]').forEach(item => {
        const targets = String(item.dataset.panel || '').split(' ');
        item.classList.toggle('hidden-panel', !targets.includes('marketing-ai'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'marketing-ai'));
      const title = document.querySelector('#pageTitle');
      if (title) title.textContent = 'MarketingAI';
      document.querySelector('.sidebar')?.classList.remove('open');
      if (location.hash !== '#marketing-ai') history.replaceState(null,'','#marketing-ai');
      refreshData();
    }

    button.addEventListener('click',show);
    panel.querySelectorAll('[data-marketing-refresh]').forEach(refreshButton => refreshButton.addEventListener('click',refreshData));
    tabs.forEach(tab => tab.addEventListener('click',() => selectTab(tab.dataset.marketingTab)));

    if (location.hash === '#marketing-ai' && token()) setTimeout(show,0);
    const app = document.querySelector('#app');
    if (app?.hidden) {
      const observer = new MutationObserver(() => {
        if (!app.hidden && token()) {
          observer.disconnect();
          if (location.hash === '#marketing-ai') show();
        }
      });
      observer.observe(app,{attributes:true,attributeFilter:['hidden']});
    }
    return true;
  }

  const run = () => install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();
