(() => {
  'use strict';

  const MODULE_ID = 'ekodiCoreStatus';
  const SECTION = 'core';
  const API_BASE = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const PREFERRED_SERVICES = ['root', 'admin', 'api', 'biz', 'church', 'lab', 'client-cgma', 'client-jadam', 'client-pizzamaru', 'client-yogurt'];
  if (document.getElementById(MODULE_ID)) return;

  const nav = document.querySelector('.sidebar nav');
  const content = document.querySelector('.content');
  if (!nav || !content) return;

  const token = () => {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  };

  const fmtTime = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR');
  };

  const fmtBytes = value => {
    let n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unit = 0;
    while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit += 1; }
    return `${n.toFixed(unit === 0 ? 0 : n >= 100 ? 0 : 1)} ${units[unit]}`;
  };

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav core-status-nav';
  button.dataset.section = SECTION;
  button.title = 'EKODI Core 운영 상태';
  button.append(document.createTextNode('◆ '));
  const navLabel = document.createElement('span');
  navLabel.textContent = 'Core';
  button.append(navLabel);

  const health = nav.querySelector('[data-section="health"], [data-demand-feature="health"]');
  if (health) health.insertAdjacentElement('afterend', button);
  else nav.append(button);

  const section = document.createElement('section');
  section.id = MODULE_ID;
  section.className = 'section core-status-section hidden-panel';
  section.dataset.panel = SECTION;
  section.hidden = true;
  section.innerHTML = `
    <div class="section-head core-status-head">
      <div>
        <p class="kicker">EKODI CORE</p>
        <h2>Core Status</h2>
        <p class="operations-copy">Core · 데이터 · 백업 · AI 독립성 · 주요 사이트를 한 화면에서 확인합니다. 메뉴를 열거나 새로고침할 때만 읽습니다.</p>
      </div>
      <button class="secondary compact" type="button" data-core-refresh>↻ 새로고침</button>
    </div>

    <div class="core-status-banner" data-core-banner data-state="pending">
      <span class="core-status-dot" aria-hidden="true"></span>
      <div>
        <small>전체 운영 상태</small>
        <strong data-core-banner-label>확인 전</strong>
        <span data-core-banner-copy>Core 메뉴를 열면 운영 상태를 확인합니다.</span>
      </div>
      <time data-core-checked-at>—</time>
    </div>

    <div class="core-status-grid" aria-label="EKODI Core 핵심 상태">
      <article class="core-status-card" data-core-card="core" data-state="pending">
        <div class="core-status-card-head"><span>Core</span><b data-core-card-badge="core">확인 전</b></div>
        <strong data-core-version>—</strong>
        <p data-core-detail>api.ekodi.kr 운영 계약</p>
      </article>
      <article class="core-status-card" data-core-card="database" data-state="pending">
        <div class="core-status-card-head"><span>DB</span><b data-core-card-badge="database">확인 전</b></div>
        <strong data-core-db>Hybrid</strong>
        <p data-core-db-detail>D1 · Supabase · Object Storage</p>
      </article>
      <article class="core-status-card" data-core-card="backup" data-state="pending">
        <div class="core-status-card-head"><span>Backup</span><b data-core-card-badge="backup">확인 전</b></div>
        <strong data-core-backup>—</strong>
        <p data-core-backup-detail>독립 복원 검증 기록</p>
      </article>
      <article class="core-status-card" data-core-card="ai" data-state="pending">
        <div class="core-status-card-head"><span>AI Independence</span><b data-core-card-badge="ai">확인 전</b></div>
        <strong data-core-ai>—</strong>
        <p data-core-ai-detail>AI 공급자 없이도 Core 유지</p>
      </article>
    </div>

    <div class="core-status-columns">
      <section class="core-status-panel">
        <div class="core-status-panel-head">
          <div><small>PRODUCTION FLEET</small><strong>주요 사이트</strong></div>
          <span data-core-fleet-summary>—</span>
        </div>
        <div class="core-fleet-list" data-core-fleet-list>
          <p class="operations-loading">운영 상태 확인 전입니다.</p>
        </div>
      </section>

      <section class="core-status-panel">
        <div class="core-status-panel-head">
          <div><small>RECOVERY & CONTRACT</small><strong>복구 · 운영 계약</strong></div>
        </div>
        <dl class="core-status-facts">
          <div><dt>아키텍처</dt><dd data-core-architecture>—</dd></div>
          <div><dt>백업 정책</dt><dd data-core-backup-policy>—</dd></div>
          <div><dt>최근 복원 검증</dt><dd data-core-recovery-time>—</dd></div>
          <div><dt>복원 무결성</dt><dd data-core-integrity>—</dd></div>
          <div><dt>백업 크기</dt><dd data-core-backup-size>—</dd></div>
          <div><dt>최근 운영 확인</dt><dd data-core-live-check>—</dd></div>
        </dl>
      </section>
    </div>

    <p class="core-status-note">표시값은 관리자 세션으로 Core API와 Control API를 읽어 판정합니다. 확인되지 않은 항목을 정상으로 추정하지 않습니다.</p>`;
  content.append(section);

  const get = selector => section.querySelector(selector);
  const refresh = get('[data-core-refresh]');
  let loaded = false;
  let loading = false;

  function setCard(name, state, badge, value, detail = '') {
    const card = get(`[data-core-card="${name}"]`);
    const badgeNode = get(`[data-core-card-badge="${name}"]`);
    if (card) card.dataset.state = state;
    if (badgeNode) badgeNode.textContent = badge;
    const valueNode = get(`[data-core-${name === 'database' ? 'db' : name}]`);
    if (valueNode && value != null) valueNode.textContent = value;
    const detailSelector = name === 'database' ? '[data-core-db-detail]' : `[data-core-${name}-detail]`;
    const detailNode = get(detailSelector);
    if (detailNode && detail) detailNode.textContent = detail;
  }

  async function fetchJson(path, authenticated = false) {
    const headers = {};
    if (authenticated) {
      const value = token();
      if (!value) throw new Error('관리자 세션이 없습니다.');
      headers.authorization = `Bearer ${value}`;
    }
    const response = await fetch(`${API_BASE}${path}`, { headers, cache:'no-store' });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  async function attempt(label, task) {
    try { return { ok:true, data:await task() }; }
    catch (error) { return { ok:false, error:new Error(`${label}: ${error?.message || error}`) }; }
  }

  function serviceState(service) {
    const status = service?.latest?.status || service?.status || '';
    if (status === 'online') return 'ok';
    if (status === 'degraded') return 'warn';
    if (status === 'offline') return 'error';
    return 'pending';
  }

  function renderFleet(overview) {
    const list = get('[data-core-fleet-list]');
    list.textContent = '';
    const byId = new Map((overview?.services || []).map(item => [item.id, item]));
    const monitoredById = new Map((overview?.sites || []).map(item => [item.id, item]));
    const rows = PREFERRED_SERVICES
      .map(id => monitoredById.get(id) || byId.get(id))
      .filter(Boolean);

    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'operations-loading';
      empty.textContent = '표시할 서비스 상태가 없습니다.';
      list.append(empty);
      get('[data-core-fleet-summary]').textContent = '0개';
      return { ok:0, warn:0, error:0, unknown:0 };
    }

    const counts = { ok:0, warn:0, error:0, unknown:0 };
    for (const service of rows) {
      const state = serviceState(service);
      if (state === 'ok') counts.ok += 1;
      else if (state === 'warn') counts.warn += 1;
      else if (state === 'error') counts.error += 1;
      else counts.unknown += 1;

      const row = document.createElement('div');
      row.className = 'core-fleet-row';
      row.dataset.state = state;
      const identity = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = service.name || service.domain || service.id;
      const domain = document.createElement('small');
      domain.textContent = service.domain || '';
      identity.append(name, domain);
      const meta = document.createElement('div');
      meta.className = 'core-fleet-meta';
      const badge = document.createElement('b');
      badge.textContent = state === 'ok' ? '정상' : state === 'warn' ? '지연/주의' : state === 'error' ? '오프라인' : '확인 대기';
      const latency = document.createElement('span');
      const ms = service.responseTime ?? service.latest?.responseTime;
      latency.textContent = Number.isFinite(Number(ms)) ? `${Number(ms)} ms` : '—';
      meta.append(badge, latency);
      row.append(identity, meta);
      list.append(row);
    }
    get('[data-core-fleet-summary]').textContent = `${counts.ok}/${rows.length} 정상`;
    return counts;
  }

  function render(results) {
    const { core, ai, recovery, overview } = results;

    if (core.ok && core.data?.ok) {
      const data = core.data;
      setCard('core', 'ok', '정상', `v${data.apiVersion || '1.0.0'}`, `${data.canonicalHosts?.api || 'api.ekodi.kr'} · ${data.architecture || 'hybrid-cloud'}`);
      get('[data-core-architecture]').textContent = data.architecture === 'hybrid-cloud' ? 'Hybrid Cloud · Provider Independent' : data.architecture || '—';
    } else {
      setCard('core', 'error', '점검 필요', '응답 없음', core.error?.message || 'Core API 확인 실패');
    }

    const dbOk = recovery.ok && overview.ok;
    setCard('database', dbOk ? 'ok' : 'error', dbOk ? '연결' : '확인 필요', dbOk ? 'Hybrid 연결' : '확인 필요', dbOk ? 'D1 운영 데이터와 복구 원장 응답 정상' : [recovery.error?.message, overview.error?.message].filter(Boolean).join(' · '));

    const backup = recovery.data?.recovery;
    if (recovery.ok && backup?.verified) {
      setCard('backup', 'ok', '검증됨', '복원 가능', `${fmtTime(backup.latest?.createdAt)} · 무결성 ${backup.latest?.restoreIntegrity || 'ok'}`);
    } else if (recovery.ok) {
      setCard('backup', 'warn', '확인 필요', backup?.configured ? '검증 대기' : '미설정', '최근 독립 복원 성공 기록을 확인해 주세요.');
    } else {
      setCard('backup', 'error', '점검 필요', '조회 실패', recovery.error?.message || '복구 상태 확인 실패');
    }

    const aiData = ai.data || core.data?.ai;
    const aiIndependent = Boolean(ai.ok && aiData?.providerIndependent && aiData?.aiOptional);
    if (aiIndependent) {
      setCard('ai', 'ok', '독립', 'AI Optional', `${aiData.gateway || 'EKODI Core Gateway'} · ${aiData.mode || 'provider-independent'}`);
    } else if (ai.ok) {
      setCard('ai', 'warn', '확인 필요', '정책 확인', 'AI Optional / 공급자 독립 상태를 확인해 주세요.');
    } else {
      setCard('ai', 'error', '점검 필요', '조회 실패', ai.error?.message || 'AI Gateway 상태 확인 실패');
    }

    const counts = overview.ok ? renderFleet(overview.data) : (renderFleet(null), { ok:0, warn:0, error:0, unknown:1 });
    const operationalIssues = [
      !core.ok,
      !dbOk,
      !aiIndependent,
      !recovery.ok || !backup?.verified,
      !overview.ok || counts.error > 0,
    ].filter(Boolean).length;
    const warnings = overview.ok ? counts.warn + counts.unknown : 1;

    const banner = get('[data-core-banner]');
    const bannerLabel = get('[data-core-banner-label]');
    const bannerCopy = get('[data-core-banner-copy]');
    if (operationalIssues === 0 && warnings === 0) {
      banner.dataset.state = 'ok';
      bannerLabel.textContent = '정상';
      bannerCopy.textContent = 'Core, 데이터, 백업, AI 독립성, 주요 사이트가 모두 확인됐습니다.';
    } else if (operationalIssues === 0) {
      banner.dataset.state = 'warn';
      bannerLabel.textContent = '정상 · 일부 확인 대기';
      bannerCopy.textContent = `핵심 기능은 정상이며 ${warnings}개 사이트 상태가 지연 또는 확인 대기입니다.`;
    } else {
      banner.dataset.state = 'error';
      bannerLabel.textContent = '점검 필요';
      bannerCopy.textContent = `${operationalIssues}개 핵심 항목을 확인해 주세요. 확인되지 않은 항목은 정상으로 간주하지 않았습니다.`;
    }

    const latest = backup?.latest;
    get('[data-core-backup-policy]').textContent = backup?.policy || core.data?.recovery?.strategy || '—';
    get('[data-core-recovery-time]').textContent = fmtTime(latest?.createdAt);
    get('[data-core-integrity]').textContent = latest?.restoreIntegrity || (backup?.verified ? 'ok' : '—');
    get('[data-core-backup-size]').textContent = fmtBytes(latest?.exportBytes);
    get('[data-core-live-check]').textContent = overview.ok ? fmtTime(overview.data?.generatedAt) : '확인 실패';
    const checkedAt = new Date();
    get('[data-core-checked-at]').textContent = `확인 ${checkedAt.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}`;
  }

  async function load(force = false) {
    if (loading || (loaded && !force)) return;
    if (!token()) return;
    loading = true;
    refresh.disabled = true;
    const banner = get('[data-core-banner]');
    banner.dataset.state = 'pending';
    get('[data-core-banner-label]').textContent = '확인 중';
    get('[data-core-banner-copy]').textContent = 'EKODI Core 운영 상태를 읽는 중입니다.';

    const [core, ai, recovery, overview] = await Promise.all([
      attempt('Core', () => fetchJson('/api/core/v1/status')),
      attempt('AI Gateway', () => fetchJson('/api/core/v1/ai/status')),
      attempt('Backup', () => fetchJson('/api/core/v1/recovery/status', true)),
      attempt('Fleet', () => fetchJson('/api/control/overview', true)),
    ]);
    render({ core, ai, recovery, overview });
    loaded = true;
    loading = false;
    refresh.disabled = false;
  }

  function activate() {
    section.hidden = false;
    document.querySelectorAll('[data-panel]').forEach(panel => {
      const targets = String(panel.dataset.panel || '').split(/\s+/).filter(Boolean);
      panel.classList.toggle('hidden-panel', !targets.includes(SECTION));
      if (!targets.includes(SECTION) && !panel.hidden) panel.hidden = true;
    });
    document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.toggle('active', item === button));
    const title = document.querySelector('#pageTitle');
    if (title) title.textContent = 'EKODI Core';
    document.querySelector('.sidebar')?.classList.remove('open');
    if (location.hash !== '#core') history.replaceState(null, '', '#core');
    load(false);
  }

  refresh.addEventListener('click', () => load(true));
  button.addEventListener('click', activate);
  window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail:{ feature:SECTION } }));
  if (location.hash === '#core') queueMicrotask(activate);
})();
