(() => {
  'use strict';
  const TOKEN_KEY = 'ekodi-auth-token';
  const PANEL_ID = 'supplyNetworkAdminSection';
  const API = '/api/affiliate';
  const MALL_ADMIN = 'https://ekodi.kr/ekodibiz/mall/admin/sourcing';
  const APPLICATION = { candidate:'후보', prepared:'가입 준비', account_exists:'계정보유', applied:'신청완료', review:'심사중', approved:'승인됨', active:'활성', blocked:'보류' };
  const INTEGRATION = { not_ready:'미연동', manual:'수동', deeplink:'딥링크', api:'API', feed:'Feed', live:'실연동' };
  const OUTREACH = { none:'미연락', planned:'연락 예정', sent:'문의 발송', replied:'회신 수신', action_required:'추가조치', closed:'연락 종료' };
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${token()}`);
    if (options.body) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { cache:'no-store', credentials:'same-origin', ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `판매·공급망 API 오류 (${response.status})`);
    return data;
  }
  function options(values, current) {
    return Object.entries(values).map(([value,label]) => `<option value="${esc(value)}"${value===current?' selected':''}>${esc(label)}</option>`).join('');
  }
  function createPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'section supply-network-admin hidden-panel';
    panel.dataset.panel = 'supply-network';
    panel.innerHTML = `<div class="section-head"><div><p class="kicker">PROFESSIONAL SERVICE · COMMERCE</p>
      <h2>판매·공급망 엔진</h2><p>여러 운영공간이 재사용하는 공급자·제휴망 Adapter와 검증 상태를 중앙에서 관리합니다.</p></div>
      <div class="supply-network-actions"><button type="button" data-supply-refresh>↻ 상태 확인</button><a href="${MALL_ADMIN}">에코디몰 운영관리</a></div></div>
      <div class="supply-network-boundary"><strong>경계 원칙</strong><span>Provider/Adapter/공통 안전 게이트와 제휴망 확보 상태는 전문서비스가 소유합니다.</span><span>판매처 선택·적용 ON/OFF·상품 추천 결정은 각 운영공간이 소유합니다.</span><span>Credential/Secret은 시스템서비스에만 보관합니다.</span></div>
      <div class="supply-network-summary" data-supply-summary><p>상태를 확인하는 중입니다.</p></div>
      <div class="supply-network-grid"><article><h3>Provider · Feed</h3><div data-supply-providers></div></article><article><h3>제휴망 · 프로그램</h3><div data-supply-programs></div></article></div>
      <p class="supply-network-note" data-supply-message role="status"></p>`;
    document.querySelector('.content')?.append(panel);
    panel.querySelector('[data-supply-refresh]')?.addEventListener('click', () => load(panel));
    panel.addEventListener('click', event => { const save=event.target.closest('[data-supply-program-save]'); if(save) saveProgram(panel, save); });
    return panel;
  }
  function row(title, state, detail = '') {
    return `<div class="supply-network-row"><div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div><span>${esc(state)}</span></div>`;
  }
  function programRow(item) {
    const key = esc(item.programKey);
    const contacted = item.lastOutreachAt ? `${item.outreachChannel || '연락'} · ${new Date(item.lastOutreachAt).toLocaleDateString('ko-KR')}` : '연락 기록 없음';
    return `<div class="supply-network-program" data-supply-program="${key}"><div><strong>${esc(item.programName || item.programKey)}</strong><small>${esc(item.coverageSummary || item.region)}</small><small>${esc(contacted)}</small></div><div class="supply-network-program-controls"><select data-program-application>${options(APPLICATION,item.applicationStatus)}</select><select data-program-integration>${options(INTEGRATION,item.integrationStatus)}</select><select data-program-outreach>${options(OUTREACH,item.outreachStatus || 'none')}</select><button type="button" data-supply-program-save="${key}">저장</button></div></div>`;
  }
  function providerState(provider) {
    if (!provider.enabled) return '중지';
    if (provider.secretRequired && provider.secretConfigured === false) return 'Secret 필요';
    return provider.status || (provider.feedConfigured ? '연결됨' : '등록됨');
  }
  async function saveProgram(panel, button) {
    const item = button.closest('[data-supply-program]');
    const key = item?.dataset.supplyProgram || '';
    if (!key) return;
    const payload = { applicationStatus:item.querySelector('[data-program-application]')?.value, integrationStatus:item.querySelector('[data-program-integration]')?.value, outreachStatus:item.querySelector('[data-program-outreach]')?.value };
    const message = panel.querySelector('[data-supply-message]');
    button.disabled = true;
    try {
      await api(`/programs/${encodeURIComponent(key)}`, { method:'PUT', body:JSON.stringify(payload) });
      if (message) message.textContent = `${key} 제휴망 확보 상태를 저장했습니다. 승인·추적·카탈로그 게이트는 별도로 유지됩니다.`;
      await load(panel);
    } catch (error) { if (message) message.textContent = error.message || '제휴망 상태를 저장하지 못했습니다.'; }
    finally { button.disabled = false; }
  }
  async function load(panel = createPanel()) {
    const message = panel.querySelector('[data-supply-message]');
    if (message) message.textContent = 'Provider와 제휴 프로그램 상태를 확인하고 있습니다.';
    try {
      const [providerData, programData] = await Promise.all([api('/providers'), api('/programs')]);
      const providers = providerData.providers || [];
      const programs = programData.programs || [];
      const configured = providers.filter(item => item.enabled && (!item.secretRequired || item.secretConfigured !== false)).length;
      const contacted = programs.filter(item => ['sent','replied','action_required','closed'].includes(item.outreachStatus)).length;
      const approved = programs.filter(item => ['approved','active'].includes(item.applicationStatus)).length;
      panel.querySelector('[data-supply-summary]').innerHTML = `<article><small>PROVIDERS</small><strong>${providers.length}</strong></article><article><small>READY</small><strong>${configured}</strong></article><article><small>PROGRAMS</small><strong>${programs.length}</strong></article><article><small>CONTACTED</small><strong>${contacted}</strong></article><article><small>APPROVED</small><strong>${approved}</strong></article>`;
      panel.querySelector('[data-supply-providers]').innerHTML = providers.length ? providers.map(item => row(item.displayName || item.providerKey, providerState(item), item.connectionMode || item.providerKind)).join('') : '<p>등록된 Provider가 없습니다.</p>';
      panel.querySelector('[data-supply-programs]').innerHTML = programs.length ? programs.map(programRow).join('') : '<p>등록된 제휴 프로그램이 없습니다.</p>';
      if (message) message.textContent = '제휴망 확보·승인·연락은 중앙에서, 실제 판매처 적용과 추천 결정은 각 Workspace에서 관리합니다.';
    } catch (error) {
      if (message) message.textContent = error.message || '판매·공급망 상태를 확인하지 못했습니다.';
    }
  }
  function mount() { const panel = createPanel(); load(panel); }
  mount();
  window.EKODISupplyNetworkAdmin = Object.freeze({ mount, reload: () => load(createPanel()) });
})();
