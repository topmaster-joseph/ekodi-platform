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
    if (dd === null) return 'st-safe';
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
    view.replaceChildren();
    view.hidden = false;
    if (status) status.hidden = true;

    const sorted = [...records].sort((a, b) => {
      const da = daysUntil(a.expiresAt), db = daysUntil(b.expiresAt);
      if (da === null) return 1; if (db === null) return -1; return da - db;
    });

    let soon = 0, noRenew = 0, unset = 0;
    sorted.forEach(r => {
      const dd = daysUntil(r.expiresAt);
      if (dd !== null && dd <= 45) soon += 1;
      if (!r.autoRenew && dd !== null && dd <= 60) noRenew += 1;
      if (dd === null) unset += 1;
    });

    const summary = document.createElement('div');
    summary.className = 'ekodi-domctl-summary';
    summary.innerHTML = `
      <article class="ekodi-domctl-card"><small>등록 도메인</small><strong>${sorted.length}</strong></article>
      <article class="ekodi-domctl-card ${soon ? 'warn' : ''}"><small>45일 내 만료</small><strong>${soon}</strong></article>
      <article class="ekodi-domctl-card ${noRenew ? 'danger' : ''}"><small>자동갱신 꺼짐·임박</small><strong>${noRenew}</strong></article>
      <article class="ekodi-domctl-card"><small>만료일 미설정</small><strong>${unset}</strong></article>`;
    view.append(summary);

    const list = document.createElement('div');
    list.className = 'ekodi-domctl-list';
    if (!sorted.length) {
      const empty = document.createElement('div');
      empty.className = 'ekodi-domctl-empty';
      empty.textContent = '등록된 도메인이 없습니다.';
      list.append(empty);
    }
    sorted.forEach(r => {
      const dd = daysUntil(r.expiresAt);
      const info = ddayText(dd, r.expiresAt);
      const row = document.createElement('div');
      row.className = `ekodi-domctl-row ${statusClass(dd)}`;
      row.dataset.domain = r.domain;
      row.innerHTML = `
        <div class="ekodi-domctl-main">
          <div class="ekodi-domctl-name">${esc(r.domain)}</div>
          <div class="ekodi-domctl-meta">
            <span class="ekodi-domctl-tag">${esc(r.registrar || '도메인클럽')}</span>
            <span class="ekodi-domctl-tag${r.autoRenew ? '' : ' off'}">자동갱신 ${r.autoRenew ? '✓' : '✕'}</span>
            ${r.registeredAt ? `<span class="ekodi-domctl-tag">등록 ${esc(r.registeredAt)}</span>` : ''}
            ${r.memo ? `<span class="ekodi-domctl-tag">${esc(r.memo)}</span>` : ''}
          </div>
        </div>
        <div class="ekodi-domctl-side">
          <div class="ekodi-domctl-dday">${info.num}<small>${info.label}</small></div>
          <div class="ekodi-domctl-rowact">
            <a href="${REGISTRAR_URL}" target="_blank" rel="noopener">도메인클럽 ↗</a>
            <button type="button" data-domctl-edit="${esc(r.domain)}">편집</button>
          </div>
        </div>`;
      list.append(row);

      if (editingDomain === r.domain) {
        const form = document.createElement('form');
        form.className = 'ekodi-domctl-form';
        form.innerHTML = `
          <label>등록일<input type="date" name="registeredAt" value="${esc(r.registeredAt || '')}"></label>
          <label>만료일<input type="date" name="expiresAt" value="${esc(r.expiresAt || '')}"></label>
          <label class="chk"><input type="checkbox" name="autoRenew" ${r.autoRenew ? 'checked' : ''}>자동갱신 켜짐</label>
          <label>알림 시작(일 전)<input type="text" name="reminderDays" inputmode="numeric" value="${esc(r.reminderDays ?? 60)}"></label>
          <label style="grid-column:1/-1">메모<input type="text" name="memo" maxlength="240" value="${esc(r.memo || '')}"></label>
          <div class="acts"><button type="button" data-domctl-cancel>취소</button><button type="submit" class="save">저장</button></div>`;
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const fd = new FormData(form);
          const body = {
            registeredAt: String(fd.get('registeredAt') || ''),
            expiresAt: String(fd.get('expiresAt') || ''),
            autoRenew: fd.get('autoRenew') === 'on',
            transferLock: Boolean(r.transferLock),
            whoisPrivacy: Boolean(r.whoisPrivacy),
            reminderDays: Number(fd.get('reminderDays')) || 60,
            memo: String(fd.get('memo') || ''),
          };
          const saveBtn = form.querySelector('button.save');
          if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중…'; }
          try {
            await saveRecord(r.domain, body);
            editingDomain = null;
            await loadData(true);
          } catch (error) {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
            window.alert(error.message || '저장에 실패했습니다.');
          }
        });
        form.querySelector('[data-domctl-cancel]')?.addEventListener('click', () => { editingDomain = null; render(); });
        list.append(form);
      }
    });
    view.append(list);

    list.querySelectorAll('[data-domctl-edit]').forEach(button => {
      button.addEventListener('click', () => {
        editingDomain = button.getAttribute('data-domctl-edit');
        render();
      });
    });

    const note = document.createElement('p');
    note.className = 'ekodi-domctl-note';
    note.textContent = '만료일·자동갱신·메모는 이 화면에서 기록·관제합니다. 실제 등록·갱신·이전·DNS 변경은 등록기관(도메인클럽)에서 처리하세요. 변경 내역은 감사 기록에 남습니다.';
    view.append(note);
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
        if (location.hash.toLowerCase() === '#domain-control' || window.EKODIAdminPanels?.current?.() === SECTION) await loadData();
      } catch (error) {
        console.warn('[EKODI Domain Control] authorization check failed', error);
        deny();
      }
    })().finally(() => { authorizationInFlight = null; });
    return authorizationInFlight;
  }

  refreshButton?.addEventListener('click', () => loadData(true));

  window.addEventListener('ekodi-admin-section-changed', event => {
    if (event.detail?.section !== SECTION) return;
    if (!authorized) { void authorize(); return; }
    if (location.hash.toLowerCase() !== '#domain-control') history.replaceState(history.state, '', `${location.pathname}${location.search}#domain-control`);
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
