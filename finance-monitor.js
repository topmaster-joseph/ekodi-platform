const FINANCE_API = 'https://finance-api.ekodi.kr';
const financeSectionButton = document.querySelector('button.nav[data-section="finance"]');
const financeRefresh = document.querySelector('#refreshFinance');
const FINANCE_TTL_MS = 60 * 1000;
let financeLoading = false;
let financeLastLoadedAt = 0;

function financeToken() { return sessionStorage.getItem('ekodi-auth-token') || ''; }
function financeKRW(value) { return `₩${Math.round(Number(value) || 0).toLocaleString('ko-KR')}`; }
function financeDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR', { dateStyle:'short', timeStyle:'short' });
}

async function financeRequest(path) {
  const response = await fetch(`${FINANCE_API}${path}`, { cache:'no-store', headers:{ authorization:`Bearer ${financeToken()}` } });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `Finance API 요청 실패 (${response.status})`);
  return data;
}

function financeEmpty(tbody, columns, text) {
  if (!tbody) return;
  tbody.textContent = '';
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = columns;
  cell.className = 'finance-empty';
  cell.textContent = text;
  row.append(cell);
  tbody.append(row);
}

function ensureTaxServiceLink() {
  const section = document.querySelector('#financeTitle')?.closest('section');
  if (!section || document.querySelector('#taxProfessionalServiceLink')) return;
  const box = document.createElement('div');
  box.id = 'taxProfessionalServiceLink';
  box.className = 'finance-note good';
  box.style.display = 'flex';
  box.style.alignItems = 'center';
  box.style.justifyContent = 'space-between';
  box.style.gap = '12px';
  box.style.flexWrap = 'wrap';
  const copy = document.createElement('span');
  copy.textContent = '세금계산서 상세 업무는 EKODI Tax 전문서비스에서 같은 Finance Core로 처리합니다.';
  const link = document.createElement('a');
  link.href = 'https://tax.ekodi.kr/';
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'primary compact';
  link.textContent = '세금 · 증빙 열기 ↗';
  box.append(copy, link);
  const notice = section.querySelector('#financeNotice');
  if (notice) notice.insertAdjacentElement('beforebegin', box);
  else section.querySelector('.section-head')?.insertAdjacentElement('afterend', box);
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
  window.dispatchEvent(new CustomEvent('ekodi-finance-overview', { detail:data }));
}

function renderFinancePayments(payments) {
  const tbody = document.querySelector('#financePaymentRows');
  if (!payments.length) return financeEmpty(tbody, 7, '아직 동기화된 Toss 결제가 없습니다.');
  tbody.textContent = '';
  for (const payment of payments) {
    const row = document.createElement('tr');
    const values = [financeDate(payment.approvedAt), payment.orderId, payment.organizationId, payment.businessUnitId, payment.method || '—', payment.status];
    for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
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
    const row = document.createElement('tr');
    for (const value of [item.organizationId, item.businessUnitId || '공통']) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    for (const value of [revenue, expense, revenue - expense]) { const cell = document.createElement('td'); cell.className = 'right'; cell.textContent = financeKRW(value); row.append(cell); }
    const entries = document.createElement('td'); entries.className = 'right'; entries.textContent = String(item.entries); row.append(entries);
    tbody.append(row);
  }
}

function renderFinanceStructure(data) {
  const root = document.querySelector('#financeStructure');
  if (!root) return;
  const unitsByOrganization = new Map();
  const projectCountByUnit = new Map();
  for (const unit of data.businessUnits || []) {
    const key = String(unit.organizationId || '');
    const units = unitsByOrganization.get(key) || [];
    units.push(unit);
    unitsByOrganization.set(key, units);
  }
  for (const project of data.projects || []) {
    const key = String(project.businessUnitId || '');
    projectCountByUnit.set(key, (projectCountByUnit.get(key) || 0) + 1);
  }
  const fragment = document.createDocumentFragment();
  for (const organization of data.organizations || []) {
    const card = document.createElement('article'); card.className = 'finance-org';
    const title = document.createElement('strong'); title.textContent = `${organization.name} · ${organization.id}`; card.append(title);
    const units = unitsByOrganization.get(String(organization.id || '')) || [];
    if (!units.length) { const empty = document.createElement('small'); empty.textContent = '등록된 사업부 없음'; card.append(empty); }
    for (const unit of units) {
      const box = document.createElement('div'); box.className = 'finance-unit';
      const name = document.createElement('strong'); name.textContent = `${unit.name} · ${unit.id}`;
      const domain = document.createElement('small'); domain.textContent = unit.sourceDomain || '도메인 미지정';
      const count = document.createElement('small'); count.textContent = `프로젝트 ${projectCountByUnit.get(String(unit.id || '')) || 0}개`;
      box.append(name, domain, count); card.append(box);
    }
    fragment.append(card);
  }
  root.replaceChildren(fragment);
}

async function loadFinance(force = false) {
  if (!financeToken() || financeLoading) return;
  const now = Date.now();
  if (!force && financeLastLoadedAt && now - financeLastLoadedAt < FINANCE_TTL_MS) return;
  financeLoading = true;
  const financePanel = document.querySelector('[data-panel~="finance"]');
  financePanel?.setAttribute('aria-busy', 'true');
  if (financeRefresh) { financeRefresh.disabled = true; financeRefresh.textContent = '↻ 확인 중…'; }
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
    const generated = document.querySelector('#financeGenerated');
    if (generated) generated.textContent = error.message;
    const notice = document.querySelector('#financeNotice');
    if (notice) { notice.className = 'finance-note'; notice.textContent = `결제·회계 관제 연결을 확인해야 합니다: ${error.message}`; }
  } finally {
    financeLoading = false;
    financePanel?.removeAttribute('aria-busy');
    if (financeRefresh) { financeRefresh.disabled = false; financeRefresh.textContent = '↻ 결제 · 회계 새로고침'; }
  }
}

ensureTaxServiceLink();
financeRefresh?.addEventListener('click', () => loadFinance(true));
financeSectionButton?.addEventListener('click', () => {
  const title = document.querySelector('#pageTitle');
  if (title) title.textContent = '재무 · 세금';
  ensureTaxServiceLink();
  loadFinance(false);
});

if ((location.hash === '#finance' || financeSectionButton?.classList.contains('active')) && financeToken()) setTimeout(() => loadFinance(false), 0);
