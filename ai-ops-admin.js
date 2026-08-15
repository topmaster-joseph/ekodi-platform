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
    { domain:'community.ekodi.kr', name:'에코디커뮤니티', group:'Community', role:'관계·그룹·참여·소통', manage:'community' },
    { domain:'social.ekodi.kr', name:'EKODI Social', group:'Community', role:'소셜채널·미디어 연동', manage:'social' },
    { domain:'biz.ekodi.kr', name:'에코디비즈', group:'Business & Commerce', role:'사업·고객·서비스 운영', manage:'organization' },
    { domain:'mall.ekodi.kr', name:'에코디몰', group:'Business & Commerce', role:'상품·판매·셀러 운영', manage:'services' },
    { domain:'marketing.ekodi.kr', name:'Marketing AI', group:'Business & Commerce', role:'마케팅·자동화·Workspace', manage:'services' },
    { domain:'trade.ekodi.kr', name:'EKODI Trading', group:'Business & Commerce', role:'무역·견적·계약·거래', manage:'organization' },
    { domain:'pay.ekodi.kr', name:'EKODI Pay', group:'Business & Commerce', role:'결제·정산·귀속', manage:'finance', critical:true },
    { domain:'books.ekodi.kr', name:'에코디북스', group:'Knowledge & Content', role:'출판·배포·인세·콘텐츠', manage:'books' },
    { domain:'lab.ekodi.kr', name:'에코디연구소', group:'Knowledge & Content', role:'연구·교육·프로젝트', manage:'services' },
    { domain:'mail.ekodi.kr', name:'EKODI Mail', group:'Communication & Cloud', role:'메일 허브·조직 연결', manage:'communication' },
    { domain:'live.ekodi.kr', name:'EKODI Live', group:'Communication & Cloud', role:'라이브·방송·송출', manage:'communication' },
    { domain:'cloud.ekodi.kr', name:'EKODI Cloud', group:'Communication & Cloud', role:'파일·문서·협업 자료', manage:'workspace' },
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
  let lastReviewAt = null;
  let selectedDomain = '';

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
      headers: authHeaders(),
      cache:'no-store',
    });
    if (!response.ok) throw new Error(`운영 API ${response.status}`);
    overview = await response.json();
    lastReviewAt = new Date();
    return overview;
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
    if (!service) return { key:'standby', label:'Configured', note:'상태점검 연결 대기', response:null, service:null };
    if (service.state && service.state !== 'active') return { key:'standby', label:String(service.state).toUpperCase(), note:'운영상태 확인 필요', response:service.latest?.responseTime ?? null, service };
    const health = service.latest?.status || 'pending';
    if (health === 'offline') return { key:'critical', label:'Offline', note:service.latest?.error || '서비스 응답 없음', response:service.latest?.responseTime ?? null, service };
    if (health === 'degraded') return { key:'attention', label:'Degraded', note:'응답 지연 또는 부분 장애', response:service.latest?.responseTime ?? null, service };
    const response = Number(service.latest?.responseTime ?? service.stats24h?.averageResponseTime ?? 0);
    if (response >= 1800) return { key:'attention', label:'Watch', note:`응답 ${response}ms`, response, service };
    return { key:'healthy', label:'Healthy', note:response ? `${response}ms` : '정상', response, service };
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
    const attention = states.filter(state => ['attention','critical'].includes(state.key)).length;
    const configured = states.filter(state => state.key === 'standby').length;
    const cases = buildCases();
    return {
      total:SITE_AGENTS.length,
      healthy,
      attention,
      configured,
      cases,
      decisions:cases.filter(item => item.level === 'DECISION').length,
    };
  }

  function showSection(domain = '') {
    selectedDomain = domain || selectedDomain;
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
    if (selectedDomain) requestAnimationFrame(() => focusAgent(selectedDomain));
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
        <div><p class="kicker">AI OPERATIONS COUNCIL</p><h2>EKODI Chief AI Control</h2><p>각 Site AI가 자기 영역을 감시하고, 공통 이슈는 Council에서 교차검토합니다. 되돌릴 수 없는 결정만 대표에게 올립니다.</p></div>
        <div class="ai-ops-head-actions"><button class="secondary" id="aiOpsRefresh" type="button">↻ Council Review</button><button class="primary" id="aiOpsDecisions" type="button">Decision Gate</button></div>
      </div>
      <div class="ai-ops-metrics" id="aiOpsMetrics"></div>
      <div class="ai-chief-card">
        <div class="ai-chief-identity"><span class="ai-avatar">AI</span><div><small>ECOSYSTEM ORCHESTRATOR</small><strong>Chief AI</strong><p id="aiChiefBrief">운영 상태를 읽는 중입니다.</p></div></div>
        <div class="ai-chief-mode"><small>AUTONOMY</small><strong>Guarded Auto</strong><span>저위험 자동 · 중요결정 승인</span></div>
      </div>
      <div class="ai-ops-columns">
        <div class="ai-ops-main">
          <section class="ai-ops-block" id="aiCouncilBlock"><div class="ai-block-head"><div><small>COUNCIL CASES</small><h3>AI Council</h3></div><span id="aiCouncilCount" class="ai-count">0</span></div><div id="aiCouncilCases" class="ai-case-list"></div></section>
          <section class="ai-ops-block"><div class="ai-block-head"><div><small>SITE ADMIN AGENTS</small><h3>Site AI · ${SITE_AGENTS.length}</h3></div><span class="ai-muted">Manage와 AI를 분리해 운영</span></div><div id="aiSiteAgents" class="ai-site-grid"></div></section>
        </div>
        <aside class="ai-ops-side">
          <section class="ai-ops-block ai-decision-block" id="aiDecisionBlock"><div class="ai-block-head"><div><small>HUMAN GATE</small><h3>Decision Gate</h3></div><span id="aiDecisionCount" class="ai-count danger">0</span></div><div id="aiDecisionQueue"></div></section>
          <section class="ai-ops-block"><div class="ai-block-head"><div><small>SPECIALIST COUNCIL</small><h3>Core Agents</h3></div></div><div class="ai-specialists">${COUNCIL.map(agent => `<div><strong>${esc(agent.name)}</strong><span>${esc(agent.role)}</span></div>`).join('')}</div></section>
          <section class="ai-ops-block"><div class="ai-block-head"><div><small>AI CONSTITUTION</small><h3>권한 경계</h3></div></div><div class="ai-policy-tiers"><div><b>INFO</b><span>비파괴 점검·정리·기록은 자동</span></div><div><b>REPORT</b><span>복구·롤백 후 결과 보고</span></div><div><b>DECISION</b><span>되돌리기 어렵거나 비용·권한 영향은 승인</span></div></div><button class="ai-policy-link" type="button" id="aiOpenPolicies">전체 Policies 보기 →</button></section>
        </aside>
      </div>
      <div class="ai-site-drawer" id="aiSiteDrawer" hidden></div>
    `;
    content.prepend(section);
    $('#aiOpsRefresh')?.addEventListener('click', runReview);
    $('#aiOpsDecisions')?.addEventListener('click', () => $('#aiDecisionBlock')?.scrollIntoView({ behavior:'smooth', block:'center' }));
    $('#aiOpenPolicies')?.addEventListener('click', () => document.querySelector('.sidebar [data-section="policies"]')?.click());
    return true;
  }

  function metric(label, value, note, tone = '') {
    return `<article class="${tone}"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></article>`;
  }

  function renderMetrics(data) {
    const host = $('#aiOpsMetrics');
    if (!host) return;
    host.innerHTML = [
      metric('Site AI', `${data.total}`, '사이트별 운영 담당'),
      metric('Healthy', `${data.healthy}`, '실시간 정상', data.attention ? '' : 'good'),
      metric('Council Cases', `${data.cases.length}`, '교차검토 항목', data.cases.length ? 'warn' : ''),
      metric('Decisions', `${data.decisions}`, data.decisions ? '대표 판단 대기' : '현재 승인 요청 없음', data.decisions ? 'danger' : 'good'),
    ].join('');
  }

  function caseCard(item) {
    const article = document.createElement('article');
    article.className = `ai-case ${item.level.toLowerCase()}`;
    article.innerHTML = `<div class="ai-case-level">${esc(item.level)}</div><div class="ai-case-copy"><strong>${esc(item.title)}</strong><span>${esc(item.owner)} · ${esc(item.consult)}</span><p>${esc(item.action)}</p></div>`;
    if (item.domain && item.domain !== 'platform') article.addEventListener('click', () => openSite(item.domain));
    return article;
  }

  function renderCases(data) {
    const host = $('#aiCouncilCases');
    const count = $('#aiCouncilCount');
    if (!host || !count) return;
    host.replaceChildren();
    count.textContent = String(data.cases.length);
    if (!data.cases.length) {
      const empty = document.createElement('div');
      empty.className = 'ai-empty';
      empty.innerHTML = '<strong>현재 Council 안건 없음</strong><span>Site AI 감시 결과 즉시 협의할 이슈가 없습니다.</span>';
      host.append(empty);
      return;
    }
    data.cases.forEach(item => host.append(caseCard(item)));
  }

  function renderDecisions(data) {
    const queue = $('#aiDecisionQueue');
    const count = $('#aiDecisionCount');
    if (!queue || !count) return;
    const decisions = data.cases.filter(item => item.level === 'DECISION');
    count.textContent = String(decisions.length);
    queue.replaceChildren();
    if (!decisions.length) {
      const empty = document.createElement('div');
      empty.className = 'ai-empty compact';
      empty.innerHTML = '<strong>결정 대기 없음</strong><span>Chief AI가 대표 판단이 필요한 사안만 이곳에 올립니다.</span>';
      queue.append(empty);
    } else {
      decisions.forEach(item => queue.append(caseCard(item)));
    }
    const rules = document.createElement('details');
    rules.className = 'ai-decision-rules';
    rules.innerHTML = `<summary>대표 승인 대상 기준</summary><ul>${DECISION_RULES.map(rule => `<li>${esc(rule)}</li>`).join('')}</ul>`;
    queue.append(rules);
  }

  function agentCard(agent, state) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ai-site-card ${state.key}`;
    button.dataset.aiAgentDomain = agent.domain;
    button.innerHTML = `<span class="ai-state-dot"></span><span class="ai-site-copy"><small>${esc(agent.group)}</small><strong>${esc(agent.name)}</strong><span>${esc(agent.domain)}</span></span><span class="ai-site-state"><b>${esc(state.label)}</b><small>${esc(state.note)}</small></span>`;
    button.addEventListener('click', () => openSite(agent.domain));
    return button;
  }

  function renderAgents() {
    const host = $('#aiSiteAgents');
    if (!host) return;
    const map = serviceMap();
    host.replaceChildren(...SITE_AGENTS.map(agent => agentCard(agent, agentState(agent, map))));
    attachCampusAiButtons();
  }

  function focusAgent(domain) {
    const card = document.querySelector(`[data-ai-agent-domain="${CSS.escape(domain)}"]`);
    if (!card) return;
    card.classList.add('focused');
    card.scrollIntoView({ behavior:'smooth', block:'center' });
    setTimeout(() => card.classList.remove('focused'), 2200);
  }

  function openSite(domain) {
    const agent = SITE_AGENTS.find(item => item.domain === domain);
    if (!agent) return;
    selectedDomain = domain;
    const state = agentState(agent);
    const drawer = $('#aiSiteDrawer');
    if (!drawer) return;
    drawer.hidden = false;
    drawer.innerHTML = `
      <div class="ai-drawer-head"><div><small>SITE ADMIN AI</small><h3>${esc(agent.name)} AI</h3><p>${esc(agent.domain)}</p></div><button type="button" id="aiDrawerClose" aria-label="닫기">×</button></div>
      <div class="ai-drawer-status ${esc(state.key)}"><strong>${esc(state.label)}</strong><span>${esc(state.note)}</span></div>
      <div class="ai-drawer-grid"><div><small>책임</small><strong>${esc(agent.role)}</strong></div><div><small>자율권</small><strong>저위험 자동 · 중요결정 Human Gate</strong></div><div><small>협업</small><strong>Chief · Platform · Security · Release AI</strong></div><div><small>최근 응답</small><strong>${state.response ? `${esc(state.response)}ms` : '점검 연결 대기'}</strong></div></div>
      <div class="ai-drawer-actions"><button type="button" class="secondary" id="aiSiteManage">Manage</button><a class="primary" href="https://${esc(agent.domain)}" target="_blank" rel="noopener">Open ↗</a></div>
    `;
    $('#aiDrawerClose')?.addEventListener('click', () => { drawer.hidden = true; });
    $('#aiSiteManage')?.addEventListener('click', () => openManage(agent));
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

  function updateChief(data, error = '') {
    const brief = $('#aiChiefBrief');
    if (!brief) return;
    if (error) {
      brief.textContent = `운영 API 연결을 확인해야 합니다. ${error}`;
      return;
    }
    if (data.decisions) brief.textContent = `Site AI ${data.total}개를 조정 중이며, 대표 판단이 필요한 결정 ${data.decisions}건이 있습니다.`;
    else if (data.cases.length) brief.textContent = `Site AI ${data.total}개 중 Council 검토 ${data.cases.length}건을 추적 중입니다. 현재 대표 승인 대기 사안은 없습니다.`;
    else brief.textContent = `Site AI ${data.total}개를 한 화면에서 조정합니다. 현재 운영상 대표 판단이 필요한 사안은 없습니다.`;
  }

  function render(error = '') {
    if (!panel()) return;
    const data = summary();
    renderMetrics(data);
    renderCases(data);
    renderDecisions(data);
    renderAgents();
    updateChief(data, error);
    const button = $('#aiOpsRefresh');
    if (button && lastReviewAt) button.title = `최근 검토 ${lastReviewAt.toLocaleString('ko-KR')}`;
  }

  async function runReview() {
    const button = $('#aiOpsRefresh');
    if (button) { button.disabled = true; button.textContent = '↻ Reviewing…'; }
    try {
      await loadOverview(true);
      render();
    } catch (error) {
      render(error.message || '상태점검 실패');
    } finally {
      if (button) { button.disabled = false; button.textContent = '↻ Council Review'; }
    }
  }

  async function initialData() {
    try {
      await loadOverview(false);
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
