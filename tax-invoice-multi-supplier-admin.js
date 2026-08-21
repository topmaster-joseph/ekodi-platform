(() => {
  'use strict';

  const API = 'https://finance-api.ekodi.kr';
  const ORGANIZATION_ID = 'EKODIBIZ';
  const DEFAULT_UNIT = 'BIZ';
  let readiness = null;
  let profiles = [];
  let customers = [];
  let invoices = [];
  let supplierFilter = '';
  let loading = false;

  const token = () => { try { return sessionStorage.getItem('ekodi-auth-token') || ''; } catch { return ''; } };
  const won = value => `₩${Math.round(Number(value) || 0).toLocaleString('ko-KR')}`;
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()).replaceAll('-', '');
  const formatDate = value => /^\d{8}$/.test(String(value || '')) ? `${String(value).slice(0,4)}-${String(value).slice(4,6)}-${String(value).slice(6,8)}` : '—';
  const statusLabel = status => ({ DRAFT:'초안', APPROVED:'승인됨', ISSUING:'발행 중', ISSUED:'발행됨', NTS_CONFIRMED:'국세청 전송완료', FAILED:'확인 필요', CANCELED:'취소' })[status] || status || '—';

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache:'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `세금계산서 API 요청 실패 (${response.status})`);
    return data;
  }

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== '') node.textContent = text;
    return node;
  }

  function button(label, className = 'secondary compact') {
    const node = el('button', className, label);
    node.type = 'button';
    return node;
  }

  function financeSection() {
    return document.querySelector('#financeTitle')?.closest('section') || null;
  }

  function notice(text, good = false) {
    const node = document.querySelector('#taxInvoiceNotice');
    if (!node) return;
    node.textContent = text;
    node.className = `tax-invoice-notice${good ? ' good' : ''}`;
  }

  function ensureUI() {
    if (document.querySelector('#taxInvoiceWorkspace')) return true;
    const section = financeSection();
    if (!section) return false;
    const workspace = el('section', 'tax-invoice-workspace tax-multi-supplier');
    workspace.id = 'taxInvoiceWorkspace';
    workspace.innerHTML = `
      <div class="tax-invoice-head">
        <div><p class="kicker">ELECTRONIC TAX INVOICE · FREE-FIRST</p><h3 id="taxInvoiceTitle">전자세금계산서</h3><p class="operations-copy">공급자를 선택해 작성하고, 홈택스 무료 발행 후 결과를 공급자별 원장에 기록합니다.</p></div>
        <div class="tax-invoice-actions"><button type="button" class="secondary" id="taxSupplierManage">공급자 관리</button><button type="button" class="primary" id="taxDraftButton">＋ 새 세금계산서</button></div>
      </div>
      <div class="tax-invoice-status" aria-label="전자세금계산서 상태">
        <article><small>기본 발행</small><strong id="taxChannel">홈택스</strong><span id="taxPolicy">무료 기본</span></article>
        <article><small>등록 공급자</small><strong id="taxSupplierCount">0</strong><span id="taxDefaultSupplier">기본 공급자 확인 중</span></article>
        <article><small>이번 달 발행</small><strong id="taxMonthAmount">₩0</strong><span id="taxMonthCount">0건</span></article>
        <article><small>확인 필요</small><strong id="taxAttentionCount">0</strong><span>실패 · 처리중</span></article>
      </div>
      <div class="tax-invoice-notice" id="taxInvoiceNotice">세금계산서 준비상태를 확인하고 있습니다.</div>
      <div class="tax-supplier-toolbar">
        <label><span>공급자별 발행내역</span><select id="taxSupplierFilter" aria-label="공급자별 세금계산서 필터"><option value="">전체 공급자</option></select></label>
        <div><strong id="taxFilteredSummary">전체 공급자</strong><small id="taxFilteredAmount">최근 대장 합계 ₩0</small></div>
        <button type="button" class="ghost compact" id="taxInvoiceRefresh">↻ 새로고침</button>
      </div>
      <div class="finance-table-wrap"><table class="finance-table tax-invoice-table">
        <thead><tr><th>작성일</th><th>공급자</th><th>문서번호</th><th>공급받는자</th><th>상태</th><th class="right">공급가액</th><th class="right">세액</th><th class="right">합계</th><th>처리</th></tr></thead>
        <tbody id="taxInvoiceRows"><tr><td colspan="9" class="finance-empty">세금계산서 대장을 불러오는 중입니다.</td></tr></tbody>
      </table></div>`;
    const marker = section.querySelector('#financeNotice');
    if (marker) marker.insertAdjacentElement('afterend', workspace); else section.append(workspace);
    document.querySelector('#taxSupplierManage')?.addEventListener('click', openSupplierManager);
    document.querySelector('#taxDraftButton')?.addEventListener('click', openDraftDialog);
    document.querySelector('#taxInvoiceRefresh')?.addEventListener('click', () => loadAll(true));
    document.querySelector('#taxSupplierFilter')?.addEventListener('change', event => {
      supplierFilter = event.target.value || '';
      loadInvoices(true);
    });
    return true;
  }

  function renderProfiles() {
    const select = document.querySelector('#taxSupplierFilter');
    if (!select) return;
    const current = supplierFilter;
    select.replaceChildren(Object.assign(document.createElement('option'), { value:'', textContent:'전체 공급자' }));
    for (const profile of profiles) {
      const option = document.createElement('option');
      option.value = String(profile.id);
      option.textContent = `${profile.profileName}${profile.isDefault ? ' · 기본' : ''}`;
      select.append(option);
    }
    if (current && profiles.some(profile => String(profile.id) === current)) select.value = current;
    else { select.value = ''; supplierFilter = ''; }
  }

  function renderReadiness(data) {
    readiness = data;
    document.querySelector('#taxChannel').textContent = data.defaultChannel === 'HOMETAX_MANUAL' ? '홈택스' : (data.provider || '홈택스');
    document.querySelector('#taxPolicy').textContent = data.automationEnabled ? '무료 기본 · 자동화 선택가능' : '무료 기본';
    document.querySelector('#taxSupplierCount').textContent = String(profiles.length || data.supplierProfilesCount || 0);
    const preferred = profiles.find(profile => profile.isDefault) || profiles[0];
    document.querySelector('#taxDefaultSupplier').textContent = preferred ? `기본 · ${preferred.profileName}` : '공급자 등록 필요';
    document.querySelector('#taxMonthAmount').textContent = won(data.monthAmount);
    const counts = data.counts || {};
    const issued = Number(counts.ISSUED || 0) + Number(counts.NTS_CONFIRMED || 0);
    document.querySelector('#taxMonthCount').textContent = `${issued}건`;
    document.querySelector('#taxAttentionCount').textContent = String(Number(counts.FAILED || 0) + Number(counts.ISSUING || 0));
    if (!profiles.length) notice('공급자 정보를 먼저 등록해 주세요. 공급자별로 사업자 정보를 저장한 뒤 발행할 수 있습니다.');
    else if (!data.profileComplete) notice('기본 공급자의 사업자번호·상호·대표자 정보를 확인해 주세요.');
    else if (data.automationEnabled) notice('홈택스 무료 발행이 기본입니다. 유료 API 자동발행은 명시적으로 활성화된 경우에만 선택할 수 있습니다.', true);
    else notice('FREE-FIRST 운영 중입니다. 홈택스에서 무료 발행하고 승인번호를 에코디 원장에 기록합니다.', true);
  }

  function supplierName(invoice) {
    return invoice.invoicer?.profileName || invoice.invoicer?.corpName || '공급자 미지정';
  }

  function renderInvoices(list) {
    invoices = Array.isArray(list) ? list : [];
    const tbody = document.querySelector('#taxInvoiceRows');
    if (!tbody) return;
    tbody.textContent = '';
    if (!invoices.length) {
      const row = el('tr');
      const cell = el('td', 'finance-empty', supplierFilter ? '선택한 공급자의 세금계산서가 없습니다.' : '아직 작성된 세금계산서가 없습니다.');
      cell.colSpan = 9; row.append(cell); tbody.append(row);
    } else {
      for (const invoice of invoices) {
        const row = el('tr');
        [formatDate(invoice.writeDate), supplierName(invoice), invoice.documentNo, invoice.invoicee?.corpName || invoice.invoicee?.corpNum || '—'].forEach(value => row.append(el('td', '', value)));
        const status = el('td'); status.append(el('span', `tax-status ${String(invoice.status || '').toLowerCase()}`, statusLabel(invoice.status))); row.append(status);
        [invoice.supplyAmount, invoice.taxAmount, invoice.totalAmount].forEach(value => row.append(el('td', 'right', won(value))));
        const actions = el('td', 'tax-row-actions'); actions.append(...invoiceActions(invoice)); row.append(actions); tbody.append(row);
      }
    }
    const amount = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
    const selected = profiles.find(profile => String(profile.id) === supplierFilter);
    document.querySelector('#taxFilteredSummary').textContent = selected ? selected.profileName : '전체 공급자';
    document.querySelector('#taxFilteredAmount').textContent = `최근 대장 ${invoices.length}건 · 합계 ${won(amount)}`;
  }

  function action(label, handler, className = 'ghost compact', disabled = false) {
    const node = button(label, className); node.disabled = disabled; node.addEventListener('click', handler); return node;
  }

  function invoiceActions(invoice) {
    const result = [action('보기', () => openDetail(invoice.id))];
    if (invoice.status === 'DRAFT') result.push(action('승인', () => approve(invoice), 'secondary compact'));
    if (invoice.status === 'APPROVED') {
      result.push(action('정보 복사', () => copyInvoice(invoice.id), 'secondary compact'));
      result.push(action('홈택스', () => openHometax(), 'secondary compact'));
      result.push(action('발행완료 기록', () => recordManual(invoice), 'primary compact'));
      if (readiness?.automationEnabled) result.push(action('API 발행', () => issue(invoice), 'ghost compact'));
    }
    if (['ISSUING','ISSUED','FAILED'].includes(invoice.status) && invoice.provider !== 'HOMETAX_MANUAL') result.push(action('상태 확인', () => sync(invoice), 'secondary compact'));
    return result;
  }

  async function loadInvoices(force = false) {
    const query = new URLSearchParams({ organizationId:ORGANIZATION_ID, limit:'100' });
    if (supplierFilter) query.set('supplierProfileId', supplierFilter);
    if (force) query.set('_', String(Date.now()));
    try {
      const data = await request(`/api/finance/tax-invoices?${query}`);
      renderInvoices(data.invoices || []);
    } catch (error) { notice(`세금계산서 대장을 불러오지 못했습니다: ${error.message}`); }
  }

  async function loadAll(force = false) {
    if (!token() || loading || !ensureUI()) return;
    loading = true;
    const refresh = document.querySelector('#taxInvoiceRefresh');
    if (refresh) { refresh.disabled = true; refresh.textContent = '↻ 확인 중…'; }
    try {
      const [ready, supplierData, customerData] = await Promise.all([
        request(`/api/finance/tax-invoices/readiness?organizationId=${ORGANIZATION_ID}${force ? `&_=${Date.now()}` : ''}`),
        request(`/api/finance/tax-profiles?organizationId=${ORGANIZATION_ID}`),
        request(`/api/finance/tax-customers?organizationId=${ORGANIZATION_ID}&limit=100`)
      ]);
      profiles = supplierData.profiles || [];
      customers = customerData.customers || [];
      renderProfiles();
      renderReadiness(ready);
      await loadInvoices(force);
    } catch (error) {
      notice(`전자세금계산서 연결을 확인해 주세요: ${error.message}`);
      const tbody = document.querySelector('#taxInvoiceRows');
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="finance-empty">세금계산서 데이터를 불러오지 못했습니다.</td></tr>';
    } finally {
      loading = false;
      if (refresh) { refresh.disabled = false; refresh.textContent = '↻ 새로고침'; }
    }
  }

  function dialog(title, description = '') {
    const node = el('dialog', 'tax-dialog');
    const form = el('form', 'tax-dialog-card'); form.method = 'dialog';
    const head = el('div', 'tax-dialog-head');
    const copy = el('div'); copy.append(el('h3', '', title)); if (description) copy.append(el('p', '', description));
    const close = button('닫기', 'ghost compact'); close.addEventListener('click', () => node.close()); head.append(copy, close);
    const body = el('div', 'tax-dialog-body'); const footer = el('div', 'tax-dialog-footer');
    form.append(head, body, footer); node.append(form); document.body.append(node);
    node.addEventListener('close', () => node.remove(), { once:true });
    node.addEventListener('click', event => { if (event.target === node) node.close(); });
    return { node, form, body, footer };
  }

  function field(labelText, name, value = '', options = {}) {
    const label = el('label', options.wide ? 'tax-field wide' : 'tax-field'); label.append(el('span', '', labelText));
    const input = document.createElement(options.multiline ? 'textarea' : 'input'); input.name = name; input.value = value || '';
    if (options.type) input.type = options.type; if (options.placeholder) input.placeholder = options.placeholder; if (options.required) input.required = true;
    label.append(input); return label;
  }

  function selectField(labelText, name, options, selected = '') {
    const label = el('label', 'tax-field'); label.append(el('span', '', labelText)); const select = document.createElement('select'); select.name = name;
    for (const [value, textValue] of options) { const option = document.createElement('option'); option.value = value; option.textContent = textValue; option.selected = String(value) === String(selected); select.append(option); }
    label.append(select); return label;
  }

  function supplierCard(profile) {
    const card = el('article', 'tax-supplier-card');
    const head = el('div', 'tax-supplier-card-head');
    const identity = el('div'); identity.append(el('strong', '', profile.profileName), el('small', '', `${profile.corpName} · ${profile.corpNum}${profile.taxRegId ? ` · 종사업장 ${profile.taxRegId}` : ''}`));
    if (profile.isDefault) identity.append(el('span', 'tax-default-badge', '기본 공급자'));
    const actions = el('div', 'tax-row-actions');
    actions.append(action('수정', () => openSupplierEditor(profile)));
    if (!profile.isDefault) actions.append(action('기본 지정', () => setDefaultSupplier(profile), 'secondary compact'));
    if (profiles.length > 1) actions.append(action('보관', () => archiveSupplier(profile), 'ghost compact'));
    head.append(identity, actions); card.append(head);
    card.append(el('p', 'tax-supplier-meta', `${profile.ceoName} · ${profile.bizType || '업태 미입력'} · ${profile.bizClass || '종목 미입력'}${profile.email ? ` · ${profile.email}` : ''}`));
    return card;
  }

  async function openSupplierManager() {
    try { profiles = (await request(`/api/finance/tax-profiles?organizationId=${ORGANIZATION_ID}`)).profiles || []; } catch (error) { return alert(error.message); }
    const shell = dialog('공급자 관리', '여러 사업자 또는 종사업장을 등록하고 세금계산서마다 공급자를 선택합니다.');
    const toolbar = el('div', 'tax-supplier-manager-head'); toolbar.append(el('span', '', `등록 ${profiles.length}개`)); const add = button('＋ 공급자 추가', 'primary compact'); toolbar.append(add); shell.body.append(toolbar);
    const list = el('div', 'tax-supplier-list'); profiles.forEach(profile => list.append(supplierCard(profile))); if (!profiles.length) list.append(el('p', 'finance-empty', '등록된 공급자가 없습니다.'));
    shell.body.append(list); add.addEventListener('click', () => { shell.node.close(); openSupplierEditor(null); }); shell.node.showModal();
  }

  function openSupplierEditor(profile) {
    const editing = Boolean(profile?.id);
    const shell = dialog(editing ? '공급자 정보 수정' : '공급자 추가', '사업자등록증 기준의 법적 정보를 입력합니다.');
    const grid = el('div', 'tax-form-grid');
    grid.append(
      field('구분명', 'profileName', profile?.profileName || profile?.corpName || '', { required:true, placeholder:'예: 에코디비즈 본점' }),
      field('사업자번호', 'corpNum', profile?.corpNum || '', { required:true, placeholder:'숫자 10자리' }),
      field('종사업장번호', 'taxRegId', profile?.taxRegId || '', { placeholder:'해당 시 4자리' }),
      field('상호', 'corpName', profile?.corpName || '', { required:true }),
      field('대표자', 'ceoName', profile?.ceoName || '', { required:true }),
      field('사업장 주소', 'addr', profile?.addr || '', { wide:true }),
      field('업태', 'bizType', profile?.bizType || ''), field('종목', 'bizClass', profile?.bizClass || ''),
      field('담당자', 'contactName', profile?.contactName || ''), field('전화', 'tel', profile?.tel || ''), field('이메일', 'email', profile?.email || '', { type:'email', wide:true })
    );
    shell.body.append(grid);
    const defaultLabel = el('label', 'tax-check-field'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = 'isDefault'; checkbox.checked = Boolean(profile?.isDefault) || !profiles.length; defaultLabel.append(checkbox, document.createTextNode(' 기본 공급자로 사용')); shell.body.append(defaultLabel);
    const save = button(editing ? '수정 저장' : '공급자 등록', 'primary'); save.type = 'submit'; shell.footer.append(save);
    shell.form.addEventListener('submit', async event => {
      event.preventDefault(); if (!shell.form.checkValidity()) return shell.form.reportValidity();
      save.disabled = true; save.textContent = '저장 중…';
      try {
        const data = Object.fromEntries(new FormData(shell.form)); data.organizationId = ORGANIZATION_ID; data.isDefault = checkbox.checked;
        await request(editing ? `/api/finance/tax-profiles/${profile.id}` : '/api/finance/tax-profiles', { method:editing ? 'PUT' : 'POST', body:JSON.stringify(data) });
        shell.node.close(); await loadAll(true); openSupplierManager();
      } catch (error) { alert(error.message); } finally { save.disabled = false; save.textContent = editing ? '수정 저장' : '공급자 등록'; }
    });
    shell.node.showModal();
  }

  async function setDefaultSupplier(profile) {
    if (!confirm(`${profile.profileName}을 기본 공급자로 지정하시겠습니까?`)) return;
    try { await request(`/api/finance/tax-profiles/${profile.id}/default`, { method:'POST', body:JSON.stringify({ organizationId:ORGANIZATION_ID }) }); await loadAll(true); } catch (error) { alert(error.message); }
  }

  async function archiveSupplier(profile) {
    if (!confirm(`${profile.profileName}을 공급자 선택목록에서 보관 처리하시겠습니까?\n과거 발행내역은 유지됩니다.`)) return;
    try { await request(`/api/finance/tax-profiles/${profile.id}`, { method:'DELETE', body:JSON.stringify({ organizationId:ORGANIZATION_ID }) }); await loadAll(true); } catch (error) { alert(error.message); }
  }

  function customerFields(container, customer = {}) {
    container.replaceChildren(
      field('사업자번호', 'corpNum', customer.corpNum, { required:true, placeholder:'숫자 10자리' }), field('상호', 'corpName', customer.corpName, { required:true }),
      field('대표자', 'ceoName', customer.ceoName, { required:true }), field('담당자', 'contactName', customer.contactName), field('이메일', 'email', customer.email, { type:'email' }),
      field('전화', 'tel', customer.tel), field('주소', 'addr', customer.addr, { wide:true }), field('업태', 'bizType', customer.bizType), field('종목', 'bizClass', customer.bizClass)
    );
  }

  function itemRow(onChange) {
    const row = el('div', 'tax-item-row');
    const make = (key, placeholder, type = 'text') => { const input = document.createElement('input'); input.dataset.key = key; input.placeholder = placeholder; input.type = type; input.addEventListener('input', onChange); return input; };
    const name = make('itemName','품목명'); name.required = true; const spec = make('spec','규격'); const qty = make('qty','수량'); qty.value = '1';
    const supply = make('supplyCost','공급가액','number'); supply.min='0'; supply.required=true; const tax = make('tax','세액','number'); tax.min='0';
    const remove = button('삭제','ghost compact'); remove.addEventListener('click', () => { if (row.parentElement?.children.length > 1) { row.remove(); onChange(); } });
    row.append(name,spec,qty,supply,tax,remove); return row;
  }

  function readItem(row, taxType) {
    const get = key => row.querySelector(`[data-key="${key}"]`)?.value || '';
    const supplyCost = Math.max(0, Math.trunc(Number(get('supplyCost')) || 0)); let tax = Math.max(0, Math.trunc(Number(get('tax')) || 0));
    if (taxType !== '과세') tax = 0; else if (get('tax') === '') tax = Math.floor(supplyCost * .1);
    return { itemName:get('itemName').trim(), spec:get('spec').trim(), qty:get('qty').trim() || '1', unitCost:String(supplyCost), supplyCost, tax };
  }

  async function openDraftDialog() {
    if (!profiles.length) { alert('공급자 정보를 먼저 등록해 주세요.'); return openSupplierManager(); }
    const shell = dialog('새 세금계산서', '공급자를 먼저 선택합니다. 저장만으로는 발행되지 않으며 승인 후 홈택스에서 무료 발행합니다.');
    const defaultProfile = profiles.find(profile => profile.isDefault) || profiles[0];
    const base = el('div', 'tax-form-grid');
    const supplier = selectField('공급자', 'supplierProfileId', profiles.map(profile => [String(profile.id), `${profile.profileName} · ${profile.corpName}`]), String(defaultProfile.id)); supplier.classList.add('wide');
    const writeDate = field('작성일', 'writeDate', today(), { required:true }); const purpose = selectField('영수/청구','purposeType',[['청구','청구'],['영수','영수']],'청구'); const taxType = selectField('과세구분','taxType',[['과세','과세'],['영세','영세'],['면세','면세']],'과세'); const documentNo = field('문서번호','documentNo','',{ placeholder:'비워두면 자동 생성' });
    base.append(supplier, writeDate, purpose, taxType, documentNo);
    const customerHead = el('div','tax-subhead'); customerHead.append(el('strong','','공급받는자')); const saved = document.createElement('select'); saved.className='tax-customer-select'; saved.append(Object.assign(document.createElement('option'),{value:'',textContent:'새 거래처 직접 입력'}));
    customers.forEach(customer => { const option=document.createElement('option'); option.value=String(customer.id); option.textContent=`${customer.corpName} · ${customer.corpNum}`; saved.append(option); }); customerHead.append(saved);
    const customerGrid = el('div','tax-form-grid'); customerFields(customerGrid); saved.addEventListener('change',()=>customerFields(customerGrid,customers.find(item=>String(item.id)===saved.value)||{}));
    const itemHead=el('div','tax-subhead'); itemHead.append(el('strong','','품목')); const add=button('＋ 품목 추가','ghost compact'); itemHead.append(add); const itemList=el('div','tax-item-list'); const totals=el('div','tax-totals');
    const recalc=()=>{const type=taxType.querySelector('select').value;let supplyTotal=0,taxTotal=0;itemList.querySelectorAll('.tax-item-row').forEach(row=>{const item=readItem(row,type);supplyTotal+=item.supplyCost;taxTotal+=item.tax;const input=row.querySelector('[data-key="tax"]');if(input){input.disabled=type!=='과세';if(type!=='과세')input.value='0';else if(!input.matches(':focus'))input.placeholder=String(Math.floor(item.supplyCost*.1));}});totals.textContent=`공급가액 ${won(supplyTotal)} · 세액 ${won(taxTotal)} · 합계 ${won(supplyTotal+taxTotal)}`;};
    itemList.append(itemRow(recalc)); add.addEventListener('click',()=>{itemList.append(itemRow(recalc));recalc();}); taxType.querySelector('select').addEventListener('change',recalc); const memo=field('메모','memo','',{wide:true}); shell.body.append(base,customerHead,customerGrid,itemHead,itemList,totals,memo); recalc();
    const save=button('초안 저장','primary'); save.type='submit'; shell.footer.append(el('span','tax-safety-copy','선택한 공급자 정보가 이 세금계산서에 스냅샷으로 보존됩니다.'),save);
    shell.form.addEventListener('submit',async event=>{event.preventDefault();if(!shell.form.checkValidity())return shell.form.reportValidity();const data=new FormData(shell.form),type=String(data.get('taxType'));const items=[...itemList.querySelectorAll('.tax-item-row')].map(row=>readItem(row,type));if(items.some(item=>!item.itemName))return alert('모든 품목명을 입력해 주세요.');const invoicee=Object.fromEntries(['corpNum','corpName','ceoName','contactName','email','tel','addr','bizType','bizClass'].map(key=>[key,String(data.get(key)||'')]));save.disabled=true;save.textContent='저장 중…';try{await request('/api/finance/tax-invoices',{method:'POST',body:JSON.stringify({organizationId:ORGANIZATION_ID,businessUnitId:DEFAULT_UNIT,supplierProfileId:Number(data.get('supplierProfileId')),writeDate:String(data.get('writeDate')).replaceAll('-',''),documentNo:String(data.get('documentNo')||'').trim(),purposeType:String(data.get('purposeType')),taxType:type,invoicee,items,memo:String(data.get('memo')||'')})});shell.node.close();await loadAll(true);}catch(error){alert(error.message);}finally{save.disabled=false;save.textContent='초안 저장';}}); shell.node.showModal();
  }

  async function approve(invoice) {
    if (!confirm(`${supplierName(invoice)} → ${invoice.invoicee?.corpName || '거래처'}\n${won(invoice.totalAmount)} 세금계산서를 승인하시겠습니까?`)) return;
    try { await request(`/api/finance/tax-invoices/${invoice.id}/approve`, { method:'POST' }); await loadAll(true); } catch (error) { alert(error.message); }
  }

  function openHometax() { window.open(readiness?.hometaxUrl || 'https://www.hometax.go.kr', '_blank', 'noopener'); }

  async function copyInvoice(id) {
    try {
      const { invoice } = await request(`/api/finance/tax-invoices/${id}`);
      const lines = [`[전자세금계산서 입력정보]`,`공급자: ${supplierName(invoice)} / ${invoice.invoicer?.corpName || ''} / ${invoice.invoicer?.corpNum || ''}`,`공급받는자: ${invoice.invoicee?.corpName || ''} / ${invoice.invoicee?.corpNum || ''}`,`작성일: ${formatDate(invoice.writeDate)}`,`영수/청구: ${invoice.purposeType}`,`과세구분: ${invoice.taxType}`,`공급가액: ${won(invoice.supplyAmount)}`,`세액: ${won(invoice.taxAmount)}`,`합계: ${won(invoice.totalAmount)}`,'품목:',...(invoice.items||[]).map(item=>`- ${item.itemName} / 공급가액 ${won(item.supplyCost)} / 세액 ${won(item.tax)}`)];
      await navigator.clipboard.writeText(lines.join('\n')); notice(`${invoice.documentNo} 정보를 복사했습니다. 홈택스에 붙여넣어 확인해 주세요.`, true);
    } catch (error) { alert(error.message); }
  }

  async function recordManual(invoice) {
    const confirmNum = prompt('홈택스 발행 후 국세청 승인번호를 입력하세요.\n아직 승인번호를 기록하지 않으려면 비워둘 수 있습니다.', invoice.ntsConfirmNum || '');
    if (confirmNum === null) return;
    if (!confirm(`${supplierName(invoice)} 세금계산서를 홈택스 발행완료로 기록하시겠습니까?`)) return;
    try { await request(`/api/finance/tax-invoices/${invoice.id}/manual-issued`, { method:'POST', body:JSON.stringify({ ntsConfirmNum:confirmNum.trim() }) }); await loadAll(true); } catch (error) { alert(error.message); }
  }

  async function issue(invoice) {
    if (!readiness?.automationEnabled) return alert('유료 API 자동발행이 비활성화되어 있습니다. 홈택스 무료 발행을 사용하세요.');
    if (!confirm(`${supplierName(invoice)} 세금계산서를 API로 발행하시겠습니까?\n유료 자동화가 활성화된 경우에만 실행됩니다.`)) return;
    try { await request(`/api/finance/tax-invoices/${invoice.id}/issue`, { method:'POST' }); await loadAll(true); } catch (error) { alert(error.message); await loadAll(true); }
  }

  async function sync(invoice) { try { await request(`/api/finance/tax-invoices/${invoice.id}/sync`, { method:'POST' }); await loadAll(true); } catch (error) { alert(error.message); } }

  async function openDetail(id) {
    try {
      const { invoice } = await request(`/api/finance/tax-invoices/${id}`); const shell=dialog(`세금계산서 ${invoice.documentNo}`,'선택한 공급자와 발행 이력을 확인합니다.'); const summary=el('div','tax-detail-grid');
      [['작성일',formatDate(invoice.writeDate)],['공급자',supplierName(invoice)],['공급자 사업자번호',invoice.invoicer?.corpNum||'—'],['공급받는자',invoice.invoicee?.corpName||'—'],['상태',statusLabel(invoice.status)],['공급가액',won(invoice.supplyAmount)],['세액',won(invoice.taxAmount)],['합계',won(invoice.totalAmount)],['국세청 승인번호',invoice.ntsConfirmNum||'—']].forEach(([label,value])=>{const box=el('div');box.append(el('small','',label),el('strong','',value));summary.append(box);}); shell.body.append(summary);
      shell.body.append(el('h4','','품목'));const items=el('div','tax-detail-items');(invoice.items||[]).forEach(item=>items.append(el('div','',`${item.itemName} · 공급가액 ${won(item.supplyCost)} · 세액 ${won(item.tax)}`)));shell.body.append(items);
      if(Array.isArray(invoice.events)&&invoice.events.length){shell.body.append(el('h4','','처리 기록'));const timeline=el('div','tax-timeline');invoice.events.forEach(item=>{const row=el('div');row.append(el('strong','',item.action),el('span','',`${item.fromStatus||'시작'} → ${item.toStatus||'—'}`),el('small','',new Date(item.createdAt).toLocaleString('ko-KR')));timeline.append(row);});shell.body.append(timeline);} shell.node.showModal();
    } catch (error) { alert(error.message); }
  }

  function start() { if (!ensureUI()) return; loadAll(false); }
  start();
  window.addEventListener('ekodi-finance-overview', () => loadAll(false));
})();
