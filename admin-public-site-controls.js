(() => {
'use strict';
const PANEL_ID = 'publicSiteControlsPanel';
const API = '/api/control/public-sites';
const SECTION = 'public-site-controls';
const LABELS = {
  public: '정상 공개',
  maintenance: '임시페이지',
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
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '임시페이지 설정을 처리하지 못했습니다.');
  return payload;
}

function isPublicSiteNav(item) {
  return item?.dataset?.adminLink === SECTION || item?.dataset?.section === SECTION || item?.dataset?.lazySection === SECTION;
}

function bindNavLink(link) {
  if (!link) return;
  link.dataset.adminLink = SECTION;
  link.dataset.section = SECTION;
  if (!link.querySelector('span')) link.innerHTML = '<span>임시페이지 설정</span>';
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
    link = el('<button type="button" class="nav" data-admin-link="public-site-controls" data-section="public-site-controls"><span>임시페이지 설정</span></button>');
    nav.appendChild(link);
  }
  bindNavLink(link);
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  const content = document.querySelector('#app .content') || document.querySelector('.content');
  if (!content) return null;
  panel = el(`
    <section id="${PANEL_ID}" class="section" hidden data-panel="public-site-controls">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <h2>임시페이지 설정</h2>
          <p class="muted">cgma.or.kr 같은 공개 도메인을 정상 공개 또는 임시페이지 모드로 전환합니다.</p>
        </div>
        <button type="button" class="btn" data-public-site-refresh>새로고침</button>
      </div>
      <div data-public-site-message style="margin:14px 0"></div>
      <div data-public-site-list></div>
    </section>
  `);
  content.appendChild(panel);
  panel.querySelector('[data-public-site-refresh]')?.addEventListener('click', load);
  return panel;
}

function setMessage(panel, message, danger = false) {
  const box = panel.querySelector('[data-public-site-message]');
  if (!box) return;
  box.innerHTML = message ? `<div style="padding:12px 14px;border-radius:14px;background:${danger ? 'rgba(255,105,105,.14)' : 'rgba(142,200,255,.13)'};border:1px solid rgba(142,200,255,.22);word-break:keep-all">${message}</div>` : '';
}

function siteForm(site) {
  return el(`
    <form data-public-site-id="${site.id}" style="display:grid;gap:14px;padding:18px;border:1px solid var(--ekodi-ui-border,#24425E);border-radius:18px;background:rgba(255,255,255,.04);margin-top:16px">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <strong style="font-size:18px">${site.name}</strong>
          <div class="muted">${site.domain} · ${site.workspaceId}</div>
        </div>
        <span data-public-site-status-badge style="padding:7px 10px;border-radius:999px;background:rgba(142,200,255,.14);height:max-content">${LABELS[site.publicStatus] || site.publicStatus}</span>
      </div>
      <label>공개 상태
        <select name="publicStatus">
          <option value="public">정상 공개</option>
          <option value="maintenance">임시페이지</option>
        </select>
      </label>
      <label>임시페이지 방식
        <select name="maintenanceDisplayType">
          <option value="default">기본 안내 화면</option>
          <option value="url">지정 주소 연결</option>
        </select>
      </label>
      <label>제목
        <input name="maintenanceTitle" type="text" maxlength="80" placeholder="현재 사이트 개발중입니다">
      </label>
      <label>안내문
        <textarea name="maintenanceMessage" rows="3" maxlength="300" placeholder="더 좋은 서비스로 준비 중입니다."></textarea>
      </label>
      <label>지정 주소
        <input name="maintenanceRedirectUrl" type="url" placeholder="https://ekodi.kr/cgma">
      </label>
      <label>연결 방식
        <select name="redirectMode">
          <option value="button">버튼 이동</option>
          <option value="auto">자동 이동</option>
        </select>
      </label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" class="btn primary">저장</button>
        <a class="btn" href="https://${site.domain}" target="_blank" rel="noopener noreferrer">사이트 확인</a>
      </div>
      <small class="muted">지정 주소 연결은 http 또는 https 주소만 허용합니다. 기본값은 방문자가 길을 잃지 않도록 버튼 이동입니다.</small>
    </form>
  `);
}

function fillForm(form, site) {
  form.publicStatus.value = site.publicStatus || 'maintenance';
  form.maintenanceDisplayType.value = site.maintenanceDisplayType || 'default';
  form.maintenanceTitle.value = site.maintenanceTitle || '현재 사이트 개발중입니다';
  form.maintenanceMessage.value = site.maintenanceMessage || '더 좋은 서비스로 준비 중입니다.';
  form.maintenanceRedirectUrl.value = site.maintenanceRedirectUrl || '';
  form.redirectMode.value = site.redirectMode || 'button';
}

function render(panel, sites) {
  const list = panel.querySelector('[data-public-site-list]');
  if (!list) return;
  list.innerHTML = '';
  sites.forEach(site => {
    const form = siteForm(site);
    fillForm(form, site);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      setMessage(panel, '저장 중입니다.');
      const payload = {
        publicStatus: form.publicStatus.value,
        maintenanceDisplayType: form.maintenanceDisplayType.value,
        maintenanceTitle: form.maintenanceTitle.value,
        maintenanceMessage: form.maintenanceMessage.value,
        maintenanceRedirectUrl: form.maintenanceRedirectUrl.value,
        redirectMode: form.redirectMode.value
      };
      try {
        const result = await api(`/${site.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        fillForm(form, result.site);
        const badge = form.querySelector('[data-public-site-status-badge]');
        if (badge) badge.textContent = LABELS[result.site.publicStatus] || result.site.publicStatus;
        setMessage(panel, `${result.site.domain} 임시페이지 설정을 저장했습니다.`);
      } catch (error) {
        setMessage(panel, error.message || '저장하지 못했습니다.', true);
      }
    });
    list.appendChild(form);
  });
}

async function load() {
  const panel = ensurePanel();
  if (!panel) return;
  setMessage(panel, '임시페이지 설정을 불러오는 중입니다.');
  try {
    const data = await api();
    render(panel, data.sites || []);
    setMessage(panel, '임시페이지 설정 상태를 확인했습니다.');
  } catch (error) {
    setMessage(panel, error.message || '설정을 불러오지 못했습니다.', true);
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
  if (title) title.textContent = '임시페이지 설정';
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