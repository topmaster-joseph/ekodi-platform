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
