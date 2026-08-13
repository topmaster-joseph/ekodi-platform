(() => {
  const API = 'https://api.ekodi.kr';
  const TYPE_LABELS = {
    sale: '판매',
    refund: '환불',
    channel_fee: '채널 수수료',
    production_cost: '제작비',
    marketing_cost: '마케팅비',
    royalty: '저자 인세',
    tax: '세금',
    other_income: '기타수익',
    other_expense: '기타비용',
  };
  let financeState = null;
  let installed = false;
  let loading = false;

  function token() { return sessionStorage.getItem('ekodi-auth-token') || ''; }
  function money(value) { return `${Number(value || 0).toLocaleString('ko-KR')}원`; }
  function numberValue(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function localDate(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }
  function monthStart() {
    const now = new Date();
    return localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const detail = Array.isArray(data.rowErrors) && data.rowErrors.length
        ? ` ${data.rowErrors.slice(0, 3).map(item => `${item.row}행 ${item.error}`).join(' / ')}`
        : '';
      throw new Error((data.error || `Books finance API 요청 실패 (${response.status})`) + detail);
    }
    return data;
  }
  function flash(message, error = false) {
    const node = document.querySelector('#booksFinanceFlash') || document.querySelector('#booksFlash');
    if (!node) return;
    node.textContent = message || '';
    node.style.color = error ? '#fda4af' : '';
  }

  function install() {
    if (installed) return true;
    const section = document.querySelector('#booksAdminSection');
    const tabs = section?.querySelector('.books-tabs');
    if (!section || !tabs) return false;
    installed = true;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = 'booksFinanceTab';
    tab.className = 'books-tab';
    tab.dataset.booksTab = 'finance';
    tab.textContent = 'Sales & Costs';
    const publicationsTab = tabs.querySelector('[data-books-tab="publications"]');
    if (publicationsTab?.nextSibling) tabs.insertBefore(tab, publicationsTab.nextSibling);
    else tabs.append(tab);

    const pane = document.createElement('div');
    pane.className = 'books-pane books-finance-pane';
    pane.dataset.booksPane = 'finance';
    pane.hidden = true;
    pane.innerHTML = `
      <div class="books-finance-toolbar">
        <label>From<input id="booksFinanceFrom" type="date"></label>
        <label>To<input id="booksFinanceTo" type="date"></label>
        <label>Channel<select id="booksFinanceChannel"><option value="all">All Channels</option></select></label>
        <label>Publication<select id="booksFinancePublication"><option value="all">All Publications</option></select></label>
        <button class="books-compact-button primary" id="booksFinanceApply" type="button">Apply</button>
        <button class="books-compact-button" id="booksFinanceMonth" type="button">This Month</button>
        <button class="books-compact-button" id="booksFinanceExport" type="button">CSV Export</button>
        <label class="books-compact-button books-file-button">CSV Import<input id="booksFinanceImport" type="file" accept=".csv,text/csv" hidden></label>
      </div>
      <p class="books-flash" id="booksFinanceFlash" role="status"></p>
      <div class="books-finance-metrics" id="booksFinanceMetrics"></div>
      <div class="books-finance-grid">
        <section class="books-finance-card">
          <div class="books-finance-card-head"><div><small>CHANNEL P&L</small><strong>채널별 매출·비용</strong></div></div>
          <div class="books-finance-table-wrap"><table class="books-finance-table"><thead><tr><th>채널</th><th>매출</th><th>환불</th><th>비용</th><th>이익</th><th>마진</th><th>판매</th></tr></thead><tbody id="booksChannelSummary"></tbody></table></div>
        </section>
        <section class="books-finance-card books-finance-cost-card">
          <div class="books-finance-card-head"><div><small>COST BREAKDOWN</small><strong>비용 구성</strong></div></div>
          <div id="booksCostBreakdown" class="books-cost-breakdown"></div>
        </section>
      </div>
      <section class="books-finance-card books-ledger-card">
        <div class="books-finance-card-head">
          <div><small>TRANSACTION LEDGER</small><strong>매출·비용 상세 원장</strong></div>
          <button class="books-compact-button primary" id="booksNewFinanceEntry" type="button">+ Add Entry</button>
        </div>
        <form id="booksFinanceForm" class="books-finance-form" hidden>
          <input type="hidden" name="id">
          <label>거래일<input name="occurredOn" type="date" required></label>
          <label>채널<select name="channelCode" required></select></label>
          <label>도서<select name="publicationId"><option value="">공통 / 미지정</option></select></label>
          <label>유형<select name="transactionType" required></select></label>
          <label>수량<input name="quantity" type="number" min="0" step="1" value="1"></label>
          <label>통화<input name="currency" maxlength="8" value="KRW"></label>
          <label>원금액<input name="amountOriginal" type="number" min="0" step="0.01" required></label>
          <label>환율<input name="fxRate" type="number" min="0" step="0.0001" value="1"></label>
          <label>원화금액<input name="amountKrw" type="number" min="0" step="1" placeholder="자동계산 가능"></label>
          <label>정산상태<select name="settlementStatus"><option value="pending">PENDING</option><option value="settled">SETTLED</option></select></label>
          <label>정산기간<input name="settlementPeriod" maxlength="30" placeholder="2026-08"></label>
          <label>정산번호<input name="settlementRef" maxlength="120"></label>
          <label>외부거래번호<input name="externalRef" maxlength="160"></label>
          <label class="wide">메모<input name="note" maxlength="1000"></label>
          <div class="books-finance-form-actions"><button class="books-compact-button" id="booksFinanceCancel" type="button">Cancel</button><button class="books-compact-button primary" type="submit">Save Entry</button></div>
        </form>
        <div class="books-finance-table-wrap"><table class="books-finance-table books-ledger-table"><thead><tr><th>일자</th><th>채널</th><th>도서</th><th>유형</th><th>수량</th><th>원금액</th><th>원화금액</th><th>정산</th><th></th></tr></thead><tbody id="booksFinanceLedger"></tbody></table></div>
      </section>`;
    section.append(pane);

    const overviewMetrics = section.querySelector('#booksMetrics');
    if (overviewMetrics && !section.querySelector('#booksFinanceOverview')) {
      const strip = document.createElement('div');
      strip.id = 'booksFinanceOverview';
      strip.className = 'books-finance-overview';
      strip.innerHTML = '<article><small>This Month Sales</small><strong>0원</strong></article><article><small>This Month Costs</small><strong>0원</strong></article><article><small>This Month Profit</small><strong>0원</strong></article><article><small>Unsettled</small><strong>0원</strong></article>';
      overviewMetrics.insertAdjacentElement('afterend', strip);
    }

    document.querySelector('#booksFinanceFrom').value = monthStart();
    document.querySelector('#booksFinanceTo').value = localDate();
    tab.addEventListener('click', () => {
      section.querySelectorAll('[data-books-tab]').forEach(item => item.classList.toggle('active', item.dataset.booksTab === 'finance'));
      section.querySelectorAll('[data-books-pane]').forEach(item => { item.hidden = item.dataset.booksPane !== 'finance'; });
      loadFinance();
    });
    document.querySelector('#booksFinanceApply').addEventListener('click', loadFinance);
    document.querySelector('#booksFinanceMonth').addEventListener('click', () => {
      document.querySelector('#booksFinanceFrom').value = monthStart();
      document.querySelector('#booksFinanceTo').value = localDate();
      loadFinance();
    });
    document.querySelector('#booksFinanceExport').addEventListener('click', exportCsv);
    document.querySelector('#booksFinanceImport').addEventListener('change', importCsv);
    document.querySelector('#booksNewFinanceEntry').addEventListener('click', () => openForm());
    document.querySelector('#booksFinanceCancel').addEventListener('click', closeForm);
    document.querySelector('#booksFinanceForm').addEventListener('submit', saveEntry);
    section.querySelector('.sidebar')?.addEventListener?.('click', () => {});

    const booksNav = document.querySelector('.sidebar .nav[data-section="books"]');
    booksNav?.addEventListener('click', () => setTimeout(() => loadFinance(true), 50));
    if (location.hash === '#books' && token()) setTimeout(() => loadFinance(true), 150);
    return true;
  }

  function queryString() {
    const params = new URLSearchParams();
    const from = document.querySelector('#booksFinanceFrom')?.value;
    const to = document.querySelector('#booksFinanceTo')?.value;
    const channel = document.querySelector('#booksFinanceChannel')?.value;
    const publication = document.querySelector('#booksFinancePublication')?.value;
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (channel && channel !== 'all') params.set('channel', channel);
    if (publication && publication !== 'all') params.set('publication', publication);
    return params.toString();
  }

  async function loadFinance(silent = false) {
    if (!installed || loading || !token()) return;
    loading = true;
    if (!silent) flash('채널별 매출·비용을 불러오는 중입니다.');
    try {
      financeState = await request(`/api/books/admin/finance?${queryString()}`);
      fillFilters();
      renderFinance();
      if (!silent) flash(`마지막 갱신 ${new Date().toLocaleTimeString('ko-KR')}`);
    } catch (error) {
      flash(error.message, true);
    } finally {
      loading = false;
    }
  }

  function fillFilters() {
    const channelSelect = document.querySelector('#booksFinanceChannel');
    const publicationSelect = document.querySelector('#booksFinancePublication');
    const formChannel = document.querySelector('#booksFinanceForm [name="channelCode"]');
    const formPublication = document.querySelector('#booksFinanceForm [name="publicationId"]');
    const currentChannel = channelSelect.value || 'all';
    const currentPublication = publicationSelect.value || 'all';
    channelSelect.replaceChildren(new Option('All Channels', 'all'));
    formChannel.replaceChildren();
    financeState.channels.filter(item => item.enabled).forEach(item => {
      channelSelect.add(new Option(item.name, item.code));
      formChannel.add(new Option(item.name, item.code));
    });
    channelSelect.value = Array.from(channelSelect.options).some(option => option.value === currentChannel) ? currentChannel : 'all';

    publicationSelect.replaceChildren(new Option('All Publications', 'all'));
    formPublication.replaceChildren(new Option('공통 / 미지정', ''));
    financeState.publications.forEach(item => {
      const label = item.author ? `${item.title} · ${item.author}` : item.title;
      publicationSelect.add(new Option(label, item.id));
      formPublication.add(new Option(label, item.id));
    });
    publicationSelect.value = Array.from(publicationSelect.options).some(option => option.value === currentPublication) ? currentPublication : 'all';

    const type = document.querySelector('#booksFinanceForm [name="transactionType"]');
    if (!type.options.length) Object.entries(TYPE_LABELS).forEach(([value, label]) => type.add(new Option(label, value)));
  }

  function renderFinance() {
    renderMetrics();
    renderChannels();
    renderCosts();
    renderLedger();
  }

  function renderMetrics() {
    const s = financeState.summary || {};
    const values = [
      ['Gross Sales', money(s.grossSales)],
      ['Refunds', money(s.refunds)],
      ['Total Costs', money(s.costs)],
      ['Operating Profit', money(s.profit)],
      ['Units Sold', Number(s.unitsSold || 0).toLocaleString('ko-KR')],
      ['Unsettled', money(s.unsettledNet)],
    ];
    const root = document.querySelector('#booksFinanceMetrics');
    root.textContent = '';
    values.forEach(([label, value]) => {
      const card = el('article', 'books-finance-metric');
      card.append(el('small', '', label), el('strong', '', value));
      root.append(card);
    });
    const overview = document.querySelector('#booksFinanceOverview');
    if (overview) {
      const cards = overview.querySelectorAll('article strong');
      [s.grossSales, s.costs, s.profit, s.unsettledNet].forEach((value, index) => { if (cards[index]) cards[index].textContent = money(value); });
    }
  }

  function renderChannels() {
    const body = document.querySelector('#booksChannelSummary');
    body.textContent = '';
    if (!financeState.channelSummary.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td'); cell.colSpan = 7; cell.className = 'books-finance-empty'; cell.textContent = '선택한 기간의 채널 매출·비용이 없습니다.';
      row.append(cell); body.append(row); return;
    }
    financeState.channelSummary.forEach(item => {
      const row = document.createElement('tr');
      const values = [item.name, money(item.sales), money(item.refunds), money(item.costs), money(item.profit), item.marginPercent === null ? '—' : `${item.marginPercent}%`, String(item.units || 0)];
      values.forEach((value, index) => {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        cell.textContent = value;
        if (index === 4) cell.className = item.profit < 0 ? 'books-negative' : 'books-positive';
        row.append(cell);
      });
      body.append(row);
    });
  }

  function renderCosts() {
    const root = document.querySelector('#booksCostBreakdown');
    root.textContent = '';
    const total = Number(financeState.summary.costs || 0);
    if (!financeState.costBreakdown.length) { root.append(el('p', 'books-finance-empty', '비용 내역이 없습니다.')); return; }
    financeState.costBreakdown.forEach(item => {
      const row = el('article', 'books-cost-row');
      const top = el('div', 'books-cost-row-head');
      const percent = total ? Math.round((item.amountKrw / total) * 1000) / 10 : 0;
      top.append(el('span', '', TYPE_LABELS[item.type] || item.type), el('strong', '', money(item.amountKrw)));
      const bar = el('div', 'books-cost-bar'); const fill = el('span'); fill.style.width = `${Math.max(0, Math.min(100, percent))}%`; bar.append(fill);
      row.append(top, bar, el('small', '', `${percent}%`)); root.append(row);
    });
  }

  function renderLedger() {
    const body = document.querySelector('#booksFinanceLedger');
    body.textContent = '';
    if (!financeState.transactions.length) {
      const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 9; cell.className = 'books-finance-empty'; cell.textContent = '등록된 매출·비용 내역이 없습니다.'; row.append(cell); body.append(row); return;
    }
    financeState.transactions.forEach(item => {
      const row = document.createElement('tr');
      const original = `${numberValue(item.amountOriginal).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${item.currency || 'KRW'}`;
      [item.occurredOn, item.channelName, item.publicationTitle || '공통', TYPE_LABELS[item.transactionType] || item.transactionType, String(item.quantity || 0), original, money(item.amountKrw), item.settlementStatus.toUpperCase()].forEach((value, index) => {
        const cell = document.createElement(index === 1 ? 'th' : 'td'); cell.textContent = value; row.append(cell);
      });
      const actions = document.createElement('td'); actions.className = 'books-ledger-actions';
      const edit = el('button', 'books-compact-button', 'Edit'); edit.type = 'button'; edit.addEventListener('click', () => openForm(item));
      const remove = el('button', 'books-compact-button', 'Delete'); remove.type = 'button'; remove.addEventListener('click', () => removeEntry(item));
      actions.append(edit, remove); row.append(actions); body.append(row);
    });
  }

  function openForm(item = null) {
    const form = document.querySelector('#booksFinanceForm');
    form.hidden = false;
    form.reset();
    fillFilters();
    form.elements.id.value = item?.id || '';
    form.elements.occurredOn.value = item?.occurredOn || localDate();
    form.elements.channelCode.value = item?.channelCode || financeState?.channels?.find(channel => channel.enabled)?.code || '';
    form.elements.publicationId.value = item?.publicationId || '';
    form.elements.transactionType.value = item?.transactionType || 'sale';
    form.elements.quantity.value = item?.quantity ?? 1;
    form.elements.currency.value = item?.currency || financeState?.channels?.find(channel => channel.code === form.elements.channelCode.value)?.defaultCurrency || 'KRW';
    form.elements.amountOriginal.value = item?.amountOriginal ?? '';
    form.elements.fxRate.value = item?.fxRate ?? 1;
    form.elements.amountKrw.value = item?.amountKrw ?? '';
    form.elements.settlementStatus.value = item?.settlementStatus || 'pending';
    form.elements.settlementPeriod.value = item?.settlementPeriod || localDate().slice(0, 7);
    form.elements.settlementRef.value = item?.settlementRef || '';
    form.elements.externalRef.value = item?.externalRef || '';
    form.elements.note.value = item?.note || '';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function closeForm() { const form = document.querySelector('#booksFinanceForm'); form.hidden = true; form.reset(); }

  async function saveEntry(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return form.reportValidity();
    const data = new FormData(form);
    const payload = {
      occurredOn: data.get('occurredOn'),
      channelCode: data.get('channelCode'),
      publicationId: data.get('publicationId'),
      transactionType: data.get('transactionType'),
      quantity: Number(data.get('quantity') || 0),
      currency: String(data.get('currency') || 'KRW').toUpperCase(),
      amountOriginal: Number(data.get('amountOriginal') || 0),
      fxRate: Number(data.get('fxRate') || 1),
      settlementStatus: data.get('settlementStatus'),
      settlementPeriod: data.get('settlementPeriod'),
      settlementRef: data.get('settlementRef'),
      externalRef: data.get('externalRef'),
      note: data.get('note'),
      source: 'manual',
    };
    if (String(data.get('amountKrw') || '').trim()) payload.amountKrw = Number(data.get('amountKrw'));
    const id = data.get('id');
    flash('매출·비용 내역을 저장하는 중입니다.');
    try {
      await request(id ? `/api/books/admin/finance/transactions/${id}` : '/api/books/admin/finance/transactions', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      closeForm(); await loadFinance(); flash('매출·비용 내역을 저장했습니다.');
    } catch (error) { flash(error.message, true); }
  }

  async function removeEntry(item) {
    if (!confirm(`${item.occurredOn} ${item.channelName} ${TYPE_LABELS[item.transactionType] || item.transactionType} ${money(item.amountKrw)} 내역을 삭제할까요?`)) return;
    try { await request(`/api/books/admin/finance/transactions/${item.id}`, { method: 'DELETE' }); await loadFinance(); flash('거래내역을 삭제했습니다.'); }
    catch (error) { flash(error.message, true); }
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function exportCsv() {
    if (!financeState?.transactions?.length) { flash('내보낼 거래내역이 없습니다.', true); return; }
    const header = ['occurredOn','publicationId','channelCode','transactionType','quantity','amountOriginal','currency','fxRate','amountKrw','settlementStatus','settlementPeriod','settlementRef','externalRef','note'];
    const rows = financeState.transactions.map(item => header.map(key => csvEscape(item[key])).join(','));
    const csv = '\ufeff' + [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `ekodi-books-finance-${localDate()}.csv`; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    flash('현재 필터의 거래내역을 CSV로 내보냈습니다.');
  }

  function parseCsv(text) {
    const rows = []; let row = []; let cell = ''; let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(cell); cell = ''; }
      else if (char === '\n') { row.push(cell.replace(/\r$/, '')); if (row.some(value => value !== '')) rows.push(row); row = []; cell = ''; }
      else cell += char;
    }
    if (cell || row.length) { row.push(cell.replace(/\r$/, '')); if (row.some(value => value !== '')) rows.push(row); }
    return rows;
  }
  function importRowObject(headers, values) {
    const aliases = {
      date: 'occurredOn', '거래일': 'occurredOn',
      bookId: 'publicationId', '도서ID': 'publicationId',
      channel: 'channelCode', '채널': 'channelCode',
      type: 'transactionType', '유형': 'transactionType',
      qty: 'quantity', '수량': 'quantity',
      originalAmount: 'amountOriginal', '원금액': 'amountOriginal',
      '통화': 'currency', exchangeRate: 'fxRate', '환율': 'fxRate',
      krw: 'amountKrw', '원화금액': 'amountKrw',
      '정산상태': 'settlementStatus', '정산기간': 'settlementPeriod', '정산번호': 'settlementRef',
      '외부거래번호': 'externalRef', '메모': 'note',
    };
    const item = {};
    headers.forEach((header, index) => {
      const raw = String(header || '').replace(/^\ufeff/, '').trim();
      const key = aliases[raw] || raw;
      const value = String(values[index] ?? '').trim();
      if (value !== '') item[key] = value;
    });
    ['quantity','amountOriginal','fxRate','amountKrw'].forEach(key => { if (item[key] !== undefined) item[key] = Number(item[key]); });
    return item;
  }
  async function importCsv(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const matrix = parseCsv(await file.text());
      if (matrix.length < 2) throw new Error('CSV에 헤더와 한 줄 이상의 거래내역이 필요합니다.');
      const [headers, ...rows] = matrix;
      const items = rows.map(row => importRowObject(headers, row));
      if (!confirm(`${items.length}건의 매출·비용 내역을 가져올까요?`)) return;
      const result = await request('/api/books/admin/finance/import', { method: 'POST', body: JSON.stringify({ rows: items }) });
      await loadFinance(); flash(`${result.imported || items.length}건을 CSV에서 가져왔습니다.`);
    } catch (error) { flash(error.message, true); }
    finally { input.value = ''; }
  }

  function boot() {
    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
