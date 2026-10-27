(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  const q = new URLSearchParams(location.search);
  if (location.pathname.includes('buy/fail')) {
    const msg = q.get('message'); if (msg) document.getElementById('failText').textContent = `${msg} 청구된 금액은 없습니다.`;
    let last = null; try { last = JSON.parse(sessionStorage.getItem('ekodi-books-last-order') || 'null'); } catch {}
    if (last?.bookId) document.getElementById('retry').href = `${C.BASE}/buy/?book=${encodeURIComponent(last.bookId)}`;
    return;
  }
  const title = document.getElementById('resultTitle'), text = document.getElementById('resultText'), actions = document.getElementById('resultActions');
  const paymentKey = q.get('paymentKey'), orderId = q.get('orderId'), amount = Number(q.get('amount'));
  if (!paymentKey || !orderId || !Number.isFinite(amount)) { title.textContent = '결제 정보를 찾을 수 없습니다'; text.textContent = '내 서재에서 구매 내역을 확인해 주세요.'; actions.hidden = false; return; }
  C.api('confirm', { method: 'POST', body: { paymentKey, orderId, amount } })
    .then(() => { title.textContent = '내 서재에 담겼습니다'; text.textContent = '결제가 완료되었습니다. 내 서재에서 전자책을 받으실 수 있습니다. 영수증은 결제하신 이메일로도 발송됩니다.'; try { sessionStorage.removeItem('ekodi-books-last-order'); } catch {} })
    .catch(e => { document.querySelector('.seal').textContent = '!'; title.textContent = '결제 확인이 필요합니다'; text.textContent = `${e.message} 이미 결제되었다면 자동으로 확인되며, 문의는 ekodibiz@gmail.com 으로 주세요.`; })
    .finally(() => { actions.hidden = false; history.replaceState(null, '', location.pathname); });
})();
