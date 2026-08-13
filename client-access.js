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
    if (!response.ok) throw new Error(data.error || `고객관리 API 요청 실패 (${response.status})`);
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
    heading.append(text('p', 'CLIENT ACCESS · GOOGLE PRE-REGISTRATION', 'kicker'), text('h2', '고객 인증 · 권한 관리'));
    heading.append(text('p', '고객 이메일과 권한만 사전등록합니다. 초대 링크·비밀번호 없이 같은 Google 계정으로 첫 로그인하면 자동 활성화됩니다.', 'operations-copy'));
    const refresh = button('↻ 새로고침', 'secondary');
    refresh.id = 'refreshClients';
    head.append(heading, refresh);

    const summary = document.createElement('div');
    summary.className = 'client-access-summary';
    summary.id = 'clientAccessSummary';

    const layout = document.createElement('div');
    layout.className = 'client-access-layout';
    const tenantList = document.createElement('div');
    tenantList.className = 'client-tenant-list';
    tenantList.id = 'clientTenantList';
    const detail = document.createElement('div');
    detail.className = 'client-access-detail';
    detail.id = 'clientAccessDetail';
    layout.append(tenantList, detail);
    section.append(head, summary, layout);
    content.append(section);

    const activateClients = () => {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('clients'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'clients'));
      const pageTitle = document.querySelector('#pageTitle');
      if (pageTitle) pageTitle.textContent = 'Clients · Google 고객 인증';
      document.querySelector('.sidebar')?.classList.remove('open');
      loadTenants();
    };

    navButton.addEventListener('click', activateClients);
    refresh.addEventListener('click', loadTenants);
    return { section, tenantList, detail, summary };
  }

  let shell;
  let tenants = [];
  let selectedSlug = '';

  function renderSummary() {
    if (!shell) return;
    shell.summary.replaceChildren();
    const activeUsers = tenants.reduce((sum, tenant) => sum + Number(tenant.activeUsers || 0), 0);
    const pendingUsers = tenants.reduce((sum, tenant) => sum + Number(tenant.googlePending || 0), 0);
    for (const [label, value, note] of [
      ['고객 테넌트', tenants.length, '독립 고객 공간'],
      ['활성 고객계정', activeUsers, 'Google 인증 완료'],
      ['인증 대기', pendingUsers, '사전등록 후 첫 로그인 대기'],
    ]) {
      const card = document.createElement('article');
      card.append(text('small', label), text('strong', String(value)), text('span', note));
      shell.summary.append(card);
    }
  }

  function renderTenants() {
    if (!shell) return;
    shell.tenantList.replaceChildren();
    if (!tenants.length) {
      shell.tenantList.append(text('p', '등록된 고객 테넌트가 없습니다.', 'operations-loading'));
      return;
    }
    for (const tenant of tenants) {
      const item = button('', `client-tenant-card${tenant.slug === selectedSlug ? ' active' : ''}`);
      const top = document.createElement('span');
      top.className = 'client-tenant-card-head';
      top.append(text('strong', tenant.name), text('span', tenant.status === 'active' ? '운영' : tenant.status, 'health-badge online'));
      item.append(top, text('small', tenant.domain), text('small', `활성 ${tenant.activeUsers || 0} · 인증대기 ${tenant.googlePending || 0}`));
      item.addEventListener('click', () => selectTenant(tenant.slug));
      shell.tenantList.append(item);
    }
  }

  function showDetailMessage(message, className = 'operations-loading') {
    shell?.detail.replaceChildren(text('p', message, className));
  }

  async function tenantUsers(slug) {
    const data = await request(`/api/customers/tenants/${encodeURIComponent(slug)}/users`);
    return data.users || [];
  }

  async function loadTenants() {
    if (!shell || !adminToken()) {
      showDetailMessage('관리자 로그인 후 고객 인증을 관리할 수 있습니다.');
      return;
    }
    shell.tenantList.replaceChildren(text('p', '고객 테넌트를 불러오는 중입니다.', 'operations-loading'));
    try {
      const data = await request('/api/customers/tenants');
      const base = data.tenants || [];
      tenants = await Promise.all(base.map(async tenant => {
        try {
          const users = await tenantUsers(tenant.slug);
          return {
            ...tenant,
            activeUsers: users.filter(user => user.status === 'active').length,
            googlePending: users.filter(user => user.status === 'pre_registered').length,
          };
        } catch {
          return { ...tenant, googlePending: 0 };
        }
      }));
      if (!selectedSlug || !tenants.some(item => item.slug === selectedSlug)) selectedSlug = tenants[0]?.slug || '';
      renderSummary();
      renderTenants();
      if (selectedSlug) await renderTenantDetail(selectedSlug);
    } catch (error) {
      shell.tenantList.replaceChildren(text('p', error.message, 'operations-error'));
      showDetailMessage('고객관리 API 연결을 확인해 주세요.', 'operations-error');
    }
  }

  async function selectTenant(slug) {
    selectedSlug = slug;
    renderTenants();
    await renderTenantDetail(slug);
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
    for (const [value, label] of ROLE_OPTIONS) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      role.append(option);
    }
    roleLabel.append(role);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary';
    submit.textContent = 'Google 고객 사전등록';
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
          ? '이미 활성화된 계정입니다. 권한을 최신 설정으로 반영했습니다.'
          : '사전등록 완료. 고객이 같은 이메일의 Google 계정으로 로그인하면 자동 활성화됩니다.';
        status.append(text('strong', message), text('small', '초대 링크·별도 비밀번호·복구코드는 필요하지 않습니다.'));
        form.reset();
        await loadTenants();
      } catch (error) {
        status.append(text('span', error.message, 'operations-error'));
      } finally {
        submit.disabled = false;
        submit.textContent = 'Google 고객 사전등록';
      }
    });
    return form;
  }

  function userTable(users) {
    const wrap = document.createElement('div');
    wrap.className = 'client-table-wrap';
    const table = document.createElement('table');
    table.className = 'client-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const label of ['사용자', '권한', 'Google 상태', '마지막 로그인']) headRow.append(text('th', label));
    thead.append(headRow);
    const tbody = document.createElement('tbody');
    if (!users.length) {
      const row = document.createElement('tr');
      const cell = text('td', '등록된 고객 사용자가 없습니다. 위에서 Google 이메일을 사전등록해 주세요.');
      cell.colSpan = 4;
      row.append(cell);
      tbody.append(row);
    } else {
      for (const user of users) {
        const row = document.createElement('tr');
        const identity = document.createElement('td');
        identity.append(text('strong', user.displayName || user.email), text('small', user.email));
        row.append(
          identity,
          text('td', ROLE_LABELS[user.role] || user.role),
          text('td', membershipLabel(user.status)),
          text('td', formatDate(user.lastLoginAt)),
        );
        tbody.append(row);
      }
    }
    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
  }

  async function renderTenantDetail(slug) {
    if (!shell) return;
    const tenant = tenants.find(item => item.slug === slug);
    if (!tenant) return showDetailMessage('고객을 선택해 주세요.');
    showDetailMessage(`${tenant.name}의 Google 인증 정보를 불러오는 중입니다.`);
    try {
      const users = await tenantUsers(slug);
      const detail = document.createDocumentFragment();
      const header = document.createElement('div');
      header.className = 'client-detail-head';
      const identity = document.createElement('div');
      identity.append(text('p', 'CLIENT TENANT · GOOGLE IDENTITY', 'kicker'), text('h3', tenant.name), text('small', tenant.domain));
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
        text('h4', '등록 사용자 · 인증상태'),
        userTable(users),
      );
      shell.detail.replaceChildren(detail);
    } catch (error) {
      showDetailMessage(error.message, 'operations-error');
    }
  }

  function init() {
    shell = installShell();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
