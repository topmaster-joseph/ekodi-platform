(() => {
  const TITLE_MAP = {
    overview: 'Overview',
    services: 'Services',
    clients: 'Clients',
    admins: 'Admin Accounts',
    finance: 'Finance',
    communication: 'Mail & Live',
    workspace: 'Cloud & Files',
    organization: 'Organization',
    policies: 'Policies',
  };

  const NAV_MAP = {
    overview: 'Overview',
    services: 'Services',
    clients: 'Clients',
    admins: 'Admin Accounts',
    finance: 'Finance',
    communication: 'Mail & Live',
    workspace: 'Cloud & Files',
    organization: 'Organization',
  };

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function translateShell() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;

    for (const item of nav.querySelectorAll('[data-section]')) {
      const section = item.dataset.section;
      const label = NAV_MAP[section];
      const span = item.querySelector('span');
      if (label && span) span.textContent = label;
    }

    const domainLink = nav.querySelector('a[href="/legacy#domains"]');
    const activityLink = nav.querySelector('a[href="/legacy#activity"]');
    if (domainLink?.querySelector('span')) domainLink.querySelector('span').textContent = 'Domains & DNS';
    if (activityLink?.querySelector('span')) activityLink.querySelector('span').textContent = 'Activity Logs';

    const logout = document.querySelector('#logoutButton');
    if (logout) logout.textContent = 'Logout';

    setText('#pageTitle', 'Overview');
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
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('policies'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => {
        item.classList.toggle('active', item.dataset.section === 'policies');
      });
      setText('#pageTitle', 'Policies');
      document.querySelector('.sidebar')?.classList.remove('open');
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
        if (section !== 'policies' && location.hash === '#policies') history.replaceState(null, '', location.pathname);
      }, 0);
    });
  }

  function watchDynamicMenus() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    const observer = new MutationObserver(() => {
      for (const item of nav.querySelectorAll('[data-section]')) {
        const label = NAV_MAP[item.dataset.section];
        const span = item.querySelector('span');
        if (label && span && span.textContent !== label) span.textContent = label;
      }
    });
    observer.observe(nav, { childList: true, subtree: true });
  }

  function init() {
    document.body.classList.add('compact-control-center');
    translateShell();
    installPolicies();
    enforceEnglishNavigation();
    watchDynamicMenus();

    if (location.hash === '#policies') {
      setTimeout(() => document.querySelector('[data-section="policies"]')?.click(), 0);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
