(() => {
  'use strict';
  const TOKEN_KEY = 'ekodi-auth-token';
  const PANEL_ID = 'supplyNetworkAdminSection';
  const API = '/api/affiliate';
  const MALL_ADMIN = 'https://ekodi.kr/ekodibiz/mall/admin/sourcing';
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function api(path) {
    const headers = new Headers();
    headers.set('authorization', `Bearer ${token()}`);
    const response = await fetch(`${API}${path}`, { cache:'no-store', credentials:'same-origin', headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `판매·공급망 API 오류 (${response.status})`);
    return data;
  }
  function createPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'section supply-network-admin hidden-panel';
    panel.dataset.panel = 'supply-network';
    panel.innerHTML = `<div class="section-head"><div><p class="kicker">PROFESSIONAL SERVICE · COMMERCE</p>
      <h2>판매·공급망 엔진</h2><p>여러 운영공간이 재사용하는 공급자·제휴망 Adapter와 검증 상태만 중앙에서 관리합니다.</p></div>
      <div class="supply-network-actions"><button type="button" data-supply-refresh>↻ 상태 확인</button><a href="${MALL_ADMIN}">에코디몰 운영관리</a></div></div>
      <div class="supply-network-boundary"><strong>경계 원칙</strong><span>Provider/Adapter/공통 안전 게이트는 전문서비스가 소유합니다.</span><span>판매처 선택·적용 ON/OFF·상품 추천 결정은 각 운영공간이 소유합니다.</span><span>Credential/Secret은 시스템서비스에만 보관합니다.</span></div>
      <div class="supply-network-summary" data-supply-summary><p>상태를 확인하는 중입니다.</p></div>
      <div class="supply-network-grid"><article><h3>Provider · Feed</h3><div data-supply-providers></div></article><article><h3>제휴망 · 프로그램</h3><div data-supply-programs></div></article></div>
      <p class="supply-network-note" data-supply-message role="status"></p>`;
    document.querySelector('.content')?.append(panel);
    panel.querySelector('[data-supply-refresh]')?.addEventListener('click', () => load(panel));
    return panel;
  }
  function row(title, state, detail = '') {
    return `<div class="supply-network-row"><div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div><span>${esc(state)}</span></div>`;
  }
  function providerState(provider) {
    if (!provider.enabled) return '중지';
    if (provider.secretRequired && provider.secretConfigured === false) return 'Secret 필요';
    return provider.status || (provider.feedConfigured ? '연결됨' : '등록됨');
  }
  async function load(panel = createPanel()) {
    const message = panel.querySelector('[data-supply-message]');
    if (message) message.textContent = 'Provider와 제휴 프로그램 상태를 확인하고 있습니다.';
    try {
      const [providerData, programData] = await Promise.all([api('/providers'), api('/programs')]);
      const providers = providerData.providers || [];
      const programs = programData.programs || [];
      const configured = providers.filter(item => item.enabled && (!item.secretRequired || item.secretConfigured !== false)).length;
      const approved = programs.filter(item => ['approved','active'].includes(item.applicationStatus)).length;
      panel.querySelector('[data-supply-summary]').innerHTML = `<article><small>PROVIDERS</small><strong>${providers.length}</strong></article><article><small>READY</small><strong>${configured}</strong></article><article><small>PROGRAMS</small><strong>${programs.length}</strong></article><article><small>APPROVED</small><strong>${approved}</strong></article>`;
      panel.querySelector('[data-supply-providers]').innerHTML = providers.length ? providers.map(item => row(item.displayName || item.providerKey, providerState(item), item.connectionMode || item.providerKind)).join('') : '<p>등록된 Provider가 없습니다.</p>';
      panel.querySelector('[data-supply-programs]').innerHTML = programs.length ? programs.map(item => row(item.programName || item.programKey, `${item.applicationStatus} · ${item.integrationStatus}`, item.coverageSummary || item.region)).join('') : '<p>등록된 제휴 프로그램이 없습니다.</p>';
      if (message) message.textContent = '중앙에는 공통 엔진 상태만 표시합니다. 운영 적용은 각 Workspace 관리자에서 변경합니다.';
    } catch (error) {
      if (message) message.textContent = error.message || '판매·공급망 상태를 확인하지 못했습니다.';
    }
  }
  function mount() { const panel = createPanel(); load(panel); }
  mount();
  window.EKODISupplyNetworkAdmin = Object.freeze({ mount, reload: () => load(createPanel()) });
})();
