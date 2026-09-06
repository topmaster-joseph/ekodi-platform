(() => {
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const SECTION = 'aiops';
  const REVIEW_STALE_MS = 30 * 60 * 1000;

  const SITE_AGENTS = [
    { domain:'ekodi.kr', name:'EKODI Home', group:'Core & Access', role:'생태계 정문·서비스 레지스트리', manage:'services', critical:true },
    { domain:'admin.ekodi.kr', name:'Control Center', group:'Core & Access', role:'통합운영·권한·감사', manage:'admins', critical:true },
    { domain:'auth.ekodi.kr', name:'EKODI Auth', group:'Core & Access', role:'통합인증·계정·SSO', manage:'admins', critical:true },
    { domain:'church.ekodi.kr', name:'에코디교회', group:'Community', role:'예배·사역·공동체 운영', manage:'services' },
    { domain:'community.ekodi.kr', name:'커뮤니티', group:'Community', role:'관계·그룹·참여·소통', manage:'community' },
    { domain:'social.ekodi.kr', name:'에코디 소셜', group:'Community', role:'소셜채널·미디어 연동', manage:'social' },
    { domain:'biz.ekodi.kr', name:'에코디비즈', group:'Business & Commerce', role:'사업·고객·서비스 운영', manage:'organization' },
    { domain:'mall.ekodi.kr', name:'에코디몰', group:'Business & Commerce', role:'상품·판매·셀러 운영', manage:'services' },
    { domain:'marketing.ekodi.kr', name:'마케팅 AI', group:'Business & Commerce', role:'마케팅·자동화·Workspace', manage:'services' },
    { domain:'trade.ekodi.kr', name:'에코디 트레이딩', group:'Business & Commerce', role:'무역·견적·계약·거래', manage:'organization' },
    { domain:'pay.ekodi.kr', name:'에코디 페이', group:'Business & Commerce', role:'결제·정산·귀속', manage:'finance', critical:true },
    { domain:'books.ekodi.kr', name:'에코디서점', group:'Knowledge & Content', role:'출판·배포·인세·콘텐츠', manage:'books' },
    { domain:'lab.ekodi.kr', name:'에코디연구소', group:'Knowledge & Content', role:'연구·교육·프로젝트', manage:'services' },
    { domain:'mail.ekodi.kr', name:'에코디 메일', group:'Communication & Cloud', role:'메일 허브·조직 연결', manage:'communication' },
    { domain:'live.ekodi.kr', name:'에코디 라이브', group:'Communication & Cloud', role:'라이브·방송·송출', manage:'communication' },
    { domain:'cloud.ekodi.kr', name:'에코디 클라우드', group:'Communication & Cloud', role:'파일·문서·협업 자료', manage:'workspace' },
    { domain:'cgma.ekodi.kr', name:'청계면상인회', group:'Client Sites', role:'상권·회원·고객 운영', manage:'clients' },
    { domain:'jadam.ekodi.kr', name:'자담치킨 목포대점', group:'Client Sites', role:'점포·CRM·마케팅 운영', manage:'clients' },
    { domain:'pizzamaru.ekodi.kr', name:'피자마루 목포대점', group:'Client Sites', role:'점포·CRM·마케팅 운영', manage:'clients' },
    { domain:'yogurt.ekodi.kr', name:'요거트퍼플 목포대점', group:'Client Sites', role:'점포·CRM·마케팅 운영', manage:'clients' },
  ];

  const COUNCIL = [
    { key:'chief', name:'Chief AI', role:'생태계 전체 우선순위·조정·대표 보고' },
    { key:'platform', name:'Platform AI', role:'API·DB·Cloud·공통 인프라' },
    { key:'security', name:'Security AI', role:'인증·권한·비밀정보·보안정책' },
    { key:'release', name:'Release AI', role:'Staging·CI·배포·롤백 검증' },
    { key:'finance', name:'Finance AI', role:'결제·회계·비용·정산 영향 검토' },
  ];

  const DECISION_RULES = [
    '가격·요금제·결제정책 변경',
    '관리자 권한 또는 개인정보 정책 변경',
    '데이터 삭제·대량 변경·파괴적 DB 변경',
    '도메인 이전·핵심 DNS·서비스 종료',
    '외부 비용·계약·법적 책임이 발생하는 실행',
  ];

  let overview = null;
  let evolution = null;
  let lastReviewAt = null;
  let selectedDomain = '';
  let fleetQuery = '';
  let fleetFilter = 'all';

  const $ = selector => document.querySelector(selector);
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function nav() { return $('.sidebar nav'); }
  function panel() { return $('#aiOpsPanel'); }

  function authHeaders() {
    const current = token();
    return current ? { authorization:`Bearer ${current}` } : {};
  }

  async function loadOverview(force = false) {
    const path = force ? '/api/control/check' : '/api/control/overview';
    const response = await fetch(`${API}${path}`, {
      method: force ? 'POST' : 'GET',
      headers:authHeaders(),
      cache:'no-store',
    });
    if (!response.ok) throw new Error(`운영 API ${response.status}`);
    overview = await response.json();
    lastReviewAt = new Date();
    return overview;
  }

  async function loadEvolution(force = false) {
    const path = force ? '/api/control/evolution/check' : '/api/control/evolution';
    try {
      const response = await fetch(`${API}${path}`, {
        method: force ? 'POST' : 'GET',
        headers:authHeaders(),
        cache:'no-store',
      });
      if (!response.ok) throw new Error(`Evolution API ${response.status}`);
      evolution = await response.json();
      return evolution;
    } catch (error) {
      evolution = { error:String(error?.message || 'Evolution Intelligence 연결 실패') };
      console.warn('EKODI Evolution Intelligence unavailable', error);
      return null;
    }
  }

  function serviceMap() {
    const map = new Map();
    for (const service of overview?.services || []) {
      if (service?.domain) map.set(String(service.domain).toLowerCase(), service);
    }
    return map;
  }

  function agentState(agent, map = serviceMap()) {
    const service = map.get(agent.domain);
    if (!service) return { key:'standby', label:'연결대기', note:'Control API 상태점검 연결 대기', response:null, service:null };
    if (service.state && service.state !== 'active') return { key:'standby', label:'점검중', note:'운영상태 확인 필요', response:service.latest?.responseTime ?? null, service };
    const health = service.latest?.status || 'pending';
    if (health === 'offline') return { key:'critical', label:'장애', note:service.latest?.error || '서비스 응답 없음', response:service.latest?.responseTime ?? null, service };
    if (health === 'degraded') return { key:'attention', label:'주의', note:service.latest?.error || '응답 지연 또는 부분 장애', response:service.latest?.responseTime ?? null, service };
    const response = Number(service.latest?.responseTime ?? service.stats24h?.averageResponseTime ?? 0);
    if (response >= 1800) return { key:'attention', label:'주의', note:`응답 지연 ${response}ms`, response, service };
    return { key:'healthy', label:'정상', note:response ? `${response}ms` : '정상 응답', response, service };
  }

  function monitorFreshness() {
    const raw = overview?.generatedAt;
    if (!raw) return { stale:true, age:null };
    const time = new Date(raw).getTime();
    if (!Number.isFinite(time)) return { stale:true, age:null };
    const age = Date.now() - time;
    return { stale:age > REVIEW_STALE_MS, age };
  }

  function buildCases() {
    const map = serviceMap();
    const cases = [];
    for (const agent of SITE_AGENTS) {
      const state = agentState(agent, map);
      if (state.key === 'critical') {
        cases.push({
          level:agent.critical ? 'DECISION' : 'REPORT',
          domain:agent.domain,
          title:`${agent.name} 응답 장애`,
          owner:`${agent.name} Site AI`,
          consult:agent.critical ? 'Chief AI · Security AI · Release AI' : 'Chief AI · Platform AI · Release AI',
          action:agent.critical ? '자동 복구 범위를 넘으면 대표 승인 요청' : '자동 진단·복구 후 결과 보고',
        });
      } else if (state.key === 'attention') {
        cases.push({ level:'REPORT', domain:agent.domain, title:`${agent.name} 상태 관찰`, owner:`${agent.name} Site AI`, consult:'Platform AI', action:'추세 확인 후 필요 시 진단' });
      }
    }
    const freshness = monitorFreshness();
    if (freshness.stale) cases.unshift({ level:'REPORT', domain:'platform', title:'운영 집계 최신성 확인 필요', owner:'Platform AI', consult:'Chief AI', action:'상태점검을 다시 실행해 최신값으로 갱신' });
    return cases;
  }

  function summary() {
    const map = serviceMap();
    const states = SITE_AGENTS.map(agent => agentState(agent, map));
    const healthy = states.filter(state => state.key === 'healthy').length;
    const warning = states.filter(state => state.key === 'attention').length;
    const down = states.filter(state => state.key === 'critical').length;
    const configured = states.filter(state => state.key === 'standby').length;
    const cases = buildCases();
    return {
      total:SITE_AGENTS.length,
      healthy,
      warning,
      down,
      configured,
      cases,
      decisions:cases.filter(item => item.level === 'DECISION').length,
    };
  }

  function showSection(domain = '') {
    if (domain) selectedDomain = domain;
    document.querySelectorAll('[data-panel]').forEach(node => {
      const targets = String(node.dataset.panel || '').split(' ');
      node.classList.toggle('hidden-panel', !targets.includes(SECTION));
    });
    document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === SECTION));
    const title = $('#pageTitle');
    if (title) title.textContent = 'AI Ops';
    $('.sidebar')?.classList.remove('open');
    if (location.hash !== '#ai-ops') history.replaceState(null, '', '#ai-ops');
    render();
    if (selectedDomain) requestAnimationFrame(() => focusFleetRow(selectedDomain));
  }

  function installNav() {
    const root = nav();
    if (!root) return false;
    let button = root.querySelector('[data-section="aiops"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav ai-ops-nav';
      button.dataset.section = SECTION;
      button.innerHTML = '<span class="ai-ops-nav-icon">✦</span><span>AI Ops</span>';
      const campus = root.querySelector('[data-section="campus"]');
      if (campus?.nextSibling) root.insertBefore(button, campus.nextSibling);
      else root.prepend(button);
    }
    if (button.dataset.aiOpsBound !== 'true') {
      button.dataset.aiOpsBound = 'true';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); showSection(); });
    }
    return true;
  }

  function installPanel() {
    if (panel()) return true;
    const content = $('.content');
    if (!content) return false;
    const section = document.createElement('section');
    section.id = 'aiOpsPanel';
    section.className = 'section ai-ops-panel hidden-panel';
    section.dataset.panel = SECTION;
    section.innerHTML = `
      <div class="ai-ops-head">
        <div class="ai-ops-title"><p class="kicker">EKODI DIGITAL CAMPUS · AI OPERATIONS</p><h2>AI Ops</h2><p>사이트 상태를 보면서 Chief AI와 바로 대화하고, 저위험 조치는 자동 처리하며 중요한 변경만 Decision Gate로 올립니다.</p></div>
        <div class="ai-ops-head-actions"><span class="ai-ops-auto">30초 자동 갱신</span><button class="secondary" id="aiOpsRefresh" type="button">↻ 전체 점검</button><button class="primary" id="aiOpsDecisions" type="button">Decision Gate · <span id="aiOpsDecisionCompact">0</span></button></div>
      </div>
      <div class="ai-ops-metrics" id="aiOpsMetrics"></div>
      <div class="ai-ops-main">
        <section class="ai-ops-block ai-evolution-block" aria-live="polite">
          <div class="ai-evolution-head"><div><small>EVOLUTION INTELLIGENCE</small><h3>플랫폼 진화 제안</h3></div><span id="aiEvolutionMeta">검증된 근거 기반 분석</span></div>
          <div class="ai-evolution-cards" id="aiEvolutionCards"></div>
        </section>
        <div class="ai-ops-observe">
          <section class="ai-ops-block ai-fleet-block">
            <div class="ai-block-head ai-fleet-head"><div><small>SITE FLEET</small><h3>사이트 상태</h3></div><div class="ai-fleet-tools"><input id="aiFleetSearch" type="search" autocomplete="off" placeholder="사이트·도메인 검색" aria-label="사이트 검색"><select id="aiFleetFilter" aria-label="상태 필터"><option value="all">전체 상태</option><option value="needs-attention">주의·장애</option><option value="healthy">정상</option><option value="standby">연결대기</option></select></div></div>
            <div class="ai-fleet-scroll" id="aiFleetScroll"><table class="ai-fleet-table"><thead><tr><th>Site</th><th>Status</th><th>Response</th><th>담당 AI</th><th>Last Check</th><th>Issue</th></tr></thead><tbody id="aiFleetRows"></tbody></table></div>
          </section>
          <section class="ai-ops-block ai-selected-detail" id="aiSelectedDetail" aria-live="polite"></section>
        </div>
      </div>
      <aside class="ai-ops-side" aria-hidden="true"></aside>
    `;
    content.prepend(section);

    $('#aiOpsRefresh')?.addEventListener('click', runReview);
    $('#aiOpsDecisions')?.addEventListener('click', () => promptChat('결정 대기사항 보여줘'));
    $('#aiFleetSearch')?.addEventListener('input', event => { fleetQuery = String(event.target.value || '').trim().toLowerCase(); renderFleet(); });
    $('#aiFleetFilter')?.addEventListener('change', event => { fleetFilter = event.target.value || 'all'; renderFleet(); });
    return true;
  }

  function metric(label, value, note, tone = '') {
    return `<article class="${tone}"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></article>`;
  }

  function renderMetrics(data) {
    const host = $('#aiOpsMetrics');
    if (!host) return;
    host.innerHTML = [
      metric('전체 사이트', `${data.total}`, 'Site AI'),
      metric('정상', `${data.healthy}`, '실시간 정상', data.healthy ? 'good' : ''),
      metric('주의', `${data.warning}`, '지연·부분 이슈', data.warning ? 'warn' : ''),
      metric('장애', `${data.down}`, '즉시 확인', data.down ? 'danger' : 'good'),
      metric('연결대기', `${data.configured}`, '상태점검 연결', data.configured ? 'muted' : 'good'),
      metric('결정', `${data.decisions}`, data.decisions ? '대표 판단 대기' : '승인 요청 없음', data.decisions ? 'danger' : 'good'),
    ].join('');
    const compact = $('#aiOpsDecisionCompact');
    if (compact) compact.textContent = String(data.decisions);
    panel()?.setAttribute('data-decision-count', String(data.decisions));
  }

  function evolutionRecommendations() {
    const items = evolution?.recommendations || evolution?.live?.recommendations || [];
    return [...items].filter(item => item?.publishable !== false).sort((left, right) => Number(right?.score || 0) - Number(left?.score || 0));
  }

  function evidenceLinks(item) {
    const sources = (item?.references || []).filter(source => source?.url).slice(0, 2);
    if (!sources.length) return '<span class="ai-evidence-missing">근거 링크 보강 필요</span>';
    return sources.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener" title="${esc(source.title || source.url)}">근거 ↗</a>`).join('');
  }

  function renderEvolution() {
    const host = $('#aiEvolutionCards');
    const meta = $('#aiEvolutionMeta');
    if (!host) return;
    if (evolution?.error) {
      host.innerHTML = `<div class="ai-evolution-empty">진화 분석 연결 대기 · ${esc(evolution.error)}</div>`;
      if (meta) meta.textContent = '기존 AI Ops는 정상 동작';
      return;
    }
    const items = evolutionRecommendations();
    const approvals = items.filter(item => item?.approval?.required).length;
    if (meta) meta.textContent = `${items.length}개 제안 · 승인 필요 ${approvals} · ${evolution?.store?.lastSeenAt ? '근거원장 저장됨' : '실시간 분석'}`;
    if (!items.length) {
      host.innerHTML = '<div class="ai-evolution-empty">현재 우선 개선 제안 없음 · 운영지표와 기술 변화를 계속 관찰합니다.</div>';
      return;
    }
    host.innerHTML = items.slice(0, 3).map(item => {
      const tone = item?.approval?.required ? 'gate' : Number(item?.score || 0) >= 85 ? 'high' : 'normal';
      return `<article class="ai-evolution-card ${tone}">
        <div class="ai-evolution-card-top"><strong>${esc(item.title)}</strong><b>${esc(Math.round(Number(item.score || 0)))}점</b></div>
        <p>${esc(item.summary || item.reason || '검증된 운영·기술 근거를 기반으로 제안')}</p>
        <div class="ai-evolution-card-foot"><span>근거 ${esc(item.evidenceGrade || 'C')} · 신뢰 ${esc(Math.round(Number(item.confidence || 0)))}%</span><span class="ai-evidence-links">${evidenceLinks(item)}</span></div>
      </article>`;
    }).join('');
  }

  function severity(state) {
    return ({ critical:0, attention:1, healthy:2, standby:3 })[state.key] ?? 4;
  }

  function lastCheck(service) {
    const raw = service?.latest?.checkedAt || service?.latest?.checked_at || service?.lastCheckedAt || service?.updatedAt || overview?.generatedAt;
    if (!raw) return '—';
    const time = new Date(raw).getTime();
    if (!Number.isFinite(time)) return '—';
    const diff = Math.max(0, Date.now() - time);
    if (diff < 60_000) return '방금 전';
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}분 전`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
    return new Date(time).toLocaleDateString('ko-KR');
  }

  function responseText(state) {
    const value = Number(state.response || 0);
    if (state.key === 'critical' && !value) return 'Timeout';
    return value ? `${value} ms` : '—';
  }

  function issueText(state) {
    if (state.key === 'healthy') return '—';
    const text = String(state.note || '확인 필요');
    return text.length > 64 ? `${text.slice(0, 61)}…` : text;
  }

  function filteredAgents() {
    const map = serviceMap();
    return SITE_AGENTS
      .map(agent => ({ agent, state:agentState(agent, map) }))
      .filter(({ agent, state }) => {
        if (fleetFilter === 'needs-attention' && !['critical','attention'].includes(state.key)) return false;
        if (fleetFilter === 'healthy' && state.key !== 'healthy') return false;
        if (fleetFilter === 'standby' && state.key !== 'standby') return false;
        if (!fleetQuery) return true;
        const haystack = `${agent.name} ${agent.domain} ${agent.group} ${agent.role}`.toLowerCase();
        return haystack.includes(fleetQuery);
      })
      .sort((a, b) => severity(a.state) - severity(b.state) || a.agent.domain.localeCompare(b.agent.domain));
  }

  function fleetRow(agent, state) {
    const tr = document.createElement('tr');
    tr.className = `ai-fleet-row ${state.key}${selectedDomain === agent.domain ? ' selected' : ''}`;
    tr.dataset.aiAgentDomain = agent.domain;
    tr.tabIndex = 0;
    tr.innerHTML = `
      <td><span class="ai-fleet-site"><span class="ai-state-dot"></span><span><strong>${esc(agent.name)}</strong><small>${esc(agent.domain)} · ${esc(agent.group)}</small></span></span></td>
      <td><span class="ai-status-pill ${esc(state.key)}">${esc(state.label)}</span></td>
      <td class="ai-fleet-response">${esc(responseText(state))}</td>
      <td><span class="ai-owner">${esc(agent.name)} AI</span></td>
      <td>${esc(lastCheck(state.service))}</td>
      <td class="ai-fleet-issue">${esc(issueText(state))}</td>
    `;
    tr.addEventListener('click', () => openSite(agent.domain));
    tr.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSite(agent.domain); } });
    return tr;
  }

  function renderFleet() {
    const host = $('#aiFleetRows');
    if (!host) return;
    const items = filteredAgents();
    host.replaceChildren();
    if (!items.length) {
      const tr = document.createElement('tr');
      tr.className = 'ai-fleet-empty';
      tr.innerHTML = '<td colspan="6">조건에 맞는 사이트가 없습니다.</td>';
      host.append(tr);
      return;
    }
    items.forEach(({ agent, state }) => host.append(fleetRow(agent, state)));
  }

  function detailActions(agent) {
    return `<div class="ai-detail-actions"><button class="secondary" type="button" id="aiSelectedManage">Manage</button><a class="primary" href="https://${esc(agent.domain)}" target="_blank" rel="noopener">Open ↗</a></div>`;
  }

  function aiActionText(agent, state) {
    if (state.key === 'critical') return agent.critical
      ? '진단·가역 복구는 자동 진행. 권한·DNS·데이터 파괴 변경은 Decision Gate 승인 후 실행합니다.'
      : 'Site AI가 원인 진단과 가역 복구를 우선 진행하고 Chief AI에 결과를 보고합니다.';
    if (state.key === 'attention') return '응답 추세와 공통 인프라를 재확인하고 필요 시 Platform·Release AI 교차검토로 전환합니다.';
    if (state.key === 'standby') return 'Control API 상태점검 레지스트리 연결 여부를 확인합니다. 연결 전에는 상태를 추정하지 않습니다.';
    return '현재 자동 감시를 유지합니다. 불필요한 변경은 실행하지 않습니다.';
  }

  function renderSelectedDetail() {
    const host = $('#aiSelectedDetail');
    if (!host) return;
    const map = serviceMap();
    let agent = SITE_AGENTS.find(item => item.domain === selectedDomain);
    if (!agent) {
      const firstIssue = SITE_AGENTS.map(item => ({ item, state:agentState(item, map) })).sort((a, b) => severity(a.state) - severity(b.state))[0];
      agent = firstIssue?.item || SITE_AGENTS[0];
      selectedDomain = agent?.domain || '';
    }
    if (!agent) return;
    const state = agentState(agent, map);
    const service = state.service;
    const availability = service?.stats24h?.availabilityPercent;
    const average = service?.stats24h?.averageResponseTime;
    host.innerHTML = `
      <div class="ai-detail-head"><div><small>SELECTED SITE DETAIL</small><h3>${esc(agent.name)} <span>${esc(agent.domain)}</span></h3></div><div class="ai-detail-head-right"><span class="ai-status-pill ${esc(state.key)}">${esc(state.label)}</span>${detailActions(agent)}</div></div>
      <div class="ai-detail-grid">
        <div><small>이슈 요약</small><strong>${esc(state.note)}</strong><span>${esc(agent.role)}</span></div>
        <div><small>실측 상태</small><strong>${esc(responseText(state))} · ${esc(lastCheck(service))}</strong><span>24시간 가용률 ${availability ?? '—'}% · 평균응답 ${average ?? '—'}${average == null ? '' : 'ms'}</span></div>
        <div><small>AI 조치 요약</small><strong>${esc(`${agent.name} Site AI`)}</strong><span>${esc(aiActionText(agent, state))}</span></div>
      </div>
    `;
    $('#aiSelectedManage')?.addEventListener('click', () => openManage(agent));
  }

  function syncChatScope(domain) {
    const select = $('#aiChiefChatScope');
    if (!select || !Array.from(select.options).some(option => option.value === domain)) return;
    if (select.value === domain) return;
    select.value = domain;
    select.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function promptChat(text) {
    const attempt = () => {
      const input = $('#aiChiefChatInput');
      const form = $('#aiChiefChatForm');
      if (!input || !form) return false;
      input.value = text;
      form.requestSubmit();
      return true;
    };
    if (!attempt()) setTimeout(attempt, 450);
  }

  function focusFleetRow(domain) {
    const row = document.querySelector(`[data-ai-agent-domain="${CSS.escape(domain)}"]`);
    if (!row) return;
    row.classList.add('focused');
    row.scrollIntoView({ behavior:'smooth', block:'nearest' });
    setTimeout(() => row.classList.remove('focused'), 1600);
  }

  function openSite(domain) {
    const agent = SITE_AGENTS.find(item => item.domain === domain);
    if (!agent) return;
    selectedDomain = domain;
    renderFleet();
    renderSelectedDetail();
    syncChatScope(domain);
    requestAnimationFrame(() => focusFleetRow(domain));
  }

  function openManage(agent) {
    const campusItem = document.querySelector(`.campus-site-item[data-site-domain="${CSS.escape(agent.domain)}"]`);
    const manage = campusItem?.querySelector('[data-campus-action="manage"]');
    if (manage) { manage.click(); return; }
    const control = document.querySelector(`.sidebar [data-section="${agent.manage}"], .sidebar [data-lazy-section="${agent.manage}"]`);
    control?.click();
  }

  function attachCampusAiButtons() {
    document.querySelectorAll('.campus-site-item').forEach(item => {
      if (item.querySelector('[data-ai-site-open]')) return;
      const domain = item.dataset.siteDomain || '';
      if (!SITE_AGENTS.some(agent => agent.domain === domain)) return;
      const actions = item.querySelector('.campus-row-actions');
      if (!actions) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary campus-row-action campus-ai-action';
      button.dataset.aiSiteOpen = domain;
      button.textContent = 'AI';
      button.setAttribute('aria-label', `${domain} Site AI 열기`);
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); showSection(domain); openSite(domain); });
      const open = actions.querySelector('a');
      actions.insertBefore(button, open || null);
    });
  }

  function render(error = '') {
    if (!panel()) return;
    const data = summary();
    data.decisions += evolutionRecommendations().filter(item => item?.approval?.required).length;
    renderMetrics(data);
    renderEvolution();
    renderFleet();
    renderSelectedDetail();
    const button = $('#aiOpsRefresh');
    if (button && lastReviewAt) button.title = `최근 점검 ${lastReviewAt.toLocaleString('ko-KR')}`;
    const auto = $('.ai-ops-auto');
    if (auto) auto.textContent = error ? `점검 오류 · ${error}` : lastReviewAt ? `최근 ${lastReviewAt.toLocaleTimeString('ko-KR',{ hour:'2-digit', minute:'2-digit' })}` : '30초 자동 갱신';
  }

  async function runReview() {
    const button = $('#aiOpsRefresh');
    if (button) { button.disabled = true; button.textContent = '↻ 점검 중…'; }
    try {
      await loadOverview(true);
      await loadEvolution(false);
      render();
    } catch (error) {
      render(error.message || '상태점검 실패');
    } finally {
      if (button) { button.disabled = false; button.textContent = '↻ 전체 점검'; }
    }
  }

  async function initialData() {
    try {
      await Promise.all([loadOverview(false), loadEvolution(false)]);
      render();
    } catch (error) {
      console.warn('EKODI AI Ops overview unavailable', error);
      render(error.message || '운영 API 연결 실패');
    }
  }

  function init() {
    if (!installNav() || !installPanel()) {
      const root = document.body;
      const observer = new MutationObserver(() => {
        if (installNav() && installPanel()) {
          observer.disconnect();
          attachCampusAiButtons();
          initialData();
          if (location.hash === '#ai-ops') showSection();
        }
      });
      observer.observe(root, { childList:true, subtree:true });
      return;
    }
    attachCampusAiButtons();
    const campus = $('#campusPanel');
    if (campus) new MutationObserver(attachCampusAiButtons).observe(campus, { childList:true, subtree:true });
    initialData();
    if (location.hash === '#ai-ops') showSection();
    window.addEventListener('hashchange', () => { if (location.hash === '#ai-ops') showSection(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();