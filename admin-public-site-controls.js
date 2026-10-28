(() => {
'use strict';
const PANEL_ID = 'publicSiteControlsPanel';
const API = 'https://ekodi.kr/api/control/public-sites';
const SECTION = 'public-site-controls';
const LABELS = {
  public: '공개',
  private: '비공개',
  maintenance: '점검화면',
  default: '기본 안내 화면',
  url: '지정 주소 연결',
  button: '버튼 이동',
  auto: '자동 이동'
};

function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function surfaceInfo(site) {
  const resolver = window.EKODIAdminSurfaceLabels;
  if (resolver?.info) return resolver.info(site?.domain, site?.label || '', site?.url || '');
  const raw = String(site?.domain || '').trim();
  return { label: site?.label || raw, url: site?.url || (raw ? 'https://' + raw : '') };
}

function currentToken() {
  try {
    return sessionStorage.getItem('ekodi-auth-token') || '';
  } catch {
    return '';
  }
}

async function api(path = '', options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('accept', 'application/json');
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const token = currentToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: 'omit' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '사이트 공개 설정을 처리하지 못했습니다.');
  return payload;
}

function isPublicSiteNav(item) {
  return item?.dataset?.adminLink === SECTION || item?.dataset?.section === SECTION || item?.dataset?.lazySection === SECTION;
}

function bindNavLink(link) {
  if (!link) return;
  link.dataset.adminLink = SECTION;
  link.dataset.section = SECTION;
  if (!link.querySelector('span')) link.innerHTML = '<span>사이트 공개 설정</span>';
  if (link.dataset.publicSiteControlsBound === 'true') return;
  link.dataset.publicSiteControlsBound = 'true';
  link.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    location.hash = '#public-site-controls';
    activate();
  }, true);
}

function ensureNavLink() {
  const nav = document.querySelector('.sidebar nav');
  if (!nav) return;
  let link = nav.querySelector('[data-admin-link="public-site-controls"], [data-section="public-site-controls"], [data-lazy-section="public-site-controls"]');
  if (!link) {
    link = el('<button type="button" class="nav" data-admin-link="public-site-controls" data-section="public-site-controls"><span>사이트 공개 설정</span></button>');
    nav.appendChild(link);
  }
  bindNavLink(link);
}

