const SECTION = 'maturity';
const MODULE_ID = 'ekodiPlatformMaturity';
const TOKEN_KEY = 'ekodi-auth-token';
const SESSION_URL = 'https://ekodi.kr/api/session';
const MATURITY_API = 'https://api.ekodi.kr/api/control/platform-maturity';

if (typeof document !== 'undefined' && !document.getElementById(MODULE_ID)) {
  const content = document.querySelector('.content');
  const nav = document.querySelector('.sidebar nav');
  const root = document.documentElement;
  root.dataset.ekodiMaturityAuthorized = 'pending';

  const style = document.createElement('style');
  style.id = 'ekodi-platform-maturity-style';
  style.textContent = `
html:not([data-ekodi-maturity-authorized="true"]) .sidebar [data-section="maturity"]{display:none!important}
.ekodi-maturity{display:grid;gap:16px}.ekodi-maturity-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.ekodi-maturity-head h2{margin:3px 0 5px;font-size:24px}.ekodi-maturity-head p{margin:0}.ekodi-maturity-actions{display:flex;gap:8px;flex-wrap:wrap}.ekodi-maturity-actions button{min-height:38px;padding:7px 11px;border-radius:9px}.ekodi-maturity-summary{display:grid;grid-template-columns:minmax(220px,1.15fr) repeat(3,minmax(150px,.72fr));gap:12px}.ekodi-maturity-card,.ekodi-maturity-panel{border:1px solid var(--admin-border,#d9e2ec);border-radius:13px;background:var(--ekodi-ui-surface,#fff);padding:14px}.ekodi-maturity-card{display:grid;gap:5px}.ekodi-maturity-card small{font-size:11px;font-weight:800;letter-spacing:.03em}.ekodi-maturity-card strong{font-size:28px;line-height:1.1}.ekodi-maturity-card span{font-size:12px;color:var(--admin-secondary,#66768a)}.ekodi-maturity-score{display:flex;align-items:baseline;gap:5px}.ekodi-maturity-score strong{font-size:38px}.ekodi-maturity-score b{font-size:16px;color:var(--admin-secondary,#66768a)}.ekodi-maturity-grid{display:grid;grid-template-columns:minmax(300px,.8fr) minmax(420px,1.2fr);gap:14px}.ekodi-maturity-panel h3{margin:0 0 12px;font-size:17px}.ekodi-maturity-radar{display:grid;place-items:center;min-height:310px}.ekodi-maturity-radar svg{width:min(100%,360px);height:auto;overflow:visible}.ekodi-maturity-domain-list{display:grid;gap:8px}.ekodi-maturity-domain{display:grid;grid-template-columns:minmax(150px,1fr) minmax(150px,.9fr) 52px;align-items:center;gap:10px}.ekodi-maturity-domain-label{display:grid;gap:2px;min-width:0}.ekodi-maturity-domain-label strong{font-size:13px}.ekodi-maturity-domain-label small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ekodi-maturity-bar{height:9px;border-radius:999px;background:var(--admin-soft,#f1f5f9);overflow:hidden}.ekodi-maturity-bar>i{display:block;height:100%;border-radius:inherit;background:var(--ekodi-ui-accent,#155eef)}.ekodi-maturity-domain>strong{text-align:right;font-size:14px}.ekodi-maturity-state-critical .ekodi-maturity-bar>i{opacity:.55}.ekodi-maturity-state-watch .ekodi-maturity-bar>i{opacity:.76}.ekodi-maturity-priorities{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ekodi-maturity-priority{border:1px solid var(--admin-border,#d9e2ec);border-radius:11px;padding:12px;background:var(--ekodi-ui-surface-raised,#f8fafc)}.ekodi-maturity-priority header{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}.ekodi-maturity-priority header strong{font-size:14px}.ekodi-maturity-priority header b{font-size:13px}.ekodi-maturity-priority ul{margin:0;padding-left:18px}.ekodi-maturity-priority li{margin:5px 0;font-size:12px;line-height:1.45;color:var(--admin-secondary,#66768a)}.ekodi-maturity-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.ekodi-maturity-meta div{display:grid;gap:3px;border-top:1px solid var(--admin-border,#d9e2ec);padding-top:9px}.ekodi-maturity-meta dt{font-size:11px;color:var(--admin-secondary,#66768a)}.ekodi-maturity-meta dd{margin:0;font-weight:800}.ekodi-maturity-trend{min-height:160px}.ekodi-maturity-trend svg{width:100%;height:130px}.ekodi-maturity-empty{padding:18px;border:1px dashed var(--admin-border,#d9e2ec);border-radius:10px;text-align:center;color:var(--admin-secondary,#66768a)}.ekodi-maturity-note{padding:11px 13px;border-left:3px solid var(--ekodi-ui-accent,#155eef);background:var(--ekodi-ui-surface-raised,#f8fafc);font-size:12px;line-height:1.55}.ekodi-maturity-error{padding:16px;border:1px solid var(--admin-border,#d9e2ec);border-radius:10px}.ekodi-maturity-error strong{display:block;margin-bottom:5px}.ekodi-maturity-kicker{font-size:11px;font-weight:850;letter-spacing:.08em;color:var(--ekodi-ui-accent,#155eef)!important}.ekodi-maturity-source{font-size:11px;color:var(--admin-secondary,#66768a)}
@media(max-width:1100px){.ekodi-maturity-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.ekodi-maturity-grid{grid-template-columns:1fr}.ekodi-maturity-priorities{grid-template-columns:1fr}.ekodi-maturity-meta{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.ekodi-maturity-head{display:grid}.ekodi-maturity-summary{grid-template-columns:1fr}.ekodi-maturity-domain{grid-template-columns:minmax(130px,1fr) minmax(90px,.8fr) 44px;gap:7px}.ekodi-maturity-meta{grid-template-columns:1fr 1fr}.ekodi-maturity-card strong{font-size:24px}.ekodi-maturity-score strong{font-size:32px}}
`;
  document.head.append(style);

  const panel = document.createElement('section');
  panel.id = MODULE_ID;
  panel.className = 'section ekodi-maturity hidden-panel';
  panel.dataset.panel = SECTION;
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ekodi-maturity-head">
      <div>
        <p class="ekodi-maturity-kicker">EKODI INTERNATIONAL MATURITY</p>
        <h2>플랫폼 성숙도</h2>
        <p>국제표준별 구현 성숙도, 증빙, 갭, 개선과제와 이력을 한 화면에서 관리합니다.</p>
      </div>
      <div class="ekodi-maturity-actions">
        <button type="button" class="secondary" data-maturity-refresh>↻ 새로고침</button>
      </div>
    </div>
    <div data-maturity-status class="ekodi-maturity-empty">최고관리자 권한과 성숙도 원본을 확인하고 있습니다.</div>
    <div data-maturity-view hidden></div>
  `;
  content?.append(panel);

  const status = panel.querySelector('[data-maturity-status]');
  const view = panel.querySelector('[data-maturity-view]');
  const refreshButton = panel.querySelector('[data-maturity-refresh]');
  let authorized = false;
  let loaded = false;
  let loading = null;

  const token = () => {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  };

  function setStatus(message, error = false) {
    if (!status) return;
    status.hidden = false;
    status.className = error ? 'ekodi-maturity-error' : 'ekodi-maturity-empty';
    status.textContent = message;
    if (view) view.hidden = true;
  }

  async function readSession() {
    const headers = new Headers();
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    const response = await fetch(SESSION_URL, { headers, cache:'no-store' });
    if (!response.ok) throw new Error(`관리자 세션 확인 실패 (${response.status})`);
    return response.json();
  }

  async function readMaturity() {
    const headers = new Headers({ accept:'application/json' });
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    const response = await fetch(MATURITY_API, { headers, cache:'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `성숙도 API 확인 실패 (${response.status})`);
    if (!data?.model || !data?.current) throw new Error('성숙도 API 응답 형식이 올바르지 않습니다.');
    return data;
  }

  const esc = value => String(value ?? '');
  const levelName = (model, score) => [...(model.scale || [])].reverse().find(level => score >= Number(level.level))?.name || 'Unknown';
  const modelMap = model => new Map((model.domains || []).map(row => [row.id, row]));

  function scoreState(score) {
    if (score < 3.2) return 'critical';
    if (score < 3.8) return 'watch';
    return 'strong';
  }

  function radarSvg(domains) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 320 320');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '국제표준 영역별 성숙도 레이더 차트');
    const cx = 160, cy = 150, radius = 105, count = Math.max(1, domains.length);
    const point = (index, factor) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index / count);
      return [cx + Math.cos(angle) * radius * factor, cy + Math.sin(angle) * radius * factor];
    };
    const polygon = (factor, className, fill = 'none') => {
      const node = document.createElementNS(ns, 'polygon');
      node.setAttribute('points', domains.map((_, i) => point(i, factor).join(',')).join(' '));
      node.setAttribute('fill', fill);
      node.setAttribute('stroke', 'currentColor');
      node.setAttribute('stroke-opacity', className === 'score' ? '.72' : '.16');
      node.setAttribute('stroke-width', className === 'score' ? '2' : '1');
      return node;
    };
    for (let ring = 1; ring <= 5; ring += 1) svg.append(polygon(ring / 5, 'grid'));
    domains.forEach((row, i) => {
      const [x, y] = point(i, 1);
      const axis = document.createElementNS(ns, 'line');
      axis.setAttribute('x1', cx); axis.setAttribute('y1', cy); axis.setAttribute('x2', x); axis.setAttribute('y2', y);
      axis.setAttribute('stroke', 'currentColor'); axis.setAttribute('stroke-opacity', '.12');
      svg.append(axis);
    });
    const score = document.createElementNS(ns, 'polygon');
    score.setAttribute('points', domains.map((row, i) => point(i, Math.max(0, Math.min(5, row.score)) / 5).join(',')).join(' '));
    score.setAttribute('fill', 'var(--ekodi-ui-accent,#155eef)');
    score.setAttribute('fill-opacity', '.12');
    score.setAttribute('stroke', 'var(--ekodi-ui-accent,#155eef)');
    score.setAttribute('stroke-width', '2');
    svg.append(score);
    domains.forEach((row, i) => {
      const [x, y] = point(i, 1.16);
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', x); label.setAttribute('y', y); label.setAttribute('text-anchor', x < cx - 10 ? 'end' : x > cx + 10 ? 'start' : 'middle');
      label.setAttribute('dominant-baseline', 'middle'); label.setAttribute('font-size', '9'); label.setAttribute('fill', 'currentColor');
      label.textContent = row.shortName;
      svg.append(label);
    });
    return svg;
  }

  function trendSvg(history) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 600 130');
    if (history.length < 2) return svg;
    const points = history.map((row, index) => {
      const x = 30 + (540 * index / (history.length - 1));
      const y = 110 - (Math.max(0, Math.min(5, row.overall)) / 5) * 90;
      return [x, y];
    });
    for (let level = 0; level <= 5; level += 1) {
      const y = 110 - (level / 5) * 90;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', '30'); line.setAttribute('x2', '570'); line.setAttribute('y1', y); line.setAttribute('y2', y);
      line.setAttribute('stroke', 'currentColor'); line.setAttribute('stroke-opacity', '.12');
      svg.append(line);
    }
    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('points', points.map(point => point.join(',')).join(' '));
    polyline.setAttribute('fill', 'none'); polyline.setAttribute('stroke', 'var(--ekodi-ui-accent,#155eef)'); polyline.setAttribute('stroke-width', '3');
    svg.append(polyline);
    points.forEach(([x, y], index) => {
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', '4'); circle.setAttribute('fill', 'var(--ekodi-ui-accent,#155eef)'); svg.append(circle);
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', x); label.setAttribute('y', '126'); label.setAttribute('text-anchor', 'middle'); label.setAttribute('font-size', '9'); label.setAttribute('fill', 'currentColor');
      label.textContent = history[index].date.slice(5); svg.append(label);
    });
    return svg;
  }

  function weightedScore(model, current) {
    const currentById = new Map((current.domains || []).map(row => [row.id, row]));
    const score = (model.domains || []).reduce((sum, domain) => sum + Number(currentById.get(domain.id)?.score || 0) * Number(domain.weight || 0), 0) / 100;
    return Number(score.toFixed(2));
  }

  function historyScore(model, snapshot) {
    return weightedScore(model, snapshot);
  }

  function render(model, current, history) {
    const definitions = modelMap(model);
    const rows = (current.domains || []).map(row => {
      const definition = definitions.get(row.id) || {};
      return {
        ...row,
        name: definition.name || row.id,
        standard: definition.standard || '',
        weight: Number(definition.weight || 0),
        shortName: (definition.name || row.id).replace(/ management| and governance| information| product| capability/gi, '').slice(0, 16),
      };
    });
    const overall = weightedScore(model, current);
    const band = levelName(model, overall);
    const evidenceCount = rows.reduce((sum, row) => sum + (row.evidence?.length || 0), 0);
    const gapCount = rows.reduce((sum, row) => sum + (row.gaps?.length || 0), 0);
    const actionCount = rows.reduce((sum, row) => sum + (row.nextActions?.length || 0), 0);
    const priorities = [...rows].sort((a, b) => a.score - b.score).slice(0, 3);

    view.replaceChildren();
    view.hidden = false;
    status.hidden = true;

    const summary = document.createElement('div'); summary.className = 'ekodi-maturity-summary';
    summary.innerHTML = `
      <article class="ekodi-maturity-card"><small>종합 내부 성숙도</small><div class="ekodi-maturity-score"><strong>${overall.toFixed(2)}</strong><b>/ 5.00</b></div><span>${esc(band)} · 목표까지 ${(5-overall).toFixed(2)}</span></article>
      <article class="ekodi-maturity-card"><small>평가 영역</small><strong>${rows.length}</strong><span>국제표준 기반 도메인</span></article>
      <article class="ekodi-maturity-card"><small>증빙 연결</small><strong>${evidenceCount}</strong><span>코드·정책·워크플로 근거</span></article>
      <article class="ekodi-maturity-card"><small>열린 개선조치</small><strong>${actionCount}</strong><span>갭 ${gapCount}건에서 도출</span></article>`;
    view.append(summary);

    const grid = document.createElement('div'); grid.className = 'ekodi-maturity-grid';
    const radar = document.createElement('article'); radar.className = 'ekodi-maturity-panel'; radar.innerHTML = '<h3>영역별 균형</h3><div class="ekodi-maturity-radar"></div>';
    radar.querySelector('.ekodi-maturity-radar').append(radarSvg(rows));
    const domains = document.createElement('article'); domains.className = 'ekodi-maturity-panel'; domains.innerHTML = '<h3>분야별 현재 수준</h3><div class="ekodi-maturity-domain-list"></div>';
    const list = domains.querySelector('.ekodi-maturity-domain-list');
    rows.forEach(row => {
      const item = document.createElement('div'); item.className = `ekodi-maturity-domain ekodi-maturity-state-${scoreState(Number(row.score))}`;
      const label = document.createElement('div'); label.className = 'ekodi-maturity-domain-label';
      const strong = document.createElement('strong'); strong.textContent = row.name;
      const small = document.createElement('small'); small.textContent = row.standard;
      label.append(strong, small);
      const bar = document.createElement('div'); bar.className = 'ekodi-maturity-bar'; const fill = document.createElement('i'); fill.style.width = `${Math.max(0, Math.min(100, Number(row.score) / 5 * 100))}%`; bar.append(fill);
      const value = document.createElement('strong'); value.textContent = Number(row.score).toFixed(1);
      item.append(label, bar, value); list.append(item);
    });
    grid.append(radar, domains); view.append(grid);

    const priorityPanel = document.createElement('article'); priorityPanel.className = 'ekodi-maturity-panel';
    const priorityTitle = document.createElement('h3'); priorityTitle.textContent = '우선 개선 3영역';
    const priorityGrid = document.createElement('div'); priorityGrid.className = 'ekodi-maturity-priorities';
    priorities.forEach(row => {
      const card = document.createElement('section'); card.className = 'ekodi-maturity-priority';
      const header = document.createElement('header'); const name = document.createElement('strong'); name.textContent = row.name; const score = document.createElement('b'); score.textContent = `${Number(row.score).toFixed(1)} / 5`; header.append(name, score);
      const actions = document.createElement('ul'); (row.nextActions || []).slice(0, 3).forEach(action => { const li = document.createElement('li'); li.textContent = action; actions.append(li); });
      card.append(header, actions); priorityGrid.append(card);
    });
    priorityPanel.append(priorityTitle, priorityGrid); view.append(priorityPanel);

    const trendPanel = document.createElement('article'); trendPanel.className = 'ekodi-maturity-panel';
    const trendTitle = document.createElement('h3'); trendTitle.textContent = `성숙도 이력 · ${history.length}개 스냅샷`;
    const trend = document.createElement('div'); trend.className = 'ekodi-maturity-trend';
    if (history.length < 2) {
      const empty = document.createElement('div'); empty.className = 'ekodi-maturity-empty'; empty.textContent = '현재는 최초 기준선 1건입니다. 다음 평가부터 추세가 자동으로 표시됩니다.'; trend.append(empty);
    } else trend.append(trendSvg(history));
    trendPanel.append(trendTitle, trend); view.append(trendPanel);

    const metaPanel = document.createElement('article'); metaPanel.className = 'ekodi-maturity-panel';
    metaPanel.innerHTML = '<h3>평가·인증 상태</h3>';
    const dl = document.createElement('dl'); dl.className = 'ekodi-maturity-meta';
    const meta = [
      ['평가기준일', current.assessmentDate || '—'],
      ['평가자', current.assessor || '—'],
      ['인증 상태', current.certificationStatus === 'not-claimed' ? '외부 인증 주장 안 함' : current.certificationStatus || '—'],
      ['평가 범위', current.scope || '—'],
    ];
    meta.forEach(([term, value]) => { const wrap = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = term; dd.textContent = value; wrap.append(dt, dd); dl.append(wrap); });
    const note = document.createElement('p'); note.className = 'ekodi-maturity-note'; note.textContent = '이 화면의 0~5 점수는 EKODI 내부 구현 성숙도입니다. ISO/IEC 인증 결과가 아니며, 점수 상승은 증빙 강화와 검증을 동반해야 합니다.';
    const source = document.createElement('p'); source.className = 'ekodi-maturity-source'; source.textContent = 'Source of truth: protected Control API · governance/standards repository evidence';
    metaPanel.append(dl, note, source); view.append(metaPanel);
  }

  async function loadData(force = false) {
    if (!authorized) return;
    if (loading) return loading;
    if (loaded && !force) return;
    loading = (async () => {
      setStatus('국제표준 성숙도 원본과 평가 이력을 확인하고 있습니다.');
      try {
        const payload = await readMaturity();
        const history = Array.isArray(payload.history) && payload.history.length
          ? payload.history
          : [{ date:payload.current.assessmentDate, overall:weightedScore(payload.model,payload.current) }];
        render(payload.model, payload.current, history);
        loaded = true;
      } catch (error) {
        setStatus(`성숙도 원본을 불러오지 못했습니다. ${error.message}`, true);
      }
    })().finally(() => { loading = null; });
    return loading;
  }

  function ensureNav() {
    if (!authorized || !nav) return;
    let button = nav.querySelector('[data-section="maturity"]');
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'nav'; button.dataset.section = SECTION;
      button.append(document.createTextNode('◎ ')); const label = document.createElement('span'); label.textContent = '플랫폼 성숙도'; button.append(label); nav.append(button);
    }
    button.hidden = false; button.removeAttribute('aria-hidden'); button.disabled = false;
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail:{ section:SECTION } }));
  }

  function deny() {
    authorized = false; root.dataset.ekodiMaturityAuthorized = 'false';
    nav?.querySelector('[data-section="maturity"]')?.remove();
    panel.hidden = true; panel.classList.add('hidden-panel');
    if (location.hash.toLowerCase() === '#maturity') {
      history.replaceState(history.state, '', `${location.pathname}${location.search}#campus`);
      window.EKODIAdminPanels?.activate?.('campus');
    }
  }

  async function authorize() {
    try {
      const session = await readSession();
      if (session?.role !== 'super_admin') return deny();
      authorized = true; root.dataset.ekodiMaturityAuthorized = 'true'; ensureNav();
      if (location.hash.toLowerCase() === '#maturity' || window.EKODIAdminPanels?.current?.() === SECTION) await loadData();
    } catch (error) {
      console.warn('[EKODI Maturity] authorization check failed', error);
      deny();
    }
  }

  refreshButton?.addEventListener('click', () => loadData(true));
  window.addEventListener('ekodi-admin-section-changed', event => {
    if (event.detail?.section !== SECTION) return;
    if (authorized) {
      if (location.hash.toLowerCase() !== '#maturity') history.replaceState(history.state, '', `${location.pathname}${location.search}#maturity`);
      void loadData();
    }
  });
  window.addEventListener('ekodi-admin-context-changed', event => {
    if (!authorized) return;
    if (event.detail?.context?.type !== 'platform') {
      nav?.querySelector('[data-section="maturity"]')?.remove();
      if (window.EKODIAdminPanels?.current?.() === SECTION) window.EKODIAdminPanels.activate('campus');
    } else ensureNav();
  });

  const navObserver = nav ? new MutationObserver(() => {
    const button = nav.querySelector('[data-section="maturity"]');
    if (!button) return;
    if (!authorized) { button.hidden = true; button.setAttribute('aria-hidden','true'); button.disabled = true; }
  }) : null;
  if (nav && navObserver) navObserver.observe(nav, { childList:true, subtree:true });

  void authorize();
}
