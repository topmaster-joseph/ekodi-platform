const FINANCE_API = 'https://ekodi.kr';
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
  link.href = 'https://ekodi.kr/tax';
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

// Policy Fund Management: current borrower loans first, then discovery -> application -> extension/refinance.
const POLICY_FUND_API = '/api/finance/policy-funds';
let policyFundLoading = false;
let policyFundLastLoadedAt = 0;

function policyFundStatus(value) {
  const labels = {
    discovered:'발견', eligible:'적격후보', preparing:'준비', submitted:'접수', supplement:'보완', approved:'승인', rejected:'반려', executed:'실행', closed:'종료',
    unknown:'확인필요', candidate:'후보', 'needs-review':'검토필요', ineligible:'비대상', planned:'예정', active:'실행중', grace:'거치', repaying:'상환중', extended:'연장', refinanced:'대환', delinquent:'연체',
    completed:'완료', cancelled:'취소', open:'진행', done:'완료', missing:'미확보', requested:'요청', ready:'준비완료', expired:'만료',
    'repayment-extension':'상환연장', 'maturity-extension':'만기연장', refinance:'대환', deferment:'상환유예', other:'기타'
  };
  return labels[value] || value || '—';
}

async function policyFundRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${financeToken()}`);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${FINANCE_API}${POLICY_FUND_API}${path}`, { cache:'no-store', ...options, headers });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || data.code || `정책자금 API 요청 실패 (${response.status})`);
  return data;
}

