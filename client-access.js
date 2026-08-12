(() => {
  const API = 'https://api.ekodi.kr';
  const ROLE_LABELS = {
    client_admin: '고객 관리자',
    client_editor: '콘텐츠 편집자',
    client_viewer: '조회·검수자',
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

  function formatDate(value) {
    if (!value) return '기록 없음';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '기록 없음' : date.toLocaleString('ko-KR');
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
    heading.append(text('p', 'CLIENT ACCESS · TENANT SECURITY', 'kicker'), text('h2', '고객 인증 · 권한 관리'));
    const copy = text('p', '고객별 사용자·권한·초대를 관리합니다. 고객 계정은 자기 테넌트에만 접근할 수 있습니다.', 'operations-copy');
    heading.append(copy);
    const refresh = button('↻ 고객 새로고침', 'secondary');
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
      if (pageTitle) pageTitle.textContent = 'Clients · 고객 인증';
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
    const pendingInvites = tenants.reduce((sum, tenant) => sum + Number(tenant.pendingInvites || 0), 0);
    for (const [label, value, note] of [
      ['고객 테넌트', tenants.length, '독립 고객 공간'],
      ['활성 고객계정', activeUsers, '현재 접근 가능'],
      ['초대 대기', pendingInvites, '72시간 내 수락 필요'],
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
      const domain = text('small', tenant.domain);
      const stats = text('small', `사용자 ${tenant.activeUsers} · 초대 ${tenant.pendingInvites}`);
      item.append(top, domain, stats);
      item.addEventListener('click', () => selectTenant(tenant.slug));
      shell.tenantList.append(item);
    }
  }

  function showDetailMessage(message, className = 'operations-loading') {
    shell?.detail.replaceChildren(text('p', message, className));
  }

  async function loadTenants() {
    if (!shell || !adminToken()) {
      showDetailMessage('관리자 로그인 후 고객 인증을 관리할 수 있습니다.');
      return;
    }
    shell.tenantList.replaceChildren(text('p', '고객 테넌트를 불러오는 중입니다.', 'operations-loading'));
    try {
      const data = await request('/api/customers/tenants');
      tenants = data.tenants || [];
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

  function createInviteForm(tenant) {
    const form = document.createElement('form');
    form.className = 'client-invite-form';
    const emailLabel = text('label', '고객 이메일');
    const email = document.createElement('input');
    email.type = 'email';
    email.name = 'email';
    email.required = true;
    email.autocomplete = 'email';
    email.placeholder = 'customer@example.com';
    emailLabel.append(email);

    const roleLabel = text('label', '권한');
    const role = document.createElement('select');
    role.name = 'role';
    for (const [value, label] of Object.entries(ROLE_LABELS)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      role.append(option);
    }
    roleLabel.append(role);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary';
    submit.textContent = '고객 초대 발급';
    const status = text('p', '', 'client-invite-result');
    form.append(emailLabel, roleLabel, submit, status);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      submit.disabled = true;
      submit.textContent = '초대 발급 중…';
      status.replaceChildren();
      try {
        const data = await request(`/api/customers/tenants/${encodeURIComponent(tenant.slug)}/invites`, {
          method: 'POST',
          body: JSON.stringify({ email: email.value.trim(), role: role.value }),
        });
        const invite = data.invite;
        const success = text('strong', '초대 링크가 발급되었습니다.');
        const link = document.createElement('code');
        link.className = 'client-invite-link';
        link.textContent = invite.inviteUrl;
        const copy = button('초대 링크 복사', 'ghost compact');
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(invite.inviteUrl);
            copy.textContent = '복사 완료';
          } catch {
            copy.textContent = '링크를 선택해 복사하세요';
          }
        });
        status.append(success, link, copy, text('small', `만료: ${formatDate(invite.expiresAt)}`));
        form.reset();
        await loadTenants();
      } catch (error) {
        status.append(text('span', error.message, 'operations-error'));
      } finally {
        submit.disabled = false;
        submit.textContent = '고객 초대 발급';
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
    for (const label of ['사용자', '권한', '상태', '마지막 로그인']) headRow.append(text('th', label));
    thead.append(headRow);
    const tbody = document.createElement('tbody');
    if (!users.length) {
      const row = document.createElement('tr');
      const cell = text('td', '아직 등록된 고객 사용자가 없습니다. 초대를 발급해 주세요.');
      cell.colSpan = 4;
      row.append(cell);
      tbody.append(row);
    } else {
      for (const user of users) {
        const row = document.createElement('tr');
        const identity = document.createElement('td');
        identity.append(text('strong', user.displayName || user.email), text('small', user.email));
        row.append(identity, text('td', ROLE_LABELS[user.role] || user.role), text('td', user.status === 'active' ? '활성' : user.status), text('td', formatDate(user.lastLoginAt)));
        tbody.append(row);
      }
    }
    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
  }

  function inviteTable(invites, tenant) {
    const wrap = document.createElement('div');
    wrap.className = 'client-table-wrap';
    const table = document.createElement('table');
    table.className = 'client-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const label of ['이메일', '권한', '상태', '만료', '']) headRow.append(text('th', label));
    thead.append(headRow);
    const tbody = document.createElement('tbody');
    if (!invites.length) {
      const row = document.createElement('tr');
      const cell = text('td', '발급된 초대가 없습니다.');
      cell.colSpan = 5;
      row.append(cell);
      tbody.append(row);
    } else {
      for (const invite of invites) {
        const row = document.createElement('tr');
        const state = invite.acceptedAt ? '수락 완료' : invite.revokedAt ? '취소' : new Date(invite.expiresAt) <= new Date() ? '만료' : '대기';
        row.append(text('td', invite.email), text('td', ROLE_LABELS[invite.role] || invite.role), text('td', state), text('td', formatDate(invite.expiresAt)));
        const actionCell = document.createElement('td');
        if (state === '대기') {
          const revoke = button('초대 취소', 'ghost compact');
          revoke.addEventListener('click', async () => {
            revoke.disabled = true;
            try {
              await request(`/api/customers/invites/${invite.id}/revoke`, { method: 'POST' });
              await renderTenantDetail(tenant.slug);
              await loadTenants();
            } catch (error) {
              revoke.textContent = error.message;
            }
          });
          actionCell.append(revoke);
        }
        row.append(actionCell);
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
    showDetailMessage(`${tenant.name}의 인증 정보를 불러오는 중입니다.`);
    try {
      const [usersData, invitesData] = await Promise.all([
        request(`/api/customers/tenants/${encodeURIComponent(slug)}/users`),
        request(`/api/customers/tenants/${encodeURIComponent(slug)}/invites`),
      ]);
      const detail = document.createDocumentFragment();
      const header = document.createElement('div');
      header.className = 'client-detail-head';
      const identity = document.createElement('div');
      identity.append(text('p', 'CLIENT TENANT', 'kicker'), text('h3', tenant.name), text('small', tenant.domain));
      const open = document.createElement('a');
      open.className = 'secondary compact';
      open.href = `https://${tenant.domain}`;
      open.target = '_blank';
      open.rel = 'noopener';
      open.textContent = '고객 사이트 열기 ↗';
      header.append(identity, open);
      detail.append(header, text('h4', '새 고객 사용자 초대'), createInviteForm(tenant), text('h4', '등록 사용자'), userTable(usersData.users || []), text('h4', '초대 이력'), inviteTable(invitesData.invites || [], tenant));
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
