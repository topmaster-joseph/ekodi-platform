// EKODI-MALL-DOMEGGOOK-IMPORT-001: 에코디언 계정에만 보이는 "도매꾹 상품 가져오기" 상자.
// 상품번호(또는 주소)만 넣으면 상품명·판매가·재고·사진·소개·배송 안내가 자동으로 채워진 초안이 만들어진다.
(() => {
  const form = document.querySelector('#sellerDraftForm');
  if (!form) return;
  const target = [...form.querySelectorAll(':scope > fieldset')].find((f) => (f.querySelector('legend')?.textContent || '').trim().startsWith('2'));
  if (!target) return;
  const money = (v) => `${new Intl.NumberFormat('ko-KR').format(Math.round(Number(v) || 0))}원`;

  const style = document.createElement('style');
  style.textContent = `.supply-import{margin:4px 0 18px;padding:16px;border:1px solid #d9e4dc;border-radius:14px;background:#f4f8f5}
  .supply-import-title{margin:0 0 4px;font-weight:700;color:#1f3d33}.supply-import-title span{font-size:11px;font-weight:600;color:#fff;background:#1f3d33;border-radius:999px;padding:2px 8px;margin-left:6px}
  .supply-import-hint{margin:0 0 10px;font-size:13px;color:#5b625e}.supply-import-row{display:flex;gap:8px}
  .supply-import-row input{flex:1;min-width:0;height:44px;border:1px solid #cfd8d2;border-radius:10px;padding:0 12px;font-size:15px}
  .supply-import-row .btn{height:44px;white-space:nowrap}.supply-import-msg{margin:8px 0 0;font-size:13px;line-height:1.55;color:#1f3d33}
  .supply-import-msg[data-state=error]{color:#9a2f37}.supply-import[hidden]{display:none!important}`;
  document.head.append(style);
  const box = document.createElement('div');
  box.className = 'supply-import';
  box.hidden = true;
  box.innerHTML = `
    <p class="supply-import-title">도매꾹·도매매 상품 가져오기 <span>에코디언 전용</span></p>
    <p class="supply-import-hint">상품번호나 상품 주소만 붙여 넣으세요. 가격·재고·소개가 자동으로 채워집니다. 미리 사 두지 않고, 주문이 들어오면 공급처 발주로 이어집니다.</p>
    <div class="supply-import-row">
      <input type="text" inputmode="url" placeholder="예: 12345678 또는 도매꾹 상품 주소" aria-label="도매꾹 상품번호 또는 주소" data-supply-input>
      <button type="button" class="btn primary" data-supply-go>가져오기</button>
    </div>
    <p class="supply-import-msg" role="status" data-supply-msg></p>`;
  const legend = target.querySelector('legend');
  (legend || target.firstChild)?.after(box);
  const input = box.querySelector('[data-supply-input]');
  const button = box.querySelector('[data-supply-go]');
  const msg = box.querySelector('[data-supply-msg]');
  const say = (text, bad = false) => { msg.textContent = text; msg.dataset.state = bad ? 'error' : 'ok'; };

  async function checkOfficial() {
    const server = window.ekodiSellerServer;
    if (!server) return;
    try {
      const me = await server.api('/api/me');
      box.hidden = !me?.user?.official;
    } catch { box.hidden = true; }
  }

  async function run() {
    const server = window.ekodiSellerServer;
    const value = String(input.value || '').trim();
    if (!value) { say('상품번호나 주소를 넣어 주세요.', true); input.focus(); return; }
    button.disabled = true;
    say('도매꾹에서 상품 정보를 확인하고 있습니다...');
    try {
      const result = await server.api('/api/products/import/domeggook', { method: 'POST', body: JSON.stringify({ itemNo: value }) });
      server.fillForm(result.product);
      await server.loadDashboard();
      const p = result.pricing || {};
      const s = result.supply || {};
      say(`${result.refreshed ? '가격·재고를 새로 맞췄습니다' : '초안을 만들었습니다'} · 판매가 ${money(p.salePrice)} (공급가 ${money(s.cost)} + 배송 ${money(s.shipping)}, 1개당 예상 순이익 ${money(p.unitProfit)}). ${result.imageNote || ''} [다음]으로 확인 후 게시하세요.`);
      input.value = '';
    } catch (error) {
      say(error.message || '가져오기에 실패했습니다.', true);
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  window.setTimeout(checkOfficial, 900);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && box.hidden) checkOfficial(); });
  const login = document.querySelector('#sellerLogin');
  if (login) new MutationObserver(() => { if (login.hidden) checkOfficial(); }).observe(login, { attributes: true, attributeFilter: ['hidden'] });
})();
