(() => {
  'use strict';

  const MAP_ID = 'ekodiArchitectureMap';
  const host = document.querySelector('#ekodiSystemHealth');
  if (!host || document.getElementById(MAP_ID)) return;

  const infrastructure = [
    ['GitHub', 'Source of Truth', '코드 · 변경이력 · 배포 기준'],
    ['Cloudflare', 'Runtime', 'Pages · Workers · DNS · Edge'],
    ['D1', 'Core DB', '회원 · 권한 · 테넌트 · 운영 원장'],
    ['Supabase', 'Service Data', '서비스별 관계형 데이터 · Auth'],
    ['R2', 'Durable Storage', '파일 · 장기 백업'],
    ['Monitoring', 'Observe', '상태 · 응답속도 · 복구 검증'],
  ];
  const identityKeys = new Set(['ekodi-shell', 'my', 'admin-auth']);
  const coreKeys = new Set(['control-api', 'site-core', 'service-proxy', 'finance', 'marketing-domain-api', 'marketing-publishing-api']);

  const panel = document.createElement('article');
  panel.id = MAP_ID;
  panel.className = 'ekodi-architecture-map';
  panel.innerHTML = `
    <div class="system-map-head">
      <div>
        <small>ECOSYSTEM OPERATING MAP</small>
        <h3>에코디 시스템 맵</h3>
        <p>코드 → 실행 → 데이터 → 서비스의 연결을 기준 저장소와 현재 모니터 상태에서 읽어 표시합니다.</p>
      </div>
      <div class="system-map-actions">
        <label><span class="sr-only">서비스 검색</span><input type="search" data-system-map-search placeholder="서비스 · 도메인 · DB 검색"></label>
        <button type="button" class="secondary compact" data-system-map-refresh>↻ 새로고침</button>
      </div>
    </div>
    <div class="system-map-principle" data-system-map-principle>구조 기준을 읽는 중입니다.</div>
    <div class="system-map-summary" data-system-map-summary></div>
    <div class="system-map-infra" data-system-map-infra></div>
    <div class="system-map-groups" data-system-map-groups><p class="operations-loading">플랫폼 경계를 읽는 중입니다.</p></div>
    <div class="system-map-foot"><span data-system-map-updated>—</span><span>읽기 전용 · 비밀키/개인정보는 표시하지 않음</span></div>`;

  const divider = [...host.querySelectorAll('.system-health-divider')].find(node => node.textContent.includes('SYSTEM MAP'));
  const existingMap = divider?.nextElementSibling;
  if (existingMap) existingMap.insertAdjacentElement('beforebegin', panel);
  else host.append(panel);

  const get = selector => panel.querySelector(selector);
  const groupsNode = get('[data-system-map-groups]');
  const search = get('[data-system-map-search]');
  const refresh = get('[data-system-map-refresh]');
  let model = null;

  function productionDomains(row = {}) {
    return (row.domains || []).filter(domain => domain.endsWith('.ekodi.kr') && !domain.includes('staging'));
  }

  function statusFor(row, monitor) {
    const domains = new Set(productionDomains(row));
    const matches = (monitor?.sites || []).filter(site => domains.has(site.domain));
    if (!matches.length) return { state:'unknown', label:'미연결', detail:'모니터 항목 없음' };
    const offline = matches.filter(site => site.status === 'offline').length;
    const degraded = matches.filter(site => site.status === 'degraded').length;
    const online = matches.filter(site => site.status === 'online').length;
    const state = offline ? 'error' : degraded ? 'warn' : online === matches.length ? 'ok' : 'unknown';
    const label = state === 'ok' ? '정상' : state === 'warn' ? '주의' : state === 'error' ? '오프라인 포함' : '확인 필요';
    return { state, label, detail:`${online}/${matches.length} 정상` };
  }

  function chip(text) {
    const node = document.createElement('span');
    node.className = 'system-map-chip';
    node.textContent = text;
    return node;
  }

  function platformCard(key, row, monitor) {
    const state = statusFor(row, monitor);
    const card = document.createElement('article');
    card.className = 'system-map-platform';
    card.dataset.state = state.state;
    card.dataset.search = [key, row.kind, row.database, ...(row.domains || []), ...(row.sharedDependencies || [])].join(' ').toLowerCase();

    const top = document.createElement('div');
    top.className = 'system-map-platform-top';
    const identity = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = key;
    const kind = document.createElement('small');
    kind.textContent = row.kind || 'platform';
    identity.append(title, kind);
    const badge = document.createElement('b');
    badge.textContent = state.label;
    badge.title = state.detail;
    top.append(identity, badge);

    const domains = document.createElement('div');
    domains.className = 'system-map-domains';
    const production = productionDomains(row);
    (production.length ? production : (row.domains || []).slice(0, 2)).forEach(domain => {
      const link = document.createElement('a');
      link.href = `https://${domain}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = domain;
      domains.append(link);
    });

    const facts = document.createElement('dl');
    const database = document.createElement('div');
    const dbTerm = document.createElement('dt'); dbTerm.textContent = 'DATA';
    const dbValue = document.createElement('dd'); dbValue.textContent = row.database || 'none';
    database.append(dbTerm, dbValue);
    const deploy = document.createElement('div');
    const deployTerm = document.createElement('dt'); deployTerm.textContent = 'DEPLOY';
    const deployValue = document.createElement('dd'); deployValue.textContent = String(row.deployWorkflow || '—').split('/').pop();
    deploy.append(deployTerm, deployValue);
    facts.append(database, deploy);

    card.append(top, domains, facts);
    if (row.sharedDependencies?.length) {
      const deps = document.createElement('div');
      deps.className = 'system-map-deps';
      row.sharedDependencies.slice(0, 4).forEach(value => deps.append(chip(value)));
      card.append(deps);
    }
    return card;
  }

  function renderGroup(title, subtitle, rows, monitor) {
    const section = document.createElement('section');
    section.className = 'system-map-group';
    const head = document.createElement('div');
    head.className = 'system-map-group-head';
    const copy = document.createElement('div');
    const heading = document.createElement('h4'); heading.textContent = title;
    const note = document.createElement('p'); note.textContent = subtitle;
    copy.append(heading, note);
    const count = document.createElement('span'); count.textContent = `${rows.length}`;
    head.append(copy, count);
    const grid = document.createElement('div');
    grid.className = 'system-map-platform-grid';
    rows.forEach(([key, row]) => grid.append(platformCard(key, row, monitor)));
    section.append(head, grid);
    return section;
  }

  function applySearch() {
    const query = (search.value || '').trim().toLowerCase();
    panel.querySelectorAll('.system-map-platform').forEach(card => {
      card.hidden = Boolean(query && !card.dataset.search.includes(query));
    });
    panel.querySelectorAll('.system-map-group').forEach(group => {
      const visible = [...group.querySelectorAll('.system-map-platform')].some(card => !card.hidden);
      group.hidden = !visible;
    });
  }

  function render(boundaries, monitor) {
    const platforms = Object.entries(boundaries?.platforms || {});
    const identity = platforms.filter(([key]) => identityKeys.has(key));
    const core = platforms.filter(([key]) => coreKeys.has(key));
    const services = platforms.filter(([key]) => !identityKeys.has(key) && !coreKeys.has(key));
    const monitored = platforms.map(([, row]) => statusFor(row, monitor));
    const healthy = monitored.filter(row => row.state === 'ok').length;
    const d1 = platforms.filter(([, row]) => /\bD1\b/i.test(row.database || '')).length;
    const supabase = platforms.filter(([, row]) => /Supabase/i.test(row.database || '')).length;

    get('[data-system-map-principle]').textContent = boundaries?.principle || '공통화하되 서비스는 독립적으로 배포하고 권한을 재검증합니다.';
    const summary = get('[data-system-map-summary]');
    summary.textContent = '';
    [['등록 플랫폼', platforms.length], ['상태 정상', `${healthy}/${platforms.length}`], ['D1 연결', d1], ['Supabase 연결', supabase]].forEach(([label, value]) => {
      const item = document.createElement('div');
      const small = document.createElement('small'); small.textContent = label;
      const strong = document.createElement('strong'); strong.textContent = value;
      item.append(small, strong); summary.append(item);
    });

    const infra = get('[data-system-map-infra]');
    infra.textContent = '';
    infrastructure.forEach(([name, role, detail], index) => {
      const card = document.createElement('div');
      card.className = 'system-map-infra-card';
      card.dataset.step = String(index + 1);
      const small = document.createElement('small'); small.textContent = role;
      const strong = document.createElement('strong'); strong.textContent = name;
      const span = document.createElement('span'); span.textContent = detail;
      card.append(small, strong, span); infra.append(card);
    });

    groupsNode.textContent = '';
    groupsNode.append(
      renderGroup('Identity & Context', '사람 · 공간 · 역할을 연결하는 공통 신원 계층', identity, monitor),
      renderGroup('Shared Core', 'API · 공통 Edge · 중앙 운영 데이터와 계약', core, monitor),
      renderGroup('Platform Family', '각자 독립 배포되고 명시적 계약으로 연결되는 서비스', services, monitor),
    );
    const updated = monitor?.generatedAt ? new Date(monitor.generatedAt).toLocaleString('ko-KR') : '모니터 시각 없음';
    get('[data-system-map-updated]').textContent = `운영 상태 ${updated}`;
    model = { boundaries, monitor };
    applySearch();
  }

  async function load() {
    refresh.disabled = true;
    groupsNode.innerHTML = '<p class="operations-loading">시스템 구조와 운영 상태를 동기화하는 중입니다.</p>';
    try {
      const [boundariesResponse, monitorResponse] = await Promise.all([
        fetch('/platform-boundaries.json', { cache:'no-store' }),
        fetch('/monitor-status.json', { cache:'no-store' }),
      ]);
      if (!boundariesResponse.ok) throw new Error(`구조 기준 ${boundariesResponse.status}`);
      const boundaries = await boundariesResponse.json();
      const monitor = monitorResponse.ok ? await monitorResponse.json() : { sites:[] };
      render(boundaries, monitor);
    } catch (error) {
      groupsNode.textContent = '';
      const message = document.createElement('p');
      message.className = 'operations-error';
      message.textContent = `시스템 맵을 불러오지 못했습니다: ${error?.message || '연결 실패'}`;
      groupsNode.append(message);
    } finally {
      refresh.disabled = false;
    }
  }

  search.addEventListener('input', applySearch);
  refresh.addEventListener('click', load);
  load();
  window.EKODISystemMap = Object.freeze({ refresh: load, getModel: () => model });
})();
