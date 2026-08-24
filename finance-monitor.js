const FINANCE_API = 'https://finance-api.ekodi.kr';
const financeSectionButton = document.querySelector('button.nav[data-section="finance"]');
const financeRefresh = document.querySelector('#refreshFinance');
const financeViewButtons = [...document.querySelectorAll('[data-finance-view]')];
const financeViewPanes = [...document.querySelectorAll('[data-finance-pane]')];
const FINANCE_TTL_MS = 60 * 1000;
let financeLoading = false;
let financeLastLoadedAt = 0;
let financeView = 'tax';

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

function renderFinanceOverview(data) {
  const monthGross = document.querySelector('#financeMonthGross');
  const paymentCount = document.querySelector('#financePaymentCount');
  const profitNode = document.querySelector('#financeProfit');
  const profitDetail = document.querySelector('#financeProfitDetail');
  const failures = document.querySelector('#financeFailures');
  const toss = document.querySelector('#financeTossState');
  const webhook = document.querySelector('#financeWebhook');
  if (monthGross) monthGross.textContent = financeKRW(data.payments.monthGross);
  if (paymentCount) paymentCount.textContent = `동기화 ${data.payments.count}건`;
  const profit = Number(data.accounting.monthRevenue) - Number(data.accounting.monthExpense);
  if (profitNode) profitNode.textContent = financeKRW(profit);
  if (profitDetail) profitDetail.textContent = `수익 ${financeKRW(data.accounting.monthRevenue)} · 비용 ${financeKRW(data.accounting.monthExpense)}`;
  if (failures) failures.textContent = String(data.integrations.failed7d);
  if (toss) {
    toss.textContent = data.readiness.tossSecretConfigured ? (data.readiness.tossLiveKey ? '라이브 연결' : '서버키 연결') : '키 미연결';
    toss.className = data.readiness.tossSecretConfigured ? 'finance-ready' : 'finance-warn';
  }
  if (webhook) webhook.textContent = data.readiness.webhookUrl.replace('https://', '');
  const generated = document.querySelector('#financeGenerated');
  if (generated) generated.textContent = `Finance 최근 집계 ${financeDate(data.generatedAt)} · 조직 ${data.structure.organizations} · 사업부 ${data.structure.businessUnits}`;
  const notice = document.querySelector('#financePaymentNotice');
  if (notice) {
    if (!data.readiness.tossSecretConfigured) {
      notice.className = 'finance-note';
      notice.textContent = 'Toss 라이브 서버키가 연결되기 전에는 결제 동기화가 안전하게 비활성화됩니다.';
    } else if (data.integrations.failed7d) {
      notice.className = 'finance-note';
      notice.textContent = `최근 7일 동안 ${data.integrations.failed7d}건의 결제 연동 실패가 있습니다. 결제 상태를 확인하세요.`;
    } else {
      notice.className = 'finance-note good';
      notice.textContent = '결제 연동이 정상 범위입니다.';
    }
  }
  window.dispatchEvent(new CustomEvent('ekodi-finance-overview', { detail:data }));
}

function renderFinancePayments(payments) {
  const tbody = document.querySelector('#financePaymentRows');
  if (!tbody) return;
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
  if (!tbody) return;
  if (!rows.length) return financeEmpty(tbody, 6, '이번 달 입력된 회계 전표가 없습니다.');
  tbody.textContent = '';
  for (const item of rows) {
    const revenue = Number(item.revenue) || 0;
    const expense = Number(item.expense) || 0;
    const row = document.createElement('tr');
    for (const value of [item.organizationId, item.businessUnitId || '공통']) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    for (const value of [revenue, expense, revenue - expense]) { const cell = document.createElement('td'); cell.className = 'right'; cell.textContent = financeKRW(value); row.append(cell); }
    const entries = document.createElement('td'); entries.className = 'right'; entries.textContent = String(item.entries); row.append(entries); tbody.append(row);
  }
}

function renderFinanceStructure(data) {
  const root = document.querySelector('#financeStructure');
  if (!root) return;
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

async function loadFinance(force = false) {
  if (!financeToken() || financeLoading) return;
  const now = Date.now();
  if (!force && financeLastLoadedAt && now - financeLastLoadedAt < FINANCE_TTL_MS) return;
  financeLoading = true;
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
    const paymentNotice = document.querySelector('#financePaymentNotice');
    if (paymentNotice) { paymentNotice.className = 'finance-note'; paymentNotice.textContent = `결제·회계 연결을 확인해야 합니다: ${error.message}`; }
  } finally {
    financeLoading = false;
    if (financeRefresh) { financeRefresh.disabled = false; financeRefresh.textContent = '↻ 결제 · 회계 새로고침'; }
  }
}

function activateFinanceView(view) {
  financeView = ['tax','payments','accounting','structure'].includes(view) ? view : 'tax';
  const pageTitle = document.querySelector('#pageTitle');
  if (pageTitle) pageTitle.textContent = '재무 · 세금';
  financeViewButtons.forEach(button => button.classList.toggle('active', button.dataset.financeView === financeView));
  financeViewPanes.forEach(pane => { pane.hidden = pane.dataset.financePane !== financeView; });
  if (financeView !== 'tax') loadFinance(false);
}

financeViewButtons.forEach(button => button.addEventListener('click', () => activateFinanceView(button.dataset.financeView)));
financeRefresh?.addEventListener('click', () => loadFinance(true));
financeSectionButton?.addEventListener('click', () => activateFinanceView('tax'));

if ((location.hash === '#finance' || financeSectionButton?.classList.contains('active')) && financeToken()) setTimeout(() => activateFinanceView('tax'), 0);
