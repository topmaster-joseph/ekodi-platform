// BOOKS-REFUND-SYNC-001 — 주문·환불 관리(운영자 전용, 권한은 서버가 검사)
// 결제 취소 자체는 토스페이먼츠 상점관리자에서 사람이 실행하고, 이 화면은 실제 취소 여부를 확인해 반영만 한다.
(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  const $ = id => document.getElementById(id);
  const STATUS = { paid: '결제 완료', refunded: '환불 완료', payment_pending: '결제 대기', payment_failed: '결제 실패' };
  const won = n => `${Number(n || 0).toLocaleString('ko-KR')}원`;
  async function authed(path, init = {}) {
    const s = await C.session();
    return fetch(`${C.BASE}/api/commerce/${path}`, { ...init, headers: { ...(init.headers || {}), authorization: 'Bearer ' + (s?.accessToken || '') }, cache: 'no-store' });
  }
  const cell = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; };
  function render(data) {
    const pay = data.payments || {};
    $('payMode').textContent = pay.ready
      ? (pay.mode === 'live' ? `실결제 모드 · ${pay.merchant || '에코디비즈'} — 결제하면 실제 금액이 청구됩니다.` : '시험 결제 모드 — 실제 돈은 움직이지 않습니다(운영자만 결제 가능).')
      : `결제 준비 안 됨: ${(pay.missing || []).join(', ') || '확인필요'}`;
    $('payMode').className = `review-readiness ${pay.ready && pay.mode === 'live' ? 'ok' : 'warn'}`;
    const host = document.createDocumentFragment();
    const head = document.createElement('div'); head.className = 'op-row op-head';
    for (const t of ['No.', '도서 · 구매자', '금액', '상태', '']) head.append(cell('span', '', t));
    host.append(head);
    (data.orders || []).forEach((o, i) => {
      const row = document.createElement('div'); row.className = 'op-row';
      row.append(cell('span', 'op-no', String(i + 1).padStart(2, '0')));
      const t = cell('b', 'op-title', `${o.book_title} · ${o.buyer_email}`); t.title = `${o.id} · ${new Date(o.created_at).toLocaleString('ko-KR')}`; row.append(t);
      row.append(cell('span', 'op-meta', `${won(o.amount)} · ${new Date(o.approved_at || o.created_at).toLocaleDateString('ko-KR')}`));
      row.append(cell('span', `op-badge ${o.status === 'paid' ? 'on' : 'off'}`, STATUS[o.status] || o.status));
      const actions = cell('span', 'op-actions', '');
      if (o.receipt_url) { const a = cell('a', 'op-btn ghost', '영수증'); a.href = o.receipt_url; a.target = '_blank'; a.rel = 'noopener'; actions.append(a); }
      if (o.status === 'paid') {
        const b = cell('button', 'op-btn', '환불 반영'); b.type = 'button';
        b.addEventListener('click', async () => {
          if (!confirm(`토스페이먼츠 상점관리자에서 이 결제(${won(o.amount)})를 먼저 전액 취소하셨나요?\n확인하면 서점이 취소 여부를 조회한 뒤 주문을 환불로 바꾸고 내 서재 권한을 회수합니다.`)) return;
          b.disabled = true; b.textContent = '확인 중…';
          const r = await authed(`admin/orders/${encodeURIComponent(o.id)}/refund-sync`, { method: 'POST' });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) { alert(d.error || '환불을 반영하지 못했습니다.'); b.disabled = false; b.textContent = '환불 반영'; return; }
          load();
        });
        actions.append(b);
      }
      row.append(actions); host.append(row);
    });
    if (!(data.orders || []).length) host.append(cell('p', 'buy-msg', '아직 주문이 없습니다.'));
    $('ordersRoot').replaceChildren(host); $('ordersRoot').hidden = false;
    $('ordersStatus').textContent = `결제 완료 ${data.paid || 0}건 · ${won(data.revenue)}`;
  }
  async function load() {
    try { render(await C.api('admin/orders?limit=100')); $('reviewLogin').hidden = true; }
    catch (e) {
      if (e.status === 401) { $('reviewLogin').hidden = false; $('ordersStatus').textContent = '운영자 계정으로 로그인해 주세요.'; }
      else $('ordersStatus').textContent = e.status === 403 ? '운영자만 사용할 수 있는 화면입니다.' : e.message;
    }
  }
  C.mountGoogle($('googleButton'), t => { $('accountStatus').textContent = t || ''; }, load);
  load();
})();
