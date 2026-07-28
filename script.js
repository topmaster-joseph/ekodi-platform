const gate = document.querySelector('#accessGate');
const shell = document.querySelector('#appShell');
const toast = document.querySelector('#toast');
const palette = document.querySelector('#commandPalette');
const commandInput = document.querySelector('#commandInput');
let toastTimer;
const AUTH_API = 'https://ekodi-auth-api.topmaster-joseph.workers.dev';
let authMode = 'login';

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function openPalette() {
  palette.classList.add('open');
  setTimeout(() => commandInput.focus(), 30);
}

function closePalette() {
  palette.classList.remove('open');
  commandInput.value = '';
  document.querySelectorAll('.command-options button').forEach(button => button.hidden = false);
}

const adminLoginToggle = document.querySelector('#showAdminLogin');
const adminLoginForm = document.querySelector('#adminLoginForm');
const adminEmail = document.querySelector('#adminEmail');
const loginError = document.querySelector('#loginError');

adminLoginToggle.addEventListener('click', () => {
  const opening = adminLoginForm.hidden;
  adminLoginForm.hidden = !opening;
  adminLoginToggle.setAttribute('aria-expanded', String(opening));
  adminLoginToggle.textContent = opening ? '관리자 로그인 닫기 ↑' : '관리자 로그인 →';
  if (opening) setTimeout(() => adminEmail.focus(), 30);
  if (opening) loadAuthStatus();
});

async function loadAuthStatus() {
  try {
    const response = await fetch(`${AUTH_API}/api/status`, { cache: 'no-store' });
    if (!response.ok) throw new Error('인증 서버 연결 실패');
    const status = await response.json();
    authMode = status.initialized ? 'login' : 'setup';
    document.querySelector('.form-heading strong').textContent = authMode === 'setup' ? '최고관리자 최초 등록' : '플랫폼 관리자 로그인';
    document.querySelector('#enterConsole').textContent = authMode === 'setup' ? '최고관리자 등록 및 입장' : '관리 콘솔 입장';
    adminEmail.value = status.adminEmail || adminEmail.value;
    adminEmail.readOnly = authMode === 'setup';
  } catch {
    loginError.textContent = '인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }
}

function enterAuthenticatedConsole(email, token) {
  gate.classList.add('hidden');
  shell.setAttribute('aria-hidden', 'false');
  sessionStorage.setItem('ekodi-auth-token', token);
  sessionStorage.setItem('ekodi-admin-email', email);
  notify('관리자 인증이 완료되었습니다.');
  loadDomains();
  loadRegistry();
}

adminLoginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';
  const formData = new FormData(adminLoginForm);
  if (!adminLoginForm.checkValidity()) {
    adminLoginForm.reportValidity();
    return;
  }
  const submitButton = document.querySelector('#enterConsole');
  submitButton.disabled = true;
  submitButton.textContent = '서버 인증 중…';
  try {
    const response = await fetch(`${AUTH_API}/api/${authMode === 'setup' ? 'setup' : 'login'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: String(formData.get('email')).trim().toLowerCase(),
        password: String(formData.get('password'))
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '인증에 실패했습니다.');
    adminLoginForm.reset();
    enterAuthenticatedConsole(result.email, result.token);
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = authMode === 'setup' ? '최고관리자 등록 및 입장' : '관리 콘솔 입장';
  }
});

async function restoreServerSession() {
  const token = sessionStorage.getItem('ekodi-auth-token');
  if (!token) return;
  try {
    const response = await fetch(`${AUTH_API}/api/session`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('expired');
    const result = await response.json();
    enterAuthenticatedConsole(result.email, token);
  } catch {
    sessionStorage.removeItem('ekodi-auth-token');
    sessionStorage.removeItem('ekodi-admin-email');
  }
}

restoreServerSession();

document.querySelector('#quickActionBtn').addEventListener('click', openPalette);
document.querySelector('#globalSearch').addEventListener('keydown', event => {
  if (event.key === 'Enter') openPalette();
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openPalette();
  }
  if (event.key === 'Escape') closePalette();
});

palette.addEventListener('click', event => {
  if (event.target === palette) closePalette();
});

commandInput.addEventListener('input', event => {
  const query = event.target.value.toLowerCase();
  document.querySelectorAll('.command-options button').forEach(button => {
    button.hidden = !button.textContent.toLowerCase().includes(query);
  });
});

document.querySelectorAll('[data-command]').forEach(button => {
  button.addEventListener('click', () => {
    notify(button.dataset.command);
    closePalette();
  });
});

document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => notify(button.dataset.action));
});

document.querySelectorAll('[data-scroll]').forEach(button => {
  button.addEventListener('click', () => document.querySelector(`#${button.dataset.scroll}`).scrollIntoView({ behavior: 'smooth' }));
});

function updatePending() {
  const count = document.querySelectorAll('.approval-row').length;
  document.querySelector('#pendingCount').textContent = count;
  document.querySelector('#navApprovalCount').textContent = count;
  if (!count) document.querySelector('#approvalList').innerHTML = '<div style="padding:28px;text-align:center;color:#657084">모든 가입 요청을 처리했습니다.</div>';
}

document.querySelector('#approvalList').addEventListener('click', event => {
  const action = event.target.closest('.approve, .reject');
  if (!action) return;
  const row = action.closest('.approval-row');
  const name = row.querySelector('.requester strong').textContent;
  const approved = action.classList.contains('approve');
  row.remove();
  updatePending();
  notify(`${name}님의 요청을 ${approved ? '승인' : '거절'}했습니다.`);
});

document.querySelector('#refreshBtn').addEventListener('click', async event => {
  event.currentTarget.textContent = '↻ 확인 중';
  await loadMonitorStatus(true);
  event.currentTarget.textContent = '↻ 새로고침';
});

document.querySelector('#globalSearch').addEventListener('input', event => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('.searchable').forEach(item => {
    item.classList.toggle('search-hidden', query && !item.textContent.toLowerCase().includes(query));
  });
});

