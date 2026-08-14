(() => {
  const API = 'https://api.ekodi.kr';
  const ROLE_OPTIONS = [
    ['store_owner', '점주/책임자'],
    ['marketing_manager', '마케팅담당자'],
    ['hq_manager', '본사담당자'],
    ['accounting_manager', '회계담당자'],
  ];
  const ROLE_LABELS = {
    store_owner: '점주/책임자',
    marketing_manager: '마케팅담당자',
    hq_manager: '본사담당자',
    accounting_manager: '회계담당자',
    client_admin: '점주/책임자 · 기존',
    client_editor: '마케팅담당자 · 기존',
    client_viewer: '조회·검수자 · 기존',
  };
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

  let shell;
  let directory = { summary: {}, tenants: [], roles: [], members: [] };
  let selectedSlug = '';
  let activeTab = 'members';
  let loaded = false;
  let loading = false;

  function installShell() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('[data-section="clients"]')) return null;

    const navButton = button('', 'nav');
    navButton.dataset.section = 'clients';
    navButton.append(document.createTextNode('◎ '), text('span', 'Clients'));
    const servicesButton = nav.querySelector('[data-section="services"]');
    if (servicesButton) servicesButton.insertAdjacentElement('afterend', navButton);
    else nav.append(navButton);

    const section = document.createElement('section');
    section.className = 'section client-access-section hidden-panel';
    section.dataset.panel = 'clients';
    section.id = 'clientAccessSection';

    const head = document.createElement('div');
    head.className = 'section-head client-access-head';
    const heading = document.createElement('div');
    heading.append(text('p', 'CLIENTS · GOOGLE IDENTITY DIRECTORY', 'kicker'), text('h2', '고객 회원관리'));
    heading.append(text('p', 'Google 계정은 하나로 관리하고, 사이트별 멤버십·권한·인증상태를 분리해 봅니다.', 'operations-copy'));
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
    search.placeholder = '이름·이메일·사이트 검색';
    search.setAttribute('aria-label', '고객 회원 검색');

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
      if (pageTitle) pageTitle.textContent = 'Clients · 고객 회원관리';
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
      ['활성', summary.active || 0, 'Google 인증 완료'],
      ['인증 대기', summary.pending || 0, '사전등록 후 첫 로그인 대기'],
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
        const haystack = `${member.displayName} ${member.email} ${member.tenant.name} ${member.tenant.domain} ${member.roleLabel || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function memberTable(members, { includeSite = true } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'client-table-wrap';
    const table = document.createElement('table');
    table.className = 'client-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const labels = includeSite
      ? ['회원', '사이트', '권한', 'Google 상태', '마지막 로그인']
      : ['회원', '권한', 'Google 상태', '마지막 로그인'];
    for (const label of labels) headRow.append(text('th', label));
    thead.append(headRow);
    const tbody = document.createElement('tbody');

    if (!members.length) {
      const row = document.createElement('tr');
      const cell = text('td', '조건에 맞는 고객 회원이 없습니다.');
      cell.colSpan = labels.length;
      row.append(cell);
      tbody.append(row);
    } else {
      for (const member of members) {
        const row = document.createElement('tr');
        const identity = document.createElement('td');
        identity.append(text('strong', member.displayName || member.email), text('small', member.email));
        row.append(identity);
        if (includeSite) {
          const site = document.createElement('td');
          site.append(text('strong', member.tenant.name), text('small', member.tenant.domain));
          row.append(site);
        }
        row.append(
          text('td', member.roleLabel || ROLE_LABELS[member.role] || member.role),
          (() => { const cell = document.createElement('td'); cell.append(membershipBadge(member.status)); return cell; })(),
          text('td', formatDate(member.lastLoginAt)),
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
      text('h3', forcePending ? 'Google 인증 대기' : '전체 고객 회원'),
      text('span', `${members.length}개 멤버십`, 'client-count-chip'),
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
    const emailLabel = text('label', '고객 Google 이메일');
    const email = document.createElement('input');
    email.type = 'email';
    email.name = 'email';
    email.required = true;
    email.autocomplete = 'email';
    email.placeholder = 'customer@gmail.com';
    emailLabel.append(email);

    const roleLabel = text('label', '권한');
    const role = document.createElement('select');
    role.name = 'role';
    for (const [value, label] of ROLE_OPTIONS) role.append(selectOption(value, label));
    roleLabel.append(role);

    const submit = button('Google 고객 사전등록', 'primary');
    submit.type = 'submit';
    const status = text('p', '', 'client-invite-result');
    form.append(emailLabel, roleLabel, submit, status);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      submit.disabled = true;
      submit.textContent = '사전등록 중…';
      status.replaceChildren();
      try {
        const data = await request(`/api/customers/tenants/${encodeURIComponent(tenant.slug)}/pre-register`, {
          method: 'POST',
          body: JSON.stringify({ email: email.value.trim(), role: role.value }),
        });
        const account = data.account || {};
        const message = account.status === 'active'
          ? '이미 활성화된 계정입니다. 이 사이트의 권한을 최신 설정으로 반영했습니다.'
          : '사전등록 완료. 같은 이메일의 Google 계정으로 첫 로그인하면 자동 활성화됩니다.';
        status.append(text('strong', message), text('small', 'Google 계정은 통합 관리되고 사이트별 멤버십만 추가됩니다.'));
        form.reset();
        await loadDirectory(true);
      } catch (error) {
        status.append(text('span', error.message, 'operations-error'));
      } finally {
        submit.disabled = false;
        submit.textContent = 'Google 고객 사전등록';
      }
    });
    return form;
  }

  function renderTenantDetail(detail, tenant) {
    const members = directory.members.filter(member => member.tenant.slug === tenant.slug);
    const header = document.createElement('div');
    header.className = 'client-detail-head';
    const identity = document.createElement('div');
    identity.append(text('p', 'CLIENT SITE · GOOGLE MEMBERSHIP', 'kicker'), text('h3', tenant.name), text('small', tenant.domain));
    const open = document.createElement('a');
    open.className = 'secondary compact';
    open.href = `https://${tenant.domain}`;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = '고객 사이트 열기 ↗';
    header.append(identity, open);
    detail.append(
      header,
      text('h4', 'Google 고객 사전등록'),
      createPreRegisterForm(tenant),
      text('h4', `이 사이트 회원 · ${members.length}명`),
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
    head.append(text('h3', '권한별 회원'), text('span', `${directory.roles.length}개 권한`, 'client-count-chip'));
    const grid = document.createElement('div');
    grid.className = 'client-role-grid';
    for (const item of directory.roles) {
      const card = button('', 'client-role-card');
      card.append(text('small', item.role), text('strong', item.label), text('span', `${item.count}개 멤버십`));
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
      shell?.body.replaceChildren(text('p', '관리자 로그인 후 고객 회원을 관리할 수 있습니다.', 'operations-loading'));
      return;
    }
    if (loading || (loaded && !force)) return renderActiveTab();
    loading = true;
    shell.body.replaceChildren(text('p', '사이트별 Google 회원정보를 불러오는 중입니다.', 'operations-loading'));
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