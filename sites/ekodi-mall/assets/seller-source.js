// EKODI-MALL-PRODUCT-SOURCE-001: 에코디언이 직접 등록하는 상품의 출처(상인 위탁·자체상품) 입력.
// 상인 위탁 상품은 상인(업체)명·연락처를 기록하고, 상인이 동의하면 상품 페이지 '판매자 정보'에 표시한다.
(() => {
  const form = document.querySelector('#sellerDraftForm');
  if (!form) return;
  const target = [...form.querySelectorAll(':scope > fieldset')].find((f) => (f.querySelector('legend')?.textContent || '').trim().startsWith('2'));
  if (!target) return;
  const style = document.createElement('style');
  style.textContent = `.source-box{margin:14px 0 4px;padding:14px 16px;border:1px dashed #cfd8d2;border-radius:14px;background:#fbfaf6}
  .source-box[hidden]{display:none!important}.source-box p{margin:0 0 8px;font-weight:700;color:#1f3d33;font-size:14px}
  .source-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.source-grid label{display:grid;gap:4px;font-size:12px;color:#5b625e}
  .source-grid input,.source-grid select{height:40px;border:1px solid #cfd8d2;border-radius:10px;padding:0 10px;font-size:14px;background:#fff;min-width:0}
  .source-grid .full{grid-column:1/-1}.source-consent{display:flex;gap:8px;align-items:center;font-size:13px;color:#3b413e;margin-top:8px}
  @media (max-width:640px){.source-grid{grid-template-columns:1fr}}`;
  document.head.append(style);
  const box = document.createElement('div');
  box.className = 'source-box';
  box.hidden = true;
  box.innerHTML = `
    <p>상품 출처 <small style="font-weight:500;color:#6b706c">· 에코디언 전용</small></p>
    <div class="source-grid">
      <label class="full">출처 유형
        <select name="sourceKind">
          <option value="">선택 안 함</option>
          <option value="consigned_merchant">상인 위탁 상품 (상인회 등)</option>
          <option value="ekodibiz_own">에코디비즈 자체 상품</option>
        </select>
      </label>
      <label data-merchant>상인·업체명<input name="sourceName" maxlength="80" placeholder="예: 청계상회 홍길동"></label>
      <label data-merchant>연락처<input name="sourceContact" maxlength="120" inputmode="tel" placeholder="예: 010-0000-0000"></label>
    </div>
    <label class="source-consent" data-merchant><input type="checkbox" name="sourcePublic"> 상품 페이지에 제공자(상인명·연락처) 표시 — 상인 동의를 받았습니다</label>`;
  target.append(box);
  const kind = box.querySelector('[name=sourceKind]');
  const sync = () => box.querySelectorAll('[data-merchant]').forEach((el) => { el.hidden = kind.value !== 'consigned_merchant'; });
  kind.addEventListener('change', sync);
  kind.addEventListener('input', sync);
  sync();
  async function checkOfficial() {
    try { const me = await window.ekodiSellerServer?.api('/api/me'); box.hidden = !me?.user?.official; } catch { box.hidden = true; }
  }
  window.setTimeout(checkOfficial, 1000);
  const login = document.querySelector('#sellerLogin');
  if (login) new MutationObserver(() => { if (login.hidden) checkOfficial(); }).observe(login, { attributes: true, attributeFilter: ['hidden'] });
})();