document.querySelector('#exportBtn').addEventListener('click', () => notify('통합 운영 보고서 생성을 시작했습니다.'));
document.querySelector('#settingsBtn').addEventListener('click', () => notify('환경 설정 패널을 준비 중입니다.'));
document.querySelector('#notificationBtn').addEventListener('click', () => notify('새로운 보안 알림이 없습니다.'));
document.querySelector('#profileBtn').addEventListener('click', () => notify('현재 최고 관리자 권한으로 접속 중입니다.'));

const viewMeta = {
  dashboard: ['통합 현황', 'EKODI 전체 서비스와 승인 업무를 한곳에서 관리하세요.'],
  services: ['서비스 관리', '연결된 EKODI 서비스의 상태와 바로가기를 관리합니다.'],
  domains: ['도메인 관리', '도메인클럽 등록·갱신 정보와 Cloudflare DNS를 함께 관리합니다.'],
  members: ['사용자·권한', '관리자 인증과 사용자 승인 요청을 검토합니다.'],
  recommend: ['추천 센터', '운영 데이터와 만료 일정을 바탕으로 우선 작업을 제안합니다.'],
  activity: ['활동 기록', '관리자 작업과 주요 변경 이력을 확인합니다.']
};

function activateView(view, options = {}) {
  if (!viewMeta[view]) view = 'dashboard';
  const isDashboard = view === 'dashboard';
  const map = {
    services: document.querySelector('.services-panel'),
    recommend: document.querySelector('.recommendation-panel'),
    domains: document.querySelector('.domain-panel'),
    registrar: document.querySelector('.registrar-panel'),
    members: document.querySelector('.approval-panel'),
    activity: document.querySelector('.activity-panel')
  };
  Object.entries(map).forEach(([key, element]) => {
    const visible = isDashboard || key === view || (view === 'domains' && key === 'registrar');
    element?.classList.toggle('view-hidden', !visible);
  });
  document.querySelector('.stats-grid')?.classList.toggle('view-hidden', !isDashboard);
  document.querySelector('.workspace-grid')?.classList.toggle('view-hidden', !isDashboard && !['services','recommend'].includes(view));
  document.querySelector('.bottom-grid')?.classList.toggle('view-hidden', !isDashboard && !['members','activity'].includes(view));
  document.querySelector('.workspace-grid')?.classList.toggle('single-column', !isDashboard);
  document.querySelector('.bottom-grid')?.classList.toggle('single-column', !isDashboard);
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    const active = item.dataset.view === view;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  });
  const [title, description] = viewMeta[view];
  document.querySelector('#viewTitle').textContent = title;
  document.querySelector('#viewDescription').textContent = description;
  document.querySelector('#viewEyebrow').textContent = view === 'dashboard' ? 'EKODI 운영 콘솔' : 'EKODI · ' + title;
  if (options.updateHash !== false && location.hash !== '#' + view) history.pushState({ view }, '', '#' + view);
  document.querySelector('.content')?.scrollTo({ top: 0, behavior: options.instant ? 'auto' : 'smooth' });
  document.querySelector('.sidebar')?.classList.remove('open');
  document.querySelector('#mobileMenu')?.setAttribute('aria-expanded', 'false');
  if (options.focus) document.querySelector('#viewTitle')?.focus({ preventScroll: true });
}

