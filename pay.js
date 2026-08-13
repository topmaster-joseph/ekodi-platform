const FINANCE_API = 'https://finance-api.ekodi.kr';
const CLIENT_KEY = 'test_gck_AQ92ymxN34gvBEJ5MNmO8ajRKXvd';
const EXPECTED_TEST_AMOUNT = 1000;

const state = {
  widgets: null,
  amount: EXPECTED_TEST_AMOUNT,
  ready: false
};

function won(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

function setServerState(text) {
  const node = document.querySelector('#serverState');
  if (node) node.textContent = text;
}

function showResult(title, message, details = []) {
  document.querySelector('#checkoutView')?.classList.add('hidden');
  const result = document.querySelector('#resultView');
  result?.classList.remove('hidden');
  const titleNode = document.querySelector('#resultTitle');
  const messageNode = document.querySelector('#resultMessage');
  const detailsNode = document.querySelector('#resultDetails');
  if (titleNode) titleNode.textContent = title;
  if (messageNode) messageNode.textContent = message;
  if (detailsNode) {
    detailsNode.replaceChildren(...details.map(([label, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = String(value ?? '');
      row.append(dt, dd);
      return row;
    }));
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${FINANCE_API}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.error || `HTTP ${response.status}`);
    error.code = body.code || '';
    error.status = response.status;
    throw error;
  }
  return body;
}

async function confirmRedirect(params) {
  const paymentKey = params.get('paymentKey') || '';
  const orderId = params.get('orderId') || '';
  const amount = Number(params.get('amount'));
  if (!paymentKey || !orderId || !Number.isFinite(amount)) return false;

  showResult('결제 승인 확인 중', 'EKODI 서버에서 주문 금액을 검증한 뒤 토스 승인 API를 호출하고 있습니다.');
  try {
    const result = await api('/api/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ paymentKey, orderId, amount })
    });
    const payment = result.payment || {};
    showResult('테스트 결제 연결 성공', '토스 승인과 EKODI 결제 원장 기록까지 완료했습니다.', [
      ['주문번호', payment.orderId || orderId],
      ['상태', payment.status || 'DONE'],
      ['결제수단', payment.method || '확인됨'],
      ['금액', won(payment.totalAmount || amount)],
      ['환경', String(result.mode || 'test').toUpperCase()]
    ]);
    history.replaceState(null, '', location.pathname);
  } catch (error) {
    showResult('결제 승인 확인 실패', error.message || '토스 승인 처리 중 오류가 발생했습니다.', [
      ['주문번호', orderId],
      ['오류코드', error.code || 'PAYMENT_CONFIRM_FAILED']
    ]);
  }
  return true;
}

function showFailure(params) {
  const code = params.get('code');
  const message = params.get('message');
  if (!code && !message) return false;
  showResult('결제 인증이 완료되지 않았습니다.', message || '결제창에서 결제가 취소되었거나 인증에 실패했습니다.', [
    ['오류코드', code || 'PAYMENT_CANCELED']
  ]);
  history.replaceState(null, '', location.pathname);
  return true;
}

async function setupWidget() {
  const button = document.querySelector('#payButton');
  const loading = document.querySelector('#widgetLoading');
  try {
    const status = await api('/api/payments/status', { method: 'GET' });
    if (!status.ready) {
      setServerState('서버키 미연결');
      if (loading) loading.textContent = 'GitHub Secret 배포가 완료되면 테스트 결제를 사용할 수 있습니다.';
      return;
    }
    if (status.mode !== 'test') {
      setServerState('라이브 모드 감지 · 테스트 차단');
      if (loading) loading.textContent = '현재 서버가 테스트 키가 아니므로 이 테스트 화면은 결제를 시작하지 않습니다.';
      return;
    }

    state.amount = Number(status.testAmount || EXPECTED_TEST_AMOUNT);
    setServerState(status.midConfigured ? 'TEST 서버키 · MID 연결' : 'TEST 서버키 연결 · MID 확인 필요');
    const tossPayments = TossPayments(CLIENT_KEY);
    state.widgets = tossPayments.widgets({ customerKey: 'ANONYMOUS' });
    await state.widgets.setAmount({ currency: 'KRW', value: state.amount });
    await Promise.all([
      state.widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
      state.widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' })
    ]);
    if (loading) loading.remove();
    if (button) {
      button.textContent = `${won(state.amount)} 테스트 결제하기`;
      button.disabled = false;
    }
    state.ready = true;
  } catch (error) {
    setServerState('연결 확인 필요');
    if (loading) loading.textContent = `결제위젯을 준비하지 못했습니다. ${error.message}`;
  }
}

async function startPayment() {
  const button = document.querySelector('#payButton');
  if (!state.ready || !state.widgets || !button) return;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = '주문 준비 중...';
  try {
    const order = await api('/api/payments/test-order', { method: 'POST', body: '{}' });
    if (Number(order.amount) !== state.amount) {
      throw new Error('서버 주문 금액과 결제위젯 금액이 일치하지 않습니다.');
    }
    await state.widgets.requestPayment({
      orderId: order.orderId,
      orderName: order.orderName || 'EKODI Pay 테스트 결제',
      successUrl: `${location.origin}/?result=success`,
      failUrl: `${location.origin}/?result=fail`
    });
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    setServerState(`결제 시작 실패 · ${error.message}`);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  if (await confirmRedirect(params)) return;
  if (showFailure(params)) return;
  document.querySelector('#payButton')?.addEventListener('click', startPayment);
  await setupWidget();
});