function ensurePolicyFundStyles() {
  if (document.querySelector('#policyFundStyles')) return;
  const style = document.createElement('style');
  style.id = 'policyFundStyles';
  style.textContent = `
    .policy-fund-panel{margin-top:34px;padding-top:28px;border-top:1px solid var(--line,#d8dee8)}
    .policy-fund-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .policy-fund-head h3{margin:3px 0 5px;font-size:1.3rem}.policy-fund-head p{margin:0;max-width:800px;opacity:.75}
    .policy-fund-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:16px 0}
    .policy-fund-grid article{padding:14px;border:1px solid var(--line,#d8dee8);border-radius:14px;background:var(--card,#fff)}
    .policy-fund-grid small,.policy-fund-grid span{display:block;opacity:.72}.policy-fund-grid strong{display:block;font-size:1.2rem;margin:5px 0}
    .policy-fund-toolbar{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:14px 0}.policy-fund-toolbar label{display:grid;gap:4px;min-width:260px}
    .policy-fund-forms{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:15px 0}.policy-fund-forms details{border:1px solid var(--line,#d8dee8);border-radius:12px;padding:11px;background:var(--card,#fff)}
    .policy-fund-forms summary{cursor:pointer;font-weight:700}.policy-fund-form{display:grid;gap:8px;margin-top:10px}.policy-fund-form label{display:grid;gap:4px;font-size:.88rem}.policy-fund-form input,.policy-fund-form select{width:100%;box-sizing:border-box}
    .policy-fund-source{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.policy-fund-source a{font-weight:700}
    .policy-fund-message{min-height:22px;margin:8px 0;font-size:.9rem}.policy-fund-message.error{color:#b42318}.policy-fund-message.good{color:#067647}
    .policy-fund-table-title{margin:22px 0 8px}.policy-fund-panel .finance-table td{vertical-align:top}.policy-fund-muted{opacity:.7;font-size:.82rem}
    @media(max-width:1100px){.policy-fund-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.policy-fund-forms{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function borrowerOptions(includeAll = false) {
  const borrowers = window.__ekodiPolicyBorrowers || [];
  const options = [];
  if (includeAll) {
    const all = document.createElement('option'); all.value = ''; all.textContent = '전체 사업자'; options.push(all);
  }
  for (const borrower of borrowers.filter(item => item.active !== false)) {
    const option = document.createElement('option');
    option.value = borrower.id;
    option.textContent = borrower.displayName;
    options.push(option);
  }
  return options;
}

function ensurePolicyFundPanel() {
  const section = document.querySelector('#financeTitle')?.closest('section');
  if (!section || document.querySelector('#policyFundPanel')) return;
  ensurePolicyFundStyles();
  const panel = document.createElement('div');
  panel.id = 'policyFundPanel';
  panel.className = 'policy-fund-panel';
  panel.innerHTML = `
    <div class="policy-fund-head"><div><small>POLICY FUND · LOAN OPERATIONS</small><h3>소상공인 정책자금 · 기존대출 운영</h3><p>에코디비즈·자담치킨처럼 이미 사용 중인 대출을 먼저 관리하고, 신규 정책자금 탐색·신청·연장·대환까지 같은 원장에서 이어갑니다. 계좌번호와 금융 비밀번호는 저장하지 않습니다.</p></div><button class="secondary" id="policyFundRefresh" type="button">↻ 대출 · 정책자금 새로고침</button></div>
    <div class="policy-fund-grid"><article><small>관리 사업자</small><strong id="policyBorrowerCount">0</strong><span>활성 차입사업자</span></article><article><small>실행 잔액</small><strong id="policyBalance">₩0</strong><span>등록된 현재잔액 합계</span></article><article><small>90일 내 만기</small><strong id="policyDue90">0</strong><span>연장·대환 사전점검</span></article><article><small>신청 진행</small><strong id="policySubmitted">0</strong><span>정책자금 접수 · 보완</span></article><article><small>연장관리</small><strong id="policyExtensions">0</strong><span>열린 연장·대환 건</span></article></div>
    <div class="finance-note good policy-fund-source" id="policyOfficialSource"><span>최신 공식 공고를 확인하는 중입니다.</span></div>
    <div class="policy-fund-toolbar"><label>관리 사업자<select id="policyBorrowerFilter"></select></label><button class="secondary" id="policyBorrowerApply" type="button">사업자별 보기</button><span id="policyFundGenerated"></span></div>
    <div class="policy-fund-forms">
      <details open><summary>현재 사용 중인 대출 등록</summary><form class="policy-fund-form" id="policyLoanForm"><label>차입사업자<select name="borrowerId" data-policy-borrower-select required></select></label><label>금융기관<input name="lender" placeholder="은행 · 소진공 등"></label><label>상품명<input name="productName" placeholder="대출 상품명"></label><label>보증기관<input name="guaranteeAgency" placeholder="신용보증재단 등"></label><label>최초 대출액<input name="principal" type="number" min="0" step="10000" required></label><label>현재 잔액<input name="balance" type="number" min="0" step="10000"></label><label>금리(%)<input name="annualRate" type="number" min="0" max="100" step="0.01"></label><label>상환방식<input name="repaymentMethod" placeholder="원금균등 · 만기일시 등"></label><label>월 납입액<input name="monthlyPayment" type="number" min="0" step="1000"></label><label>매월 납입일<input name="paymentDay" type="number" min="1" max="31"></label><label>대출 실행일<input name="startedOn" type="date"></label><label>거치 종료일<input name="graceEndOn" type="date"></label><label>만기일<input name="maturityOn" type="date"></label><button class="primary" type="submit">현재 대출 등록</button><small class="policy-fund-muted">만기일을 입력하면 D-90·60·30·14·7 관리업무가 자동 생성됩니다.</small></form></details>
      <details><summary>신규 정책자금 준비 · 신청</summary><form class="policy-fund-form" id="policyApplicationForm"><label>차입사업자<select name="borrowerId" data-policy-borrower-select required></select></label><label>정책자금<select name="programId" id="policyProgramSelect" required></select></label><label>신청 희망액<input name="requestedAmount" type="number" min="0" step="10000"></label><label>다음 행동<input name="nextAction" placeholder="서류 준비 · 접수 등"></label><label>기한<input name="nextActionDue" type="date"></label><button class="primary" type="submit">준비 건 등록</button></form></details>
      <details><summary>연장 · 대환 관리</summary><form class="policy-fund-form" id="policyExtensionForm"><label>대출<select name="loanId" id="policyLoanSelect" required></select></label><label>유형<select name="kind"><option value="repayment-extension">상환연장</option><option value="maturity-extension">만기연장</option><option value="refinance">대환</option><option value="deferment">상환유예</option><option value="other">기타</option></select></label><label>사유/확인사항<input name="reason"></label><label>변경 예정 만기<input name="newMaturityOn" type="date"></label><button class="primary" type="submit">검토 건 등록</button></form></details>
    </div>
    <p class="policy-fund-message" id="policyFundMessage" role="status"></p>
    <h4 class="policy-fund-table-title">현재 대출 · 만기</h4><div class="finance-table-wrap"><table class="finance-table"><thead><tr><th>사업자</th><th>금융기관 · 상품</th><th class="right">최초/잔액</th><th>금리 · 상환</th><th>납입</th><th>만기</th><th>상태</th></tr></thead><tbody id="policyLoanRows"></tbody></table></div>
    <h4 class="policy-fund-table-title">정책자금 확보 · 신청</h4><div class="finance-table-wrap"><table class="finance-table"><thead><tr><th>사업자</th><th>정책자금</th><th>상태</th><th>적격</th><th class="right">희망/승인액</th><th>다음 행동</th></tr></thead><tbody id="policyApplicationRows"></tbody></table></div>
    <h4 class="policy-fund-table-title">연장 · 대환</h4><div class="finance-table-wrap"><table class="finance-table"><thead><tr><th>대출</th><th>유형</th><th>적격</th><th>상태</th><th>기존/변경 만기</th><th>사유</th></tr></thead><tbody id="policyExtensionRows"></tbody></table></div>
    <h4 class="policy-fund-table-title">할 일 · 자동 만기알림</h4><div class="finance-table-wrap"><table class="finance-table"><thead><tr><th>사업자</th><th>업무</th><th>기한</th><th>우선순위</th><th>상태</th></tr></thead><tbody id="policyTaskRows"></tbody></table></div>`;
  section.append(panel);
  document.querySelector('#policyFundRefresh')?.addEventListener('click', () => loadPolicyFundManagement(true));
  document.querySelector('#policyBorrowerApply')?.addEventListener('click', () => loadPolicyFundManagement(true));
  bindPolicyFundForms();
}

function policyFundMessage(text, kind = '') {
  const node = document.querySelector('#policyFundMessage');
  if (!node) return;
  node.textContent = text;
  node.className = `policy-fund-message ${kind}`.trim();
}

function renderPolicyFundRows(tbodyId, rows, columns, emptyText) {
  const tbody = document.querySelector(tbodyId);
  if (!tbody) return;
  if (!rows.length) return financeEmpty(tbody, columns, emptyText);
  tbody.textContent = '';
  for (const values of rows) {
    const tr = document.createElement('tr');
    for (const value of values) {
      const td = document.createElement('td');
      if (value && typeof value === 'object' && value.right) td.className = 'right';
      td.textContent = value && typeof value === 'object' ? value.text : value;
      tr.append(td);
    }
    tbody.append(tr);
  }
}

function ownerName(item) { return item?.borrowerName || item?.organizationId || item?.borrowerId || '—'; }

function refillBorrowerSelects(borrowers) {
  window.__ekodiPolicyBorrowers = borrowers || [];
  const filter = document.querySelector('#policyBorrowerFilter');
  if (filter) {
    const current = filter.value;
    filter.replaceChildren(...borrowerOptions(true));
    if ([...filter.options].some(option => option.value === current)) filter.value = current;
  }
  for (const select of document.querySelectorAll('[data-policy-borrower-select]')) {
    const current = select.value;
    select.replaceChildren(...borrowerOptions(false));
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }
}

function renderPolicyFundData(overview, borrowers, programs, portfolio) {
  refillBorrowerSelects(borrowers);
  document.querySelector('#policyBorrowerCount').textContent = String(overview.borrowers?.active || 0);
  document.querySelector('#policySubmitted').textContent = String(overview.applications?.submitted || 0);
  document.querySelector('#policyBalance').textContent = financeKRW(overview.loans?.activeBalance || 0);
  document.querySelector('#policyDue90').textContent = String(overview.loans?.dueWithin90Days || 0);
  document.querySelector('#policyExtensions').textContent = String(overview.extensions?.openCases || 0);
  document.querySelector('#policyFundGenerated').textContent = `최근 확인 ${financeDate(overview.generatedAt)} · 미확보 서류 ${overview.documents?.missing || 0} · 지연업무 ${overview.tasks?.overdue || 0}`;

  const sourceBox = document.querySelector('#policyOfficialSource');
  sourceBox.textContent = '';
  const latest = overview.latestOfficialProgram;
  if (latest) {
    const copy = document.createElement('span');
    copy.textContent = `${latest.title} · ${latest.noticeNumber || ''} ${latest.revisionLabel || ''} · 공식원본 확인 ${financeDate(latest.sourceCheckedAt)}`;
    sourceBox.append(copy);
    const link = document.createElement('a'); link.href = latest.sourceUrl; link.target = '_blank'; link.rel = 'noopener'; link.textContent = '공식 공고 ↗'; sourceBox.append(link);
  } else sourceBox.textContent = '등록된 공식 정책자금 공고가 없습니다.';

  const programSelect = document.querySelector('#policyProgramSelect');
  if (programSelect) {
    const current = programSelect.value;
    programSelect.replaceChildren(...(programs || []).filter(item => item.active).map(item => {
      const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.programYear} · ${item.title}`; return option;
    }));
    if ([...programSelect.options].some(option => option.value === current)) programSelect.value = current;
  }

  const loanSelect = document.querySelector('#policyLoanSelect');
  if (loanSelect) {
    const current = loanSelect.value;
    loanSelect.replaceChildren(...(portfolio.loans || []).map(item => {
      const option = document.createElement('option'); option.value = item.id; option.textContent = `${ownerName(item)} · ${item.lender || '금융기관 미입력'} · ${item.maturityOn || '만기 미입력'}`; return option;
    }));
    if ([...loanSelect.options].some(option => option.value === current)) loanSelect.value = current;
  }

  renderPolicyFundRows('#policyLoanRows',(portfolio.loans || []).map(item => [
    ownerName(item),`${item.lender || '—'}${item.productName ? ` · ${item.productName}` : ''}`,
    { right:true,text:`${financeKRW(item.principal || 0)} / ${financeKRW(item.balance || 0)}` },
    `${item.annualRate == null ? '금리 —' : `${item.annualRate}%`}${item.repaymentMethod ? ` · ${item.repaymentMethod}` : ''}`,
    `${item.monthlyPayment == null ? '—' : financeKRW(item.monthlyPayment)}${item.paymentDay ? ` · 매월 ${item.paymentDay}일` : ''}`,
    item.maturityOn || '—',policyFundStatus(item.status)
  ]),7,'등록된 현재 대출이 없습니다.');

  renderPolicyFundRows('#policyApplicationRows',(portfolio.applications || []).map(item => [
    ownerName(item),item.programTitle,policyFundStatus(item.status),policyFundStatus(item.eligibilityStatus),
    { right:true,text:`${financeKRW(item.requestedAmount || 0)} / ${item.approvedAmount == null ? '—' : financeKRW(item.approvedAmount)}` },
    `${item.nextAction || '—'}${item.nextActionDue ? ` · ${item.nextActionDue}` : ''}`
  ]),6,'등록된 정책자금 준비·신청 건이 없습니다.');

  renderPolicyFundRows('#policyExtensionRows',(portfolio.extensions || []).map(item => [
    item.loanId,policyFundStatus(item.kind),policyFundStatus(item.eligibilityStatus),policyFundStatus(item.status),
    `${item.originalMaturityOn || '—'} / ${item.newMaturityOn || '—'}`,item.reason || '—'
  ]),6,'등록된 연장·대환 관리 건이 없습니다.');

  renderPolicyFundRows('#policyTaskRows',(portfolio.tasks || []).map(item => [
    ownerName(item),item.title,item.dueOn || '—',item.priority,policyFundStatus(item.status)
  ]),5,'예정된 대출·정책자금 관리 업무가 없습니다.');
}

