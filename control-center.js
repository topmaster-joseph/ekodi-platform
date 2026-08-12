const API = 'https://api.ekodi.kr';
const loginScreen = document.querySelector('#loginScreen');
const app = document.querySelector('#app');
const loginForm = document.querySelector('#loginForm');
const loginError = document.querySelector('#loginError');
const loginButton = document.querySelector('#loginButton');
const apiState = document.querySelector('#apiState');
const profileEmail = document.querySelector('#profileEmail');
const profileName = document.querySelector('#profileName');
const scopeBadge = document.querySelector('#scopeBadge');
const pageTitle = document.querySelector('#pageTitle');
const sidebar = document.querySelector('.sidebar');
const serviceControlGrid = document.querySelector('#serviceControlGrid');
const operationsGenerated = document.querySelector('#operationsGenerated');
const runHealthCheckButton = document.querySelector('#runHealthCheck');
let authMode = 'login';

function token() { return sessionStorage.getItem('ekodi-auth-token') || ''; }
function authHeaders(json = false) {
  const headers = token() ? { authorization: `Bearer ${token()}` } : {};
  if (json) headers['content-type'] = 'application/json';
  return headers;
}

function hostScope() {
  const host = location.hostname.toLowerCase();
  if (host.startsWith('admin.biz.')) return 'BIZ';
  if (host.startsWith('admin.church.')) return 'CHURCH';
  if (host.startsWith('admin.lab.')) return 'LAB';
  if (host.startsWith('admin.trade.')) return 'TRADE';
  return 'ALL';
}

function applyScope() {
  const scope = hostScope();
  scopeBadge.textContent = scope;
  document.body.dataset.scope = scope.toLowerCase();
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const auth = authHeaders(Boolean(options.body));
  for (const [key, value] of Object.entries(auth)) if (!headers.has(key)) headers.set(key, value);
  const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
  let data = null;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || `API 요청 실패 (${response.status})`);
  return data;
}

