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
    navButton.append(document.createTextNode('◈ '), element('span', '관리자 계정'));
    const clientButton = nav.querySelector('[data-section="clients"]');
    const servicesButton = nav.querySelector('[data-section="services"]');
    if (clientButton) clientButton.insertAdjacentElement('afterend', navButton);
    else if (servicesButton) servicesButton.insertAdjacentElement('afterend', navButton);
    else nav.append(navButton);

    const section = element('section', '', 'section google-admin-access hidden-panel');
    section.dataset.panel = 'admins';
    section.id = 'googleAdminAccess';
    const head = element('div', '', 'section-head');
    const heading = element('div');
    heading.append(element('p', 'GOOGLE ADMIN · PRE-REGISTERED ACCESS', 'kicker'), element('h2', 'Google 관리자 사전등록'));
    heading.append(element('p', 'Google 계정을 먼저 등록하고 권한을 부여합니다. 등록되지 않은 계정은 Google 인증에 성공해도 EKODI 관리자 세션을 받을 수 없습니다.', 'operations-copy'));
    const refresh = element('button', '↻ 새로고침', 'secondary');
    refresh.type = 'button';
    head.append(heading, refresh);

    const summary = element('div', '', 'google-admin-summary');
    const grid = element('div', '', 'google-admin-grid');
    const registerCard = element('article', '', 'google-admin-card');
    registerCard.append(element('h3', '관리자 사전등록'));
    const form = element('form', '', 'google-admin-form');
    const email = document.createElement('input');
    email.type = 'email'; email.name = 'email'; email.placeholder = 'name@ekodibiz.kr'; email.required = true;
    const role = document.createElement('select');
    role.name = 'role';
    for (const [value, label] of Object.entries(ADMIN_ROLES)) {
      const option = document.createElement('option'); option.value = value; option.textContent = label;
      if (value === 'operator') option.selected = true;
      role.append(option);
    }
    const submit = element('button', '사전등록', 'primary'); submit.type = 'submit';
    const formState = element('p', '', 'operations-copy'); formState.style.gridColumn = '1 / -1';
    form.append(email, role, submit, formState);
    registerCard.append(form);

    const listCard = element('article', '', 'google-admin-card');
    listCard.append(element('h3', '승인된 Google 관리자'));
    const list = element('div', '', 'google-admin-list');
    listCard.append(list);
    grid.append(registerCard, listCard);
    section.append(head, summary, grid);
    content.append(section);

    async function loadAccounts() {
      list.replaceChildren(element('p', '관리자 명단을 불러오는 중입니다.', 'operations-loading'));
      try {
        const data = await api('/api/admin-access/google-accounts');
        const accounts = data.accounts || [];
        summary.replaceChildren();
        const active = accounts.filter(item => item.status === 'active').length;
        const bound = accounts.filter(item => Number(item.googleBound) === 1).length;
        const superAdmins = accounts.filter(item => item.status === 'active' && item.role === 'super_admin').length;
        for (const [label, value, note] of [
          ['사전등록', accounts.length, '정확한 이메일 allowlist'],
          ['Google 연결', bound, 'sub 고정 완료'],
          ['최고관리자', superAdmins, '최소 1명 유지'],
        ]) {
          const card = element('article');
          card.append(element('small', label), element('strong', String(value)), element('span', note));
          summary.append(card);
        }
        list.replaceChildren();
        for (const account of accounts) {
          const row = element('div', '', 'google-admin-row');
          const top = element('div', '', 'google-admin-row-head');
          const identity = element('div');
          identity.append(element('strong', account.email));
          const detail = `${account.display_name || '첫 로그인 전'} · ${Number(account.googleBound) ? 'Google ID 고정됨' : 'Google ID 미연결'}${account.required_hd ? ` · Workspace ${account.required_hd}` : ''}`;
          identity.append(element('small', detail));
          const badge = element('span', account.status === 'active' ? '활성' : '중지', `google-admin-status${account.status === 'active' ? '' : ' disabled'}`);
          top.append(identity, badge);
          const actions = element('div', '', 'google-admin-actions');
          const roleSelect = document.createElement('select');
          for (const [value, label] of Object.entries(ADMIN_ROLES)) {
            const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = account.role === value; roleSelect.append(option);
          }
          const statusSelect = document.createElement('select');
          for (const [value, label] of [['active', '활성'], ['disabled', '중지']]) {
            const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = account.status === value; statusSelect.append(option);
          }
          const save = element('button', '저장', 'secondary'); save.type = 'button';
          save.addEventListener('click', async () => {
            save.disabled = true;
            try {
              await api(`/api/admin-access/google-accounts/${account.id}`, { method: 'PUT', body: JSON.stringify({ role: roleSelect.value, status: statusSelect.value }) });
              await loadAccounts();
            } catch (error) {
              alert(error.message || '관리자 계정 변경에 실패했습니다.');
            } finally { save.disabled = false; }
          });
          const controls = element('div'); controls.style.display = 'grid'; controls.style.gridTemplateColumns = '1fr 1fr'; controls.style.gap = '8px'; controls.append(roleSelect, statusSelect);
          actions.append(controls, save);
          row.append(top, actions);
          if (account.last_login_at) row.append(element('small', `마지막 Google 로그인 ${new Date(account.last_login_at).toLocaleString('ko-KR')}`));
          list.append(row);
        }
      } catch (error) {
        list.replaceChildren(element('p', error.message || '관리자 명단을 불러오지 못했습니다.', 'operations-loading'));
      }
    }

    async function activate() {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('admins'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'admins'));
      const pageTitle = document.querySelector('#pageTitle'); if (pageTitle) pageTitle.textContent = '관리자 계정 · Google 인증';
      document.querySelector('.sidebar')?.classList.remove('open');
      await loadAccounts();
    }

    navButton.addEventListener('click', activate);
    refresh.addEventListener('click', loadAccounts);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      formState.textContent = '';
      submit.disabled = true;
      try {
        await api('/api/admin-access/google-accounts', { method: 'POST', body: JSON.stringify({ email: email.value.trim().toLowerCase(), role: role.value }) });
        form.reset(); role.value = 'operator'; formState.textContent = '사전등록했습니다. 해당 Google 계정으로 바로 로그인할 수 있습니다.';
        await loadAccounts();
      } catch (error) {
        formState.textContent = error.message || '사전등록에 실패했습니다.';
      } finally { submit.disabled = false; }
    });
  }

  installGoogleLogin();
  installAdminAccess();
})();
