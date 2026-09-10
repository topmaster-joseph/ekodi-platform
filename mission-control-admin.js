(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const START_KEY = 'ekodi-governance-cockpit-started-v1';
  const OVERVIEW_TTL_MS = 5 * 60 * 1000;
  const CORE_DOMAINS = new Set(['admin.ekodi.kr','auth.ekodi.kr','api.ekodi.kr','pay.ekodi.kr']);
  const PRIMARY_ROUTES = [
    { key:'overview', label:'Overview', icon:'◈', focus:'overview' },
    { key:'decisions', label:'Decisions', icon:'✓', focus:'decisions' },
    { key:'ecosystem', label:'Ecosystem', icon:'◎', focus:'ecosystem' },
    { key:'council', label:'AI Council', icon:'✦', focus:'council' },
    { key:'system', label:'System', icon:'⚙', system:true },
  ];
  const AI_COUNCIL = [
    ['Chief AI','전체 생태계 브리핑 · 우선순위 · 위임 · 관리자 보고'],
    ['Platform AI','플랫폼별 제품 · API · 데이터 · 공통운영'],
    ['Site AI','사이트별 상태 · 콘텐츠 · 기능 · 사용자 경험'],
    ['Workspace AI','사업장 · 조직 · 사용자 공간별 맞춤 운영'],
    ['Security AI','인증 · 권한 · 개인정보 · 위험 차단'],
    ['Release AI','Staging · 검증 · 배포 · Last Known Good · 롤백'],
    ['Finance AI','결제 · 회계 · 비용 · 정산 영향'],
  ];

  let latestOverview = null;
  let refreshTimer = 0;
  let lastOverviewAt = 0;
  let refreshPromise = null;

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const headers = () => token() ? { authorization:`Bearer ${token()}` } : {};

  function serviceStatus(service) {
    if (!service || (service.state && service.state !== 'active')) return { key:'standby', label:'연결대기' };
    const health = String(service.latest?.status || 'pending').toLowerCase();
    if (health === 'offline') return { key:'critical', label:'장애' };
    if (health === 'degraded') return { key:'attention', label:'주의' };
    const response = Number(service.latest?.responseTime ?? service.stats24h?.averageResponseTime ?? 0);
    if (response >= 1800) return { key:'attention', label:'주의' };
    if (['online','healthy','ok'].includes(health) || service.state === 'active') return { key:'healthy', label:'정상' };
    return { key:'standby', label:'연결대기' };
  }

  function checkedAt(service) {
    const raw = service?.latest?.checkedAt || service?.latest?.checked_at || service?.lastCheckedAt || service?.updatedAt || latestOverview?.generatedAt;
    const time = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(time) ? time : 0;
  }

  function relativeTime(time) {
    if (!time) return '확인 대기';
    const diff = Math.max(0, Date.now() - time);
    if (diff < 60_000) return '방금 전';
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}분 전`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
    return new Date(time).toLocaleDateString('ko-KR');
  }

  function services() { return Array.isArray(latestOverview?.services) ? latestOverview.services : []; }
  function issueItems() {
    return services().map(service => ({ service, status:serviceStatus(service) }))
      .filter(({ status }) => ['critical','attention'].includes(status.key));
  }
  function decisionItems() {
    return issueItems().filter(({ service, status }) =>
      status.key === 'critical' || CORE_DOMAINS.has(String(service.domain || '').toLowerCase()))
      .map(({ service, status }) => ({
        title:`${service.name || service.domain} ${status.key === 'critical' ? '중요 장애' : '주의 상태'}`,
        domain:service.domain || '', status:status.label,
        reason:'AI가 관찰·가역조치를 우선 수행하되, 권한·DNS·데이터·비용·방향 변경이 필요한 경우 관리자 판단으로 올립니다.',
      }));
  }

  function renderExecutiveBrief() {
    const host = $('#missionExecutiveBrief');
    if (!host) return;
    const all = services();
    const states = all.map(serviceStatus);
    const healthy = states.filter(item => item.key === 'healthy').length;
    const issues = issueItems();
    const decisions = decisionItems();
    const newest = all.reduce((max, service) => Math.max(max, checkedAt(service)), 0);
    const sentence = !all.length
      ? '아직 최신 운영 집계를 기다리고 있습니다.'
      : !issues.length
        ? `전체 ${all.length}개 운영 단위에서 즉시 개입이 필요한 이상은 없습니다. 하위 AI가 일상 운영을 계속 관찰합니다.`
        : `${issues.length}개 운영 단위에 주의 신호가 있으며, 그중 ${decisions.length}건을 관리자 판단 후보로 분류했습니다.`;
    host.innerHTML = `
      <div class="governance-brief-copy"><small>CHIEF AI BRIEF</small><strong>${esc(sentence)}</strong><span>관리자는 직접 운영하지 않고, 중요 판단과 방향 설정에 집중합니다.</span></div>
      <div class="governance-brief-metrics">
        <article><small>HEALTH</small><strong>${healthy}/${all.length || '—'}</strong><span>정상 운영</span></article>
        <article><small>DECISIONS</small><strong>${decisions.length}</strong><span>관리자 판단</span></article>
        <article><small>LAST SIGNAL</small><strong>${esc(relativeTime(newest))}</strong><span>최신 집계</span></article>
      </div>`;
  }

  function renderDecisions() {
    const host = $('#missionDecisionList');
    if (!host) return;
    const items = decisionItems();
    if (!items.length) {
      host.innerHTML = '<div class="mission-empty"><strong>지금 관리자 판단이 필요한 항목은 없습니다.</strong><span>저위험 점검·재시도·가역조치는 AI가 처리하고 결과만 보고합니다.</span></div>';
      return;
    }
    host.innerHTML = items.map(item => `
      <article class="mission-decision-card">
        <div><small>HUMAN DECISION GATE</small><strong>${esc(item.title)}</strong><span>${esc(item.domain)}</span></div>
        <p>${esc(item.reason)}</p>
        <button type="button" data-mission-decision="${esc(item.domain)}">Chief AI에게 선택지 요청</button>
      </article>`).join('');
    host.querySelectorAll('[data-mission-decision]').forEach(button => button.addEventListener('click', () => {
      openFocus('decisions');
      askChief(`${button.dataset.missionDecision || ''}와 관련해 내가 결정해야 할 핵심 선택지, 영향, 권고안을 간단히 정리해줘`);
    }));
  }

  function renderTimeline() {
    const host = $('#missionTimeline');
    if (!host) return;
    const items = services().map(service => ({ service, status:serviceStatus(service), time:checkedAt(service) }))
      .filter(item => item.time).sort((a,b) => b.time - a.time).slice(0,8);
    if (!items.length) {
      host.innerHTML = '<div class="mission-empty"><strong>표시할 최신 운영 신호가 없습니다.</strong><span>실측 데이터가 들어오면 최근 흐름을 시간순으로 보여줍니다.</span></div>';
      return;
    }
    host.innerHTML = items.map(({ service, status, time }) => `
      <button class="mission-time-row" type="button" data-mission-domain="${esc(service.domain || '')}">
        <span class="mission-time-dot ${esc(status.key)}"></span><time>${esc(relativeTime(time))}</time>
        <strong>${esc(service.name || service.domain || 'Service')}</strong><span>${esc(status.label)}</span>
      </button>`).join('');
    host.querySelectorAll('[data-mission-domain]').forEach(button => button.addEventListener('click', () => openFocus('ecosystem', button.dataset.missionDomain || '')));
  }

  function renderCouncil() {
    const host = $('#missionAiCrew');
    if (!host) return;
    const issues = issueItems().length;
    host.innerHTML = AI_COUNCIL.map(([name, role], index) => `
      <button type="button" class="mission-council-agent" data-council-agent="${esc(name)}">
        <span class="mission-ai-orb">${index === 0 ? 'C' : name.slice(0,1)}</span>
        <div><strong>${esc(name)}</strong><small>${esc(role)}</small></div><b>${index === 0 || issues ? 'READY' : 'WATCHING'}</b>
      </button>`).join('');
    host.querySelectorAll('[data-council-agent]').forEach(button => button.addEventListener('click', () => {
      askChief(`${button.dataset.councilAgent} 관점에서 지금 EKODI 전체에서 내가 알아야 할 사항만 보고해줘`);
    }));
  }

  function renderAll() { renderExecutiveBrief(); renderDecisions(); renderTimeline(); renderCouncil(); }

  function cockpitVisible() {
    const panel = $('#aiOpsPanel');
    return document.visibilityState === 'visible' && Boolean(panel) && !panel.classList.contains('hidden-panel') && !document.body.classList.contains('governance-system-open');
  }

  async function refreshOverview(force = false) {
    if (!force && latestOverview && Date.now() - lastOverviewAt < OVERVIEW_TTL_MS) return latestOverview;
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const response = await fetch(`${API}${force ? '/api/control/check' : '/api/control/overview'}`, { method:force ? 'POST' : 'GET', headers:headers(), cache:'no-store' });
      if (!response.ok) throw new Error(`Control API ${response.status}`);
      latestOverview = await response.json(); lastOverviewAt = Date.now(); renderAll(); return latestOverview;
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  function refreshVisibleOverview() {
    if (!cockpitVisible()) return;
    refreshOverview(false).catch(error => console.warn('Governance overview unavailable', error));
  }

  function routeSection(section, fallback = '') {
    const nav = $('.sidebar nav');
    const target = nav?.querySelector(`[data-section="${section}"]`) || (fallback ? nav?.querySelector(`[data-section="${fallback}"]`) : null);
    target?.click();
  }

  function askChief(text) {
    routeSection('aiops');
    window.setTimeout(() => {
      const input = $('#aiChiefChatInput');
      if (!input) return;
      input.value = text;
      $('#aiChiefChatForm')?.requestSubmit();
      $('#aiChiefChatInput')?.focus();
    }, 80);
  }

  function scrollToFocus(focus, domain = '') {
    const map = {
      overview:'#missionExecutiveBrief', decisions:'#missionDecisionBlock', ecosystem:'.mission-ecosystem-rail', council:'#missionCouncilBlock',
    };
    const target = $(map[focus] || map.overview);
    target?.scrollIntoView({ behavior:'smooth', block:'start' });
    if (focus === 'ecosystem' && domain) {
      const row = document.querySelector(`[data-ai-agent-domain="${CSS.escape(domain)}"]`);
      window.setTimeout(() => row?.click(), 120);
    }
  }

  function openFocus(focus = 'overview', domain = '') {
    routeSection('aiops');
    document.body.dataset.missionFocus = focus;
    window.setTimeout(() => { scrollToFocus(focus, domain); refreshVisibleOverview(); }, 90);
    syncPageTitle();
  }

  function setSystemMode(active) {
    document.body.classList.toggle('governance-system-open', active);
    if (active) routeSection('deployments');
  }

  function installPrimaryNavigation() {
    const nav = $('.sidebar nav');
    if (!nav || nav.querySelector('.mission-primary-nav')) return false;
    const primary = document.createElement('div');
    primary.className = 'mission-primary-nav';
    primary.setAttribute('aria-label','EKODI AI Governance Cockpit');
    for (const route of PRIMARY_ROUTES) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'nav mission-primary-item'; button.dataset.missionRoute = route.key;
      button.innerHTML = `<span class="mission-primary-icon">${esc(route.icon)}</span><span>${esc(route.label)}</span>`;
      button.addEventListener('click', event => {
        event.preventDefault();
        primary.querySelectorAll('.mission-primary-item').forEach(item => item.classList.toggle('active', item === button));
        if (route.system) setSystemMode(true);
        else { setSystemMode(false); openFocus(route.focus); }
      });
      primary.append(button);
    }
    nav.prepend(primary);
    return true;
  }

  function installMissionSurface() {
    const panel = $('#aiOpsPanel');
    const observe = panel?.querySelector('.ai-ops-observe');
    if (!panel || !observe || panel.dataset.missionControlReady === 'true') return false;
    panel.dataset.missionControlReady = 'true';
    panel.classList.add('mission-control-surface');
    const kicker = panel.querySelector('.ai-ops-title .kicker');
    const title = panel.querySelector('.ai-ops-title h2');
    const copy = panel.querySelector('.ai-ops-title>p:last-child');
    if (kicker) kicker.textContent = 'EKODI · AI GOVERNANCE COCKPIT';
    if (title) title.textContent = 'Chief AI Control Room';
    if (copy) copy.textContent = '전문 AI들이 플랫폼·사이트·사용자 공간을 운영하고, 관리자는 한눈에 보고 중요한 방향과 결정을 지시합니다.';

    const dashboard = document.createElement('div');
    dashboard.className = 'mission-dashboard';
    dashboard.innerHTML = `
      <section class="mission-brief" id="missionExecutiveBrief"></section>
      <section class="mission-decisions" id="missionDecisionBlock">
        <div class="mission-section-head"><div><small>DECISION QUEUE</small><h3>관리자가 결정할 것</h3></div><button type="button" id="missionDecisionChat">Chief AI Brief</button></div>
        <div id="missionDecisionList"></div>
      </section>
      <section class="mission-timeline-block">
        <div class="mission-section-head"><div><small>LIVE SIGNALS</small><h3>최근 운영 흐름</h3></div><span>실측 기반</span></div><div class="mission-timeline" id="missionTimeline"></div>
      </section>
      <section class="mission-crew-block" id="missionCouncilBlock">
        <div class="mission-section-head"><div><small>AI COUNCIL</small><h3>총괄AI와 전문AI</h3></div><button type="button" id="missionOpenAi">전체 보고</button></div><div class="mission-ai-crew" id="missionAiCrew"></div>
      </section>`;
    observe.prepend(dashboard);

    panel.querySelector('.ai-fleet-block')?.classList.add('mission-ecosystem-rail');
    const fleetSmall = panel.querySelector('.ai-fleet-head small');
    const fleetTitle = panel.querySelector('.ai-fleet-head h3');
    if (fleetSmall) fleetSmall.textContent = 'ECOSYSTEM · DELEGATED OPERATIONS';
    if (fleetTitle) fleetTitle.textContent = '플랫폼 · 사이트 · 사용자 공간';

    $('#missionDecisionChat')?.addEventListener('click', () => askChief('지금 내가 결정해야 할 사항만 중요도 순으로 보고하고 각 선택지의 영향과 권고안을 제시해줘'));
    $('#missionOpenAi')?.addEventListener('click', () => askChief('각 전문 AI의 상태와 오늘 처리한 일, 진행 중인 일, 내 판단이 필요한 일을 한 번에 브리핑해줘'));
    return true;
  }

  function installCommandBar() {
    if ($('#governanceCommandBar')) return;
    const bar = document.createElement('form');
    bar.id = 'governanceCommandBar'; bar.className = 'governance-command-bar';
    bar.innerHTML = '<span>✦ Chief AI</span><input id="governanceCommandInput" aria-label="Chief AI 명령" placeholder="방향 설정이나 중요한 결정을 지시하세요…"><button type="submit">지시</button>';
    bar.addEventListener('submit', event => {
      event.preventDefault(); const input = $('#governanceCommandInput'); const text = input?.value.trim();
      if (!text) return; if (input) input.value = ''; askChief(text);
    });
    document.body.append(bar);
  }

  function markSecondaryNavigation() {
    const nav = $('.sidebar nav');
    if (!nav) return;
    [...nav.children].forEach(child => { if (!child.classList?.contains('mission-primary-nav')) child.classList?.add('mission-secondary-nav'); });
  }

  function syncPageTitle() {
    const title = $('#pageTitle'); if (!title) return;
    const labels = { overview:'Overview', decisions:'Decisions', ecosystem:'Ecosystem', council:'AI Council' };
    if (!document.body.classList.contains('governance-system-open') && !$('#aiOpsPanel')?.classList.contains('hidden-panel')) title.textContent = labels[document.body.dataset.missionFocus] || 'Overview';
  }

  function maybeStartOverview() {
    if (sessionStorage.getItem(START_KEY) === 'true') return;
    sessionStorage.setItem(START_KEY,'true');
    window.setTimeout(() => openFocus('overview'), 40);
  }

  function init() {
    document.body.classList.add('mission-control-admin','governance-cockpit-admin');
    const ready = () => {
      const primaryReady = installPrimaryNavigation() || Boolean($('.mission-primary-nav'));
      const surfaceReady = installMissionSurface() || Boolean($('#aiOpsPanel')?.dataset.missionControlReady);
      markSecondaryNavigation(); installCommandBar();
      if (!primaryReady || !surfaceReady) return false;
      refreshVisibleOverview();
      window.clearInterval(refreshTimer); refreshTimer = window.setInterval(refreshVisibleOverview, OVERVIEW_TTL_MS);
      maybeStartOverview(); syncPageTitle(); return true;
    };
    if (!ready()) {
      const observer = new MutationObserver(() => { markSecondaryNavigation(); if (ready()) observer.disconnect(); });
      observer.observe(document.documentElement,{ childList:true, subtree:true });
    }
    document.addEventListener('click', () => window.setTimeout(() => { syncPageTitle(); refreshVisibleOverview(); }, 0), true);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshVisibleOverview(); });
    window.addEventListener('hashchange', () => { syncPageTitle(); refreshVisibleOverview(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})();