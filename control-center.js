const AUTH_API = 'https://api.ekodi.kr';
const OPS_API = 'https://ops-api.ekodi.kr';

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
const refreshButton = document.querySelector('#refreshButton');
let authMode = 'login';
let latestOverview = null;
let latestServiceHealth = null;

function token() {
  return sessionStorage.getItem('ekodi-auth-token') || '';
}

function authHeaders(jsonBody = false) {
  return {
    ...(token() ? { authorization: `Bearer ${token()}` } : {}),
    ...(jsonBody ? { 'content-type': 'application/json' } : {}),
  };
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

function formatKRW(value) {
  return `₩${Math.round(Number(value) || 0).toLocaleString('ko-KR')}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

async function apiFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      ...authHeaders(Boolean(options.body)),
      ...(options.headers || {}),
    },
  });
  let data = null;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadStatus() {
  try {
    const response = await fetch(`${AUTH_API}/api/status`, { cache: 'no-store' });
    if (!response.ok) throw new Error('status');
    const status = await response.json();
    authMode = status.initialized ? 'login' : 'setup';
    loginButton.textContent = authMode === 'setup' ? '최고관리자 등록 및 입장' : '관리 콘솔 입장';
    const email = loginForm.elements.email;
    if (status.adminEmail) email.value = status.adminEmail;
    email.readOnly = authMode === 'setup';
    apiState.textContent = '인증 API 정상 · 운영 API 대기';
  } catch {
    apiState.textContent = '인증 API 확인 필요';
    loginError.textContent = '인증 서버에 연결할 수 없습니다.';
  }
}

function showApp(email) {
  loginScreen.hidden = true;
  app.hidden = false;
  profileEmail.textContent = email;
  profileName.textContent = email.split('@')[0];
  applyScope();
  loadAll();
}

async function restoreSession() {
  if (!token()) return loadStatus();
  try {
    const result = await apiFetch(AUTH_API, '/api/session');
    showApp(result.email);
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
    const response = await fetch(`${AUTH_API}/api/${authMode === 'setup' ? 'setup' : 'login'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: String(data.get('email')).trim().toLowerCase(),
        password: String(data.get('password')),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '인증에 실패했습니다.');
    sessionStorage.setItem('ekodi-auth-token', result.token);
    sessionStorage.setItem('ekodi-admin-email', result.email);
    loginForm.reset();
    showApp(result.email);
  } catch (error) {
    loginError.textContent = error.message || '인증에 실패했습니다.';
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = authMode === 'setup' ? '최고관리자 등록 및 입장' : '관리 콘솔 입장';
  }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try {
    if (token()) await fetch(`${AUTH_API}/api/logout`, { method: 'POST', headers: authHeaders() });
  } finally {
    sessionStorage.removeItem('ekodi-auth-token');
    sessionStorage.removeItem('ekodi-admin-email');
    app.hidden = true;
    loginScreen.hidden = false;
    await loadStatus();
  }
});

const titles = {
  overview: '통합 관제',
  operations: '서비스 상태',
  finance: '결제 · 회계',
  structure: '조직 · 사업부',
  gateways: '서비스 게이트',
};

function activate(section) {
  const safeSection = titles[section] ? section : 'overview';
  document.querySelectorAll('[data-panel]').forEach(panel => {
    const targets = panel.dataset.panel.split(' ');
    panel.classList.toggle('hidden-panel', !targets.includes(safeSection));
  });
  document.querySelectorAll('button.nav[data-section]').forEach(button => {
    const active = button.dataset.section === safeSection;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  pageTitle.textContent = titles[safeSection];
  sidebar.classList.remove('open');
  history.replaceState(null, '', `#${safeSection}`);
}

document.querySelectorAll('button.nav[data-section]').forEach(button => {
  button.addEventListener('click', () => activate(button.dataset.section));
});

document.querySelector('#menuButton').addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') sidebar.classList.remove('open');
});
window.addEventListener('hashchange', () => activate(location.hash.slice(1)));

function statusPill(text, state) {
  const span = document.createElement('span');
  span.className = `status-pill ${state}`;
  span.textContent = text;
  return span;
}

