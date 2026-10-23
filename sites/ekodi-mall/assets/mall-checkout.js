// EKODI-MALL-TOSS-WIDGET-007 — direct-sale checkout on the public product page.
// Server decides everything (price, gates, keys); this only collects the recipient and starts Toss.
(() => {
  const won = v => `${new Intl.NumberFormat('ko-KR').format(Math.max(0, Number(v) || 0))}원`;
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v; else if (k === 'text') node.textContent = v; else node.setAttribute(k, v);
    }
    node.append(...children);
    return node;
  }
  function field(id, label, attrs = {}) {
    return el('label', { class: 'checkout-field' }, el('span', { text: label }), el('input', { id, ...attrs }));
  }

  /** Mount the checkout panel. `ctx` = { api, shareCode, attributionToken, quote }. The API base comes from the page. */
  function mount(host, ctx) {
    if (!host || !ctx?.quote?.checkoutReady) return null;
    const msg = el('p', { class: 'checkout-msg', role: 'alert' });
    const qty = el('input', { id: 'coQty', type: 'number', min: '1', max: '20', value: '1', inputmode: 'numeric' });
    const total = el('b', { text: won(ctx.quote.unitAmount) });
    qty.addEventListener('input', () => { total.textContent = won(ctx.quote.unitAmount * Math.max(1, Math.min(20, Math.trunc(Number(qty.value) || 1)))); });
    const consent = el('input', { id: 'coConsent', type: 'checkbox' });
    const payBtn = el('button', { class: 'btn primary', type: 'button', text: '결제하기' });
    const panel = el('section', { class: 'checkout-panel', 'aria-labelledby': 'coTitle' },
      el('h2', { id: 'coTitle', text: '바로 구매' }),
      el('div', { class: 'checkout-qty' }, el('label', { for: 'coQty', text: '수량' }), qty, el('span', { class: 'checkout-total' }, '합계 ', total)),
      el('div', { class: 'checkout-grid' },
        field('coName', '받는 분', { autocomplete: 'name', maxlength: '40' }),
        field('coPhone', '휴대전화', { autocomplete: 'tel', inputmode: 'tel', placeholder: '010-0000-0000', maxlength: '13' }),
        field('coEmail', '이메일(선택 · 영수증)', { type: 'email', autocomplete: 'email', maxlength: '160' }),
        field('coPostcode', '우편번호', { inputmode: 'numeric', autocomplete: 'postal-code', maxlength: '5', placeholder: '5자리' }),
        field('coAddr1', '주소', { autocomplete: 'address-line1', maxlength: '200' }),
        field('coAddr2', '상세주소', { autocomplete: 'address-line2', maxlength: '120' }),
        field('coMemo', '배송 요청사항(선택)', { maxlength: '200' })),
      el('label', { class: 'checkout-consent' }, consent, el('span', { text: '[필수] 주문·배송 안내를 위해 이름, 휴대전화, 이메일, 주소를 수집·이용하는 데 동의합니다. 판매자에게는 배송에 필요한 범위에서만 전달됩니다.' })),
      msg, payBtn);
    host.append(panel);

    const dialog = el('dialog', { class: 'checkout-dialog', 'aria-labelledby': 'coPayTitle' });
    const methods = el('div', { id: 'coPaymentMethods' });
    const agreement = el('div', { id: 'coAgreement' });
    const dialogMsg = el('p', { class: 'checkout-msg', role: 'alert' });
    const widgetPay = el('button', { class: 'btn primary', type: 'button', text: '결제하기', disabled: '' });
    const close = el('button', { class: 'smallbtn', type: 'button', text: '닫기' });
    const summary = el('p', { class: 'checkout-summary' });
    dialog.append(el('div', { class: 'checkout-dialog-head' }, el('h2', { id: 'coPayTitle', text: '결제 수단 선택' }), close), summary, methods, agreement, dialogMsg, widgetPay);
    const backdrop = el('div', { class: 'checkout-backdrop', hidden: '' });
    document.body.append(backdrop, dialog);
    // Non-modal on purpose: a modal <dialog> makes the page inert and hides Toss's payment window.
    const closeDialog = () => { dialog.close?.(); dialog.removeAttribute('open'); backdrop.hidden = true; };
    close.addEventListener('click', closeDialog);
    backdrop.addEventListener('click', closeDialog);

    let widgets = null;
    let request = null;
    widgetPay.addEventListener('click', async () => {
      if (!widgets || !request) return;
      widgetPay.disabled = true; dialogMsg.textContent = '';
      try { await widgets.requestPayment(request); }
      catch (error) { dialogMsg.textContent = error?.message || '결제를 진행하지 못했습니다.'; widgetPay.disabled = false; }
    });

    async function start() {
      msg.textContent = '';
      if (!consent.checked) { msg.textContent = '개인정보 수집·이용에 동의해 주세요.'; return; }
      if (typeof window.TossPayments !== 'function') { msg.textContent = '결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'; return; }
      payBtn.disabled = true;
      try {
        const v = id => document.getElementById(id).value;
        const response = await fetch(`${ctx.api}/api/public/orders`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ shareCode: ctx.shareCode, attributionToken: ctx.attributionToken || '', quantity: Math.max(1, Math.min(20, Math.trunc(Number(qty.value) || 1))),
            buyer: { name: v('coName'), phone: v('coPhone'), email: v('coEmail'), postcode: v('coPostcode'), address1: v('coAddr1'), address2: v('coAddr2'), memo: v('coMemo'), privacyConsent: true } }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.order) throw new Error(body.error || '주문을 만들지 못했습니다.');
        const order = body.order;
        const co = order.checkout || {};
        request = { orderId: order.id, orderName: order.orderName, successUrl: co.successUrl, failUrl: co.failUrl, customerName: order.customerName, customerMobilePhone: order.customerMobilePhone };
        if (order.customerEmail) request.customerEmail = order.customerEmail;
        const toss = window.TossPayments(co.clientKey);
        if (co.widget) {
          summary.textContent = `${order.orderName} · ${won(order.amount)}`;
          methods.replaceChildren(); agreement.replaceChildren(); widgetPay.disabled = true;
          backdrop.hidden = false;
          dialog.show ? dialog.show() : dialog.setAttribute('open', '');
          widgets = toss.widgets({ customerKey: co.customerKey || 'ANONYMOUS' });
          await widgets.setAmount({ currency: 'KRW', value: order.amount });
          await Promise.all([
            widgets.renderPaymentMethods({ selector: '#coPaymentMethods', variantKey: co.variantKey || 'qtin' }),
            widgets.renderAgreement({ selector: '#coAgreement', variantKey: co.agreementVariantKey || 'AGREEMENT' }),
          ]);
          widgetPay.disabled = false;
        } else {
          await toss.payment({ customerKey: co.customerKey || 'ANONYMOUS' }).requestPayment({ ...request, method: 'CARD', amount: { currency: 'KRW', value: order.amount } });
        }
      } catch (error) {
        msg.textContent = error?.message || '결제를 시작하지 못했습니다.';
      } finally { payBtn.disabled = false; }
    }
    payBtn.addEventListener('click', start);
    return panel;
  }
  /**
   * Toss sends the buyer back to this product page (?checkout=success&paymentKey&orderId&amount
   * or ?checkout=fail&message). The order is "paid" only after the server confirms with Toss.
   */
  async function handleReturn(api, notify) {
    const params = new URLSearchParams(location.search);
    const kind = params.get('checkout');
    if (kind !== 'success' && kind !== 'fail') return null;
    const clean = new URL(location.href);
    for (const key of ['checkout', 'paymentKey', 'orderId', 'amount', 'paymentType', 'code', 'message']) clean.searchParams.delete(key);
    history.replaceState(null, '', clean.pathname + clean.search);
    if (kind === 'fail') { notify('결제가 완료되지 않았습니다', `${params.get('message') || '결제가 취소되었거나 실패했습니다.'} 주문은 완료되지 않았고 비용도 청구되지 않았습니다.`, false); return 'fail'; }
    const paymentKey = params.get('paymentKey') || '';
    const orderId = params.get('orderId') || '';
    const amount = Math.trunc(Number(params.get('amount')));
    if (!paymentKey || !orderId || !Number.isFinite(amount)) { notify('결제 정보를 확인할 수 없습니다', '다시 시도해 주세요.', false); return 'invalid'; }
    notify('결제를 확인하고 있습니다', '잠시만 기다려 주세요. 이 창을 닫지 마세요.', true);
    try {
      const r = await fetch(`${api}/api/public/payments/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paymentKey, orderId, amount }) });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.payment?.status === 'DONE') { notify('주문이 완료되었습니다', `주문번호 ${orderId} · ${won(data.payment.totalAmount)} 결제가 확인되었습니다. 판매자가 배송을 준비합니다. 감사합니다.`, true); return 'paid'; }
      if (r.ok) { notify('결제 확인 중입니다', '결제가 아직 완료되지 않았습니다. 입금이 확인되면 주문이 완료됩니다.', true); return 'pending'; }
      notify('결제를 확인하지 못했습니다', `${data.error || '결제 승인 검증에 실패했습니다.'} 문제가 계속되면 주문번호 ${orderId}로 문의해 주세요.`, false); return 'error';
    } catch {
      notify('결제를 확인하지 못했습니다', `네트워크 문제로 확인하지 못했습니다. 주문번호 ${orderId}로 문의해 주세요.`, false); return 'error';
    }
  }
  window.EkodiMallCheckout = { mount, handleReturn };
})();
