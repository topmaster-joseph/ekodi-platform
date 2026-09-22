(() => {
  'use strict';
  const PANEL_ID = 'ekodiCapabilityCenterPanel';
  const REGISTRY_URL = '/capability-registry.json';
  const FOUNDRY_URL = '/capability-foundry.json';
  let registry = null;
  let foundry = null;
  let sampleRuntime = null;
  let lastSample = null;
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
      <section class="capability-foundry" data-capability-foundry>
        <div class="capability-foundry-head"><div><small>CAPABILITY FIRST · INTERNAL FOUNDRY</small><h3>서비스보다 먼저 능력을 축적합니다</h3><p>재사용 가능한 모듈을 내부 분류별로 준비하고 합성데이터 샘플에서 먼저 검증합니다.</p></div><span data-foundry-state>준비 중</span></div>
        <div class="capability-family-strip" data-capability-families></div>
        <div class="capability-module-grid" data-capability-modules></div>
        <div class="capability-sample">
          <div><small>SAMPLE SERVICE · SYNTHETIC ONLY</small><strong>검증용 조합 실행</strong><p>운영 데이터·외부 실행·저장 없이 Capability 조합만 시험합니다.</p></div>
          <select data-capability-recipe aria-label="샘플 레시피"></select>
          <button type="button" data-capability-sample-run>샘플 실행</button>
        </div>
        <div class="capability-sample-result" data-capability-sample-result hidden></div>
      </section>
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
    panel.querySelector('[data-capability-sample-run]')?.addEventListener('click', () => runSample(panel));
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


  function foundryStateLabel(state) {
    return ({ready_for_reuse:'재사용 준비',verified:'검증됨',sandboxed:'샌드박스',module_candidate:'후보',discovered:'발견',adopted:'사용 중',quarantined:'격리',retired:'종료'})[state] || state || '준비';
  }

  function renderFoundry(panel) {
    const root = panel.querySelector('[data-capability-foundry]');
    if (!root) return;
    const state = root.querySelector('[data-foundry-state]');
    const familiesRoot = root.querySelector('[data-capability-families]');
    const modulesRoot = root.querySelector('[data-capability-modules]');
    const recipeSelect = root.querySelector('[data-capability-recipe]');
    const families = foundry?.families || [];
    const modules = foundry?.modules || [];
    const recipes = foundry?.sampleRecipes || [];
    if (state) state.textContent = foundry ? `${modules.filter(item => item.state === 'ready_for_reuse').length}개 모듈 준비` : '불러오기 실패';
    if (familiesRoot) familiesRoot.innerHTML = families.map(item => `<span title="${esc(item.purpose)}"><b>${esc(item.name)}</b><small>${modules.filter(module => module.family === item.id).length}</small></span>`).join('');
    if (modulesRoot) modulesRoot.innerHTML = modules.map(item => `<article><div><small>${esc((families.find(family => family.id === item.family) || {}).name || item.family)}</small><strong>${esc(item.name)}</strong></div><code>${esc(item.id)}</code><span>${esc(foundryStateLabel(item.state))}</span></article>`).join('');
    if (recipeSelect) {
      const selected = recipeSelect.value;
      recipeSelect.replaceChildren(...recipes.map(item => new Option(item.name, item.id)));
      if (recipes.some(item => item.id === selected)) recipeSelect.value = selected;
    }
  }

  function renderSampleResult(panel, result) {
    const target = panel.querySelector('[data-capability-sample-result]');
    if (!target) return;
    lastSample = result;
    target.hidden = false;
    const ok = result?.state === 'sample_verified';
    const modules = result?.modules || [];
    target.classList.toggle('is-ok', ok);
    target.classList.toggle('is-blocked', !ok);
    target.innerHTML = `<div class="sample-result-head"><div><small>${ok ? 'SAMPLE VERIFIED' : 'SAMPLE BLOCKED'}</small><strong>${esc(result?.recipeName || result?.recipeId || '샘플')}</strong></div><span>${modules.filter(item => item.ok).length}/${modules.length}</span></div>
      <div class="sample-result-preview"><span>언어 <b>${esc(result?.preview?.language || '-')}</b></span><span>변경 <b>${result?.preview?.changed === null ? '-' : result?.preview?.changed ? '감지' : '없음'}</b></span><span>출처점수 <b>${result?.preview?.sourceScore ?? '-'}</b></span><span>서비스 생성 <b>안 함</b></span></div>
      <div class="sample-result-modules">${modules.map(item => `<span class="${item.ok ? 'ok' : 'bad'}">${item.ok ? '✓' : '×'} ${esc(item.moduleId)}</span>`).join('')}</div>
      <p>${ok ? '내부 조합 검증만 통과했습니다. 실제 사용자 서비스 승격은 반복 검증·사용자 요청 또는 측정된 필요·사람 검토가 추가로 필요합니다.' : '모듈 또는 Capability 계약을 수정한 뒤 다시 샘플 검증해야 합니다.'}</p>`;
  }

  async function runSample(panel) {
    const select = panel.querySelector('[data-capability-recipe]');
    const button = panel.querySelector('[data-capability-sample-run]');
    const recipe = foundry?.sampleRecipes?.find(item => item.id === select?.value);
    if (!recipe || !registry) return;
    if (button) { button.disabled = true; button.textContent = '검증 중…'; }
    try {
      sampleRuntime ||= await import('./capability-sample-runtime.js');
      const result = sampleRuntime.runCapabilitySample({ recipe, registry });
      renderSampleResult(panel, result);
    } catch (error) {
      renderSampleResult(panel, { state:'sample_blocked', recipeName:recipe.name, modules:[], preview:{}, reason:error.message });
    } finally {
      if (button) { button.disabled = false; button.textContent = '샘플 실행'; }
    }
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
    const provider = item.provider?.id ? `<span>Provider ${esc(item.provider.id)}</span>` : '';
    const contract = item.provider?.contract ? ` · ${esc(item.provider.contract)}` : '';
    return `<article class="capability-card">
      <div class="capability-card-head"><div><small>${esc(item.domain)}</small><h3>${esc(item.name)}</h3></div><code>${esc(item.id)}</code></div>
      <p>${esc(item.description)}</p>
      <div class="capability-meta"><span>Agent ${esc(item.ownerAgent)}</span><span>${esc(item.actionTier)}</span><span>${esc(item.maturity)}</span>${provider}</div>
      <div class="capability-tags">${tags}</div>
      <footer><small>Surface ${esc(surfaces)}${contract}</small><button type="button" data-capability-use="${esc(item.id)}">AI로 사용</button></footer>
    </article>`;
  }

  function render(panel) {
    const capabilities = registry?.capabilities || [];
    const visible = capabilities.filter(matches);
    renderFoundry(panel);
    renderSummary(panel, capabilities, visible);
    const grid = panel.querySelector('[data-capability-grid]');
    if (!grid) return;
    grid.innerHTML = visible.length ? visible.map(card).join('') : '<p class="capability-empty">조건에 맞는 Capability가 없습니다.</p>';
  }

  async function load(panel, force = false) {
    const grid = panel.querySelector('[data-capability-grid]');
    if (force) { registry = null; foundry = null; lastSample = null; }
    if (!registry && grid) grid.innerHTML = '<p class="capability-empty">Capability Registry를 불러오는 중입니다.</p>';
    try {
      if (!registry || !foundry) {
        const [registryResponse, foundryResponse] = await Promise.all([
          registry ? null : fetch(REGISTRY_URL, { cache: 'no-store', credentials: 'same-origin' }),
          foundry ? null : fetch(FOUNDRY_URL, { cache: 'no-store', credentials: 'same-origin' })
        ]);
        if (registryResponse) {
          if (!registryResponse.ok) throw new Error(`Registry ${registryResponse.status}`);
          registry = await registryResponse.json();
        }
        if (foundryResponse) {
          if (!foundryResponse.ok) throw new Error(`Foundry ${foundryResponse.status}`);
          foundry = await foundryResponse.json();
        }
      }
      syncDomains(panel, registry.capabilities || []);
      render(panel);
    } catch (error) {
      if (grid) grid.innerHTML = `<p class="capability-empty error">Capability Registry를 불러오지 못했습니다. ${esc(error.message)}</p>`;
    }
  }

  function mount() { if(!document.querySelector('link[data-capability-center-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='capability-center-admin.css';link.dataset.capabilityCenterStyle='true';document.head.append(link)} const panel = createPanel(); load(panel); }
  mount();
  window.EKODICapabilityCenter = Object.freeze({ mount, reload: () => load(createPanel(), true), runSample: () => runSample(createPanel()), lastSample: () => lastSample });
})();