document.querySelectorAll('.nav-item[data-view]').forEach(button => {
  button.addEventListener('click', () => activateView(button.dataset.view, { focus: true }));
});
window.addEventListener('popstate', () => activateView(location.hash.slice(1), { updateHash: false, instant: true }));
activateView(location.hash.slice(1) || 'dashboard', { updateHash: false, instant: true });

const mobileMenu = document.querySelector('#mobileMenu');
mobileMenu.addEventListener('click', () => {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('open');
  mobileMenu.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
});


const registryList = document.querySelector('#registryList');
const registryForm = document.querySelector('#registryForm');
let registryRecords = [];

function daysUntil(dateText) {
  if (!dateText) return null;
  return Math.ceil((new Date(dateText + 'T23:59:59').getTime() - Date.now()) / 86400000);
}
function expiryState(record) {
  const days = daysUntil(record.expiresAt);
  if (days === null) return { label: '만료일 미입력', className: '' };
  if (days < 0) return { label: Math.abs(days) + '일 만료 경과', className: 'danger' };
  if (days <= Number(record.reminderDays || 60)) return { label: days + '일 후 만료', className: 'warning' };
  return { label: days + '일 후 만료', className: '' };
}
function valueLabel(value, yes = '사용', no = '미사용') { return value ? yes : no; }

