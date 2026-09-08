(() => {
  'use strict';
  if (window.EKODIAIOperationsCenter) return;

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const ROOT_ID = 'aiOperationsCenter';
  const TABS = [
    ['overview', '개요'],
    ['agents', '에이전트'],
    ['providers', '공급자·모델'],
    ['routing', '협업·라우팅'],
    ['audit', '승인·감사'],
  ];
  const state = { governance: null, provider: null, actions: [], active: 'overview', error: '', loading: false };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  const authHeaders = (json = false, extra = {}) => {
    const headers = { ...extra };
    const current = token();
    if (current) headers.authorization = `Bearer ${current}`;
    if (json) headers['content-type'] = 'application/json';
    return headers;
  };

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error || data?.code || `API ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function installStyles() {
    if (document.querySelector('#ekodiAiOperationsCenterStyles')) return;
    const style = document.createElement('style');
    style.id = 'ekodiAiOperationsCenterStyles';
    style.textContent = `
      #${ROOT_ID}{margin:16px 0 20px;border:1px solid rgba(99,132,165,.25);border-radius:18px;background:linear-gradient(180deg,rgba(10,31,50,.94),rgba(6,22,37,.9));overflow:hidden}
      .aic-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 20px 14px;border-bottom:1px solid rgba(116,148,180,.18)}
      .aic-head h3{margin:2px 0 5px;font-size:20px}.aic-head p{margin:0;color:#a9bfd2;max-width:800px;line-height:1.55}.aic-kicker{font-size:11px;letter-spacing:.14em;color:#79a9cd}
      .aic-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.aic-btn{appearance:none;border:1px solid rgba(132,163,194,.28);background:rgba(17,48,73,.78);color:#e9f2f8;border-radius:10px;padding:9px 11px;font:inherit;cursor:pointer}.aic-btn:hover{border-color:rgba(143,194,232,.65);background:rgba(25,62,91,.9)}.aic-btn.primary{background:#e6f2f9;color:#123148;border-color:#e6f2f9;font-weight:700}.aic-btn.danger{border-color:rgba(222,118,118,.5);color:#ffd6d6}.aic-btn:disabled{opacity:.5;cursor:not-allowed}
      .aic-tabs{display:flex;gap:6px;overflow:auto;padding:10px 14px;border-bottom:1px solid rgba(116,148,180,.16);background:rgba(5,19,32,.42);scrollbar-width:none}.aic-tabs::-webkit-scrollbar{display:none}.aic-tab{white-space:nowrap;border:0;border-radius:9px;padding:9px 12px;background:transparent;color:#9eb6c9;cursor:pointer;font:inherit}.aic-tab.is-active{background:rgba(101,157,197,.18);color:#f4fbff;font-weight:700}
      .aic-body{padding:16px 18px 20px}.aic-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.aic-card{border:1px solid rgba(119,151,181,.2);border-radius:14px;background:rgba(8,28,45,.7);padding:14px}.aic-card small{display:block;color:#7898b1;margin-bottom:5px}.aic-card strong{display:block;color:#f2f7fa;font-size:16px}.aic-card span{display:block;color:#9db2c2;font-size:12px;margin-top:5px;line-height:1.45}
      .aic-section{margin-top:14px}.aic-section:first-child{margin-top:0}.aic-section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:9px}.aic-section-head h4{margin:0;font-size:15px}.aic-note{font-size:12px;color:#8ea7ba}.aic-list{display:grid;gap:8px}.aic-row{display:grid;grid-template-columns:minmax(150px,1.15fr) minmax(130px,.9fr) minmax(110px,.7fr) minmax(180px,1.3fr) auto;gap:9px;align-items:center;border:1px solid rgba(119,151,181,.18);border-radius:12px;padding:10px;background:rgba(5,20,33,.52)}
      .aic-row.provider{grid-template-columns:minmax(150px,1.2fr) 90px 90px minmax(180px,1.5fr) minmax(120px,.8fr) auto}.aic-row.route{grid-template-columns:minmax(120px,.8fr) minmax(150px,1fr) minmax(180px,1.4fr) minmax(180px,1.3fr) auto}.aic-row.audit{grid-template-columns:105px minmax(140px,1fr) minmax(160px,1.2fr) minmax(130px,.9fr) auto}.aic-row input,.aic-row select{width:100%;box-sizing:border-box;border:1px solid rgba(129,158,186,.28);border-radius:8px;background:#0b263d;color:#edf6fb;padding:8px 9px;font:inherit}.aic-row input[type=checkbox]{width:auto}.aic-name strong{font-size:14px}.aic-name small{margin:3px 0 0}.aic-status{font-size:12px;padding:5px 8px;border-radius:999px;background:rgba(123,154,178,.15);display:inline-block;color:#bdd0de}.aic-status.healthy{background:rgba(75,163,128,.15);color:#a8e5c9}.aic-status.error,.aic-status.awaiting_human{background:rgba(194,102,102,.18);color:#ffd0d0}.aic-status.unconfigured{background:rgba(196,151,72,.16);color:#f4d9a5}.aic-inline{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.aic-secret{display:grid;grid-template-columns:minmax(160px,1fr) auto;gap:6px;margin-top:8px}.aic-secret input{min-width:0}.aic-message{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:rgba(116,157,189,.12);color:#bcd0de;font-size:13px}.aic-message.error{background:rgba(185,85,85,.14);color:#ffd0d0}.aic-empty{padding:22px;text-align:center;color:#91a8ba;border:1px dashed rgba(120,151,181,.22);border-radius:12px}.aic-policy{display:flex;gap:7px;flex-wrap:wrap}.aic-pill{border:1px solid rgba(120,154,184,.24);background:rgba(14,44,66,.62);border-radius:999px;padding:6px 9px;font-size:12px;color:#bad0df}.aic-split{display:grid;grid-template-columns:1fr 1fr;gap:12px}.aic-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
      @media(max-width:1050px){.aic-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.aic-row,.aic-row.provider,.aic-row.route,.aic-row.audit{grid-template-columns:1fr 1fr}.aic-row>*:last-child{grid-column:1/-1}.aic-split{grid-template-columns:1fr}}
      @media(max-width:680px){.aic-head{display:block}.aic-head-actions{justify-content:flex-start;margin-top:12px}.aic-grid{grid-template-columns:1fr}.aic-row,.aic-row.provider,.aic-row.route,.aic-row.audit{grid-template-columns:1fr}.aic-body{padding:13px}.aic-row>*:last-child{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function navigate(section) {
    if (window.EKODIAdminPanels?.activate) {
      try { window.EKODIAdminPanels.activate(section); return; } catch {}
    }
    const selector = `.sidebar [data-section="${section}"],.sidebar [data-lazy-section="${section}"],.sidebar [data-demand-feature="${section}"]`;
    const button = document.querySelector(selector);
    if (button) { button.click(); return; }
    location.hash = section === 'aiops' ? '#ai-ops' : `#${section}`;
  }

  function healthClass(value) {
    const key = String(value || 'unknown').toLowerCase();
    if (key === 'healthy' || key === 'verified') return 'healthy';
    if (key === 'error' || key === 'failed' || key === 'critical' || key === 'awaiting_human') return 'error';
    if (key === 'unconfigured') return 'unconfigured';
    return '';
  }

  function setActive(tab) {
    if (!TABS.some(([id]) => id === tab)) return;
    state.active = tab;
    const root = document.querySelector(`#${ROOT_ID}`);
    root?.querySelectorAll('.aic-tab').forEach(button => button.classList.toggle('is-active', button.dataset.aicTab === tab));
    renderBody();
  }

  function summaryCards() {
    const agents = state.governance?.agents || [];
    const providers = state.provider?.providers || [];
    const routes = state.provider?.routes || [];
    const awaiting = state.actions.filter(item => item.status === 'awaiting_human').length;
    const healthy = providers.filter(item => item.health === 'healthy').length;
    return `
      <div class="aic-grid">
        <article class="aic-card"><small>AGENTS</small><strong>${agents.length || 0}개</strong><span>헌법·미션 거버넌스에 등록된 전문 에이전트</span></article>
        <article class="aic-card"><small>PROVIDERS</small><strong>${providers.length || 0}개 · 정상 ${healthy}</strong><span>OpenAI 포함 교체 가능한 AI 공급자</span></article>
        <article class="aic-card"><small>CAPABILITY ROUTES</small><strong>${routes.length || 0}개</strong><span>업무별 Primary + Fallback 라우팅</span></article>
        <article class="aic-card"><small>HUMAN GATE</small><strong>${awaiting}건 대기</strong><span>사람의 결정 없이는 진행하지 않는 고영향 작업</span></article>
      </div>`;
  }

  function renderOverview() {
    const tiers = state.governance?.actionTiers || [];
    const provider = state.provider;
    return `${summaryCards()}
      <section class="aic-section"><div class="aic-section-head"><h4>운영 원칙</h4><span class="aic-note">EKODI가 통제권을 갖고 공급자는 교체 가능한 실행 자원으로 사용</span></div>
        <div class="aic-policy">${tiers.map(item => `<span class="aic-pill">${esc(item)}</span>`).join('') || '<span class="aic-pill">거버넌스 로딩 중</span>'}</div>
      </section>
      <div class="aic-split">
        <section class="aic-section aic-card"><small>PROVIDER CONTROL</small><strong>${provider?.control?.runtimeSyncReady ? '런타임 동기화 준비됨' : '런타임 동기화 점검 필요'}</strong><span>모델·우선순위·활성화 변경은 서버측 런타임과 동기화되며 감사기록을 남깁니다.</span></section>
        <section class="aic-section aic-card"><small>SECRET BOUNDARY</small><strong>Secret value 반환 금지</strong><span>키는 연결 시에만 서버로 전달하고 화면에는 다시 표시하지 않습니다.</span></section>
      </div>`;
  }

  function renderAgents() {
    const agents = state.governance?.agents || [];
    if (!agents.length) return '<div class="aic-empty">에이전트 거버넌스 정보를 불러오지 못했습니다.</div>';
    return `<section class="aic-section"><div class="aic-section-head"><h4>전문 에이전트 역할</h4><span class="aic-note">이 역할과 금지선은 운영 토글이 아니라 헌법·미션 거버넌스 영역입니다.</span></div><div class="aic-list">${agents.map(agent => `
      <article class="aic-row">
        <div class="aic-name"><strong>${esc(agent.name)}</strong><small>${esc(agent.id)}</small></div>
        <div><small>Escalate</small><span>${esc((agent.mustEscalate || []).slice(0, 3).join(', ') || '없음')}</span></div>
        <div><small>Must not</small><span>${esc((agent.mustNot || []).slice(0, 3).join(', ') || '없음')}</span></div>
        <div><small>권한 모델</small><span>최소권한 · 위임범위 · 감사가능</span></div>
        <div><span class="aic-status">정책관리</span></div>
      </article>`).join('')}</div></section>`;
  }

  function providerRow(item) {
    const runtime = item.runtime || {};
    return `<article class="aic-row provider" data-provider-id="${esc(item.id)}">
      <div class="aic-name"><strong>${esc(item.name || item.id)}</strong><small>${esc(item.id)} · ${esc(item.costClass || '')}</small><div class="aic-secret"><input type="password" autocomplete="new-password" data-provider-secret placeholder="새 API Key 연결"><button class="aic-btn" type="button" data-provider-secret-save>키 연결</button></div></div>
      <label><small>활성</small><input type="checkbox" data-provider-enabled ${item.enabled ? 'checked' : ''}></label>
      <label><small>우선순위</small><input type="number" min="1" max="999" data-provider-priority value="${Number(item.priority || 100)}"></label>
      <label><small>기본 모델</small><input type="text" maxlength="120" data-provider-model value="${esc(item.model || '')}"></label>
      <div><span class="aic-status ${healthClass(item.health)}">${esc(item.health || 'unknown')}</span><small>${item.configured ? '키 연결됨' : '키 미연결'} · ${item.inSync ? 'runtime sync' : 'sync 필요'}</small><small>${esc(runtime.model || '')}</small></div>
      <div class="aic-actions"><button class="aic-btn" type="button" data-provider-check>상태점검</button><button class="aic-btn primary" type="button" data-provider-save>저장</button></div>
    </article>`;
  }

  function renderProviders() {
    const providers = state.provider?.providers || [];
    if (!providers.length) return '<div class="aic-empty">공급자 레지스트리를 불러오지 못했습니다.</div>';
    return `<section class="aic-section"><div class="aic-section-head"><h4>AI 공급자·모델</h4><span class="aic-note">OpenAI는 EKODI Core 아래의 한 Provider입니다. 저장은 명시적 관리자 동작으로만 실행됩니다.</span></div><div class="aic-list">${providers.map(providerRow).join('')}</div></section>`;
  }

  function renderRouting() {
    const routes = state.provider?.routes || [];
    const providers = state.provider?.providers || [];
    if (!routes.length) return '<div class="aic-empty">Capability 라우팅을 불러오지 못했습니다.</div>';
    const options = selected => providers.map(item => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.name || item.id)}</option>`).join('');
    return `<section class="aic-section"><div class="aic-section-head"><h4>Capability별 협업 라우팅</h4><span class="aic-note">Primary 실패 시 Fallback 순서로 안전하게 강등합니다.</span></div><div class="aic-list">${routes.map(route => `
      <article class="aic-row route" data-route-capability="${esc(route.capability)}">
        <div class="aic-name"><strong>${esc(route.capability)}</strong><small>capability</small></div>
        <label><small>Primary</small><select data-route-primary>${options(route.primaryProvider)}</select></label>
        <label><small>Fallbacks</small><input type="text" data-route-fallbacks value="${esc((route.fallbacks || []).join(', '))}" placeholder="gemini, anthropic"></label>
        <label><small>Model override</small><input type="text" maxlength="120" data-route-model value="${esc(route.modelOverride || '')}" placeholder="비우면 공급자 기본 모델"></label>
        <div class="aic-actions"><button class="aic-btn primary" type="button" data-route-save>라우팅 저장</button></div>
      </article>`).join('')}</div></section>`;
  }

  function renderAudit() {
    const actions = state.actions || [];
    if (!actions.length) return '<div class="aic-empty">최근 AI 실행·감사기록이 없습니다.</div>';
    return `<section class="aic-section"><div class="aic-section-head"><h4>최근 실행·Human Gate</h4><span class="aic-note">고영향 작업은 승인 또는 거절 전에는 실행되지 않습니다.</span></div><div class="aic-list">${actions.map(item => `
      <article class="aic-row audit" data-action-id="${Number(item.id)}">
        <div><span class="aic-status ${healthClass(item.status)}">${esc(item.status)}</span><small>#${Number(item.id)}</small></div>
        <div class="aic-name"><strong>${esc(item.agent_name || item.agent_id)}</strong><small>${esc(item.action_type || '')}</small></div>
        <div><strong>${esc(item.target || item.area || '-')}</strong><small>${esc(item.decision_reason || '')}</small></div>
        <div><small>${esc(item.created_at || '')}</small><span>${esc(item.requested_by || '')}</span></div>
        <div class="aic-actions">${item.status === 'awaiting_human' ? '<button class="aic-btn danger" type="button" data-action-reject>거절</button><button class="aic-btn primary" type="button" data-action-approve>승인</button>' : '<span class="aic-status">기록됨</span>'}</div>
      </article>`).join('')}</div></section>`;
  }

  function renderBody() {
    const root = document.querySelector(`#${ROOT_ID}`);
    const body = root?.querySelector('.aic-body');
    if (!body) return;
    const message = state.error ? `<p class="aic-message error">${esc(state.error)}</p>` : state.loading ? '<p class="aic-message">운영 상태를 동기화하는 중입니다.</p>' : '';
    const renderers = { overview: renderOverview, agents: renderAgents, providers: renderProviders, routing: renderRouting, audit: renderAudit };
    body.innerHTML = message + (renderers[state.active]?.() || renderOverview());
  }

  async function refresh() {
    state.loading = true; state.error = ''; renderBody();
    const headers = authHeaders();
    const results = await Promise.allSettled([
      api('/api/control/ai/governance', { headers }),
      api('/api/ai-modules/v1/providers/admin', { headers }),
      api('/api/control/ai/actions?limit=30', { headers }),
    ]);
    if (results[0].status === 'fulfilled') state.governance = results[0].value;
    if (results[1].status === 'fulfilled') state.provider = results[1].value;
    if (results[2].status === 'fulfilled') state.actions = results[2].value?.actions || [];
    const failures = results.filter(result => result.status === 'rejected');
    state.error = failures.length ? `일부 운영 데이터를 불러오지 못했습니다: ${failures.map(item => item.reason?.message || 'unknown').join(' · ')}` : '';
    state.loading = false; renderBody();
  }

  async function saveProvider(row) {
    const id = row?.dataset.providerId;
    if (!id) return;
    const enabled = Boolean(row.querySelector('[data-provider-enabled]')?.checked);
    const priority = Number(row.querySelector('[data-provider-priority]')?.value || 100);
    const defaultModel = row.querySelector('[data-provider-model]')?.value.trim() || '';
    if (!window.confirm(`${id} 공급자 설정을 서버 런타임에 적용하시겠습니까?`)) return;
    await api(`/api/ai-modules/v1/providers/admin/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: authHeaders(true, { 'x-ekodi-confirm-impact': 'ai-provider-runtime-update' }), body: JSON.stringify({ enabled, priority, defaultModel }),
    });
    await refresh();
  }

  async function checkProvider(row) {
    const id = row?.dataset.providerId;
    if (!id) return;
    await api(`/api/ai-modules/v1/providers/admin/${encodeURIComponent(id)}/check`, { method: 'POST', headers: authHeaders() });
    await refresh();
  }

  async function connectSecret(row) {
    const id = row?.dataset.providerId;
    const input = row?.querySelector('[data-provider-secret]');
    const value = input?.value.trim() || '';
    if (!id || value.length < 16) { state.error = 'API Key는 16자 이상이어야 합니다.'; renderBody(); return; }
    if (!window.confirm(`${id}의 새 비밀키를 서버 Secret Vault에 연결하시겠습니까? 기존 키 값은 화면에 반환되지 않습니다.`)) return;
    await api(`/api/ai-modules/v1/providers/admin/${encodeURIComponent(id)}/secret`, {
      method: 'POST', headers: authHeaders(true, { 'x-ekodi-confirm-impact': 'ai-provider-secret-connect' }), body: JSON.stringify({ value }),
    });
    if (input) input.value = '';
    await refresh();
  }

  async function saveRoute(row) {
    const capability = row?.dataset.routeCapability;
    if (!capability) return;
    const primaryProvider = row.querySelector('[data-route-primary]')?.value || '';
    const fallbacks = (row.querySelector('[data-route-fallbacks]')?.value || '').split(',').map(value => value.trim()).filter(Boolean).filter(value => value !== primaryProvider).slice(0, 3);
    const modelOverride = row.querySelector('[data-route-model]')?.value.trim() || '';
    if (!window.confirm(`${capability}의 AI 협업 라우팅을 변경하시겠습니까?`)) return;
    await api(`/api/ai-modules/v1/providers/admin/routes/${encodeURIComponent(capability)}`, {
      method: 'PUT', headers: authHeaders(true, { 'x-ekodi-confirm-impact': 'ai-provider-route-update' }), body: JSON.stringify({ primaryProvider, fallbacks, modelOverride }),
    });
    await refresh();
  }

  async function decideAction(row, decision) {
    const id = Number(row?.dataset.actionId);
    if (!id) return;
    const verb = decision === 'approve' ? '승인' : '거절';
    if (!window.confirm(`AI 작업 #${id}을(를) ${verb}하시겠습니까?`)) return;
    await api(`/api/control/ai/actions/${id}/decision`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ decision, note: 'AI 운영센터에서 명시적으로 결정' }) });
    await refresh();
  }

  function bind(root) {
    root.addEventListener('click', async event => {
      const tab = event.target.closest('[data-aic-tab]');
      if (tab) { setActive(tab.dataset.aicTab); return; }
      const jump = event.target.closest('[data-aic-jump]');
      if (jump) { navigate(jump.dataset.aicJump); return; }
      if (event.target.closest('[data-aic-refresh]')) { await refresh(); return; }
      const provider = event.target.closest('[data-provider-id]');
      const route = event.target.closest('[data-route-capability]');
      const action = event.target.closest('[data-action-id]');
      try {
        if (event.target.closest('[data-provider-save]')) await saveProvider(provider);
        else if (event.target.closest('[data-provider-check]')) await checkProvider(provider);
        else if (event.target.closest('[data-provider-secret-save]')) await connectSecret(provider);
        else if (event.target.closest('[data-route-save]')) await saveRoute(route);
        else if (event.target.closest('[data-action-approve]')) await decideAction(action, 'approve');
        else if (event.target.closest('[data-action-reject]')) await decideAction(action, 'reject');
      } catch (error) {
        state.error = error?.message || 'AI 운영센터 작업에 실패했습니다.';
        renderBody();
      }
    });
  }

  function install(panel) {
    if (!panel || panel.querySelector(`#${ROOT_ID}`)) return false;
    installStyles();
    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="aic-head">
        <div><span class="aic-kicker">EKODI AI CONTROL PLANE</span><h3>AI 운영센터</h3><p>에코디가 통제권을 유지한 채 전문 에이전트, OpenAI·Gemini·Anthropic, 모델·Fallback, Human Gate와 운영기록을 한곳에서 관리합니다.</p></div>
        <div class="aic-head-actions"><button class="aic-btn" type="button" data-aic-jump="health">상태·관측</button><button class="aic-btn" type="button" data-aic-jump="api-cost">API·비용</button><button class="aic-btn" type="button" data-aic-jump="openai">OpenAI 작업공간</button><button class="aic-btn primary" type="button" data-aic-refresh>↻ 동기화</button></div>
      </div>
      <nav class="aic-tabs" aria-label="AI 운영센터 세부메뉴">${TABS.map(([id, label], index) => `<button class="aic-tab ${index === 0 ? 'is-active' : ''}" type="button" data-aic-tab="${id}">${label}</button>`).join('')}</nav>
      <div class="aic-body"><p class="aic-message">운영 데이터를 불러오는 중입니다.</p></div>`;
    const head = panel.querySelector('.ai-ops-head');
    if (head?.nextSibling) panel.insertBefore(root, head.nextSibling); else panel.prepend(root);
    bind(root);
    refresh();
    return true;
  }

  function mount() {
    const existing = document.querySelector('#aiOpsPanel');
    if (existing) install(existing);
    const observer = new MutationObserver(() => {
      const panel = document.querySelector('#aiOpsPanel');
      if (panel && install(panel)) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
  window.EKODIAIOperationsCenter = Object.freeze({ mount, refresh, navigate, version: '1.0.0' });
})();