async function loadPolicyFundManagement(force = false) {
  ensurePolicyFundPanel();
  if (!financeToken() || policyFundLoading) return;
  const now = Date.now();
  if (!force && policyFundLastLoadedAt && now - policyFundLastLoadedAt < FINANCE_TTL_MS) return;
  policyFundLoading = true;
  document.querySelector('#policyFundPanel')?.setAttribute('aria-busy','true');
  try {
    const borrowerId = document.querySelector('#policyBorrowerFilter')?.value || '';
    const suffix = borrowerId ? `?borrowerId=${encodeURIComponent(borrowerId)}` : '';
    const [overview, borrowerData, programData, portfolio] = await Promise.all([
      policyFundRequest('/overview'), policyFundRequest('/borrowers'), policyFundRequest('/programs'), policyFundRequest(`/portfolio${suffix}`)
    ]);
    renderPolicyFundData(overview, borrowerData.borrowers || [], programData.programs || [], portfolio);
    policyFundLastLoadedAt = Date.now();
    policyFundMessage('');
  } catch (error) {
    policyFundMessage(`대출·정책자금 관리 연결을 확인해야 합니다: ${error.message}`,'error');
  } finally {
    policyFundLoading = false;
    document.querySelector('#policyFundPanel')?.removeAttribute('aria-busy');
  }
}

