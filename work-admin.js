(() => {
  // Build contract marker: data-section = 'work' is the dedicated left sidebar entry.
  const TOKEN_KEY = 'ekodi-auth-token';
  const WORK_URL = 'https://work.ekodi.kr';
  const AUTH_URL = 'https://auth.ekodi.kr/?site=work';

  function el(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function actionLink(label, href, className = 'secondary') {
    const link = el('a', label, className);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  }

  function infoCard(label, value, copy = '') {
    const card = el('article', '', 'work-admin-info-card');
    card.append(el('small', label), el('strong', value));
    if (copy) card.append(el('p', copy));
    return card;
  }

  function featureCard(title, copy, actionLabel, href) {
    const card = el('article', '', 'work-admin-feature-card');
    const body = el('div');
    body.append(el('h3', title), el('p', copy));
    card.append(body, actionLink(actionLabel, href));
    return card;
  }

  function install() {
    if (!sessionStorage.getItem(TOKEN_KEY)) return;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('#workAdmin')) return;

    let navButton = nav.querySelector('[data-section="work"]');
    if (!navButton) {
      navButton = el('button', '', 'nav work-nav');
      navButton.type = 'button';
      navButton.dataset.section = 'work';
      navButton.append(document.createTextNode('W '), el('span', 'WORK'));
      const services = nav.querySelector('[data-section="services"]');
      if (services) services.insertAdjacentElement('afterend', navButton);
      else nav.prepend(navButton);
    }

    const section = el('section', '', 'section work-admin hidden-panel');
    section.id = 'workAdmin';
    section.dataset.panel = 'work';

    const layout = el('div', '', 'work-admin-layout');
    const main = el('div', '', 'work-admin-main');
    const rail = el('aside', '', 'work-admin-rail');
    rail.setAttribute('aria-label', 'WORK 관리자 메뉴');

    const head = el('header', '', 'work-admin-head');
    const headCopy = el('div');
    headCopy.append(
      el('p', 'EKODI WORK · ADMIN', 'kicker'),
      el('h2', 'WORK 운영 관리'),
      el('p', '채용공고, 지원 흐름, 프로필·사업장과 운영 보안을 한 화면에서 관리합니다.', 'operations-copy')
    );
    const headActions = el('div', '', 'work-admin-head-actions');
    headActions.append(actionLink('Open Work ↗', WORK_URL, 'primary'), actionLink('Google Auth ↗', AUTH_URL));
    head.append(headCopy, headActions);
    main.append(head);

    const views = el('div', '', 'work-admin-views');
    main.append(views);

    const viewDefs = [
      ['overview', 'Overview', '개요'],
      ['jobs', 'Jobs', '채용공고'],
      ['applicants', 'Applicants', '지원자'],
      ['profiles', 'Profiles', '프로필 · 사업장'],
      ['security', 'Operations', '운영 · 보안'],
    ];

    const panels = {};
    for (const [key] of viewDefs) {
      const panel = el('div', '', 'work-admin-view');
      panel.dataset.workView = key;
      panel.hidden = key !== 'overview';
      panels[key] = panel;
      views.append(panel);
    }

    const overviewSummary = el('div', '', 'work-admin-summary');
    overviewSummary.append(
      infoCard('PUBLIC SERVICE', 'work.ekodi.kr', '구직자와 사업주가 이용하는 운영 서비스'),
      infoCard('AUTH', 'Google · work realm', 'EKODI 중앙 인증센터와 연결'),
      infoCard('DATABASE', 'Supabase work_*', 'Work 전용 테이블과 RLS 경계'),
      infoCard('RELEASE', 'Guarded Worker', '검증 후 운영 승격하는 독립 배포')
    );
    panels.overview.append(
      el('h3', 'WORK Overview', 'work-admin-view-title'),
      el('p', 'WORK는 공개 서비스와 개인정보 영역을 분리하고, 사업주와 지원자의 권한을 각 역할에 맞게 제한합니다.', 'work-admin-view-copy'),
      overviewSummary,
      featureCard('실서비스 확인', '구직·채용 화면과 현재 공개 상태를 직접 확인합니다.', 'Work 열기 ↗', WORK_URL),
      featureCard('중앙 로그인 확인', 'WORK 전용 Google 로그인 realm과 반환 경로를 확인합니다.', 'Auth 열기 ↗', AUTH_URL)
    );

    panels.jobs.append(
      el('h3', '채용공고 관리', 'work-admin-view-title'),
      el('p', '사업장은 공고 초안을 만들고 위험표현을 점검한 뒤 게시합니다. 공개된 공고만 익명 사용자에게 노출됩니다.', 'work-admin-view-copy'),
      featureCard('공고 작성 · 게시', '사업주 계정으로 WORK에 로그인해 사업장 정보와 채용조건을 확인하고 게시합니다.', '채용 화면 열기 ↗', WORK_URL),
      featureCard('공개 공고 점검', '운영 화면에서 공개 공고의 제목, 지역, 근무형태, 급여표현을 최종 확인합니다.', '공개 화면 보기 ↗', WORK_URL)
    );

    panels.applicants.append(
      el('h3', '지원자 관리', 'work-admin-view-title'),
      el('p', '지원자는 본인 지원내역만 보고, 사업주는 자기 공고의 지원자만 안전한 projection을 통해 확인합니다.', 'work-admin-view-copy'),
      featureCard('지원 흐름 관리', '검토 → 면접 → 채용 또는 종료 상태를 해당 사업주 권한에서 관리합니다.', '지원자 화면 열기 ↗', WORK_URL),
      featureCard('개인정보 원칙', '원본 내부 사용자 UUID는 사업주 화면에 노출하지 않고 필요한 지원정보만 제공합니다.', 'Work 운영 확인 ↗', WORK_URL)
    );

    panels.profiles.append(
      el('h3', '프로필 · 사업장', 'work-admin-view-title'),
      el('p', 'Work Profile은 기본적으로 본인 전용이며 사업장 소유권은 로그인 계정과 서버 정책으로 검증합니다.', 'work-admin-view-copy'),
      featureCard('Work Profile', '표시명, 활동지역, 기술, 언어와 역할을 관리합니다.', 'My Work 열기 ↗', WORK_URL),
      featureCard('사업장 정보', '사업장명과 지역을 저장하고 해당 소유자만 채용공고를 생성하도록 제한합니다.', '사업주 화면 열기 ↗', WORK_URL)
    );

    const securityGrid = el('div', '', 'work-admin-security-grid');
    securityGrid.append(
      infoCard('RLS', 'Enabled', 'work_profiles · organizations · jobs · applications'),
      infoCard('ANON RPC', 'Blocked', 'SECURITY DEFINER 함수 익명 실행 차단'),
      infoCard('STAGING DATA', 'Isolated', '스테이징에서 운영 데이터 연결 비활성화'),
      infoCard('PRODUCTION', 'Verified', '실운영 host · config · health 검증')
    );
    panels.security.append(
      el('h3', '운영 · 보안', 'work-admin-view-title'),
      el('p', '운영 변경은 WORK 독립 배포 경계를 따르고, 개인정보 접근은 Supabase RLS와 제한 RPC를 통해 제어합니다.', 'work-admin-view-copy'),
      securityGrid,
      featureCard('운영 Health', '현재 Worker의 서비스명과 production runtime 상태를 확인합니다.', 'Health 열기 ↗', `${WORK_URL}/health`)
    );

    rail.append(el('p', 'WORK ADMIN', 'work-admin-rail-label'));
    const railNav = el('nav', '', 'work-admin-rail-nav');
    const railButtons = [];
    viewDefs.forEach(([key, eyebrow, label], index) => {
      const button = el('button', '', `work-admin-rail-button${index === 0 ? ' active' : ''}`);
      button.type = 'button';
      button.dataset.workTarget = key;
      button.append(el('small', eyebrow), el('strong', label), el('span', '→'));
      railNav.append(button);
      railButtons.push(button);
    });
    rail.append(railNav);
    const railFooter = el('div', '', 'work-admin-rail-footer');
    railFooter.append(el('small', 'PUBLIC'), actionLink('work.ekodi.kr ↗', WORK_URL, 'work-admin-public-link'));
    rail.append(railFooter);

    function switchWorkView(key) {
      Object.entries(panels).forEach(([panelKey, panel]) => { panel.hidden = panelKey !== key; });
      railButtons.forEach(button => button.classList.toggle('active', button.dataset.workTarget === key));
    }

    railNav.addEventListener('click', event => {
      const button = event.target.closest('[data-work-target]');
      if (button) switchWorkView(button.dataset.workTarget);
    });

    function activate() {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('work'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'work'));
      const title = document.querySelector('#pageTitle');
      if (title) title.textContent = 'WORK';
      document.querySelector('.sidebar')?.classList.remove('open');
      const next = location.pathname === '/work' || location.pathname === '/work/' ? '/work' : '#work';
      history.replaceState(null, '', next);
    }

    navButton.addEventListener('click', activate);
    layout.append(main, rail);
    section.append(layout);
    content.append(section);

    // Campus의 Work Manage도 동일한 전용 WORK 관리화면으로 연결합니다.
    const campusWorkButton = document.querySelector('[data-campus-service="work.ekodi.kr"]');
    if (campusWorkButton) campusWorkButton.dataset.campusSection = 'work';

    window.dispatchEvent(new CustomEvent('ekodi-feature-installed'));
    if (location.pathname === '/work' || location.pathname === '/work/' || location.hash === '#work') activate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
