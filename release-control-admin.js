(() => {
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const REPOSITORY = 'topmaster-joseph/ekodi-platform';
  const RUNS_URL = `https://api.github.com/repos/${REPOSITORY}/actions/runs?per_page=80`;
  const CACHE_MS = 60 * 1000;
  const MALL_FREE_OPS_URL = 'https://ekodi.kr/ekodibiz/mall/free-ops?embed=admin';
  const DEPLOYMENTS_SECTION = 'deployments';
  const RELEASE_UNITS = [
    { id:'shared-site', name:'Shared Site · Admin/Auth', workflow:'deploy-admin-site.yml', model:'Candidate 0% → verify → 100%', risk:'high', domains:['ekodi.kr','admin.ekodi.kr','auth.ekodi.kr'] },
    { id:'control-api', name:'Control API', workflow:'deploy-control-api.yml', model:'Staging D1 → recovery bookmark → Candidate 0%', risk:'critical', domains:['api.ekodi.kr'] },
    { id:'finance-api', name:'Finance API', workflow:'deploy-finance.yml', model:'Staging D1 → recovery bookmark → secret-safe Candidate 0%', risk:'critical', domains:['finance-api.ekodi.kr'] },
    { id:'marketing-ai', name:'마케팅 AI', workflow:'sync-marketing-ai.yml', alternates:['deploy-jadam-marketing-ai.yml'], model:'Pages preview → verify all → production', risk:'high', domains:['marketing.ekodi.kr','jadam.ekodi.kr','pizzamaru.ekodi.kr','yogurt.ekodi.kr'] },
    { id:'community', name:'Community', workflow:'deploy-community.yml', model:'Candidate 0% → verify → 100%', risk:'medium', domains:['community.ekodi.kr'] },
    { id:'books', name:'Books', workflow:'deploy-books.yml', model:'Candidate 0% → verify → 100%', risk:'medium', domains:['books.ekodi.kr'] },
    { id:'social', name:'Social', workflow:'deploy-social.yml', model:'Candidate 0% → verify → 100%', risk:'medium', domains:['social.ekodi.kr'] },
  ];
  const POLICY = {
    sourceOfTruth: 'GitHub Actions + guarded release manifests',
    automaticProductionBypass: false,
    topologyMutation: 'manual-only',
    cloudflareCredentialIsolation: 'prepared-for-split-token',
  };
  let cache = null;
  let cacheAt = 0;
  let accessRequest = 0;

  function el(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
  function workflowName(pathname = '') { return String(pathname).split('/').pop() || ''; }
  function unitForWorkflow(name) { return RELEASE_UNITS.find(unit => unit.workflow === name || unit.alternates?.includes(name)) || null; }

  function normalizeRun(run) {
    const workflow = workflowName(run.path);
    const unit = unitForWorkflow(workflow);
    if (!unit) return null;
    return {
      id:run.id, unitId:unit.id, unitName:unit.name, workflow,
      runNumber:run.run_number, event:run.event, branch:run.head_branch,
      sha:String(run.head_sha || '').slice(0, 12), title:run.display_title || run.name || unit.name,
      status:run.status || 'unknown', conclusion:run.conclusion || null,
      createdAt:run.created_at || null, updatedAt:run.updated_at || null,
      url:run.html_url || null, risk:unit.risk, model:unit.model,
    };
  }

  async function releaseData(force = false) {
    if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
    const response = await fetch(RUNS_URL, {
      cache:'no-store',
      headers:{ accept:'application/vnd.github+json', 'x-github-api-version':'2022-11-28' },
    });
    if (!response.ok) throw new Error(`GitHub Actions 조회 실패 (${response.status})`);
    const raw = await response.json();
    const recentRuns = (raw.workflow_runs || []).map(normalizeRun).filter(Boolean).slice(0, 40);
    cache = {
      repository:REPOSITORY,
      generatedAt:new Date().toISOString(),
      policy:POLICY,
      units:RELEASE_UNITS.map(unit => ({
        id:unit.id, name:unit.name, workflow:unit.workflow, model:unit.model, risk:unit.risk, domains:unit.domains,
        latest:recentRuns.find(run => run.unitId === unit.id) || null,
      })),
      recentRuns,
    };
    cacheAt = Date.now();
    return cache;
  }

  async function currentAdminRole() {
    const currentToken = token();
    if (!currentToken) return '';
    const response = await fetch(`${API}/api/session`, {
      cache:'no-store',
      headers:{ authorization:`Bearer ${currentToken}` },
    });
    if (!response.ok) return '';
    const session = await response.json();
    return session.authenticated === true ? String(session.role || '') : '';
  }

  function date(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('ko-KR', { dateStyle:'short', timeStyle:'short' });
  }

  function state(run) {
    if (!run) return { label:'기록 없음', className:'queued' };
    if (run.status !== 'completed') return { label:run.status === 'in_progress' ? '검증·배포 중' : '대기', className:run.status || 'queued' };
    const map = { success:'성공', failure:'실패', cancelled:'취소', skipped:'건너뜀' };
    return { label:map[run.conclusion] || run.conclusion || '완료', className:run.conclusion || 'success' };
  }

  function badge(text, className = '') { return el('span', text, `release-badge ${className}`.trim()); }

  function installMallFreeOpsNav() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return;

    let button = nav.querySelector('[data-admin-link="mall-free-ops"]');
    if (!button || button.tagName !== 'BUTTON') {
      if (button) button.remove();
      button = el('button', '', 'nav');
      button.type = 'button';
      button.dataset.section = 'mall-free-ops';
      button.dataset.adminLink = 'mall-free-ops';
      button.title = 'EKODI Mall 무료·수동 우선 공급 운영';
      button.append(document.createTextNode('◇ '), el('span', 'Mall · Free Ops'));
      nav.append(button);
    }

    let section = document.querySelector('#mallFreeOpsPanel');
    if (!section) {
      section = el('section', '', 'section mall-free-ops-admin hidden-panel');
      section.dataset.panel = 'mall-free-ops';
      section.id = 'mallFreeOpsPanel';

      const head = el('div', '', 'mall-free-ops-head');
      const copy = el('div');
      copy.append(el('p', 'MALL · SIMPLE OPERATIONS', 'kicker'), el('h2', 'Mall · Free Ops'));
      copy.append(el('p', '공급처 후보 등록, 가격·마진 계산, 안전확인을 관리자 화면을 떠나지 않고 처리합니다.', 'operations-copy'));
      const actions = el('div', '', 'mall-free-ops-actions');
      const refresh = el('button', '↻ 새로고침', 'secondary');
      refresh.type = 'button';
      refresh.dataset.mallFreeOpsRefresh = 'true';
      const external = el('a', '전체화면 ↗', 'secondary');
      external.href = 'https://ekodi.kr/ekodibiz/mall/free-ops';
      external.target = '_blank';
      external.rel = 'noopener';
      actions.append(refresh, external);
      head.append(copy, actions);

      const note = el('div', 'Free Ops만 admin.ekodi.kr 내부 표시를 허용합니다. 다른 Mall 페이지의 iframe 차단 정책은 그대로 유지됩니다.', 'mall-free-ops-note');
      const frameWrap = el('div', '', 'mall-free-ops-frame-wrap');
      const frame = document.createElement('iframe');
      frame.title = 'EKODI Mall Free Ops';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer';
      frame.sandbox = 'allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox';
      frame.dataset.mallFreeOpsFrame = 'true';
      frame.dataset.src = MALL_FREE_OPS_URL;
      frameWrap.append(frame);
      section.append(head, note, frameWrap);
      content.append(section);

      refresh.addEventListener('click', () => {
        const next = new URL(MALL_FREE_OPS_URL);
        next.searchParams.set('reload', String(Date.now()));
        frame.src = next.toString();
      });
    }

    const frame = section.querySelector('[data-mall-free-ops-frame]');
    const activate = () => {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('mall-free-ops'));
      });
      document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.toggle('active', item === button));
      const pageTitle = document.querySelector('#pageTitle');
      if (pageTitle) pageTitle.textContent = 'Mall · Free Ops';
      if (frame && !frame.getAttribute('src')) frame.src = frame.dataset.src || MALL_FREE_OPS_URL;
      document.querySelector('.sidebar')?.classList.remove('open');
      if (location.hash !== '#mall-free-ops') history.replaceState(null, '', '#mall-free-ops');
    };

    button.addEventListener('click', activate);
    if (location.hash === '#mall-free-ops') queueMicrotask(activate);
  }

  function bindDeploymentsIsolation(nav) {
    if (nav.dataset.deploymentsIsolationBound) return;
    nav.dataset.deploymentsIsolationBound = 'true';
    nav.addEventListener('click', event => {
      const item = event.target.closest('.nav');
      if (!item || item.dataset.section === DEPLOYMENTS_SECTION) return;
      const section = document.querySelector('#releaseControl');
      if (section) {
        section.hidden = true;
        section.classList.add('hidden-panel');
      }
      nav.querySelector(`[data-section="${DEPLOYMENTS_SECTION}"]`)?.classList.remove('active');
    }, true);
  }

  function removeDeploymentsControl() {
    document.querySelectorAll('.sidebar [data-section="deployments"], .sidebar [data-section="release"]').forEach(node => node.remove());
    document.querySelector('#releaseControl')?.remove();
    if (location.hash === '#deployments' || location.hash === '#release') {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      document.querySelector('.sidebar [data-section="campus"]')?.click();
    }
  }

  function installDeploymentsControl() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return;

    nav.querySelector('[data-section="release"]')?.remove();
    bindDeploymentsIsolation(nav);

    let navButton = nav.querySelector(`[data-section="${DEPLOYMENTS_SECTION}"]`);
    if (!navButton) {
      navButton = el('button', '', 'nav deployments-nav');
      navButton.type = 'button';
      navButton.dataset.section = DEPLOYMENTS_SECTION;
      navButton.dataset.adminAccess = 'super-admin';
      navButton.title = '배포 상태와 운영 반영 이력';
      navButton.append(document.createTextNode('↑ '), el('span', 'Deployments'));
      nav.append(navButton);
    }

    if (document.querySelector('#releaseControl')) return;

    const section = el('section', '', 'section release-control hidden-panel');
    section.dataset.panel = DEPLOYMENTS_SECTION;
    section.id = 'releaseControl';
    section.hidden = true;

    const head = el('div', '', 'release-head');
    const heading = el('div');
    heading.append(el('p', 'SYSTEM DEPLOYMENTS', 'kicker'), el('h2', 'Deployments'));
    heading.append(el('p', '새 기능이 검증을 거쳐 실제 운영 사이트에 반영된 상태와 최근 배포 이력을 확인합니다. 평소 관리 화면에서는 숨겨집니다.', 'operations-copy'));
    const refresh = el('button', '↻ 새로고침', 'secondary release-refresh');
    refresh.type = 'button';
    head.append(heading, refresh);

    const policy = el('div', '', 'release-policy');
    const note = el('div', '배포 경로는 검증 절차로 보호되며 DNS·라우팅 같은 네트워크 구조 변경은 일반 배포와 분리해 관리합니다.', 'release-note');
    const stateMessage = el('div', '', 'release-state');
    const units = el('div', '', 'release-units');
    const title = el('h3', 'Recent Deployments');
    const runs = el('div', '', 'release-runs');
    section.append(head, policy, note, stateMessage, units, title, runs);
    content.append(section);

    function renderPolicy(data) {
      policy.replaceChildren();
      const cards = [
        ['Source of truth', 'GitHub Actions', data.policy?.sourceOfTruth || 'guarded workflows'],
        ['Production bypass', data.policy?.automaticProductionBypass === false ? 'Blocked' : 'Check', 'CI policy audit'],
        ['Topology', data.policy?.topologyMutation === 'manual-only' ? 'Manual only' : 'Check', 'DNS · routes · custom domains'],
        ['Credential split', data.policy?.cloudflareCredentialIsolation === 'prepared-for-split-token' ? 'Prepared' : 'Check', 'Deploy token / Topology token'],
      ];
      for (const [label, value, detail] of cards) {
        const card = el('article'); card.append(el('small', label), el('strong', value), el('span', detail)); policy.append(card);
      }
    }

    function renderUnits(items) {
      units.replaceChildren();
      if (!items.length) return units.append(el('div', '등록된 배포 대상이 없습니다.', 'release-empty'));
      for (const unit of items) {
        const card = el('article', '', 'release-unit');
        const top = el('div', '', 'release-unit-head');
        const identity = el('div'); identity.append(el('h3', unit.name), el('small', unit.workflow));
        const badges = el('div', '', 'release-badges');
        const current = state(unit.latest);
        badges.append(badge(current.label, current.className), badge(unit.risk.toUpperCase(), unit.risk));
        top.append(identity, badges);
        const model = el('div', unit.model, 'release-model');
        const domains = el('div', '', 'release-domains');
        (unit.domains || []).forEach(domain => domains.append(el('span', domain)));
        const latest = el('div', '', 'release-latest');
        const copy = el('div');
        if (unit.latest) copy.append(el('small', `#${unit.latest.runNumber} · ${date(unit.latest.updatedAt)}`), el('strong', unit.latest.title || unit.name));
        else copy.append(el('small', '최근 이력 없음'), el('strong', '대기 중'));
        const link = el('a', unit.latest?.url ? 'Actions ↗' : '—', 'ghost');
        if (unit.latest?.url) { link.href = unit.latest.url; link.target = '_blank'; link.rel = 'noopener'; }
        latest.append(copy, link);
        card.append(top, model, domains, latest);
        units.append(card);
      }
    }

    function renderRuns(items) {
      runs.replaceChildren();
      if (!items.length) return runs.append(el('div', '최근 배포 이력이 없습니다.', 'release-empty'));
      for (const run of items.slice(0, 18)) {
        const row = el('article', '', 'release-run');
        const primary = el('div'); primary.append(el('small', `${run.unitName} · #${run.runNumber}`), el('strong', run.title));
        const meta = el('div', `${date(run.createdAt)} · ${run.branch || '—'} · ${run.sha || '—'}`, 'release-run-meta');
        const current = state(run);
        const action = el('div', '', 'release-badges');
        action.append(badge(current.label, current.className));
        if (run.url) {
          const link = el('a', '보기 ↗', 'ghost'); link.href = run.url; link.target = '_blank'; link.rel = 'noopener'; action.append(link);
        }
        row.append(primary, meta, action); runs.append(row);
      }
    }

    async function load(force = false) {
      refresh.disabled = true;
      stateMessage.textContent = '';
      units.replaceChildren(el('div', 'GitHub Actions에서 배포 상태를 확인하는 중입니다.', 'release-empty'));
      runs.replaceChildren();
      try {
        const data = await releaseData(force);
        renderPolicy(data);
        renderUnits(data.units || []);
        renderRuns(data.recentRuns || []);
      } catch (error) {
        stateMessage.textContent = error.message || '배포 정보를 불러오지 못했습니다.';
        units.replaceChildren(el('div', '배포 관제 정보를 불러오지 못했습니다.', 'release-empty'));
      } finally {
        refresh.disabled = false;
      }
    }

    async function activate() {
      section.hidden = false;
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes(DEPLOYMENTS_SECTION));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === DEPLOYMENTS_SECTION));
      const pageTitle = document.querySelector('#pageTitle');
      if (pageTitle) pageTitle.textContent = 'Deployments';
      document.querySelector('.sidebar')?.classList.remove('open');
      if (location.hash !== '#deployments') history.replaceState(null, '', '#deployments');
      await load();
    }

    navButton.addEventListener('click', activate);
    refresh.addEventListener('click', () => load(true));
    if (location.hash === '#release') history.replaceState(null, '', '#deployments');
    if (location.hash === '#deployments') queueMicrotask(activate);
  }

  async function syncDeploymentsAccess() {
    const requestId = ++accessRequest;
    if (!token()) {
      removeDeploymentsControl();
      return;
    }
    try {
      const role = await currentAdminRole();
      if (requestId !== accessRequest) return;
      if (role === 'super_admin') installDeploymentsControl();
      else removeDeploymentsControl();
    } catch {
      if (requestId === accessRequest) removeDeploymentsControl();
    }
  }

  installMallFreeOpsNav();
  syncDeploymentsAccess();

  const app = document.querySelector('#app');
  if (app) {
    const observer = new MutationObserver(() => syncDeploymentsAccess());
    observer.observe(app, { attributes:true, attributeFilter:['hidden'] });
  }
  window.addEventListener('pageshow', syncDeploymentsAccess);
})();