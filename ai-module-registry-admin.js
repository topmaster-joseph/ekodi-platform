(() => {
  'use strict';
  const SECTION = 'ai-module-registry';
  const HASH = '#ai-module-registry';
  const PANEL_ID = 'aiModuleRegistryPanel';
  const API = 'https://api.ekodi.kr/api/ai-modules/v1/admin/registry';
  const TOKEN_KEY = 'ekodi-auth-token';
  const ASSET_QUERY = (() => { const src=document.currentScript?.src || ''; return src.includes('?') ? src.slice(src.indexOf('?')) : ''; })();
  let snapshot = null;
  let loading = false;
  let notice = '';

  function locale() {
    try {
      const value = window.EKODIAdminSidebar?.locale?.() || localStorage.getItem('ekodi-admin-locale') || document.documentElement.lang || 'ko';
      return String(value).toLowerCase().startsWith('en') ? 'en' : 'ko';
    } catch { return 'ko'; }
  }
  const t = (ko, en) => locale() === 'en' ? en : ko;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };

  async function api(path = '', options = {}) {
    const headers = new Headers(options.headers || {});
    const auth = token(); if (auth) headers.set('authorization', `Bearer ${auth}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache:'no-store', credentials:'omit' });    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.code || `registry_${response.status}`);
    return data;
  }

  function statusTargets(module) {
    const out = []; const ready = module.health === 'healthy' && module.secretConfigured;
    if (module.status === 'draft') out.push('validating');
    if (module.status === 'validating') { out.push('draft'); if (ready) out.push('staging'); }
    if (module.status === 'staging') { out.push('validating'); if (ready && !module.reference) out.push('production'); }
    if (module.status === 'production') out.push('staging');
    if (module.status === 'blocked') out.push('draft'); else out.push('blocked');
    return [...new Set(out)];
  }

  function statusText(status) {
    const map = {
      draft:t('등록대기','Draft'), validating:t('검증중','Validating'), staging:'Staging',
      production:t('운영','Production'), blocked:t('차단','Blocked'),
    };
    return map[status] || status;
  }

  function renderBody() {
    const body = document.querySelector(`#${PANEL_ID} [data-registry-body]`);
    if (!body) return;
    if (loading && !snapshot) { body.innerHTML = `<div class="aimr-empty">${t('등록 정보를 불러오는 중입니다.','Loading registry…')}</div>`; return; }
    const modules = snapshot?.modules || [];    const production = modules.filter(m => m.status === 'production').length;
    const staging = modules.filter(m => m.status === 'staging').length;
    const healthy = modules.filter(m => m.health === 'healthy').length;
    const stats = document.querySelector(`#${PANEL_ID} [data-registry-stats]`);
    if (stats) stats.innerHTML = [
      [t('관리 모듈','Managed'), modules.length], [t('운영','Production'), production],
      ['Staging', staging], [t('정상','Healthy'), healthy],
    ].map(([label,value]) => `<div class="aimr-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');

    if (!modules.length) {
      body.innerHTML = `<div class="aimr-empty">${t('등록된 관리형 외부 AI 모듈이 없습니다.','No managed external AI modules are registered.')}</div>`;
      return;
    }
    body.innerHTML = modules.map(module => {
      const actions = statusTargets(module).map(next => `<button type="button" class="aimr-mini" data-action="status" data-next="${esc(next)}">${esc(statusText(next))}</button>`).join('');
      const secret = module.reference ? `<span class="aimr-muted">${t('내장 모듈 · 비밀키 불필요','Built-in · no secret')}</span>` :
        `<div class="aimr-secret"><input type="password" autocomplete="new-password" data-secret placeholder="${t('API 비밀키 입력','API secret')}"><button type="button" class="aimr-mini" data-action="secret">${t('비밀키 연결','Connect secret')}</button></div>`;
      return `<article class="aimr-card" data-module-id="${esc(module.id)}">
        <div class="aimr-card-head"><div><b>${esc(module.name)}</b><span>${esc(module.vendor)} · ${esc(module.id)}</span></div><div class="aimr-badges"><span>${esc(statusText(module.status))}</span><span>${esc(module.health)}</span></div></div>
        <div class="aimr-meta"><span>${esc(module.endpoint)}</span><span>${esc((module.capabilities || []).join(', '))}</span><span>${t('비밀키','Secret')}: ${module.secretConfigured ? t('연결됨','configured') : t('미연결','missing')}</span></div>
        <div class="aimr-controls"><button type="button" class="aimr-mini primary" data-action="check">${t('계약 검증','Validate contract')}</button>${secret}<div class="aimr-status-actions">${actions}</div></div>
      </article>`;
    }).join('');  }

  function renderPanel() {
    const panel = document.querySelector(`#${PANEL_ID}`);
    if (!panel) return;
    panel.innerHTML = `<div class="aimr-head"><div><div class="aimr-kicker">EKODI EXTERNAL AI REGISTRY</div><h2>${t('외부 AI 모듈 등록센터','External AI Module Registry')}</h2><p>${t('등록 → 검증 → Staging → 운영 승격을 한 곳에서 관리합니다.','Register, validate, stage and promote external AI modules from one place.')}</p></div><button type="button" class="aimr-button" data-refresh>${t('새로고침','Refresh')}</button></div>
      <div class="aimr-stats" data-registry-stats></div>
      ${notice ? `<div class="aimr-notice">${esc(notice)}</div>` : ''}
      <details class="aimr-register"><summary>${t('새 모듈 등록','Register a new module')}</summary>
        <form data-register-form><div class="aimr-form-grid">
          <label>ID<input name="id" required placeholder="vendor.marketing-ai"></label><label>${t('모듈명','Name')}<input name="name" required></label>
          <label>${t('업체명','Vendor')}<input name="vendor" required></label><label>Version<input name="version" value="1.0.0"></label>
          <label class="wide">Endpoint<input name="endpoint" type="url" required placeholder="https://vendor.example.com"></label>
          <label class="wide">Capabilities<input name="capabilities" required placeholder="marketing.campaign, marketing.analysis"></label>
        </div><button class="aimr-button primary" type="submit">${t('등록대기에 추가','Add as draft')}</button></form>
      </details>
      <div class="aimr-body" data-registry-body></div>`;
    panel.querySelector('[data-refresh]')?.addEventListener('click', load);
    panel.querySelector('[data-register-form]')?.addEventListener('submit', registerModule);
    panel.querySelector('[data-registry-body]')?.addEventListener('click', handleAction);
    renderBody();
  }

  async function load() {
    if (loading || !token()) return;
    loading = true; renderBody();
    try { snapshot = await api(); notice = ''; }
    catch (error) { notice = error.message; }
    finally { loading = false; renderPanel(); }
  }
  async function registerModule(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const payload = {
      id: values.id, name: values.name, vendor: values.vendor, version: values.version,
      endpoint: values.endpoint,
      capabilities: String(values.capabilities || '').split(',').map(v => v.trim()).filter(Boolean),
    };
    try {
      snapshot = await api('', { method:'POST', body:JSON.stringify(payload) });
      notice = t('모듈을 등록대기에 추가했습니다.','Module added as draft.');
      form.reset();
    } catch (error) { notice = error.message; }
    renderPanel();
  }

  async function handleAction(event) {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const card = button.closest('[data-module-id]'); const id = card?.dataset?.moduleId || ''; if (!id) return;
    const action = button.dataset.action;
    button.disabled = true;
    try {
      if (action === 'check') {
        await api(`/${encodeURIComponent(id)}/check`, { method:'POST' });
        notice = t('계약·Health·실행 검증을 완료했습니다.','Contract, health and execution validation completed.');
      } else if (action === 'secret') {
        const input = card.querySelector('[data-secret]'); const value = input?.value || '';
        if (value.length < 16) throw new Error(t('비밀키는 16자 이상이어야 합니다.','Secret must be at least 16 characters.'));
        await api(`/${encodeURIComponent(id)}/secret`, { method:'POST', headers:{'x-ekodi-confirm-impact':'external-ai-module-secret-connect'}, body:JSON.stringify({ value }) });
        input.value = '';
        notice = t('비밀키를 런타임 Secret으로 연결했습니다.','Secret connected to runtime storage.');
      } else if (action === 'status') {
        const next = button.dataset.next || '';
        if ((next === 'production' || next === 'blocked') && !window.confirm(t(`${statusText(next)} 상태로 변경할까요?`, `Change status to ${statusText(next)}?`))) return;
        await api(`/${encodeURIComponent(id)}/status`, { method:'POST', headers:{'x-ekodi-confirm-impact':'external-ai-module-status-change'}, body:JSON.stringify({ status:next }) });
        notice = `${id} → ${statusText(next)}`;
      }
      snapshot = await api();
    } catch (error) { notice = error.message; }
    finally { renderPanel(); }
  }
  function activate(button, panel) {
    document.querySelectorAll('[data-panel]').forEach(node => {
      const visible = node === panel;
      node.classList.toggle('hidden-panel', !visible);
      node.hidden = !visible;
    });
    document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.toggle('active', item === button));
    const title = document.querySelector('#pageTitle'); if (title) title.textContent = t('외부 AI 모듈 등록센터','External AI Module Registry');
    document.querySelector('.sidebar')?.classList.remove('open');
    if (location.hash !== HASH) history.replaceState(null, '', HASH);
    renderPanel(); load();
  }

  function ensureStyle(){ if(document.querySelector('link[data-ai-module-registry-style]')) return; const x=document.createElement('link'); x.rel='stylesheet'; x.href='ai-module-registry-admin.css'+ASSET_QUERY; x.dataset.aiModuleRegistryStyle='1'; document.head.append(x); }

  function install() {
    ensureStyle();
    const nav = document.querySelector('.sidebar nav'); const content = document.querySelector('.content');
    if (!nav || !content) return;
    let button = nav.querySelector('[data-section="ai-module-registry"]');
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'nav'; button.dataset.section = SECTION;
      button.append(document.createTextNode('AI '), Object.assign(document.createElement('span'), { textContent:t('외부 AI 모듈','External AI Modules') }));
      const spec = nav.querySelector('[data-section="ai-module-spec"]'); if (spec) spec.insertAdjacentElement('afterend', button); else nav.append(button);
    }
    let panel = document.querySelector(`#${PANEL_ID}`);
    if (!panel) { panel = document.createElement('section'); panel.id = PANEL_ID; panel.className = 'section hidden-panel'; panel.dataset.panel = SECTION; panel.hidden = true; content.append(panel); }
    if (button.dataset.bound !== 'true') { button.dataset.bound = 'true'; button.addEventListener('click', () => activate(button, panel)); }
    renderPanel();
    if (location.hash === HASH) queueMicrotask(() => activate(button, panel));
  }

  install();
  window.addEventListener('ekodi-admin-ready', install);
  window.addEventListener('ekodi-admin-locale-changed', renderPanel);
  window.EKODIAIModuleRegistryAdmin = Object.freeze({ load, render:renderPanel });
})();