function renderRegistry(records) {
  registryRecords = records;
  registryList.textContent = '';
  document.querySelector('#registryTotal').textContent = String(records.length);
  const expiring = records.filter(item => { const d = daysUntil(item.expiresAt); return d !== null && d <= 60; }).length;
  const autoRenew = records.filter(item => item.autoRenew).length;
  document.querySelector('#registryExpiring').textContent = String(expiring);
  document.querySelector('#registryAutoRenew').textContent = autoRenew + ' / ' + records.length;
  records.forEach(record => {
    const row = document.createElement('article'); row.className = 'registry-row searchable';
    const domain = document.createElement('div'); domain.className = 'registry-domain';
    const strong = document.createElement('strong'); strong.textContent = record.domain;
    const registrar = document.createElement('small'); registrar.textContent = record.registrar;
    domain.append(strong, registrar);
    const registered = document.createElement('div'); registered.className = 'registry-cell'; registered.innerHTML = '<small>등록일</small><strong></strong>'; registered.querySelector('strong').textContent = record.registeredAt || '미입력';
    const expires = document.createElement('div'); expires.className = 'registry-cell'; expires.innerHTML = '<small>만료일</small><strong></strong>'; expires.querySelector('strong').textContent = record.expiresAt || '미입력';
    const state = expiryState(record); const badge = document.createElement('span'); badge.className = 'registry-badge ' + state.className; badge.textContent = state.label;
    const security = document.createElement('div'); security.className = 'registry-cell'; security.innerHTML = '<small>보호 설정</small><strong></strong>'; security.querySelector('strong').textContent = '잠금 ' + valueLabel(record.transferLock,'ON','OFF') + ' · 자동연장 ' + valueLabel(record.autoRenew,'ON','OFF');
    const actions = document.createElement('div'); actions.className = 'registry-actions';
    const edit = document.createElement('button'); edit.type='button'; edit.className='secondary'; edit.textContent='정보 편집'; edit.addEventListener('click', () => openRegistryForm(record));
    const external = document.createElement('a'); external.className='ghost'; external.href='https://www.domainclub.kr'; external.target='_blank'; external.rel='noopener'; external.textContent='등록기관 ↗';
    actions.append(edit, external); row.append(domain, registered, expires, badge, security, actions); registryList.append(row);
  });
}
async function loadRegistry() {
  if (!registryList || !sessionStorage.getItem('ekodi-auth-token')) return;
  registryList.innerHTML = '<p class="domain-loading">등록 정보를 확인하는 중입니다.</p>';
  try {
    const response = await fetch(AUTH_API + '/api/registry', { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '등록 정보를 불러오지 못했습니다.');
    renderRegistry(data.records);
  } catch (error) { registryList.textContent = error.message; }
}
function openRegistryForm(record) {
  registryForm.hidden = false;
  registryForm.elements.domain.value = record.domain;
  registryForm.elements.registeredAt.value = record.registeredAt || '';
  registryForm.elements.expiresAt.value = record.expiresAt || '';
  registryForm.elements.reminderDays.value = record.reminderDays || 60;
  registryForm.elements.autoRenew.checked = Boolean(record.autoRenew);
  registryForm.elements.transferLock.checked = Boolean(record.transferLock);
  registryForm.elements.whoisPrivacy.checked = Boolean(record.whoisPrivacy);
  registryForm.elements.memo.value = record.memo || '';
  document.querySelector('#registryFormTitle').textContent = record.domain + ' 등록정보 편집';
  registryForm.scrollIntoView({ behavior:'smooth', block:'center' });
}
registryForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(registryForm); const domain = formData.get('domain');
  const payload = { registeredAt:formData.get('registeredAt'), expiresAt:formData.get('expiresAt'), reminderDays:Number(formData.get('reminderDays')), autoRenew:formData.get('autoRenew') === 'on', transferLock:formData.get('transferLock') === 'on', whoisPrivacy:formData.get('whoisPrivacy') === 'on', memo:String(formData.get('memo') || '').trim() };
  const submit = registryForm.querySelector('button[type="submit"]'); submit.disabled=true;
  try {
    const response = await fetch(AUTH_API + '/api/registry/' + encodeURIComponent(domain), { method:'PUT', headers:authHeaders(true), body:JSON.stringify(payload) });
    const data = await response.json(); if(!response.ok) throw new Error(data.error || '저장하지 못했습니다.');
    registryForm.hidden=true; await loadRegistry(); notify(domain + ' 등록 관리정보를 저장했습니다.');
  } catch(error) { notify(error.message); } finally { submit.disabled=false; }
});
document.querySelector('#closeRegistryForm')?.addEventListener('click', () => { registryForm.hidden=true; });
document.querySelector('#refreshRegistry')?.addEventListener('click', loadRegistry);

const MONITOR_URL = 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/monitor-status.json';
let monitorRecommendation;

function setHealth(row, site) {
  const health = row.querySelector('.health');
  const metrics = row.querySelectorAll('.mini-metric strong');
  const labels = { online: '정상', degraded: '지연', offline: '장애' };
  row.dataset.status = site.status;
  health.classList.remove('online', 'degraded', 'offline');
  health.classList.add(site.status);
  health.innerHTML = `<i></i>${labels[site.status] || '확인 불가'}`;
  metrics[0].textContent = Number.isFinite(site.responseTime) ? `${site.responseTime}ms` : '—';
  metrics[1].textContent = site.httpStatus || '실패';
  row.title = `${new Date(site.checkedAt).toLocaleString('ko-KR')} 점검`;
}

