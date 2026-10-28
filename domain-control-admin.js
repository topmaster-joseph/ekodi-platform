// ADMIN-DOMAIN-CONTROL-001: 최고관리자 전용 '도메인 관제' 패널.
// 기존 도메인 레지스트리(domain_registry / GET·PUT /api/registry)를 재사용해
// 보유 도메인의 등록·만료·자동갱신 상태를 한 화면에서 관제하고,
// 실제 등록·갱신·이전은 등록기관(도메인클럽)으로 넘긴다. DNS 원문 편집은 노출하지 않는다.
const SECTION = 'domain-control';
const MODULE_ID = 'ekodiDomainControl';
const TOKEN_KEY = 'ekodi-auth-token';
const SESSION_URL = 'https://ekodi.kr/api/session';
const REGISTRY_URL = 'https://ekodi.kr/api/registry';
const REGISTRAR_URL = 'https://www.domainclub.kr';

if (typeof document !== 'undefined' && !document.getElementById(MODULE_ID)) {
  const content = document.querySelector('.content');
  const nav = document.querySelector('.sidebar nav');
  const root = document.documentElement;
  root.dataset.ekodiDomctlAuthorized = 'pending';

  const style = document.createElement('style');
  style.id = 'ekodi-domain-control-style';
  style.textContent = `
html:not([data-ekodi-domctl-authorized="true"]) .sidebar [data-section="domain-control"]{display:none!important}
.ekodi-domctl{display:grid;gap:16px}
.ekodi-domctl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.ekodi-domctl-head h2{margin:3px 0 5px;font-size:24px}.ekodi-domctl-head p{margin:0}
.ekodi-domctl-kicker{font-size:11px;font-weight:850;letter-spacing:.08em;color:var(--ekodi-ui-accent,#155eef)}
.ekodi-domctl-actions{display:flex;gap:8px;flex-wrap:wrap}
.ekodi-domctl-actions button,.ekodi-domctl-actions a{min-height:38px;padding:7px 12px;border-radius:9px;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;text-decoration:none}
.ekodi-domctl-registrar{background:var(--ekodi-ui-accent,#155eef);color:#fff;border:1px solid var(--ekodi-ui-accent,#155eef)}
.ekodi-domctl-summary{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:12px}
.ekodi-domctl-card{border:1px solid var(--admin-border,#d9e2ec);border-radius:13px;background:var(--ekodi-ui-surface,#fff);padding:14px;display:grid;gap:5px}
.ekodi-domctl-card small{font-size:11px;font-weight:800;letter-spacing:.03em;color:var(--admin-secondary,#66768a)}
.ekodi-domctl-card strong{font-size:28px;line-height:1.1}
.ekodi-domctl-card.warn strong{color:#b4690e}.ekodi-domctl-card.danger strong{color:#c0362c}
.ekodi-domctl-list{display:grid;gap:10px}
.ekodi-domctl-row{border:1px solid var(--admin-border,#d9e2ec);border-left:3px solid var(--admin-border,#d9e2ec);border-radius:12px;background:var(--ekodi-ui-surface,#fff);padding:14px 16px;display:grid;grid-template-columns:1fr auto;gap:10px 18px;align-items:center}
.ekodi-domctl-row.st-safe{border-left-color:#1f9d6b}.ekodi-domctl-row.st-warn{border-left-color:#e0a93b}.ekodi-domctl-row.st-danger{border-left-color:#d9695a}
.ekodi-domctl-main{min-width:0}
.ekodi-domctl-name{font-size:17px;font-weight:700;word-break:break-all}
.ekodi-domctl-meta{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:7px;font-size:12px;color:var(--admin-secondary,#66768a)}
.ekodi-domctl-tag{display:inline-flex;align-items:center;gap:5px;background:var(--ekodi-ui-surface-raised,#f8fafc);border:1px solid var(--admin-border,#d9e2ec);padding:3px 9px;border-radius:999px}
.ekodi-domctl-tag.off{color:#b4690e}
.ekodi-domctl-side{display:flex;flex-direction:column;align-items:flex-end;gap:9px}
.ekodi-domctl-dday{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.ekodi-domctl-dday small{display:block;font-size:10px;font-weight:600;letter-spacing:.08em;color:var(--admin-secondary,#66768a);text-align:right;margin-top:4px}
.st-safe .ekodi-domctl-dday{color:#1f9d6b}.st-warn .ekodi-domctl-dday{color:#b4690e}.st-danger .ekodi-domctl-dday{color:#c0362c}
.ekodi-domctl-rowact{display:flex;gap:6px}
.ekodi-domctl-rowact button,.ekodi-domctl-rowact a{font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid var(--admin-border,#d9e2ec);background:var(--ekodi-ui-surface,#fff);color:var(--admin-secondary,#66768a);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:4px}
.ekodi-domctl-rowact a:hover{color:var(--ekodi-ui-accent,#155eef);border-color:var(--ekodi-ui-accent,#155eef)}
.ekodi-domctl-form{grid-column:1/-1;border-top:1px dashed var(--admin-border,#d9e2ec);margin-top:4px;padding-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ekodi-domctl-form label{display:grid;gap:5px;font-size:12px;color:var(--admin-secondary,#66768a)}
.ekodi-domctl-form input[type=date],.ekodi-domctl-form input[type=text]{min-height:36px;padding:7px 10px;border:1px solid var(--admin-border,#d9e2ec);border-radius:8px;font:inherit}
.ekodi-domctl-form .chk{flex-direction:row;align-items:center;gap:8px}
.ekodi-domctl-form .acts{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end}
.ekodi-domctl-form .acts button{min-height:36px;padding:7px 14px;border-radius:9px;font-weight:600;border:1px solid var(--admin-border,#d9e2ec);background:var(--ekodi-ui-surface,#fff);cursor:pointer}
.ekodi-domctl-form .acts button.save{background:var(--ekodi-ui-accent,#155eef);color:#fff;border-color:var(--ekodi-ui-accent,#155eef)}
.ekodi-domctl-empty{padding:18px;border:1px dashed var(--admin-border,#d9e2ec);border-radius:10px;text-align:center;color:var(--admin-secondary,#66768a)}
.ekodi-domctl-error{padding:16px;border:1px solid var(--admin-border,#d9e2ec);border-radius:10px}
.ekodi-domctl-note{padding:11px 13px;border-left:3px solid var(--ekodi-ui-accent,#155eef);background:var(--ekodi-ui-surface-raised,#f8fafc);font-size:12px;line-height:1.55}
@media(max-width:1100px){.ekodi-domctl-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.ekodi-domctl-summary{grid-template-columns:1fr}.ekodi-domctl-row{grid-template-columns:1fr}.ekodi-domctl-side{flex-direction:row;align-items:center;justify-content:space-between;width:100%;border-top:1px solid var(--admin-border,#d9e2ec);padding-top:8px}.ekodi-domctl-form{grid-template-columns:1fr}}
`;
  style.textContent += "\n/* Compact domain control: native list, readable states, filterable records. */\n.ekodi-domctl{gap:12px;max-width:100%;padding-bottom:88px}\n.ekodi-domctl-head{align-items:center}\n.ekodi-domctl-head h2{font-size:23px;margin:2px 0 4px}\n.ekodi-domctl-head p:not(.ekodi-domctl-kicker){max-width:760px;font-size:12px;line-height:1.5}\n.ekodi-domctl-summary{gap:9px}\n.ekodi-domctl-card{padding:12px 14px;border-radius:10px;gap:4px}\n.ekodi-domctl-card strong{font-size:25px}\n.ekodi-domctl-card>span{font-size:11px;color:var(--admin-secondary,#64748b)}\n.ekodi-domctl-toolbar{display:flex;gap:12px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap}\n.ekodi-domctl-search{display:grid;gap:5px;min-width:220px;flex:1 1 230px;font-size:11px;font-weight:700;color:var(--admin-secondary,#64748b)}\n.ekodi-domctl-search input{width:100%;height:38px;padding:8px 12px;border:1px solid var(--admin-border,#d9e2ec);border-radius:9px;background:var(--ekodi-ui-surface,#fff);color:inherit;font:inherit;font-size:13px;font-weight:400}\n.ekodi-domctl-search input:focus-visible,.ekodi-domctl-filters button:focus-visible,.ekodi-domctl-rowact button:focus-visible,.ekodi-domctl-form :is(input,button):focus-visible{outline:2px solid var(--ekodi-ui-accent,#155eef);outline-offset:2px}\n.ekodi-domctl-filters{display:flex;gap:5px;flex-wrap:wrap;align-items:center}\n.ekodi-domctl-filters button{height:34px;white-space:nowrap;padding:5px 10px;border:1px solid var(--admin-border,#d9e2ec);border-radius:8px;background:var(--ekodi-ui-surface,#fff);color:var(--admin-secondary,#66768a);font:inherit;font-size:12px;cursor:pointer}\n.ekodi-domctl-filters button span{font-variant-numeric:tabular-nums;font-weight:750}\n.ekodi-domctl-filters button[aria-pressed=\"true\"]{border-color:var(--ekodi-ui-accent,#155eef);background:var(--ekodi-ui-surface-raised,#eef4ff);color:var(--ekodi-ui-accent,#155eef);font-weight:750}\n.ekodi-domctl-table{border:1px solid var(--admin-border,#d9e2ec);border-radius:11px;background:var(--ekodi-ui-surface,#fff);overflow:hidden}\n.ekodi-domctl-table-top{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px}\n.ekodi-domctl-table-top strong{font-size:14px}\n.ekodi-domctl-table-top span{font-size:12px;color:var(--admin-secondary,#66768a)}\n.ekodi-domctl-list-head,.ekodi-domctl-row{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(84px,.75fr) minmax(116px,1fr) minmax(120px,1fr) 178px;align-items:center;gap:12px}\n.ekodi-domctl-list-head{padding:10px 14px;background:var(--ekodi-ui-surface-raised,#f4f7fa);border-top:1px solid var(--admin-border,#d9e2ec);font-size:11px;font-weight:800;color:var(--admin-secondary,#66768a)}\n.ekodi-domctl-list{display:block}\n.ekodi-domctl-entry{border-top:1px solid var(--admin-border,#d9e2ec)}\n.ekodi-domctl-entry:first-child{border-top:0}\n.ekodi-domctl-row{border:0!important;border-radius:0;padding:12px 14px;background:transparent}\n.ekodi-domctl-entry:hover>.ekodi-domctl-row{background:var(--ekodi-ui-surface-raised,#f8fafc)}\n.ekodi-domctl-cell{min-width:0;font-size:12px}\n.ekodi-domctl-cell:not(.ekodi-domctl-identity){display:flex;flex-direction:column;align-items:flex-start;gap:3px}\n.ekodi-domctl-name{font-size:14px;font-weight:750;word-break:break-word}\n.ekodi-domctl-memo{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--admin-secondary,#66768a);margin-top:4px}\n.ekodi-domctl-expiry small{font-size:11px;color:var(--admin-secondary,#66768a);font-variant-numeric:tabular-nums}\n.ekodi-domctl-state{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}\n.ekodi-domctl-state.st-safe{color:#08734e}.ekodi-domctl-state.st-warn{color:#a35b00}\n.ekodi-domctl-state.st-danger{color:#bf3930}.ekodi-domctl-state.st-unknown{color:var(--admin-secondary,#64748b)}\n.ekodi-domctl-pill{display:inline-flex;align-items:center;padding:4px 8px;border-radius:7px;font-size:11px;line-height:1.3;font-weight:700}\n.ekodi-domctl-pill.yes{background:#e7f7ed;color:#146a40}\n.ekodi-domctl-pill.no{background:#fff4e5;color:#96540b}\n.ekodi-domctl-rowact{display:flex!important;flex-direction:row!important;gap:6px;align-items:center!important;white-space:nowrap}\n.ekodi-domctl-rowact button,.ekodi-domctl-rowact a{padding:7px 9px;font-size:11px;border-radius:7px}\n.ekodi-domctl-entry .ekodi-domctl-form{border-top:1px solid var(--admin-border,#d9e2ec);margin:0 12px 12px;padding:14px;background:var(--ekodi-ui-surface-raised,#f8fafc);border-radius:8px;grid-template-columns:repeat(2,minmax(0,1fr))}\n.ekodi-domctl-form input[type=number]{min-height:36px;padding:7px 10px;border:1px solid var(--admin-border,#d9e2ec);border-radius:8px;font:inherit}\n.ekodi-domctl-form .chk{display:flex;flex-direction:row;align-items:center}\n.ekodi-domctl-form .ekodi-domctl-wide{grid-column:1/-1}\n.ekodi-domctl-form-hint{grid-column:1/-1;margin:0;font-size:11px;color:var(--admin-secondary,#66768a)}\n.ekodi-domctl-note{margin:0;border-radius:7px}\n@media(max-width:1150px){.ekodi-domctl-toolbar{align-items:stretch}.ekodi-domctl-filters{width:100%}.ekodi-domctl-list-head,.ekodi-domctl-row{grid-template-columns:minmax(0,1.3fr) minmax(85px,.7fr) minmax(115px,.9fr) minmax(115px,.9fr) 170px;gap:7px}}\n@media(max-width:890px){.ekodi-domctl-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.ekodi-domctl-list-head{display:none}.ekodi-domctl-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ekodi-domctl-cell::before{content:attr(data-label);display:block;margin-bottom:5px;font-size:10px;font-weight:700;color:var(--admin-secondary,#66768a)}.ekodi-domctl-cell.ekodi-domctl-identity{grid-column:1/-1}.ekodi-domctl-rowact{align-self:center}.ekodi-domctl-rowact::before{display:none}}\n@media(max-width:500px){.ekodi-domctl-head h2{font-size:21px}.ekodi-domctl-summary{gap:7px}.ekodi-domctl-card{padding:10px}.ekodi-domctl-card strong{font-size:22px}.ekodi-domctl-search{flex-basis:100%}.ekodi-domctl-filters{gap:4px}.ekodi-domctl-filters button{font-size:11px;padding:5px 8px}.ekodi-domctl-entry .ekodi-domctl-form{grid-template-columns:1fr}.ekodi-domctl-row{grid-template-columns:1fr}.ekodi-domctl-cell.ekodi-domctl-identity{grid-column:auto}}\n";
  document.head.append(style);

  const panel = document.createElement('section');
  panel.id = MODULE_ID;
  panel.className = 'section ekodi-domctl hidden-panel';
  panel.dataset.panel = SECTION;
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ekodi-domctl-head">
      <div>
        <p class="ekodi-domctl-kicker">EKODI DOMAIN CONTROL</p>
        <h2>도메인 관제</h2>
        <p>보유 도메인의 등록·만료·자동갱신 상태를 한 화면에서 확인합니다. 실제 등록·갱신·이전은 등록기관(도메인클럽)에서 처리합니다.</p>
      </div>
      <div class="ekodi-domctl-actions">
        <button type="button" class="secondary" data-domctl-refresh>↻ 새로고침</button>
        <a class="ekodi-domctl-registrar" href="${REGISTRAR_URL}" target="_blank" rel="noopener">도메인클럽 접속 ↗</a>
      </div>
    </div>
    <div data-domctl-status class="ekodi-domctl-empty">최고관리자 권한과 도메인 레지스트리를 확인하고 있습니다.</div>
    <div data-domctl-view hidden></div>
  `;
  content?.append(panel);

  const status = panel.querySelector('[data-domctl-status]');
  const view = panel.querySelector('[data-domctl-view]');
  const refreshButton = panel.querySelector('[data-domctl-refresh]');
  let authorized = false;
  let loaded = false;
  let loading = null;
  let authorizationInFlight = null;
  let records = [];
  let editingDomain = null;
  let searchTerm = '';
  let activeFilter = 'all';

  const token = () => {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  };

  function setStatus(message, error = false) {
    if (!status) return;
    status.hidden = false;
    status.className = error ? 'ekodi-domctl-error' : 'ekodi-domctl-empty';
    status.textContent = message;
    if (view) view.hidden = true;
  }

  async function readSession() {
    const headers = new Headers();
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    const response = await fetch(SESSION_URL, { headers, cache: 'no-store' });
    if (!response.ok) throw new Error(`관리자 세션 확인 실패 (${response.status})`);
    return response.json();
  }

  async function readRegistry() {
    const headers = new Headers({ accept: 'application/json' });
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    const response = await fetch(REGISTRY_URL, { headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `도메인 레지스트리 확인 실패 (${response.status})`);
    if (!Array.isArray(data.records)) throw new Error('레지스트리 응답 형식이 올바르지 않습니다.');
    return data.records;
  }

  async function saveRecord(domain, body) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    const response = await fetch(`${REGISTRY_URL}/${encodeURIComponent(domain)}`, {
      method: 'PUT', headers, body: JSON.stringify(body), cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `저장 실패 (${response.status})`);
    return data;
  }

  const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function daysUntil(iso) {
    if (!iso) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    return Math.round((target - today) / 86400000);
  }

  function statusClass(dd) {
    if (dd === null) return 'st-unknown';
    if (dd <= 14) return 'st-danger';
    if (dd <= 45) return 'st-warn';
    return 'st-safe';
  }

  function ddayText(dd, expiresAt) {
    if (dd === null) return { num: '—', label: '만료일 미설정' };
    if (dd < 0) return { num: '만료', label: `${Math.abs(dd)}일 경과` };
    if (dd === 0) return { num: 'D-DAY', label: '오늘 만료' };
    return { num: `D-${dd}`, label: esc(expiresAt) };
  }

  function render() {
    if (!view) return;
    view.replaceChildren();
    view.hidden = false;
    if (status) status.hidden = true;
  
    const sorted = [...records].sort((a, b) => {
      const da = daysUntil(a.expiresAt);
      const db = daysUntil(b.expiresAt);
      if (da === null && db !== null) return 1;
      if (db === null && da !== null) return -1;
      if (da !== null && db !== null && da !== db) return da - db;
      return String(a.domain).localeCompare(String(b.domain));
    });
    const soon = sorted.filter(r => {
      const dd = daysUntil(r.expiresAt);
      return dd !== null && dd <= 45;
    }).length;
    const noRenew = sorted.filter(r => !r.autoRenew).length;
    const unset = sorted.filter(r => daysUntil(r.expiresAt) === null).length;
    const attention = sorted.filter(r => {
      const dd = daysUntil(r.expiresAt);
      return dd === null || dd <= 45 || !r.autoRenew;
    }).length;
  
    const summary = document.createElement('div');
    summary.className = 'ekodi-domctl-summary';
    summary.setAttribute('aria-label', '도메인 상태 요약');
    summary.innerHTML = `
      <article class="ekodi-domctl-card"><small>보유 도메인</small><strong>${sorted.length}</strong><span>등록 원장 기준</span></article>
      <article class="ekodi-domctl-card ${soon ? 'warn' : ''}"><small>45일 내 만료·경과</small><strong>${soon}</strong><span>만료일 입력분 기준</span></article>
      <article class="ekodi-domctl-card ${noRenew ? 'warn' : ''}"><small>자동갱신 꺼짐</small><strong>${noRenew}</strong><span>만료일과 무관한 전체 건수</span></article>
      <article class="ekodi-domctl-card ${unset ? 'warn' : ''}"><small>만료일 확인 필요</small><strong>${unset}</strong><span>미입력은 정상으로 분류하지 않음</span></article>`;
    view.append(summary);
  
    const toolbar = document.createElement('div');
    toolbar.className = 'ekodi-domctl-toolbar';
    toolbar.innerHTML = `
      <label class="ekodi-domctl-search">도메인 검색
        <input type="search" data-domctl-search placeholder="도메인·등록기관·메모 검색" autocomplete="off" value="${esc(searchTerm)}">
      </label>
      <div class="ekodi-domctl-filters" role="group" aria-label="도메인 상태 필터">
        <button type="button" data-domctl-filter="all" aria-pressed="${activeFilter === 'all'}">전체 <span>${sorted.length}</span></button>
        <button type="button" data-domctl-filter="attention" aria-pressed="${activeFilter === 'attention'}">확인 필요 <span>${attention}</span></button>
        <button type="button" data-domctl-filter="expiring" aria-pressed="${activeFilter === 'expiring'}">만료 임박 <span>${soon}</span></button>
        <button type="button" data-domctl-filter="no-renew" aria-pressed="${activeFilter === 'no-renew'}">갱신 꺼짐 <span>${noRenew}</span></button>
        <button type="button" data-domctl-filter="unset" aria-pressed="${activeFilter === 'unset'}">만료일 미입력 <span>${unset}</span></button>
      </div>`;
    view.append(toolbar);
  
    const search = searchTerm.trim().toLowerCase();
    const visible = sorted.filter(r => {
      const dd = daysUntil(r.expiresAt);
      const matchesSearch = !search || [r.domain,r.registrar,r.memo].some(value => String(value ?? '').toLowerCase().includes(search));
      if (!matchesSearch) return false;
      if (activeFilter === 'attention') return dd === null || dd <= 45 || !r.autoRenew;
      if (activeFilter === 'expiring') return dd !== null && dd <= 45;
      if (activeFilter === 'no-renew') return !r.autoRenew;
      if (activeFilter === 'unset') return dd === null;
      return true;
    });
  
    const table = document.createElement('section');
    table.className = 'ekodi-domctl-table';
    table.setAttribute('aria-label', '도메인 목록');
    table.innerHTML = `
      <div class="ekodi-domctl-table-top"><strong>도메인 목록</strong><span aria-live="polite">총 ${sorted.length}개 중 ${visible.length}개 표시</span></div>
      <div class="ekodi-domctl-list-head" aria-hidden="true">
        <span>도메인</span><span>등록기관</span><span>만료일 / 잔여일</span><span>자동갱신</span><span>관리</span>
      </div>`;
    const list = document.createElement('div');
    list.className = 'ekodi-domctl-list';
    list.setAttribute('role', 'list');
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'ekodi-domctl-empty';
      empty.textContent = sorted.length ? '검색 또는 필터에 맞는 도메인이 없습니다.' : '등록된 도메인이 없습니다.';
      list.append(empty);
    }
    visible.forEach(r => {
      const dd = daysUntil(r.expiresAt);
      const info = ddayText(dd, r.expiresAt);
      const entry = document.createElement('article');
      entry.className = 'ekodi-domctl-entry';
      entry.setAttribute('role', 'listitem');
      entry.dataset.domain = r.domain;
      const expires = dd === null
        ? '<strong class="ekodi-domctl-state st-unknown">확인 필요</strong><small>만료일 미입력</small>'
        : `<strong class="ekodi-domctl-state ${statusClass(dd)}">${info.num}</strong><small>${info.label}</small>`;
      const renewed = r.autoRenew
        ? '<span class="ekodi-domctl-pill yes">켜짐 · 기록값</span>'
        : '<span class="ekodi-domctl-pill no">꺼짐 · 확인 필요</span>';
      entry.innerHTML = `
        <div class="ekodi-domctl-row ${statusClass(dd)}">
          <div class="ekodi-domctl-cell ekodi-domctl-identity" data-label="도메인">
            <strong class="ekodi-domctl-name">${esc(r.domain)}</strong>
            ${r.memo ? `<small class="ekodi-domctl-memo" title="${esc(r.memo)}">${esc(r.memo)}</small>` : ''}
          </div>
          <div class="ekodi-domctl-cell" data-label="등록기관"><span>${esc(r.registrar || '미기록')}</span></div>
          <div class="ekodi-domctl-cell ekodi-domctl-expiry" data-label="만료일">${expires}</div>
          <div class="ekodi-domctl-cell" data-label="자동갱신">${renewed}</div>
          <div class="ekodi-domctl-cell ekodi-domctl-rowact" data-label="관리">
            <button type="button" data-domctl-edit="${esc(r.domain)}" aria-expanded="${editingDomain === r.domain}" aria-label="${esc(r.domain)} 상세 편집">${editingDomain === r.domain ? '닫기' : '상세·편집'}</button>
            <a href="${REGISTRAR_URL}" target="_blank" rel="noopener noreferrer" aria-label="${esc(r.domain)} 등록기관 사이트 새 창에서 열기">등록기관 ↗</a>
          </div>
        </div>`;
      if (editingDomain === r.domain) {
        const form = document.createElement('form');
        form.className = 'ekodi-domctl-form';
        form.innerHTML = `
          <label>등록일<input type="date" name="registeredAt" value="${esc(r.registeredAt || '')}"></label>
          <label>만료일<input type="date" name="expiresAt" value="${esc(r.expiresAt || '')}"></label>
          <label class="chk"><input type="checkbox" name="autoRenew" ${r.autoRenew ? 'checked' : ''}>등록기관에서 자동갱신 확인됨</label>
          <label>알림 시작(일 전)<input type="number" name="reminderDays" min="1" max="365" step="1" required value="${esc(r.reminderDays ?? 60)}"></label>
          <label class="ekodi-domctl-wide">메모<input type="text" name="memo" maxlength="240" value="${esc(r.memo || '')}"></label>
          <p class="ekodi-domctl-form-hint">이 변경은 내부 관리기록입니다. 실제 갱신 상태·만료일은 등록기관에서 확인한 후 입력하세요.</p>
          <div class="acts"><button type="button" data-domctl-cancel>취소</button><button type="submit" class="save">변경 저장</button></div>`;
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const fd = new FormData(form);
          const reminderDays = Number(fd.get('reminderDays'));
          if (!Number.isInteger(reminderDays) || reminderDays < 1 || reminderDays > 365) {
            window.alert('알림 시작일은 1~365일 사이의 정수로 입력하세요.');
            return;
          }
          const body = {
            registeredAt: String(fd.get('registeredAt') || ''),
            expiresAt: String(fd.get('expiresAt') || ''),
            autoRenew: fd.get('autoRenew') === 'on',
            transferLock: Boolean(r.transferLock),
            whoisPrivacy: Boolean(r.whoisPrivacy),
            reminderDays,
            memo: String(fd.get('memo') || ''),
          };
          const saveBtn = form.querySelector('button.save');
          if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중…'; }
          try {
            await saveRecord(r.domain, body);
            editingDomain = null;
            await loadData(true);
          } catch (error) {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '변경 저장'; }
            window.alert(error.message || '저장에 실패했습니다.');
          }
        });
        form.querySelector('[data-domctl-cancel]')?.addEventListener('click', () => {
          editingDomain = null;
          render();
        });
        entry.append(form);
      }
      list.append(entry);
    });
    table.append(list);
    view.append(table);
  
    const note = document.createElement('p');
    note.className = 'ekodi-domctl-note';
    note.textContent = '만료일과 자동갱신은 내부 관리기록이며 실시간 등록기관 조회 결과가 아닙니다. 실제 등록·갱신·이전·DNS 변경은 등록기관에서 처리합니다. 저장 작업은 감사 기록 대상입니다.';
    view.append(note);
  
    toolbar.querySelector('[data-domctl-search]')?.addEventListener('input', event => {
      searchTerm = event.target.value;
      const position = event.target.selectionStart;
      render();
      const next = view.querySelector('[data-domctl-search]');
      next?.focus();
      if (position !== null && next?.setSelectionRange) next.setSelectionRange(position, position);
    });
    toolbar.querySelectorAll('[data-domctl-filter]').forEach(button => {
      button.addEventListener('click', () => {
        activeFilter = button.dataset.domctlFilter;
        render();
        view.querySelector(`[data-domctl-filter="${activeFilter}"]`)?.focus();
      });
    });
    list.querySelectorAll('[data-domctl-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const domain = button.getAttribute('data-domctl-edit');
        editingDomain = editingDomain === domain ? null : domain;
        render();
        view.querySelector(`[data-domctl-edit="${CSS.escape(domain)}"]`)?.focus();
      });
    });
  }

  async function loadData(force = false) {
    if (!authorized) return;
    if (loading) return loading;
    if (loaded && !force) return;
    loading = (async () => {
      setStatus('도메인 레지스트리를 불러오고 있습니다.');
      try {
        records = await readRegistry();
        render();
        loaded = true;
      } catch (error) {
        setStatus(`도메인 레지스트리를 불러오지 못했습니다. ${error.message}`, true);
      }
    })().finally(() => { loading = null; });
    return loading;
  }

  function ensureNav() {
    if (!authorized || !nav) return;
    let button = nav.querySelector('[data-section="domain-control"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav';
      button.dataset.section = SECTION;
      button.append(document.createTextNode('◎ '));
      const label = document.createElement('span');
      label.textContent = '도메인 관제';
      button.append(label);
      nav.append(button);
    }
    button.hidden = false;
    button.removeAttribute('aria-hidden');
    button.disabled = false;
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail: { section: SECTION } }));
  }

  function deny() {
    authorized = false;
    root.dataset.ekodiDomctlAuthorized = 'false';
    nav?.querySelector('[data-section="domain-control"]')?.remove();
    panel.hidden = true;
    panel.classList.add('hidden-panel');
    if (location.hash.toLowerCase() === '#domain-control') {
      history.replaceState(history.state, '', `${location.pathname}${location.search}#campus`);
      window.EKODIAdminPanels?.activate?.('campus');
    }
  }

  function authorize() {
    if (authorizationInFlight) return authorizationInFlight;
    authorizationInFlight = (async () => {
      try {
        const session = await readSession();
        if (session?.role !== 'super_admin') return deny();
        authorized = true;
        root.dataset.ekodiDomctlAuthorized = 'true';
        ensureNav();
        if (location.hash.toLowerCase() === '#domain-control' || window.EKODIAdminPanels?.current?.() === SECTION) {
          revealDomainWorkspace();
          await loadData();
        }
      } catch (error) {
        console.warn('[EKODI Domain Control] authorization check failed', error);
        deny();
      }
    })().finally(() => { authorizationInFlight = null; });
    return authorizationInFlight;
  }

  // Reset inherited Admin workspace scroll when switching to this page.
  // A previous section can remain in the screenshot even when the domain
  // menu is selected, if the shared scroll container keeps its old offset.
  function revealDomainWorkspace() {
    requestAnimationFrame(() => {
      if (panel.hidden || panel.classList.contains('hidden-panel')) return;
      const workspace = content?.closest('main');
      if (workspace) workspace.scrollTop = 0;
      if (content) content.scrollTop = 0;
    });
  }

  refreshButton?.addEventListener('click', () => loadData(true));

  window.addEventListener('ekodi-admin-section-changed', event => {
    if (event.detail?.section !== SECTION) return;
    if (!authorized) { void authorize(); return; }
    if (location.hash.toLowerCase() !== '#domain-control') history.replaceState(history.state, '', `${location.pathname}${location.search}#domain-control`);
    revealDomainWorkspace();
    void loadData();
  });

  window.addEventListener('ekodi-admin-context-changed', event => {
    if (!authorized) return;
    if (event.detail?.context?.type !== 'platform') {
      nav?.querySelector('[data-section="domain-control"]')?.remove();
      if (window.EKODIAdminPanels?.current?.() === SECTION) window.EKODIAdminPanels.activate('campus');
    } else ensureNav();
  });

  const navObserver = nav ? new MutationObserver(() => {
    const button = nav.querySelector('[data-section="domain-control"]');
    if (!button) return;
    if (!authorized) { button.hidden = true; button.setAttribute('aria-hidden', 'true'); button.disabled = true; }
  }) : null;
  if (nav && navObserver) navObserver.observe(nav, { childList: true, subtree: true });

  void authorize();
}