async function loadStatus() {
  try {
    const response = await fetch(`${API}/api/status`, { cache: 'no-store' });
    if (!response.ok) throw new Error('status');
    const status = await response.json();
    authMode = status.initialized ? 'login' : 'setup';
    loginButton.textContent = authMode === 'setup' ? '최고관리자 등록 및 입장' : '관리 콘솔 입장';
    const email = loginForm.elements.email;
    if (status.adminEmail) email.value = status.adminEmail;
    email.readOnly = authMode === 'setup';
    apiState.textContent = 'api.ekodi.kr 정상';
  } catch {
    apiState.textContent = '인증 API 확인 필요';
    loginError.textContent = '인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }
}

function showApp(email) {
  loginScreen.hidden = true;
  app.hidden = false;
  profileEmail.textContent = email;
  profileName.textContent = email.split('@')[0];
  applyScope();
  loadOperationsOverview();
}

async function restoreSession() {
  if (!token()) return loadStatus();
  try {
    const response = await fetch(`${API}/api/session`, { headers: authHeaders(), cache: 'no-store' });
    if (!response.ok) throw new Error('expired');
    const result = await response.json();
    showApp(result.email);
    apiState.textContent = '인증 세션 정상';
  } catch {
    sessionStorage.removeItem('ekodi-auth-token');
    sessionStorage.removeItem('ekodi-admin-email');
    await loadStatus();
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';
  if (!loginForm.checkValidity()) return loginForm.reportValidity();
  const data = new FormData(loginForm);
  loginButton.disabled = true;
  loginButton.textContent = '인증 중…';
  try {
    const response = await fetch(`${API}/api/${authMode === 'setup' ? 'setup' : 'login'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: String(data.get('email')).trim().toLowerCase(),
        password: String(data.get('password'))
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '인증에 실패했습니다.');
    sessionStorage.setItem('ekodi-auth-token', result.token);
    sessionStorage.setItem('ekodi-admin-email', result.email);
    loginForm.reset();
    showApp(result.email);
    apiState.textContent = '인증 세션 정상';
  } catch (error) {
    loginError.textContent = error.message || '인증에 실패했습니다.';
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = authMode === 'setup' ? '최고관리자 등록 및 입장' : '관리 콘솔 입장';
  }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try {
    if (token()) await fetch(`${API}/api/logout`, { method: 'POST', headers: authHeaders() });
  } finally {
    sessionStorage.removeItem('ekodi-auth-token');
    sessionStorage.removeItem('ekodi-admin-email');
    app.hidden = true;
    loginScreen.hidden = false;
    serviceControlGrid.replaceChildren(statusMessage('관리자 로그인 후 운영정보를 확인할 수 있습니다.'));
    await loadStatus();
  }
});

const titles = {
  overview: '통합 운영',
  services: '서비스 · 통계',
  communication: '메일 · 라이브',
  workspace: '클라우드 · 자료',
  organization: '조직 · 사업'
};

function activate(section) {
  document.querySelectorAll('[data-panel]').forEach(panel => {
    const targets = panel.dataset.panel.split(' ');
    panel.classList.toggle('hidden-panel', !targets.includes(section));
  });
  document.querySelectorAll('button.nav[data-section]').forEach(button => {
    button.classList.toggle('active', button.dataset.section === section);
  });
  pageTitle.textContent = titles[section] || titles.overview;
  sidebar.classList.remove('open');
}

document.querySelectorAll('button.nav[data-section]').forEach(button => {
  button.addEventListener('click', () => activate(button.dataset.section));
});

document.querySelector('#menuButton').addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') sidebar.classList.remove('open');
});

function statusMessage(text, className = 'operations-loading') {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

function stateLabel(state) {
  return ({ active: '운영', planned: '준비', paused: '중지' })[state] || state;
}

function healthLabel(status) {
  return ({ online: '정상', degraded: '지연', offline: '장애' })[status] || '점검 전';
}

function formatMetric(value, suffix = '') {
  return value === null || value === undefined ? '—' : `${value}${suffix}`;
}

function metric(label, value) {
  const box = document.createElement('div');
  const small = document.createElement('small');
  small.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  box.append(small, strong);
  return box;
}

function updateSummary(data) {
  document.querySelector('#metricActive').textContent = String(data.states?.active ?? '—');
  document.querySelector('#metricMonitored').textContent = String(data.states?.monitored ?? '—');
  document.querySelector('#metricHealthy').textContent = String(data.summary?.online ?? '—');
  const issues = Number(data.summary?.degraded || 0) + Number(data.summary?.offline || 0);
  document.querySelector('#metricIssues').textContent = String(issues);
  document.querySelector('#metricHealthyDetail').textContent = `점검 대상 ${data.summary?.total ?? 0}개 중 정상`;
  operationsGenerated.textContent = data.generatedAt
    ? `최근 집계 ${new Date(data.generatedAt).toLocaleString('ko-KR')} · 24시간 통계`
    : '운영정보 집계 완료';
}

function serviceCard(service) {
  const card = document.createElement('article');
  card.className = 'service-control-card';
  card.dataset.state = service.state;

  const head = document.createElement('div');
  head.className = 'service-control-head';
  const identity = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = service.name;
  const domain = document.createElement('small');
  domain.textContent = service.domain;
  identity.append(name, domain);
  const badge = document.createElement('span');
  const currentStatus = service.latest?.status || 'pending';
  badge.className = `health-badge ${currentStatus}`;
  badge.textContent = service.state === 'active' ? healthLabel(service.latest?.status) : stateLabel(service.state);
  head.append(identity, badge);

  const stats = document.createElement('div');
  stats.className = 'service-stats';
  stats.append(
    metric('24시간 가용률', formatMetric(service.stats24h?.availabilityPercent, '%')),
    metric('평균 응답', formatMetric(service.stats24h?.averageResponseTime, 'ms')),
    metric('최근 HTTP', formatMetric(service.latest?.httpStatus))
  );

  const form = document.createElement('form');
  form.className = 'service-settings';
  const stateField = document.createElement('label');
  stateField.textContent = '운영상태';
  const select = document.createElement('select');
  select.name = 'state';
  for (const [value, label] of [['active', '운영'], ['planned', '준비'], ['paused', '중지']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = service.state === value;
    select.append(option);
  }
  stateField.append(select);

  const monitorField = document.createElement('label');
  monitorField.className = 'monitor-toggle';
  const monitor = document.createElement('input');
  monitor.type = 'checkbox';
  monitor.checked = Boolean(service.monitorEnabled);
  monitorField.append(monitor, document.createTextNode(' 자동 상태점검'));

  const noteField = document.createElement('label');
  noteField.className = 'service-note';
  noteField.textContent = '운영 메모';
  const note = document.createElement('input');
  note.type = 'text';
  note.maxLength = 500;
  note.value = service.note || '';
  note.placeholder = '담당, 점검사항, 다음 작업 등';
  noteField.append(note);

  const actions = document.createElement('div');
  actions.className = 'service-actions';
  const open = document.createElement('a');
  open.className = 'ghost compact';
  open.href = service.id === 'api' ? 'https://api.ekodi.kr/health' : service.url;
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = '열기 ↗';
  const save = document.createElement('button');
  save.className = 'primary compact';
  save.type = 'submit';
  save.textContent = '설정 저장';
  actions.append(open, save);
  form.append(stateField, monitorField, noteField, actions);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    save.disabled = true;
    save.textContent = '저장 중…';
    try {
      await apiRequest(`/api/control/services/${encodeURIComponent(service.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state: select.value,
          monitorEnabled: monitor.checked,
          note: note.value.trim()
        })
      });
      await loadOperationsOverview();
    } catch (error) {
      operationsGenerated.textContent = `${service.name}: ${error.message}`;
    } finally {
      save.disabled = false;
      save.textContent = '설정 저장';
    }
  });

  card.append(head, stats, form);
  return card;
}

function renderServices(services) {
  serviceControlGrid.textContent = '';
  if (!services?.length) {
    serviceControlGrid.append(statusMessage('등록된 운영 서비스가 없습니다.'));
    return;
  }
  for (const service of services) serviceControlGrid.append(serviceCard(service));
}

async function loadOperationsOverview() {
  if (!token()) return;
  serviceControlGrid.replaceChildren(statusMessage('api.ekodi.kr에서 서비스 상태와 통계를 확인하는 중입니다.'));
  try {
    const data = await apiRequest('/api/control/overview');
    updateSummary(data);
    renderServices(data.services || []);
    apiState.textContent = '운영 API 정상';
  } catch (error) {
    apiState.textContent = '운영 API 확인 필요';
    operationsGenerated.textContent = error.message;
    serviceControlGrid.replaceChildren(statusMessage(`운영정보를 불러오지 못했습니다: ${error.message}`, 'operations-error'));
  }
}

runHealthCheckButton.addEventListener('click', async () => {
  runHealthCheckButton.disabled = true;
  runHealthCheckButton.textContent = '↻ 점검 중…';
  try {
    const data = await apiRequest('/api/control/check', { method: 'POST' });
    updateSummary(data);
    renderServices(data.services || []);
  } catch (error) {
    operationsGenerated.textContent = error.message;
  } finally {
    runHealthCheckButton.disabled = false;
    runHealthCheckButton.textContent = '↻ 전체 즉시 점검';
  }
});

applyScope();
activate('overview');
restoreSession();
