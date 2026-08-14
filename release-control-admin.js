(() => {
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';

  function el(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  async function api(path) {
    const response = await fetch(`${API}${path}`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${token()}` },
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `Release API 요청 실패 (${response.status})`);
    return data;
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

  function badge(text, className = '') {
    return el('span', text, `release-badge ${className}`.trim());
  }

  function installReleaseControl() {
    if (!token()) return;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('[data-section="release"]')) return;

    const navButton = el('button', '', 'nav');
    navButton.type = 'button';
    navButton.dataset.section = 'release';
    navButton.append(document.createTextNode('◆ '), el('span', 'Release'));
    const placeholder = nav.querySelector('[data-lazy-section="release"]');
    const policies = nav.querySelector('[data-section="policies"]');
    if (placeholder) placeholder.insertAdjacentElement('beforebegin', navButton);
    else if (policies) nav.insertBefore(navButton, policies);
    else nav.append(navButton);

    const section = el('section', '', 'section release-control hidden-panel');
    section.dataset.panel = 'release';
    section.id = 'releaseControl';

    const head = el('div', '', 'release-head');
    const heading = el('div');
    heading.append(el('p', 'GUARDED PRODUCTION', 'kicker'), el('h2', 'Release Control'));
    heading.append(el('p', '배포 후보, 검증, 운영 승격과 최근 이력을 한 화면에서 확인합니다. DNS·라우팅 변경은 일반 배포와 분리되어 있습니다.', 'operations-copy'));
    const refresh = el('button', '↻ 새로고침', 'secondary release-refresh');
    refresh.type = 'button';
    head.append(heading, refresh);

    const policy = el('div', '', 'release-policy');
    const note = el('div', '배포 코드 경로는 guarded release로 잠겨 있습니다. Cloudflare 실제 권한 분리는 전용 Deploy/Topology 토큰 발급 후 마지막 단계로 전환합니다.', 'release-note');
    const stateMessage = el('div', '', 'release-state');
    const units = el('div', '', 'release-units');
    const title = el('h3', 'Recent Releases');
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
      if (!items.length) return units.append(el('div', '등록된 release unit이 없습니다.', 'release-empty'));
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

    async function load() {
      refresh.disabled = true;
      stateMessage.textContent = '';
      units.replaceChildren(el('div', 'GitHub Actions와 release gate 상태를 확인하는 중입니다.', 'release-empty'));
      runs.replaceChildren();
      try {
        const data = await api('/api/control/releases');
        renderPolicy(data);
        renderUnits(data.units || []);
        renderRuns(data.recentRuns || []);
      } catch (error) {
        stateMessage.textContent = error.message || 'Release Control 정보를 불러오지 못했습니다.';
        units.replaceChildren(el('div', '배포 관제 정보를 불러오지 못했습니다.', 'release-empty'));
      } finally {
        refresh.disabled = false;
      }
    }

    async function activate() {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('release'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'release'));
      const pageTitle = document.querySelector('#pageTitle');
      if (pageTitle) pageTitle.textContent = 'Release';
      document.querySelector('.sidebar')?.classList.remove('open');
      await load();
    }

    navButton.addEventListener('click', activate);
    refresh.addEventListener('click', load);
  }

  installReleaseControl();
})();
