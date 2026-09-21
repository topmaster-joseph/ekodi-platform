(() => {
  const API = 'https://ekodi.kr';
  const ROLE_OPTIONS = [
    ['owner', '사이트 책임관리자'],
    ['admin', '사이트 관리자'],
    ['manager', '운영책임자'],
    ['marketer', '마케팅담당자'],
    ['accountant', '회계담당자'],
    ['staff', '실무담당자'],
    ['member', '회원'],
    ['viewer', '조회·검수자'],
    ['store_owner', '점주/책임자'],
    ['marketing_manager', '마케팅담당자 · 점포'],
    ['hq_manager', '본사담당자'],
    ['accounting_manager', '회계담당자 · 점포'],
    ['client_admin', '점주/책임자 · 기존'],
    ['client_editor', '마케팅담당자 · 기존'],
    ['client_viewer', '조회·검수자 · 기존'],
    ['senior_pastor', '담임목사/책임관리자'],
    ['pastor', '목회자'],
    ['care_staff', '돌봄담당자'],
    ['external_developer', '외부개발자'],
  ];
  const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS);
  const TAB_LABELS = {
    members: '전체 회원',
    sites: '사이트별',
    pending: '인증 대기',
    roles: '권한별',
  };

  function adminToken() {
    return sessionStorage.getItem('ekodi-auth-token') || '';
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = adminToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const suffix = data.code ? ` · ${data.code}` : '';
      throw new Error(`${data.error || `고객관리 API 요청 실패 (${response.status})`}${suffix}`);
    }
    return data;
  }

  function text(tag, value, className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  }

  function button(label, className = 'secondary') {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = className;
    node.textContent = label;
    return node;
  }

  function formatDate(value, fallback = '아직 인증 전') {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString('ko-KR');
  }

  function membershipLabel(status) {
    if (status === 'active') return '활성';
    if (status === 'pre_registered') return 'Google 인증 대기';
    if (status === 'disabled') return '중지';
    if (status === 'expired') return '기간 만료';
    return status || '확인 필요';
  }

  function membershipBadge(status) {
    const badge = text('span', membershipLabel(status), `client-status ${status || 'unknown'}`);
    return badge;
  }

  function selectOption(value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  function dateAfter(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  let shell;
  let directory = { summary: {}, tenants: [], roles: [], members: [] };
  let selectedSlug = '';
  let activeTab = 'members';
  let loaded = false;
  let loading = false;

  function installShell() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || content.querySelector('[data-panel~="clients"]')) return null;

    let navButton = nav.querySelector('[data-section="clients"]');
    if (!navButton) {
      navButton = button('', 'nav');
      navButton.dataset.section = 'clients';
      navButton.append(document.createTextNode('◎ '), text('span', 'Clients'));
      const servicesButton = nav.querySelector('[data-section="services"]');
      if (servicesButton) servicesButton.insertAdjacentElement('afterend', navButton);
      else nav.append(navButton);
    }

    const section = document.createElement('section');
    section.className = 'section client-access-section hidden-panel';
    section.dataset.panel = 'clients';
    section.id = 'clientAccessSection';

    const head = document.createElement('div');
    head.className = 'section-head client-access-head';
    const heading = document.createElement('div');
    heading.append(text('p', 'CLIENTS · IDENTITY & ACCESS', 'kicker'), text('h2', '사용자 · 관리자 · 권한'));
    heading.append(text('p', 'Google 계정은 하나로 식별하고, 사이트 범위·역할·만료일을 분리해 관리합니다.', 'operations-copy'));
    const refresh = button('↻ 새로고침', 'secondary');
    refresh.id = 'refreshClients';
    head.append(heading, refresh);

    const summary = document.createElement('div');
    summary.className = 'client-access-summary';
    summary.id = 'clientAccessSummary';

    const tabs = document.createElement('div');
    tabs.className = 'client-tabs';
    tabs.setAttribute('role', 'tablist');
    for (const [key, label] of Object.entries(TAB_LABELS)) {
      const tab = button(label, `client-tab${key === activeTab ? ' active' : ''}`);
      tab.dataset.clientTab = key;
      tab.setAttribute('role', 'tab');
      tab.addEventListener('click', () => setTab(key));
      tabs.append(tab);
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'client-filterbar';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = '이름·이메일·GitHub·사이트 검색';
    search.setAttribute('aria-label', '사용자 검색');

    const site = document.createElement('select');
    site.setAttribute('aria-label', '사이트 필터');
    site.append(selectOption('', '모든 사이트'));

    const role = document.createElement('select');
    role.setAttribute('aria-label', '권한 필터');
    role.append(selectOption('', '모든 권한'));

    const status = document.createElement('select');
    status.setAttribute('aria-label', '인증상태 필터');
    status.append(
      selectOption('', '모든 상태'),
      selectOption('active', '활성'),
      selectOption('pre_registered', '인증 대기'),
      selectOption('expired', '기간 만료'),
      selectOption('disabled', '중지'),
    );
    toolbar.append(search, site, role, status);

    const body = document.createElement('div');
    body.className = 'client-hub-body';
    body.id = 'clientHubBody';

    for (const control of [search, site, role, status]) control.addEventListener('input', renderActiveTab);

    section.append(head, summary, tabs, toolbar, body);
    content.append(section);

    const activateClients = () => {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('clients'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'clients'));
      const pageTitle = document.querySelector('#pageTitle');
      if (pageTitle) pageTitle.textContent = '사용자 · 사이트 권한';
      document.querySelector('.sidebar')?.classList.remove('open');
      loadDirectory();
    };

    navButton.addEventListener('click', activateClients);
    refresh.addEventListener('click', () => loadDirectory(true));
    return { section, summary, tabs, toolbar, body, search, site, role, status };
  }

  function setTab(tab) {
    if (!TAB_LABELS[tab]) return;
    activeTab = tab;
    shell?.tabs.querySelectorAll('[data-client-tab]').forEach(node => node.classList.toggle('active', node.dataset.clientTab === tab));
    if (tab === 'pending') shell.status.value = 'pre_registered';
    else if (shell.status.value === 'pre_registered' && tab !== 'members') shell.status.value = '';
    renderActiveTab();
  }

  function populateFilters() {
    const siteValue = shell.site.value;
    const roleValue = shell.role.value;
    shell.site.replaceChildren(selectOption('', '모든 사이트'));
    for (const tenant of directory.tenants) shell.site.append(selectOption(tenant.slug, tenant.name));
    shell.site.value = directory.tenants.some(item => item.slug === siteValue) ? siteValue : '';

    shell.role.replaceChildren(selectOption('', '모든 권한'));
    for (const item of directory.roles) shell.role.append(selectOption(item.role, item.label));
    shell.role.value = directory.roles.some(item => item.role === roleValue) ? roleValue : '';
  }

  function renderSummary() {
    if (!shell) return;
    const summary = directory.summary || {};
    shell.summary.replaceChildren();
    const cards = [
      ['Google 계정', summary.uniqueGoogleAccounts || 0, '중복 이메일은 하나로 관리'],
      ['사이트 멤버십', summary.memberships || 0, `${summary.tenants || 0}개 고객 사이트`],
      ['외부협력자', summary.externalCollaborators || 0, '기간제·범위제한 계정'],
      ['만료/대기', (summary.expired || 0) + (summary.pending || 0), `만료 ${summary.expired || 0} · 대기 ${summary.pending || 0}`],
    ];
    for (const [label, value, note] of cards) {
      const card = document.createElement('article');
      card.append(text('small', label), text('strong', String(value)), text('span', note));
      shell.summary.append(card);
    }
  }

  function filteredMembers(forcePending = false) {
    const q = shell.search.value.trim().toLowerCase();
    const site = shell.site.value;
    const role = shell.role.value;
    const status = forcePending ? 'pre_registered' : shell.status.value;
    return directory.members.filter(member => {
      if (site && member.tenant.slug !== site) return false;
      if (role && member.role !== role) return false;
      if (status && member.status !== status) return false;
      if (q) {
        const haystack = `${member.displayName} ${member.email} ${member.githubUsername || ''} ${member.tenant.name} ${member.tenant.domain} ${member.roleLabel || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function revokeButton(member) {
    if (member.status === 'disabled') return text('span', '회수됨', 'client-count-chip');
    const node = button('권한 회수', 'secondary compact');
    node.addEventListener('click', async () => {
      if (!confirm(`${member.email}의 ${member.tenant.name} 접근권한을 회수할까요?`)) return;
      node.disabled = true;
      try {
        await request(`/api/customers/tenants/${encodeURIComponent(member.tenant.slug)}/access/revoke`, {
          method: 'POST',
          body: JSON.stringify({ email: member.email }),
        });
        await loadDirectory(true);
      } catch (error) {
        alert(error.message);
      } finally {
        node.disabled = false;
      }
    });
    return node;
  }

  function memberTable(members, { includeSite = true } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'client-table-wrap';
    const table = document.createElement('table');
    table.className = 'client-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const labels = includeSite
      ? ['사용자', '사이트', '권한', '상태', '만료', '관리']
      : ['사용자', '권한', '상태', '만료', '관리'];
    for (const label of labels) headRow.append(text('th', label));
    thead.append(headRow);
    const tbody = document.createElement('tbody');

    if (!members.length) {
      const row = document.createElement('tr');
      const cell = text('td', '조건에 맞는 사용자가 없습니다.');
      cell.colSpan = labels.length;
      row.append(cell);
      tbody.append(row);
    } else {
      for (const member of members) {
        const row = document.createElement('tr');
        const identity = document.createElement('td');
        identity.append(text('strong', member.displayName || member.email), text('small', member.email));
        if (member.githubUsername) identity.append(text('small', `GitHub · @${member.githubUsername}`));
        row.append(identity);
        if (includeSite) {
          const site = document.createElement('td');
          site.append(text('strong', member.tenant.name), text('small', member.tenant.domain));
          row.append(site);
        }
        const statusCell = document.createElement('td');
        statusCell.append(membershipBadge(member.status));
        const manageCell = document.createElement('td');
        manageCell.append(revokeButton(member));
        row.append(
          text('td', member.roleLabel || ROLE_LABELS[member.role] || member.role),
          statusCell,
          text('td', member.expiresAt ? formatDate(member.expiresAt, '-') : '계속'),
          manageCell,
        );
        tbody.append(row);
      }
    }
    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
  }

  function renderMemberView(forcePending = false) {
    const members = filteredMembers(forcePending);
    const section = document.createElement('div');
    section.className = 'client-directory-view';
    const head = document.createElement('div');
    head.className = 'client-view-head';
    head.append(
      text('h3', forcePending ? 'Google 인증 대기' : '전체 사용자'),
      text('span', `${members.length}개 접근권한`, 'client-count-chip'),
    );
    section.append(head, memberTable(members));
    shell.body.replaceChildren(section);
  }

  function renderTenantCards(list) {
    list.replaceChildren();
    for (const tenant of directory.tenants) {
      const item = button('', `client-tenant-card${tenant.slug === selectedSlug ? ' active' : ''}`);
      const top = document.createElement('span');
      top.className = 'client-tenant-card-head';
      top.append(text('strong', tenant.name), text('span', tenant.status === 'active' ? '운영' : tenant.status, 'health-badge online'));
      item.append(
        top,
        text('small', tenant.domain),
        text('small', `회원 ${tenant.members || 0} · 활성 ${tenant.activeUsers || 0} · 대기 ${tenant.googlePending || 0}`),
      );
      item.addEventListener('click', () => {
        selectedSlug = tenant.slug;
        renderSitesView();
      });
      list.append(item);
    }
  }

  function createPreRegisterForm(tenant) {
    const form = document.createElement('form');
    form.className = 'client-invite-form';
    const nameLabel = text('label', '이름');
    const displayName = document.createElement('input');
    displayName.type = 'text';
    displayName.name = 'displayName';
    displayName.maxLength = 120;
    displayName.autocomplete = 'name';
    displayName.placeholder = '이름';
    nameLabel.append(displayName);

    const emailLabel = text('label', 'Google 이메일');
    const email = document.createElement('input');
    email.type = 'email';
    email.name = 'email';
    email.required = true;
    email.autocomplete = 'email';
    email.placeholder = 'user@gmail.com';
    emailLabel.append(email);

    const roleLabel = text('label', '역할');
    const role = document.createElement('select');
    role.name = 'role';
    for (const [value, label] of ROLE_OPTIONS) role.append(selectOption(value, label));
    roleLabel.append(role);

    const githubLabel = text('label', 'GitHub 사용자명');
    const github = document.createElement('input');
    github.type = 'text';
    github.name = 'githubUsername';
    github.placeholder = 'github-username';
    github.maxLength = 39;
    githubLabel.append(github);

    const expiryLabel = text('label', '접근 만료일');
    const expiry = document.createElement('input');
    expiry.type = 'date';
    expiry.name = 'expiresAt';
    expiry.min = new Date().toISOString().slice(0, 10);
    expiry.value = dateAfter(30);
    expiryLabel.append(expiry);

    const safety = text('p', '외부개발자는 청계면상인회 등 선택한 사이트 범위만 접근하며 개인정보·재정·비밀키·운영배포·권한관리는 차단됩니다.', 'operations-copy');
    const developerFields = document.createElement('div');
    developerFields.className = 'client-developer-fields';
    developerFields.append(githubLabel, expiryLabel, safety);
    developerFields.hidden = true;

    const syncDeveloperFields = () => {
      const isDeveloper = role.value === 'external_developer';
      developerFields.hidden = !isDeveloper;
      github.required = isDeveloper;
      expiry.required = isDeveloper;
    };
    role.addEventListener('change', syncDeveloperFields);
    syncDeveloperFields();

    const submit = button('Google 계정 등록', 'primary');
    submit.type = 'submit';
    const status = text('p', '', 'client-invite-result');
    form.append(nameLabel, emailLabel, roleLabel, developerFields, submit, status);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      submit.disabled = true;
      submit.textContent = '등록 중…';
      status.replaceChildren();
      try {
        const isDeveloper = role.value === 'external_developer';
        const expiresAt = isDeveloper && expiry.value ? new Date(`${expiry.value}T23:59:59+09:00`).toISOString() : '';
        const data = await request(`/api/customers/tenants/${encodeURIComponent(tenant.slug)}/pre-register`, {
          method: 'POST',
          body: JSON.stringify({
            email: email.value.trim(),
            displayName: displayName.value.trim(),
            role: role.value,
            githubUsername: isDeveloper ? github.value.trim() : '',
            expiresAt,
          }),
        });
        const account = data.account || {};
        const message = account.status === 'active'
          ? '기존 계정의 이 사이트 권한을 최신 설정으로 반영했습니다.'
          : '등록 완료. 같은 이메일의 Google 계정으로 로그인하면 이 사이트 범위에서만 활성화됩니다.';
        status.append(text('strong', message), text('small', isDeveloper ? `GitHub @${account.githubUsername} · 만료 ${formatDate(account.expiresAt, '-')}` : 'Google 계정은 통합 식별되고 사이트별 권한만 추가됩니다.'));
        form.reset();
        expiry.value = dateAfter(30);
        syncDeveloperFields();
        await loadDirectory(true);
      } catch (error) {
        status.append(text('span', error.message, 'operations-error'));
      } finally {
        submit.disabled = false;
        submit.textContent = 'Google 계정 등록';
      }
    });
    return form;
  }

  function renderTenantDetail(detail, tenant) {
    const members = directory.members.filter(member => member.tenant.slug === tenant.slug);
    const header = document.createElement('div');
    header.className = 'client-detail-head';
    const identity = document.createElement('div');
    identity.append(text('p', 'CLIENT SITE · SCOPED ACCESS', 'kicker'), text('h3', tenant.name), text('small', tenant.domain));
    const open = document.createElement('a');
    open.className = 'secondary compact';
    open.href = `https://${tenant.domain}`;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = '사이트 열기 ↗';
    header.append(identity, open);
    detail.append(
      header,
      text('h4', 'Google 계정·외부협력자 등록'),
      createPreRegisterForm(tenant),
      text('h4', `이 사이트 접근권한 · ${members.length}명`),
      memberTable(members, { includeSite: false }),
    );
  }

  function renderSitesView() {
    if (!selectedSlug || !directory.tenants.some(item => item.slug === selectedSlug)) selectedSlug = directory.tenants[0]?.slug || '';
    const layout = document.createElement('div');
    layout.className = 'client-access-layout';
    const list = document.createElement('div');
    list.className = 'client-tenant-list';
    const detail = document.createElement('div');
    detail.className = 'client-access-detail';
    renderTenantCards(list);
    const tenant = directory.tenants.find(item => item.slug === selectedSlug);
    if (tenant) renderTenantDetail(detail, tenant);
    else detail.append(text('p', '등록된 고객 사이트가 없습니다.', 'operations-loading'));
    layout.append(list, detail);
    shell.body.replaceChildren(layout);
  }

  function renderRolesView() {
    const wrap = document.createElement('div');
    wrap.className = 'client-role-view';
    const head = document.createElement('div');
    head.className = 'client-view-head';
    head.append(text('h3', '권한별 사용자'), text('span', `${directory.roles.length}개 권한`, 'client-count-chip'));
    const grid = document.createElement('div');
    grid.className = 'client-role-grid';
    for (const item of directory.roles) {
      const card = button('', 'client-role-card');
      card.append(text('small', item.role), text('strong', item.label), text('span', `${item.count}개 접근권한`));
      card.addEventListener('click', () => {
        shell.role.value = item.role;
        activeTab = 'members';
        shell.tabs.querySelectorAll('[data-client-tab]').forEach(node => node.classList.toggle('active', node.dataset.clientTab === 'members'));
        renderActiveTab();
      });
      grid.append(card);
    }
    wrap.append(head, grid);
    shell.body.replaceChildren(wrap);
  }

  function renderActiveTab() {
    if (!shell) return;
    const showFilters = activeTab === 'members' || activeTab === 'pending';
    shell.toolbar.hidden = !showFilters;
    if (activeTab === 'sites') return renderSitesView();
    if (activeTab === 'pending') return renderMemberView(true);
    if (activeTab === 'roles') return renderRolesView();
    return renderMemberView(false);
  }

  async function loadDirectory(force = false) {
    if (!shell || !adminToken()) {
      shell?.body.replaceChildren(text('p', '관리자 로그인 후 접근권한을 관리할 수 있습니다.', 'operations-loading'));
      return;
    }
    if (loading || (loaded && !force)) return renderActiveTab();
    loading = true;
    shell.body.replaceChildren(text('p', '사이트별 Google 계정과 외부협력자 권한을 불러오는 중입니다.', 'operations-loading'));
    try {
      directory = await request('/api/customers/directory');
      loaded = true;
      populateFilters();
      renderSummary();
      renderActiveTab();
    } catch (error) {
      shell.body.replaceChildren(text('p', error.message, 'operations-error'));
    } finally {
      loading = false;
    }
  }

  function init() {
    shell = installShell();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
