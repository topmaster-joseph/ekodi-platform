(() => {
  const API = 'https://ekodi.kr';
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
  const STUDIO_API = '/api/marketing/admin/studio/variants';
  const STUDIO_GENERATE_API = '/api/marketing/admin/studio/generate';
  const PERFORMANCE_API = '/api/marketing/admin/performance';
  const NAVER_API = '/api/marketing/admin/studio/naver';
  const NAVER_WRITE_URL = 'https://blog.naver.com/';
  const GENERATE_CHANNELS = [['facebook','Facebook 피드'],['instagram','Instagram 카드뉴스'],['instagram_reel','Instagram 릴스'],['facebook_reel','Facebook 릴스'],['youtube_short','YouTube 쇼츠'],['naver_blog','네이버 블로그']];
  const STUDIO_STATES = [['pending_review','검수 대기'],['approved','승인'],['scheduled','예약'],['published','게시'],['rejected','반려'],['draft','초안'],['archived','보관']];
  const STUDIO_CHANNEL_LABELS = { facebook:'Facebook', instagram:'Instagram', threads:'Threads', youtube:'YouTube', naver_blog:'네이버 블로그', other:'기타' };
  const studioApi = async (path, { method = 'GET', body } = {}) => {
    const headers = new Headers();
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (body) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { method, headers, cache:'no-store', ...(body ? { body:JSON.stringify(body) } : {}) });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `콘텐츠 검수 API 요청 실패 (${response.status})`);
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

    // 콘텐츠 스튜디오 검수함: 사람·AI가 만든 채널별 변형(pending_review)을 관리자가 승인·반려한다.
    // Approvals 탭의 다른 렌더러(라이브 운영 원장)가 화면을 다시 그려도 검수함은 맨 위에 다시 붙는다.
    const studio = { data:null, loadedAt:0, loading:false, busy:new Set(), error:'' };

    function studioVariantHtml(row) {
      const busy = studio.busy.has(row.id);
      const body = String(row.body || '');
      const preview = body.length > 220 ? `${body.slice(0, 220)}…` : body;
      return `<article class="marketing-ai-studio-item" data-variant-id="${esc(row.id)}">
        <div class="marketing-ai-studio-item-head">
          <span class="marketing-ai-studio-channel ${esc(row.channel)}">${esc(STUDIO_CHANNEL_LABELS[row.channel] || row.channel)}</span>
          <span class="marketing-ai-plan-chip">${esc(String(row.format || '').toUpperCase())}</span>
          ${row.aiGenerated ? '<span class="marketing-ai-studio-ai" title="AI 생성 콘텐츠로 표시됩니다">AI 생성</span>' : '<span class="marketing-ai-studio-human">사람 작성</span>'}
          <time>${esc(dateText(row.createdAt))}</time>
        </div>
        <strong>${esc(row.title || '(제목 없음)')}</strong>
        ${row.disclosureText ? `<p class="marketing-ai-studio-disclosure"><b>추천·보증 표시</b>${esc(row.disclosureText)}</p>` : ''}
        <p class="marketing-ai-studio-body">${esc(preview) || '—'}</p>
        <div class="marketing-ai-studio-meta"><span>${esc(subjectLabel(state.data, { subject_type:row.subjectType, subject_key:row.subjectKey }))}</span><span>추적코드 ${esc(row.trackingCode)}</span>${row.linkUrl ? `<span title="${esc(row.linkUrl)}">링크 연결됨</span>` : ''}<span>작성 ${esc(row.createdBy || '—')}</span></div>
        <div class="marketing-ai-studio-actions">
          <button type="button" class="primary" data-studio-action="approve" data-variant-id="${esc(row.id)}" ${busy ? 'disabled' : ''}>승인</button>
          <button type="button" class="secondary" data-studio-action="reject" data-variant-id="${esc(row.id)}" ${busy ? 'disabled' : ''}>반려</button>
        </div>
      </article>`;
    }

    function studioHtml() {
      const counts = studio.data?.counts || {};
      const rows = studio.data?.variants || [];
      const list = studio.error
        ? `<div class="marketing-ai-empty error"><strong>검수함을 불러오지 못했습니다.</strong><span>${esc(studio.error)}</span></div>`
        : !studio.data ? '<div class="marketing-ai-loading">검수 대기 콘텐츠를 확인하고 있습니다.</div>'
        : rows.length ? rows.map(studioVariantHtml).join('')
        : '<div class="marketing-ai-empty good"><strong>검수 대기 콘텐츠가 없습니다.</strong><span>사람이나 AI가 채널별 변형을 만들면 이곳에서 승인 후에만 게시 예약할 수 있습니다.</span></div>';
      return {
        head:`<div class="marketing-ai-card-head"><div><small>CONTENT STUDIO REVIEW</small><h3>콘텐츠 검수함</h3><p>사람·AI가 만든 모든 채널별 변형은 관리자 승인 뒤에만 게시 큐에 들어갑니다.</p></div><button type="button" data-studio-refresh>↻ 새로고침</button></div>
        <div class="marketing-ai-studio-counts">${STUDIO_STATES.map(([key,label]) => `<div class="${key === 'pending_review' && Number(counts[key] || 0) ? 'urgent' : ''}"><span>${esc(label)}</span><strong>${studio.data ? num(counts[key]) : '—'}</strong></div>`).join('')}</div>`,
        list:`<div class="marketing-ai-studio-list">${list}</div>`,
      };
    }

    // Phase 6: 상품으로 콘텐츠 만들기 — 생성 결과는 모두 검수 대기(pending_review)로만 들어간다.
    const generator = { status:null, statusLoading:false, busy:false, message:'', error:false };

    function generatorHtml() {
      const aiEnabled = generator.status?.aiEnabled === true;
      const aiNote = aiEnabled ? '무료 등급 AI 사용 가능' : 'AI 모드 비활성(무료 공급자 미설정) · 템플릿 사용';
      return `<details class="marketing-ai-studio-generator">
        <summary><strong>상품으로 콘텐츠 만들기</strong><span>구매 가이드 + 채널별 초안을 검수 대기로 생성 · 추가 비용 없음</span></summary>
        <form data-studio-generate novalidate>
          <label>상품명<input name="name" required maxlength="120" autocomplete="off"></label>
          <label>카테고리<input name="category" maxlength="60" placeholder="예: 텀블러" autocomplete="off"></label>
          <label class="wide">상품 링크<input name="url" type="url" required placeholder="https://ekodi.kr/ekodimall/p/... 또는 쿠팡 파트너스 링크"></label>
          <label>가격(원)<input name="priceKrw" inputmode="numeric" placeholder="선택"></label>
          <label>판매유형<select name="saleType"><option value="direct">에코디비즈 직접판매</option><option value="affiliate:coupang">제휴 · 쿠팡 파트너스</option><option value="affiliate:other">제휴 · 기타</option></select></label>
          <label class="wide">특징(줄바꿈으로 구분 · 확인된 사실만)<textarea name="features" rows="3" maxlength="1200"></textarea></label>
          <label class="wide">대상 고객<input name="audience" maxlength="120" placeholder="선택 · 예: 출퇴근 직장인"></label>
          <fieldset class="wide"><legend>채널</legend>${GENERATE_CHANNELS.map(([key,label]) => `<label class="check"><input type="checkbox" name="channels" value="${esc(key)}" checked>${esc(label)}</label>`).join('')}</fieldset>
          <fieldset><legend>모드</legend><label class="check"><input type="radio" name="mode" value="template" checked>템플릿</label><label class="check" title="${esc(aiNote)}"><input type="radio" name="mode" value="ai" ${aiEnabled ? '' : 'disabled'}>AI(무료)</label></fieldset>
          <div class="marketing-ai-studio-generator-actions wide"><button type="submit" class="primary" ${generator.busy ? 'disabled' : ''}>${generator.busy ? '생성 중…' : '검수 대기로 생성'}</button><small>${esc(aiNote)}</small></div>
          ${generator.message ? `<p class="marketing-ai-studio-generator-msg ${generator.error ? 'error' : ''} wide" role="status">${esc(generator.message)}</p>` : ''}
        </form>
      </details>`;
    }

    function mountStudio() {
      if (!view || state.tab !== 'approvals') return null;
      let section = view.querySelector('.marketing-ai-studio-review');
      if (!section) {
        section = document.createElement('section');
        section.className = 'marketing-ai-console-card marketing-ai-studio-review';
        section.setAttribute('aria-label', '콘텐츠 검수함');
        section.innerHTML = '<div class="marketing-ai-studio-review-head"></div><div class="marketing-ai-studio-generator-host"></div><div class="marketing-ai-studio-review-body"></div>';
        view.prepend(section);
        renderGenerator(section);
        loadGeneratorStatus();
      }
      const parts = studioHtml();
      section.querySelector('.marketing-ai-studio-review-head').innerHTML = parts.head;
      section.querySelector('.marketing-ai-studio-review-body').innerHTML = parts.list;
      return section;
    }

    function renderGenerator(section = view?.querySelector('.marketing-ai-studio-review')) {
      const host = section?.querySelector('.marketing-ai-studio-generator-host');
      if (!host) return;
      const wasOpen = host.querySelector('details')?.open;
      const form = host.querySelector('form[data-studio-generate]');
      const saved = form ? new FormData(form) : null;
      host.innerHTML = generatorHtml();
      if (wasOpen) host.querySelector('details').open = true;
      const next = host.querySelector('form[data-studio-generate]');
      if (saved && next) {
        for (const name of ['name','category','url','priceKrw','saleType','features','audience']) if (next.elements[name]) next.elements[name].value = saved.get(name) || next.elements[name].value;
        const channels = saved.getAll('channels');
        next.querySelectorAll('input[name="channels"]').forEach(input => { input.checked = channels.includes(input.value); });
        const mode = saved.get('mode');
        const radio = next.querySelector(`input[name="mode"][value="${mode === 'ai' ? 'ai' : 'template'}"]`);
        if (radio && !radio.disabled) radio.checked = true;
      }
    }

    async function loadGeneratorStatus() {
      if (!token() || generator.statusLoading || generator.status) return;
      generator.statusLoading = true;
      try { generator.status = await studioApi(STUDIO_GENERATE_API); } catch { generator.status = { aiEnabled:false }; }
      finally { generator.statusLoading = false; renderGenerator(); }
    }

    async function submitGenerator(form) {
      if (generator.busy) return;
      const data = new FormData(form);
      const [saleType, partner = ''] = String(data.get('saleType') || 'direct').split(':');
      const channels = data.getAll('channels');
      const name = String(data.get('name') || '').trim();
      const url = String(data.get('url') || '').trim();
      if (!name || !url || !channels.length) {
        generator.message = '상품명, 상품 링크, 채널을 하나 이상 입력해 주세요.'; generator.error = true; renderGenerator(); return;
      }
      generator.busy = true; generator.message = ''; generator.error = false; renderGenerator();
      try {
        const result = await studioApi(STUDIO_GENERATE_API, { method:'POST', body:{
          product:{ name, category:String(data.get('category') || '').trim(), url, priceKrw:String(data.get('priceKrw') || '').trim(),
            features:String(data.get('features') || '').split('\n').map(line => line.trim()).filter(Boolean),
            audience:String(data.get('audience') || '').trim(), saleType, partner },
          channels, mode:data.get('mode') === 'ai' ? 'ai' : 'template',
        } });
        const fallback = result.fallbackReason ? ` (AI 대신 템플릿 사용: ${result.fallbackReason})` : '';
        const dropped = result.rejectedInputs?.length ? ` · 무결성 기준으로 제외된 입력 ${result.rejectedInputs.length}건` : '';
        generator.message = `${result.variantIds?.length || 0}개 채널 초안을 검수 대기로 만들었습니다${fallback}${dropped}. 아래에서 확인 후 승인해 주세요.`;
        generator.error = false;
      } catch (error) {
        generator.message = error.message || '콘텐츠를 생성하지 못했습니다.'; generator.error = true;
      } finally {
        generator.busy = false;
        renderGenerator();
        await loadStudio(true);
      }
    }

    async function loadStudio(force = false) {
      if (!token() || studio.loading) return;
      if (!force && studio.data && Date.now() - studio.loadedAt < 15000) { mountStudio(); return; }
      studio.loading = true;
      try {
        studio.data = await studioApi(`${STUDIO_API}?status=pending_review`);
        studio.loadedAt = Date.now();
        studio.error = '';
      } catch (error) {
        studio.error = error.message || '알 수 없는 오류';
      } finally {
        studio.loading = false;
        mountStudio();
      }
    }

    async function decideStudio(id, action) {
      if (!id || studio.busy.has(id)) return;
      let note = '';
      if (action === 'reject') {
        const answer = window.prompt('반려 사유를 입력해 주세요. 작성자에게 검수 메모로 남습니다.', '');
        if (answer === null) return;
        note = answer.trim();
      }
      studio.busy.add(id);
      mountStudio();
      try {
        await studioApi(`${STUDIO_API}/${encodeURIComponent(id)}/${action}`, { method:'POST', body:{ note } });
        setMessage(action === 'approve' ? '콘텐츠를 승인했습니다. 게시 예약은 승인된 변형에서만 가능합니다.' : '콘텐츠를 반려했습니다.');
      } catch (error) {
        setMessage(error.message || '검수 결정을 저장하지 못했습니다.', true);
      } finally {
        studio.busy.delete(id);
        await loadStudio(true);
      }
    }


    // Phase 8 성과·수익 패널(Reports 탭). 추정·확정·미귀속 금액은 절대 합치지 않고 따로 보여준다.
    // 라이브 운영 렌더러가 탭을 다시 그려도 MutationObserver가 패널을 다시 붙인다.
    const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const kstDaysAgo = days => new Date(Date.now() + 9 * 3600000 - days * 86400000).toISOString().slice(0, 10);
    const perf = { data:null, naver:null, loading:false, error:'', naverError:'', from:kstDaysAgo(29), to:kstToday(), busy:new Set(), copy:new Map(), message:'' };
    const pct = value => `${(Number(value || 0) * 100).toFixed(1)}%`;

    function perfTotalsHtml(report) {
      const t = report?.totals || {};
      const u = t.unattributed || {};
      const direct = report?.directSale || {};
      return `<div class="marketing-ai-perf-kpis">
          <div><span>조회수</span><strong>${num(t.views)}</strong></div><div><span>참여</span><strong>${num(t.engagement)}</strong></div>
          <div><span>방문</span><strong>${num(t.visits)}</strong></div><div><span>제휴 클릭</span><strong>${num(t.affiliateClicks)}</strong></div>
          <div><span>주문</span><strong>${num(t.orders)}</strong></div><div><span>콘텐츠 비용</span><strong>${esc(won(t.costKrw))}</strong></div>
        </div>
        <div class="marketing-ai-perf-revenue">
          <article class="confirmed"><small>확정 매출 · 게시물 귀속</small><strong>${esc(won(t.attributed?.confirmedKrw))}</strong><p>직접판매 결제(환불 차감)와 확정 귀속 이벤트만 포함합니다.</p></article>
          <article class="estimated"><small>추정 수수료 · 게시물 귀속</small><strong>${esc(won(t.attributed?.estimatedKrw))}</strong><p>제휴 클릭 × 기간 쿠팡 EPC(${esc(won(report?.estimatedMethod?.epcKrw))}/클릭) 기준 추정치입니다. 확정 금액과 합치지 않습니다.</p></article>
          <article class="unattributed"><small>미귀속 확정 · 채널/합계 수준</small><strong>${esc(won(u.confirmedKrw))}</strong><p>쿠팡 보고 수수료 ${esc(won(u.coupangReportedKrw))} · 직접판매 미귀속 ${esc(won(u.directSaleKrw))}. 특정 게시물로 귀속할 수 없는 금액입니다.</p></article>
        </div>
        <p class="marketing-ai-perf-flag ${direct.connected ? '' : 'warn'}">${direct.connected ? `에코디몰 직접판매 연결됨 · 기간 결제 주문 ${num(direct.orders)}건` : `에코디몰 직접판매 미연결(${esc(direct.reason || 'NOT_CONNECTED')}) — 직접판매 매출은 0원으로 표시하며 추측하지 않습니다.`}</p>`;
    }

    function perfItemsHtml(report) {
      const rows = report?.items || [];
      if (!rows.length) return '<div class="marketing-ai-empty"><strong>기간 안 성과 데이터가 없습니다.</strong><span>게시가 완료되고 성과 수집(6시간 주기)·유입 귀속이 쌓이면 표시됩니다.</span></div>';
      return `<div class="marketing-ai-perf-table" role="region" aria-label="콘텐츠별 성과" tabindex="0"><table>
        <thead><tr><th>콘텐츠</th><th>채널</th><th>조회</th><th>도달</th><th>참여율</th><th>방문</th><th>제휴 클릭</th><th>주문</th><th>확정</th><th>추정</th><th>비용</th><th>ROI</th></tr></thead>
        <tbody>${rows.map(row => `<tr>
          <td data-label="콘텐츠"><strong>${esc(row.title || row.trackingCode || row.key)}</strong>${row.postUrl ? `<a href="${esc(row.postUrl)}" target="_blank" rel="noopener noreferrer">게시물 ↗</a>` : ''}<small>${esc(row.trackingCode || '')}</small></td>
          <td data-label="채널"><span class="marketing-ai-studio-channel ${esc(row.channel)}">${esc(STUDIO_CHANNEL_LABELS[row.channel] || row.channel)}</span></td>
          <td data-label="조회">${num(row.views)}</td><td data-label="도달">${num(row.reach)}</td><td data-label="참여율">${esc(pct(row.engagementRate))}</td>
          <td data-label="방문">${num(row.visits)}</td><td data-label="제휴 클릭">${num(row.affiliateClicks)}</td><td data-label="주문">${num(row.orders)}</td>
          <td data-label="확정">${esc(won(row.confirmedKrw))}</td><td data-label="추정">${esc(won(row.estimatedKrw))}</td><td data-label="비용">${esc(won(row.costKrw))}</td>
          <td data-label="ROI">${row.roi == null ? '—' : esc(pct(row.roi))}</td></tr>`).join('')}</tbody></table></div>`;
    }

    function perfRecommendationHtml(report) {
      const top = report?.recommendation?.top || [];
      return `<div class="marketing-ai-perf-reco"><small>AI 추천 힌트</small><p>${esc(report?.recommendation?.basis || '')}</p>
        ${top.length ? `<ol>${top.map(item => `<li><b>${esc(item.title || item.key)}</b> · ${esc(STUDIO_CHANNEL_LABELS[item.channel] || item.channel)} — ${esc(item.reason)}</li>`).join('')}</ol>` : '<p>아직 매출·참여 신호가 충분하지 않습니다.</p>'}</div>`;
    }

    function naverHtml() {
      if (perf.naverError) return `<div class="marketing-ai-empty error"><strong>네이버 블로그 목록을 불러오지 못했습니다.</strong><span>${esc(perf.naverError)}</span></div>`;
      if (!perf.naver) return '<div class="marketing-ai-loading">승인된 네이버 블로그 초안을 확인하고 있습니다.</div>';
      const rows = perf.naver.variants || [];
      perf.copy.clear();
      const list = rows.length ? rows.map(row => {
        perf.copy.set(`${row.id}:title`, row.copy?.title || '');
        perf.copy.set(`${row.id}:body`, row.copy?.body || '');
        perf.copy.set(`${row.id}:hashtags`, row.copy?.hashtags || '');
        const busy = perf.busy.has(row.id);
        return `<article class="marketing-ai-naver-item" data-variant-id="${esc(row.id)}">
          <div class="marketing-ai-studio-item-head"><span class="marketing-ai-studio-channel naver_blog">네이버 블로그</span><span class="marketing-ai-naver-state ${esc(row.status)}">${esc(row.status === 'published' ? '게시 완료' : '승인 · 게시 대기')}</span></div>
          <strong>${esc(row.title || '(제목 없음)')}</strong>
          <div class="marketing-ai-naver-copy">
            <button type="button" data-naver-copy="title" data-variant-id="${esc(row.id)}">제목 복사</button>
            <button type="button" data-naver-copy="body" data-variant-id="${esc(row.id)}">본문 복사</button>
            <button type="button" data-naver-copy="hashtags" data-variant-id="${esc(row.id)}">해시태그 복사</button>
            <a href="${esc(perf.naver.writeUrl || NAVER_WRITE_URL)}" target="_blank" rel="noopener noreferrer">네이버 블로그 열기 ↗</a>
          </div>
          <form class="marketing-ai-naver-capture" data-naver-capture="${esc(row.id)}" novalidate>
            <label>게시한 네이버 글 주소<input name="url" type="url" inputmode="url" placeholder="https://blog.naver.com/아이디/글번호" value="${esc(row.externalPostUrl || '')}" required></label>
            <button type="submit" ${busy ? 'disabled' : ''}>${busy ? '저장 중…' : row.externalPostUrl ? 'URL 수정' : '게시 URL 저장'}</button>
          </form>
        </article>`;
      }).join('') : '<div class="marketing-ai-empty"><strong>승인된 네이버 블로그 초안이 없습니다.</strong><span>Approvals 탭에서 naver_blog 변형을 승인하면 여기에 복사용으로 나타납니다.</span></div>';
      return `<div class="marketing-ai-card-head"><div><small>NAVER BLOG · MANUAL</small><h3>네이버 블로그</h3><p>네이버 블로그는 공식 글쓰기 API가 없어 복사 → 직접 게시 → 게시 URL 저장 순서로 운영합니다.</p></div></div><div class="marketing-ai-naver-list">${list}</div>`;
    }

    function perfHtml() {
      const report = perf.data;
      const body = perf.error
        ? `<div class="marketing-ai-empty error"><strong>성과·수익 리포트를 불러오지 못했습니다.</strong><span>${esc(perf.error)}</span></div>`
        : !report ? '<div class="marketing-ai-loading">성과·수익 데이터를 집계하고 있습니다.</div>'
        : `${perfTotalsHtml(report)}${perfRecommendationHtml(report)}${perfItemsHtml(report)}`;
      return `<div class="marketing-ai-card-head"><div><small>PERFORMANCE · REVENUE</small><h3>성과·수익</h3><p>조회·참여는 공급자 누적값, 수익은 확정·추정·미귀속을 분리해 보여줍니다.</p></div>
          <form class="marketing-ai-perf-range" data-perf-range novalidate>
            <label>시작<input type="date" name="from" value="${esc(perf.from)}" max="${esc(kstToday())}"></label>
            <label>종료<input type="date" name="to" value="${esc(perf.to)}" max="${esc(kstToday())}"></label>
            <button type="submit" ${perf.loading ? 'disabled' : ''}>${perf.loading ? '조회 중…' : '조회'}</button>
          </form></div>
        ${perf.message ? `<p class="marketing-ai-studio-generator-msg" role="status">${esc(perf.message)}</p>` : ''}
        <div class="marketing-ai-perf-body">${body}</div>
        <section class="marketing-ai-naver" aria-label="네이버 블로그 수동 게시">${naverHtml()}</section>`;
    }

    function mountPerformance() {
      if (!view || state.tab !== 'reports') return null;
      let section = view.querySelector('.marketing-ai-performance');
      if (!section) {
        section = document.createElement('section');
        section.className = 'marketing-ai-console-card marketing-ai-performance';
        section.setAttribute('aria-label', '성과·수익');
        view.prepend(section);
      }
      section.innerHTML = perfHtml();
      return section;
    }

    async function loadPerformance(force = false) {
      if (!token() || perf.loading) { mountPerformance(); return; }
      if (!force && perf.data && perf.naver) { mountPerformance(); return; }
      perf.loading = true;
      mountPerformance();
      const query = `?from=${encodeURIComponent(perf.from)}&to=${encodeURIComponent(perf.to)}`;
      const [report, naver] = await Promise.allSettled([studioApi(`${PERFORMANCE_API}${query}`), studioApi(NAVER_API)]);
      if (report.status === 'fulfilled') { perf.data = report.value; perf.error = ''; } else perf.error = report.reason?.message || '알 수 없는 오류';
      if (naver.status === 'fulfilled') { perf.naver = naver.value; perf.naverError = ''; } else perf.naverError = naver.reason?.message || '알 수 없는 오류';
      perf.loading = false;
      mountPerformance();
    }

    async function copyNaver(id, field) {
      const text = perf.copy.get(`${id}:${field}`) || '';
      try { await navigator.clipboard.writeText(text); perf.message = `${field === 'title' ? '제목' : field === 'body' ? '본문' : '해시태그'}을 복사했습니다.`; }
      catch { perf.message = '클립보드 복사가 차단되었습니다. 브라우저 권한을 확인해 주세요.'; }
      mountPerformance();
    }

    async function captureNaver(form) {
      const id = Number(form.dataset.naverCapture);
      const url = String(new FormData(form).get('url') || '').trim();
      if (!id || perf.busy.has(id)) return;
      if (!/^https:\/\/(m\.)?blog\.naver\.com\/.+/i.test(url)) { perf.message = '네이버 블로그 글 주소(https://blog.naver.com/…)를 입력해 주세요.'; mountPerformance(); return; }
      perf.busy.add(id);
      mountPerformance();
      try {
        await studioApi(`${STUDIO_API}/${encodeURIComponent(id)}/naver-published`, { method:'POST', body:{ url } });
        perf.message = '네이버 게시 URL을 저장했습니다. 이 콘텐츠는 게시 완료로 표시됩니다.';
      } catch (error) {
        perf.message = error.message || '네이버 게시 URL을 저장하지 못했습니다.';
      } finally {
        perf.busy.delete(id);
        await loadPerformance(true);
      }
    }

    if (view) {
      new MutationObserver(() => {
        if (state.tab === 'approvals' && !view.querySelector('.marketing-ai-studio-review')) mountStudio();
        if (state.tab === 'reports' && !view.querySelector('.marketing-ai-performance')) mountPerformance();
      }).observe(view, { childList:true });
      view.addEventListener('submit', event => {
        const range = event.target.closest('form[data-perf-range]');
        if (range) {
          event.preventDefault();
          const data = new FormData(range);
          perf.from = String(data.get('from') || perf.from);
          perf.to = String(data.get('to') || perf.to);
          perf.message = '';
          loadPerformance(true);
          return;
        }
        const capture = event.target.closest('form[data-naver-capture]');
        if (capture) { event.preventDefault(); captureNaver(capture); return; }
        const form = event.target.closest('form[data-studio-generate]');
        if (!form) return;
        event.preventDefault();
        submitGenerator(form);
      });
      view.addEventListener('click', event => {
        const copyButton = event.target.closest('[data-naver-copy]');
        if (copyButton) { copyNaver(Number(copyButton.dataset.variantId), copyButton.dataset.naverCopy); return; }
        const actionButton = event.target.closest('[data-studio-action]');
        if (actionButton) { decideStudio(Number(actionButton.dataset.variantId), actionButton.dataset.studioAction); return; }
        if (event.target.closest('[data-studio-refresh]')) loadStudio(true);
      });
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
      if (state.tab === 'approvals') loadStudio();
      if (state.tab === 'reports') loadPerformance();
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