function renderReadiness() {
  const strip = document.querySelector('#readinessStrip');
  strip.replaceChildren();
  strip.append(statusPill('인증 API · 정상', 'good'));
  strip.append(statusPill(`운영 API · ${latestOverview ? '정상' : '확인 필요'}`, latestOverview ? 'good' : 'bad'));
  const tossReady = Boolean(latestOverview?.readiness?.tossSecretConfigured);
  strip.append(statusPill(`Toss · ${tossReady ? '서버키 연결' : '키 연결 필요'}`, tossReady ? 'good' : 'warn'));
  strip.append(statusPill(`회계 DB · ${latestOverview ? '정상' : '확인 필요'}`, latestOverview ? 'good' : 'bad'));

  const notice = document.querySelector('#systemNotice');
  const offline = latestServiceHealth?.summary?.offline || 0;
  const degraded = latestServiceHealth?.summary?.degraded || 0;
  if (!latestOverview) {
    notice.className = 'notice danger';
    notice.textContent = '운영 API 상태를 확인해야 합니다.';
  } else if (offline) {
    notice.className = 'notice danger';
    notice.textContent = `${offline}개 서비스 장애가 감지되었습니다. 서비스 상태 메뉴에서 즉시 확인하세요.`;
  } else if (degraded) {
    notice.className = 'notice warning';
    notice.textContent = `${degraded}개 서비스 응답이 지연되고 있습니다.`;
  } else if (!tossReady) {
    notice.className = 'notice warning';
    notice.textContent = '플랫폼 관제는 정상입니다. Toss 라이브 서버키가 연결되면 결제 원장 자동 동기화가 활성화됩니다.';
  } else {
    notice.className = 'notice good';
    notice.textContent = '핵심 운영 구성요소가 정상 범위입니다.';
  }
}

async function loadOverview() {
  try {
    latestOverview = await apiFetch(OPS_API, '/api/overview');
    const data = latestOverview;
    document.querySelector('#metricGross').textContent = formatKRW(data.payments.monthGross);
    const profit = Number(data.accounting.monthRevenue) - Number(data.accounting.monthExpense);
    document.querySelector('#metricProfit').textContent = formatKRW(profit);
    document.querySelector('#metricAccountingDetail').textContent = `${formatKRW(data.accounting.monthRevenue)} 수익 · ${formatKRW(data.accounting.monthExpense)} 비용`;
    document.querySelector('#metricFailed').textContent = String(data.integrations.failed7d);
    document.querySelector('#overviewGenerated').textContent = `마지막 집계 ${formatDate(data.generatedAt)}`;
    document.querySelector('#tossKeyState').textContent = data.readiness.tossSecretConfigured ? (data.readiness.tossLiveKey ? '라이브 키 연결' : '서버 키 연결') : '미연결';
    document.querySelector('#tossKeyState').className = data.readiness.tossSecretConfigured ? 'good-text' : 'warn-text';
    document.querySelector('#webhookState').textContent = data.readiness.tossSecretConfigured ? '수신 준비' : '키 연결 후 활성';
    document.querySelector('#webhookUrl').textContent = data.readiness.webhookUrl.replace('https://', '');
    apiState.textContent = '인증 · 운영 API 정상';
    document.querySelector('#platformDot').classList.remove('bad-dot');
  } catch (error) {
    latestOverview = null;
    apiState.textContent = `운영 API 확인 필요 · ${error.message}`;
    document.querySelector('#platformDot').classList.add('bad-dot');
  }
  renderReadiness();
}

function serviceTarget(service) {
  if (service.id === 'auth' || service.id === 'ops') return `https://${service.domain}/health`;
  return `https://${service.domain}`;
}

async function loadServices() {
  const tbody = document.querySelector('#serviceRows');
  try {
    const data = await apiFetch(OPS_API, '/api/services/health');
    latestServiceHealth = data;
    tbody.replaceChildren();
    for (const service of data.services) {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      name.innerHTML = '<strong></strong><small></small>';
      name.querySelector('strong').textContent = service.name;
      name.querySelector('small').textContent = service.criticality === 'critical' ? '핵심' : '일반';
      const domain = document.createElement('td');
      const link = document.createElement('a');
      link.href = serviceTarget(service);
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = service.domain;
      domain.append(link);
      const category = document.createElement('td'); category.textContent = service.category;
      const status = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `health-badge ${service.status}`;
      badge.textContent = service.status === 'online' ? '정상' : service.status === 'degraded' ? '지연' : '장애';
      status.append(badge);
      const http = document.createElement('td'); http.textContent = service.httpStatus ?? '—';
      const response = document.createElement('td'); response.textContent = Number.isFinite(service.responseTime) ? `${service.responseTime}ms` : '—';
      const checked = document.createElement('td'); checked.textContent = formatDate(service.checkedAt);
      row.append(name, domain, category, status, http, response, checked);
      tbody.append(row);
    }
    document.querySelector('#metricHealth').textContent = `${data.summary.online}/${data.summary.total}`;
    document.querySelector('#metricHealthDetail').textContent = data.summary.offline ? `장애 ${data.summary.offline}` : data.summary.degraded ? `지연 ${data.summary.degraded}` : '전체 정상';
    const pay = data.services.find(item => item.id === 'pay');
    document.querySelector('#payDomainState').textContent = pay ? (pay.status === 'online' ? '온라인' : pay.status === 'degraded' ? '응답 지연' : '확인 필요') : '등록 확인 필요';
  } catch (error) {
    latestServiceHealth = null;
    tbody.innerHTML = `<tr><td colspan="7" class="empty"></td></tr>`;
    tbody.querySelector('.empty').textContent = `상태 점검 실패: ${error.message}`;
    document.querySelector('#metricHealth').textContent = '확인 필요';
  }
  renderReadiness();
}

