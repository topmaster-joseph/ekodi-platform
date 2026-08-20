(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  let mounted = false;

  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function headers(json = false) { const value = token(); const result = value ? { authorization:`Bearer ${value}` } : {}; if (json) result['content-type'] = 'application/json'; return result; }
  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers:{ ...headers(Boolean(options.body)), ...(options.headers || {}) }, cache:'no-store' });
    const raw = await response.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { status:response.status, data });
    return data;
  }
  function won(value) { return `${Number(value || 0).toLocaleString('ko-KR')}원`; }

  function selectBooksPane(name) {
    const section = document.querySelector('#booksAdminSection');
    if (!section) return;
    section.querySelectorAll('[data-books-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.booksTab === name));
    section.querySelectorAll('[data-books-pane]').forEach(pane => { pane.hidden = pane.dataset.booksPane !== name; });
  }

  function install() {
    if (mounted || !token()) return;
    const section = document.querySelector('#booksAdminSection');
    const tabs = section?.querySelector('.books-tabs');
    if (!section || !tabs) return;
    mounted = true;

    let tab = tabs.querySelector('[data-books-tab="creator-billing"]');
    if (!tab) {
      tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'books-tab';
      tab.dataset.booksTab = 'creator-billing';
      tab.textContent = 'Creator Billing';
      tabs.append(tab);
    }

    let pane = section.querySelector('[data-books-pane="creator-billing"]');
    if (!pane) {
      pane = document.createElement('div');
      pane.className = 'books-pane';
      pane.dataset.booksPane = 'creator-billing';
      pane.hidden = true;
      pane.innerHTML = `
        <section class="author-billing-admin" id="authorBillingAdmin">
          <div class="author-billing-admin-head">
            <div><small>CREATOR AI · PRICING</small><h3>Creator AI 유료회원 요금</h3></div>
            <button type="button" class="secondary compact" data-author-billing-refresh>↻ 새로고침</button>
          </div>
          <div class="author-billing-admin-status" data-author-billing-status>요금제와 결제상태를 확인하고 있습니다.</div>
          <div class="author-billing-admin-grid" data-author-billing-grid></div>
          <div class="author-billing-admin-actions"><button type="button" class="primary compact" data-author-billing-save>요금 설정 저장</button></div>
          <p class="author-billing-admin-note">Creator AI 요금은 Books · Creator 운영에 속합니다. 가격 변경은 새 구독에 적용되며 기존 월 약정금액은 자동 변경하지 않습니다. 0원 또는 비활성 상태에서는 신규 결제가 시작되지 않습니다.</p>
        </section>`;
      section.append(pane);
    }

    tab.addEventListener('click', () => {
      selectBooksPane('creator-billing');
      load(pane).catch(error => show(pane, error.message, 'error'));
    });
    pane.querySelector('[data-author-billing-refresh]')?.addEventListener('click', () => load(pane).catch(error => show(pane, error.message, 'error')));
    pane.querySelector('[data-author-billing-save]')?.addEventListener('click', () => save(pane).catch(error => show(pane, error.message, 'error')));
  }

  function show(panel, text, state = '') {
    const node = panel.querySelector('[data-author-billing-status]');
    if (!node) return;
    node.textContent = text;
    node.dataset.state = state;
  }

  function renderPlan(plan) {
    const card = document.createElement('article'); card.className = 'author-billing-admin-plan'; card.dataset.planId = plan.id;
    const identity = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = plan.label;
    const note = document.createElement('small'); note.textContent = plan.id === 'pro' ? '월 500 AI units' : '월 120 AI units';
    identity.append(name, note);
    const fields = document.createElement('div');
    const priceLabel = document.createElement('label'); priceLabel.textContent = '신규 구독 월 가격';
    const price = document.createElement('input'); price.type = 'number'; price.min = '0'; price.max = '10000000'; price.step = '100'; price.value = String(Number(plan.monthlyFee || 0)); price.dataset.price = 'true'; priceLabel.append(price);
    const toggle = document.createElement('label'); toggle.className = 'author-billing-admin-toggle';
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = Boolean(plan.enabled); enabled.dataset.enabled = 'true';
    toggle.append(enabled, document.createTextNode(' 신규 결제 활성'));
    fields.append(priceLabel, toggle); card.append(identity, fields); return card;
  }

  async function load(panel) {
    show(panel, 'Creator AI 요금제와 결제 연결상태를 불러오는 중입니다.');
    const data = await request('/api/author/billing/admin/plans');
    const grid = panel.querySelector('[data-author-billing-grid]'); grid.replaceChildren(...(data.plans || []).map(renderPlan));
    let subCount = 0, activeCount = 0;
    try {
      const subscriptions = await request('/api/author/billing/admin/subscriptions');
      subCount = (subscriptions.subscriptions || []).length;
      activeCount = (subscriptions.subscriptions || []).filter(item => item.paidAiActive).length;
    } catch {}
    if (!data.billingReady) show(panel, `요금 설정은 저장할 수 있지만 Toss 자동결제 계약키가 준비될 때까지 실제 신규 결제는 시작되지 않습니다. 구독 ${subCount}건 · 현재 유료 AI ${activeCount}명`, 'warn');
    else show(panel, `Toss 자동결제 연결 정상 · 구독 ${subCount}건 · 현재 유료 AI ${activeCount}명`);
  }

  async function save(panel) {
    const button = panel.querySelector('[data-author-billing-save]'); button.disabled = true; button.textContent = '저장 중…';
    try {
      const cards = [...panel.querySelectorAll('[data-plan-id]')];
      for (const card of cards) {
        const planId = card.dataset.planId;
        const monthlyFee = Number(card.querySelector('[data-price]')?.value || 0);
        const enabled = Boolean(card.querySelector('[data-enabled]')?.checked);
        if (!Number.isSafeInteger(monthlyFee) || monthlyFee < 0) throw new Error(`${planId.toUpperCase()} 가격을 확인해 주세요.`);
        if (enabled && monthlyFee <= 0) throw new Error(`${planId.toUpperCase()} 신규 결제를 활성화하려면 1원 이상의 가격이 필요합니다.`);
        await request('/api/author/billing/admin/plans', { method:'PUT', body:JSON.stringify({ planId, monthlyFee, enabled }) });
      }
      show(panel, `요금 설정을 저장했습니다. 새 구독에는 현재 가격이 적용됩니다. (${cards.map(card => `${card.dataset.planId.toUpperCase()} ${won(card.querySelector('[data-price]')?.value)}`).join(' · ')})`);
      await load(panel);
    } finally {
      button.disabled = false;
      button.textContent = '요금 설정 저장';
    }
  }

  function ready() {
    if (document.querySelector('#booksAdminSection') && token()) install();
  }
  window.addEventListener('ekodi-feature-installed', event => { if (event.detail?.section === 'books') ready(); });
  window.addEventListener('ekodi-admin-ready', ready);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once:true }); else ready();
})();
