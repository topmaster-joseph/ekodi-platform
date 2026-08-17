(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const START_KEY = 'ekodi-mission-control-started-v1';
  const CORE_DOMAINS = new Set(['admin.ekodi.kr','auth.ekodi.kr','api.ekodi.kr','pay.ekodi.kr']);
  const PRIMARY_ROUTES = [
    { key:'campus', label:'Campus', icon:'⌂', section:'campus' },
    { key:'today', label:'Today', icon:'◈', section:'aiops' },
    { key:'people', label:'People', icon:'◎', section:'clients', fallback:'admins' },
    { key:'money', label:'Money', icon:'₩', section:'finance' },
    { key:'ai', label:'AI', icon:'✦', section:'aiops', focus:'ai' },
    { key:'more', label:'More', icon:'•••', toggle:true },
  ];
  const AI_CREW = [
    ['Chief AI','전체 우선순위 · 조정 · 관리자 보고'],
    ['Platform AI','API · DB · Cloud · 공통 인프라'],
    ['Security AI','인증 · 권한 · 개인정보 · 비밀정보'],
    ['Release AI','Staging · CI · 배포 · 롤백'],
    ['Finance AI','결제 · 회계 · 비용 · 정산 영향'],
  ];

  let latestOverview = null;
  let refreshTimer = 0;

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';

  function headers() {
    const current = token();
    return current ? { authorization:`Bearer ${current}` } : {};
  }

  function serviceStatus(service) {
    if (!service || (service.state && service.state !== 'active')) return { key:'standby', label:'연결대기' };
    const health = String(service.latest?.status || 'pending').toLowerCase();
    if (health === 'offline') return { key:'critical', label:'장애' };
    if (health === 'degraded') return { key:'attention', label:'주의' };
    const response = Number(service.latest?.responseTime ?? service.stats24h?.averageResponseTime ?? 0);
    if (response >= 1800) return { key:'attention', label:'주의' };
    if (health === 'online' || health === 'healthy' || health === 'ok' || service.state === 'active') return { key:'healthy', label:'정상' };
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

  function services() {
    return Array.isArray(latestOverview?.services) ? latestOverview.services : [];
  }

  function decisionItems() {
    return services()
      .map(service => ({ service, status:serviceStatus(service) }))
      .filter(({ service, status }) => status.key === 'critical' && CORE_DOMAINS.has(String(service.domain || '').toLowerCase()))
      .map(({ service, status }) => ({
        title:`${service.name || service.domain} 핵심 서비스 장애`,
        domain:service.domain || '',
        status:status.label,
        reason:'자동 복구 범위를 넘어 권한·DNS·데이터 변경이 필요할 경우 사람의 판단이 필요합니다.',
      }));
  }

  function issueItems() {
    return services()
      .map(service => ({ service, status:serviceStatus(service) }))
      .filter(({ status }) => ['critical','attention'].includes(status.key));
  }

  function renderMissionSummary() {
    const host = $('#missionSummary');
    if (!host) return;
    const all = services();
    const states = all.map(serviceStatus);
    const healthy = states.filter(item => item.key === 'healthy').length;
    const issues = issueItems();
    const decisions = decisionItems();
    const newest = all.reduce((max, service) => Math.max(max, checkedAt(service)), 0);
    host.innerHTML = `
      <article><small>ECOSYSTEM</small><strong>${healthy}/${all.length || '—'} 정상</strong><span>${issues.length ? `주의·장애 ${issues.length}` : '즉시 대응 이슈 없음'}</span></article>
      <article><small>DECISIONS</small><strong>${decisions.length}</strong><span>${decisions.length ? '사람 판단 후보' : '현재 대기 없음'}</span></article>
      <article><small>LAST SIGNAL</small><strong>${esc(relativeTime(newest))}</strong><span>Control API 최신 집계</span></article>
    `;
  }

  function renderDecisions() {
    const host = $('#missionDecisionList');
    if (!host) return;
    const items = decisionItems();
    if (!items.length) {
      host.innerHTML = '<div class="mission-empty"><strong>지금 대표 판단이 필요한 항목은 없습니다.</strong><span>저위험 점검과 가역 조치는 AI가 처리하고, 중요한 변경만 이곳으로 올립니다.</span></div>';
      return;
    }
    host.innerHTML = items.map(item => `
      <article class="mission-decision-card">
        <div><small>HUMAN GATE</small><strong>${esc(item.title)}</strong><span>${esc(item.domain)}</span></div>
        <p>${esc(item.reason)}</p>
        <button type="button" data-mission-decision="${esc(item.domain)}">Chief AI와 검토</button>
      </article>
    `).join('');
    host.querySelectorAll('[data-mission-decision]').forEach(button => button.addEventListener('click', () => {
      openToday();
      const domain = button.dataset.missionDecision || '';
      window.setTimeout(() => {
        const scope = $('#aiChiefChatScope');
        if (scope && [...scope.options].some(option => option.value === domain)) {
          scope.value = domain;
          scope.dispatchEvent(new Event('change', { bubbles:true }));
        }
        const input = $('#aiChiefChatInput');
        if (input) input.value = `${domain} 결정이 필요한 이유와 선택지를 정리해줘`;
        $('#aiChiefChatForm')?.requestSubmit();
      }, 100);
    }));
  }

  function renderTimeline() {
    const host = $('#missionTimeline');
    if (!host) return;
    const items = services()
      .map(service => ({ service, status:serviceStatus(service), time:checkedAt(service) }))
      .filter(item => item.time)
      .sort((a,b) => b.time - a.time)
      .slice(0,8);
    if (!items.length) {
      host.innerHTML = '<div class="mission-empty"><strong>아직 표시할 운영 신호가 없습니다.</strong><span>실측 데이터가 들어오면 최근 흐름을 시간순으로 보여줍니다.</span></div>';
      return;
    }
    host.innerHTML = items.map(({ service, status, time }) => `
      <button class="mission-time-row" type="button" data-mission-domain="${esc(service.domain || '')}">
        <span class="mission-time-dot ${esc(status.key)}"></span>
        <time>${esc(relativeTime(time))}</time>
        <strong>${esc(service.name || service.domain || 'Service')}</strong>
        <span>${esc(status.label)}</span>
      </button>
    `).join('');
    host.querySelectorAll('[data-mission-domain]').forEach(button => button.addEventListener('click', () => {
      const domain = button.dataset.missionDomain || '';
      const row = domain ? document.querySelector(`[data-ai-agent-domain="${CSS.escape(domain)}"]`) : null;
      row?.click();
    }));
  }

  function renderCrew() {
    const host = $('#missionAiCrew');
    if (!host) return;
    const issues = issueItems().length;
    host.innerHTML = AI_CREW.map(([name, role], index) => `
      <article><span class="mission-ai-orb">${index === 0 ? 'C' : name.slice(0,1)}</span><div><strong>${esc(name)}</strong><small>${esc(role)}</small></div><b>${index === 0 || issues ? 'READY' : 'STANDBY'}</b></article>
    `).join('');
  }

  function renderAll() {
    renderMissionSummary();
    renderDecisions();
    renderTimeline();
    renderCrew();
  }

  async function refreshOverview(force = false) {
    const response = await fetch(`${API}${force ? '/api/control/check' : '/api/control/overview'}`, {
      method: force ? 'POST' : 'GET',
      headers:headers(),
      cache:'no-store',
    });
    if (!response.ok) throw new Error(`Control API ${response.status}`);
    latestOverview = await response.json();
    renderAll();
  }

  function routeSection(section, fallback = '') {
    const nav = $('.sidebar nav');
    const target = nav?.querySelector(`[data-section="${section}"]`) || (fallback ? nav?.querySelector(`[data-section="${fallback}"]`) : null);
    target?.click();
  }

  function openToday(focus = '') {
    routeSection('aiops');
    document.body.dataset.missionFocus = focus || 'today';
    if (focus === 'ai') window.setTimeout(() => $('#missionAiCrew')?.scrollIntoView({ behavior:'smooth', block:'nearest' }), 80);
  }

  function installPrimaryNavigation() {
    const nav = $('.sidebar nav');
    if (!nav || nav.querySelector('.mission-primary-nav')) return false;
    const primary = document.createElement('div');
    primary.className = 'mission-primary-nav';
    primary.setAttribute('aria-label','Mission Control 주요 메뉴');
    for (const route of PRIMARY_ROUTES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav mission-primary-item';
      button.dataset.missionRoute = route.key;
      button.innerHTML = `<span class="mission-primary-icon">${esc(route.icon)}</span><span>${esc(route.label)}</span>`;
      button.addEventListener('click', event => {
        event.preventDefault();
        if (route.toggle) {
          document.body.classList.toggle('mission-more-open');
          button.classList.toggle('active', document.body.classList.contains('mission-more-open'));
          return;
        }
        document.body.classList.remove('mission-more-open');
        primary.querySelectorAll('.mission-primary-item').forEach(item => item.classList.toggle('active', item === button));
        if (route.section === 'aiops') openToday(route.focus || '');
        else routeSection(route.section, route.fallback || '');
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
    if (kicker) kicker.textContent = 'TODAY · EKODI MISSION CONTROL · AI OPS';
    if (title) title.textContent = 'Mission Control';
    if (copy) copy.textContent = '지금 상태, 지금 할 일, 지금 결정할 것만 먼저 보여줍니다. 세부 기능은 필요할 때 펼칩니다.';

    const dashboard = document.createElement('div');
    dashboard.className = 'mission-dashboard';
    dashboard.innerHTML = `
      <section class="mission-brief">
        <div class="mission-section-head"><div><small>TODAY BRIEF</small><h3>오늘의 상황</h3></div><button type="button" id="missionRefresh">↻</button></div>
        <div class="mission-summary" id="missionSummary"></div>
      </section>
      <section class="mission-decisions">
        <div class="mission-section-head"><div><small>DECISION INBOX</small><h3>내가 결정할 것</h3></div><button type="button" id="missionDecisionChat">Chief AI</button></div>
        <div id="missionDecisionList"></div>
      </section>
      <section class="mission-timeline-block">
        <div class="mission-section-head"><div><small>TIME MACHINE</small><h3>최근 흐름</h3></div><span>실측 신호</span></div>
        <div class="mission-timeline" id="missionTimeline"></div>
      </section>
      <section class="mission-crew-block">
        <div class="mission-section-head"><div><small>AI CREW</small><h3>전문 AI</h3></div><button type="button" id="missionOpenAi">AI Ops</button></div>
        <div class="mission-ai-crew" id="missionAiCrew"></div>
      </section>
    `;
    observe.prepend(dashboard);

    panel.querySelector('.ai-fleet-block')?.classList.add('mission-ecosystem-rail');
    const fleetSmall = panel.querySelector('.ai-fleet-head small');
    const fleetTitle = panel.querySelector('.ai-fleet-head h3');
    if (fleetSmall) fleetSmall.textContent = 'LIVE ECOSYSTEM';
    if (fleetTitle) fleetTitle.textContent = '전체 사이트';

    $('#missionRefresh')?.addEventListener('click', async () => {
      const button = $('#missionRefresh');
      if (button) button.disabled = true;
      try { await refreshOverview(true); $('#aiOpsRefresh')?.click(); }
      catch (error) { console.warn('Mission Control refresh failed', error); }
      finally { if (button) button.disabled = false; }
    });
    $('#missionDecisionChat')?.addEventListener('click', () => {
      const input = $('#aiChiefChatInput');
      if (input) input.value = '결정 대기사항만 우선순위로 정리해줘';
      $('#aiChiefChatForm')?.requestSubmit();
    });
    $('#missionOpenAi')?.addEventListener('click', () => openToday('ai'));
    return true;
  }

  function syncPageTitle() {
    const panel = $('#aiOpsPanel');
    if (!panel || panel.classList.contains('hidden-panel')) return;
    const title = $('#pageTitle');
    if (title) title.textContent = document.body.dataset.missionFocus === 'ai' ? 'AI' : 'Today';
  }

  function markSecondaryNavigation() {
    const nav = $('.sidebar nav');
    if (!nav) return;
    [...nav.children].forEach(child => {
      if (!child.classList?.contains('mission-primary-nav')) child.classList?.add('mission-secondary-nav');
    });
  }

  function maybeStartToday() {
    if (sessionStorage.getItem(START_KEY) === 'true') return;
    sessionStorage.setItem(START_KEY,'true');
    window.setTimeout(() => openToday(), 40);
  }

  function init() {
    document.body.classList.add('mission-control-admin');
    const ready = () => {
      const primaryReady = installPrimaryNavigation() || Boolean($('.mission-primary-nav'));
      const surfaceReady = installMissionSurface() || Boolean($('#aiOpsPanel')?.dataset.missionControlReady);
      markSecondaryNavigation();
      if (!primaryReady || !surfaceReady) return false;
      refreshOverview(false).catch(error => console.warn('Mission Control overview unavailable', error));
      window.clearInterval(refreshTimer);
      refreshTimer = window.setInterval(() => refreshOverview(false).catch(() => {}), 30_000);
      maybeStartToday();
      syncPageTitle();
      return true;
    };

    if (!ready()) {
      const observer = new MutationObserver(() => {
        markSecondaryNavigation();
        if (ready()) observer.disconnect();
      });
      observer.observe(document.documentElement,{ childList:true, subtree:true });
    }

    document.addEventListener('click', event => window.setTimeout(syncPageTitle, 0), true);
    window.addEventListener('hashchange', syncPageTitle);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();