function updateMonitorRecommendation(data) {
  monitorRecommendation?.remove();
  const issue = data.sites.find(site => site.status === 'offline') || data.sites.find(site => site.status === 'degraded');
  if (!issue) return;
  monitorRecommendation = document.createElement('div');
  monitorRecommendation.className = 'recommend-item high searchable monitor-recommendation';
  monitorRecommendation.innerHTML = `<span class="priority">실시간</span><strong>${issue.name} ${issue.status === 'offline' ? '장애 확인' : '응답 지연'}</strong><p>${issue.domain} · HTTP ${issue.httpStatus || '실패'} · ${issue.responseTime}ms</p><button type="button">사이트 확인</button>`;
  monitorRecommendation.querySelector('button').addEventListener('click', () => window.open(issue.url, '_blank', 'noopener'));
  document.querySelector('#recommendList').prepend(monitorRecommendation);
}

async function loadMonitorStatus(announce = false) {
  try {
    const response = await fetch(`${MONITOR_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.sites) || !data.sites.length) throw new Error('점검 결과 대기 중');
    data.sites.forEach(site => {
      const row = document.querySelector(`.service-row[data-domain="${site.domain}"]`);
      if (row) setHealth(row, site);
    });
    updateMonitorRecommendation(data);
    const statusCard = document.querySelector('.stats-grid .stat-card:first-child');
    statusCard.querySelector('strong').innerHTML = `${data.summary.online} <small>/ ${data.summary.total}</small>`;
    statusCard.querySelector('p').textContent = data.summary.offline ? `${data.summary.offline}개 서비스 장애` : data.summary.degraded ? `${data.summary.degraded}개 서비스 지연` : '모든 서비스 정상';
    if (announce) notify(`실측 완료: 정상 ${data.summary.online}, 지연 ${data.summary.degraded}, 장애 ${data.summary.offline}`);
  } catch (error) {
    if (announce) notify(`모니터링 결과를 불러오지 못했습니다: ${error.message}`);
  }
}

loadMonitorStatus();
setInterval(loadMonitorStatus, 60000);


const domainGrid = document.querySelector('#domainGrid');
const dnsManager = document.querySelector('#dnsManager');
const dnsRecordList = document.querySelector('#dnsRecordList');
const dnsRecordForm = document.querySelector('#dnsRecordForm');
let activeZoneId = null;
let activeDomainName = '';

function authHeaders(jsonBody = false) {
  const token = sessionStorage.getItem('ekodi-auth-token');
  return {
    authorization: `Bearer ${token || ''}`,
    ...(jsonBody ? { 'content-type': 'application/json' } : {})
  };
}

function domainStatusLabel(status) {
  return status === 'active' ? '활성' : status === 'pending' ? '확인 중' : 'Cloudflare 미연결';
}

async function loadDomains() {
  const token = sessionStorage.getItem('ekodi-auth-token');
  if (!token || !domainGrid) return;
  domainGrid.innerHTML = '<p class="domain-loading">도메인 정보를 확인하는 중입니다.</p>';
  try {
    const response = await fetch(`${AUTH_API}/api/domains`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '도메인 정보를 불러오지 못했습니다.');
    domainGrid.innerHTML = '';
    data.domains.forEach(domain => {
      const card = document.createElement('article');
      card.className = `domain-card ${domain.connected ? 'connected' : 'disconnected'}`;
      const head = document.createElement('div');
      head.className = 'domain-card-head';
      const title = document.createElement('div');
      const service = document.createElement('strong');
      service.textContent = domain.service;
      const name = document.createElement('small');
      name.textContent = domain.name;
      title.append(service, name);
      const state = document.createElement('span');
      state.className = 'domain-status';
      state.textContent = domainStatusLabel(domain.status);
      head.append(title, state);
      const details = document.createElement('p');
      details.textContent = domain.connected
        ? (domain.nameServers.length ? `네임서버: ${domain.nameServers.join(', ')}` : 'Cloudflare에 연결되었습니다.')
        : '도메인을 Cloudflare Zone에 추가하면 이곳에서 DNS를 직접 관리할 수 있습니다.';
      const actions = document.createElement('div');
      actions.className = 'domain-actions';
      const visit = document.createElement('a');
      visit.href = `https://${domain.name}`;
      visit.target = '_blank';
      visit.rel = 'noopener';
      visit.className = 'secondary';
      visit.textContent = '사이트 열기';
      actions.append(visit);
      if (domain.connected) {
        const manage = document.createElement('button');
        manage.type = 'button';
        manage.className = 'primary';
        manage.textContent = 'DNS 관리';
        manage.addEventListener('click', () => openDnsManager(domain));
        actions.append(manage);
      }
      card.append(head, details, actions);
      domainGrid.append(card);
    });
  } catch (error) {
    domainGrid.innerHTML = '';
    const message = document.createElement('p');
    message.className = 'domain-error';
    message.textContent = error.message;
    domainGrid.append(message);
  }
}

