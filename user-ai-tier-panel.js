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
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
      #${PANEL_ID}{max-width:1500px;margin:0 auto}
      #${PANEL_ID} .uam-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}
      #${PANEL_ID} .uam-head h2{margin:3px 0 5px;font-size:24px}
      #${PANEL_ID} .uam-head p{margin:0;opacity:.72;font-size:13px;line-height:1.45}
      #${PANEL_ID} .uam-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;opacity:.58}
      #${PANEL_ID} .uam-card{border:1px solid var(--ekodi-ui-border,#24425E);border-radius:14px;overflow:hidden;background:rgba(8,20,34,.38)}
      #${PANEL_ID} .uam-scroll{overflow:auto;max-width:100%}
      #${PANEL_ID} table{width:100%;min-width:1130px;border-collapse:collapse}
      #${PANEL_ID} th,#${PANEL_ID} td{text-align:left;padding:11px 10px;border-bottom:1px solid var(--ekodi-ui-border,#24425E);font-size:12px;vertical-align:middle}
      #${PANEL_ID} th{position:sticky;top:0;z-index:1;background:rgba(9,24,39,.96);font-size:11px;opacity:.7;white-space:nowrap}
      #${PANEL_ID} tbody tr:last-child td{border-bottom:0}
      #${PANEL_ID} .uam-plan{font-weight:850;font-size:13px}
      #${PANEL_ID} .uam-limit{display:flex;align-items:center;gap:6px;white-space:nowrap}
      #${PANEL_ID} input{width:74px;padding:7px 8px;border-radius:8px;border:1px solid var(--ekodi-ui-border,#24425E);background:rgba(0,0,0,.16);color:inherit}
      #${PANEL_ID} .uam-save{padding:7px 9px;min-height:0}
      #${PANEL_ID} .uam-badge{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--ekodi-ui-border,#24425E);border-radius:999px;padding:5px 8px;white-space:nowrap}
      #${PANEL_ID} .uam-badge[data-state="ok"]:before{content:'●';font-size:8px}
      #${PANEL_ID} .uam-badge[data-state="fallback"]:before{content:'◆';font-size:8px}
      #${PANEL_ID} .uam-badge[data-state="idle"]:before{content:'○';font-size:8px}
      #${PANEL_ID} .uam-note{margin:10px 2px 0;font-size:11px;line-height:1.5;opacity:.62}
      #${PANEL_ID} .uam-error{padding:14px;border:1px solid var(--ekodi-ui-border,#24425E);border-radius:12px}
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
    if (!allowed) return { provider:'개인 API 우선', state:'idle', outage:'EKODI AI 중지' };
    if (openai.available) return { provider:`OpenAI · ${openai.model || 'EKODI'}`, state:'ok', outage:'장애 감지 없음' };
    if (providerSnapshot) return { provider:'개인 API 우선', state:'fallback', outage:'Fallback 작동' };
    return { provider:'확인 중', state:'idle', outage:'확인 중' };
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

    const fallback = '개인 API → EKODI → 개인 Web → Core';
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
        <td><span class="uam-badge" data-state="${esc(provider.state)}">${esc(provider.outage)}</span></td>
        <td>${esc(fallback)}</td>
        <td>${esc(personalView(plan.planId))}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `<div class="uam-card"><div class="uam-scroll"><table>
      <thead><tr><th>회원단계</th><th>AI 허용량</th><th>사용량</th><th>비용</th><th>현재 공급자</th><th>장애상태</th><th>Fallback</th><th>개인 API 여부</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>
    <p class="uam-note">사용량은 이번 달 성공 호출 기준입니다. 비용은 현재 EKODI 부담 여부를 표시하며, 공급자 실비 금액은 별도 청구 원장 연동 전까지 과장된 추정값을 표시하지 않습니다. 허용량 0은 EKODI 지원 AI만 중지하고 Core와 개인 API 경로는 유지합니다.</p>`;
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
        <div><div class="uam-kicker">AI MEMBERSHIP OPERATIONS</div><h2>AI 회원운영</h2><p>회원단계별 AI 사용 상태를 운영자가 필요한 정보만 간단히 확인하고 허용량을 바로 조정합니다.</p></div>
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