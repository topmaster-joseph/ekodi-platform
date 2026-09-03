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
    architectureHost.innerHTML = `
      <div class="ekodi-structure-overview">
        <div class="structure-overview-head">
          <div>
            <p class="kicker">EKODI ECOSYSTEM</p>
            <h2>에코디 시스템 구조 개요</h2>
            <p>에코디는 여러 홈페이지의 묶음이 아니라 하나의 인증·데이터·운영 기반 위에 전문 공간이 연결되는 생태계형 플랫폼입니다.</p>
          </div>
          <div class="structure-overview-badge">공간은 분리하되 기반은 공유한다</div>
        </div>

        <div class="structure-flow" aria-label="에코디 시스템 기본 흐름">
          <div><small>ROOT</small><strong>ekodi.kr</strong><span>생태계 허브 · 정문</span></div><b>›</b>
          <div><small>IDENTITY</small><strong>auth.ekodi.kr</strong><span>Google 인증 · 권한</span></div><b>›</b>
          <div><small>SPACES</small><strong>전문 서비스 공간</strong><span>Church · Biz · Lab · Trade · 고객공간</span></div><b>›</b>
          <div><small>PERSONAL</small><strong>my.ekodi.kr</strong><span>나의 활동 · 서비스 · 여정</span></div>
        </div>

        <div class="structure-layer-grid" aria-label="에코디 공통 플랫폼 계층">
          <article><small>01 · 생태계 허브</small><strong>ekodi.kr</strong><span>전체 입구와 정체성</span></article>
          <article><small>02 · 전문 서비스 공간</small><strong>Church · Biz · Lab · Trade</strong><span>분야별 서비스와 고객별 공간</span></article>
          <article><small>03 · 사용자 공간</small><strong>my.ekodi.kr</strong><span>개인 중심 활동과 서비스</span></article>
          <article><small>04 · 통합 인증</small><strong>auth.ekodi.kr</strong><span>Google 인증 · 회원 · 권한</span></article>
          <article><small>05 · 통합 관리자</small><strong>admin.ekodi.kr</strong><span>회원 · 권한 · CRM · 운영 관제</span></article>
          <article><small>06 · AI 계층</small><strong>공통 AI + 전문 AI</strong><span>상담 · 분석 · 자동화 · 맞춤 서비스</span></article>
          <article><small>07 · 데이터 계층</small><strong>D1 + Supabase/PostgreSQL</strong><span>공통 운영 원장과 서비스별 데이터</span></article>
          <article><small>08 · 파일 · 콘텐츠</small><strong>Google Drive + Cloudflare R2</strong><span>원본 보관 · 웹 파일 · 백업 복제</span></article>
          <article><small>09 · 실행 · 배포</small><strong>Cloudflare</strong><span>Pages · Workers · DNS · Edge</span></article>
          <article><small>10 · 기준 저장소</small><strong>GitHub</strong><span>코드 · 버전 · 변경이력 · 복구 기준</span></article>
          <article><small>11 · 업무 인프라</small><strong>Google Workspace</strong><span>메일 · Drive · 문서 · 협업</span></article>
        </div>

        <div class="structure-columns">
          <article class="structure-card">
            <small>USER VIEW</small><h3>사용자는 시스템을 몰라도 됩니다</h3>
            <p>로그인하면 자신에게 허용된 공간만 보이고, 서비스 종류·서버 구조·권한 체계를 사용자가 따로 이해할 필요가 없도록 합니다.</p>
            <div class="structure-mini-flow"><span>ekodi.kr</span><b>›</b><span>Google 로그인</span><b>›</b><span>auth.ekodi.kr</span><b>›</b><span>허용된 공간</span><b>›</b><span>my.ekodi.kr</span></div>
          </article>
          <article class="structure-card">
            <small>ADMIN VIEW</small><h3>admin.ekodi.kr은 관제탑입니다</h3>
            <p>회원 · 인증/권한 · 공간 · 고객 · CRM · 콘텐츠 · AI · 이용량 · 결제 · 파일 · 시스템 상태 · 로그를 하나의 운영 관점에서 연결합니다.</p>
            <div class="structure-tags"><span>회원</span><span>권한</span><span>공간</span><span>CRM</span><span>AI</span><span>결제</span><span>파일</span><span>상태</span><span>로그</span></div>
          </article>
        </div>

        <div class="structure-columns">
          <article class="structure-card">
            <small>INTERNAL ECOSYSTEM</small><h3>내부 생태계</h3>
            <p>EKODI · Church · Biz · Lab · Trade · Publishing · Cafe 등은 공통 기반을 공유하면서 각 공간의 책임과 배포 경계를 유지합니다.</p>
          </article>
          <article class="structure-card">
            <small>EXTERNAL CUSTOMERS</small><h3>외부 고객 전문공간</h3>
            <p>Jadam · PizzaMaru · CGMA 등 고객 서비스는 승인된 사용자와 관계자에게 필요한 데이터·CRM·전문 AI만 노출하는 독립 공간으로 운영합니다.</p>
          </article>
        </div>

        <div class="structure-principles">
          <div><small>운영 계약</small><strong>Person + Space + Role + Capability</strong><span>누가 · 어느 공간에서 · 어떤 역할로 · 무엇을 할 수 있는지</span></div>
          <div><small>성장 경험</small><strong>Identity + Space + Data + AI + Journey</strong><span>사람이 공간에서 활동하고 데이터가 쌓이며 AI가 다음 여정을 돕는 구조</span></div>
        </div>

        <div class="structure-vision">
          <small>LONG-TERM DIRECTION</small>
          <h3>에코디 생태계 OS</h3>
          <p>새 서비스마다 서버와 인증을 다시 만드는 대신, 공통 기반에 새로운 ‘공간’을 꽂는 플러그인형 구조로 확장합니다. 교회·비즈니스·교육·연구·출판·상권·기업 맞춤형 AI가 같은 뿌리 위에서 서로 독립적으로 움직이는 것이 목표입니다.</p>
        </div>

        <section class="structure-service-registry" aria-labelledby="structureServiceRegistryTitle">
          <div class="structure-section-head"><div><small>SERVICE REGISTRY</small><h3 id="structureServiceRegistryTitle">에코디 서비스 공간</h3><p>서비스 기준정보에서 자동으로 읽습니다.</p></div><span data-structure-service-count>—</span></div>
          <div class="structure-service-groups" data-structure-service-groups><p class="operations-loading">서비스 기준정보를 읽는 중입니다.</p></div>
        </section>
      </div>`;
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
        const card = document.createElement('article');
        card.className = 'structure-service-card';
        const top = document.createElement('div');
        const name = document.createElement('strong'); name.textContent = service.name || service.nameEn || service.id;
        const badge = document.createElement('b'); badge.dataset.state = service.status || 'planned'; badge.textContent = service.status || 'planned';
        top.append(name, badge);
        const domain = document.createElement('small'); domain.textContent = service.label || service.url || '';
        const desc = document.createElement('span'); desc.textContent = service.descriptionKo || service.descriptionEn || '';
        const actions = document.createElement('nav'); actions.className = 'structure-service-actions'; actions.setAttribute('aria-label', `${name.textContent} links`);
        if (service.url) { const open = document.createElement('a'); open.href = service.url; open.target = '_blank'; open.rel = 'noopener noreferrer'; open.textContent = '서비스'; actions.append(open); }
        if (service.adminUrl) { const admin = document.createElement('a'); admin.href = service.adminUrl; admin.target = '_blank'; admin.rel = 'noopener noreferrer'; admin.dataset.adminEntry = service.id; admin.textContent = '관리'; actions.append(admin); }
        card.append(top, domain, desc, actions); grid.append(card);
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
