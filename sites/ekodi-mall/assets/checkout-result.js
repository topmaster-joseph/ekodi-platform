// EKODI-MALL-TOSS-WIDGET-007 — Toss returns here; the server confirms the payment before anything is "paid".
(() => {
  const API = 'https://mall-api.ekodi.kr';
  const params = new URLSearchParams(location.search);
  const title = document.querySelector('#resultTitle');
  const body = document.querySelector('#resultBody');
  const won = v => `${new Intl.NumberFormat('ko-KR').format(Math.max(0, Number(v) || 0))}원`;
  const set = (t, b) => { title.textContent = t; body.textContent = b; };
  if (document.body.dataset.result === 'fail') {
    set('결제가 완료되지 않았습니다', `${params.get('message') || '결제가 취소되었거나 실패했습니다.'} 주문은 완료되지 않았고 비용도 청구되지 않았습니다.`);
    return;
  }
  const paymentKey = params.get('paymentKey') || '';
  const orderId = params.get('orderId') || '';
  const amount = Math.trunc(Number(params.get('amount')));
  if (!paymentKey || !orderId || !Number.isFinite(amount)) { set('결제 정보를 확인할 수 없습니다', '주문 화면에서 다시 시도해 주세요.'); return; }
  history.replaceState(null, '', location.pathname);
  set('결제를 확인하고 있습니다', '잠시만 기다려 주세요. 이 창을 닫지 마세요.');
  fetch(`${API}/api/public/payments/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paymentKey, orderId, amount }) })
    .then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
    .then(({ ok, data }) => {
      if (ok && data.payment?.status === 'DONE') set('주문이 완료되었습니다', `주문번호 ${orderId} · ${won(data.payment.totalAmount)} 결제가 확인되었습니다. 판매자가 배송을 준비합니다. 감사합니다.`);
      else if (ok) set('결제 확인 중입니다', '결제가 아직 완료되지 않았습니다. 입금이 확인되면 주문이 완료됩니다.');
      else set('결제를 확인하지 못했습니다', `${data.error || '결제 승인 검증에 실패했습니다.'} 문제가 계속되면 주문번호 ${orderId}로 문의해 주세요.`);
    })
    .catch(() => set('결제를 확인하지 못했습니다', `네트워크 문제로 확인하지 못했습니다. 이 페이지를 새로고침하지 말고 주문번호 ${orderId}로 문의해 주세요.`));
})();
