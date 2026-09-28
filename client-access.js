(() => {
  const API = 'https://ekodi.kr';
  const REQUEST_TIMEOUT_MS = 8000;
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
    ['external_vendor', '외부업체'],
    ['external_developer', '외부개발자'],
  ];
  const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS);
  const USER_ROLE_OPTIONS = [
    ['member','회원'],
    ['viewer','조회·검수자'],
    ['client_viewer','조회·검수자 · 기존'],
  ];
  const USER_ROLE_SET = new Set(USER_ROLE_OPTIONS.map(item => item[0]));
  const TAB_LABELS = {
    members: '전체 사용자',
    sites: '사이트·공간',
    pending: '인증 대기',
    roles: '역할·권한',
  };

  const CAPABILITY_LABELS = Object.freeze({
    '*': '전체 역할 권한',
    'tenant.dashboard.read': '대시보드 조회',
    'tenant.site.manage': '사이트 설정',
    'tenant.language.manage': '언어 설정',
    'tenant.catalog.read': '상품·서비스 조회',
    'tenant.orders.read': '주문 조회',
    'tenant.customers.insights': '고객 현황',
    'tenant.reviews.manage': '리뷰 관리',
    'tenant.sales.read': '매출 조회',
    'tenant.inventory.manage': '재고 관리',
    'tenant.marketing.manage': '마케팅 관리',
    'tenant.supply-network.manage': '공급망 관리',
    'tenant.member-roster.manage': '회원명부 관리',
    'tenant.operations.manage': '운영 관리',
    'tenant.finance.read': '재정 조회',
    'tenant.finance.manage': '재정 관리',
    'tenant.offerings.manage': '헌금 관리',
    'tenant.receipts.manage': '증빙 관리',
    'tenant.confirmations.manage': '확인업무 관리',
    'tenant.connections.manage': '연동 관리',
    'tenant.access.manage': '사용자·권한 관리',
    'tenant.people.read': '구성원 조회',
    'tenant.attendance.manage': '출석 관리',
    'tenant.activity.manage': '활동 관리',
    'tenant.worship.manage': '예배 관리',
    'tenant.care.manage': '돌봄 관리',
    'tenant.calendar.manage': '일정 관리',
    'tenant.ministry.manage': '사역 관리',
    'tenant.reports.manage': '보고 관리',
    'tenant.ai.assist': 'AI 보조',
    'tenant.developer.inspect': '개발 점검',
    'tenant.site.source.read': '사이트 소스 조회',
    'tenant.preview.read': '미리보기',
    'tenant.logs.read': '로그 조회',
    'tenant.test.run': '테스트 실행',
    'tenant.pr.create': 'PR 생성',
    'tenant.integration.inspect': '연동 점검',
    'tenant.integration.test': '연동 테스트',
  });
  const AUDIT_ACTION_LABELS = Object.freeze({
    'grant.create': '권한 등록',
    'grant.update': '권한 변경',
    'grant.revoke': '권한 회수',
  });

  function adminToken() {
    return sessionStorage.getItem('ekodi-auth-token') || '';
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = adminToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const controller = options.signal ? null : new AbortController();
    const timeout = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const response = await fetch(`${API}${path}`, {
        ...options,
        headers,
        signal: options.signal || controller?.signal,
        cache: 'no-store',
      });
      let data = {};
      try { data = await response.json(); } catch {}
      if (!response.ok) {
        const suffix = data.code ? ` · ${data.code}` : '';
        throw new Error(`${data.error || `고객관리 API 요청 실패 (${response.status})`}${suffix}`);
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('사용자·접근 정보를 8초 안에 불러오지 못했습니다. 다시 확인해 주세요.');
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
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

  function capabilityLabel(value) {
    const key = String(value || '').trim();
    return CAPABILITY_LABELS[key] || key || '확인 필요';
  }

  function auditKey(member) {
    return `${member?.tenant?.slug || ''}|${String(member?.email || '').toLowerCase()}`;
  }

  function normalizedEditableStatus(member) {
    return member?.status === 'disabled' ? 'disabled' : 'active';
  }

  function accessChangeSet(member, next) {
    const current = {
      role: member.role,
      visibility: member.visibility === 'public' ? 'public' : 'private',
      status: normalizedEditableStatus(member),
    };
    const labels = { role:'역할', visibility:'목록 공개', status:'사용 상태' };
    const valueLabel = (field, value) => {
      if (field === 'role') return ROLE_LABELS[value] || value;
      if (field === 'visibility') return value === 'public' ? '공개' : '비공개';
      if (field === 'status') return value === 'disabled' ? '중지' : '활성';
      return value;
    };
    return Object.keys(current)
      .filter(field => current[field] !== next[field])
      .map(field => ({
        field,
        label: labels[field],
        before: valueLabel(field, current[field]),
        after: valueLabel(field, next[field]),
      }));
  }

  function confirmAccessChanges(member, changes) {
    if (!changes.length) return false;
    const lines = changes.map(change => `• ${change.label}: ${change.before} → ${change.after}`);
    return confirm([
      `${member.email} · ${member.tenant.name}`,
      '다음 접근권한 변경을 적용할까요?',
      '',
      ...lines,
      '',
      '변경 내용은 권한 감사기록에 남습니다.',
    ].join('\n'));
  }

  function auditValueText(value) {
    if (Array.isArray(value)) return value.length ? value.map(capabilityLabel).join(', ') : '없음';
    const textValue = String(value ?? '').trim();
    return textValue || '없음';
  }

  function renderAuditHistory(container, history = []) {
    container.replaceChildren();
    if (!history.length) {
      container.append(text('span', '최근 권한 변경기록이 없습니다.', 'client-audit-empty'));
      return;
    }
    for (const item of history) {
      const article = document.createElement('article');
      article.className = 'client-audit-item';
      const head = document.createElement('div');
      head.className = 'client-audit-head';
      head.append(
        text('strong', AUDIT_ACTION_LABELS[item.action] || item.action || '권한 변경'),
        text('time', formatDate(item.createdAt, '시각 확인 필요')),
      );
      const actor = text('small', `변경자 · ${item.actorEmail || '기록 없음'}`);
      article.append(head, actor);
      const changes = Array.isArray(item.changes) ? item.changes : [];
      if (!changes.length) {
        article.append(text('p', '세부 변경항목 없음'));
      } else {
        const list = document.createElement('div');
        list.className = 'client-audit-changes';
        for (const change of changes) {
          list.append(text('span', `${change.label || change.field} · ${auditValueText(change.before)} → ${auditValueText(change.after)}`));
        }
        article.append(list);
      }
      container.append(article);
    }
  }

  function dateAfter(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function statePanel(kind, title, description, actionLabel = '', onAction = null) {
    const panel = document.createElement('div');
    panel.className = `client-state client-state-${kind}`;
    panel.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    panel.append(text('strong', title));
    if (description) panel.append(text('p', description));
    if (actionLabel && typeof onAction === 'function') {
      const action = button(actionLabel, 'secondary compact');
      action.addEventListener('click', onAction);
      panel.append(action);
    }
    return panel;
  }

  function userMembers() {
    return directory.members.filter(member => USER_ROLE_SET.has(member.role));
  }

  function hasActiveFilters(forcePending = false) {
    if (!shell) return false;
    return Boolean(
      shell.search.value.trim()
      || shell.site.value
      || shell.role.value
      || (!forcePending && shell.status.value)
    );
  }

  function resetFilters() {
    if (!shell) return;
    shell.search.value = '';
    shell.site.value = '';
    shell.role.value = '';
    shell.status.value = activeTab === 'pending' ? 'pre_registered' : '';
    renderActiveTab();
  }

  function renderSyncBar({ loading: isLoading = false, error = '' } = {}) {
    if (!shell?.sync) return;
    const tenant = directory.tenants.find(item => item.slug === directory.authority?.tenant);
    const scope = directory.authority?.scope === 'tenant'
      ? `${tenant?.name || directory.authority?.tenant || '사이트'} 범위`
      : '플랫폼 전체 범위';
    const left = document.createElement('div');
    left.className = 'client-sync-scope';
    left.append(
      text('strong', scope),
      text('span', '사이트 멤버십 권한은 플랫폼 전체 권한으로 자동 확장되지 않습니다.'),
    );
    const right = document.createElement('span');
    right.className = `client-sync-status${error ? ' error' : ''}`;
    if (isLoading) right.textContent = '데이터 확인 중…';
    else if (error) right.textContent = `확인 필요 · ${error}`;
    else if (lastSuccessfulSyncAt) right.textContent = `마지막 동기화 · ${formatDate(lastSuccessfulSyncAt, '방금')}`;
    else right.textContent = '아직 동기화 전';
    shell.sync.replaceChildren(left, right);
  }

  let shell;
  let directory = { summary: {}, tenants: [], roles: [], members: [] };
  let selectedSlug = '';
  let activeTab = 'members';
  let loaded = false;
  let loading = false;
  let lastSuccessfulSyncAt = '';
  const auditCache = new Map();

  function installShell() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || content.querySelector('[data-panel~="clients"]')) return null;

    let navButton = nav.querySelector('[data-section="clients"]');
    if (!navButton) {
      navButton = button('', 'nav');
      navButton.dataset.section = 'clients';
      navButton.append(document.createTextNode('◎ '), text('span', '사용자·접근'));
      const servicesButton = nav.querySelector('[data-section="services"]');
      if (servicesButton) servicesButton.insertAdjacentElement('afterend', navButton);
      else nav.append(navButton);
    }

    const section = document.createElement('section');
    section.className = 'section client-access-section hidden-panel';
    section.dataset.panel = 'clients users-access';
    section.id = 'clientAccessSection';

    const head = document.createElement('div');
    head.className = 'section-head client-access-head';
    const heading = document.createElement('div');
    heading.append(text('p', 'USERS · ACCESS CONTROL', 'kicker'), text('h2', '사용자·접근 관리'));
    heading.append(text('p', '사용자, 사이트 범위, 역할과 인증 상태를 한 화면에서 확인하고 필요한 접근권한만 관리합니다.', 'operations-copy'));
    const refresh = button('↻ 새로고침', 'secondary');
    refresh.id = 'refreshClients';
    head.append(heading, refresh);

    const summary = document.createElement('div');
    summary.className = 'client-access-summary';
    summary.id = 'clientAccessSummary';

    const sync = document.createElement('div');
    sync.className = 'client-syncbar';
    sync.id = 'clientAccessSync';
    sync.setAttribute('aria-live', 'polite');

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

    section.append(head, summary, sync, tabs, toolbar, body);
    content.append(section);

    const activateClients = () => {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('clients'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'clients'));
      const pageTitle = document.querySelector('#pageTitle');
      if (pageTitle) pageTitle.textContent = '사용자·접근 관리';
      document.querySelector('.sidebar')?.classList.remove('open');
      loadDirectory();
    };

    navButton.addEventListener('click', activateClients);
    refresh.addEventListener('click', () => loadDirectory(true));
    return { section, summary, sync, tabs, toolbar, body, search, site, role, status, refresh };
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
    for (const item of directory.roles.filter(item => USER_ROLE_SET.has(item.role))) shell.role.append(selectOption(item.role, item.label));
    shell.role.value = USER_ROLE_SET.has(roleValue) ? roleValue : '';
  }

  function renderSummary() {
    if (!shell) return;
    const members = loaded ? userMembers() : [];
    const uniqueAccounts = loaded ? new Set(members.map(member => String(member.email || '').trim().toLowerCase()).filter(Boolean)).size : '—';
    const active = loaded ? members.filter(member => member.status === 'active').length : '—';
    const pending = loaded ? members.filter(member => member.status === 'pre_registered').length : '—';
    const disabled = loaded ? members.filter(member => member.status === 'disabled').length : 0;
    const expired = loaded ? members.filter(member => member.status === 'expired').length : 0;
    const disabledExpired = loaded ? disabled + expired : '—';
    shell.summary.replaceChildren();
    const cards = [
      ['전체 계정', uniqueAccounts, '현재 사용자 역할 범위의 중복 이메일 제거 계정'],
      ['활성', active, '현재 인증되어 사용할 수 있는 사용자 멤버십'],
      ['인증 대기', pending, 'Google 인증이 아직 완료되지 않은 사용자 멤버십'],
      ['중지·만료', disabledExpired, loaded ? `중지 ${disabled} · 만료 ${expired}` : '권한 확인 후 표시'],
    ];
    for (const [label, cardValue, note] of cards) {
      const card = document.createElement('article');
      card.append(text('small', label), text('strong', String(cardValue)), text('span', note));
      shell.summary.append(card);
    }
  }

  function filteredMembers(forcePending = false) {
    const q = shell.search.value.trim().toLowerCase();
    const site = shell.site.value;
    const role = shell.role.value;
    const status = forcePending ? 'pre_registered' : shell.status.value;
    return directory.members.filter(member => {
      if (!USER_ROLE_SET.has(member.role)) return false;
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
    if (member.canManage === false) return text('span', '조회 전용', 'client-count-chip');
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
        auditCache.delete(auditKey(member));
        await loadDirectory(true);
      } catch (error) {
        alert(error.message);
      } finally {
        node.disabled = false;
      }
    });
    return node;
  }

  function accessExplanation(member) {
    const details = document.createElement('details');
    details.className = 'client-access-explain';
    const summary = document.createElement('summary');
    summary.textContent = '접근 근거·변경기록';
    const explanation = text(
      'p',
      `이 접근은 ${member.tenant.name} 범위의 ${member.roleLabel || ROLE_LABELS[member.role] || member.role} 멤버십에서 적용됩니다. 플랫폼 전체 권한으로 자동 확장되지 않습니다.`,
    );
    const facts = document.createElement('div');
    facts.className = 'client-access-facts';
    facts.append(
      text('span', `인증 · ${membershipLabel(member.status)}`),
      text('span', `등록 · ${formatDate(member.joinedAt, '기록 없음')}`),
      text('span', `최근 활동 · ${formatDate(member.lastLoginAt, '아직 로그인 전')}`),
    );

    const capabilityBlock = document.createElement('div');
    capabilityBlock.className = 'client-capability-block';
    capabilityBlock.append(text('strong', '현재 유효 권한'));
    const capabilities = Array.isArray(member.effectiveCapabilities) ? member.effectiveCapabilities : [];
    const capabilityList = document.createElement('div');
    capabilityList.className = 'client-capability-list';
    if (!capabilities.length) capabilityList.append(text('span', '추가 관리 권한 없음', 'client-capability muted'));
    else for (const capability of capabilities) {
      const label = capability === '*' && member.capabilityMode === 'all_except_denied'
        ? '전체 역할 권한 · 명시적 차단 제외'
        : capabilityLabel(capability);
      capabilityList.append(text('span', label, 'client-capability'));
    }
    capabilityBlock.append(capabilityList);

    const denied = Array.isArray(member.deniedCapabilities) ? member.deniedCapabilities : [];
    if (denied.length) {
      const deniedBlock = document.createElement('div');
      deniedBlock.className = 'client-capability-denied';
      deniedBlock.append(text('strong', '명시적 차단'));
      const deniedList = document.createElement('div');
      deniedList.className = 'client-capability-list';
      for (const capability of denied) deniedList.append(text('span', capabilityLabel(capability), 'client-capability denied'));
      deniedBlock.append(deniedList);
      capabilityBlock.append(deniedBlock);
    }

    const checker = document.createElement('div');
    checker.className = 'client-capability-check';
    checker.append(text('strong', '권한 확인'));
    const checkerControls = document.createElement('div');
    checkerControls.className = 'client-capability-check-controls';
    const capabilitySelect = document.createElement('select');
    capabilitySelect.setAttribute('aria-label', `${member.email} 확인할 권한`);
    capabilitySelect.append(selectOption('', '확인할 권한 선택'));
    for (const [capability, label] of Object.entries(CAPABILITY_LABELS)) {
      if (capability === '*') continue;
      capabilitySelect.append(selectOption(capability, label));
    }
    const capabilityButton = button('확인', 'secondary compact');
    capabilityButton.disabled = true;
    const capabilityResult = document.createElement('div');
    capabilityResult.className = 'client-capability-check-result';
    capabilitySelect.addEventListener('change', () => {
      capabilityButton.disabled = !capabilitySelect.value;
      capabilityResult.replaceChildren();
    });
    capabilityButton.addEventListener('click', async () => {
      const capability = capabilitySelect.value;
      if (!capability) return;
      capabilityButton.disabled = true;
      capabilityButton.textContent = '확인 중…';
      capabilityResult.replaceChildren();
      try {
        const data = await request(`/api/customers/tenants/${encodeURIComponent(member.tenant.slug)}/access/evaluate?email=${encodeURIComponent(member.email)}&capability=${encodeURIComponent(capability)}`);
        const status = text('strong', data.allowed ? '허용' : '차단', `client-capability-decision ${data.allowed ? 'allowed' : 'denied'}`);
        const reason = text('span', data.reasonLabel || '현재 정책 기준으로 판정했습니다.');
        capabilityResult.append(status, reason);
      } catch (error) {
        capabilityResult.append(text('span', error.message, 'operations-error'));
      } finally {
        capabilityButton.disabled = !capabilitySelect.value;
        capabilityButton.textContent = '확인';
      }
    });
    checkerControls.append(capabilitySelect, capabilityButton);
    checker.append(checkerControls, capabilityResult);

    const audit = document.createElement('div');
    audit.className = 'client-audit';
    const auditButton = button('최근 권한 변경 보기', 'secondary compact');
    const auditBody = document.createElement('div');
    auditBody.className = 'client-audit-body';
    auditButton.addEventListener('click', async () => {
      auditButton.disabled = true;
      const key = auditKey(member);
      try {
        let history = auditCache.get(key);
        if (!history) {
          auditButton.textContent = '변경기록 확인 중…';
          const data = await request(`/api/customers/tenants/${encodeURIComponent(member.tenant.slug)}/access/audit?email=${encodeURIComponent(member.email)}&limit=8`);
          history = Array.isArray(data.history) ? data.history : [];
          auditCache.set(key, history);
        }
        renderAuditHistory(auditBody, history);
        auditButton.textContent = '변경기록 새로고침';
      } catch (error) {
        auditBody.replaceChildren(text('span', error.message, 'operations-error'));
        auditButton.textContent = '다시 확인';
      } finally {
        auditButton.disabled = false;
      }
    });
    audit.append(auditButton, auditBody);

    details.append(summary, explanation, facts, capabilityBlock, checker, audit);
    return details;
  }

  function labelCell(node, label) {
    node.dataset.label = label;
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
      ? ['사용자', '사이트·범위', '역할', '공개', '인증·상태', '최근 활동', '만료', '관리']
      : ['사용자', '역할', '공개', '인증·상태', '최근 활동', '만료', '관리'];
    for (const label of labels) headRow.append(text('th', label));
    thead.append(headRow);
    const tbody = document.createElement('tbody');

    if (!members.length) {
      const row = document.createElement('tr');
      const cell = text('td', '표시할 사용자가 없습니다.');
      cell.colSpan = labels.length;
      row.append(cell);
      tbody.append(row);
    } else {
      for (const member of members) {
        const manageable = member.canManage !== false;
        const row = document.createElement('tr');
        const identity = labelCell(document.createElement('td'), '사용자');
        identity.append(text('strong', member.displayName || member.email), text('small', member.email, 'email'));
        if (member.githubUsername) identity.append(text('small', `GitHub · @${member.githubUsername}`));
        row.append(identity);

        if (includeSite) {
          const site = labelCell(document.createElement('td'), '사이트·범위');
          site.append(text('strong', member.tenant.name), text('small', member.tenant.domain, 'domain'));
          row.append(site);
        }

        const roleCell = labelCell(document.createElement('td'), '역할');
        const roleSelect = document.createElement('select');
        roleSelect.setAttribute('aria-label', `${member.email} 역할`);
        for (const [value,label] of USER_ROLE_OPTIONS) roleSelect.append(selectOption(value,label));
        roleSelect.value = USER_ROLE_SET.has(member.role) ? member.role : 'member';
        roleSelect.disabled = !manageable;
        roleCell.append(roleSelect);

        const visibilityCell = labelCell(document.createElement('td'), '공개');
        const visibility = document.createElement('select');
        visibility.setAttribute('aria-label', `${member.email} 공개 상태`);
        visibility.append(selectOption('private','비공개'), selectOption('public','공개'));
        visibility.value = member.visibility === 'public' ? 'public' : 'private';
        visibility.disabled = !manageable;
        visibilityCell.append(visibility);

        const statusCell = labelCell(document.createElement('td'), '인증·상태');
        statusCell.append(membershipBadge(member.status));
        const statusSelect = document.createElement('select');
        statusSelect.setAttribute('aria-label', `${member.email} 사용 상태`);
        statusSelect.append(selectOption('active','활성'), selectOption('disabled','중지'));
        statusSelect.value = member.status === 'disabled' ? 'disabled' : 'active';
        statusSelect.disabled = !manageable;
        statusCell.append(statusSelect);

        const activityCell = labelCell(
          text('td', formatDate(member.lastLoginAt, '아직 로그인 전')),
          '최근 활동',
        );
        const expiryCell = labelCell(
          text('td', member.expiresAt ? formatDate(member.expiresAt, '-') : '계속'),
          '만료',
        );

        const manageCell = labelCell(document.createElement('td'), '관리');
        if (manageable) {
          const save = button('저장', 'primary compact');
          save.addEventListener('click', async () => {
            const next = {
              role: roleSelect.value,
              visibility: visibility.value,
              status: statusSelect.value,
            };
            const changes = accessChangeSet(member, next);
            if (!changes.length) {
              const previous = save.textContent;
              save.textContent = '변경 없음';
              setTimeout(() => { save.textContent = previous; }, 1200);
              return;
            }
            if (!confirmAccessChanges(member, changes)) return;
            save.disabled = true;
            try {
              await request(`/api/customers/tenants/${encodeURIComponent(member.tenant.slug)}/access/update`, {
                method:'POST',
                body:JSON.stringify({
                  email:member.email,
                  role:next.role,
                  visibility:visibility.value,
                  status:next.status,
                }),
              });
              auditCache.delete(auditKey(member));
              await loadDirectory(true);
            } catch (error) {
              alert(error.message);
            } finally {
              save.disabled = false;
            }
          });
          const actions = document.createElement('div');
          actions.className = 'client-row-actions';
          actions.append(save, revokeButton(member));
          manageCell.append(actions);
        } else {
          manageCell.append(text('span', '이 범위는 조회만 가능합니다.', 'client-count-chip'));
        }
        manageCell.append(accessExplanation(member));

        row.append(roleCell, visibilityCell, statusCell, activityCell, expiryCell, manageCell);
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
    section.append(head);

    if (!members.length) {
      if (hasActiveFilters(forcePending)) {
        section.append(statePanel(
          'empty',
          '조건에 맞는 사용자가 없습니다.',
          '검색어 또는 사이트·역할·상태 필터를 변경해 다시 확인할 수 있습니다.',
          '필터 초기화',
          resetFilters,
        ));
      } else if (forcePending) {
        section.append(statePanel('empty', '인증 대기 사용자가 없습니다.', '현재 Google 인증을 기다리는 일반 사용자 멤버십이 없습니다.'));
      } else if (!userMembers().length) {
        section.append(statePanel('empty', '등록된 일반 사용자가 없습니다.', '사이트·공간에서 사용자를 등록하면 여기에 접근 범위와 상태가 표시됩니다.'));
      } else {
        section.append(statePanel('empty', '표시할 사용자가 없습니다.', '현재 범위에서 표시 가능한 사용자 멤버십이 없습니다.'));
      }
    } else {
      section.append(memberTable(members));
    }
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
    for (const [value, label] of USER_ROLE_OPTIONS) role.append(selectOption(value, label));
    roleLabel.append(role);

    const visibilityLabel = text('label', '목록 공개');
    const visibility = document.createElement('select');
    visibility.name = 'visibility';
    visibility.append(selectOption('private','비공개'), selectOption('public','공개'));
    visibility.value = 'private';
    visibilityLabel.append(visibility);

    const submit = button('Google 계정 등록', 'primary');
    submit.type = 'submit';
    const status = text('p', '', 'client-invite-result');
    form.append(nameLabel, emailLabel, roleLabel, visibilityLabel, submit, status);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      submit.disabled = true;
      submit.textContent = '등록 중…';
      status.replaceChildren();
      try {
        const data = await request(`/api/customers/tenants/${encodeURIComponent(tenant.slug)}/pre-register`, {
          method: 'POST',
          body: JSON.stringify({
            email: email.value.trim(),
            displayName: displayName.value.trim(),
            role: role.value,
            visibility: visibility.value,
          }),
        });
        const account = data.account || {};
        const message = account.status === 'active'
          ? '기존 계정의 이 사이트 권한을 최신 설정으로 반영했습니다.'
          : '등록 완료. 같은 이메일의 Google 계정으로 로그인하면 이 사이트 범위에서만 활성화됩니다.';
        status.append(text('strong', message), text('small', `목록 ${account.visibility === 'public' ? '공개' : '비공개'} · Google 계정은 통합 식별되고 사이트별 권한만 추가됩니다.`));
        auditCache.delete(`${tenant.slug}|${email.value.trim().toLowerCase()}`);
        form.reset();
        visibility.value = 'private';
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
    const members = directory.members.filter(member => member.tenant.slug === tenant.slug && USER_ROLE_SET.has(member.role));
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
      text('h4', '사용자 등록'),
      createPreRegisterForm(tenant),
      text('h4', `이 사이트 사용자 · ${members.length}명`),
      memberTable(members, { includeSite: false }),
    );
  }

  function renderSitesView() {
    if (!directory.tenants.length) {
      shell.body.replaceChildren(statePanel('empty', '등록된 사이트·공간이 없습니다.', '접근 범위를 관리할 사이트 또는 공간이 등록되면 여기에 표시됩니다.'));
      return;
    }
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
    else detail.append(statePanel('empty', '선택한 사이트를 찾을 수 없습니다.', '사이트 목록을 다시 확인해 주세요.'));
    layout.append(list, detail);
    shell.body.replaceChildren(layout);
  }

  function renderRolesView() {
    const wrap = document.createElement('div');
    wrap.className = 'client-role-view';
    const head = document.createElement('div');
    head.className = 'client-view-head';
    const roles = directory.roles.filter(item => USER_ROLE_SET.has(item.role));
    head.append(text('h3', '역할·권한별 사용자'), text('span', `${roles.length}개 역할`, 'client-count-chip'));
    const grid = document.createElement('div');
    grid.className = 'client-role-grid';
    if (!roles.length) {
      wrap.append(head, statePanel('empty', '표시할 사용자 역할이 없습니다.', '일반 사용자 멤버십이 등록되면 역할별 접근 현황을 확인할 수 있습니다.'));
      shell.body.replaceChildren(wrap);
      return;
    }
    for (const item of roles) {
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
    if (!shell) return;
    if (!adminToken()) {
      renderSummary();
      renderSyncBar();
      shell.body.replaceChildren(statePanel(
        'auth',
        '관리자 인증이 필요합니다.',
        '현재 관리자 세션이 확인되지 않았습니다. 중앙 EKODI 관리자 로그인 후 같은 경로로 돌아오면 별도 인증 없이 권한을 다시 확인합니다.',
      ));
      return;
    }
    if (loading) return;
    if (loaded && !force) {
      renderSyncBar();
      return renderActiveTab();
    }

    loading = true;
    shell.refresh.disabled = true;
    renderSummary();
    renderSyncBar({ loading: true });
    if (!loaded) {
      shell.body.replaceChildren(statePanel(
        'loading',
        '사용자·접근 정보를 확인하고 있습니다.',
        '사이트별 Google 계정과 멤버십 범위를 불러오는 중입니다. 최대 8초 안에 결과 또는 복구 동작을 표시합니다.',
      ));
    }

    try {
      const data = await request('/api/customers/directory');
      directory = {
        ...data,
        summary: data?.summary || {},
        authority: data?.authority || {},
        tenants: Array.isArray(data?.tenants) ? data.tenants : [],
        roles: Array.isArray(data?.roles) ? data.roles : [],
        members: Array.isArray(data?.members) ? data.members : [],
      };
      loaded = true;
      lastSuccessfulSyncAt = data?.generatedAt || new Date().toISOString();
      populateFilters();
      renderSummary();
      renderSyncBar();
      renderActiveTab();
    } catch (error) {
      renderSyncBar({ error: error.message });
      if (!loaded) {
        shell.body.replaceChildren(statePanel(
          'error',
          '사용자·접근 정보를 불러오지 못했습니다.',
          error.message,
          '다시 확인',
          () => loadDirectory(true),
        ));
      }
    } finally {
      loading = false;
      shell.refresh.disabled = false;
    }
  }

  function init() {
    shell = installShell();
    if (!shell) return;
    renderSummary();
    renderSyncBar();
    const directRoute = /^\/admin\/people\/users-access\/?$/.test(location.pathname);
    if (directRoute || location.hash === '#clients' || !shell.section.classList.contains('hidden-panel')) {
      queueMicrotask(() => loadDirectory());
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