function compactFormValues(form) {
  const values = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(values)) if (values[key] === '') delete values[key];
  return values;
}

function bindPolicyFundForms() {
  const applicationForm = document.querySelector('#policyApplicationForm');
  const loanForm = document.querySelector('#policyLoanForm');
  const extensionForm = document.querySelector('#policyExtensionForm');

  loanForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const values = compactFormValues(loanForm);
    try {
      await policyFundRequest('/loans',{ method:'POST',body:JSON.stringify({ ...values,loanType:'existing-loan',status:'repaying',balance:values.balance || values.principal }) });
      policyFundMessage('현재 대출을 등록했습니다. 만기일이 있으면 D-90·60·30·14·7 관리업무도 자동 생성됩니다.','good');
      const borrowerId = values.borrowerId; loanForm.reset(); if (borrowerId) loanForm.querySelector('[name="borrowerId"]').value = borrowerId;
      await loadPolicyFundManagement(true);
    } catch (error) { policyFundMessage(error.message,'error'); }
  });

  applicationForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const values = compactFormValues(applicationForm);
    try {
      await policyFundRequest('/applications',{ method:'POST',body:JSON.stringify({ ...values,status:'preparing',eligibilityStatus:'needs-review' }) });
      policyFundMessage('정책자금 준비 건을 등록했습니다. 공식 요건 확인 후 적격상태를 갱신하세요.','good');
      const borrowerId = values.borrowerId; applicationForm.reset(); if (borrowerId) applicationForm.querySelector('[name="borrowerId"]').value = borrowerId;
      await loadPolicyFundManagement(true);
    } catch (error) { policyFundMessage(error.message,'error'); }
  });

  extensionForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const values = compactFormValues(extensionForm);
    try {
      await policyFundRequest('/extensions',{ method:'POST',body:JSON.stringify({ ...values,status:'candidate',eligibilityStatus:'needs-review' }) });
      policyFundMessage('연장·대환 검토 건을 등록했습니다. 공식 제도와 현재 채무상태를 확인해 적격여부를 확정하세요.','good');
      extensionForm.reset(); await loadPolicyFundManagement(true);
    } catch (error) { policyFundMessage(error.message,'error'); }
  });
}

ensurePolicyFundPanel();
financeSectionButton?.addEventListener('click', () => loadPolicyFundManagement(false));
financeRefresh?.addEventListener('click', () => loadPolicyFundManagement(true));
window.addEventListener('ekodi-finance-overview', () => loadPolicyFundManagement(false));
if ((location.hash === '#finance' || financeSectionButton?.classList.contains('active')) && financeToken()) setTimeout(() => loadPolicyFundManagement(false), 0);
