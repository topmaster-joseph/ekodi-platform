(() => {
  'use strict';
  const PANEL_ID = 'ekodiCapabilityCenterPanel';
  const REGISTRY_URL = '/capability-registry.json';
  let registry = null;
  let query = '';
  let domain = 'all';

  const esc = value => String(value ?? '');
  const content = () => document.querySelector('.content');
  const currentSection = () => window.EKODIAdminPanels?.current?.() || location.hash.replace(/^#/, '') || 'campus';

  function createPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'section capability-center hidden-panel';
    panel.dataset.panel = 'capabilities';
    panel.innerHTML = `
      <div class="section-head capability-center-head">
        <div><p class="kicker">OPERATIONS CENTER · CAPABILITY</p><h2>Capability Center</h2>
        <p>등록된 서비스·도구·Skill·Action을 찾고 현재 관리자 맥락에서 바로 이용합니다.</p></div>
        <button class="secondary" type="button" data-capability-refresh>↻ 새로고침</button>
      </div>
      <div class="capability-sovereign"><strong>Sovereign Control</strong><span>권한 · 정책 · Agent · 자동화 · 실행 인프라 · 관측을 같은 운영센터에서 통제합니다.</span></div>
      <div class="capability-toolbar"><input type="search" data-capability-search placeholder="기능·서비스·도구 검색" aria-label="Capability 검색"><select data-capability-domain aria-label="도메인 필터"><option value="all">전체 도메인</option></select></div>
      <div class="capability-summary" data-capability-summary></div>
      <div class="capability-grid" data-capability-grid><p class="capability-empty">Capability Registry를 불러오는 중입니다.</p></div>`;
    content()?.append(panel);
    bind(panel);
    return panel;
  }

  function bind(panel) {
    panel.querySelector('[data-capability-search]')?.addEventListener('input', event => {
      query = event.target.value.trim().toLowerCase(); render(panel);
    });
    panel.querySelector('[data-capability-domain]')?.addEventListener('change', event => {
      domain = event.target.value || 'all'; render(panel);
    });
    panel.querySelector('[data-capability-refresh]')?.addEventListener('click', () => load(panel, true));
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-capability-use]');
      if (!button) return;
      const capability = registry?.capabilities?.find(item => item.id === button.dataset.capabilityUse);
      if (!capability) return;
      window.dispatchEvent(new CustomEvent('ekodi-admin-capability-requested', {
        detail: { capability, source: 'capability-center', section: currentSection() }
      }));
    });
  }

  function domains(capabilities) {
    return [...new Set(capabilities.map(item => item.domain).filter(Boolean))].sort();
  }

  function syncDomains(panel, capabilities) {
    const select = panel.querySelector('[data-capability-domain]');
    if (!select) return;
    const selected = domain;
    select.replaceChildren(new Option('전체 도메인', 'all'), ...domains(capabilities).map(value => new Option(value, value)));
    select.value = domains(capabilities).includes(selected) ? selected : 'all';
    domain = select.value;
  }

  function matches(item) {
    if (domain !== 'all' && item.domain !== domain) return false;
    if (!query) return true;
    const haystack = [item.id, item.name, item.description, item.domain, item.ownerAgent, ...(item.tags || [])].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  function renderSummary(panel, capabilities, visible) {
    const target = panel.querySelector('[data-capability-summary]');
    if (!target) return;
    const reversible = capabilities.filter(item => item.actionTier === 'execute_reversible').length;
    const gated = capabilities.filter(item => item.actionTier === 'human_gate').length;
    target.innerHTML = `<article><small>REGISTERED</small><strong>${capabilities.length}</strong></article>
      <article><small>VISIBLE</small><strong>${visible.length}</strong></article>
      <article><small>REVERSIBLE</small><strong>${reversible}</strong></article>
      <article><small>HUMAN GATE</small><strong>${gated}</strong></article>`;
  }

  function card(item) {
    const tags = (item.tags || []).slice(0, 4).map(tag => `<span>${esc(tag)}</span>`).join('');
    const surfaces = (item.surfaces || []).join(' · ') || 'admin';
    return `<article class="capability-card">
      <div class="capability-card-head"><div><small>${esc(item.domain)}</small><h3>${esc(item.name)}</h3></div><code>${esc(item.id)}</code></div>
      <p>${esc(item.description)}</p>
      <div class="capability-meta"><span>Agent ${esc(item.ownerAgent)}</span><span>${esc(item.actionTier)}</span><span>${esc(item.maturity)}</span></div>
      <div class="capability-tags">${tags}</div>
      <footer><small>Surface ${esc(surfaces)}</small><button type="button" data-capability-use="${esc(item.id)}">AI로 사용</button></footer>
    </article>`;
  }

  function render(panel) {
    const capabilities = registry?.capabilities || [];
    const visible = capabilities.filter(matches);
    renderSummary(panel, capabilities, visible);
    const grid = panel.querySelector('[data-capability-grid]');
    if (!grid) return;
    grid.innerHTML = visible.length ? visible.map(card).join('') : '<p class="capability-empty">조건에 맞는 Capability가 없습니다.</p>';
  }

  async function load(panel, force = false) {
    const grid = panel.querySelector('[data-capability-grid]');
    if (force) registry = null;
    if (!registry && grid) grid.innerHTML = '<p class="capability-empty">Capability Registry를 불러오는 중입니다.</p>';
    try {
      if (!registry) {
        const response = await fetch(REGISTRY_URL, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error(`Registry ${response.status}`);
        registry = await response.json();
      }
      syncDomains(panel, registry.capabilities || []);
      render(panel);
    } catch (error) {
      if (grid) grid.innerHTML = `<p class="capability-empty error">Capability Registry를 불러오지 못했습니다. ${esc(error.message)}</p>`;
    }
  }

  function mount() { if(!document.querySelector('link[data-capability-center-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='capability-center-admin.css';link.dataset.capabilityCenterStyle='true';document.head.append(link)} const panel = createPanel(); load(panel); }
  mount();
  window.EKODICapabilityCenter = Object.freeze({ mount, reload: () => load(createPanel(), true) });
})();
