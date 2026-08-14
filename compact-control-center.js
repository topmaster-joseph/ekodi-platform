(() => {
  const TITLE_MAP = {
    campus: 'Campus',
    overview: 'Operations',
    services: 'Services',
    clients: 'Clients',
    admins: 'Admin Accounts',
    books: 'Books',
    finance: 'Finance',
    affiliates: 'Affiliates',
    communication: 'Mail & Live',
    workspace: 'Cloud & Files',
    organization: 'Organization',
    domains: 'Domains',
    social: 'Social',
    community: 'Community',
    policies: 'Policies',
  };

  const NAV_MAP = {
    campus: 'Campus',
    overview: 'Operations',
    services: 'Services',
    clients: 'Clients',
    admins: 'Admin Accounts',
    books: 'Books',
    finance: 'Finance',
    affiliates: 'Affiliates',
    communication: 'Mail & Live',
    workspace: 'Cloud & Files',
    organization: 'Organization',
    domains: 'Domains',
    social: 'Social',
    community: 'Community',
  };

  const CAMPUS_SERVICES = [
    { key: 'church', label: '교회', name: '에코디교회', domain: 'church.ekodi.kr', section: 'services' },
    { key: 'books', label: '출판', name: '에코디북스', domain: 'books.ekodi.kr', section: 'books', fallback: 'services' },
    { key: 'mall', label: '몰', name: '에코디몰', domain: 'mall.ekodi.kr', section: 'services' },
    { key: 'community', label: '커뮤니티', name: '에코디커뮤니티', domain: 'community.ekodi.kr', section: 'services' },
    { key: 'work', label: '일·인재', name: 'EKODI Work', domain: 'work.ekodi.kr', section: 'services' },
    { key: 'lab', label: '연구소', name: '에코디연구소', domain: 'lab.ekodi.kr', section: 'services' },
    { key: 'biz', label: '비즈', name: '에코디비즈', domain: 'biz.ekodi.kr', section: 'services' },
  ];

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function translateDynamicNavigation() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    for (const item of nav.querySelectorAll('[data-section]')) {
      const label = NAV_MAP[item.dataset.section];
      const span = item.querySelector('span');
      if (label && span && span.textContent !== label) span.textContent = label;
    }
  }

  function translateShell() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;

    translateDynamicNavigation();

    const domainLink = nav.querySelector('a[href="/legacy#domains"]');
    const activityLink = nav.querySelector('a[href="/legacy#activity"]');
    if (domainLink?.querySelector('span')) domainLink.querySelector('span').textContent = 'Domains & DNS';
    if (activityLink?.querySelector('span')) activityLink.querySelector('span').textContent = 'Activity Logs';

    const logout = document.querySelector('#logoutButton');
    if (logout) logout.textContent = 'Logout';

    setText('#pageTitle', 'Campus');
    const hero = document.querySelector('.hero[data-panel~="overview"]');
    if (hero) {
      const kicker = hero.querySelector('.kicker');
      const heading = hero.querySelector('h2');
      const copy = hero.querySelector('p:not(.kicker)');
      if (kicker) kicker.textContent = 'OPERATIONS OVERVIEW';
      if (heading) heading.textContent = 'EKODI Platform Operations';
      if (copy) copy.textContent = 'Live service health, clients and core operations in one view.';
      const actions = hero.querySelectorAll('.hero-actions a');
      if (actions[0]) actions[0].textContent = 'EKODI Home ↗';
      if (actions[1]) actions[1].textContent = 'Admin Tools ↗';
    }

    const metrics = document.querySelectorAll('.metrics[data-panel~="overview"] article');
    const metricLabels = [
      ['Live Services', 'Active'],
      ['Auto Checks', '10 min'],
      ['Systems OK', 'Live health'],
      ['Actions Required', 'Issues'],
    ];
    metrics.forEach((card, index) => {
      const [label, note] = metricLabels[index] || [];
      if (!label) return;
      const small = card.querySelector('small');
      const span = card.querySelector('span');
      if (small) small.textContent = label;
      if (span && index !== 2) span.textContent = note;
    });

    setText('#operationsTitle', 'Service Operations');
    const operationsKicker = document.querySelector('#operationsTitle')?.previousElementSibling;
    if (operationsKicker?.classList.contains('kicker')) operationsKicker.textContent = 'LIVE OPERATIONS';
    const runChecks = document.querySelector('#runHealthCheck');
    if (runChecks) runChecks.textContent = '↻ Run All Checks';

    const financeSection = document.querySelector('#financeTitle')?.closest('[data-panel]');
    if (financeSection) financeSection.dataset.panel = 'finance';
  }

  function showPanel(section) {
    document.querySelectorAll('[data-panel]').forEach(panel => {
      const targets = String(panel.dataset.panel || '').split(' ');
      panel.classList.toggle('hidden-panel', !targets.includes(section));
    });
    document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => {
      item.classList.toggle('active', item.dataset.section === section);
    });
    setText('#pageTitle', TITLE_MAP[section] || 'Campus');
    document.querySelector('.sidebar')?.classList.remove('open');
  }

  function highlightService(domain) {
    if (!domain) return;
    const focus = () => {
      const card = [...document.querySelectorAll('.service-control-card')].find(item => {
        const value = item.querySelector('.service-control-head small')?.textContent?.trim();
        return value === domain;
      });
      if (!card) return false;
      card.classList.add('campus-focus');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => card.classList.remove('campus-focus'), 2400);
      return true;
    };
    if (!focus()) window.setTimeout(focus, 500);
  }

  function openAdminSection(section, domain, fallback) {
    let button = document.querySelector(`.sidebar [data-section="${section}"]`);
    if (!button && fallback) button = document.querySelector(`.sidebar [data-section="${fallback}"]`);
    if (button) button.click();
    else showPanel(fallback || section);
    if (domain) highlightService(domain);
  }

  function campusServiceRow(service) {
    const row = document.createElement('tr');

    const type = document.createElement('td');
    type.textContent = service.label;

    const name = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = service.name;
    name.append(strong);

    const domain = document.createElement('td');
    const link = document.createElement('a');
    link.href = `https://${service.domain}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = service.domain;
    domain.append(link);

    const action = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.dataset.campusSection = service.section;
    button.dataset.campusFallback = service.fallback || '';
    button.dataset.campusService = service.domain;
    button.setAttribute('aria-label', `${service.name} 관리 메뉴 열기`);
    button.textContent = 'Manage →';
    action.append(button);

    row.append(type, name, domain, action);
    return row;
  }

  function installCampus() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return;

    let button = nav.querySelector('[data-section="campus"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav campus-nav';
      button.dataset.section = 'campus';
      button.append(document.createTextNode('⌂ '));
      const span = document.createElement('span');
      span.textContent = 'Campus';
      button.append(span);
      nav.prepend(button);
    }

    let section = document.querySelector('#campusPanel');
    if (!section) {
      section = document.createElement('section');
      section.id = 'campusPanel';
      section.className = 'section campus-panel hidden-panel';
      section.dataset.panel = 'campus';
      section.innerHTML = `
        <div class="campus-toolbar">
          <div>
            <p class="kicker">EKODI SITES</p>
            <h2>EKODI Digital Campus</h2>
            <p>사이트 목록에서 공개 화면을 열거나 관련 관리 메뉴로 바로 이동합니다.</p>
          </div>
          <div class="campus-toolbar-actions">
            <button type="button" class="secondary" data-campus-section="overview">Operations</button>
            <a class="primary" href="https://ekodi.kr" target="_blank" rel="noopener">Live Site ↗</a>
          </div>
        </div>
        <div class="finance-table-wrap campus-table-wrap">
          <table class="finance-table campus-table" aria-label="EKODI 사이트 목록">
            <thead><tr><th>Type</th><th>Service</th><th>Domain</th><th>Manage</th></tr></thead>
            <tbody id="campusServiceRows"></tbody>
          </table>
        </div>
      `;
      content.prepend(section);

      const rows = section.querySelector('#campusServiceRows');
      CAMPUS_SERVICES.forEach(service => rows.append(campusServiceRow(service)));
    }

    button.addEventListener('click', () => {
      showPanel('campus');
      if (location.hash !== '#campus') history.replaceState(null, '', '#campus');
    });

    section.addEventListener('click', event => {
      const control = event.target.closest('[data-campus-section]');
      if (!control) return;
      const target = control.dataset.campusSection;
      const domain = control.dataset.campusService || '';
      const fallback = control.dataset.campusFallback || '';
      openAdminSection(target, domain, fallback);
      if (target === 'overview') history.replaceState(null, '', '#operations');
      else if (target !== 'campus') history.replaceState(null, '', location.pathname);
    });
  }

  function policyCard(title, rule, detail) {
    const article = document.createElement('article');
    article.className = 'policy-card';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const strong = document.createElement('strong');
    strong.textContent = rule;
    const copy = document.createElement('p');
    copy.textContent = detail;
    article.append(heading, strong, copy);
    return article;
  }

  function installPolicies() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return;

    let button = nav.querySelector('[data-section="policies"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav';
      button.dataset.section = 'policies';
      button.append(document.createTextNode('◇ '));
      const span = document.createElement('span');
      span.textContent = 'Policies';
      button.append(span);
      const activity = nav.querySelector('a[href="/legacy#activity"]');
      if (activity) nav.insertBefore(button, activity);
      else nav.append(button);
    }

    let section = document.querySelector('#policiesPanel');
    if (!section) {
      section = document.createElement('section');
      section.id = 'policiesPanel';
      section.className = 'section policies-panel hidden-panel';
      section.dataset.panel = 'policies';
      section.innerHTML = `
        <div class="section-head policy-head">
          <div><p class="kicker">PLATFORM GOVERNANCE</p><h2>Operating Policies</h2></div>
          <span class="policy-version">EKODI Production Standard · v1</span>
        </div>
        <div class="policy-grid" id="policyGrid"></div>
        <div class="policy-footer"><strong>Release rule</strong><span>Code → Test → Deploy → Production Verify → Audit Log</span></div>
      `;
      content.append(section);
      const grid = section.querySelector('#policyGrid');
      grid.append(
        policyCard('Production', '검증 전 운영 반영 금지', '모든 변경은 CI를 통과하고 실제 운영 도메인의 응답까지 확인한 뒤 완료로 기록합니다.'),
        policyCard('Access', '사전등록 · 최소권한', '관리자는 승인된 Google 계정만 허용하고 역할별 최소 권한을 적용합니다.'),
        policyCard('Clients', '테넌트 완전 분리', '고객별 데이터·권한·세션을 분리하며 다른 고객 데이터에 접근할 수 없도록 서버에서 강제합니다.'),
        policyCard('AI Actions', '생성 → 승인 → 실행 → 검증', '게시·변경·외부 실행은 승인 흐름과 감사기록을 남기며 비밀키는 브라우저에 노출하지 않습니다.'),
        policyCard('Deployment', '롤백 가능한 변경만 배포', '핵심 기능은 작은 단위로 배포하고 장애 시 즉시 이전 안정 버전으로 되돌릴 수 있어야 합니다.'),
        policyCard('Incidents', '감지 → 진단 → 복구 → 기록', '장애를 숨기지 않고 원인을 확인한 뒤 복구하며 재발방지 항목을 운영규칙에 반영합니다.')
      );
    }

    button.addEventListener('click', () => {
      showPanel('policies');
      if (location.hash !== '#policies') history.replaceState(null, '', '#policies');
    });
  }

  function enforceEnglishNavigation() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav || nav.dataset.compactEnglishBound) return;
    nav.dataset.compactEnglishBound = 'true';
    nav.addEventListener('click', event => {
      const item = event.target.closest('[data-section]');
      if (!item) return;
      const section = item.dataset.section;
      setTimeout(() => {
        const title = TITLE_MAP[section];
        if (title) setText('#pageTitle', title);
        if (section === 'overview') history.replaceState(null, '', '#operations');
        else if (section === 'campus') history.replaceState(null, '', '#campus');
        else if (section !== 'policies' && ['#campus', '#operations', '#policies'].includes(location.hash)) history.replaceState(null, '', location.pathname);
      }, 0);
    });
  }

  function init() {
    document.body.classList.add('compact-control-center');
    installCampus();
    translateShell();
    installPolicies();
    enforceEnglishNavigation();
    translateDynamicNavigation();

    if (location.hash === '#policies') {
      setTimeout(() => document.querySelector('[data-section="policies"]')?.click(), 0);
    } else if (location.hash === '#operations') {
      setTimeout(() => document.querySelector('[data-section="overview"]')?.click(), 0);
    } else {
      setTimeout(() => document.querySelector('[data-section="campus"]')?.click(), 0);
    }
  }

  window.addEventListener('ekodi-feature-installed', translateDynamicNavigation);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
