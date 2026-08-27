(() => {
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const ADMIN_ROLES = {
    super_admin: '최고관리자',
    operator: '운영관리자',
    viewer: '조회관리자',
  };

  function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(data.error || `API 요청 실패 (${response.status})`);
      error.code = data.code || '';
      throw error;
    }
    return data;
  }

  function element(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function loadGoogleLibrary() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ekodi-google-identity]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.dataset.ekodiGoogleIdentity = 'true';
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Google 로그인 라이브러리를 불러올 수 없습니다.')), { once: true });
      document.head.append(script);
    });
  }

  async function installGoogleLogin() {
    const card = document.querySelector('#loginScreen .login-card');
    if (!card || token()) return;

    const panel = element('section', '', 'google-auth-panel');
    panel.id = 'googleAdminLogin';
    panel.hidden = true;
    const title = element('h2', '사전 등록된 Google 계정으로 로그인');
    const copy = element('p', 'EKODI가 미리 승인한 Google 계정만 관리자 콘솔에 들어올 수 있습니다. 비밀번호는 EKODI에 저장하지 않습니다.');
    const buttonHost = element('div', '', 'google-auth-button');
    buttonHost.id = 'googleSignInButton';
    const state = element('p', '', 'google-auth-state');
    state.setAttribute('role', 'alert');
    const meta = element('div', '', 'google-auth-meta');
    meta.append(element('span', 'Google ID 검증'), element('span', '사전등록 allowlist'), element('span', 'Google sub 고정'));
    panel.append(title, copy, buttonHost, state, meta);
    const loginForm = document.querySelector('#loginForm');
    if (loginForm) loginForm.insertAdjacentElement('beforebegin', panel);
    else card.append(panel);

    let config;
    try {
      config = await api('/api/google/config');
    } catch (error) {
      state.textContent = error.message;
      panel.hidden = false;
      return;
    }

    if (!config.enabled || !config.clientId) {
      const fallback = element('div', 'Google OAuth 웹 클라이언트 ID가 아직 연결되지 않아 기존 관리자 로그인을 임시 유지합니다. OAuth 연결이 완료되면 비밀번호 입력창은 자동으로 사라집니다.', 'google-auth-fallback');
      card.insertBefore(fallback, document.querySelector('.legacy-link'));
      return;
    }

    document.body.classList.add('google-auth-enabled');
    panel.hidden = false;
    const loginTitle = document.querySelector('#loginTitle');
    if (loginTitle) loginTitle.textContent = 'Google 인증으로 EKODI를 관리합니다.';
    const loginCopy = card.querySelector('.login-copy');
    if (loginCopy) loginCopy.textContent = '사전에 승인된 Google 관리자 계정만 접근할 수 있습니다.';

    try {
      const challenge = await api('/api/google/challenge', { method: 'POST' });
      await loadGoogleLibrary();
      window.google.accounts.id.initialize({
        client_id: config.clientId,
        nonce: challenge.nonce,
        auto_select: false,
        callback: async response => {
          state.textContent = 'Google 계정을 확인하는 중입니다…';
          try {
            const result = await api('/api/google/login', {
              method: 'POST',
              body: JSON.stringify({ credential: response.credential, nonce: challenge.nonce }),
            });
            sessionStorage.setItem(TOKEN_KEY, result.token);
            sessionStorage.setItem('ekodi-admin-email', result.email);
            state.textContent = '인증되었습니다. 관리 콘솔로 이동합니다.';
            location.reload();
          } catch (error) {
            state.textContent = error.message || 'Google 관리자 로그인에 실패했습니다.';
            buttonHost.replaceChildren();
            const retry = element('button', '다시 로그인', 'secondary');
            retry.type = 'button';
            retry.addEventListener('click', () => location.reload());
            buttonHost.append(retry);
          }
        },
      });
      window.google.accounts.id.renderButton(buttonHost, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(360, Math.max(240, buttonHost.clientWidth || 320)),
      });
    } catch (error) {
      state.textContent = error.message || 'Google 로그인 준비에 실패했습니다.';
    }
  }

  function installAdminAccess() {
    if (!token()) return;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('[data-section="admins"]')) return;

    const navButton = element('button', '', 'nav');
    navButton.type = 'button';
    navButton.dataset.section = 'admins';
    navButton.append(document.createTextNode('◈ '), element('span', 'Admin'));
    const clientButton = nav.querySelector('[data-section="clients"]');
    const servicesButton = nav.querySelector('[data-section="services"]');
    if (clientButton) clientButton.insertAdjacentElement('afterend', navButton);
    else if (servicesButton) servicesButton.insertAdjacentElement('afterend', navButton);
    else nav.append(navButton);

    const section = element('section', '', 'section google-admin-access hidden-panel');
    section.dataset.panel = 'admins';
    section.id = 'googleAdminAccess';

    const head = element('div', '', 'google-admin-section-head');
    const heading = element('div');
    heading.append(element('p', 'ACCESS CONTROL', 'kicker'), element('h2', 'Admin'));
    heading.append(element('p', 'Google 사전등록 계정과 관리자 권한을 한 화면에서 관리합니다.', 'operations-copy'));
    head.append(heading);

    const toolbar = element('div', '', 'google-admin-toolbar');
    const form = element('form', '', 'google-admin-form');
    const formLabel = element('strong', '사전등록', 'google-admin-form-label');
    const email = document.createElement('input');
    email.type = 'email';
    email.name = 'email';
    email.placeholder = 'name@ekodi.kr';
    email.autocomplete = 'email';
    email.required = true;
    const role = document.createElement('select');
    role.name = 'role';
    role.setAttribute('aria-label', '사전등록 관리자 권한');
    for (const [value, label] of Object.entries(ADMIN_ROLES)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      if (value === 'operator') option.selected = true;
      role.append(option);
    }
    const submit = element('button', '사전등록', 'primary');
    submit.type = 'submit';
    form.append(formLabel, email, role, submit);
    const refresh = element('button', '↻ 새로고침', 'secondary google-admin-refresh');
    refresh.type = 'button';
    toolbar.append(form, refresh);
    const formState = element('p', '', 'google-admin-inline-state');
    formState.setAttribute('role', 'status');

    const summary = element('div', '', 'google-admin-summary');

    const filters = element('div', '', 'google-admin-filters');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = '이메일, 이름 검색';
    search.setAttribute('aria-label', '관리자 검색');
    const statusFilter = document.createElement('select');
    statusFilter.setAttribute('aria-label', '상태 필터');
    for (const [value, label] of [['all', '상태 전체'], ['active', '활성'], ['disabled', '중지']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; statusFilter.append(option);
    }
    const roleFilter = document.createElement('select');
    roleFilter.setAttribute('aria-label', '권한 필터');
    for (const [value, label] of [['all', '권한 전체'], ...Object.entries(ADMIN_ROLES)]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; roleFilter.append(option);
    }
    const connectionFilter = document.createElement('select');
    connectionFilter.setAttribute('aria-label', 'Google 연결 상태 필터');
    for (const [value, label] of [['all', '연결 전체'], ['bound', 'Google 연결'], ['unbound', '미연결']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; connectionFilter.append(option);
    }
    const sort = document.createElement('select');
    sort.setAttribute('aria-label', '관리자 정렬');
    for (const [value, label] of [['recent', '최근 로그인순'], ['email', '이메일순'], ['role', '권한순']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; sort.append(option);
    }
    const resetFilters = element('button', '필터 초기화', 'ghost google-admin-filter-reset');
    resetFilters.type = 'button';
    filters.append(search, statusFilter, roleFilter, connectionFilter, sort, resetFilters);

    const listHead = element('div', '', 'google-admin-list-head');
    const listTitle = element('div');
    listTitle.append(element('h3', '승인된 Google 관리자'));
    const resultCount = element('small', '0명', 'google-admin-result-count');
    listTitle.append(resultCount);
    const bulk = element('div', '', 'google-admin-bulk');
    const selectedState = element('span', '0명 선택', 'google-admin-selected-state');
    const bulkActivate = element('button', '일괄 활성', 'ghost'); bulkActivate.type = 'button';
    const bulkDisable = element('button', '일괄 중지', 'ghost'); bulkDisable.type = 'button';
    const clearSelection = element('button', '선택 해제', 'ghost'); clearSelection.type = 'button';
    bulk.append(selectedState, bulkActivate, bulkDisable, clearSelection);
    listHead.append(listTitle, bulk);

    const listState = element('p', '', 'google-admin-list-state');
    listState.setAttribute('role', 'status');
    const list = element('div', '', 'google-admin-list');

    section.append(head, toolbar, formState, summary, filters, listHead, listState, list);
    content.append(section);

    let accountsCache = [];
    const selectedIds = new Set();

    function isGoogleBound(account) { return Number(account.googleBound) === 1; }

    function renderSummary(accounts) {
      const active = accounts.filter(item => item.status === 'active').length;
      const bound = accounts.filter(isGoogleBound).length;
      const superAdmins = accounts.filter(item => item.status === 'active' && item.role === 'super_admin').length;
      summary.replaceChildren();
      for (const [label, value, note] of [
        ['사전등록', accounts.length, 'allowlist'],
        ['Google 연결', bound, 'sub 고정'],
        ['최고관리자', superAdmins, '최소 1명'],
        ['전체 활성', active, '현재 접근 가능'],
      ]) {
        const card = element('article');
        card.append(element('small', label), element('strong', String(value)), element('span', note));
        summary.append(card);
      }
    }

    function filteredAccounts() {
      const query = search.value.trim().toLowerCase();
      let accounts = accountsCache.filter(account => {
        const identity = `${account.email || ''} ${account.display_name || ''}`.toLowerCase();
        const matchesSearch = !query || identity.includes(query);
        const matchesStatus = statusFilter.value === 'all' || account.status === statusFilter.value;
        const matchesRole = roleFilter.value === 'all' || account.role === roleFilter.value;
        const bound = isGoogleBound(account);
        const matchesConnection = connectionFilter.value === 'all'
          || (connectionFilter.value === 'bound' && bound)
          || (connectionFilter.value === 'unbound' && !bound);
        return matchesSearch && matchesStatus && matchesRole && matchesConnection;
      });

      const roleRank = { super_admin: 0, operator: 1, viewer: 2 };
      accounts = [...accounts].sort((a, b) => {
        if (sort.value === 'email') return String(a.email).localeCompare(String(b.email));
        if (sort.value === 'role') return (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9) || String(a.email).localeCompare(String(b.email));
        const aTime = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
        const bTime = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
        return bTime - aTime || String(a.email).localeCompare(String(b.email));
      });
      return accounts;
    }

    function updateBulkState() {
      selectedState.textContent = `${selectedIds.size}명 선택`;
      bulkActivate.disabled = selectedIds.size === 0;
      bulkDisable.disabled = selectedIds.size === 0;
      clearSelection.disabled = selectedIds.size === 0;
    }

    function adminRow(account) {
      const row = element('article', '', 'google-admin-row');
      row.dataset.accountId = String(account.id);

      const top = element('div', '', 'google-admin-row-head');
      const selectWrap = element('label', '', 'google-admin-check');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedIds.has(String(account.id));
      checkbox.setAttribute('aria-label', `${account.email} 선택`);
      checkbox.addEventListener('change', () => {
        const id = String(account.id);
        if (checkbox.checked) selectedIds.add(id); else selectedIds.delete(id);
        updateBulkState();
      });
      selectWrap.append(checkbox);

      const identity = element('div', '', 'google-admin-identity');
      identity.append(element('strong', account.email));
      const detailParts = [account.display_name || '첫 로그인 전'];
      if (account.required_hd) detailParts.push(`Workspace ${account.required_hd}`);
      identity.append(element('small', detailParts.join(' · ')));

      const badges = element('div', '', 'google-admin-badges');
      badges.append(element('span', isGoogleBound(account) ? 'Google 연결' : '미연결', `google-admin-connection${isGoogleBound(account) ? ' bound' : ' unbound'}`));
      badges.append(element('span', account.status === 'active' ? '활성' : '중지', `google-admin-status${account.status === 'active' ? '' : ' disabled'}`));
      top.append(selectWrap, identity, badges);

      const actions = element('div', '', 'google-admin-actions');
      const roleSelect = document.createElement('select');
      roleSelect.setAttribute('aria-label', `${account.email} 권한`);
      for (const [value, label] of Object.entries(ADMIN_ROLES)) {
        const option = document.createElement('option');
        option.value = value; option.textContent = label; option.selected = account.role === value; roleSelect.append(option);
      }
      const statusSelect = document.createElement('select');
      statusSelect.setAttribute('aria-label', `${account.email} 상태`);
      for (const [value, label] of [['active', '활성'], ['disabled', '중지']]) {
        const option = document.createElement('option');
        option.value = value; option.textContent = label; option.selected = account.status === value; statusSelect.append(option);
      }
      const save = element('button', '저장', 'secondary');
      save.type = 'button';
      save.addEventListener('click', async () => {
        const isLastActiveSuperAdmin = account.role === 'super_admin'
          && account.status === 'active'
          && (roleSelect.value !== 'super_admin' || statusSelect.value !== 'active')
          && accountsCache.filter(item => item.role === 'super_admin' && item.status === 'active').length <= 1;
        if (isLastActiveSuperAdmin) {
          listState.textContent = '최소 1명의 활성 최고관리자는 반드시 유지해야 합니다.';
          return;
        }
        save.disabled = true;
        listState.textContent = '';
        try {
          await api(`/api/admin-access/google-accounts/${account.id}`, {
            method: 'PUT',
            body: JSON.stringify({ role: roleSelect.value, status: statusSelect.value }),
          });
          await loadAccounts();
        } catch (error) {
          listState.textContent = error.message || '관리자 계정 변경에 실패했습니다.';
        } finally { save.disabled = false; }
      });
      const remove = element('button', '관리자 권한 제거', 'ghost google-admin-remove');
      remove.type = 'button';
      const currentEmail = (sessionStorage.getItem('ekodi-admin-email') || '').toLowerCase();
      if ((account.email || '').toLowerCase() === currentEmail) {
        remove.disabled = true;
        remove.title = '현재 로그인한 최고관리자 자신의 권한은 제거할 수 없습니다.';
      }
      remove.addEventListener('click', async () => {
        const activeSuperAdmins = accountsCache.filter(item => item.role === 'super_admin' && item.status === 'active').length;
        if (account.role === 'super_admin' && account.status === 'active' && activeSuperAdmins <= 1) {
          listState.textContent = '마지막 활성 최고관리자는 제거할 수 없습니다.';
          return;
        }
        if (!confirm(`${account.email}의 EKODI 플랫폼 관리자 권한을 제거하시겠습니까?\nGoogle 계정과 고객사이트 로컬 역할은 삭제되지 않습니다.`)) return;
        remove.disabled = true;
        listState.textContent = '관리자 권한을 제거하는 중입니다…';
        try {
          await api(`/api/admin-access/google-accounts/${account.id}`, { method: 'DELETE' });
          selectedIds.delete(String(account.id));
          listState.textContent = '관리자 권한을 제거했습니다.';
          await loadAccounts();
        } catch (error) {
          listState.textContent = error.message || '관리자 권한 제거에 실패했습니다.';
          remove.disabled = false;
        }
      });
      actions.append(roleSelect, statusSelect, save, remove);

      const meta = element('div', '', 'google-admin-meta');
      meta.append(element('small', account.last_login_at
        ? `최근 로그인 ${new Date(account.last_login_at).toLocaleString('ko-KR')}`
        : '최근 로그인 없음'));
      if (account.created_at) meta.append(element('small', `등록 ${new Date(account.created_at).toLocaleDateString('ko-KR')}`));

      row.append(top, actions, meta);
      return row;
    }

    function renderAccounts() {
      const accounts = filteredAccounts();
      resultCount.textContent = `${accounts.length}명`;
      list.replaceChildren();
      if (!accounts.length) {
        list.append(element('p', '조건에 맞는 관리자가 없습니다.', 'operations-loading'));
      } else {
        accounts.forEach(account => list.append(adminRow(account)));
      }
      updateBulkState();
    }

    async function loadAccounts() {
      listState.textContent = '';
      list.replaceChildren(element('p', '관리자 명단을 불러오는 중입니다.', 'operations-loading'));
      refresh.disabled = true;
      try {
        const data = await api('/api/admin-access/google-accounts');
        accountsCache = data.accounts || [];
        const validIds = new Set(accountsCache.map(item => String(item.id)));
        for (const id of [...selectedIds]) if (!validIds.has(id)) selectedIds.delete(id);
        renderSummary(accountsCache);
        renderAccounts();
      } catch (error) {
        list.replaceChildren(element('p', error.message || '관리자 명단을 불러오지 못했습니다.', 'operations-loading'));
      } finally {
        refresh.disabled = false;
      }
    }

    async function bulkSetStatus(nextStatus) {
      if (!selectedIds.size) return;
      const selected = accountsCache.filter(account => selectedIds.has(String(account.id)));
      if (nextStatus === 'disabled') {
        const selectedActiveSuperAdmins = selected.filter(account => account.role === 'super_admin' && account.status === 'active').length;
        const allActiveSuperAdmins = accountsCache.filter(account => account.role === 'super_admin' && account.status === 'active').length;
        if (allActiveSuperAdmins - selectedActiveSuperAdmins < 1) {
          listState.textContent = '최소 1명의 활성 최고관리자는 반드시 유지해야 합니다.';
          return;
        }
      }
      listState.textContent = `${selected.length}명 상태 변경 중…`;
      bulkActivate.disabled = true;
      bulkDisable.disabled = true;
      try {
        for (const account of selected) {
          if (account.status === nextStatus) continue;
          await api(`/api/admin-access/google-accounts/${account.id}`, {
            method: 'PUT',
            body: JSON.stringify({ role: account.role, status: nextStatus }),
          });
        }
        selectedIds.clear();
        listState.textContent = '선택한 관리자 상태를 변경했습니다.';
        await loadAccounts();
      } catch (error) {
        listState.textContent = error.message || '일괄 상태 변경에 실패했습니다.';
      } finally {
        updateBulkState();
      }
    }

    async function activate() {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('admins'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'admins'));
      const pageTitle = document.querySelector('#pageTitle'); if (pageTitle) pageTitle.textContent = 'Admin';
      document.querySelector('.sidebar')?.classList.remove('open');
      await loadAccounts();
    }

    navButton.addEventListener('click', activate);
    refresh.addEventListener('click', loadAccounts);
    [search, statusFilter, roleFilter, connectionFilter, sort].forEach(control => control.addEventListener(control === search ? 'input' : 'change', renderAccounts));
    resetFilters.addEventListener('click', () => {
      search.value = '';
      statusFilter.value = 'all';
      roleFilter.value = 'all';
      connectionFilter.value = 'all';
      sort.value = 'recent';
      renderAccounts();
      search.focus();
    });
    clearSelection.addEventListener('click', () => { selectedIds.clear(); renderAccounts(); });
    bulkActivate.addEventListener('click', () => bulkSetStatus('active'));
    bulkDisable.addEventListener('click', () => bulkSetStatus('disabled'));

    form.addEventListener('submit', async event => {
      event.preventDefault();
      formState.textContent = '';
      submit.disabled = true;
      try {
        await api('/api/admin-access/google-accounts', {
          method: 'POST',
          body: JSON.stringify({ email: email.value.trim().toLowerCase(), role: role.value }),
        });
        form.reset();
        role.value = 'operator';
        formState.textContent = '사전등록 완료';
        await loadAccounts();
      } catch (error) {
        formState.textContent = error.message || '사전등록에 실패했습니다.';
      } finally { submit.disabled = false; }
    });

    updateBulkState();
  }

  installGoogleLogin();
  installAdminAccess();
})();
