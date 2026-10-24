// EKODI-MALL-SELLER-WIZARD-001: show Seller Studio one step per screen.
// Purely presentational: it never changes form values or API calls; it only
// shows one step at a time and lets the seller open the full page on demand.
(() => {
  const form = document.querySelector('#sellerDraftForm');
  const auth = document.querySelector('#sellerAuth');
  const studio = document.querySelector('#studio');
  if (!form || !auth || !studio) return;
  const main = studio.parentElement;
  const fieldsets = [...form.querySelectorAll(':scope > fieldset')];
  const byLegend = (n) => fieldsets.find((f) => (f.querySelector('legend')?.textContent || '').trim().startsWith(String(n)));
  const STORE_KEY = 'ekodiMallSellerWizardStep';
  const store = {
    get() { try { return Number(localStorage.getItem(STORE_KEY)) || 0; } catch { return 0; } },
    set(v) { try { localStorage.setItem(STORE_KEY, String(v)); } catch { /* storage unavailable */ } }
  };

  const steps = [
    { title: '로그인', hint: 'Google 계정으로 시작합니다.', show: () => [auth] },
    { title: '판매자 정보', hint: '판매자 유형·표시명·문의 연락처를 입력하세요.', fields: [1], optionalStore: true, required: ['sellerDisplayName', 'contact'] },
    { title: '상품·가격·재고', hint: '판매 방식, 상품명, 가격, 재고를 입력하세요.', fields: [2], required: ['productName', 'price'] },
    { title: '상품 소개', hint: '한 줄 소개는 게시에 꼭 필요합니다.', fields: [4], required: ['oneLine'] },
    { title: '배송 · 저장 · 게시', hint: '배송·제공 방식을 적고 [서버에 저장] → [게시 · 링크 활성화]를 누르세요.', fields: [5], buttons: true, required: ['fulfillment'] },
    { title: '판매 인증', hint: '판매자 인증을 신청하면 운영자 승인 후 결제가 열립니다.', show: () => [document.querySelector('#commerceReadiness')].filter(Boolean) }
  ];

  const style = document.createElement('style');
  style.textContent = `
  .wz-on .wz-hide{display:none!important}
  .wz-bar{position:relative;background:#fffdf8;border-bottom:1px solid #e6dfd2;padding:12px 16px}
  .wz-bar ol{display:flex;gap:6px;list-style:none;margin:0 auto;padding:0;max-width:960px;overflow-x:auto}
  .wz-bar li button{border:1px solid #d9d2c4;background:#fff;border-radius:999px;padding:6px 12px;font-size:13px;white-space:nowrap;cursor:pointer;color:#344}
  .wz-bar li button[aria-current="step"]{background:#173a2e;color:#fff;border-color:#173a2e}
  .wz-bar li button.wz-done{border-color:#7aa48f;color:#1f5b43}
  .wz-head{max-width:960px;margin:14px auto 0;padding:0 16px}
  .wz-head h2{margin:0;font-size:22px}.wz-head p{margin:4px 0 0;color:#4d5a55}
  .wz-nav{display:flex;justify-content:space-between;gap:8px;max-width:960px;margin:16px auto 28px;padding:0 16px}
  .wz-nav button{padding:12px 20px;border-radius:10px;font-size:15px;cursor:pointer;border:1px solid #173a2e}
  .wz-next{background:#173a2e;color:#fff}.wz-prev{background:#fff;color:#173a2e}
  .wz-err{color:#a33b44;max-width:960px;margin:8px auto 0;padding:0 16px;min-height:1em}
  .wz-full{background:none;border:0;color:#2f5f86;text-decoration:underline;cursor:pointer;font-size:13px}
  .wz-on #studio .studio-intro{display:none}
  .wz-on [data-studio-save],.wz-on [data-studio-export]{display:none!important}
  html:not(.wz-on) .wz-head,html:not(.wz-on) .wz-nav,html:not(.wz-on) .wz-err{display:none}
  `;
  style.textContent += `
  #draftStatus.wz-status{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#eef5f1;color:#1f4d3c;font-size:14px;font-weight:600}
  #draftStatus.wz-status[data-state="error"]{background:#fbecec;color:#8a2430}
  `;
  document.head.appendChild(style);

  // Save/publish results are written to #draftStatus, which lives in the
  // studio intro that the wizard hides. Move it right under the action
  // buttons so every success or error message is visible where the click happened.
  const draftStatus = document.querySelector('#draftStatus');
  const buttonsRow = form.querySelector('.studio-buttons');
  if (draftStatus && buttonsRow) {
    draftStatus.classList.add('wz-status');
    draftStatus.setAttribute('role', 'status');
    draftStatus.setAttribute('aria-live', 'polite');
    buttonsRow.after(draftStatus);
  }

  const bar = document.createElement('nav');
  bar.className = 'wz-bar';
  bar.setAttribute('aria-label', '상품 등록 단계');
  bar.innerHTML = `<ol>${steps.map((s, i) => `<li><button type="button" data-wz="${i}">${i + 1}. ${s.title}</button></li>`).join('')}<li><button type="button" class="wz-full" data-wz-full>전체 화면 보기</button></li></ol>`;
  const head = document.createElement('div');
  head.className = 'wz-head';
  head.innerHTML = '<h2 data-wz-title></h2><p data-wz-hint></p>';
  const err = document.createElement('p');
  err.className = 'wz-err';
  err.setAttribute('role', 'alert');
  const nav = document.createElement('div');
  nav.className = 'wz-nav';
  nav.innerHTML = '<button type="button" class="wz-prev" data-wz-prev>이전</button><button type="button" class="wz-next" data-wz-next>다음</button>';
  main.prepend(head);
  main.prepend(bar);
  head.after(err);

  let current = 0;
  const signedIn = () => Boolean(document.querySelector('#sellerLogin')?.hidden);

  function visibleFor(step) {
    if (step.show) return step.show();
    return [studio];
  }

  function apply() {
    document.documentElement.classList.add('wz-on');
    const step = steps[current];
    const keep = new Set(visibleFor(step));
    [...main.children].forEach((el) => {
      if (el === bar || el === head || el === err || el === nav) return;
      el.classList.toggle('wz-hide', !keep.has(el));
    });
    const wanted = new Set((step.fields || []).map(byLegend).filter(Boolean));
    // The optional store block only appears in the wizard when a store name is
    // already filled in, so a half-filled store can never silently block saving.
    if (step.optionalStore && String(form.elements.storeName?.value || '').trim()) wanted.add(byLegend(3));
    fieldsets.forEach((f) => f.classList.toggle('wz-hide', !wanted.has(f)));
    form.querySelector('.studio-buttons')?.classList.toggle('wz-hide', !step.buttons);
    draftStatus?.classList.toggle('wz-hide', !step.buttons);
    const last = [...keep].pop();
    (last || main).after(nav);
    head.querySelector('[data-wz-title]').textContent = `${current + 1}단계 · ${step.title}`;
    head.querySelector('[data-wz-hint]').textContent = step.hint;
    bar.querySelectorAll('[data-wz]').forEach((b) => {
      const i = Number(b.dataset.wz);
      if (i === current) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.classList.toggle('wz-done', i < current);
    });
    nav.querySelector('[data-wz-prev]').style.visibility = current === 0 ? 'hidden' : 'visible';
    nav.querySelector('[data-wz-next]').textContent = current === steps.length - 1 ? '완료' : '다음';
    err.textContent = '';
    store.set(current);
  }

  function missing(step) {
    return (step.required || []).filter((name) => {
      const field = form.elements[name];
      if (!field || field.closest('fieldset')?.disabled) return false;
      if (name === 'price' && form.elements.saleType?.value !== 'direct') return false;
      return !String(field.value || '').trim();
    });
  }

  function go(i, { validate = false } = {}) {
    const target = Math.max(0, Math.min(steps.length - 1, i));
    if (target > 0 && !signedIn()) { current = 0; apply(); err.textContent = '먼저 Google로 로그인해 주세요.'; return; }
    if (validate && target > current) {
      const miss = missing(steps[current]);
      if (form.elements.saleType?.value === 'direct' && current === 2 && !String(form.elements.stockQuantity?.value || '').trim()) miss.push('stockQuantity');
      if (miss.length) {
        const label = (n) => form.elements[n]?.closest('label')?.childNodes[0]?.textContent?.trim() || n;
        err.textContent = `필수 입력: ${miss.map(label).join(', ')}`;
        form.elements[miss[0]]?.focus();
        return;
      }
    }
    current = target;
    apply();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  bar.addEventListener('click', (e) => {
    const full = e.target.closest('[data-wz-full]');
    if (full) {
      const on = document.documentElement.classList.toggle('wz-on');
      if (!on) document.querySelectorAll('.wz-hide').forEach((el) => el.classList.remove('wz-hide'));
      else apply();
      full.textContent = on ? '전체 화면 보기' : '단계별 보기';
      return;
    }
    const b = e.target.closest('[data-wz]');
    if (b) go(Number(b.dataset.wz), { validate: Number(b.dataset.wz) === current + 1 });
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('[data-wz-prev]')) go(current - 1);
    if (e.target.closest('[data-wz-next]')) {
      if (current === steps.length - 1) { document.querySelector('[data-wz-full]')?.click(); return; }
      go(current + 1, { validate: true });
    }
  });

  // Sections such as #commerceReadiness are inserted later by other scripts.
  // Store slug: derive one automatically when a store name is typed and the
  // slug is still empty (Korean-only names get a short random latin slug).
  const storeName = form.elements.storeName;
  const storeSlug = form.elements.storeSlug;
  const autoSlug = () => {
    if (!storeName || !storeSlug || String(storeSlug.value || '').trim()) return;
    const name = String(storeName.value || '').trim();
    if (!name) return;
    const latin = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    storeSlug.value = latin.length >= 3 ? latin : `store-${Math.random().toString(36).slice(2, 8)}`;
    storeSlug.dispatchEvent(new Event('input', { bubbles: true }));
  };
  storeName?.addEventListener('change', autoSlug);
  form.addEventListener('click', (e) => { if (e.target.closest('[data-server-save],[data-server-publish]')) autoSlug(); }, true);

  const own = new Set([bar, head, err, nav]);
  new MutationObserver((records) => {
    if (!document.documentElement.classList.contains('wz-on')) return;
    const foreign = records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && !own.has(n)));
    if (foreign) apply();
  }).observe(main, { childList: true });

  const start = () => { current = signedIn() ? Math.max(1, store.get()) : 0; apply(); };
  start();
  // Auth state resolves asynchronously after the central-login handoff.
  const loginBtn = document.querySelector('#sellerLogin');
  if (loginBtn) new MutationObserver(() => { if (signedIn() && current === 0) go(1); })
    .observe(loginBtn, { attributes: true, attributeFilter: ['hidden'] });
})();