async function loadPayments() {
  const tbody = document.querySelector('#paymentRows');
  try {
    const data = await apiFetch(OPS_API, '/api/payments?limit=30');
    tbody.replaceChildren();
    if (!data.payments.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="7" class="empty">아직 동기화된 Toss 결제가 없습니다.</td>';
      tbody.append(row);
      return;
    }
    for (const payment of data.payments) {
      const row = document.createElement('tr');
      const values = [
        formatDate(payment.approvedAt),
        payment.orderId,
        payment.organizationId,
        payment.businessUnitId,
        payment.method || '—',
        payment.status,
      ];
      for (const value of values) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      const amount = document.createElement('td'); amount.className = 'right'; amount.textContent = formatKRW(payment.grossAmount); row.append(amount);
      tbody.append(row);
    }
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty"></td></tr>';
    tbody.querySelector('.empty').textContent = `결제 원장 조회 실패: ${error.message}`;
  }
}

async function loadAccounting() {
  const tbody = document.querySelector('#accountingRows');
  try {
    const data = await apiFetch(OPS_API, '/api/accounting/summary');
    tbody.replaceChildren();
    if (!data.rows.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="6" class="empty">이번 달 입력된 회계 전표가 없습니다.</td>';
      tbody.append(row);
      return;
    }
    for (const item of data.rows) {
      const revenue = Number(item.revenue) || 0;
      const expense = Number(item.expense) || 0;
      const row = document.createElement('tr');
      const org = document.createElement('td'); org.textContent = item.organizationId;
      const unit = document.createElement('td'); unit.textContent = item.businessUnitId || '공통';
      const revenueCell = document.createElement('td'); revenueCell.className = 'right'; revenueCell.textContent = formatKRW(revenue);
      const expenseCell = document.createElement('td'); expenseCell.className = 'right'; expenseCell.textContent = formatKRW(expense);
      const profit = document.createElement('td'); profit.className = `right ${revenue - expense < 0 ? 'warn-text' : 'good-text'}`; profit.textContent = formatKRW(revenue - expense);
      const entries = document.createElement('td'); entries.className = 'right'; entries.textContent = item.entries;
      row.append(org, unit, revenueCell, expenseCell, profit, entries);
      tbody.append(row);
    }
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty"></td></tr>';
    tbody.querySelector('.empty').textContent = `회계 집계 조회 실패: ${error.message}`;
  }
}

async function loadStructure() {
  const grid = document.querySelector('#structureGrid');
  try {
    const data = await apiFetch(OPS_API, '/api/structure');
    grid.replaceChildren();
    for (const organization of data.organizations) {
      const card = document.createElement('article');
      card.className = 'structure-card';
      const heading = document.createElement('div'); heading.className = 'structure-head';
      const title = document.createElement('strong'); title.textContent = organization.name;
      const code = document.createElement('span'); code.textContent = organization.id;
      heading.append(title, code);
      const units = data.businessUnits.filter(unit => unit.organization_id === organization.id);
      const list = document.createElement('div'); list.className = 'unit-list';
      if (!units.length) {
        const empty = document.createElement('small'); empty.textContent = '등록된 사업부 없음'; list.append(empty);
      }
      for (const unit of units) {
        const item = document.createElement('div'); item.className = 'unit-item';
        const unitTitle = document.createElement('strong'); unitTitle.textContent = `${unit.name} · ${unit.id}`;
        const domain = document.createElement('a'); domain.href = `https://${unit.source_domain}`; domain.target = '_blank'; domain.rel = 'noopener'; domain.textContent = unit.source_domain || '도메인 미지정';
        const projects = data.projects.filter(project => project.business_unit_id === unit.id);
        const project = document.createElement('small'); project.textContent = projects.length ? `프로젝트 ${projects.length}개` : '프로젝트 없음';
        item.append(unitTitle, domain, project); list.append(item);
      }
      card.append(heading, list); grid.append(card);
    }
  } catch (error) {
    grid.textContent = `조직 구조 조회 실패: ${error.message}`;
  }
}

async function loadAll() {
  if (!token()) return;
  refreshButton.disabled = true;
  refreshButton.textContent = '↻ 점검 중';
  await Promise.allSettled([
    loadOverview(),
    loadServices(),
    loadPayments(),
    loadAccounting(),
    loadStructure(),
  ]);
  refreshButton.disabled = false;
  refreshButton.textContent = '↻ 전체 새로고침';
}

refreshButton.addEventListener('click', loadAll);
setInterval(() => {
  if (token() && !app.hidden) Promise.allSettled([loadOverview(), loadServices()]);
}, 60000);

applyScope();
activate(location.hash.slice(1) || 'overview');
restoreSession();
