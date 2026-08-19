(() => {
  'use strict';

  const FINANCE_API = 'https://finance-api.ekodi.kr';
  const ORGANIZATION_ID = 'EKODIBIZ';
  const DEFAULT_UNIT = 'BIZ';
  let readiness = null;
  let customers = [];
  let invoices = [];
  let loading = false;

  function token() {
    try { return sessionStorage.getItem('ekodi-auth-token') || ''; } catch { return ''; }
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${FINANCE_API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `세금계산서 API 요청 실패 (${response.status})`);
    return data;
  }

  function won(value) {
    return `₩${Math.round(Number(value) || 0).toLocaleString('ko-KR')}`;
  }

  function todayKorea() {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()).replaceAll('-', '');
  }

  function formatDate(value) {
    const text = String(value || '');
    return /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : '—';
  }

  function statusLabel(status) {
    return ({
      DRAFT: '초안', APPROVED: '승인됨', ISSUING: '발행 중', ISSUED: '발행됨',
      NTS_CONFIRMED: '국세청 전송완료', FAILED: '확인 필요', CANCELED: '취소'
    })[status] || status || '—';
  }

  function make(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== '') node.textContent = text;
    return node;
  }

  function financeSection() {
    return document.querySelector('#financeTitle')?.closest('section') || null;
  }

  function setNotice(text, good = false) {
    const notice = document.querySelector('#taxInvoiceNotice');
    if (!notice) return;
    notice.textContent = text;
    notice.className = `tax-invoice-notice${good ? ' good' : ''}`;
  }

  function ensureUI() {
    if (document.querySelector('#taxInvoiceWorkspace')) return true;
    const section = financeSection();
    if (!section) return false;

    const workspace = make('section', 'tax-invoice-workspace');
    workspace.id = 'taxInvoiceWorkspace';
    workspace.setAttribute('aria-labelledby', 'taxInvoiceTitle');
    workspace.innerHTML = `
      <div class="tax-invoice-head">
        <div>
          <p class="kicker">ELECTRONIC TAX INVOICE</p>
          <h3 id="taxInvoiceTitle">전자세금계산서</h3>
          <p class="operations-copy">초안 작성 → 관리자 승인 → 발행 → 국세청 전송상태 확인의 순서로 처리합니다.</p>
        </div>
        <div class="tax-invoice-actions">
          <button type="button" class="secondary" id="taxProfileButton">공급자 정보</button>
          <button type="button" class="primary" id="taxDraftButton">＋ 새 세금계산서</button>
        </div>
      </div>
      <div class="tax-invoice-status" aria-label="전자세금계산서 상태">
        <article><small>발행 환경</small><strong id="taxEnvironment">확인 중</strong><span id="taxProvider">POPBILL</span></article>
        <article><small>공급자 정보</small><strong id="taxProfileState">확인 중</strong><span>사업자번호 · 대표자</span></article>
        <article><small>이번 달 발행</small><strong id="taxMonthAmount">₩0</strong><span id="taxMonthCount">0건</span></article>
        <article><small>확인 필요</small><strong id="taxAttentionCount">0</strong><span>실패 · 전송 확인</span></article>
      </div>
      <div class="tax-invoice-notice" id="taxInvoiceNotice">전자세금계산서 준비 상태를 확인하고 있습니다.</div>
      <div class="tax-invoice-table-head">
        <h4>최근 세금계산서</h4>
        <button type="button" class="ghost compact" id="taxInvoiceRefresh">↻ 새로고침</button>
      </div>
      <div class="finance-table-wrap">
        <table class="finance-table tax-invoice-table">
          <thead><tr><th>작성일</th><th>문서번호</th><th>공급받는자</th><th>상태</th><th class="right">공급가액</th><th class="right">세액</th><th class="right">합계</th><th>처리</th></tr></thead>
          <tbody id="taxInvoiceRows"><tr><td colspan="8" class="finance-empty">세금계산서 대장을 불러오는 중입니다.</td></tr></tbody>
        </table>
      </div>`;

    const financeNotice = section.querySelector('#financeNotice');
    if (financeNotice) financeNotice.insertAdjacentElement('afterend', workspace);
    else section.append(workspace);

    document.querySelector('#taxProfileButton')?.addEventListener('click', openProfileDialog);
    document.querySelector('#taxDraftButton')?.addEventListener('click', openDraftDialog);
    document.querySelector('#taxInvoiceRefresh')?.addEventListener('click', () => loadAll(true));
    return true;
  }

  function renderReadiness(data) {
    readiness = data;
    const environment = document.querySelector('#taxEnvironment');
    const provider = document.querySelector('#taxProvider');
    const profile = document.querySelector('#taxProfileState');
    const monthAmount = document.querySelector('#taxMonthAmount');
    const monthCount = document.querySelector('#taxMonthCount');
    const attention = document.querySelector('#taxAttentionCount');
    if (!environment) return;

    const sandbox = data.environment !== 'production';
    environment.textContent = sandbox ? 'Sandbox' : (data.liveEnabled ? '운영 발행 가능' : '운영 발행 잠김');
    environment.className = sandbox || !data.liveEnabled ? 'finance-warn' : 'finance-ready';
    provider.textContent = `${data.provider || 'POPBILL'} · ${data.credentialsConfigured ? 'API 연결' : '키 미연결'}`;
    profile.textContent = data.profileComplete ? '완료' : '정보 필요';
    profile.className = data.profileComplete ? 'finance-ready' : 'finance-warn';
    monthAmount.textContent = won(data.monthAmount);
    const counts = data.counts || {};
    const issuedCount = Number(counts.ISSUED || 0) + Number(counts.NTS_CONFIRMED || 0);
    monthCount.textContent = `${issuedCount}건`;
    attention.textContent = String(Number(counts.FAILED || 0) + Number(counts.ISSUING || 0));

    if (!data.profileComplete) {
      setNotice('공급자 사업자번호·상호·대표자 정보를 먼저 등록해 주세요. 초안 작성은 가능하지만 승인은 잠깁니다.');
    } else if (!data.credentialsConfigured) {
      setNotice('공급자 정보와 내부 대장은 준비되었습니다. 팝빌 API 키가 연결되기 전까지 실제 외부 발행은 안전하게 잠깁니다.');
    } else if (data.environment === 'production' && !data.liveEnabled) {
      setNotice('운영 API는 연결되어 있지만 실제 발행 잠금이 켜져 있습니다. 검증 후에만 운영 발행을 열 수 있습니다.');
    } else if (sandbox) {
      setNotice('Sandbox 발행 환경입니다. 국세청 실제 전송 없이 전체 흐름을 검증할 수 있습니다.', true);
    } else {
      setNotice('운영 발행 준비가 완료되었습니다. 모든 발행은 관리자 승인 후에만 진행됩니다.', true);
    }
  }

  function renderInvoices(list) {
    invoices = Array.isArray(list) ? list : [];
    const tbody = document.querySelector('#taxInvoiceRows');
    if (!tbody) return;
    tbody.textContent = '';
    if (!invoices.length) {
      const row = make('tr');
      const cell = make('td', 'finance-empty', '아직 작성된 세금계산서가 없습니다.');
      cell.colSpan = 8;
      row.append(cell);
      tbody.append(row);
      return;
    }

    for (const invoice of invoices) {
      const row = make('tr');
      const values = [
        formatDate(invoice.writeDate), invoice.documentNo,
        invoice.invoicee?.corpName || invoice.invoicee?.corpNum || '—'
      ];
      for (const value of values) row.append(make('td', '', value));
      const status = make('td');
      const badge = make('span', `tax-status ${String(invoice.status || '').toLowerCase()}`, statusLabel(invoice.status));
      status.append(badge);
      if (invoice.lastError) status.title = invoice.lastError;
      row.append(status);
      for (const value of [invoice.supplyAmount, invoice.taxAmount, invoice.totalAmount]) {
        row.append(make('td', 'right', won(value)));
      }
      const action = make('td', 'tax-row-actions');
      action.append(...invoiceActions(invoice));
      row.append(action);
      tbody.append(row);
    }
  }

  function actionButton(label, className, handler, disabled = false) {
    const button = make('button', className, label);
    button.type = 'button';
    button.disabled = disabled;
    button.addEventListener('click', handler);
    return button;
  }

  function invoiceActions(invoice) {
    const actions = [];
    actions.push(actionButton('보기', 'ghost compact', () => openDetailDialog(invoice.id)));
    if (invoice.status === 'DRAFT') {
      actions.push(actionButton('승인', 'secondary compact', () => approve(invoice)));
    } else if (invoice.status === 'APPROVED') {
      const productionLocked = readiness?.environment === 'production' && !readiness?.liveEnabled;
      const noCredentials = readiness && !readiness.credentialsConfigured;
      const label = readiness?.environment === 'production' ? '발행' : '샌드박스 발행';
      actions.push(actionButton(label, 'primary compact', () => issue(invoice), productionLocked || noCredentials));
    } else if (['ISSUING', 'ISSUED', 'FAILED'].includes(invoice.status)) {
      actions.push(actionButton('상태 확인', 'secondary compact', () => sync(invoice)));
    }
    return actions;
  }

  async function loadAll(force = false) {
    if (!token() || loading || !ensureUI()) return;
    loading = true;
    const refresh = document.querySelector('#taxInvoiceRefresh');
    if (refresh) { refresh.disabled = true; refresh.textContent = '↻ 확인 중…'; }
    try {
      const [ready, list, customerList] = await Promise.all([
        request(`/api/finance/tax-invoices/readiness?organizationId=${ORGANIZATION_ID}`),
        request(`/api/finance/tax-invoices?organizationId=${ORGANIZATION_ID}&limit=50${force ? `&_=${Date.now()}` : ''}`),
        request(`/api/finance/tax-customers?organizationId=${ORGANIZATION_ID}&limit=100`)
      ]);
      customers = customerList.customers || [];
      renderReadiness(ready);
      renderInvoices(list.invoices || []);
    } catch (error) {
      setNotice(`전자세금계산서 연결을 확인해 주세요: ${error.message}`);
      const tbody = document.querySelector('#taxInvoiceRows');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="finance-empty">세금계산서 데이터를 불러오지 못했습니다.</td></tr>';
    } finally {
      loading = false;
      if (refresh) { refresh.disabled = false; refresh.textContent = '↻ 새로고침'; }
    }
  }

  function dialogShell(titleText, description = '') {
    const dialog = make('dialog', 'tax-dialog');
    const form = make('form', 'tax-dialog-card');
    form.method = 'dialog';
    const head = make('div', 'tax-dialog-head');
    const titleWrap = make('div');
    titleWrap.append(make('h3', '', titleText));
    if (description) titleWrap.append(make('p', '', description));
    const close = make('button', 'ghost compact', '닫기');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    head.append(titleWrap, close);
    const body = make('div', 'tax-dialog-body');
    const footer = make('div', 'tax-dialog-footer');
    form.append(head, body, footer);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    return { dialog, form, body, footer };
  }

  function field(labelText, name, value = '', options = {}) {
    const label = make('label', options.wide ? 'tax-field wide' : 'tax-field');
    label.append(make('span', '', labelText));
    const input = make(options.multiline ? 'textarea' : 'input');
    input.name = name;
    input.value = value || '';
    if (options.type) input.type = options.type;
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.required) input.required = true;
    if (options.maxLength) input.maxLength = options.maxLength;
    label.append(input);
    return label;
  }

  async function openProfileDialog() {
    const { profile = {} } = await request(`/api/finance/tax-profile?organizationId=${ORGANIZATION_ID}`);
    const shell = dialogShell('에코디비즈 공급자 정보', '실제 전자세금계산서에 들어가는 법적 사업자 정보입니다.');
    const grid = make('div', 'tax-form-grid');
    grid.append(
      field('사업자번호', 'corpNum', profile.corpNum, { required: true, placeholder: '숫자 10자리' }),
      field('종사업장번호', 'taxRegId', profile.taxRegId, { placeholder: '해당 시 4자리' }),
      field('상호', 'corpName', profile.corpName || '에코디비즈', { required: true }),
      field('대표자', 'ceoName', profile.ceoName, { required: true }),
      field('사업장 주소', 'addr', profile.addr, { wide: true }),
      field('업태', 'bizType', profile.bizType),
      field('종목', 'bizClass', profile.bizClass),
      field('담당자', 'contactName', profile.contactName),
      field('전화', 'tel', profile.tel),
      field('이메일', 'email', profile.email, { type: 'email', wide: true })
    );
    shell.body.append(grid);
    const save = make('button', 'primary', '공급자 정보 저장');
    save.type = 'submit';
    shell.footer.append(save);
    shell.form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!shell.form.checkValidity()) return shell.form.reportValidity();
      save.disabled = true;
      save.textContent = '저장 중…';
      try {
        const data = Object.fromEntries(new FormData(shell.form));
        await request('/api/finance/tax-profile', {
          method: 'PUT', body: JSON.stringify({ organizationId: ORGANIZATION_ID, ...data })
        });
        shell.dialog.close();
        await loadAll(true);
      } catch (error) {
        alert(error.message);
      } finally {
        save.disabled = false;
        save.textContent = '공급자 정보 저장';
      }
    });
    shell.dialog.showModal();
  }

  function selectField(labelText, name, options, selected = '') {
    const label = make('label', 'tax-field');
    label.append(make('span', '', labelText));
    const select = make('select');
    select.name = name;
    for (const [value, text] of options) {
      const option = make('option', '', text);
      option.value = value;
      option.selected = value === selected;
      select.append(option);
    }
    label.append(select);
    return label;
  }

  function customerFields(container, customer = {}) {
    container.replaceChildren();
    container.append(
      field('사업자번호', 'corpNum', customer.corpNum, { required: true, placeholder: '숫자 10자리' }),
      field('상호', 'corpName', customer.corpName, { required: true }),
      field('대표자', 'ceoName', customer.ceoName, { required: true }),
      field('담당자', 'contactName', customer.contactName),
      field('이메일', 'email', customer.email, { type: 'email' }),
      field('전화', 'tel', customer.tel),
      field('주소', 'addr', customer.addr, { wide: true }),
      field('업태', 'bizType', customer.bizType),
      field('종목', 'bizClass', customer.bizClass)
    );
  }

  function itemRow(onChange, defaults = {}) {
    const row = make('div', 'tax-item-row');
    const name = make('input'); name.placeholder = '품목명'; name.dataset.key = 'itemName'; name.required = true; name.value = defaults.itemName || '';
    const spec = make('input'); spec.placeholder = '규격'; spec.dataset.key = 'spec'; spec.value = defaults.spec || '';
    const qty = make('input'); qty.placeholder = '수량'; qty.dataset.key = 'qty'; qty.inputMode = 'decimal'; qty.value = defaults.qty || '1';
    const supply = make('input'); supply.placeholder = '공급가액'; supply.dataset.key = 'supplyCost'; supply.type = 'number'; supply.min = '0'; supply.step = '1'; supply.required = true; supply.value = defaults.supplyCost || '';
    const tax = make('input'); tax.placeholder = '세액'; tax.dataset.key = 'tax'; tax.type = 'number'; tax.min = '0'; tax.step = '1'; tax.value = defaults.tax || '';
    const remove = make('button', 'ghost compact', '삭제'); remove.type = 'button';
    remove.addEventListener('click', () => { if (row.parentElement?.children.length > 1) { row.remove(); onChange(); } });
    for (const input of [name, spec, qty, supply, tax]) input.addEventListener('input', onChange);
    row.append(name, spec, qty, supply, tax, remove);
    return row;
  }

  function readItem(row, taxType) {
    const get = key => row.querySelector(`[data-key="${key}"]`)?.value || '';
    const supplyCost = Math.max(0, Math.trunc(Number(get('supplyCost')) || 0));
    let tax = Math.max(0, Math.trunc(Number(get('tax')) || 0));
    if (taxType !== '과세') tax = 0;
    else if (get('tax') === '') tax = Math.floor(supplyCost * 0.1);
    return {
      itemName: get('itemName').trim(), spec: get('spec').trim(), qty: get('qty').trim() || '1',
      unitCost: String(supplyCost), supplyCost, tax
    };
  }

  async function openDraftDialog() {
    if (!customers.length) {
      try {
        const result = await request(`/api/finance/tax-customers?organizationId=${ORGANIZATION_ID}&limit=100`);
        customers = result.customers || [];
      } catch {}
    }
    const shell = dialogShell('새 세금계산서 초안', '저장만으로는 발행되지 않습니다. 저장 후 별도의 관리자 승인이 필요합니다.');
    const base = make('div', 'tax-form-grid');
    const writeDate = field('작성일', 'writeDate', todayKorea(), { required: true });
    const purpose = selectField('영수/청구', 'purposeType', [['청구', '청구'], ['영수', '영수']], '청구');
    const taxType = selectField('과세구분', 'taxType', [['과세', '과세'], ['영세', '영세'], ['면세', '면세']], '과세');
    const documentNo = field('문서번호', 'documentNo', '', { placeholder: '비워두면 자동 생성' });
    base.append(writeDate, purpose, taxType, documentNo);

    const customerHead = make('div', 'tax-subhead');
    customerHead.append(make('strong', '', '공급받는자'));
    const saved = make('select', 'tax-customer-select');
    saved.append(Object.assign(document.createElement('option'), { value: '', textContent: '새 거래처 직접 입력' }));
    customers.forEach(customer => {
      const option = make('option', '', `${customer.corpName} · ${customer.corpNum}`);
      option.value = String(customer.id);
      saved.append(option);
    });
    customerHead.append(saved);
    const customerGrid = make('div', 'tax-form-grid');
    customerFields(customerGrid);
    saved.addEventListener('change', () => {
      const customer = customers.find(item => String(item.id) === saved.value) || {};
      customerFields(customerGrid, customer);
    });

    const itemHead = make('div', 'tax-subhead');
    itemHead.append(make('strong', '', '품목'));
    const addItem = make('button', 'ghost compact', '＋ 품목 추가'); addItem.type = 'button';
    itemHead.append(addItem);
    const itemList = make('div', 'tax-item-list');
    const totals = make('div', 'tax-totals');

    const recalc = () => {
      const type = taxType.querySelector('select').value;
      let supply = 0; let tax = 0;
      itemList.querySelectorAll('.tax-item-row').forEach(row => {
        const item = readItem(row, type); supply += item.supplyCost; tax += item.tax;
        const taxInput = row.querySelector('[data-key="tax"]');
        if (taxInput) {
          if (type !== '과세') { taxInput.value = '0'; taxInput.disabled = true; }
          else { taxInput.disabled = false; if (!taxInput.matches(':focus')) taxInput.placeholder = String(Math.floor(item.supplyCost * 0.1)); }
        }
      });
      totals.textContent = `공급가액 ${won(supply)} · 세액 ${won(tax)} · 합계 ${won(supply + tax)}`;
    };
    itemList.append(itemRow(recalc));
    addItem.addEventListener('click', () => { itemList.append(itemRow(recalc)); recalc(); });
    taxType.querySelector('select').addEventListener('change', recalc);

    const memo = field('메모', 'memo', '', { wide: true });
    shell.body.append(base, customerHead, customerGrid, itemHead, itemList, totals, memo);
    recalc();

    const save = make('button', 'primary', '초안 저장'); save.type = 'submit';
    shell.footer.append(make('span', 'tax-safety-copy', '저장 후에도 발행 전 관리자 승인이 필요합니다.'), save);
    shell.form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!shell.form.checkValidity()) return shell.form.reportValidity();
      const data = new FormData(shell.form);
      const type = String(data.get('taxType'));
      const items = Array.from(itemList.querySelectorAll('.tax-item-row')).map(row => readItem(row, type));
      if (items.some(item => !item.itemName)) return alert('모든 품목명을 입력해 주세요.');
      const invoicee = Object.fromEntries(['corpNum','corpName','ceoName','contactName','email','tel','addr','bizType','bizClass'].map(key => [key, String(data.get(key) || '')]));
      save.disabled = true;
      save.textContent = '초안 저장 중…';
      try {
        await request('/api/finance/tax-invoices', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: ORGANIZATION_ID, businessUnitId: DEFAULT_UNIT,
            writeDate: String(data.get('writeDate')).replaceAll('-', ''),
            documentNo: String(data.get('documentNo') || '').trim(),
            purposeType: String(data.get('purposeType')), taxType: type,
            invoicee, items, memo: String(data.get('memo') || '')
          })
        });
        shell.dialog.close();
        await loadAll(true);
      } catch (error) {
        alert(error.message);
      } finally {
        save.disabled = false;
        save.textContent = '초안 저장';
      }
    });
    shell.dialog.showModal();
  }

  async function approve(invoice) {
    const ok = confirm(`${invoice.invoicee?.corpName || '거래처'} · ${won(invoice.totalAmount)} 세금계산서를 승인하시겠습니까?\n\n승인은 실제 발행 직전의 사람 검토 단계이며, 아직 외부 발행은 하지 않습니다.`);
    if (!ok) return;
    try {
      await request(`/api/finance/tax-invoices/${invoice.id}/approve`, { method: 'POST' });
      await loadAll(true);
    } catch (error) { alert(error.message); }
  }

  async function issue(invoice) {
    const sandbox = readiness?.environment !== 'production';
    const environmentText = sandbox ? 'Sandbox 테스트 발행' : '운영 전자세금계산서 실제 발행';
    const ok = confirm(`${environmentText}\n${invoice.invoicee?.corpName || '거래처'} · ${won(invoice.totalAmount)}\n\n계속하시겠습니까?`);
    if (!ok) return;
    try {
      await request(`/api/finance/tax-invoices/${invoice.id}/issue`, { method: 'POST' });
      await loadAll(true);
    } catch (error) { alert(error.message); await loadAll(true); }
  }

  async function sync(invoice) {
    try {
      await request(`/api/finance/tax-invoices/${invoice.id}/sync`, { method: 'POST' });
      await loadAll(true);
    } catch (error) { alert(error.message); }
  }

  async function openDetailDialog(id) {
    try {
      const { invoice } = await request(`/api/finance/tax-invoices/${id}`);
      const shell = dialogShell(`세금계산서 ${invoice.documentNo}`, '발행 흐름과 국세청 전송 상태를 함께 확인합니다.');
      const summary = make('div', 'tax-detail-grid');
      const entries = [
        ['작성일', formatDate(invoice.writeDate)], ['상태', statusLabel(invoice.status)],
        ['공급받는자', invoice.invoicee?.corpName || '—'], ['사업자번호', invoice.invoicee?.corpNum || '—'],
        ['공급가액', won(invoice.supplyAmount)], ['세액', won(invoice.taxAmount)], ['합계', won(invoice.totalAmount)],
        ['국세청 승인번호', invoice.ntsConfirmNum || '—']
      ];
      entries.forEach(([label, value]) => {
        const box = make('div'); box.append(make('small', '', label), make('strong', '', value)); summary.append(box);
      });
      shell.body.append(summary);
      if (invoice.lastError) shell.body.append(make('p', 'tax-error-detail', invoice.lastError));
      const itemsTitle = make('h4', '', '품목'); shell.body.append(itemsTitle);
      const itemWrap = make('div', 'tax-detail-items');
      (invoice.items || []).forEach(item => itemWrap.append(make('div', '', `${item.itemName} · 공급가액 ${won(item.supplyCost)} · 세액 ${won(item.tax)}`)));
      shell.body.append(itemWrap);
      if (Array.isArray(invoice.events) && invoice.events.length) {
        shell.body.append(make('h4', '', '처리 기록'));
        const timeline = make('div', 'tax-timeline');
        invoice.events.forEach(item => {
          const row = make('div');
          row.append(make('strong', '', item.action), make('span', '', `${item.fromStatus || '시작'} → ${item.toStatus || '—'}`), make('small', '', new Date(item.createdAt).toLocaleString('ko-KR')));
          timeline.append(row);
        });
        shell.body.append(timeline);
      }
      shell.dialog.showModal();
    } catch (error) { alert(error.message); }
  }

  function start() {
    if (!ensureUI()) return;
    loadAll(false);
  }

  start();
  window.addEventListener('ekodi-finance-overview', () => loadAll(false));
})();
