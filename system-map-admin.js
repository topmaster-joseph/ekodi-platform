(() => {
  'use strict';

  const MAP_ID = 'ekodiArchitectureMap';
  const architectureHost = document.querySelector('.architecture[data-panel~="architecture"]');
  const healthHost = document.querySelector('#ekodiSystemHealth');
  const host = architectureHost || healthHost;
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
  const categoryLabels = Object.freeze({
    'community-ministry':'사람 · 공동체',
    'business-growth':'사업 · 성장',
    'knowledge-creation':'연구 · 지식 · 창작',
    'work-life':'일 · 삶',
    'communication-cloud':'소통 · 클라우드',
  });

  if (architectureHost) {
    const compactStyle = document.createElement('style');
    compactStyle.id = 'ekodiArchitectureCompactStyles';
    compactStyle.textContent = `
      .architecture[data-panel~="architecture"]{max-width:none!important;padding-right:10px}
      .ekodi-structure-overview{display:grid;gap:8px;color:#182033}
      .structure-overview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #dde4ec;border-radius:12px;background:#fff}
      .structure-overview-head h2{margin:1px 0 3px;font-size:20px;line-height:1.2}.structure-overview-head p{margin:0;font-size:10px;line-height:1.35;color:#667085}
      .structure-overview-head .kicker{font-size:8px;font-weight:800;letter-spacing:.08em;color:#5b6b7f}.structure-overview-badge{flex:0 0 auto;padding:5px 8px;border:1px solid #d7e0ea;border-radius:999px;background:#f7f9fc;font-size:9px;font-weight:800;color:#344054}
      .architecture-tabs{display:flex;gap:4px;flex-wrap:wrap;padding:5px;border:1px solid #dde4ec;border-radius:10px;background:#f8fafc;position:sticky;top:0;z-index:6}.architecture-tabs button{height:29px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:#475467;font-size:10px;font-weight:750;cursor:pointer}.architecture-tabs button.active{background:#fff;color:#1557b0;box-shadow:0 1px 3px rgba(15,23,42,.12)}
      .architecture-tab-panel[hidden]{display:none!important}.architecture-tab-panel{display:grid;gap:7px}
      .structure-core-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}.structure-core-card{padding:8px;border:1px solid #dde4ec;border-radius:9px;background:#fff;min-width:0}.structure-core-card small{display:block;font-size:8px;font-weight:800;color:#667085}.structure-core-card strong{display:block;margin-top:2px;font-size:11px;line-height:1.2;overflow-wrap:anywhere}.structure-core-card span{display:block;margin-top:2px;font-size:8px;line-height:1.25;color:#667085}
      .structure-flow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;align-items:stretch}.structure-flow>div{padding:7px 8px;border:1px solid #dde4ec;border-radius:8px;background:#fbfcfe}.structure-flow small{display:block;font-size:7px;font-weight:800;color:#667085}.structure-flow strong{display:block;margin-top:1px;font-size:10px}.structure-flow span{display:block;margin-top:2px;font-size:8px;color:#667085;line-height:1.2}
      .structure-layer-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.structure-layer-grid article{padding:7px 8px;border:1px solid #e1e6ed;border-radius:8px;background:#fff}.structure-layer-grid small{display:block;font-size:7px;color:#667085}.structure-layer-grid strong{display:block;font-size:10px;margin-top:1px}.structure-layer-grid span{display:block;font-size:8px;color:#667085;line-height:1.2;margin-top:1px}
      .structure-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.structure-card,.structure-principles>div,.structure-vision{padding:8px 9px;border:1px solid #dde4ec;border-radius:9px;background:#fff}.structure-card small,.structure-vision small,.structure-principles small{font-size:7px;font-weight:800;color:#667085}.structure-card h3,.structure-vision h3{font-size:11px;margin:2px 0}.structure-card p,.structure-vision p,.structure-principles span{font-size:8px;line-height:1.3;color:#667085;margin:0}
      .structure-principles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.structure-principles strong{display:block;font-size:10px;margin:1px 0}
      .structure-section-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.structure-section-head h3{font-size:12px;margin:1px 0}.structure-section-head p{font-size:8px;margin:0;color:#667085}.structure-service-registry{padding:8px;border:1px solid #dde4ec;border-radius:9px;background:#fff}
      .structure-service-group h4{margin:6px 0 4px;font-size:9px}.structure-service-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.structure-service-card{padding:6px 7px;border:1px solid #e1e6ed;border-radius:7px;text-decoration:none;color:inherit;background:#fbfcfe}.structure-service-card strong{font-size:9px}.structure-service-card small,.structure-service-card span{display:block;font-size:7px;color:#667085;line-height:1.2}
      @media(max-width:1100px){.structure-core-grid,.structure-flow{grid-template-columns:repeat(3,minmax(0,1fr))}.structure-service-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:680px){.structure-overview-head{display:block}.structure-overview-badge{display:inline-flex;margin-top:6px}.architecture-tabs{top:0;overflow-x:auto;flex-wrap:nowrap}.architecture-tabs button{white-space:nowrap}.structure-core-grid,.structure-flow,.structure-layer-grid,.structure-columns,.structure-principles,.structure-service-grid{grid-template-columns:1fr 1fr}.architecture[data-panel~="architecture"]{padding-right:0}}
      @media(max-width:430px){.structure-core-grid,.structure-flow,.structure-layer-grid,.structure-columns,.structure-principles,.structure-service-grid{grid-template-columns:1fr}}
    `;
    document.head.append(compactStyle);
    architectureHost.innerHTML = `
      <div class="ekodi-structure-overview">
        <div class="structure-overview-head">
          <div><p class="kicker">EKODI ECOSYSTEM</p><h2>에코디 시스템 구조 개요</h2><p>인증·데이터·운영 기반을 공유하고, 각 전문 공간은 독립적으로 책임지는 구조입니다.</p></div>
          <div class="structure-overview-badge">공간은 분리하되 기반은 공유한다</div>
        </div>
        <nav class="architecture-tabs" aria-label="시스템 구조 보기">
          <button type="button" class="active" data-architecture-tab="overview">전체 구조</button>
          <button type="button" data-architecture-tab="user">사용자</button>
          <button type="button" data-architecture-tab="admin">관리자</button>
          <button type="button" data-architecture-tab="data">데이터·인프라</button>
          <button type="button" data-architecture-tab="services">서비스 공간</button>
        </nav>
        <section class="architecture-tab-panel" data-architecture-panel="overview">
          <div class="structure-core-grid" aria-label="핵심 구조">
            <article class="structure-core-card"><small>ROOT</small><strong>ekodi.kr</strong><span>생태계 허브 · 정문</span></article>
            <article class="structure-core-card"><small>IDENTITY</small><strong>/auth</strong><span>Google 인증 · 권한</span></article>
            <article class="structure-core-card"><small>SPACES</small><strong>전문 공간</strong><span>서비스 · 고객별 독립 책임</span></article>
            <article class="structure-core-card"><small>PERSONAL</small><strong>/my</strong><span>개인 활동 · 서비스 여정</span></article>
            <article class="structure-core-card"><small>ADMIN</small><strong>/admin</strong><span>통합 관제 · 운영 통제</span></article>
            <article class="structure-core-card"><small>INFRA</small><strong>Cloud + Data</strong><span>배포 · 저장 · 관측</span></article>
          </div>
          <div class="structure-flow" aria-label="에코디 연결 구조">
            <div><small>01</small><strong>사용자</strong><span>공개 페이지 · 로그인</span></div><div><small>02</small><strong>인증</strong><span>Google · 역할 · 권한</span></div><div><small>03</small><strong>서비스 공간</strong><span>Church · Biz · Trade 등</span></div><div><small>04</small><strong>관리자</strong><span>사이트 관리자 · 최고관리자</span></div><div><small>05</small><strong>데이터</strong><span>D1 · Supabase · Drive · R2</span></div><div><small>06</small><strong>배포·관측</strong><span>GitHub · Cloudflare · Monitor</span></div>
          </div>
          <div class="structure-principles"><div><small>운영 계약</small><strong>Person + Space + Role + Capability</strong><span>누가 · 어느 공간에서 · 어떤 역할로 · 무엇을 할 수 있는지</span></div><div><small>성장 경험</small><strong>Identity + Space + Data + AI + Journey</strong><span>활동 데이터와 AI가 다음 여정을 돕는 구조</span></div></div>
        </section>
        <section class="architecture-tab-panel" data-architecture-panel="user" hidden>
          <article class="structure-card"><small>USER VIEW</small><h3>사용자는 시스템을 몰라도 됩니다</h3><p>로그인 전 공개 서비스를 이용하고, 로그인 후에는 해당 사이트의 로컬 마이페이지와 허용된 기능으로 바로 연결됩니다.</p></article>
          <div class="structure-layer-grid"><article><small>공개</small><strong>로그인 전 접근</strong><span>관리자 제외 사용자 서비스 공개</span></article><article><small>인증</small><strong>ekodi.kr/auth</strong><span>통합 인증 · 회원 · 권한</span></article><article><small>개인화</small><strong>사이트 로컬 마이페이지</strong><span>현재 서비스 문맥 유지</span></article></div>
        </section>
        <section class="architecture-tab-panel" data-architecture-panel="admin" hidden>
          <article class="structure-card"><small>ADMIN VIEW</small><h3>ekodi.kr/admin은 통합 관제탑입니다</h3><p>회원 · 권한 · 고객 · 콘텐츠 · AI · 데이터 · 배포 · 장애 · 로그를 하나의 운영 관점에서 연결합니다.</p></article>
          <div class="structure-layer-grid"><article><small>최고관리자</small><strong>/admin</strong><span>플랫폼 전역 정책 · 상태 · 배포</span></article><article><small>사이트 관리자</small><strong>/{site}/admin</strong><span>사이트별 업무 · 콘텐츠 · 권한</span></article><article><small>라우팅</small><strong>고유 URL</strong><span>새로고침 · 직접 진입 상태 복원</span></article></div>
        </section>
        <section class="architecture-tab-panel" data-architecture-panel="data" hidden>
          <div class="structure-layer-grid"><article><small>CORE DB</small><strong>D1</strong><span>회원 · 권한 · 운영 원장</span></article><article><small>SERVICE DATA</small><strong>Supabase / PostgreSQL</strong><span>서비스별 관계형 데이터</span></article><article><small>FILES</small><strong>Google Drive + R2</strong><span>원본 · 웹 파일 · 백업</span></article><article><small>SOURCE</small><strong>GitHub</strong><span>코드 · 버전 · 복구 기준</span></article><article><small>RUNTIME</small><strong>Cloudflare</strong><span>Pages · Workers · DNS · Edge</span></article><article><small>OBSERVE</small><strong>Monitoring</strong><span>상태 · 응답 · 장애 · 복구 확인</span></article></div>
        </section>
        <section class="architecture-tab-panel" data-architecture-panel="services" hidden>
          <section class="structure-service-registry" aria-labelledby="structureServiceRegistryTitle"><div class="structure-section-head"><div><small>SERVICE REGISTRY</small><h3 id="structureServiceRegistryTitle">에코디 서비스 공간</h3><p>서비스 기준정보에서 자동으로 읽습니다.</p></div><span data-structure-service-count>—</span></div><div class="structure-service-groups" data-structure-service-groups><p class="operations-loading">서비스 기준정보를 읽는 중입니다.</p></div></section>
        </section>
      </div>`;
    const tabButtons = [...architectureHost.querySelectorAll('[data-architecture-tab]')];
    const tabPanels = [...architectureHost.querySelectorAll('[data-architecture-panel]')];
    tabButtons.forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.architectureTab;
      tabButtons.forEach(item => item.classList.toggle('active', item === button));
      tabPanels.forEach(panelNode => { panelNode.hidden = panelNode.dataset.architecturePanel !== key; });
    }));
  }

  const panel = document.createElement('article');
  panel.id = MAP_ID;
  panel.className = 'ekodi-architecture-map';
  panel.innerHTML = `
    <div class="system-map-head">
      <div>
        <small>LIVE SYSTEM MAP · AUTO SYNC</small>
        <h3>현재 운영 구조</h3>
        <p>플랫폼 경계 · 배포 계약 · 데이터 위치 · 모니터 상태를 기준 저장소에서 읽어 표시합니다. 구조 기준이 바뀌면 다음 배포부터 이 지도가 함께 갱신됩니다.</p>
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

  if (architectureHost) architectureHost.append(panel);
  else {
    const divider = [...healthHost.querySelectorAll('.system-health-divider')].find(node => node.textContent.includes('SYSTEM MAP'));
    const existingMap = divider?.nextElementSibling;
    if (existingMap) existingMap.insertAdjacentElement('beforebegin', panel);
    else healthHost.append(panel);
  }

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
    const title = document.createElement('strong'); title.textContent = key;
    const kind = document.createElement('small'); kind.textContent = row.kind || 'platform';
    identity.append(title, kind);
    const badge = document.createElement('b'); badge.textContent = state.label; badge.title = state.detail;
    top.append(identity, badge);

    const domains = document.createElement('div');
    domains.className = 'system-map-domains';
    const production = productionDomains(row);
    (production.length ? production : (row.domains || []).slice(0, 2)).forEach(domain => {
      const link = document.createElement('a');
      link.href = `https://${domain}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = domain;
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
      const deps = document.createElement('div'); deps.className = 'system-map-deps';
      row.sharedDependencies.slice(0, 4).forEach(value => deps.append(chip(value)));
      card.append(deps);
    }
    return card;
  }

  function renderGroup(title, subtitle, rows, monitor) {
    const section = document.createElement('section'); section.className = 'system-map-group';
    const head = document.createElement('div'); head.className = 'system-map-group-head';
    const copy = document.createElement('div');
    const heading = document.createElement('h4'); heading.textContent = title;
    const note = document.createElement('p'); note.textContent = subtitle;
    copy.append(heading, note);
    const count = document.createElement('span'); count.textContent = `${rows.length}`;
    head.append(copy, count);
    const grid = document.createElement('div'); grid.className = 'system-map-platform-grid';
    rows.forEach(([key, row]) => grid.append(platformCard(key, row, monitor)));
    section.append(head, grid);
    return section;
  }

  function renderServiceRegistry(registry) {
    if (!architectureHost) return;
    const root = architectureHost.querySelector('[data-structure-service-groups]');
    const count = architectureHost.querySelector('[data-structure-service-count]');
    if (!root) return;
    const services = Array.isArray(registry?.services) ? [...registry.services].sort((a, b) => Number(a.order || 9999) - Number(b.order || 9999)) : [];
    if (count) count.textContent = `${services.length}개`;
    root.textContent = '';
    if (!services.length) {
      root.innerHTML = '<p class="operations-loading">등록된 서비스가 없습니다.</p>';
      return;
    }
    const groups = new Map();
    services.forEach(service => {
      const key = service.category || 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(service);
    });
    for (const [category, rows] of groups) {
      const group = document.createElement('section'); group.className = 'structure-service-group';
      const title = document.createElement('h4'); title.textContent = categoryLabels[category] || category;
      const grid = document.createElement('div'); grid.className = 'structure-service-grid';
      rows.forEach(service => {
        const card = document.createElement('a');
        card.className = 'structure-service-card';
        card.href = service.url || `https://${service.label || ''}`; card.target = '_blank'; card.rel = 'noopener noreferrer';
        const top = document.createElement('div');
        const name = document.createElement('strong'); name.textContent = service.name || service.nameEn || service.id;
        const badge = document.createElement('b'); badge.dataset.state = service.status || 'planned'; badge.textContent = service.status || 'planned';
        top.append(name, badge);
        const domain = document.createElement('small'); domain.textContent = service.label || service.url || '';
        const desc = document.createElement('span'); desc.textContent = service.descriptionKo || service.descriptionEn || '';
        card.append(top, domain, desc); grid.append(card);
      });
      group.append(title, grid); root.append(group);
    }
  }

  function applySearch() {
    const query = (search.value || '').trim().toLowerCase();
    panel.querySelectorAll('.system-map-platform').forEach(card => { card.hidden = Boolean(query && !card.dataset.search.includes(query)); });
    panel.querySelectorAll('.system-map-group').forEach(group => {
      const visible = [...group.querySelectorAll('.system-map-platform')].some(card => !card.hidden);
      group.hidden = !visible;
    });
  }

  function render(boundaries, monitor, registry) {
    const platforms = Object.entries(boundaries?.platforms || {});
    const identity = platforms.filter(([key]) => identityKeys.has(key));
    const core = platforms.filter(([key]) => coreKeys.has(key));
    const services = platforms.filter(([key]) => !identityKeys.has(key) && !coreKeys.has(key));
    const monitored = platforms.map(([, row]) => statusFor(row, monitor));
    const healthy = monitored.filter(row => row.state === 'ok').length;
    const d1 = platforms.filter(([, row]) => /\bD1\b/i.test(row.database || '')).length;
    const supabase = platforms.filter(([, row]) => /Supabase/i.test(row.database || '')).length;

    get('[data-system-map-principle]').textContent = boundaries?.principle || '공통화하되 서비스는 독립적으로 배포하고 권한을 재검증합니다.';
    const summary = get('[data-system-map-summary]'); summary.textContent = '';
    [['등록 플랫폼', platforms.length], ['상태 정상', `${healthy}/${platforms.length}`], ['D1 연결', d1], ['Supabase 연결', supabase]].forEach(([label, value]) => {
      const item = document.createElement('div');
      const small = document.createElement('small'); small.textContent = label;
      const strong = document.createElement('strong'); strong.textContent = value;
      item.append(small, strong); summary.append(item);
    });

    const infra = get('[data-system-map-infra]'); infra.textContent = '';
    infrastructure.forEach(([name, role, detail], index) => {
      const card = document.createElement('div'); card.className = 'system-map-infra-card'; card.dataset.step = String(index + 1);
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
    get('[data-system-map-updated]').textContent = `운영 상태 ${updated} · 구조 v${boundaries?.version ?? '—'} · 서비스 레지스트리 v${registry?.version ?? '—'}`;
    model = { boundaries, monitor, registry };
    renderServiceRegistry(registry);
    applySearch();
  }

  async function load() {
    refresh.disabled = true;
    groupsNode.innerHTML = '<p class="operations-loading">시스템 구조와 운영 상태를 동기화하는 중입니다.</p>';
    try {
      const [boundariesResponse, monitorResponse, registryResponse] = await Promise.all([
        fetch('/platform-boundaries.json', { cache:'no-store' }),
        fetch('/monitor-status.json', { cache:'no-store' }),
        fetch('/ecosystem-services.json', { cache:'no-store' }),
      ]);
      if (!boundariesResponse.ok) throw new Error(`구조 기준 ${boundariesResponse.status}`);
      const boundaries = await boundariesResponse.json();
      const monitor = monitorResponse.ok ? await monitorResponse.json() : { sites:[] };
      const registry = registryResponse.ok ? await registryResponse.json() : { services:[] };
      render(boundaries, monitor, registry);
    } catch (error) {
      groupsNode.textContent = '';
      const message = document.createElement('p'); message.className = 'operations-error';
      message.textContent = `시스템 구조 개요를 불러오지 못했습니다: ${error?.message || '연결 실패'}`;
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
