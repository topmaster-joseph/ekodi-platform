// Browser program is a static text payload: bundlers must not rewrite its closure.
export const WEB_PAY_CLIENT = String.raw`(function bootWebPay() {
  'use strict';
  const root = '/ekodipay/api/web';
  const $ = s => document.querySelector(s);
  const mode = document.body.dataset.payView;
  const intentKey = 'ekodipay-pending-request';
  let requestToken = location.hash.slice(1);
  if (mode === 'request' && !requestToken) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(intentKey) || 'null');
      sessionStorage.removeItem(intentKey);
      if (saved?.expires > Date.now() && /^[a-f0-9]{64}$/.test(saved.token)) {
        requestToken = saved.token;
        history.replaceState(null, '', '/ekodipay/request#' + requestToken);
      }
    } catch {}
  }
  const money = n => Number.isSafeInteger(n) ? n.toLocaleString('ko-KR') + '원' : '확인 중';
  const labels = { scheduled: '정산 예정', paid: '지급 확인', held: '지급 보류', failed: '지급 실패', cancelled: '취소', unconfirmed: '확인 중' };
  let readiness = {}, report = null, linkId = '', pending = false;
  function token() {
    // Same canonical EKODI session as the shared user auth UI. This is only a
    // credential transport; the server independently validates every request.
    try {
      const raw = JSON.parse(localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token') || 'null');
      const s = raw?.currentSession || raw?.session || raw;
      return s?.access_token && Number(s.expires_at) * 1000 > Date.now() + 15000 ? s.access_token : '';
    } catch { return ''; }
  }
  function login() {
    const target = new URL('/auth/', location.origin);
    target.searchParams.set('site', 'portal');
    // Keep invitation secrets out of the login URL and its server logs.
    target.searchParams.set('return_to', mode === 'request' ? location.origin + location.pathname : location.href);
    $('#login').href = target.href;
    $('#login').hidden = Boolean(token());
  }
  $('#login').addEventListener('click', () => {
    if (mode === 'request' && /^[a-f0-9]{64}$/.test(requestToken)) {
      try { sessionStorage.setItem(intentKey, JSON.stringify({ token: requestToken, expires: Date.now() + 900000 })); }
      catch { status('로그인 후 받으신 결제요청 링크를 다시 열어 주세요.'); }
    }
  });
  const messages = {
    LOGIN_REQUIRED: '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.',
    CONNECTION_NOT_READY: '서비스 연결을 준비하고 있습니다. 현재는 실제 카드 등록이나 결제요청을 실행하지 않습니다.',
    ORDER_NOT_ELIGIBLE: '이 주문은 결제를 요청할 수 없습니다. 원래 서비스에서 주문 상태를 확인해 주세요.',
    ORDER_CHANGED: '주문 금액이나 상태가 바뀌었습니다. 원래 주문을 다시 확인해 주세요.',
    ACTIVE_REQUEST_EXISTS: '이미 진행 중인 요청이 있습니다. 기존 요청을 확인해 주세요.',
    REQUEST_UNAVAILABLE: '요청이 만료되었거나 취소되었습니다.',
    REQUEST_CLAIMED: '이미 다른 결제자가 확인 중인 요청입니다.',
    SELLER_FORBIDDEN: '이 운영공간의 판매·정산 내역을 조회할 권한이 없습니다.',
    INVALID_REPORT_RANGE: '운영공간과 조회 기간을 확인해 주세요. 한 번에 최대 31일 간격으로 조회할 수 있습니다.',
    PROVIDER_REQUEST_FAILED: '결제사 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  };
  function status(message) { $('#notice').textContent = message; }
  async function api(path, data) {
    const credential = token();
    if (!credential && path !== '/status') throw new Error('LOGIN_REQUIRED');
    const headers = { authorization: 'Bearer ' + credential };
    if (data !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(root + path, {
      method: data === undefined ? 'GET' : 'POST', headers,
      body: data === undefined ? undefined : JSON.stringify(data),
      credentials: 'same-origin', cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.code || 'SERVICE_UNAVAILABLE');
    return result;
  }
  async function action(fn) {
    if (pending) return;
    pending = true;
    document.body.setAttribute('aria-busy', 'true');
    try { await fn(); }
    catch (e) { status(messages[e.message] || '처리하지 못했습니다. 연결 상태와 입력 내용을 확인해 주세요.'); }
    finally { document.body.removeAttribute('aria-busy'); pending = false; login(); }
  }
  async function sdk() {
    if (window.TossPayments) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.tosspayments.com/v2/standard';
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error('PROVIDER_REQUEST_FAILED')); };
      document.head.append(script);
    });
  }
  async function wallet() {
    if (mode !== 'wallet' || !readiness.cardRegistration || !token()) return;
    const data = await api('/wallet');
    const host = $('#cards');
    host.replaceChildren();
    if (!data.cards.length) { host.textContent = '아직 등록된 카드가 없습니다.'; return; }
    for (const card of data.cards) {
      const row = document.createElement('div');
      row.className = 'saved-card';
      const label = document.createElement('strong');
      label.textContent = card.label;
      const number = document.createElement('span');
      number.textContent = '•••• ' + (card.last4 || '확인 중') + ' · ' + card.type;
      row.append(label, number);
      host.append(row);
    }
  }
  for (const [selector, method] of [['#addCard', 'addPaymentMethod'], ['#manageCards', 'openSettings']]) {
    $(selector)?.addEventListener('click', () => action(async () => {
      const config = await api('/wallet/start', {});
      await sdk();
      status(config.mode === 'test' ? '결제사 테스트 환경입니다. 실제 결제는 발생하지 않습니다.' : '결제사의 본인 확인 화면에서 진행해 주세요.');
      const brandpay = window.TossPayments(config.clientKey).brandpay({ customerKey: config.customerKey, redirectUrl: config.redirectUrl });
      await brandpay[method]();
      await wallet();
      status('결제수단 목록을 새로 확인했습니다. 카드 등록은 결제 완료를 뜻하지 않습니다.');
    }));
  }
  $('#requestForm')?.addEventListener('submit', e => {
    e.preventDefault();
    action(async () => {
      const result = await api('/requests', { service: $('#service').value, orderId: $('#orderId').value.trim() });
      linkId = result.id;
      $('#requestLink').value = result.url;
      $('#requestResult').hidden = false;
      $('#expiry').textContent = '유효기간: ' + new Date(result.expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      $('#copyLink').disabled = false;
      $('#cancelLink').disabled = false;
      status('요청 링크를 만들었습니다. 결제할 분에게 직접 전달해 주세요. 아직 결제되지 않았습니다.');
    });
  });
  $('#copyLink')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#requestLink').value); status('링크를 복사했습니다.'); }
    catch { $('#requestLink').select(); status('선택한 링크를 복사해 전달해 주세요.'); }
  });
  $('#cancelLink')?.addEventListener('click', () => action(async () => {
    await api('/requests/cancel', { id: linkId });
    $('#requestResult').hidden = true;
    status('결제 요청을 취소했습니다.');
  }));
  async function inspectRequest() {
    if (mode !== 'request' || !token() || !readiness.delegatedPayment) return;
    if (!/^[a-f0-9]{64}$/.test(requestToken)) { status('받으신 결제요청 링크를 확인해 주세요.'); return; }
    const result = await api('/requests/inspect', { token: requestToken });
    $('#requestMerchant').textContent = result.merchant;
    $('#requestAmount').textContent = money(result.amount);
    $('#requestExpiry').textContent = new Date(result.expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    $('#acceptRequest').disabled = false;
  }
  $('#acceptRequest')?.addEventListener('click', () => action(async () => {
    if (!$('#payerConsent').checked) { status('금액을 확인하고 결제 진행에 동의해 주세요.'); return; }
    const result = await api('/requests/accept', { token: requestToken, consent: true });
    // Defence in depth: the server also checks the exact source-service path.
    const target = new URL(result.checkoutUrl);
    if (target.origin !== location.origin) throw new Error('SERVICE_UNAVAILABLE');
    location.assign(target.href);
  }));
  const now = new Date();
  const koreanDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  if ($('#end')) { $('#end').value = koreanDay(now); $('#start').value = koreanDay(new Date(now.getTime() - 7 * 86400000)); }
  function renderReport(data, append = false) {
    report = append && report ? { ...data, rows: [...report.rows, ...data.rows] } : data;
    const rows = $('#reportRows');
    rows.replaceChildren();
    for (const row of report.rows) {
      const tr = document.createElement('tr');
      for (const value of [row.orderId, row.soldDate || '확인 중', money(row.gross), money(row.refunds),
        money(row.fees), money(row.net), row.scheduledDate || '확인 중',
        row.paidAt ? new Date(row.paidAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미확인', labels[row.status]]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      rows.append(tr);
    }
    if (!report.rows.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 9; td.textContent = '조회 기간에 확인된 정산 자료가 없습니다.'; tr.append(td); rows.append(tr); }
    const total = (key, predicate = () => true) => {
      const selected = report.rows.filter(predicate);
      return selected.every(r => Number.isSafeInteger(r[key])) ? selected.reduce((sum, r) => sum + r[key], 0) : null;
    };
    $('#gross').textContent = money(total('gross'));
    $('#net').textContent = money(total('net'));
    $('#paid').textContent = money(total('net', r => r.status === 'paid'));
    $('#terms').textContent = report.settlementTerms;
    $('#source').textContent = '출처: ' + report.source + ' · 조회 시각: ' + new Date(report.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    $('#export').disabled = !report.rows.length;
    $('#more').hidden = !report.nextCursor;
    status(report.complete ? '정산 자료를 확인했습니다.' : '조회된 자료만 표시합니다. 전체 기간 합계는 아직 확정되지 않았습니다.');
  }
  let reportQuery = '';
  $('#sellerForm')?.addEventListener('submit', e => {
    e.preventDefault();
    action(async () => {
      reportQuery = '?' + new URLSearchParams({ workspaceId: $('#workspaceId').value.trim(), start: $('#start').value, end: $('#end').value });
      renderReport(await api('/seller/report' + reportQuery));
    });
  });
  $('#more')?.addEventListener('click', () => action(async () => {
    renderReport(await api('/seller/report' + reportQuery + '&cursor=' + encodeURIComponent(report.nextCursor)), true);
  }));
  $('#export')?.addEventListener('click', () => {
    if (!report) return;
    const cell = value => '"' + String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""') + '"';
    const table = [['주문', '판매일', '매출', '환불', '수수료', '순정산', '예정일', '지급확인', '상태'],
      ...report.rows.map(r => [r.orderId, r.soldDate, r.gross, r.refunds, r.fees, r.net, r.scheduledDate, r.paidAt, labels[r.status]])];
    const href = URL.createObjectURL(new Blob(['\ufeff' + table.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = href; a.download = 'ekodipay-settlements.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
  async function init() {
    login();
    readiness = await api('/status');
    $('#connection').textContent = readiness.enabled ? '기능 연결 설정됨' : '서비스 연결 준비 중';
    const capability = mode === 'wallet' ? 'cardRegistration' : mode === 'seller' ? 'sellerReports' : 'delegatedPayment';
    if (!readiness[capability]) {
      status(messages.CONNECTION_NOT_READY);
      document.querySelectorAll('button[data-requires-connection]').forEach(b => b.disabled = true);
      return;
    }
    document.querySelectorAll('button[data-requires-connection]').forEach(b => b.disabled = !token());
    if (!token()) { status('에코디 계정으로 로그인하면 이 화면에서 이어서 이용할 수 있습니다.'); return; }
    if (mode === 'seller') {
      const data = await api('/seller/workspaces');
      const select = $('#workspaceId');
      select.replaceChildren();
      for (const workspace of data.workspaces) {
        const option = document.createElement('option');
        option.value = workspace.id; option.textContent = workspace.name;
        select.append(option);
      }
      if (!data.workspaces.length) status('판매·정산을 조회할 수 있는 매장이 없습니다.');
    }
    await wallet();
    await inspectRequest();
  }
  action(init);
})();`;
