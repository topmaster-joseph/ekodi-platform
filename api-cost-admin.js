(() => {
  'use strict';
  const MODULE_ID = 'ekodiApiCostAdmin';
  const SECTION = 'api-cost';
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  if (document.getElementById(MODULE_ID)) return;

  const nav = document.querySelector('.sidebar nav');
  const content = document.querySelector('.content');
  if (!nav || !content) return;

  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const number = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('ko-KR').format(Number(value)) : '—';
  const compact = value => Number.isFinite(Number(value))
    ? new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value)) : '—';
  const money = value => Number.isFinite(Number(value))
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(Number(value)) : '—';
  const percent = value => Number.isFinite(Number(value)) ? `${Math.max(0, Number(value)).toFixed(1)}%` : '—';

  function statusLabel(value) {
    return ({ stable: '안정', attention: '주의', warning: '경고', limit: '한도 도달', unknown: '연결 필요' })[value] || '연결 필요';
  }

  function connectionLabel(value) {
    return ({ metered: '실측', partial: '운영 추세', 'needs-connection': '연결 필요' })[value] || '연결 필요';
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav api-cost-nav';
  button.dataset.section = SECTION;
  button.append(document.createTextNode('₩ '));
  const navLabel = document.createElement('span');
  navLabel.textContent = 'API · 비용 관리';
  button.append(navLabel);
  const health = nav.querySelector('[data-section="health"], [data-demand-feature="health"]');
  if (health) health.insertAdjacentElement('afterend', button); else nav.append(button);

  const section = document.createElement('section');
  section.id = MODULE_ID;
  section.className = 'section api-cost-section hidden-panel';
  section.dataset.panel = SECTION;
  section.hidden = true;
  section.innerHTML = `
    <div class="section-head api-cost-head">
      <div><p class="kicker">API & COST CONTROL</p><h2>API · 비용 관리</h2><p>외부 API 사용량과 EKODI 지원 AI 비용을 한곳에서 확인하고, 한도 도달 시 Core는 유지하면서 유료 AI만 자동 차단합니다.</p></div>
      <button class="secondary compact" type="button" data-api-cost-refresh>↻ 새로고침</button>
    </div>
    <div class="api-cost-banner" data-api-cost-banner data-state="unknown">
      <span class="api-cost-dot"></span><div><small>EKODI-SPONSORED AI</small><strong data-api-cost-status>확인 전</strong><span data-api-cost-note>메뉴를 열면 실측 원장을 확인합니다.</span></div>
    </div>
    <div class="api-cost-summary">
      <article><small>오늘 AI 호출</small><strong data-api-cost-day>—</strong><span data-api-cost-day-limit>—</span></article>
      <article><small>이번 달 AI 호출</small><strong data-api-cost-month>—</strong><span data-api-cost-month-limit>—</span></article>
      <article><small>이번 달 추정 비용</small><strong data-api-cost-spend>—</strong><span data-api-cost-budget>—</span></article>
      <article><small>최대 사용률</small><strong data-api-cost-percent>—</strong><span>70% 주의 · 90% 경고 · 100% 차단</span></article>
    </div>
    <div class="api-cost-meter"><span data-api-cost-meter style="width:0%"></span></div>
    <div class="api-cost-grid" data-api-cost-grid><p class="operations-loading">API 사용량을 불러오는 중입니다.</p></div>
    <div class="api-cost-history">
      <div class="api-cost-history-head"><div><small>30-DAY AI LEDGER</small><strong>일별 EKODI 지원 AI</strong></div><span data-api-cost-updated>—</span></div>
      <div class="api-cost-table-wrap"><table><thead><tr><th>일자</th><th>호출</th><th>입력</th><th>캐시 입력</th><th>출력</th><th>추정 비용</th></tr></thead><tbody data-api-cost-series></tbody></table></div>
    </div>
    <p class="api-cost-footnote">정확한 외부 계정 telemetry가 없는 서비스는 임의 숫자를 만들지 않고 “연결 필요”로 표시합니다. API 키·토큰·비밀정보는 화면과 원장에 저장하지 않습니다.</p>`;
  content.append(section);

  const get = selector => section.querySelector(selector);
  const refresh = get('[data-api-cost-refresh]');
  let loaded = false;
  let loading = false;

  function renderProvider(provider) {
    const card = document.createElement('article');
    card.className = 'api-provider-card';
    card.dataset.state = provider.status || 'unknown';
    const head = document.createElement('div');
    head.className = 'api-provider-head';
    const title = document.createElement('div');
    const small = document.createElement('small'); small.textContent = provider.id || 'provider';
    const strong = document.createElement('strong'); strong.textContent = provider.name || provider.id;
    title.append(small, strong);
    const badge = document.createElement('span');
    badge.className = 'api-provider-badge';
    badge.textContent = provider.connection === 'metered' ? statusLabel(provider.status) : connectionLabel(provider.connection);
    head.append(title, badge);
    card.append(head);

    const facts = document.createElement('dl');
    const add = (label, value) => {
      const row = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; row.append(dt, dd); facts.append(row);
    };
    if (provider.id === 'openai') {
      add('월 호출', `${number(provider.usage?.monthlyCalls)} / ${number(provider.limit?.monthlyCalls)}`);
      add('월 비용', `${money(provider.usage?.monthlyCostUsd)} / ${money(provider.limit?.monthlyBudgetUsd)}`);
      add('입력 토큰', compact(provider.usage?.inputTokens));
      add('출력 토큰', compact(provider.usage?.outputTokens));
    } else if (provider.id === 'cloudflare-workers' && provider.usage) {
      add('최근 Zone 요청', number(provider.usage.zoneRequests));
      add('기준 일자', provider.usage.day || '—');
      add('Workers Free 참고', `${number(provider.limit?.freeRequestsPerDay)} 요청/일`);
    } else {
      const limits = provider.limit && Object.keys(provider.limit).length
        ? Object.entries(provider.limit).map(([key, value]) => `${key}: ${typeof value === 'number' ? number(value) : value}`).join(' · ')
        : '공급자 대시보드 확인 필요';
      add('현재 사용량', '연결 필요');
      add('무료/정책 참고', limits);
    }
    card.append(facts);
    const note = document.createElement('p'); note.textContent = provider.note || ''; card.append(note);
    return card;
  }

  function render(data) {
    const ai = data.sponsoredAi || {};
    const policy = ai.policy || {};
    const banner = get('[data-api-cost-banner]');
    banner.dataset.state = ai.status || 'unknown';
    get('[data-api-cost-status]').textContent = statusLabel(ai.status);
    get('[data-api-cost-note]').textContent = ai.allowed === false
      ? '유료 AI 호출은 차단되고 EKODI Core/fallback은 계속 동작합니다.'
      : 'EKODI 지원 AI는 실측 토큰과 호출량으로 관리됩니다.';
    get('[data-api-cost-day]').textContent = number(ai.dailyCalls);
    get('[data-api-cost-day-limit]').textContent = `한도 ${number(policy.dailyMaxCalls)}회/일`;
    get('[data-api-cost-month]').textContent = number(ai.monthlyCalls);
    get('[data-api-cost-month-limit]').textContent = `한도 ${number(policy.monthlyMaxCalls)}회/월`;
    get('[data-api-cost-spend]').textContent = money(ai.monthlyCostUsd);
    get('[data-api-cost-budget]').textContent = `예산 ${money(policy.monthlyBudgetUsd)}/월`;
    get('[data-api-cost-percent]').textContent = percent(ai.percent);
    get('[data-api-cost-meter]').style.width = `${Math.min(100, Math.max(0, Number(ai.percent) || 0))}%`;

    const grid = get('[data-api-cost-grid]');
    grid.replaceChildren(...(data.providers || []).map(renderProvider));
    const tbody = get('[data-api-cost-series]');
    tbody.replaceChildren();
    for (const row of data.series || []) {
      const tr = document.createElement('tr');
      [row.day, number(row.calls), compact(row.inputTokens), compact(row.cachedInputTokens), compact(row.outputTokens), money(row.estimatedCostUsd)]
        .forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); });
      tbody.append(tr);
    }
    if (!tbody.children.length) {
      const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.textContent = '아직 EKODI 지원 AI 사용 기록이 없습니다.'; tr.append(td); tbody.append(tr);
    }
    get('[data-api-cost-updated]').textContent = data.generatedAt ? new Date(data.generatedAt).toLocaleString('ko-KR') : '—';
  }

  async function load(force = false) {
    if (loading || (loaded && !force)) return;
    const value = token();
    if (!value) return;
    loading = true; refresh.disabled = true;
    try {
      const response = await fetch(`${API}/api/control/api-cost`, { headers: { authorization: `Bearer ${value}` }, cache: 'no-store' });
      let data = null; try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      render(data); loaded = true;
    } catch (error) {
      const grid = get('[data-api-cost-grid]');
      grid.innerHTML = '';
      const message = document.createElement('p'); message.className = 'operations-error'; message.textContent = `API 비용 정보를 불러오지 못했습니다. ${error?.message || error}`; grid.append(message);
    } finally { loading = false; refresh.disabled = false; }
  }

  function activate() {
    section.hidden = false;
    document.querySelectorAll('[data-panel]').forEach(panel => {
      const targets = String(panel.dataset.panel || '').split(/\s+/).filter(Boolean);
      const visible = targets.includes(SECTION);
      panel.classList.toggle('hidden-panel', !visible);
      if (visible) panel.removeAttribute('hidden'); else panel.hidden = true;
    });
    document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.toggle('active', item === button));
    const title = document.querySelector('#pageTitle'); if (title) title.textContent = 'API · 비용 관리';
    document.querySelector('.sidebar')?.classList.remove('open');
    if (location.hash !== '#api-cost') history.replaceState(null, '', '#api-cost');
    load(false);
  }

  refresh.addEventListener('click', () => load(true));
  button.addEventListener('click', activate);
  window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail: { section: SECTION } }));
  if (location.hash === '#api-cost') queueMicrotask(activate);
})();
