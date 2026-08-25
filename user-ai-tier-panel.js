(() => {
  'use strict';
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const SECTION = 'ai-membership';
  const PANEL_ID = 'userAiMembershipPanel';
  const LABELS = { free:'FREE', flex:'FLEX', basic:'BASIC', plus:'PLUS', pro:'PRO', auto:'AUTO' };
  let snapshot = null;
  let providerSnapshot = null;
  let loading = false;

  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const authHeaders = extra => ({ ...(token() ? { authorization:`Bearer ${token()}` } : {}), ...(extra || {}) });

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, { cache:'no-store', ...options, headers:authHeaders(options.headers) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `User AI ${response.status}`);
    return data;
  }

  function style() {
    if (document.querySelector('#userAiMembershipStyle')) return;
    const node = document.createElement('style');
    node.id = 'userAiMembershipStyle';
    node.textContent = `
      #${PANEL_ID}{max-width:1500px;margin:0 auto;color:var(--ekodi-ui-text,#10233b)}
      #${PANEL_ID} .uam-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px;padding:4px 2px}
      #${PANEL_ID} .uam-head h2{margin:4px 0 6px;font-size:28px;line-height:1.15;font-weight:900;letter-spacing:-.02em;color:var(--ekodi-ui-text,#10233b)}
      #${PANEL_ID} .uam-head p{margin:0;color:var(--ekodi-ui-muted,#526173);font-size:13px;line-height:1.55;font-weight:600}
      #${PANEL_ID} .uam-kicker{font-size:11px;font-weight:900;letter-spacing:.12em;color:#4f7ccf;text-transform:uppercase}
      #${PANEL_ID} .uam-card{border:1px solid var(--ekodi-ui-border,#9aabbd);border-radius:14px;overflow:hidden;background:var(--ekodi-ui-card,#fff);box-shadow:0 8px 24px rgba(15,35,58,.06)}
      #${PANEL_ID} .uam-scroll{overflow:auto;max-width:100%}
      #${PANEL_ID} table{width:100%;min-width:1130px;border-collapse:collapse}
      #${PANEL_ID} th,#${PANEL_ID} td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--ekodi-ui-border,#c7d1dc);font-size:12px;vertical-align:middle;color:var(--ekodi-ui-text,#10233b)}
      #${PANEL_ID} th{position:sticky;top:0;z-index:1;background:#e8eef5;font-size:11px;font-weight:900;color:#2e4054;white-space:nowrap;letter-spacing:.01em}
      #${PANEL_ID} tbody tr:nth-child(even){background:rgba(59,92,128,.035)}
      #${PANEL_ID} tbody tr:last-child td{border-bottom:0}
      #${PANEL_ID} .uam-plan{font-weight:900;font-size:13px}
      #${PANEL_ID} .uam-limit{display:flex;align-items:center;gap:6px;white-space:nowrap}
      #${PANEL_ID} input{width:74px;padding:7px 8px;border-radius:8px;border:1px solid #8497aa;background:#fff;color:#10233b;font-weight:700}
      #${PANEL_ID} .uam-save{padding:7px 9px;min-height:0;font-weight:800}
      #${PANEL_ID} .uam-badge{display:inline-flex;align-items:center;gap:5px;border:1px solid #9aabbd;border-radius:999px;padding:5px 8px;white-space:nowrap;font-weight:800;background:#f8fafc}
      #${PANEL_ID} .uam-badge[data-state="ok"]:before{content:'●';font-size:8px}
      #${PANEL_ID} .uam-badge[data-state="ready"]:before{content:'◆';font-size:8px}
      #${PANEL_ID} .uam-badge[data-state="idle"]:before{content:'○';font-size:8px}
      #${PANEL_ID} .uam-policy{font-weight:800;color:#173f68;white-space:nowrap}
      #${PANEL_ID} .uam-note{margin:11px 2px 0;font-size:11px;line-height:1.6;color:var(--ekodi-ui-muted,#617083)}
      #${PANEL_ID} .uam-error{padding:14px;border:1px solid var(--ekodi-ui-border,#9aabbd);border-radius:12px;background:#fff;color:#10233b}
      @media(max-width:760px){#${PANEL_ID} .uam-head{flex-direction:column}#${PANEL_ID} .uam-head button{width:100%}}
    `;
    document.head.appendChild(node);
  }

  function usage(planId, funding) {
    return (snapshot?.usage?.byPlan || [])
      .filter(row => row?.planId === planId && row?.funding === funding)
      .reduce((sum, row) => sum + Number(row.requests || 0), 0);
  }

  function connectionCount() {
    return (snapshot?.usage?.connectedProviders || []).reduce((sum, row) => sum + Number(row.connections || 0), 0);
  }

  function providerView(plan) {
    const openai = providerSnapshot?.openai || {};
    const allowed = Number(plan?.monthlyRequests || 0) > 0;
    if (!allowed) return { provider:'Core · 개인 API', state:'idle', status:'EKODI 지원 중지' };
    if (openai.available) return { provider:`EKODI 지원 가능 · ${openai.model || 'OpenAI'}`, state:'ok', status:'정상' };
    if (providerSnapshot) return { provider:'Core · 개인 API', state:'ready', status:'대체 경로 준비됨' };
    return { provider:'확인 중', state:'idle', status:'확인 중' };
  }

  function executionPolicy(plan) {
    return Number(plan?.monthlyRequests || 0) > 0
      ? 'Core 우선 · AI 필요 시 자동 선택'
      : 'Core 우선 · 개인 API 사용 가능';
  }

  function costView(planId) {
    const sponsored = usage(planId, 'ekodi');
    if (!sponsored) return '₩0';
    return 'EKODI 부담';
  }

  function personalView(planId) {
    const personal = usage(planId, 'personal');
    const connections = connectionCount();
    if (personal > 0) return `사용 중 · ${personal.toLocaleString('ko-KR')}회`;
    if (connections > 0) return `가능 · ${connections.toLocaleString('ko-KR')}건 연결`;
    return '연결 없음';
  }

  function render() {
    const body = document.querySelector(`#${PANEL_ID} [data-uam-body]`);
    if (!body) return;
    if (!snapshot) {
      body.innerHTML = '<div class="uam-error">AI 회원 운영정보를 불러오는 중입니다.</div>';
      return;
    }

    const rows = (snapshot.plans || []).map(plan => {
      const sponsored = usage(plan.planId, 'ekodi');
      const personal = usage(plan.planId, 'personal');
      const provider = providerView(plan);
      const usedText = `${sponsored.toLocaleString('ko-KR')} / ${Number(plan.monthlyRequests || 0).toLocaleString('ko-KR')}`;
      const personalHint = personal > 0 ? ` + 개인 ${personal.toLocaleString('ko-KR')}` : '';
      return `<tr data-plan="${esc(plan.planId)}">
        <td><span class="uam-plan">${esc(LABELS[plan.planId] || plan.planId)}</span></td>
        <td><div class="uam-limit"><input data-limit aria-label="${esc(LABELS[plan.planId] || plan.planId)} AI 허용량" type="number" min="0" max="100000" step="1" value="${Number(plan.monthlyRequests || 0)}"><button class="secondary uam-save" data-save type="button">저장</button></div></td>
        <td>${esc(usedText)}${esc(personalHint)}</td>
        <td>${esc(costView(plan.planId))}</td>
        <td>${esc(provider.provider)}</td>
        <td><span class="uam-badge" data-state="${esc(provider.state)}">${esc(provider.status)}</span></td>
        <td><span class="uam-policy">${esc(executionPolicy(plan))}</span></td>
        <td>${esc(personalView(plan.planId))}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `<div class="uam-card"><div class="uam-scroll"><table>
      <thead><tr><th>회원단계</th><th>AI 허용량</th><th>사용량</th><th>비용</th><th>AI 경로 상태</th><th>상태</th><th>실행 정책</th><th>개인 API 여부</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>
    <p class="uam-note">기본 원칙은 Core 우선입니다. AI가 꼭 필요한 요청에서만 개인 API 또는 EKODI 지원 AI를 자동 선택합니다. 개인 Web 전환은 사용자가 직접 참여하는 대화형 요청에서만 사용할 수 있으며, 자동화·백그라운드·관리자·시스템 실행은 소비자 Web 세션에 의존하지 않습니다. 허용량 0은 EKODI 지원 AI만 중지하며 Core와 개인 API 경로는 유지합니다.</p>`;
  }

  async function load() {
    if (loading || !token()) return;
    loading = true;
    try {
      const [membership, provider] = await Promise.all([
        api('/api/control/user-ai'),
        api('/api/control/ai/provider-status').catch(() => null),
      ]);
      snapshot = membership;
      providerSnapshot = provider;
      render();
    } catch (error) {
      const body = document.querySelector(`#${PANEL_ID} [data-uam-body]`);
      if (body) body.innerHTML = `<div class="uam-error">${esc(error.message)}</div>`;
    } finally {
      loading = false;
    }
  }

  async function save(row) {
    const planId = row?.dataset?.plan || '';
    const monthlyRequests = Number(row?.querySelector('[data-limit]')?.value);
    if (!LABELS[planId] || !Number.isInteger(monthlyRequests) || monthlyRequests < 0 || monthlyRequests > 100000) return;
    await api('/api/control/user-ai/limits', {
      method:'PUT',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ planId, monthlyRequests }),
    });
    await loadFresh();
  }

  async function loadFresh() {
    snapshot = null;
    providerSnapshot = null;
    render();
    await load();
  }

  function nav() { return document.querySelector('.sidebar nav'); }
  function panel() { return document.querySelector(`#${PANEL_ID}`); }

  function showSection() {
    document.querySelectorAll('[data-panel]').forEach(node => {
      const targets = String(node.dataset.panel || '').split(' ');
      node.classList.toggle('hidden-panel', !targets.includes(SECTION));
    });
    document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === SECTION));
    const title = document.querySelector('#pageTitle');
    if (title) title.textContent = 'AI 회원운영';
    document.querySelector('.sidebar')?.classList.remove('open');
    if (location.hash !== '#ai-membership') history.replaceState(null, '', '#ai-membership');
    render();
    load();
  }

  function installNav() {
    const root = nav();
    if (!root) return false;
    let button = root.querySelector('[data-section="ai-membership"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav';
      button.dataset.section = SECTION;
      button.innerHTML = '<span aria-hidden="true">◈</span><span>AI 회원운영</span>';
      const aiOps = root.querySelector('[data-section="aiops"]');
      if (aiOps?.nextSibling) root.insertBefore(button, aiOps.nextSibling);
      else if (aiOps) aiOps.insertAdjacentElement('afterend', button);
      else root.prepend(button);
    }
    if (button.dataset.userAiMembershipBound !== 'true') {
      button.dataset.userAiMembershipBound = 'true';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); showSection(); });
    }
    root.querySelector('[data-demand-feature="aimembers"]')?.remove();
    if (root.querySelector('[data-section="aiops"]')) root.querySelector('[data-demand-feature="aiops"]')?.remove();
    return true;
  }

  function installPanel() {
    if (panel()) return true;
    const content = document.querySelector('.content');
    if (!content) return false;
    style();
    const section = document.createElement('section');
    section.id = PANEL_ID;
    section.className = 'section hidden-panel';
    section.dataset.panel = SECTION;
    section.innerHTML = `
      <div class="uam-head">
        <div><div class="uam-kicker">AI MEMBERSHIP OPERATIONS</div><h2>AI 회원운영</h2><p>Core를 기본 실행층으로 두고, AI가 필요한 경우에만 회원단계와 연결상태에 따라 적절한 AI 경로를 선택합니다.</p></div>
        <button class="secondary" data-refresh type="button">↻ 새로고침</button>
      </div>
      <div data-uam-body><div class="uam-error">AI 회원 운영정보를 불러오는 중입니다.</div></div>`;
    section.addEventListener('click', async event => {
      const row = event.target?.closest?.('[data-plan]');
      try {
        if (event.target?.closest?.('[data-save]')) await save(row);
        else if (event.target?.closest?.('[data-refresh]')) await loadFresh();
      } catch (error) {
        const body = section.querySelector('[data-uam-body]');
        if (body) body.insertAdjacentHTML('afterbegin', `<div class="uam-error">${esc(error.message)}</div>`);
      }
    });
    content.prepend(section);
    return true;
  }

  function mount() {
    if (!installNav() || !installPanel()) return false;
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail:{ feature:'aimembers' } }));
    if (location.hash === '#ai-membership') showSection();
    return true;
  }

  function boot() {
    if (mount()) return;
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => observer.disconnect(), 30000);
  }

  boot();
  window.addEventListener('ekodi-admin-ready', boot);
  window.addEventListener('hashchange', () => { if (location.hash === '#ai-membership') { mount(); showSection(); } });
})();