(() => {
  const API = 'https://api.ekodi.kr';
  const ROLE_LABELS = Object.freeze({
    platform_admin: '최고관리자',
    service_admin: '서비스 관리자',
    workspace_admin: '운영공간 관리자',
    manager: '중간관리자·운영책임자',
    ai_manager: 'AI 관리자',
    external_developer: '외부개발자',
    staff: '하위관리자·실무자',
    viewer: '조회·검수자',
  });
  const SCOPE_LABELS = Object.freeze({ platform:'플랫폼 전체', service:'서비스·사이트', workspace:'운영공간', person:'개인' });
  const ROLE_BY_SCOPE = Object.freeze({
    platform: ['platform_admin','viewer'],
    service: ['service_admin','manager','ai_manager','external_developer','staff','viewer'],
    workspace: ['workspace_admin','manager','ai_manager','external_developer','staff','viewer'],
    person: ['viewer'],
  });

  const clean = value => String(value || '').trim();
  const lower = value => clean(value).toLowerCase();
  const text = (tag, value, className = '') => { const node = document.createElement(tag); if (className) node.className = className; node.textContent = value; return node; };
  const button = (label, className = 'secondary') => { const node = document.createElement('button'); node.type = 'button'; node.className = className; node.textContent = label; return node; };
  const option = (value, label) => { const node = document.createElement('option'); node.value = value; node.textContent = label; return node; };
  const adminToken = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const dateAfter = days => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
  const formatDate = value => { if (!value) return '계속'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '계속' : d.toLocaleString('ko-KR'); };

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = adminToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache:'no-store' });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(data.error || `권한관리 API 요청 실패 (${response.status})`);
      error.code = data.code || '';
      error.details = data.errors || [];
      throw error;
    }
    return data;
  }

  let shell = null;
  let catalog = { scopes:[], roles:[] };
  let grants = [];
  let selectedScope = { type:'platform', key:'ekodi' };
  let loaded = false;
  let loading = false;

  function scopeId(scope) { return `${scope?.type || ''}:${scope?.key || ''}`; }
  function descriptorFor(scope) { return catalog.scopes.find(item => item.type === scope.type && item.key === scope.key) || null; }
  function scopeName(scope) {
    const item = descriptorFor(scope);
    return item?.name || (scope.type === 'workspace' ? `운영공간 · ${scope.key}` : scope.type === 'person' ? `개인 · ${scope.key}` : scopeId(scope));
  }
  function statusOf(grant) {
    if (!grant.enabled) return '중지';
    if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) return '기간 만료';
    return '활성';
  }

  function installShell() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || content.querySelector('[data-panel~="clients"]')) return null;
    let navButton = nav.querySelector('[data-section="clients"]');
    if (!navButton) {
      navButton = button('', 'nav');
      navButton.dataset.section = 'clients';
      navButton.append(document.createTextNode('◎ '), text('span', '권한'));
      const servicesButton = nav.querySelector('[data-section="services"]');
      if (servicesButton) servicesButton.insertAdjacentElement('afterend', navButton); else nav.append(navButton);
    } else {
      const label = navButton.querySelector('span');
      if (label) label.textContent = '권한';
    }

    const section = document.createElement('section');
    section.className = 'section client-access-section hidden-panel';
    section.dataset.panel = 'clients';
    section.id = 'clientAccessSection';
    const head = document.createElement('div');
    head.className = 'section-head client-access-head';
    const heading = document.createElement('div');
    heading.append(text('p', 'ACCESS · PERSON → SCOPE → ROLE → CAPABILITY', 'kicker'), text('h2', 'EKODI 전체 권한'));
    heading.append(text('p', '플랫폼·서비스·사이트·운영공간별 권한을 하나의 중앙 기준으로 관리합니다. URL 위치만으로 권한이 상속되지는 않습니다.', 'operations-copy'));
    const refresh = button('↻ 새로고침', 'secondary');
    head.append(heading, refresh);

    const summary = document.createElement('div'); summary.className = 'client-access-summary';
    const layout = document.createElement('div'); layout.className = 'client-access-layout';
    const scopeList = document.createElement('div'); scopeList.className = 'client-tenant-list';
    const detail = document.createElement('div'); detail.className = 'client-access-detail';
    layout.append(scopeList, detail);
    section.append(head, summary, layout);
    content.append(section);

    const activate = () => {
      document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('hidden-panel', !String(panel.dataset.panel || '').split(' ').includes('clients')));
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'clients'));
      const pageTitle = document.querySelector('#pageTitle'); if (pageTitle) pageTitle.textContent = 'EKODI 전체 권한';
      document.querySelector('.sidebar')?.classList.remove('open');
      load(true);
    };
    navButton.addEventListener('click', activate);
    refresh.addEventListener('click', () => load(true));
    return { section, summary, scopeList, detail };
  }

  function renderSummary() {
    const active = grants.filter(item => statusOf(item) === '활성').length;
    const external = grants.filter(item => item.principalType === 'external_collaborator').length;
    const accounts = new Set(grants.map(item => lower(item.email)).filter(Boolean)).size;
    shell.summary.replaceChildren();
    for (const [label, value, note] of [
      ['관리 범위', catalog.scopes.length, 'EKODI 전체 + 등록 서비스'],
      ['권한 부여', grants.length, `활성 ${active}`],
      ['Google 계정', accounts, '같은 계정도 범위별 권한 분리'],
      ['외부협력자', external, '기간제·최소권한'],
    ]) {
      const card = document.createElement('article'); card.append(text('small', label), text('strong', String(value)), text('span', note)); shell.summary.append(card);
    }
  }

  function renderScopeList() {
    shell.scopeList.replaceChildren();
    const scopes = [...catalog.scopes];
    const workspaceKeys = [...new Set(grants.filter(item => item.scope?.type === 'workspace').map(item => item.scope.key))];
    for (const key of workspaceKeys) scopes.push({ type:'workspace', key, id:`workspace:${key}`, name:`운영공간 · ${key}`, group:'workspace' });
    for (const item of scopes) {
      const node = button('', `client-tenant-card${scopeId(item) === scopeId(selectedScope) ? ' active' : ''}`);
      const count = grants.filter(grant => scopeId(grant.scope) === scopeId(item)).length;
      const top = document.createElement('span'); top.className = 'client-tenant-card-head';
      top.append(text('strong', item.name), text('span', SCOPE_LABELS[item.type] || item.type, 'client-count-chip'));
      node.append(top, text('small', item.adminPath || item.basePath || item.key), text('small', `${count}개 권한`));
      node.addEventListener('click', () => { selectedScope = { type:item.type, key:item.key }; render(); });
      shell.scopeList.append(node);
    }
    const custom = button('+ 운영공간 선택', 'secondary');
    custom.addEventListener('click', () => {
      const key = clean(prompt('운영공간의 고정 workspace_id를 입력하세요. URL이나 표시명 대신 변하지 않는 ID를 사용합니다.') || '');
      if (!key) return;
      selectedScope = { type:'workspace', key };
      render();
    });
    shell.scopeList.append(custom);
  }

  function roleOptions(scopeType) { return ROLE_BY_SCOPE[scopeType] || ['viewer']; }

  function grantForm() {
    const form = document.createElement('form'); form.className = 'client-invite-form';
    const emailLabel = text('label', 'Google 이메일');
    const email = document.createElement('input'); email.type = 'email'; email.required = true; email.placeholder = 'user@gmail.com'; emailLabel.append(email);
    const roleLabel = text('label', '역할');
    const role = document.createElement('select');
    for (const value of roleOptions(selectedScope.type)) role.append(option(value, ROLE_LABELS[value] || value));
    roleLabel.append(role);
    const githubLabel = text('label', 'GitHub 사용자명');
    const github = document.createElement('input'); github.type = 'text'; github.maxLength = 39; github.placeholder = 'github-username'; githubLabel.append(github);
    const expiryLabel = text('label', '접근 만료일');
    const expiry = document.createElement('input'); expiry.type = 'date'; expiry.min = new Date().toISOString().slice(0,10); expiry.value = dateAfter(30); expiryLabel.append(expiry);
    const noteLabel = text('label', '메모'); const note = document.createElement('input'); note.type = 'text'; note.maxLength = 500; note.placeholder = '권한 목적·담당업무'; noteLabel.append(note);
    const developerFields = document.createElement('div'); developerFields.className = 'client-developer-fields'; developerFields.append(githubLabel, expiryLabel, text('p', '외부개발자는 개인정보·재정·비밀키·운영배포·권한관리 권한이 자동 차단됩니다.', 'operations-copy'));
    const sync = () => { const external = role.value === 'external_developer'; developerFields.hidden = !external; github.required = external; expiry.required = external; };
    role.addEventListener('change', sync); sync();
    const submit = button('권한 등록', 'primary'); submit.type = 'submit';
    const result = text('p', '', 'client-invite-result');
    form.append(emailLabel, roleLabel, developerFields, noteLabel, submit, result);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!form.checkValidity()) return form.reportValidity();
      submit.disabled = true; submit.textContent = '반영 중…'; result.replaceChildren();
      try {
        const external = role.value === 'external_developer';
        const expiresAt = external && expiry.value ? new Date(`${expiry.value}T23:59:59+09:00`).toISOString() : '';
        await request('/api/access-governance/grants', { method:'POST', body:JSON.stringify({
          email:email.value.trim(), role:role.value, scopeType:selectedScope.type, scopeKey:selectedScope.key,
          githubUsername:external ? github.value.trim() : '', expiresAt, note:note.value.trim(),
        }) });
        result.append(text('strong', `${scopeName(selectedScope)} 권한을 반영했습니다.`));
        form.reset(); expiry.value = dateAfter(30); sync(); await load(true);
      } catch (error) {
        const suffix = error.code === 'ELEVATION_REQUIRED' ? ' 최고관리자 추가 인증 후 다시 실행하세요.' : '';
        result.append(text('span', `${error.message}${suffix}`, 'operations-error'));
      } finally { submit.disabled = false; submit.textContent = '권한 등록'; }
    });
    return form;
  }

  function revokeButton(grant) {
    if (!grant.enabled) return text('span', '회수됨', 'client-count-chip');
    const node = button('권한 회수', 'secondary compact');
    node.addEventListener('click', async () => {
      if (!confirm(`${grant.email}의 ${scopeName(grant.scope)} 권한을 회수할까요?`)) return;
      node.disabled = true;
      try {
        await request('/api/access-governance/revoke', { method:'POST', body:JSON.stringify({ email:grant.email, scopeType:grant.scope.type, scopeKey:grant.scope.key }) });
        await load(true);
      } catch (error) { alert(error.message); }
      finally { node.disabled = false; }
    });
    return node;
  }

  function grantTable(items) {
    const wrap = document.createElement('div'); wrap.className = 'client-table-wrap';
    const table = document.createElement('table'); table.className = 'client-table';
    const thead = document.createElement('thead'); const hr = document.createElement('tr');
    for (const label of ['사용자','역할','상태','만료','관리']) hr.append(text('th', label)); thead.append(hr);
    const tbody = document.createElement('tbody');
    if (!items.length) {
      const row = document.createElement('tr'); const cell = text('td', '이 범위에 등록된 권한이 없습니다.'); cell.colSpan = 5; row.append(cell); tbody.append(row);
    } else {
      for (const grant of items) {
        const row = document.createElement('tr');
        const identity = document.createElement('td'); identity.append(text('strong', grant.email));
        if (grant.githubUsername) identity.append(text('small', `GitHub · @${grant.githubUsername}`));
        if (grant.sourceRef) identity.append(text('small', `연결 · ${grant.sourceRef}`));
        row.append(identity, text('td', ROLE_LABELS[grant.role] || grant.role), text('td', statusOf(grant)), text('td', formatDate(grant.expiresAt)));
        const manage = document.createElement('td'); manage.append(revokeButton(grant)); row.append(manage); tbody.append(row);
      }
    }
    table.append(thead, tbody); wrap.append(table); return wrap;
  }

  function renderDetail() {
    shell.detail.replaceChildren();
    const descriptor = descriptorFor(selectedScope);
    const head = document.createElement('div'); head.className = 'client-detail-head';
    const identity = document.createElement('div');
    identity.append(text('p', `${SCOPE_LABELS[selectedScope.type] || selectedScope.type} · ${selectedScope.type}:${selectedScope.key}`, 'kicker'), text('h3', scopeName(selectedScope)));
    if (descriptor?.adminPath) identity.append(text('small', descriptor.adminPath));
    head.append(identity); shell.detail.append(head);
    if (selectedScope.type === 'person') shell.detail.append(text('p', '개인 Scope는 자기 데이터 범위를 표현하며 관리자 위임 용도로 사용하지 않습니다.', 'operations-copy'));
    else shell.detail.append(text('h4', '권한 등록'), grantForm());
    const items = grants.filter(item => scopeId(item.scope) === scopeId(selectedScope));
    shell.detail.append(text('h4', `현재 권한 · ${items.length}건`), grantTable(items));
  }

  function render() { if (!shell) return; renderSummary(); renderScopeList(); renderDetail(); }

  async function load(force = false) {
    if (!shell || !adminToken()) { shell?.detail.replaceChildren(text('p', '관리자 로그인 후 권한을 관리할 수 있습니다.', 'operations-loading')); return; }
    if (loading || (loaded && !force)) return render();
    loading = true; shell.detail.replaceChildren(text('p', 'EKODI 전체 권한을 불러오는 중입니다.', 'operations-loading'));
    try {
      catalog = await request('/api/access-governance/scopes');
      const all = await request('/api/access-governance/grants');
      grants = Array.isArray(all.grants) ? all.grants : [];
      loaded = true;
      if (!descriptorFor(selectedScope) && selectedScope.type !== 'workspace') selectedScope = { type:'platform', key:'ekodi' };
      render();
    } catch (error) { shell.detail.replaceChildren(text('p', error.message, 'operations-error')); }
    finally { loading = false; }
  }

  function init() { shell = installShell(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})();
