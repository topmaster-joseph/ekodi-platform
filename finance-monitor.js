const FINANCE_API = 'https://finance-api.ekodi.kr';
const financeSectionButton = document.querySelector('button.nav[data-section="finance"]');
const financeRefresh = document.querySelector('#refreshFinance');
const FINANCE_TTL_MS = 60 * 1000;
const ECOSYSTEM_TTL_MS = 5 * 60 * 1000;
let financeLoading = false;
let financeLastLoadedAt = 0;
let ecosystemLastLoadedAt = 0;

function financeToken() { return sessionStorage.getItem('ekodi-auth-token') || ''; }
function financeKRW(value) { return `₩${Math.round(Number(value) || 0).toLocaleString('ko-KR')}`; }
function financeDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

async function financeRequest(path) {
  const response = await fetch(`${FINANCE_API}${path}`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${financeToken()}` }
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `Finance API 요청 실패 (${response.status})`);
  return data;
}

async function ecosystemRequest() {
  const response = await fetch('/monitor-status.json', { cache: 'default' });
  if (!response.ok) throw new Error(`전체 생태계 모니터 조회 실패 (${response.status})`);
  return response.json();
}

function financeEmpty(tbody, columns, text) {
  tbody.textContent = '';
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = columns;
  cell.className = 'finance-empty';
  cell.textContent = text;
  row.append(cell);
  tbody.append(row);
}

function renderFinanceOverview(data) {
  document.querySelector('#financeMonthGross').textContent = financeKRW(data.payments.monthGross);
  document.querySelector('#financePaymentCount').textContent = `동기화 ${data.payments.count}건`;
  const profit = Number(data.accounting.monthRevenue) - Number(data.accounting.monthExpense);
  document.querySelector('#financeProfit').textContent = financeKRW(profit);
  document.querySelector('#financeProfitDetail').textContent = `수익 ${financeKRW(data.accounting.monthRevenue)} · 비용 ${financeKRW(data.accounting.monthExpense)}`;
  document.querySelector('#financeFailures').textContent = String(data.integrations.failed7d);
  const toss = document.querySelector('#financeTossState');
  toss.textContent = data.readiness.tossSecretConfigured ? (data.readiness.tossLiveKey ? '라이브 연결' : '서버키 연결') : '키 미연결';
  toss.className = data.readiness.tossSecretConfigured ? 'finance-ready' : 'finance-warn';
  document.querySelector('#financeWebhook').textContent = data.readiness.webhookUrl.replace('https://', '');
  document.querySelector('#financeGenerated').textContent = `최근 집계 ${financeDate(data.generatedAt)} · 조직 ${data.structure.organizations} · 사업부 ${data.structure.businessUnits}`;
  const notice = document.querySelector('#financeNotice');
  if (!data.readiness.tossSecretConfigured) {
    notice.className = 'finance-note';
    notice.textContent = '결제·회계 관제와 데이터베이스는 준비되어 있습니다. Toss 라이브 서버키가 연결되기 전에는 결제 동기화가 안전하게 비활성화됩니다.';
  } else if (data.integrations.failed7d) {
    notice.className = 'finance-note';
    notice.textContent = `최근 7일 동안 ${data.integrations.failed7d}건의 결제 연동 실패가 있습니다. 운영 기록과 결제 상태를 확인하세요.`;
  } else {
    notice.className = 'finance-note good';
    notice.textContent = '결제·회계 관제 구성요소가 정상 범위입니다.';
  }
  window.dispatchEvent(new CustomEvent('ekodi-finance-overview', { detail: data }));
}

function renderFinancePayments(payments) {
  const tbody = document.querySelector('#financePaymentRows');
  if (!payments.length) return financeEmpty(tbody, 7, '아직 동기화된 Toss 결제가 없습니다.');
  tbody.textContent = '';
  for (const payment of payments) {
    const row = document.createElement('tr');
    const values = [financeDate(payment.approvedAt), payment.orderId, payment.organizationId, payment.businessUnitId, payment.method || '—', payment.status];
    for (const value of values) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    const amount = document.createElement('td'); amount.className = 'right'; amount.textContent = financeKRW(payment.grossAmount); row.append(amount);
    tbody.append(row);
  }
}

function renderFinanceAccounting(rows) {
  const tbody = document.querySelector('#financeAccountingRows');
  if (!rows.length) return financeEmpty(tbody, 6, '이번 달 입력된 회계 전표가 없습니다.');
  tbody.textContent = '';
  for (const item of rows) {
    const revenue = Number(item.revenue) || 0;
    const expense = Number(item.expense) || 0;
    const values = [item.organizationId, item.businessUnitId || '공통'];
    const row = document.createElement('tr');
    for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    for (const value of [revenue, expense, revenue - expense]) {
      const cell = document.createElement('td'); cell.className = 'right'; cell.textContent = financeKRW(value); row.append(cell);
    }
    const entries = document.createElement('td'); entries.className = 'right'; entries.textContent = String(item.entries); row.append(entries);
    tbody.append(row);
  }
}

function renderFinanceStructure(data) {
  const root = document.querySelector('#financeStructure');
  root.textContent = '';
  for (const organization of data.organizations) {
    const card = document.createElement('article'); card.className = 'finance-org';
    const title = document.createElement('strong'); title.textContent = `${organization.name} · ${organization.id}`; card.append(title);
    const units = data.businessUnits.filter(unit => unit.organizationId === organization.id);
    if (!units.length) { const empty = document.createElement('small'); empty.textContent = '등록된 사업부 없음'; card.append(empty); }
    for (const unit of units) {
      const box = document.createElement('div'); box.className = 'finance-unit';
      const name = document.createElement('strong'); name.textContent = `${unit.name} · ${unit.id}`;
      const domain = document.createElement('small'); domain.textContent = unit.sourceDomain || '도메인 미지정';
      const projects = data.projects.filter(project => project.businessUnitId === unit.id);
      const count = document.createElement('small'); count.textContent = `프로젝트 ${projects.length}개`;
      box.append(name, domain, count); card.append(box);
    }
    root.append(card);
  }
}

function ensureEcosystemPanel() {
  let tbody = document.querySelector('#ecosystemRows');
  if (tbody) return tbody;
  const financeSection = document.querySelector('#financeTitle')?.closest('section');
  if (!financeSection) return null;
  const heading = document.createElement('h3');
  heading.className = 'finance-subtitle';
  heading.textContent = 'EKODI 전체 생태계 · 10분 외부 점검';
  const meta = document.createElement('p');
  meta.className = 'operations-copy';
  meta.id = 'ecosystemGenerated';
  meta.textContent = '전 생태계 상태를 불러오는 중입니다.';
  const wrap = document.createElement('div');
  wrap.className = 'finance-table-wrap';
  const table = document.createElement('table');
  table.className = 'finance-table';
  table.innerHTML = '<thead><tr><th>서비스</th><th>주소</th><th>상태</th><th>HTTP</th><th class="right">응답</th><th>점검시각</th></tr></thead><tbody id="ecosystemRows"></tbody>';
  wrap.append(table);
  financeSection.append(heading, meta, wrap);
  tbody = table.querySelector('#ecosystemRows');
  financeEmpty(tbody, 6, '전체 생태계 상태를 불러오는 중입니다.');
  return tbody;
}

function renderEcosystem(data) {
  const tbody = ensureEcosystemPanel();
  if (!tbody) return;
  const sites = Array.isArray(data?.sites) ? data.sites : [];
  if (!sites.length) return financeEmpty(tbody, 6, '아직 전체 생태계 점검 데이터가 없습니다.');
  tbody.textContent = '';
  for (const site of sites) {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = site.name || site.id;
    const domain = document.createElement('td'); domain.textContent = site.domain || '—';
    const status = document.createElement('td'); status.textContent = site.status === 'online' ? '정상' : site.status === 'degraded' ? '지연' : '장애';
    status.className = site.status === 'online' ? 'finance-ready' : 'finance-warn';
    const http = document.createElement('td'); http.textContent = site.httpStatus ?? '—';
    const response = document.createElement('td'); response.className = 'right'; response.textContent = Number.isFinite(site.responseTime) ? `${site.responseTime}ms` : '—';
    const checked = document.createElement('td'); checked.textContent = financeDate(site.checkedAt);
    row.append(name, domain, status, http, response, checked);
    tbody.append(row);
  }
  const meta = document.querySelector('#ecosystemGenerated');
  const age = data.generatedAt ? Date.now() - new Date(data.generatedAt).getTime() : Infinity;
  const stale = !Number.isFinite(age) || age > 30 * 60 * 1000;
  const summary = data.summary || {};
  meta.textContent = `${financeDate(data.generatedAt)} · 정상 ${summary.online ?? 0} · 지연 ${summary.degraded ?? 0} · 장애 ${summary.offline ?? 0}${stale ? ' · 데이터 갱신 확인 필요' : ''}`;
  if (stale) meta.classList.add('finance-warn'); else meta.classList.remove('finance-warn');
}

async function loadEcosystem(force = false) {
  const now = Date.now();
  if (!force && ecosystemLastLoadedAt && now - ecosystemLastLoadedAt < ECOSYSTEM_TTL_MS) return;
  const tbody = ensureEcosystemPanel();
  try {
    renderEcosystem(await ecosystemRequest());
    ecosystemLastLoadedAt = Date.now();
  } catch (error) {
    if (tbody) financeEmpty(tbody, 6, error.message);
    const meta = document.querySelector('#ecosystemGenerated');
    if (meta) { meta.textContent = '외부 점검 데이터 연결을 확인해야 합니다.'; meta.classList.add('finance-warn'); }
  }
}

async function loadFinance(force = false) {
  if (!financeToken() || financeLoading) return;
  const now = Date.now();
  if (!force && financeLastLoadedAt && now - financeLastLoadedAt < FINANCE_TTL_MS) return;
  financeLoading = true;
  financeRefresh.disabled = true;
  financeRefresh.textContent = '↻ 확인 중…';
  loadEcosystem(force);
  try {
    const [overview, payments, accounting, structure] = await Promise.all([
      financeRequest('/api/finance/overview'),
      financeRequest('/api/finance/payments?limit=30'),
      financeRequest('/api/finance/accounting'),
      financeRequest('/api/finance/structure')
    ]);
    renderFinanceOverview(overview);
    renderFinancePayments(payments.payments || []);
    renderFinanceAccounting(accounting.rows || []);
    renderFinanceStructure(structure);
    financeLastLoadedAt = Date.now();
  } catch (error) {
    document.querySelector('#financeGenerated').textContent = error.message;
    const notice = document.querySelector('#financeNotice');
    notice.className = 'finance-note';
    notice.textContent = `결제·회계 관제 연결을 확인해야 합니다: ${error.message}`;
  } finally {
    financeLoading = false;
    financeRefresh.disabled = false;
    financeRefresh.textContent = '↻ 결제 · 회계 새로고침';
  }
}

financeRefresh.addEventListener('click', () => loadFinance(true));
financeSectionButton.addEventListener('click', () => {
  document.querySelector('#pageTitle').textContent = '결제 · 회계';
  loadFinance(false);
});

if ((location.hash === '#finance' || financeSectionButton.classList.contains('active')) && financeToken()) {
  setTimeout(() => loadFinance(false), 0);
}

setInterval(() => {
  const financeVisible = financeSectionButton.classList.contains('active');
  if (financeVisible && financeToken()) loadFinance(false);
}, 120000);