async function openDnsManager(domain) {
  activeZoneId = domain.zoneId;
  activeDomainName = domain.name;
  document.querySelector('#dnsZoneTitle').textContent = `${domain.name} DNS 레코드`;
  dnsManager.hidden = false;
  dnsManager.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  await loadDnsRecords();
}

async function loadDnsRecords() {
  dnsRecordList.innerHTML = '<p class="domain-loading">DNS 레코드를 불러오는 중입니다.</p>';
  try {
    const response = await fetch(`${AUTH_API}/api/domains/${activeZoneId}/dns`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'DNS 레코드를 불러오지 못했습니다.');
    dnsRecordList.innerHTML = '';
    data.records.forEach(record => {
      const row = document.createElement('div');
      row.className = 'dns-record-row';
      const type = document.createElement('strong');
      type.textContent = record.type;
      const name = document.createElement('span');
      name.textContent = record.name;
      const content = document.createElement('code');
      content.textContent = record.content;
      const proxy = document.createElement('small');
      proxy.textContent = record.proxied ? '프록시 사용' : `TTL ${record.ttl}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'reject';
      remove.textContent = '삭제';
      remove.addEventListener('click', () => deleteDnsRecord(record.id));
      row.append(type, name, content, proxy, remove);
      dnsRecordList.append(row);
    });
    if (!data.records.length) dnsRecordList.innerHTML = '<p class="domain-loading">등록된 DNS 레코드가 없습니다.</p>';
  } catch (error) {
    dnsRecordList.innerHTML = `<p class="domain-error">${error.message}</p>`;
  }
}

async function deleteDnsRecord(recordId) {
  if (!confirm('이 DNS 레코드를 삭제하시겠습니까?')) return;
  try {
    const response = await fetch(`${AUTH_API}/api/domains/${activeZoneId}/dns/${recordId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'DNS 레코드를 삭제하지 못했습니다.');
    notify('DNS 레코드를 삭제했습니다.');
    await loadDnsRecords();
  } catch (error) {
    notify(error.message);
  }
}

dnsRecordForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(dnsRecordForm);
  const type = String(form.get('type'));
  const nameValue = String(form.get('name')).trim();
  const payload = {
    type,
    name: nameValue === '@' ? activeDomainName : nameValue,
    content: String(form.get('content')).trim(),
    ttl: Number(form.get('ttl')) || 3600,
    proxied: Boolean(form.get('proxied')) && ['A', 'AAAA', 'CNAME'].includes(type)
  };
  try {
    const response = await fetch(`${AUTH_API}/api/domains/${activeZoneId}/dns`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'DNS 레코드를 추가하지 못했습니다.');
    dnsRecordForm.reset();
    dnsRecordForm.elements.ttl.value = 3600;
    notify('DNS 레코드를 추가했습니다.');
    await loadDnsRecords();
  } catch (error) {
    notify(error.message);
  }
});

document.querySelector('#refreshDomains')?.addEventListener('click', loadDomains);
document.querySelector('#closeDnsManager')?.addEventListener('click', () => {
  dnsManager.hidden = true;
  activeZoneId = null;
});
