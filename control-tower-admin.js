(() => {
  'use strict';

  const MODULE_ID = 'ekodi-control-tower';
  const HEALTH_ID = 'ekodiSystemHealth';
  const API = 'https://ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const REPOSITORY = 'topmaster-joseph/ekodi-platform';
  const RUNS_URL = `https://api.github.com/repos/${REPOSITORY}/actions/runs?per_page=40`;
  const RELEASE_WORKFLOWS = new Set([
    'deploy-site-core.yml','deploy-control-api.yml','deploy-finance.yml','sync-marketing-ai.yml',
    'deploy-community.yml','deploy-books.yml','deploy-social.yml'
  ]);
  const TABS = Object.freeze([
    ['summary','종합'],
    ['deploy','실행·배포'],
    ['services','서비스'],
    ['data','데이터·인증'],
    ['traffic','트래픽·보안'],
    ['cost','비용·인프라'],
  ]);
  const TAB_IDS = new Set(TABS.map(([id]) => id));
  let mounted = false;
  let loadPromise = null;
  let snapshot = null;

  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function el(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function stateLabel(state) {
    return ({ok:'정상',good:'정상',healthy:'정상',active:'정상',success:'정상',warning:'주의',warn:'주의',degraded:'주의',error:'장애',failed:'장애',offline:'장애',pending:'확인 중',unknown:'확인 필요'})[String(state || '').toLowerCase()] || '확인 필요';
  }
  function stateTone(state) {
    const value = String(state || '').toLowerCase();
    if (['ok','good','healthy','success','active'].includes(value)) return 'ok';
    if (['warning','warn','degraded','queued','pending','in_progress'].includes(value)) return 'warn';
    if (['error','failed','failure','offline','cancelled'].includes(value)) return 'bad';
    return 'muted';
  }
  function timestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR', { dateStyle:'short', timeStyle:'short' });
  }
  function serviceList(data) {
    if (Array.isArray(data?.services)) return data.services;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.overview?.services)) return data.overview.services;
    return [];
  }
  function serviceState(item) {
    if (!item) return 'unknown';
    if (item.latest?.ok === true || item.ok === true) return 'ok';
    if (item.latest?.ok === false || item.ok === false) return 'error';
    return item.latest?.status || item.health || item.status || item.state || 'unknown';
  }
  function classifyServices(items, words) {
    const terms = words.map(value => value.toLowerCase());
    return items.filter(item => {
      const hay = [item.id,item.name,item.domain,item.url,item.group].filter(Boolean).join(' ').toLowerCase();
      return terms.some(term => hay.includes(term));
    });
  }
  async function getOverview() {
    const response = await fetch(`${API}/api/control/overview`, {
      cache:'no-store',
      headers: token() ? { authorization:`Bearer ${token()}` } : {},
    });
    if (!response.ok) throw new Error(`Control API ${response.status}`);
    return response.json();
  }
  async function getRuns() {
    const response = await fetch(RUNS_URL, {
      cache:'no-store',
      headers:{ accept:'application/vnd.github+json', 'x-github-api-version':'2022-11-28' },
    });
    if (!response.ok) throw new Error(`GitHub Actions ${response.status}`);
    const data = await response.json();
    return (data.workflow_runs || []).filter(run => RELEASE_WORKFLOWS.has(String(run.path || '').split('/').pop())).slice(0, 30);
  }
  function summarize(overview, runs) {
    const services = serviceList(overview);
    const operational = services.filter(item => ['active','production','live',''].includes(String(item.operationalState || item.state || '').toLowerCase()) || item.latest);
    const states = operational.map(serviceState);
    const bad = states.filter(value => stateTone(value) === 'bad').length;
    const warn = states.filter(value => stateTone(value) === 'warn' || stateTone(value) === 'muted').length;
    const ok = Math.max(0, operational.length - bad - warn);
    const running = runs.filter(run => run.status === 'in_progress').length;
    const queued = runs.filter(run => run.status === 'queued' || run.status === 'requested' || run.status === 'waiting').length;
    const failed = runs.filter(run => run.status === 'completed' && run.conclusion && run.conclusion !== 'success' && run.conclusion !== 'skipped').length;
    const authData = classifyServices(services,['auth','api','d1','database','supabase','storage']);
    return { services, operational, ok, warn, bad, running, queued, failed, authData };
  }
  function navigate(section) {
    if (window.EKODIAdminPanels?.activate) {
      window.EKODIAdminPanels.activate(section);
      return;
    }
    document.querySelector(`.sidebar [data-section="${section}"]`)?.click();
  }
  function routeTab() {
    try {
      const route = window.EKODIAdminRoutes?.routeFromPath?.(location.pathname);
      if (route?.section !== 'platform-overview') return 'summary';
      const candidate = String(route.detailSegments?.[0] || 'summary').toLowerCase();
      return TAB_IDS.has(candidate) ? candidate : 'summary';
    } catch { return 'summary'; }
  }
  function syncTabUrl(id) {
    if (window.EKODIAdminPanels?.current?.() !== 'platform-overview') return;
    const details = id === 'summary' ? [] : [id];
    const target = window.EKODIAdminRoutes?.navigationTarget?.('platform-overview', location, details);
    if (target && target !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', target);
  }
  function activateTab(tower, id, sync = true) {
    const next = TAB_IDS.has(id) ? id : 'summary';
    tower.querySelectorAll('[data-ct-tab]').forEach(node => node.setAttribute('aria-selected', String(node.dataset.ctTab === next)));
    tower.querySelectorAll('[data-ct-panel]').forEach(panel => { panel.hidden = panel.dataset.ctPanel !== next; });
    tower.dataset.ctActiveTab = next;
    if (sync) syncTabUrl(next);
  }
  function closeDrawer(tower) {
    const drawer = tower?.querySelector('[data-ct-drawer]');
    if (!drawer) return;
    drawer.hidden = true;
    drawer.replaceChildren();
    document.documentElement.classList.remove('ct-drawer-open');
  }
  function openDrawer(tower, { eyebrow = '상세', title = '운영 상세', facts = [], action = null } = {}) {
    const drawer = tower?.querySelector('[data-ct-drawer]');
    if (!drawer) return;
    drawer.replaceChildren();
    const head = el('div','','ct-drawer-head');
    const heading = el('div');
    heading.append(el('small',eyebrow), el('h3',title));
    const close = el('button','×','ct-drawer-close');
    close.type = 'button';
    close.setAttribute('aria-label','상세 닫기');
    close.addEventListener('click', () => closeDrawer(tower));
    head.append(heading,close);
    const body = el('div','','ct-drawer-body');
    for (const [label,value,tone=''] of facts) {
      const row = el('div','','ct-drawer-fact');
      row.append(el('span',label), el('strong',value || '—',tone ? `is-${tone}` : ''));
      body.append(row);
    }
    if (action?.label && typeof action.run === 'function') {
      const button = el('button',action.label,'ct-drawer-action');
      button.type='button';
      button.addEventListener('click',action.run);
      body.append(button);
    }
    drawer.append(head,body);
    drawer.hidden = false;
    document.documentElement.classList.add('ct-drawer-open');
  }
  function metric(label, value, note, tone = 'muted') {
    const card = el('article','',`ct-metric is-${tone}`);
    card.append(el('small',label), el('strong',String(value)), el('span',note));
    return card;
  }
  function linkCard(title, copy, section, badgeText = '') {
    const button = el('button','','ct-link-card');
    button.type = 'button';
    const head = el('div','','ct-link-card-head');
    head.append(el('strong',title));
    if (badgeText) head.append(el('span',badgeText,'ct-badge'));
    button.append(head, el('p',copy), el('small','상세 관제 열기 →'));
    button.addEventListener('click', () => navigate(section));
    return button;
  }
  function renderDock(summary) {
    let dock = document.getElementById('ekodiControlTowerDock');
    if (!dock) {
      dock = el('aside','','ct-command-dock');
      dock.id = 'ekodiControlTowerDock';
      dock.setAttribute('aria-label','EKODI 운영 상태 요약');
      document.body.append(dock);
    }
    dock.replaceChildren();
    const title = el('button','','ct-dock-title');
    title.type = 'button';
    title.append(el('strong','운영관제'), el('span','Control Tower'));
    title.addEventListener('click', () => navigate('platform-overview'));
    dock.append(
      title,
      metric('정상',summary.ok,'서비스','ok'),
      metric('주의',summary.warn,'확인 필요',summary.warn ? 'warn' : 'ok'),
      metric('장애',summary.bad,'즉시 확인',summary.bad ? 'bad' : 'ok'),
      metric('실행',summary.running + summary.queued,'배포·작업',summary.running + summary.queued ? 'warn' : 'muted')
    );
  }
  function ensureTower(section) {
    let tower = section.querySelector('#'+MODULE_ID);
    if (tower) return tower;
    tower = el('div','','ct-shell');
    tower.id = MODULE_ID;
    tower.innerHTML = `
      <div class="ct-head">
        <div><p class="kicker">EKODI OPERATIONS CONTROL TOWER</p><h2>운영 관제</h2><p>문제가 없는 정보는 접고, 지금 확인하거나 조치할 항목을 먼저 보여줍니다.</p></div>
        <div class="ct-head-actions"><span data-ct-updated>확인 전</span><button type="button" class="secondary" data-ct-refresh>↻ 새로고침</button></div>
      </div>
      <div class="ct-statusbar" data-ct-statusbar></div>
      <nav class="ct-tabs" role="tablist" aria-label="운영 관제 분류"></nav>
      <div class="ct-panels"></div>
      <aside class="ct-drawer" data-ct-drawer hidden aria-live="polite"></aside>
    `;
    section.prepend(tower);
    for (const child of [...section.children]) if (child !== tower) child.classList.add('ct-health-detail');
    const tabs = tower.querySelector('.ct-tabs');
    const panels = tower.querySelector('.ct-panels');
    for (const [id,label] of TABS) {
      const button = el('button',label,'ct-tab');
      button.type = 'button';
      button.dataset.ctTab = id;
      button.setAttribute('role','tab');
      button.setAttribute('aria-selected',id === 'summary' ? 'true' : 'false');
      tabs.append(button);
      const panel = el('section','','ct-panel');
      panel.dataset.ctPanel = id;
      panel.hidden = id !== 'summary';
      panels.append(panel);
    }
    tabs.addEventListener('click', event => {
      const button = event.target.closest('[data-ct-tab]');
      if (!button) return;
      activateTab(tower,button.dataset.ctTab,true);
    });
    tower.querySelector('[data-ct-refresh]').addEventListener('click', () => load(true));
    tower.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(tower); });
    activateTab(tower,routeTab(),false);
    return tower;
  }
  function renderStatusbar(tower, summary) {
    const host = tower.querySelector('[data-ct-statusbar]');
    host.replaceChildren(
      metric('서비스 정상',summary.ok,'현재 정상','ok'),
      metric('주의',summary.warn,'확인 필요',summary.warn ? 'warn' : 'ok'),
      metric('장애',summary.bad,'즉시 확인',summary.bad ? 'bad' : 'ok'),
      metric('실행 중',summary.running,'GitHub Actions',summary.running ? 'warn' : 'muted'),
      metric('대기',summary.queued,'배포 게이트',summary.queued ? 'warn' : 'muted'),
      metric('최근 실패',summary.failed,'Actions 30건',summary.failed ? 'bad' : 'ok')
    );
  }
  function renderSummary(panel, summary) {
    panel.replaceChildren();
    const exceptions = el('div','','ct-block');
    exceptions.append(el('div','지금 확인할 것','ct-block-title'));
    if (!summary.bad && !summary.warn && !summary.failed) {
      exceptions.append(el('div','현재 통합 원장에서 긴급 이상징후가 확인되지 않았습니다.','ct-empty'));
    } else {
      const list = el('div','','ct-exceptions');
      if (summary.bad) list.append(metric('서비스 장애',summary.bad,'전체 운영상태에서 원인 확인','bad'));
      if (summary.warn) list.append(metric('상태 확인 필요',summary.warn,'미확인·지연 포함','warn'));
      if (summary.failed) list.append(metric('배포 실패',summary.failed,'최근 GitHub Actions','bad'));
      exceptions.append(list);
    }
    const map = el('div','','ct-link-grid');
    map.append(
      linkCard('전체 운영상태','서비스 생존, 응답시간, 복구상태를 확인합니다.','health',`${summary.operational.length}개 관제`),
      linkCard('배포·작업 대기','GitHub Actions와 운영 반영 흐름을 확인합니다.','deployments',`${summary.running + summary.queued}개 진행`),
      linkCard('장애·오류·경고','자동복구 실패와 운영 사건을 확인합니다.','aiops',summary.bad ? `${summary.bad}개 장애` : '이상징후'),
      linkCard('실행 인프라','자동화 실행기와 작업 노드 상태를 확인합니다.','devices','실행환경')
    );
    panel.append(exceptions,map);
  }
  function renderDeploy(panel, summary, runs) {
    panel.replaceChildren();
    const head = el('div','','ct-inline-summary');
    head.append(metric('실행 중',summary.running,'검증·배포','warn'),metric('대기',summary.queued,'게이트 대기',summary.queued ? 'warn':'muted'),metric('실패',summary.failed,'최근 30건',summary.failed ? 'bad':'ok'));
    const rows = el('div','','ct-rows');
    const visible = runs.slice(0,12);
    if (!visible.length) rows.append(el('div','최근 배포 작업을 찾지 못했습니다.','ct-empty'));
    for (const run of visible) {
      const workflow = String(run.path || '').split('/').pop() || run.name || 'workflow';
      const tone = run.status === 'completed' ? (run.conclusion === 'success' ? 'ok' : 'bad') : 'warn';
      const row = el('button','','ct-row');
      row.type = 'button';
      const primary = el('span');
      primary.append(el('strong',workflow),el('small',run.display_title || run.name || '배포 작업'));
      const meta = el('span');
      meta.append(el('b',run.status === 'completed' ? (run.conclusion || '완료') : (run.status || '대기'),`ct-state is-${tone}`),el('small',timestamp(run.updated_at)));
      row.append(primary,meta);
      row.addEventListener('click', () => {
        openDrawer(panel.closest('#'+MODULE_ID),{
          eyebrow:'실행·배포',
          title:workflow,
          facts:[
            ['작업',run.display_title || run.name || '배포 작업'],
            ['상태',run.status === 'completed' ? (run.conclusion || '완료') : (run.status || '대기'),tone],
            ['최근 갱신',timestamp(run.updated_at)],
            ['브랜치',run.head_branch || '—'],
            ['SHA',String(run.head_sha || '').slice(0,12) || '—'],
          ],
          action:run.html_url ? {label:'GitHub 실행 상세 열기 ↗',run:()=>window.open(run.html_url,'_blank','noopener')} : null
        });
      });
      rows.append(row);
    }
    const action = el('button','배포·작업 대기 전체 보기 →','ct-more');
    action.type='button'; action.addEventListener('click',()=>navigate('deployments'));
    panel.append(head,rows,action);
  }
  function renderServices(panel, summary) {
    panel.replaceChildren();
    const rows = el('div','','ct-rows');
    if (!summary.operational.length) rows.append(el('div','Control API에 표시할 서비스 상태가 없습니다.','ct-empty'));
    for (const item of summary.operational.slice(0,20)) {
      const tone = stateTone(serviceState(item));
      const row = el('button','','ct-row');
      row.type = 'button';
      const name = item.name || item.id || item.domain || '서비스';
      const detail = item.domain || item.url || item.group || '운영 서비스';
      const ms = item.latest?.responseMs ?? item.latest?.responseTime ?? item.responseMs;
      const primary = el('span');
      primary.append(el('strong',name),el('small',detail));
      const meta = el('span');
      meta.append(el('b',stateLabel(serviceState(item)),`ct-state is-${tone}`),el('small',Number.isFinite(Number(ms)) ? Number(ms)+' ms' : '응답시간 —'));
      row.append(primary,meta);
      row.addEventListener('click', () => {
        const state = serviceState(item);
        openDrawer(panel.closest('#'+MODULE_ID),{
          eyebrow:'서비스',
          title:name,
          facts:[
            ['상태',stateLabel(state),stateTone(state)],
            ['주소',item.domain || item.url || '—'],
            ['그룹',item.group || item.operationalState || '—'],
            ['응답시간',Number.isFinite(Number(ms)) ? Number(ms)+' ms' : '—'],
            ['최근 확인',timestamp(item.latest?.checkedAt || item.latest?.checked_at || item.updatedAt || item.updated_at)],
          ],
          action:{label:'전체 운영상태에서 보기 →',run:()=>navigate('health')}
        });
      });
      rows.append(row);
    }
    const action=el('button','전체 운영상태 상세 보기 →','ct-more'); action.type='button'; action.addEventListener('click',()=>navigate('health'));
    panel.append(rows,action);
  }
  function renderData(panel, summary) {
    panel.replaceChildren();
    const source = summary.authData;
    const ok = source.filter(item => stateTone(serviceState(item)) === 'ok').length;
    const bad = source.filter(item => stateTone(serviceState(item)) === 'bad').length;
    const cards = el('div','','ct-link-grid');
    cards.append(
      linkCard('데이터·저장소',source.length ? `Control API에서 관련 서비스 ${source.length}개를 확인했습니다.` : 'D1·Supabase·Storage 세부 원본은 해당 관리화면에서 확인합니다.','storage',bad ? `${bad}개 이상` : `${ok}개 정상`),
      linkCard('인증·권한','관리자 세션, OAuth, 사용자·관리자 접근 상태를 확인합니다.','security','권한 관제'),
      linkCard('관리자 계정·권한','최고관리자와 사이트 관리자 권한 원장을 확인합니다.','admins','최고관리자'),
      linkCard('외부 연동·API','Supabase·Cloudflare·외부 API 연결 원본을 확인합니다.','ai-module-spec','연동 설정')
    );
    panel.append(cards);
  }
  function renderTraffic(panel) {
    panel.replaceChildren(
      el('div','상세 트래픽·보안 지표는 기존 Health 원본을 그대로 사용합니다. 이 탭에서는 중복 원장을 만들지 않습니다.','ct-empty'),
      linkCard('트래픽·서비스 Health','Cloudflare 집계, 요청 구성, 응답속도와 서비스 상태를 확인합니다.','health','실시간 원본'),
      linkCard('장애·보안 이벤트','오류·경고·보안 사건과 자동조치 이력을 확인합니다.','aiops','사건 원장')
    );
  }
  function renderCost(panel) {
    panel.replaceChildren();
    const cards=el('div','','ct-link-grid');
    cards.append(
      linkCard('사용량·비용','API·AI Provider와 운영 사용량을 확인합니다.','api-cost','비용 관제'),
      linkCard('실행 인프라','실행 노드, 작업 큐, 자동화 실행상태를 확인합니다.','devices','인프라'),
      linkCard('보관함·저장소','저장소 정책과 연결 상태를 확인합니다.','storage','저장'),
      linkCard('플랫폼 성숙도','운영·보안·복구·품질 기준의 증거를 확인합니다.','maturity','가드레일')
    );
    panel.append(cards);
  }
  function render(tower, overview, runs) {
    const summary = summarize(overview,runs);
    snapshot = { overview,runs,summary };
    renderDock(summary);
    renderStatusbar(tower,summary);
    renderSummary(tower.querySelector('[data-ct-panel="summary"]'),summary);
    renderDeploy(tower.querySelector('[data-ct-panel="deploy"]'),summary,runs);
    renderServices(tower.querySelector('[data-ct-panel="services"]'),summary);
    renderData(tower.querySelector('[data-ct-panel="data"]'),summary);
    renderTraffic(tower.querySelector('[data-ct-panel="traffic"]'));
    renderCost(tower.querySelector('[data-ct-panel="cost"]'));
    tower.querySelector('[data-ct-updated]').textContent = `최근 확인 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;
  }
  function setMode(sectionId = window.EKODIAdminPanels?.current?.() || '') {
    const section = document.getElementById(HEALTH_ID);
    if (!section) return;
    const overview = sectionId === 'platform-overview';
    section.classList.toggle('ct-overview-mode',overview);
    const tower = section.querySelector('#'+MODULE_ID);
    if (tower && overview) activateTab(tower,routeTab(),false);
    if (tower && !overview) closeDrawer(tower);
  }
  async function load(force = false) {
    if (loadPromise && !force) return loadPromise;
    const section = document.getElementById(HEALTH_ID);
    const tower = section ? ensureTower(section) : null;
    const refresh = tower?.querySelector('[data-ct-refresh]');
    if (refresh) refresh.disabled = true;
    loadPromise = Promise.allSettled([getOverview(),getRuns()]).then(results => {
      const overview = results[0].status === 'fulfilled' ? results[0].value : {};
      const runs = results[1].status === 'fulfilled' ? results[1].value : [];
      const summary = summarize(overview,runs);
      snapshot = { overview,runs,summary };
      renderDock(summary);
      if (tower) render(tower,overview,runs);
      const errors = results.filter(item => item.status === 'rejected').map(item => item.reason?.message).filter(Boolean);
      if (tower && errors.length) tower.querySelector('[data-ct-updated]').textContent = `일부 원본 확인 필요 · ${errors.join(' · ')}`;
      return snapshot;
    }).finally(() => {
      if (refresh) refresh.disabled = false;
      loadPromise = null;
    });
    return loadPromise;
  }
  function enhance() {
    const section = document.getElementById(HEALTH_ID);
    if (!section) return false;
    ensureTower(section);
    setMode();
    load(false);
    mounted = true;
    return true;
  }
  function watch() {
    load(false);
    if (enhance()) return;
    const root = document.querySelector('.content') || document.body;
    const observer = new MutationObserver(() => {
      if (!enhance()) return;
      observer.disconnect();
    });
    observer.observe(root,{childList:true,subtree:true});
  }
  function openOverview() {
    navigate('platform-overview');
    window.setTimeout(() => load(false),50);
  }

  watch();
  window.addEventListener('ekodi-feature-installed',watch);
  window.addEventListener('ekodi-admin-ready',watch);
  window.addEventListener('ekodi-admin-section-changed',event => {
    setMode(event.detail?.section || '');
    if (event.detail?.section === 'platform-overview' || event.detail?.section === 'health') load(false);
  });
  window.addEventListener('popstate',() => {
    const tower = document.getElementById(MODULE_ID);
    if (tower && window.EKODIAdminPanels?.current?.() === 'platform-overview') activateTab(tower,routeTab(),false);
  });
  window.EKODIControlTower = Object.freeze({ load, open:openOverview, snapshot:() => snapshot, mounted:() => mounted });
})();