const viewState = { sites: [], selectedId: null, query: '', status: 'all', dirty: false, loading: false, requestId: 0 };
const STATUS_OPTIONS = ['public','private','maintenance'];
const formFields = ['publicStatus','maintenanceDisplayType','maintenanceTitle','maintenanceMessage','maintenanceRedirectUrl','redirectMode'];
function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function safeSiteUrl(site) {
  try {
    const url = new URL(surfaceInfo(site).url, location.origin);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) return url.href;
  } catch {}
  return '';
}
function ensureStyle() {
  if (document.getElementById('ekodiPublicSiteUiStyle')) return;
  const css = document.createElement('style');
  css.id = 'ekodiPublicSiteUiStyle';
  css.textContent = `
    #publicSiteControlsPanel{width:100%;max-width:none;min-width:0}
    #publicSiteControlsPanel .psc-header{display:flex;justify-content:space-between;align-items:start;gap:16px;flex-wrap:wrap}
    #publicSiteControlsPanel .psc-header h2{font-size:clamp(20px,2vw,26px);margin:0 0 7px}
    #publicSiteControlsPanel .psc-intro{max-width:720px;margin:0;color:var(--ekodi-ui-muted,#64748b);font-size:13px;line-height:1.6;word-break:keep-all}
    #publicSiteControlsPanel .psc-button{appearance:none;display:inline-flex;justify-content:center;align-items:center;min-height:38px;gap:7px;border:1px solid var(--ekodi-ui-border,#cbd5e1);border-radius:10px;padding:8px 13px;background:var(--ekodi-ui-surface,#fff);color:var(--ekodi-ui-text,#172b4d);font-weight:650;font-size:13px;cursor:pointer;text-decoration:none}
    #publicSiteControlsPanel .psc-button:hover{border-color:#528dd9}
    #publicSiteControlsPanel .psc-button:focus-visible,#publicSiteControlsPanel input:focus-visible,#publicSiteControlsPanel select:focus-visible,#publicSiteControlsPanel textarea:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}
    #publicSiteControlsPanel .psc-button:disabled{opacity:.55;cursor:not-allowed}
    #publicSiteControlsPanel .psc-button.primary{background:#215cc7;color:#fff;border-color:#215cc7}
    #publicSiteControlsPanel .psc-button.primary:disabled{background:#7b93b3;border-color:#7b93b3}
    #publicSiteControlsPanel .psc-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:18px 0}
    #publicSiteControlsPanel .psc-metric{min-width:0;padding:14px 16px;border-radius:13px;text-align:left;border:1px solid var(--ekodi-ui-border,#d8e1ea);background:var(--ekodi-ui-surface,rgba(250,252,255,.75));color:var(--ekodi-ui-text,#172b4d);cursor:pointer}
    #publicSiteControlsPanel .psc-metric[aria-pressed="true"]{border-color:#3b82f6;box-shadow:inset 0 0 0 1px #3b82f6}
    #publicSiteControlsPanel .psc-metric strong{display:block;font-size:23px;line-height:1.25;font-variant-numeric:tabular-nums}
    #publicSiteControlsPanel .psc-metric span{font-size:12px;color:var(--ekodi-ui-muted,#64748b)}
    #publicSiteControlsPanel .psc-message{margin:0 0 14px;font-size:12px;line-height:1.5;min-height:20px;color:var(--ekodi-ui-muted,#64748b);word-break:keep-all}
    #publicSiteControlsPanel .psc-message[data-danger="true"]{color:#b42318}
    #publicSiteControlsPanel .psc-workspace{display:grid;grid-template-columns:minmax(260px,0.88fr) minmax(370px,1.35fr);align-items:start;gap:16px}
    #publicSiteControlsPanel .psc-pane{border:1px solid var(--ekodi-ui-border,#d8e1ea);border-radius:15px;min-width:0;overflow:hidden;background:var(--ekodi-ui-surface,#fff)}
    #publicSiteControlsPanel .psc-pane-head{padding:16px 17px;border-bottom:1px solid var(--ekodi-ui-border,#d8e1ea)}
    #publicSiteControlsPanel .psc-pane-head h3{font-size:16px;margin:0 0 5px;line-height:1.3}
    #publicSiteControlsPanel .psc-subtext{font-size:12px;color:var(--ekodi-ui-muted,#64748b);line-height:1.5;word-break:keep-all}
    #publicSiteControlsPanel .psc-toolbar{display:flex;gap:8px;margin-top:13px}
    #publicSiteControlsPanel .psc-toolbar input{flex:1;min-width:0}
    #publicSiteControlsPanel .psc-toolbar select{width:120px;flex:none}
    #publicSiteControlsPanel input,#publicSiteControlsPanel select,#publicSiteControlsPanel textarea{font:inherit;font-size:13px;width:100%;padding:9px 11px;min-height:39px;border-radius:9px;border:1px solid var(--ekodi-ui-border,#cbd5e1);background:var(--ekodi-ui-surface,#fff);color:var(--ekodi-ui-text,#172b4d)}
    #publicSiteControlsPanel textarea{resize:vertical;min-height:82px}
    #publicSiteControlsPanel .psc-list{max-height:clamp(390px,64vh,760px);overflow:auto;overscroll-behavior:contain}
    #publicSiteControlsPanel .psc-row{display:flex;text-align:left;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:13px 16px;border:0;border-bottom:1px solid var(--ekodi-ui-border,#e5e7eb);border-radius:0;background:transparent;color:inherit;cursor:pointer}
    #publicSiteControlsPanel .psc-row:hover{background:rgba(100,145,200,.08)}
    #publicSiteControlsPanel .psc-row[aria-pressed="true"]{background:rgba(59,130,246,.11);box-shadow:inset 3px 0 #3b82f6}
    #publicSiteControlsPanel .psc-row-main{min-width:0;flex:1}
    #publicSiteControlsPanel .psc-row-name{display:block;font-size:13px;font-weight:750;line-height:1.45;word-break:keep-all}
    #publicSiteControlsPanel .psc-row-domain{display:block;margin-top:3px;font-size:11px;color:var(--ekodi-ui-muted,#64748b);overflow-wrap:anywhere}
    #publicSiteControlsPanel .psc-status{display:inline-block;flex:none;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#e7f0ff;color:#2258a4}
    #publicSiteControlsPanel .psc-status[data-status="private"]{background:#f1f2f4;color:#4b5563}
    #publicSiteControlsPanel .psc-status[data-status="maintenance"]{background:#fff0cf;color:#8a5700}
    #publicSiteControlsPanel .psc-empty{padding:25px 18px;color:var(--ekodi-ui-muted,#64748b);font-size:13px;line-height:1.5}
    #publicSiteControlsPanel .psc-editor{padding:17px}
    #publicSiteControlsPanel .psc-editor-header{display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:18px}
    #publicSiteControlsPanel .psc-editor-header h3{margin:0;font-size:18px;line-height:1.35;word-break:keep-all}
    #publicSiteControlsPanel .psc-editor-header .psc-subtext{overflow-wrap:anywhere;margin-top:5px}
    #publicSiteControlsPanel .psc-field{display:block;margin-bottom:14px;font-size:12px;font-weight:700}
    #publicSiteControlsPanel .psc-field input,#publicSiteControlsPanel .psc-field select,#publicSiteControlsPanel .psc-field textarea{margin-top:6px;font-weight:400}
    #publicSiteControlsPanel .psc-details{border:1px solid var(--ekodi-ui-border,#d8e1ea);border-radius:12px;padding:12px 13px;margin:15px 0}
    #publicSiteControlsPanel .psc-details summary{cursor:pointer;font-size:13px;font-weight:800}
    #publicSiteControlsPanel .psc-details-body{padding-top:16px}
    #publicSiteControlsPanel .psc-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:16px}
    #publicSiteControlsPanel .psc-note{font-size:12px;line-height:1.6;margin:14px 0 0;color:var(--ekodi-ui-muted,#64748b);word-break:keep-all}
    #publicSiteControlsPanel .psc-unsaved{color:#b35c00;font-size:12px;font-weight:650}
    #publicSiteControlsPanel .psc-disabled-detail[hidden]{display:none!important}
    @media(max-width:1080px){#publicSiteControlsPanel .psc-workspace{grid-template-columns:minmax(220px,1fr) minmax(300px,1.2fr)}}
    @media(max-width:900px){#publicSiteControlsPanel .psc-workspace{grid-template-columns:minmax(0,1fr)}}
    @media(max-width:760px){#publicSiteControlsPanel .psc-button,#publicSiteControlsPanel .psc-row,#publicSiteControlsPanel .psc-metric{min-height:44px}#publicSiteControlsPanel .psc-workspace{grid-template-columns:minmax(0,1fr)}#publicSiteControlsPanel .psc-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#publicSiteControlsPanel .psc-list{max-height:280px}#publicSiteControlsPanel .psc-toolbar{flex-wrap:wrap}#publicSiteControlsPanel .psc-toolbar select{width:100%}#publicSiteControlsPanel .psc-toolbar input{flex-basis:100%}}
    @media(max-width:360px){#publicSiteControlsPanel .psc-actions .psc-button{flex:1}}
  `;
  document.head.appendChild(css);
}
function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  const content = document.querySelector('#app .content') || document.querySelector('.content');
  if (!content) return null;
  ensureStyle();
  panel = el(`
    <section id="${PANEL_ID}" class="section" hidden data-panel="${SECTION}">
      <div class="psc-header">
        <div><h2>사이트 공개 설정</h2><p class="psc-intro">사이트별 공개 여부와 점검 안내 화면을 관리합니다. 왼쪽에서 사이트를 선택한 뒤 오른쪽에서 설정을 저장하세요.</p></div>
        <button type="button" class="psc-button" data-psc-refresh>새로고침</button>
      </div>
      <div class="psc-metrics" data-psc-metrics aria-label="사이트 상태별 현황"></div>
      <div class="psc-message" role="status" aria-live="polite" data-psc-message></div>
      <div class="psc-workspace">
        <div class="psc-pane">
          <div class="psc-pane-head">
            <h3>사이트 목록</h3><div class="psc-subtext" data-psc-count>사이트 상태를 불러오는 중입니다.</div>
            <div class="psc-toolbar"><input type="search" data-psc-search aria-label="사이트 이름·주소 검색" placeholder="사이트 이름·주소 검색" autocomplete="off"><select data-psc-filter aria-label="공개 상태 필터"><option value="all">전체 상태</option><option value="public">공개</option><option value="private">비공개</option><option value="maintenance">점검화면</option></select></div>
          </div>
          <div class="psc-list" data-psc-list role="group" aria-label="사이트 선택 목록"></div>
        </div>
        <div class="psc-pane" data-psc-editor><div class="psc-empty">왼쪽 목록에서 사이트를 선택하세요.</div></div>
      </div>
    </section>
  `);
  content.appendChild(panel);
  panel.querySelector('[data-psc-search]').addEventListener('input', event => {
    viewState.query = event.target.value.trim().toLocaleLowerCase(); renderList(panel);
  });
  panel.querySelector('[data-psc-filter]').addEventListener('change', event => {
    viewState.status = event.target.value; renderMetrics(panel); renderList(panel);
  });
  panel.querySelector('[data-psc-metrics]').addEventListener('click', event => {
    const button = event.target.closest('[data-psc-status]');
    if (!button) return;
    viewState.status = button.dataset.pscStatus;
    panel.querySelector('[data-psc-filter]').value = viewState.status;
    renderMetrics(panel); renderList(panel);
  });
  panel.querySelector('[data-psc-list]').addEventListener('click', event => {
    const button = event.target.closest('[data-psc-select]');
    if (!button || !button.dataset.pscSelect || button.dataset.pscSelect === viewState.selectedId || viewState.loading) return;
    if (!confirmDiscard()) return;
    viewState.selectedId = button.dataset.pscSelect;
    renderList(panel); renderEditor(panel);
  });
  panel.querySelector('[data-psc-refresh]').addEventListener('click', () => {
    if (confirmDiscard()) load({allowDiscard:true});
  });
  return panel;
}
function setMessage(panel, message, danger = false) {
  const target = panel.querySelector('[data-psc-message]');
  if (!target) return;
  target.textContent = message || '';
  target.dataset.danger = String(Boolean(danger));
}
function confirmDiscard() {
  return !viewState.dirty || window.confirm('저장하지 않은 변경사항이 있습니다. 변경을 취소하고 이동하시겠습니까?');
}
function filteredSites() {
  return viewState.sites.filter(site => {
    if (viewState.status !== 'all' && site.publicStatus !== viewState.status) return false;
    if (!viewState.query) return true;
    const info = surfaceInfo(site);
    return [site.name, site.label, info.label, info.url, site.domain, site.workspaceId].some(value => String(value || '').toLocaleLowerCase().includes(viewState.query));
  });
}
function renderMetrics(panel) {
  const counts = {all:viewState.sites.length,public:0,private:0,maintenance:0};
  viewState.sites.forEach(site => { if (Object.hasOwn(counts, site.publicStatus)) counts[site.publicStatus]++; });
  const names = {all:'전체 사이트',public:'공개',private:'비공개',maintenance:'점검화면'};
  panel.querySelector('[data-psc-metrics]').innerHTML = Object.keys(names).map(key =>
    `<button type="button" class="psc-metric" data-psc-status="${key}" aria-pressed="${viewState.status === key}"><strong>${counts[key]}</strong><span>${names[key]}</span></button>`
  ).join('');
}
function renderList(panel) {
  const sites = filteredSites();
  panel.querySelector('[data-psc-count]').textContent = `${sites.length}개 표시 / 전체 ${viewState.sites.length}개`;
  const list = panel.querySelector('[data-psc-list]');
  if (!sites.length) {
    list.innerHTML = '<p class="psc-empty">검색 조건과 일치하는 사이트가 없습니다.</p>';
    return;
  }
  list.innerHTML = sites.map(site => {
    const info = surfaceInfo(site);
    const status = STATUS_OPTIONS.includes(site.publicStatus) ? site.publicStatus : 'public';
    return `<button type="button" class="psc-row" data-psc-select="${escapeHtml(site.id)}" aria-pressed="${viewState.selectedId === site.id}"><span class="psc-row-main"><span class="psc-row-name">${escapeHtml(site.name || info.label)}</span><span class="psc-row-domain">${escapeHtml(info.label)} · ${escapeHtml(site.workspaceId || '')}</span></span><span class="psc-status" data-status="${status}">${LABELS[status]}</span></button>`;
  }).join('');
}
function formValue(site, field) {
  const defaults = {publicStatus:'public',maintenanceDisplayType:'default',maintenanceTitle:'현재 사이트 개발중입니다',maintenanceMessage:'더 좋은 서비스로 준비 중입니다.',maintenanceRedirectUrl:'',redirectMode:'button'};
  return site[field] || defaults[field];
}
function payloadFromSite(site) {
  return Object.fromEntries(formFields.map(field => [field,formValue(site,field)]));
}
function payloadFromForm(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formFields.map(field => [field,String(formData.get(field) || '')]));
}
function renderEditor(panel) {
  const site = viewState.sites.find(item => item.id === viewState.selectedId);
  const editor = panel.querySelector('[data-psc-editor]');
  viewState.dirty = false;
  if (!site) {
    editor.innerHTML = '<div class="psc-empty">왼쪽 목록에서 사이트를 선택하세요.</div>';
    return;
  }
  const info = surfaceInfo(site);
  const url = safeSiteUrl(site);
  const status = STATUS_OPTIONS.includes(site.publicStatus) ? site.publicStatus : 'public';
  editor.innerHTML = `
    <form class="psc-editor" data-psc-form data-public-site-id="${escapeHtml(site.id)}">
      <div class="psc-editor-header">
        <div><h3>${escapeHtml(site.name || info.label)}</h3><div class="psc-subtext">${escapeHtml(info.label)} · ${escapeHtml(site.workspaceId || '')}</div></div>
        <span class="psc-status" data-psc-badge data-status="${status}">${LABELS[status]}</span>
      </div>
      <label class="psc-field">사이트 공개 상태
        <select name="publicStatus"><option value="public">공개</option><option value="private">비공개</option><option value="maintenance">점검화면</option></select>
      </label>
      <div class="psc-subtext">공개 상태 변경은 사이트 방문자에게 즉시 영향을 줄 수 있습니다.</div>
      <details class="psc-details" data-psc-maintenance data-maintenance-options>
        <summary>점검화면 상세 설정</summary>
        <div class="psc-details-body">
          <label class="psc-field">점검화면 방식
            <select name="maintenanceDisplayType"><option value="default">기본 안내 화면</option><option value="url">지정 주소 연결</option></select>
          </label>
          <div data-psc-default-fields>
            <label class="psc-field">안내 제목<input type="text" name="maintenanceTitle" maxlength="80" placeholder="현재 사이트 준비 중입니다"></label>
            <label class="psc-field">안내 문구<textarea name="maintenanceMessage" maxlength="300" rows="3"></textarea></label>
          </div>
          <div data-psc-url-fields>
            <label class="psc-field">지정 주소<input type="url" name="maintenanceRedirectUrl" placeholder="https://ekodi.kr/"></label>
            <label class="psc-field">연결 방식<select name="redirectMode"><option value="button">버튼 이동</option><option value="auto">자동 이동</option></select></label>
          </div>
        </div>
      </details>
      <div class="psc-actions"><button type="submit" class="psc-button primary" data-psc-save disabled>변경사항 저장</button><button type="button" class="psc-button" data-psc-reset>취소</button>${url ? `<a class="psc-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">사이트 열기</a>` : ''}<span class="psc-unsaved" data-psc-dirty hidden>저장되지 않은 변경사항</span></div>
      <p class="psc-note">비공개·점검 상태에서는 일반 방문자의 화면 노출이 제한되며, 관리자·인증·API 경로는 기존 정책대로 유지됩니다.</p>
    </form>`;
  const form = editor.querySelector('[data-psc-form]');
  const saved = payloadFromSite(site);
  Object.entries(saved).forEach(([name,value]) => {
    const control = form.elements.namedItem(name);
    if (control) control.value = value;
  });
  function updateDetails() {
    const maintenance = form.elements.namedItem('publicStatus').value === 'maintenance';
    const details = form.querySelector('[data-psc-maintenance]');
    details.hidden = !maintenance;
    if (maintenance) details.open = true;
    const method = form.elements.namedItem('maintenanceDisplayType').value;
    form.querySelector('[data-psc-default-fields]').hidden = method !== 'default';
    form.querySelector('[data-psc-url-fields]').hidden = method !== 'url';
  }
  function updateDirty() {
    viewState.dirty = JSON.stringify(payloadFromForm(form)) !== JSON.stringify(saved);
    form.querySelector('[data-psc-save]').disabled = !viewState.dirty || viewState.loading;
    form.querySelector('[data-psc-dirty]').hidden = !viewState.dirty;
  }
  updateDetails();
  form.addEventListener('input', updateDirty);
  form.addEventListener('change', () => { updateDetails();updateDirty(); });
  form.querySelector('[data-psc-reset]').addEventListener('click', () => {if (viewState.loading) return;renderEditor(panel);setMessage(panel, '선택한 사이트의 변경사항을 취소했습니다.');});
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (viewState.loading || !viewState.dirty) return;
    const payload = payloadFromForm(form);
    if (payload.publicStatus !== saved.publicStatus &&
        !window.confirm(`"${site.name}" 공개 상태를 "${LABELS[payload.publicStatus]}"(으)로 변경하시겠습니까? 방문자 화면에 바로 영향을 줍니다.`)) return;
    viewState.loading = true;
    updateDirty();
    setMessage(panel, '사이트 설정 저장 중입니다.');
    try {
      const response = await api(`/${encodeURIComponent(site.id)}`, {method:'PUT',body:JSON.stringify(payload)});
      const updated = response.site;
      if (!updated || updated.id !== site.id) throw new Error('저장 결과를 확인할 수 없습니다. 화면을 새로고침해 주세요.');
      viewState.sites = viewState.sites.map(item => item.id === site.id ? updated : item);
      renderMetrics(panel); renderList(panel); renderEditor(panel);
      setMessage(panel, `${surfaceInfo(updated).label} 사이트 공개 설정을 저장했습니다.`);
    } catch (error) {
      setMessage(panel, error.message || '저장하지 못했습니다.', true);
    } finally {
      viewState.loading = false;
      const save = panel.querySelector('[data-psc-save]');
      if (save) save.disabled = !viewState.dirty;
    }
  });
}
async function load({allowDiscard=false}={}) {
  const panel = ensurePanel();
  if (!panel || viewState.loading) return;
  if (viewState.dirty && !allowDiscard) {
    setMessage(panel, '저장하지 않은 변경사항이 있어 자동 새로고침을 중단했습니다. 저장하거나 취소한 뒤 다시 시도하세요.');
    return;
  }
  const requestId = ++viewState.requestId;
  viewState.loading = true;
  panel.querySelector('[data-psc-refresh]').disabled = true;
  setMessage(panel, '사이트 공개 설정을 불러오는 중입니다.');
  try {
    const data = await api();
    if (requestId !== viewState.requestId) return;
    if (!Array.isArray(data.sites)) throw new Error('사이트 목록 응답이 올바르지 않습니다.');
    viewState.sites = data.sites;
    if (!viewState.sites.some(site => site.id === viewState.selectedId)) viewState.selectedId = viewState.sites[0]?.id || null;
    renderMetrics(panel);
    renderList(panel);
    renderEditor(panel);
    setMessage(panel, `사이트 ${viewState.sites.length}개의 공개 상태를 확인했습니다.`);
  } catch (error) {
    setMessage(panel, error.message || '설정을 불러오지 못했습니다.', true);
  } finally {
    viewState.loading = false;
    panel.querySelector('[data-psc-refresh]').disabled = false;
  }
}


