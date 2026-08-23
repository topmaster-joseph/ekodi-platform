(() => {
  'use strict';
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const PANEL_ID = 'userAiTierOps';
  const LABELS = { free:'FREE', flex:'FLEX', basic:'BASIC', plus:'PLUS', pro:'PRO', auto:'AUTO' };
  let snapshot = null;
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
    if (document.querySelector('#userAiTierOpsStyle')) return;
    const node = document.createElement('style');
    node.id = 'userAiTierOpsStyle';
    node.textContent = `#${PANEL_ID}{margin-bottom:14px}#${PANEL_ID} .uat-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}#${PANEL_ID} .uat-head h3{margin:0}#${PANEL_ID} .uat-note{font-size:12px;opacity:.72;line-height:1.45}#${PANEL_ID} .uat-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}#${PANEL_ID} .uat-chip{border:1px solid var(--ekodi-ui-border,#24425E);border-radius:999px;padding:6px 9px;font-size:12px}#${PANEL_ID} .uat-scroll{overflow-x:auto}#${PANEL_ID} table{width:100%;min-width:700px;border-collapse:collapse}#${PANEL_ID} th,#${PANEL_ID} td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--ekodi-ui-border,#24425E);font-size:12px}#${PANEL_ID} th{opacity:.65}#${PANEL_ID} input{width:90px;padding:7px;border-radius:8px;border:1px solid var(--ekodi-ui-border,#24425E);background:rgba(0,0,0,.14);color:inherit}#${PANEL_ID} .uat-actions{display:flex;gap:6px;white-space:nowrap}#${PANEL_ID} .uat-error{padding:10px;border:1px solid var(--ekodi-ui-border,#24425E);border-radius:10px}@media(max-width:760px){#${PANEL_ID} .uat-head{flex-direction:column}}`;
    document.head.appendChild(node);
  }

  function usage(funding) {
    return (snapshot?.usage?.byPlan || []).filter(row => row?.funding === funding).reduce((sum, row) => sum + Number(row.requests || 0), 0);
  }

  function render() {
    const body = document.querySelector(`#${PANEL_ID} [data-uat-body]`);
    if (!body) return;
    if (!snapshot) { body.innerHTML = '<div class="uat-error">User AI 운영정보를 불러오는 중입니다.</div>'; return; }
    const sponsored = new Map((snapshot.usage?.byPlan || []).filter(row => row.funding === 'ekodi').map(row => [row.planId, Number(row.requests || 0)]));
    const connections = (snapshot.usage?.connectedProviders || []).reduce((sum, row) => sum + Number(row.connections || 0), 0);
    const rows = (snapshot.plans || []).map(plan => `<tr data-plan="${esc(plan.planId)}"><td><strong>${esc(LABELS[plan.planId] || plan.planId)}</strong></td><td><input data-limit type="number" min="0" max="100000" step="1" value="${Number(plan.monthlyRequests || 0)}"></td><td>${Number(sponsored.get(plan.planId) || 0).toLocaleString('ko-KR')}회</td><td>${plan.source === 'admin-override' ? '관리자 설정' : plan.source === 'environment' ? '운영 기본값' : '시스템 기본값'}</td><td class="uat-actions"><button class="primary" data-save type="button">적용</button><button class="secondary" data-reset type="button">기본값</button></td></tr>`).join('');
    body.innerHTML = `<div class="uat-chips"><span class="uat-chip">EKODI 지원 ${usage('ekodi').toLocaleString('ko-KR')}회</span><span class="uat-chip">개인 API ${usage('personal').toLocaleString('ko-KR')}회</span><span class="uat-chip">개인 API 연결 ${connections.toLocaleString('ko-KR')}건</span></div><div class="uat-scroll"><table><thead><tr><th>회원단계</th><th>월 지원 한도</th><th>이번 달 성공 호출</th><th>설정 출처</th><th>운영</th></tr></thead><tbody>${rows}</tbody></table></div><p class="uat-note">월 지원 한도는 사용자·사이트별입니다. 0은 EKODI 지원 AI만 중지하며 Core와 개인 API 우선 사용은 유지합니다.</p>`;
  }

  async function load() {
    if (loading || !token()) return;
    loading = true;
    try { snapshot = await api('/api/control/user-ai'); render(); }
    catch (error) { const body = document.querySelector(`#${PANEL_ID} [data-uat-body]`); if (body) body.innerHTML = `<div class="uat-error">${esc(error.message)}</div>`; }
    finally { loading = false; }
  }

  async function save(row) {
    const planId = row?.dataset?.plan || '';
    const monthlyRequests = Number(row?.querySelector('[data-limit]')?.value);
    if (!LABELS[planId] || !Number.isInteger(monthlyRequests) || monthlyRequests < 0 || monthlyRequests > 100000) return;
    await api('/api/control/user-ai/limits', { method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify({ planId, monthlyRequests }) });
    await loadFresh();
  }

  async function reset(row) {
    const planId = row?.dataset?.plan || '';
    if (!LABELS[planId]) return;
    await api(`/api/control/user-ai/limits/${encodeURIComponent(planId)}`, { method:'DELETE' });
    await loadFresh();
  }

  async function loadFresh() { snapshot = null; render(); await load(); }

  function mount() {
    const host = document.querySelector('#aiOpsPanel .ai-ops-observe');
    if (!host) return false;
    if (!document.querySelector(`#${PANEL_ID}`)) {
      style();
      const section = document.createElement('section');
      section.id = PANEL_ID;
      section.className = 'ai-ops-block';
      section.innerHTML = '<div class="uat-head"><div><small>USER AI · MEMBERSHIP CONTROL</small><h3>User AI 단계·사용량</h3><p class="uat-note">개인 API 우선, 회원단계별 EKODI 지원 한도와 성공 호출량을 관리합니다.</p></div><button class="secondary" data-refresh type="button">↻ 새로고침</button></div><div data-uat-body><div class="uat-error">User AI 운영정보를 불러오는 중입니다.</div></div>';
      section.addEventListener('click', async event => {
        const row = event.target?.closest?.('[data-plan]');
        try {
          if (event.target?.closest?.('[data-save]')) await save(row);
          else if (event.target?.closest?.('[data-reset]')) await reset(row);
          else if (event.target?.closest?.('[data-refresh]')) await loadFresh();
        } catch (error) { const body = section.querySelector('[data-uat-body]'); if (body) body.insertAdjacentHTML('afterbegin', `<div class="uat-error">${esc(error.message)}</div>`); }
      });
      host.prepend(section);
    }
    if (!snapshot || location.hash === '#ai-ops') load();
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
  window.addEventListener('hashchange', () => { if (location.hash === '#ai-ops') { mount(); loadFresh(); } });
})();