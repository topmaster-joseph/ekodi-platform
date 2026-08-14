(() => {
  // Build contract marker: data-section = 'work' is the dedicated left sidebar entry.
  const TOKEN_KEY = 'ekodi-auth-token';
  const WORK_URL = 'https://work.ekodi.kr';
  const AUTH_URL = 'https://auth.ekodi.kr/?site=work';
  const ADMIN_API = 'https://renzehysxirjilvdxacv.supabase.co/functions/v1/work-admin-api';

  const text = value => String(value ?? '');
  const formatDate = value => value ? new Date(value).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
  const formatWage = row => {
    if (row.wageAmount == null || row.wageType === 'negotiable') return '협의';
    const amount = Number(row.wageAmount).toLocaleString('ko-KR');
    const unit = row.wageType === 'hourly' ? '시급' : row.wageType === 'monthly' ? '월급' : '프로젝트';
    return `${unit} ${amount}원`;
  };

  function el(tag, value = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== '') node.textContent = value;
    return node;
  }

  function actionLink(label, href, className = 'secondary') {
    const link = el('a', label, className);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  }

  function statusBadge(value) {
    const badge = el('span', value || '—', `work-admin-badge status-${String(value || 'unknown').replace(/[^a-z]/gi,'')}`);
    return badge;
  }

  function td(value, className = '') {
    const cell = el('td', '', className);
    if (value instanceof Node) cell.append(value);
    else cell.textContent = value == null || value === '' ? '—' : String(value);
    return cell;
  }

  async function api(path, options = {}) {
    const token = sessionStorage.getItem(TOKEN_KEY) || '';
    if (!token) throw new Error('관리자 로그인이 필요합니다.');
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${token}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${ADMIN_API}${path}`, { ...options, headers, cache:'no-store' });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) {
      const messages = {
        unauthorized:'관리자 인증이 만료되었습니다. 다시 로그인해 주세요.',
        moderation_reason_required:'조치 사유를 입력해 주세요.',
        verification_reason_required:'인증 변경 사유를 입력해 주세요.',
        admin_can_only_unpublish_or_close:'관리자는 공고를 직접 채용 승인하지 않고 비공개 또는 종료만 할 수 있습니다.',
      };
      throw new Error(messages[data.error] || data.error || `WORK 관리자 API 오류 (${response.status})`);
    }
    return data;
  }

  function toolbar(selectOptions, placeholder = '검색') {
    const wrap = el('div', '', 'work-admin-toolbar');
    const search = el('input');
    search.type = 'search';
    search.placeholder = placeholder;
    search.autocomplete = 'off';
    let select = null;
    if (selectOptions?.length) {
      select = el('select');
      selectOptions.forEach(([value,label]) => {
        const option = el('option', label);
        option.value = value;
        select.append(option);
      });
      wrap.append(select);
    }
    const refresh = el('button', '↻ Refresh', 'secondary');
    refresh.type = 'button';
    wrap.append(search, refresh);
    return { wrap, search, select, refresh };
  }

  function table(headers) {
    const wrap = el('div', '', 'finance-table-wrap work-admin-table-wrap');
    const node = el('table', '', 'finance-table work-admin-table');
    const head = el('thead');
    const tr = el('tr');
    headers.forEach(label => tr.append(el('th', label)));
    head.append(tr);
    const body = el('tbody');
    node.append(head, body);
    wrap.append(node);
    return { wrap, body };
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
    headCopy.append(el('p', 'EKODI WORK · LIVE OPS', 'kicker'), el('h2', 'WORK 운영 관리'), el('p', '실제 채용공고·지원 흐름·사업장·프로필을 관리자 권한으로 안전하게 조회하고 운영 조치합니다.', 'operations-copy'));
    const headActions = el('div', '', 'work-admin-head-actions');
    const refreshAll = el('button', '↻ 새로고침', 'secondary');
    refreshAll.type = 'button';
    headActions.append(refreshAll, actionLink('Open Work ↗', WORK_URL, 'primary'));
    head.append(headCopy, headActions);
    main.append(head);

    const status = el('p', 'WORK 운영 데이터를 불러올 준비가 되었습니다.', 'work-admin-status');
    status.setAttribute('role', 'status');
    main.append(status);
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

    // Overview
    panels.overview.append(el('h3', 'WORK Overview', 'work-admin-view-title'), el('p', '가짜 지표 없이 운영 DB에서 집계한 현재 상태만 표시합니다.', 'work-admin-view-copy'));
    const summaryGrid = el('div', '', 'work-admin-summary');
    const summaryNodes = {};
    [['profiles','회원 프로필'],['organizations','사업장'],['jobs','채용공고'],['applications','지원']].forEach(([key,label]) => {
      const card = el('article', '', 'work-admin-info-card');
      const value = el('strong', '—');
      summaryNodes[key] = value;
      card.append(el('small', label), value, el('p', '실데이터 집계 중'));
      summaryGrid.append(card);
    });
    panels.overview.append(summaryGrid);
    const overviewDetail = el('div', '', 'work-admin-overview-detail');
    panels.overview.append(overviewDetail);

    // Jobs
    panels.jobs.append(el('h3', '채용공고 관리', 'work-admin-view-title'), el('p', '관리자는 채용 결정을 대신하지 않습니다. 문제가 있는 공고를 비공개 또는 종료하고 사유를 감사기록에 남깁니다.', 'work-admin-view-copy'));
    const jobTools = toolbar([['','전체 상태'],['published','게시중'],['draft','임시저장'],['closed','종료']], '제목·사업장·지역 검색');
    const jobsTable = table(['상태','공고','사업장','지역','조건','지원','수정','관리']);
    panels.jobs.append(jobTools.wrap, jobsTable.wrap);

    // Applications
    panels.applicants.append(el('h3', '지원 현황', 'work-admin-view-title'), el('p', '지원 상태는 조회 전용입니다. 채용·탈락 판단은 해당 사업주가 Work에서 직접 수행합니다.', 'work-admin-view-copy'));
    const applicationTools = toolbar([['','전체 상태'],['submitted','접수'],['reviewing','검토'],['interview','면접'],['accepted','채용'],['rejected','종료'],['withdrawn','철회']], '지원자·공고·사업장 검색');
    const applicationsTable = table(['상태','지원자','공고','사업장','지역','메시지','수정']);
    panels.applicants.append(applicationTools.wrap, applicationsTable.wrap);

    // Profiles + Organizations
    panels.profiles.append(el('h3', '프로필 · 사업장', 'work-admin-view-title'), el('p', '개인 내부 UUID는 노출하지 않고 운영에 필요한 최소 정보만 표시합니다.', 'work-admin-view-copy'));
    const orgTitle = el('div', '', 'work-admin-subhead');
    orgTitle.append(el('h4', '사업장 인증'), el('span', '사업자 확인 후 Verified 상태만 관리'));
    const orgTools = toolbar([['','전체 사업장'],['false','인증대기'],['true','인증완료']], '사업장·지역·사업주 검색');
    const orgTable = table(['인증','사업장','사업주','지역','공고','수정','관리']);
    const profileTitle = el('div', '', 'work-admin-subhead');
    profileTitle.append(el('h4', 'Work Profile'), el('span', '민감정보 최소 노출'));
    const profileTools = toolbar([['','전체 역할'],['seeker','구직자'],['employer','사업주'],['both','둘 다']], '이름·지역·기술·언어 검색');
    const profileTable = table(['이름','역할','지역','기술','언어','체류/취업','공개','수정']);
    panels.profiles.append(orgTitle, orgTools.wrap, orgTable.wrap, profileTitle, profileTools.wrap, profileTable.wrap);

    // Security
    panels.security.append(el('h3', '운영 · 보안', 'work-admin-view-title'), el('p', '실서비스 Health, 관리자 API 인증, Work 데이터 테이블 접근상태를 함께 점검합니다.', 'work-admin-view-copy'));
    const securityGrid = el('div', '', 'work-admin-security-grid');
    const securityRaw = el('pre', '보안 상태를 불러오지 않았습니다.', 'work-admin-raw');
    panels.security.append(securityGrid, securityRaw, actionLink('Google Auth ↗', AUTH_URL));

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

    let activeView = 'overview';
    const loaded = new Set();
    let requestSerial = 0;

    function setStatus(message, kind = '') {
      status.textContent = message;
      status.dataset.state = kind;
    }

    async function loadOverview(force = false) {
      if (!force && loaded.has('overview')) return;
      const serial = ++requestSerial;
      setStatus('WORK 운영 현황을 집계하고 있습니다.', 'loading');
      try {
        const data = await api('/summary');
        if (serial !== requestSerial && activeView !== 'overview') return;
        summaryNodes.profiles.textContent = Number(data.profiles?.total || 0).toLocaleString('ko-KR');
        summaryNodes.organizations.textContent = Number(data.organizations?.total || 0).toLocaleString('ko-KR');
        summaryNodes.jobs.textContent = Number(data.jobs?.total || 0).toLocaleString('ko-KR');
        summaryNodes.applications.textContent = Number(data.applications?.total || 0).toLocaleString('ko-KR');
        const notes = summaryGrid.querySelectorAll('.work-admin-info-card p');
        if (notes[0]) notes[0].textContent = `공개 프로필 ${data.profiles?.discoverable || 0}`;
        if (notes[1]) notes[1].textContent = `인증 ${data.organizations?.verified || 0} · 대기 ${data.organizations?.pending || 0}`;
        if (notes[2]) notes[2].textContent = `게시 ${data.jobs?.published || 0} · 임시 ${data.jobs?.draft || 0} · 종료 ${data.jobs?.closed || 0}`;
        if (notes[3]) notes[3].textContent = `신규 ${data.applications?.submitted || 0} · 검토 ${data.applications?.reviewing || 0} · 면접 ${data.applications?.interview || 0}`;
        overviewDetail.replaceChildren();
        const pipeline = el('div', '', 'work-admin-pipeline');
        [['접수',data.applications?.submitted],['검토',data.applications?.reviewing],['면접',data.applications?.interview],['채용',data.applications?.accepted],['종료',data.applications?.rejected],['철회',data.applications?.withdrawn]].forEach(([label,value]) => {
          const item = el('article'); item.append(el('small', label), el('strong', Number(value || 0).toLocaleString('ko-KR'))); pipeline.append(item);
        });
        overviewDetail.append(el('h4', '지원 파이프라인'), pipeline);
        loaded.add('overview');
        setStatus(`실데이터 기준 · ${formatDate(data.generatedAt)}`, 'ready');
      } catch (error) { setStatus(error.message, 'error'); }
    }

    async function loadJobs(force = false) {
      if (!force && loaded.has('jobs')) return;
      setStatus('채용공고를 불러오는 중입니다.', 'loading');
      const params = new URLSearchParams({ limit:'120' });
      if (jobTools.select?.value) params.set('status', jobTools.select.value);
      if (jobTools.search.value.trim()) params.set('q', jobTools.search.value.trim());
      try {
        const data = await api(`/jobs?${params}`);
        jobsTable.body.replaceChildren();
        for (const row of data.jobs || []) {
          const tr = el('tr');
          const titleCell = el('div', '', 'work-admin-cell-main');
          titleCell.append(el('strong', text(row.title)), el('small', text(row.category || row.employmentType)));
          const orgCell = el('div', '', 'work-admin-cell-main');
          orgCell.append(el('strong', text(row.organization?.name || '사업장')), el('small', row.organization?.verified ? 'Verified' : 'Unverified'));
          const action = el('div', '', 'work-admin-row-actions');
          if (row.status !== 'closed') {
            if (row.status === 'published') {
              const unpublish = el('button', '비공개', 'ghost'); unpublish.type='button';
              unpublish.addEventListener('click', () => moderateJob(row, 'draft'));
              action.append(unpublish);
            }
            const close = el('button', '종료', 'ghost danger'); close.type='button';
            close.addEventListener('click', () => moderateJob(row, 'closed'));
            action.append(close);
          } else action.append(el('span', '종료됨', 'work-admin-muted'));
          tr.append(td(statusBadge(row.status)), td(titleCell), td(orgCell), td(row.region), td(`${row.employmentType || '—'} · ${formatWage(row)}`), td(Number(row.applicationCount || 0).toLocaleString('ko-KR')), td(formatDate(row.updatedAt)), td(action));
          jobsTable.body.append(tr);
        }
        if (!jobsTable.body.children.length) jobsTable.body.append(emptyRow(8, '조건에 맞는 채용공고가 없습니다.'));
        loaded.add('jobs');
        setStatus(`채용공고 ${(data.jobs || []).length}건 · 관리자 직접 게시 기능 없음`, 'ready');
      } catch (error) { setStatus(error.message, 'error'); }
    }

    async function moderateJob(row, nextStatus) {
      const verb = nextStatus === 'closed' ? '종료' : '비공개 전환';
      const reason = window.prompt(`“${row.title}” 공고를 ${verb}하는 사유를 입력해 주세요.\n감사기록에 저장됩니다.`);
      if (!reason?.trim()) return;
      try {
        setStatus(`${row.title} 공고를 ${verb}하고 있습니다.`, 'loading');
        await api(`/jobs/${row.id}`, { method:'PATCH', body:JSON.stringify({ status:nextStatus, reason:reason.trim() }) });
        loaded.delete('jobs'); loaded.delete('overview');
        await Promise.all([loadJobs(true), loadOverview(true)]);
      } catch (error) { setStatus(error.message, 'error'); }
    }

    async function loadApplications(force = false) {
      if (!force && loaded.has('applicants')) return;
      setStatus('지원 현황을 불러오는 중입니다.', 'loading');
      const params = new URLSearchParams({ limit:'120' });
      if (applicationTools.select?.value) params.set('status', applicationTools.select.value);
      if (applicationTools.search.value.trim()) params.set('q', applicationTools.search.value.trim());
      try {
        const data = await api(`/applications?${params}`);
        applicationsTable.body.replaceChildren();
        for (const row of data.applications || []) {
          const applicant = el('div', '', 'work-admin-cell-main');
          applicant.append(el('strong', row.applicantName), el('small', [row.applicantSkills?.slice(0,2).join(' · '), row.applicantLanguages?.slice(0,2).join(' · ')].filter(Boolean).join(' / ')));
          const message = el('span', text(row.message || '—'), 'work-admin-message');
          truncateTitle(message, row.message || '');
          const tr = el('tr');
          tr.append(td(statusBadge(row.status)), td(applicant), td(row.jobTitle), td(row.organizationName), td(row.applicantRegion), td(message), td(formatDate(row.updatedAt)));
          applicationsTable.body.append(tr);
        }
        if (!applicationsTable.body.children.length) applicationsTable.body.append(emptyRow(7, '조건에 맞는 지원내역이 없습니다.'));
        loaded.add('applicants');
        setStatus(`지원 ${(data.applications || []).length}건 · 조회 전용`, 'ready');
      } catch (error) { setStatus(error.message, 'error'); }
    }

    async function loadOrganizationsAndProfiles(force = false) {
      if (!force && loaded.has('profiles')) return;
      setStatus('사업장과 프로필을 불러오는 중입니다.', 'loading');
      const orgParams = new URLSearchParams({ limit:'100' });
      if (orgTools.select?.value) orgParams.set('verified', orgTools.select.value);
      if (orgTools.search.value.trim()) orgParams.set('q', orgTools.search.value.trim());
      const profileParams = new URLSearchParams({ limit:'100' });
      if (profileTools.select?.value) profileParams.set('role', profileTools.select.value);
      if (profileTools.search.value.trim()) profileParams.set('q', profileTools.search.value.trim());
      try {
        const [orgData, profileData] = await Promise.all([api(`/organizations?${orgParams}`), api(`/profiles?${profileParams}`)]);
        orgTable.body.replaceChildren();
        for (const row of orgData.organizations || []) {
          const action = el('div', '', 'work-admin-row-actions');
          const toggle = el('button', row.verified ? '인증해제' : '인증', row.verified ? 'ghost' : 'secondary'); toggle.type='button';
          toggle.addEventListener('click', () => toggleOrganization(row));
          action.append(toggle);
          const tr = el('tr');
          tr.append(td(statusBadge(row.verified ? 'verified' : 'pending')), td(row.name), td(row.ownerName), td(row.region), td(Number(row.jobCount || 0).toLocaleString('ko-KR')), td(formatDate(row.updatedAt)), td(action));
          orgTable.body.append(tr);
        }
        if (!orgTable.body.children.length) orgTable.body.append(emptyRow(7, '조건에 맞는 사업장이 없습니다.'));
        profileTable.body.replaceChildren();
        for (const row of profileData.profiles || []) {
          const tr = el('tr');
          tr.append(td(row.displayName), td(roleLabel(row.role)), td(row.region), td((row.skills || []).slice(0,4).join(' · ')), td((row.languages || []).slice(0,3).join(' · ')), td(row.visaStatus || '미입력'), td(row.discoverable ? '공개' : '비공개'), td(formatDate(row.updatedAt)));
          profileTable.body.append(tr);
        }
        if (!profileTable.body.children.length) profileTable.body.append(emptyRow(8, '조건에 맞는 프로필이 없습니다.'));
        loaded.add('profiles');
        setStatus(`사업장 ${(orgData.organizations || []).length}건 · 프로필 ${(profileData.profiles || []).length}건`, 'ready');
      } catch (error) { setStatus(error.message, 'error'); }
    }

    async function toggleOrganization(row) {
      const next = !row.verified;
      const reason = window.prompt(`${row.name} 사업장의 인증을 ${next ? '승인' : '해제'}하는 사유를 입력해 주세요.\n감사기록에 저장됩니다.`);
      if (!reason?.trim()) return;
      try {
        setStatus(`${row.name} 인증상태를 변경하고 있습니다.`, 'loading');
        await api(`/organizations/${row.id}`, { method:'PATCH', body:JSON.stringify({ verified:next, reason:reason.trim() }) });
        loaded.delete('profiles'); loaded.delete('overview');
        await Promise.all([loadOrganizationsAndProfiles(true), loadOverview(true)]);
      } catch (error) { setStatus(error.message, 'error'); }
    }

    async function loadSecurity(force = false) {
      if (!force && loaded.has('security')) return;
      setStatus('WORK 운영 경계를 점검하고 있습니다.', 'loading');
      try {
        const data = await api('/security');
        securityGrid.replaceChildren();
        const health = data.serviceHealth || {};
        const cards = [
          ['ADMIN API', data.adminApi === 'authenticated' ? 'Authenticated' : 'Check', 'EKODI 관리자 세션 재검증'],
          ['WORK SERVICE', health.ok === false ? 'Check' : (health.service || health.status || 'Online'), health.environment || health.dataMode || 'work.ekodi.kr/health'],
          ['DATABASE', (data.database || []).every(item => item.reachable) ? 'Reachable' : 'Check', `${(data.database || []).filter(item => item.reachable).length}/${(data.database || []).length} Work tables`],
          ['RLS CONTRACT', data.policyContract === 'repository-validated' ? 'CI Verified' : 'Check', '스키마·권한 계약 검증'],
        ];
        cards.forEach(([label,value,copy]) => {
          const card = el('article', '', 'work-admin-info-card'); card.append(el('small', label), el('strong', value), el('p', copy)); securityGrid.append(card);
        });
        securityRaw.textContent = JSON.stringify({ generatedAt:data.generatedAt, serviceHealth:data.serviceHealth, database:data.database }, null, 2);
        loaded.add('security');
        setStatus(`보안·운영 점검 완료 · ${formatDate(data.generatedAt)}`, 'ready');
      } catch (error) { setStatus(error.message, 'error'); }
    }

    function emptyRow(cols, message) { const tr = el('tr'); const cell = td(message, 'work-admin-empty'); cell.colSpan = cols; tr.append(cell); return tr; }
    function roleLabel(role) { return role === 'seeker' ? '구직자' : role === 'employer' ? '사업주' : role === 'both' ? '둘 다' : role || '—'; }
    function truncateTitle(node, full) { if (full?.length > 90) node.title = full; }

    const loaders = { overview:loadOverview, jobs:loadJobs, applicants:loadApplications, profiles:loadOrganizationsAndProfiles, security:loadSecurity };
    async function switchWorkView(key, force = false) {
      activeView = key;
      Object.entries(panels).forEach(([panelKey, panel]) => { panel.hidden = panelKey !== key; });
      railButtons.forEach(button => button.classList.toggle('active', button.dataset.workTarget === key));
      await loaders[key]?.(force);
    }

    railNav.addEventListener('click', event => {
      const button = event.target.closest('[data-work-target]');
      if (button) switchWorkView(button.dataset.workTarget);
    });
    refreshAll.addEventListener('click', () => { loaded.delete(activeView); switchWorkView(activeView, true); });
    jobTools.refresh.addEventListener('click', () => loadJobs(true));
    jobTools.select?.addEventListener('change', () => loadJobs(true));
    jobTools.search.addEventListener('keydown', event => { if (event.key === 'Enter') loadJobs(true); });
    applicationTools.refresh.addEventListener('click', () => loadApplications(true));
    applicationTools.select?.addEventListener('change', () => loadApplications(true));
    applicationTools.search.addEventListener('keydown', event => { if (event.key === 'Enter') loadApplications(true); });
    orgTools.refresh.addEventListener('click', () => loadOrganizationsAndProfiles(true));
    orgTools.select?.addEventListener('change', () => loadOrganizationsAndProfiles(true));
    orgTools.search.addEventListener('keydown', event => { if (event.key === 'Enter') loadOrganizationsAndProfiles(true); });
    profileTools.refresh.addEventListener('click', () => loadOrganizationsAndProfiles(true));
    profileTools.select?.addEventListener('change', () => loadOrganizationsAndProfiles(true));
    profileTools.search.addEventListener('keydown', event => { if (event.key === 'Enter') loadOrganizationsAndProfiles(true); });

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
      switchWorkView(activeView);
    }

    navButton.addEventListener('click', activate);
    layout.append(main, rail);
    section.append(layout);
    content.append(section);
    const campusWorkButton = document.querySelector('[data-campus-service="work.ekodi.kr"]');
    if (campusWorkButton) campusWorkButton.dataset.campusSection = 'work';
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed'));
    if (location.pathname === '/work' || location.pathname === '/work/' || location.hash === '#work') activate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
