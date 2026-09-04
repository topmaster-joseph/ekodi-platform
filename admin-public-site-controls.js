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


(() => {
'use strict';
const SECTION = 'auth-providers';
const PANEL_ID = 'authProviderControlPanel';
const API = 'https://api.ekodi.kr/api/admin/auth/providers';

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