function activate() {
  const panel = ensurePanel();
  if (!panel) return;
  document.querySelectorAll('#app .content > .section, .content > .section').forEach(section => {
    const targets = String(section.dataset?.panel || '').split(/\s+/);
    section.hidden = section.id !== PANEL_ID && !targets.includes(SECTION);
  });
  document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.toggle('active', isPublicSiteNav(item)));
  const title = document.querySelector('#pageTitle');
  if (title) title.textContent = '사이트 공개 설정';
  load();
}

function boot() {
  ensureNavLink();
  ensurePanel();
  if (location.hash === '#public-site-controls') activate();
}

window.EKODIPublicSiteControls = { activate, load };
window.addEventListener('hashchange', () => { if (location.hash === '#public-site-controls') activate(); });
window.addEventListener('ekodi-admin-ready', boot);
if (document.documentElement.dataset.ekodiAdminReady === 'true') boot();
})();


(() => {
'use strict';
const SECTION = 'auth-providers';
const PANEL_ID = 'authProviderControlPanel';
const API = 'https://ekodi.kr/api/admin/auth/providers';

function token(){try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return''}}
function node(tag,text='',className=''){const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n}
async function request(options={}){const headers=new Headers(options.headers||{});headers.set('accept','application/json');if(token())headers.set('authorization',`Bearer ${token()}`);if(options.body)headers.set('content-type','application/json');const response=await fetch(API,{...options,headers,cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'로그인 설정을 처리하지 못했습니다.');return data}
function hideOtherPanels(panel){document.querySelectorAll('#app .content > [data-panel], .content > [data-panel]').forEach(item=>{item.hidden=item!==panel});document.querySelectorAll('.sidebar .nav').forEach(item=>item.classList.toggle('active',item.dataset.adminLink===SECTION||item.dataset.section===SECTION));const title=document.querySelector('#pageTitle');if(title)title.textContent='로그인 설정'}
function providerRow(provider){const row=node('label','','auth-provider-row');row.dataset.configured=String(provider.configured);const text=node('span');text.append(node('strong',provider.name),node('small',provider.configured?(provider.enabled?'연결됨 · 사용 중':'연결됨 · 사용 안 함'):'연동 필요'));const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=provider.enabled;toggle.disabled=!provider.configured;toggle.dataset.provider=provider.id;row.append(text,toggle);return row}
function ensureStyle(){if(document.getElementById('authProviderControlStyle'))return;const style=document.createElement('style');style.id='authProviderControlStyle';style.textContent='.auth-provider-control{max-width:1050px}.auth-provider-policy{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}.auth-provider-box,.auth-provider-row{padding:16px;border:1px solid var(--ekodi-ui-border,#24425E);border-radius:15px;background:rgba(255,255,255,.04)}.auth-provider-box label,.auth-provider-row{display:flex;align-items:center;justify-content:space-between;gap:14px}.auth-provider-box p,.auth-provider-row small{display:block;margin:6px 0 0;color:var(--ekodi-ui-muted,#9FB1C3);font-size:12px;line-height:1.5}.auth-provider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.auth-provider-row[data-configured="false"]{opacity:.62}.auth-provider-row input{width:20px;height:20px;accent-color:#8EC8FF}.auth-provider-box select{min-width:160px;padding:9px;border-radius:9px;background:var(--ekodi-ui-surface,#0B1D2E);color:var(--ekodi-ui-text,#F4F7FB);border:1px solid var(--ekodi-ui-border,#24425E)}.auth-provider-actions{display:flex;align-items:center;gap:12px;margin-top:18px}.auth-provider-state{color:var(--ekodi-ui-muted,#9FB1C3);font-size:13px}.auth-provider-note{padding:13px 15px;border-left:3px solid #8EC8FF;background:rgba(142,200,255,.08);border-radius:10px;line-height:1.6}@media(max-width:760px){.auth-provider-policy,.auth-provider-grid{grid-template-columns:1fr}}';document.head.appendChild(style)}
function ensureNav(){const nav=document.querySelector('.sidebar nav');if(!nav)return null;let button=nav.querySelector(`[data-admin-link="${SECTION}"]`);if(button)return button;button=node('button','','nav');button.type='button';button.dataset.adminLink=SECTION;button.dataset.section=SECTION;button.append(node('span','로그인 설정'));const admin=nav.querySelector('[data-section="admins"]');if(admin)admin.insertAdjacentElement('afterend',button);else nav.append(button);button.addEventListener('click',event=>{event.preventDefault();location.hash=`#${SECTION}`;activate()});return button}
function ensurePanel(){let panel=document.getElementById(PANEL_ID);if(panel)return panel;const content=document.querySelector('#app .content')||document.querySelector('.content');if(!content)return null;panel=node('section','','section auth-provider-control');panel.id=PANEL_ID;panel.dataset.panel=SECTION;panel.hidden=true;panel.innerHTML='<p class="kicker">IDENTITY · LOGIN</p><h2>로그인 설정</h2><p class="muted">에코디 전체의 로그인 제공자 정책을 최고관리자가 관리합니다.</p><p class="auth-provider-note">현재 기본값은 Google 단일 로그인입니다. 로그인 제공자가 하나뿐이면 사용자는 별도 선택화면 없이 해당 인증창으로 바로 이동합니다.</p><div class="auth-provider-policy"><div class="auth-provider-box"><label><strong>멀티 로그인 사용</strong><input type="checkbox" data-multi-login></label><p>2개 이상의 활성 제공자가 있을 때 로그인 방식 선택창을 표시합니다.</p></div><div class="auth-provider-box"><label><strong>기본 로그인 방식</strong><select data-default-provider></select></label><p>단일 로그인 상태에서는 이 제공자로 즉시 인증합니다.</p></div></div><div class="auth-provider-grid" data-provider-grid></div><div class="auth-provider-actions"><button type="button" class="btn primary" data-save>설정 저장</button><span class="auth-provider-state" data-state></span></div>';content.append(panel);panel.querySelector('[data-save]').addEventListener('click',save);return panel}
let latest=null;
function render(policy){const panel=ensurePanel();if(!panel)return;latest=policy;panel.querySelector('[data-multi-login]').checked=Boolean(policy.multiLoginRequested??policy.multiLoginEnabled);const select=panel.querySelector('[data-default-provider]');select.replaceChildren();policy.providers.filter(p=>p.configured).forEach(p=>{const option=node('option',p.name);option.value=p.id;option.selected=p.id===policy.defaultProvider;select.append(option)});const grid=panel.querySelector('[data-provider-grid]');grid.replaceChildren(...policy.providers.map(providerRow));panel.querySelector('[data-state]').textContent=policy.multiLoginEnabled?'멀티 로그인 활성':`${policy.defaultProvider==='google'?'Google':policy.defaultProvider} 바로 로그인`}
async function load(){const panel=ensurePanel();if(!panel)return;const state=panel.querySelector('[data-state]');state.textContent='불러오는 중…';try{const data=await request();render(data.policy)}catch(error){state.textContent=error.message}}
async function save(){const panel=ensurePanel();if(!panel||!latest)return;const button=panel.querySelector('[data-save]');const state=panel.querySelector('[data-state]');const providers={};panel.querySelectorAll('[data-provider]').forEach(input=>providers[input.dataset.provider]=input.checked);button.disabled=true;state.textContent='저장 중…';try{const data=await request({method:'PUT',body:JSON.stringify({multiLoginEnabled:panel.querySelector('[data-multi-login]').checked,defaultProvider:panel.querySelector('[data-default-provider]').value,providers})});render(data.policy);state.textContent='저장했습니다.'}catch(error){state.textContent=error.message}finally{button.disabled=false}}
function activate(){const panel=ensurePanel();if(!panel)return;hideOtherPanels(panel);panel.hidden=false;load()}
function boot(){ensureStyle();ensureNav();ensurePanel();if(location.hash===`#${SECTION}`)activate()}
window.EKODIAuthProviderControl={activate,load};
window.addEventListener('hashchange',()=>{if(location.hash===`#${SECTION}`)activate()});
window.addEventListener('ekodi-admin-ready',boot);
if(document.documentElement.dataset.ekodiAdminReady==='true')boot();
})();

