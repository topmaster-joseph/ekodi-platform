(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const PANEL_ID = 'authProviderControlPanel';
  const MENU_KEY = 'auth-providers';
  const STYLE_ID = 'ekodi-auth-provider-control-style';

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(data.error || `API 요청 실패 (${response.status})`);
      error.code = data.code || '';
      throw error;
    }
    return data;
  }

  function el(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .auth-provider-control{max-width:1100px}
      .auth-provider-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:20px}
      .auth-provider-head h2{margin:4px 0 6px}.auth-provider-head p{margin:0;color:var(--ekodi-ui-muted,#9FB1C3);line-height:1.6}
      .auth-provider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0}
      .auth-provider-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:18px;border:1px solid var(--ekodi-ui-border,#24425E);border-radius:16px;background:var(--ekodi-ui-surface,#0B1D2E)}
      .auth-provider-card strong{display:block;font-size:16px}.auth-provider-card small{display:block;margin-top:5px;color:var(--ekodi-ui-muted,#9FB1C3);line-height:1.45}
      .auth-provider-card[data-configured="false"]{opacity:.68}
      .auth-provider-badge{display:inline-flex;margin-top:8px;padding:4px 8px;border-radius:999px;border:1px solid var(--ekodi-ui-border,#24425E);font-size:11px;font-weight:800}
      .auth-provider-card[data-configured="true"] .auth-provider-badge{color:#8ee7bc}.auth-provider-card[data-configured="false"] .auth-provider-badge{color:#ffd08a}
      .auth-provider-switch{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;font-weight:780}.auth-provider-switch input{width:20px;height:20px;accent-color:#8EC8FF}
      .auth-policy-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
      .auth-policy-box{padding:18px;border:1px solid var(--ekodi-ui-border,#24425E);border-radius:16px;background:var(--ekodi-ui-surface-raised,#10263A)}
      .auth-policy-box label{display:flex;align-items:center;justify-content:space-between;gap:16px;font-weight:800}.auth-policy-box p{margin:8px 0 0;color:var(--ekodi-ui-muted,#9FB1C3);font-size:13px;line-height:1.5}
      .auth-policy-box select{min-width:170px;padding:9px 11px;border:1px solid var(--ekodi-ui-border,#24425E);border-radius:10px;background:var(--ekodi-ui-surface,#0B1D2E);color:var(--ekodi-ui-text,#F4F7FB)}
      .auth-provider-actions{display:flex;align-items:center;gap:12px;margin-top:18px}.auth-provider-actions button{min-height:42px;padding:0 16px;border:0;border-radius:11px;background:#8EC8FF;color:#071522;font-weight:850;cursor:pointer}.auth-provider-actions button:disabled{opacity:.5;cursor:wait}
      .auth-provider-state{margin:0;color:var(--ekodi-ui-muted,#9FB1C3);font-size:13px}.auth-provider-state[data-kind="error"]{color:#ff9b9b}.auth-provider-state[data-kind="success"]{color:#8ee7bc}
      .auth-provider-note{padding:14px 16px;border-left:3px solid #8EC8FF;border-radius:10px;background:rgba(142,200,255,.08);color:var(--ekodi-ui-muted,#9FB1C3);line-height:1.6}
      @media(max-width:760px){.auth-provider-grid,.auth-policy-row{grid-template-columns:1fr}.auth-provider-head{display:block}.auth-provider-actions{align-items:flex-start;flex-direction:column}}
    `;
    document.head.append(style);
  }

  function activate(panel, button) {
    document.querySelectorAll('.sidebar .nav.active').forEach(node => node.classList.remove('active'));
    document.querySelectorAll('.content [data-panel]').forEach(node => {
      if (node !== panel) {
        node.classList.add('hidden-panel');
        node.hidden = true;
      }
    });
    panel.hidden = false;
    panel.classList.remove('hidden-panel');
    button.classList.add('active');
    if (location.hash !== `#${MENU_KEY}`) history.replaceState({}, document.title, `${location.pathname}${location.search}#${MENU_KEY}`);
  }

  function providerCard(provider) {
    const card = el('article', '', 'auth-provider-card');
    card.dataset.provider = provider.id;
    card.dataset.configured = String(provider.configured);
    const copy = el('div');
    copy.append(el('strong', provider.name));
    copy.append(el('small', provider.configured ? 'EKODI 인증 제공자로 연결되어 있습니다.' : '인증 연동을 완료한 뒤 활성화할 수 있습니다.'));
    copy.append(el('span', provider.configured ? (provider.enabled ? '사용 중' : '연결됨') : '연동 필요', 'auth-provider-badge'));
    const label = el('label', '', 'auth-provider-switch');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = provider.enabled;
    input.disabled = !provider.configured;
    input.dataset.providerToggle = provider.id;
    label.append(input, document.createTextNode('사용'));
    card.append(copy, label);
    return card;
  }

  async function install() {
    if (!token() || document.getElementById(PANEL_ID)) return;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return;
    installStyles();

    const button = el('button', '', 'nav');
    button.type = 'button';
    button.dataset.section = MENU_KEY;
    button.dataset.adminLink = MENU_KEY;
    button.append(document.createTextNode('⌁ '), el('span', '로그인 설정'));
    const adminButton = nav.querySelector('[data-section="admins"]');
    if (adminButton) adminButton.insertAdjacentElement('afterend', button);
    else nav.append(button);

    const panel = el('section', '', 'section auth-provider-control hidden-panel');
    panel.id = PANEL_ID;
    panel.dataset.panel = MENU_KEY;
    panel.hidden = true;

    const head = el('div', '', 'auth-provider-head');
    const heading = el('div');
    heading.append(el('p', 'IDENTITY · LOGIN', 'kicker'), el('h2', '로그인 설정'));
    heading.append(el('p', '에코디 전체 사용자·관리자 화면의 로그인 제공자 정책을 최고관리자가 관리합니다.'));
    head.append(heading);

    const note = el('p', '현재 기본값은 Google 단일 로그인입니다. 로그인 제공자가 하나뿐이면 사용자는 별도의 선택화면 없이 해당 인증창으로 바로 이동합니다.', 'auth-provider-note');
    const policyRow = el('div', '', 'auth-policy-row');
    const multiBox = el('div', '', 'auth-policy-box');
    const multiLabel = el('label');
    const multiToggle = document.createElement('input');
    multiToggle.type = 'checkbox';
    multiToggle.id = 'authMultiLoginToggle';
    multiLabel.append(document.createTextNode('멀티 로그인 사용'), multiToggle);
    multiBox.append(multiLabel, el('p', '켜면 2개 이상의 활성 제공자가 있을 때만 로그인 방식 선택창을 표시합니다.'));

    const defaultBox = el('div', '', 'auth-policy-box');
    const defaultLabel = el('label');
    const defaultSelect = document.createElement('select');
    defaultSelect.id = 'authDefaultProvider';
    defaultLabel.append(document.createTextNode('기본 로그인 방식'), defaultSelect);
    defaultBox.append(defaultLabel, el('p', '멀티 로그인이 꺼져 있거나 활성 제공자가 하나일 때 즉시 사용할 인증 방식입니다.'));
    policyRow.append(multiBox, defaultBox);

    const providerGrid = el('div', '', 'auth-provider-grid');
    const actions = el('div', '', 'auth-provider-actions');
    const save = el('button', '설정 저장');
    save.type = 'button';
    const state = el('p', '', 'auth-provider-state');
    state.setAttribute('role', 'status');
    actions.append(save, state);
    panel.append(head, note, policyRow, providerGrid, actions);
    content.append(panel);

    let latest = null;

    function render(policy) {
      latest = policy;
      multiToggle.checked = Boolean(policy.multiLoginRequested ?? policy.multiLoginEnabled);
      providerGrid.replaceChildren(...policy.providers.map(providerCard));
      defaultSelect.replaceChildren();
      policy.providers.filter(provider => provider.configured).forEach(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        option.selected = provider.id === policy.defaultProvider;
        defaultSelect.append(option);
      });
      const effective = policy.multiLoginEnabled ? '멀티 로그인 활성' : `현재 ${policy.defaultProvider === 'google' ? 'Google' : policy.defaultProvider} 바로 로그인`;
      state.textContent = effective;
      state.dataset.kind = '';
    }

    async function load() {
      state.textContent = '로그인 정책을 불러오는 중입니다…';
      state.dataset.kind = '';
      try {
        const data = await api('/api/admin/auth/providers');
        render(data.policy);
      } catch (error) {
        state.textContent = error.message;
        state.dataset.kind = 'error';
      }
    }

    save.addEventListener('click', async () => {
      if (!latest) return;
      const providers = {};
      panel.querySelectorAll('[data-provider-toggle]').forEach(input => { providers[input.dataset.providerToggle] = input.checked; });
      save.disabled = true;
      state.textContent = '저장하는 중입니다…';
      state.dataset.kind = '';
      try {
        const data = await api('/api/admin/auth/providers', {
          method: 'PUT',
          body: JSON.stringify({
            multiLoginEnabled: multiToggle.checked,
            defaultProvider: defaultSelect.value,
            providers
          })
        });
        render(data.policy);
        state.textContent = '로그인 설정을 저장했습니다.';
        state.dataset.kind = 'success';
      } catch (error) {
        state.textContent = error.message;
        state.dataset.kind = 'error';
      } finally {
        save.disabled = false;
      }
    });

    button.addEventListener('click', event => {
      event.preventDefault();
      activate(panel, button);
      void load();
    });

    if (location.hash === `#${MENU_KEY}`) {
      activate(panel, button);
      await load();
    }
  }

  const boot = () => void install().catch(error => console.error('[EKODI Admin] login provider control failed', error));
  if (document.documentElement.dataset.ekodiAdminReady === 'true') boot();
  window.addEventListener('ekodi-admin-ready', boot);
  window.addEventListener('ekodi-authenticated', boot);
})();
