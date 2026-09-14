export function siteAdminSiteIdFromPath(pathname) {
  const pathSegments = String(pathname || '').split('/').filter(Boolean);
  const adminIndex = pathSegments.findIndex(part => part.toLowerCase() === 'admin');
  if (adminIndex <= 0) return '';
  const root = String(pathSegments[0] || '').toLowerCase();
  if (root === 'cmpmyi' && adminIndex === 1 && pathSegments[2]) {
    return String(pathSegments[2]).toLowerCase();
  }
  return root;
}

function browserSiteOperatingStatusWidget() {
  'use strict';
  if (window.__EKODI_SITE_OPERATING_STATUS_WIDGET__) return;
  window.__EKODI_SITE_OPERATING_STATUS_WIDGET__ = true;

  const API = '/api/control/site-status';
  const STATUSES = [
    ['public', '공개', '누구나 정상적으로 사이트를 이용합니다.'],
    ['private', '비공개', '방문자에게 비공개 안내 화면을 표시합니다.'],
    ['maintenance', '점검중', '방문자에게 점검 안내 화면을 표시합니다.'],
    ['development', '개발중', '방문자에게 개발 중 안내 화면을 표시합니다.']
  ];
  const inferLocalSiteId = pathname => {
    const pathSegments = String(pathname || '').split('/').filter(Boolean);
    const adminIndex = pathSegments.findIndex(part => part.toLowerCase() === 'admin');
    if (adminIndex <= 0) return '';
    const root = String(pathSegments[0] || '').toLowerCase();
    if (root === 'cmpmyi' && adminIndex === 1 && pathSegments[2]) return String(pathSegments[2]).toLowerCase();
    return root;
  };
  const localSiteId = inferLocalSiteId(location.pathname);
  const globalMode = !localSiteId;

  function token() {
    try {
      if (globalMode) return sessionStorage.getItem('ekodi-auth-token') || localStorage.getItem('ekodi.console.access_token') || localStorage.getItem('ekodi.auth.access_token') || '';
      return localStorage.getItem('ekodi.console.access_token') || localStorage.getItem('ekodi.auth.access_token') || sessionStorage.getItem('ekodi-auth-token') || '';
    } catch {
      return '';
    }
  }

  async function request(path = '', options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('accept', 'application/json');
    if (options.body) headers.set('content-type', 'application/json');
    const accessToken = token();
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    const response = await fetch(`${API}${path}`, { ...options, headers, credentials: 'omit', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
    return data;
  }

  function make(tag, attrs = {}, text = '') {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'type') node.type = value;
      else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  }

  const style = make('style');
  style.textContent = `
    #ekodiSiteStatusLauncher{border:1px solid rgba(123,148,174,.35);background:rgba(255,255,255,.06);color:inherit;border-radius:10px;padding:9px 12px;font:inherit;cursor:pointer;text-align:left}
    #ekodiSiteStatusLauncher.ekodi-site-status-floating{position:fixed;right:18px;bottom:18px;z-index:2147483000;background:#172033;color:#fff;box-shadow:0 12px 36px rgba(15,23,42,.24)}
    #ekodiSiteStatusModal{position:fixed;inset:0;z-index:2147483001;background:rgba(15,23,42,.5);display:none;place-items:center;padding:18px}
    #ekodiSiteStatusModal[data-open="true"]{display:grid}
    .ekodi-site-status-card{width:min(720px,100%);max-height:min(780px,92vh);overflow:auto;background:#fff;color:#172033;border-radius:20px;box-shadow:0 24px 80px rgba(15,23,42,.28);padding:22px}
    .ekodi-site-status-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.ekodi-site-status-head h2{margin:0;font-size:22px;letter-spacing:-.03em}.ekodi-site-status-head p{margin:6px 0 0;color:#667085;font-size:13px}
    .ekodi-site-status-close{border:0;background:#f2f4f7;width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:20px}
    .ekodi-site-status-row{display:grid;gap:8px;margin-top:18px}.ekodi-site-status-row label{font-size:13px;font-weight:700}.ekodi-site-status-row input[type="text"],.ekodi-site-status-row textarea,.ekodi-site-status-row select{width:100%;padding:11px 12px;border:1px solid #d7dde5;border-radius:10px;background:#fff;color:#172033;font:inherit}.ekodi-site-status-row textarea{resize:vertical;min-height:78px}
    .ekodi-site-status-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ekodi-site-status-option{display:flex;gap:10px;padding:13px;border:1px solid #d7dde5;border-radius:12px;cursor:pointer}.ekodi-site-status-option:has(input:checked){border-color:#172033;box-shadow:0 0 0 1px #172033}.ekodi-site-status-option strong{display:block;font-size:14px}.ekodi-site-status-option span{display:block;margin-top:3px;color:#667085;font-size:12px;line-height:1.45}
    .ekodi-site-status-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.ekodi-site-status-actions button{border:1px solid #cfd6df;border-radius:10px;padding:10px 14px;background:#fff;color:#172033;font:inherit;font-weight:700;cursor:pointer}.ekodi-site-status-actions .primary{background:#172033;color:#fff;border-color:#172033}.ekodi-site-status-note{min-height:20px;margin-top:12px;color:#475467;font-size:13px}.ekodi-site-status-note[data-error="true"]{color:#b42318}
    @media(max-width:620px){.ekodi-site-status-options{grid-template-columns:1fr}.ekodi-site-status-card{padding:18px}}
  `;
  document.head.appendChild(style);

  const modal = make('div', { id: 'ekodiSiteStatusModal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '사이트 운영상태 설정' });
  const card = make('div', { class: 'ekodi-site-status-card' });
  const head = make('div', { class: 'ekodi-site-status-head' });
  const heading = make('div');
  heading.append(make('h2', {}, '사이트 운영상태'), make('p', {}, globalMode ? '최고관리자: 모든 사용자 사이트의 공개 상태를 관리합니다.' : `${localSiteId} 사이트 상태를 관리합니다.`));
  const close = make('button', { class: 'ekodi-site-status-close', type: 'button', 'aria-label': '닫기' }, '×');
  head.append(heading, close);
  card.appendChild(head);

  let siteSelect = null;
  let siteInput = null;
  if (globalMode) {
    const selectRow = make('div', { class: 'ekodi-site-status-row' });
    selectRow.appendChild(make('label', {}, '등록된 사이트'));
    siteSelect = make('select');
    selectRow.appendChild(siteSelect);
    card.appendChild(selectRow);

    const inputRow = make('div', { class: 'ekodi-site-status-row' });
    inputRow.appendChild(make('label', {}, '사이트 ID 직접 선택'));
    siteInput = make('input', { type: 'text', placeholder: '예: jadam, pizzamaru, church' });
    inputRow.appendChild(siteInput);
    card.appendChild(inputRow);
  }

  const statusRow = make('div', { class: 'ekodi-site-status-row' });
  statusRow.appendChild(make('label', {}, '공개 상태'));
  const options = make('div', { class: 'ekodi-site-status-options' });
  for (const [value, label, description] of STATUSES) {
    const option = make('label', { class: 'ekodi-site-status-option' });
    const radio = make('input', { type: 'radio', name: 'ekodi-site-operating-status', value });
    const copy = make('div');
    copy.append(make('strong', {}, label), make('span', {}, description));
    option.append(radio, copy);
    options.appendChild(option);
  }
  statusRow.appendChild(options);
  card.appendChild(statusRow);

  const titleRow = make('div', { class: 'ekodi-site-status-row' });
  titleRow.appendChild(make('label', {}, '대체 화면 제목'));
  const titleInput = make('input', { type: 'text', maxlength: '160', placeholder: '상태별 기본 문구를 사용하려면 비워두세요.' });
  titleRow.appendChild(titleInput);
  card.appendChild(titleRow);

  const messageRow = make('div', { class: 'ekodi-site-status-row' });
  messageRow.appendChild(make('label', {}, '대체 화면 안내문'));
  const messageInput = make('textarea', { maxlength: '500', placeholder: '상태별 기본 안내문을 사용하려면 비워두세요.' });
  messageRow.appendChild(messageInput);
  card.appendChild(messageRow);

  const actions = make('div', { class: 'ekodi-site-status-actions' });
  const loadButton = make('button', { type: 'button' }, globalMode ? '선택 사이트 불러오기' : '새로고침');
  const saveButton = make('button', { type: 'button', class: 'primary' }, '저장');
  actions.append(loadButton, saveButton);
  card.appendChild(actions);
  const note = make('div', { class: 'ekodi-site-status-note', role: 'status', 'aria-live': 'polite' });
  card.appendChild(note);
  modal.appendChild(card);
  document.body.appendChild(modal);

  function setNote(message, error = false) {
    note.textContent = message || '';
    note.dataset.error = error ? 'true' : 'false';
  }

  function selectedSiteId() {
    if (!globalMode) return localSiteId;
    const typed = String(siteInput?.value || '').trim().toLowerCase();
    return typed || String(siteSelect?.value || '').trim().toLowerCase();
  }

  function fillSite(site) {
    if (!site) return;
    const status = site.status || site.publicStatus || 'public';
    const radio = options.querySelector(`input[value="${CSS.escape(status)}"]`);
    if (radio) radio.checked = true;
    titleInput.value = site.title || site.maintenanceTitle || '';
    messageInput.value = site.message || site.maintenanceMessage || '';
    if (siteInput && !siteInput.value) siteInput.value = site.siteId || site.id || '';
  }

  async function loadList() {
    if (!globalMode) return;
    setNote('사이트 목록을 불러오는 중입니다.');
    try {
      const data = await request();
      const sites = Array.isArray(data.sites) ? data.sites : [];
      siteSelect.innerHTML = '';
      const empty = make('option', { value: '' }, '사이트를 선택하세요');
      siteSelect.appendChild(empty);
      for (const site of sites) {
        const id = site.siteId || site.id || '';
        const option = make('option', { value: id }, `${id} · ${site.label || site.status || site.publicStatus || '공개'}`);
        siteSelect.appendChild(option);
      }
      setNote(`${sites.length}개 사이트 상태를 확인했습니다.`);
    } catch (error) {
      setNote(error.message || '사이트 목록을 불러오지 못했습니다.', true);
    }
  }

  async function loadSite() {
    const id = selectedSiteId();
    if (!id) return setNote('사이트를 선택하거나 사이트 ID를 입력하세요.', true);
    setNote(`${id} 상태를 불러오는 중입니다.`);
    try {
      const data = await request(`/${encodeURIComponent(id)}`);
      fillSite(data.site);
      setNote(`${id} 상태를 불러왔습니다.`);
    } catch (error) {
      setNote(error.message || '사이트 상태를 불러오지 못했습니다.', true);
    }
  }

  async function saveSite() {
    const id = selectedSiteId();
    const status = options.querySelector('input[name="ekodi-site-operating-status"]:checked')?.value || '';
    if (!id) return setNote('사이트를 선택하거나 사이트 ID를 입력하세요.', true);
    if (!status) return setNote('공개 상태를 선택하세요.', true);
    setNote('저장하고 있습니다.');
    saveButton.disabled = true;
    try {
      const data = await request(`/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ siteId: id, status, title: titleInput.value, message: messageInput.value })
      });
      fillSite(data.site);
      setNote(`${id} 사이트를 '${data.site?.label || status}' 상태로 저장했습니다.`);
      if (globalMode) await loadList();
    } catch (error) {
      setNote(error.message || '사이트 상태를 저장하지 못했습니다.', true);
    } finally {
      saveButton.disabled = false;
    }
  }

  function openModal() {
    modal.dataset.open = 'true';
    if (globalMode) loadList();
    else loadSite();
  }
  function closeModal() { modal.dataset.open = 'false'; }
  close.addEventListener('click', closeModal);
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
  loadButton.addEventListener('click', loadSite);
  saveButton.addEventListener('click', saveSite);
  siteSelect?.addEventListener('change', () => { if (siteInput) siteInput.value = siteSelect.value; loadSite(); });

  function hideLegacyControls() {
    document.querySelectorAll('[data-admin-link="public-site-controls"],[data-section="public-site-controls"],[data-lazy-section="public-site-controls"],#publicSiteControlsPanel').forEach(node => {
      if (node.id !== 'ekodiSiteStatusLauncher' && !node.hidden) node.hidden = true;
    });
  }
  hideLegacyControls();
  const legacyObserver = new MutationObserver(hideLegacyControls);
  legacyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

  const launcher = make('button', { id: 'ekodiSiteStatusLauncher', type: 'button' }, '사이트 운영상태');
  launcher.addEventListener('click', openModal);
  const nav = document.querySelector('.sidebar nav, aside nav, [data-admin-sidebar] nav');
  if (nav) nav.appendChild(launcher);
  else {
    launcher.classList.add('ekodi-site-status-floating');
    document.body.appendChild(launcher);
  }
}

export function siteOperatingStatusWidgetSource() {
  return `(${browserSiteOperatingStatusWidget.toString()})();`;
}
