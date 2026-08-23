(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const PANEL_ID = 'userAiTierOps';
  const PLAN_LABELS = Object.freeze({
    free:'FREE', flex:'FLEX', basic:'BASIC', plus:'PLUS', pro:'PRO', auto:'AUTO',
  });
  let snapshot = null;
  let loading = false;

  const token = () => {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function headers(extra = {}) {
    const current = token();
    return { ...(current ? { authorization:`Bearer ${current}` } : {}), ...extra };
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      cache:'no-store',
      ...options,
      headers:headers(options.headers || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `User AI Ops ${response.status}`);
    return data;
  }

  function installStyle() {
    if (document.querySelector('#userAiTierOpsStyle')) return;
    const style = document.createElement('style');
    style.id = 'userAiTierOpsStyle';
    style.textContent = `
      #${PANEL_ID}{margin-bottom:14px}
      #${PANEL_ID} .user-ai-ops-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      #${PANEL_ID} .user-ai-ops-head small{display:block;opacity:.68;letter-spacing:.08em;margin-bottom:3px}
      #${PANEL_ID} .user-ai-ops-head h3{margin:0}
      #${PANEL_ID} .user-ai-ops-note{margin:5px 0 0;opacity:.72;font-size:12px;line-height:1.45}
      #${PANEL_ID} .user-ai-ops-summary{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
      #${PANEL_ID} .user-ai-ops-chip{border:1px solid var(--ekodi-ui-border,#24425E);border-radius:999px;padding:6px 9px;font-size:12px;background:rgba(255,255,255,.025)}
      #${PANEL_ID} .user-ai-plan-scroll{overflow-x:auto}
      #${PANEL_ID} table{width:100%;border-collapse:collapse;min-width:720px}
      #${PANEL_ID} th,#${PANEL_ID} td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--ekodi-ui-border,#24425E);font-size:12px;vertical-align:middle}
      #${PANEL_ID} th{opacity:.65;font-weight:600}
      #${PANEL_ID} input[type=number]{width:92px;box-sizing:border-box;padding:7px 8px;border-radius:9px;border:1px solid var(--ekodi-ui-border,#24425E);background:rgba(0,0,0,.14);color:inherit}
      #${PANEL_ID} .user-ai-actions{display:flex;gap:6px;white-space:nowrap}
      #${PANEL_ID} .user-ai-actions button{padding:6px 8px;border-radius:8px}
      #${PANEL_ID} .user-ai-source{opacity:.7}
      #${PANEL_ID} .user-ai-error{padding:10px;border:1px solid var(--ekodi-ui-border,#24425E);border-radius:10px;opacity:.85}
      @media(max-width:760px){#${PANEL_ID} .user-ai-ops-head{align-items:stretch;flex-direction:column}#${PANEL_ID} .user-ai-ops-head button{align-self:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function sponsoredByPlan() {
    const map = new Map();
    for (const row of snapshot?.usage?.byPlan || []) {
      if (row?.funding !== 'ekodi') continue;
      map.set(String(row.planId || ''), Number(row.requests || 0));
    }
    return map;
  }

  function personalRequests() {
    return (snapshot?.usage?.byPlan || []).filter(row => row?.funding === 'personal').reduce((sum, row) => sum + Number(row.requests || 0), 0);
  }

  function sponsoredRequests() {
    return (snapshot?.usage?.byPlan || []).filter(row => row?.funding === 'ekodi').reduce((sum, row) => sum + Number(row.requests || 0), 0);
  }

  function connectionCount() {
    return (snapshot?.usage?.connectedProviders || []).reduce((sum, row) => sum + Number(row.connections || 0), 0);
  }

  function sourceLabel(source) {
    if (source === 'admin-override') return '관리자 설정';
    if (source === 'environment') return '운영 기본값';
    return '시스템 기본값';
  }

  function render() {
    const root = document.querySelector(`#${PANEL_ID}`);
    if (!root) return;
    if (!snapshot) {
      root.querySelector('[data-user-ai-body]').innerHTML = '<div class="user-ai-error">User AI 운영정보를 불러오는 중입니다.</div>';
      return;
    }
    const sponsored = sponsoredByPlan();
    const rows = (snapshot.plans || []).map(plan => `
      <tr data-user-ai-plan="${esc(plan.planId)}">
        <td><strong>${esc(PLAN_LABELS[plan.planId] || plan.planId)}</strong></td>
        <td><input data-user-ai-limit type="number" min="0" max="100000" step="1" value="${Number(plan.monthlyRequests || 0)}" aria-label="${esc(plan.planId)} 월 AI 한도"></td>
        <td>${Number(sponsored.get(plan.planId) || 0).toLocaleString('ko-KR')}회</td>
        <td class="user-ai-source">${esc(sourceLabel(plan.source))}</td>
        <td class="user-ai-actions"><button type="button" class="primary" data-user-ai-save>적용</button><button type="button" class="secondary" data-user-ai-reset>기본값</button></td>
      </tr>`).join('');
    const month = String(snapshot?.usage?.monthStart || '').slice(0, 7) || '이번 달';
    root.querySelector('[data-user-ai-body]').innerHTML = `
      <div class="user-ai-ops-summary">
        <span class="user-ai-ops-chip">${esc(month)} EKODI 지원 ${sponsoredRequests().toLocaleString('ko-KR')}회</span>
        <span class="user-ai-ops-chip">개인 API ${personalRequests().toLocaleString('ko-KR')}회</span>
        <span class="user-ai-ops-chip">개인 API 연결 ${connectionCount().toLocaleString('ko-KR')}건</span>
      </div>
      <div class="user-ai-plan-scroll"><table><thead><tr><th>회원단계</th><th>월 지원 한도</th><th>이번 달 성공 호출</th><th>설정 출처</th><th>운영</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="user-ai-ops-note">월 지원 한도는 사용자·사이트별로 적용됩니다. 0으로 설정하면 해당 단계의 EKODI 지원 AI만 중지되며 EKODI Core와 개인 API 우선 사용은 계속됩니다.</p>`;
  }

  async function load() {
    if (loading || !token()) return;
    loading = true;
    try {
      snapshot = await request('/api/control/user-ai');
      render();
    } catch (error) {
      const body = document.querySelector(`#${PANEL_ID} [data-user-ai-body]`);
      if (body) body.innerHTML = `<div class="user-ai-error">${esc(error?.message || 'User AI 운영정보를 읽지 못했습니다.')}</div>`;
    } finally {
      loading = false;
    }
  }

  async function save(row) {
    const planId = row?.dataset?.userAiPlan || '';
    const input = row?.querySelector('[data-user-ai-limit]');
    const monthlyRequests = Number(input?.value);
    if (!Number.isInteger(monthlyRequests) || monthlyRequests < 0 || monthlyRequests > 100000) {
      if (input) input.focus();
      return;
    }
    await request('/api/control/user-ai/limits', {
      method:'PUT',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ planId, monthlyRequests }),
    });
    snapshot = null;
    render();
    await load();
  }

  async function reset(row) {
    const planId = row?.dataset?.userAiPlan || '';
    if (!PLAN_LABELS[planId]) return;
    await request(`/api/control/user-ai/limits/${encodeURIComponent(planId)}`, { method:'DELETE' });
    snapshot = null;
    render();
    await load();
  }

  function mount() {
    const aiOps = document.querySelector('#aiOpsPanel');
    const observe = aiOps?.querySelector('.ai-ops-observe');
    if (!aiOps || !observe) return false;
    if (!document.querySelector(`#${PANEL_ID}`)) {
      installStyle();
      const section = document.createElement('section');
      section.id = PANEL_ID;
      section.className = 'ai-ops-block';
      section.innerHTML = `
        <div class="user-ai-ops-head"><div><small>USER AI · MEMBERSHIP CONTROL</small><h3>User AI 단계·사용량</h3><p class="user-ai-ops-note">개인 API 우선, 회원단계별 EKODI 지원 한도, 성공 호출량을 한 곳에서 관리합니다.</p></div><button type="button" class="secondary" data-user-ai-refresh>↻ 새로고침</button></div>
        <div data-user-ai-body><div class="user-ai-error">User AI 운영정보를 불러오는 중입니다.</div></div>`;
      observe.prepend(section);
      section.addEventListener('click', async event => {
        const row = event.target?.closest?.('[data-user-ai-plan]');
        try {
          if (event.target?.closest?.('[data-user-ai-save]')) await save(row);
          if (event.target?.closest?.('[data-user-ai-reset]')) await reset(row);
          if (event.target?.closest?.('[data-user-ai-refresh]')) await load();
        } catch (error) {
          const body = section.querySelector('[data-user-ai-body]');
          if (body) body.insertAdjacentHTML('afterbegin', `<div class="user-ai-error">${esc(error?.message || '설정을 반영하지 못했습니다.')}</div>`);
        }
      });
    }
    if (location.hash === '#ai-ops' || !snapshot) load();
    return true;
  }

  function boot() {
    if (mount()) return;
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
    window.setTimeout(() => observer.disconnect(), 30000);
  }

  boot();
  window.addEventListener('ekodi-admin-ready', boot);
  window.addEventListener('hashchange', () => { if (location.hash === '#ai-ops') { mount(); load(); } });
})();