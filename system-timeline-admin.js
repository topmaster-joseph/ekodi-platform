(() => {
  'use strict';

  const REPOSITORY = 'topmaster-joseph/ekodi-platform';
  const API = `https://api.github.com/repos/${REPOSITORY}`;
  const CACHE_MS = 90 * 1000;
  const DEPLOY_WORKFLOW_RE = /(deploy|release|sync|publish|production|staging)/i;
  const DEPLOY_SUCCESS_RE = /(deploy-admin-site\.yml|shared site|admin site|production)/i;
  let cache = null;
  let cacheAt = 0;
  let installing = false;

  function el(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function shortSha(value) { return String(value || '').slice(0, 8) || '—'; }
  function when(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ko-KR', { dateStyle:'short', timeStyle:'short' });
  }
  function request(path) {
    return fetch(`${API}${path}`, {
      cache:'no-store',
      headers:{ accept:'application/vnd.github+json', 'x-github-api-version':'2022-11-28' },
    }).then(async response => {
      if (!response.ok) throw new Error(`GitHub ${path} (${response.status})`);
      return response.json();
    });
  }

  function classify(text = '') {
    const value = String(text).toLowerCase();
    if (/(dns|domain|route|worker|cloudflare|gateway|emergency|failover)/.test(value)) return 'Infrastructure';
    if (/(security|auth|permission|credential|token|login)/.test(value)) return 'Security';
    if (/(migration|database|d1|supabase|schema|sql)/.test(value)) return 'Data';
    if (/(deploy|release|production|staging|rollback)/.test(value)) return 'Deployment';
    if (/(fix|bug|repair|hotfix)/.test(value)) return 'Fix';
    if (/(feat|feature|add|ui|screen|admin)/.test(value)) return 'Feature';
    return 'Change';
  }

  function summary(text = '') {
    const first = String(text || '').split('\n')[0].trim();
    return first.replace(/^(feat|fix|chore|ci|docs|refactor|test|perf)(\([^)]*\))?:\s*/i, '').slice(0, 140) || 'Program change';
  }

  function normalizeCommit(commit) {
    const message = commit.commit?.message || '';
    return {
      key:`commit-${commit.sha}`,
      at:commit.commit?.committer?.date || commit.commit?.author?.date,
      kind:classify(message),
      source:'GitHub Commit',
      title:summary(message),
      detail:`${shortSha(commit.sha)} · ${commit.commit?.committer?.name || commit.commit?.author?.name || 'unknown'}`,
      status:'Recorded',
      url:commit.html_url,
    };
  }

  function normalizeRun(run) {
    const text = `${run.name || ''} ${run.path || ''} ${run.display_title || ''}`;
    return {
      key:`run-${run.id}`,
      at:run.updated_at || run.created_at,
      kind:classify(text),
      source:'GitHub Actions',
      title:summary(run.display_title || run.name || 'Workflow run'),
      detail:`${run.name || 'Workflow'} #${run.run_number || '—'} · ${shortSha(run.head_sha)}`,
      status:run.status === 'completed' ? (run.conclusion || 'completed') : (run.status || 'running'),
      url:run.html_url,
    };
  }

  function normalizePull(pr) {
    return {
      key:`pr-${pr.id}`,
      at:pr.merged_at || pr.closed_at || pr.updated_at || pr.created_at,
      kind:classify(pr.title),
      source:'Pull Request',
      title:summary(pr.title),
      detail:`PR #${pr.number} · ${pr.merged_at ? 'merged' : pr.state}${pr.draft ? ' · draft' : ''}`,
      status:pr.merged_at ? 'Merged' : (pr.draft ? 'Draft' : pr.state),
      url:pr.html_url,
    };
  }

  async function load(force = false) {
    if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
    const [current, commits, runsRaw, pulls] = await Promise.all([
      request('/commits/main'),
      request('/commits?sha=main&per_page=30'),
      request('/actions/runs?branch=main&per_page=60'),
      request('/pulls?state=all&sort=updated&direction=desc&per_page=25'),
    ]);
    const runs = (runsRaw.workflow_runs || []).filter(run => DEPLOY_WORKFLOW_RE.test(`${run.name || ''} ${run.path || ''}`));
    const lastKnownGood = runs.find(run => run.status === 'completed' && run.conclusion === 'success' && DEPLOY_SUCCESS_RE.test(`${run.name || ''} ${run.path || ''} ${run.display_title || ''}`))
      || runs.find(run => run.status === 'completed' && run.conclusion === 'success')
      || null;
    const events = [
      ...commits.map(normalizeCommit),
      ...runs.slice(0, 25).map(normalizeRun),
      ...pulls.slice(0, 20).map(normalizePull),
    ].filter(event => event.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 50);
    cache = { current, lastKnownGood, lastChange:commits[0] || null, events, generatedAt:new Date().toISOString() };
    cacheAt = Date.now();
    return cache;
  }

  function statusClass(value = '') {
    const v = String(value).toLowerCase();
    if (/(success|merged|recorded|completed)/.test(v)) return 'ok';
    if (/(failure|cancel|error)/.test(v)) return 'bad';
    if (/(draft|queued|progress|pending|running)/.test(v)) return 'wait';
    return 'neutral';
  }

  function renderCards(root, data) {
    const cards = root.querySelector('[data-system-timeline-cards]');
    cards.replaceChildren();
    const current = data.current;
    const lkg = data.lastKnownGood;
    const last = data.lastChange;
    const items = [
      ['Current Version', shortSha(current?.sha), summary(current?.commit?.message), current?.html_url],
      ['Last Known Good', lkg ? shortSha(lkg.head_sha) : '—', lkg ? `${lkg.name} #${lkg.run_number} · ${when(lkg.updated_at)}` : 'Verified production deployment not found', lkg?.html_url],
      ['Last Change', last ? when(last.commit?.committer?.date || last.commit?.author?.date) : '—', last ? summary(last.commit?.message) : 'No commit record', last?.html_url],
    ];
    for (const [label, value, detail, url] of items) {
      const card = el('article', '', 'system-timeline-card');
      card.append(el('small', label), el('strong', value), el('span', detail || '—'));
      if (url) { const link = el('a', 'Open ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; card.append(link); }
      cards.append(card);
    }
  }

  function renderEvents(root, events) {
    const list = root.querySelector('[data-system-timeline-list]');
    list.replaceChildren();
    if (!events.length) return list.append(el('div', '기록을 찾지 못했습니다.', 'system-timeline-empty'));
    for (const event of events) {
      const row = el('article', '', 'system-timeline-row');
      const time = el('time', when(event.at));
      const body = el('div', '', 'system-timeline-body');
      const top = el('div', '', 'system-timeline-top');
      top.append(el('span', event.kind, 'system-timeline-kind'), el('span', event.source, 'system-timeline-source'));
      body.append(top, el('strong', event.title), el('small', event.detail));
      const state = el('span', event.status, `system-timeline-state ${statusClass(event.status)}`);
      if (event.url) {
        const link = el('a', '↗', 'system-timeline-link'); link.href = event.url; link.target = '_blank'; link.rel = 'noopener';
        row.append(time, body, state, link);
      } else row.append(time, body, state);
      list.append(row);
    }
  }

  async function refresh(root, force = false) {
    const state = root.querySelector('[data-system-timeline-state]');
    state.textContent = 'GitHub 운영 원장을 불러오는 중…';
    try {
      const data = await load(force);
      renderCards(root, data);
      renderEvents(root, data.events);
      state.textContent = `GitHub 원본 · ${when(data.generatedAt)} 갱신 · 읽기 전용`;
    } catch (error) {
      state.textContent = `System Timeline 조회 실패: ${error.message}`;
    }
  }

  function install() {
    if (installing || document.querySelector('#systemTimeline')) return;
    const release = document.querySelector('#releaseControl');
    if (!release) return;
    installing = true;
    const root = el('section', '', 'system-timeline');
    root.id = 'systemTimeline';
    const head = el('div', '', 'system-timeline-head');
    const copy = el('div');
    copy.append(el('p', 'OPERATIONS BLACK BOX', 'kicker'), el('h3', 'System Timeline'));
    copy.append(el('p', 'GitHub PR·commit·배포 기록을 하나의 운영 변경 원장으로 읽어옵니다. 별도 수기 이력 DB를 만들지 않습니다.', 'operations-copy'));
    const refreshButton = el('button', '↻ Refresh', 'secondary');
    refreshButton.type = 'button';
    head.append(copy, refreshButton);
    const cards = el('div', '', 'system-timeline-cards'); cards.dataset.systemTimelineCards = 'true';
    const state = el('div', '', 'system-timeline-meta'); state.dataset.systemTimelineState = 'true';
    const list = el('div', '', 'system-timeline-list'); list.dataset.systemTimelineList = 'true';
    root.append(head, cards, state, list);

    const recentTitle = Array.from(release.querySelectorAll('h3')).find(node => /recent deployments/i.test(node.textContent || ''));
    if (recentTitle) release.insertBefore(root, recentTitle); else release.append(root);
    refreshButton.addEventListener('click', () => refresh(root, true));
    refresh(root);
    installing = false;
  }

  const observer = new MutationObserver(() => install());
  observer.observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();
})();

(() => {
  'use strict';

  const ROUTES = new Set(['overview','decisions','ecosystem','ai-council','system']);
  const SYSTEM_TOOLS = [
    { key:'operations', label:'Operations', copy:'기존 통합 운영 · 서비스 상태 · 자동점검', section:'campus', fallback:'overview', icon:'◈' },
    { key:'deployments', label:'Deployments', copy:'Staging · 배포 · Last Known Good · 롤백', section:'deployments', icon:'↑' },
    { key:'timeline', label:'System Timeline', copy:'PR · commit · 배포 · 장애 변경원장', section:'deployments', timeline:true, icon:'≡' },
    { key:'finance', label:'Finance', copy:'결제 · 회계 · 비용 · 정산 상세', section:'finance', icon:'₩' },
    { key:'communication', label:'Communication', copy:'메일 · 라이브 운영 상세', section:'communication', icon:'✦' },
    { key:'workspace', label:'Workspace', copy:'클라우드 · 자료 · 운영도구', section:'workspace', icon:'▣' },
    { key:'organization', label:'Organization', copy:'조직 · 사업 운영 상세', section:'organization', icon:'◫' },
    { key:'domains', label:'Domains · DNS', copy:'도메인 · DNS · 고급 네트워크 관리', href:'/legacy#domains', icon:'◎' },
    { key:'activity', label:'Audit · Activity', copy:'운영 기록 · 감사 로그', href:'/legacy#activity', icon:'•' },
    { key:'emergency', label:'Emergency', copy:'독립 Emergency Console 직접 열기', href:'https://ekodi-admin-staging.topmaster-joseph.workers.dev/emergency', external:true, icon:'!' },
  ];

  let bound = false;
  const $ = selector => document.querySelector(selector);

  function clickSection(section, fallback = '') {
    const nav = $('.sidebar nav');
    const target = nav?.querySelector(`[data-section="${section}"]`) || (fallback ? nav?.querySelector(`[data-section="${fallback}"]`) : null);
    target?.click();
    return Boolean(target);
  }

  function setTitle(value) {
    const title = $('#pageTitle');
    if (title) title.textContent = value;
  }

  function ensureHub() {
    let hub = $('#governanceSystemHub');
    if (hub) return hub;
    const content = $('.content');
    if (!content) return null;
    hub = document.createElement('section');
    hub.id = 'governanceSystemHub';
    hub.className = 'section governance-system-hub hidden-panel';
    hub.dataset.panel = 'governance-system';
    hub.innerHTML = `
      <div class="governance-system-head">
        <div><p class="kicker">SYSTEM · TECHNICAL OPERATIONS</p><h2>System</h2><p>AI가 일상 운영을 맡고, 필요할 때만 기술 상세·배포·복구·감사 도구로 내려갑니다.</p></div>
        <span>Operations is now a detail surface</span>
      </div>
      <div class="governance-system-grid"></div>`;
    const grid = hub.querySelector('.governance-system-grid');
    for (const tool of SYSTEM_TOOLS) {
      const item = document.createElement(tool.href ? 'a' : 'button');
      item.className = 'governance-system-tool';
      if (tool.href) {
        item.href = tool.href;
        if (tool.external) { item.target = '_blank'; item.rel = 'noopener'; }
      } else item.type = 'button';
      item.dataset.systemTool = tool.key;
      item.innerHTML = `<span>${tool.icon}</span><div><strong>${tool.label}</strong><small>${tool.copy}</small></div><b>→</b>`;
      if (!tool.href) item.addEventListener('click', () => openSystemTool(tool));
      grid.append(item);
    }
    content.prepend(hub);
    return hub;
  }

  function hidePanels() {
    document.querySelectorAll('.content [data-panel]').forEach(panel => {
      panel.classList.add('hidden-panel');
      if ('hidden' in panel) panel.hidden = true;
    });
  }

  function showSystemHub(updateHash = true) {
    const hub = ensureHub();
    if (!hub) return;
    document.body.classList.add('governance-system-open');
    hidePanels();
    hub.classList.remove('hidden-panel');
    hub.hidden = false;
    setTitle('System');
    markPrimary('system');
    if (updateHash && location.hash !== '#system') history.replaceState(null, '', '#system');
  }

  function openSystemTool(tool) {
    document.body.classList.add('governance-system-open');
    const opened = clickSection(tool.section, tool.fallback || '');
    if (!opened) return showSystemHub();
    setTitle(`System · ${tool.label}`);
    markPrimary('system');
    history.replaceState(null, '', `#system/${tool.key}`);
    if (tool.timeline) window.setTimeout(() => $('#systemTimeline')?.scrollIntoView({ behavior:'smooth', block:'start' }), 120);
  }

  function markPrimary(key) {
    document.querySelectorAll('.mission-primary-item').forEach(button => {
      button.classList.toggle('active', button.dataset.missionRoute === key || (key === 'ai-council' && button.dataset.missionRoute === 'council'));
    });
  }

  function clickGovernanceRoute(key) {
    const routeKey = key === 'ai-council' ? 'council' : key;
    const button = document.querySelector(`.mission-primary-item[data-mission-route="${routeKey}"]`);
    if (!button) return false;
    button.click();
    markPrimary(key);
    return true;
  }

  function syncRoute() {
    if (!$('.mission-primary-nav')) return false;
    const raw = location.hash.replace(/^#/, '');
    if (!raw) {
      clickGovernanceRoute('overview');
      history.replaceState(null, '', '#overview');
      return true;
    }
    if (raw === 'campus') {
      const tool = SYSTEM_TOOLS.find(item => item.key === 'operations');
      if (tool) openSystemTool(tool);
      return true;
    }
    if (raw.startsWith('system/')) {
      const key = raw.split('/')[1];
      const tool = SYSTEM_TOOLS.find(item => item.key === key);
      if (tool && !tool.href) openSystemTool(tool); else showSystemHub(false);
      return true;
    }
    if (raw === 'system') { showSystemHub(false); return true; }
    if (ROUTES.has(raw)) {
      document.body.classList.remove('governance-system-open');
      clickGovernanceRoute(raw);
      return true;
    }
    clickGovernanceRoute('overview');
    history.replaceState(null, '', '#overview');
    return true;
  }

  function bindPrimaryRoutes() {
    if (bound || !$('.mission-primary-nav')) return false;
    bound = true;
    ensureHub();
    document.querySelectorAll('.mission-primary-item').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.missionRoute || 'overview';
        if (key === 'system') {
          window.setTimeout(() => showSystemHub(true), 0);
          return;
        }
        const hash = key === 'council' ? '#ai-council' : `#${key}`;
        if (location.hash !== hash) history.replaceState(null, '', hash);
      });
    });
    window.addEventListener('hashchange', syncRoute);
    window.setTimeout(syncRoute, 80);
    return true;
  }

  function install() {
    ensureHub();
    if (bindPrimaryRoutes()) return;
    const observer = new MutationObserver(() => {
      ensureHub();
      if (bindPrimaryRoutes()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();
})();
