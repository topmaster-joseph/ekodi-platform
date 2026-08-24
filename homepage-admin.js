const API = 'https://api.ekodi.kr';

function token() {
  return sessionStorage.getItem('ekodi-auth-token') || '';
}

function installStyle() {
  if (document.querySelector('#ekodi-homepage-management-style')) return;
  const style = document.createElement('style');
  style.id = 'ekodi-homepage-management-style';
  style.textContent = `
    .homepage-admin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}.homepage-admin-head p{max-width:760px}.homepage-admin-actions{display:flex;gap:8px;flex-wrap:wrap}
    .homepage-admin-notice{display:flex;gap:12px;align-items:center;margin:16px 0;padding:13px 15px;border:1px solid rgba(125,211,252,.18);border-radius:12px;background:rgba(15,23,42,.38)}.homepage-admin-notice>span{display:grid;place-items:center;width:38px;height:38px;flex:0 0 38px;border-radius:11px;background:rgba(56,189,248,.12);font-size:20px}.homepage-admin-notice strong{display:block}.homepage-admin-notice small{display:block;margin-top:3px;opacity:.72;line-height:1.45}
    .homepage-admin-grid{display:grid;gap:8px}.homepage-site-row{display:grid;grid-template-columns:minmax(190px,1fr) 92px 92px 96px minmax(120px,.55fr);align-items:center;gap:10px;padding:11px 12px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.32)}.homepage-site-row[data-eligible="false"]{opacity:.62}.homepage-site-identity strong,.homepage-site-identity small{display:block}.homepage-site-identity small{margin-top:3px;opacity:.62;word-break:break-all}.homepage-site-control{display:flex;align-items:center;gap:7px;font-size:12px}.homepage-site-control input[type="checkbox"]{width:16px;height:16px}.homepage-site-order input{width:78px;padding:7px 8px}.homepage-site-status{font-size:11px;line-height:1.35}.homepage-site-status b,.homepage-site-status span{display:block}.homepage-site-status span{opacity:.62;margin-top:3px}
    .homepage-preview{margin-top:16px;padding:14px;border:1px dashed rgba(125,211,252,.24);border-radius:12px}.homepage-preview[hidden]{display:none}.homepage-preview-list{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.homepage-preview-chip{padding:8px 10px;border-radius:10px;background:rgba(30,41,59,.65);font-size:12px}.homepage-preview-chip.featured{outline:1px solid rgba(250,204,21,.48)}
    @media(max-width:760px){.homepage-site-row{grid-template-columns:1fr 1fr}.homepage-site-identity,.homepage-site-status{grid-column:1/-1}.homepage-admin-actions{width:100%}.homepage-admin-actions button{flex:1 1 auto}}
  `;
  document.head.append(style);
}

async function api(options = {}) {
  const headers = new Headers(options.headers || {});
  if (token()) headers.set('authorization', `Bearer ${token()}`);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${API}/api/control/homepage`, { ...options, headers, cache: 'no-store' });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `첫화면 설정 API 오류 (${response.status})`);
  return data;
}

function status(message, detail = '', state = 'info') {
  const notice = document.querySelector('#homepageAdminNotice');
  if (!notice) return;
  notice.dataset.state = state;
  const title = notice.querySelector('strong');
  const copy = notice.querySelector('small');
  if (title) title.textContent = message;
  if (copy) copy.textContent = detail;
}

function rowFor(service) {
  const row = document.createElement('article');
  row.className = 'homepage-site-row';
  row.dataset.homepageService = service.id;
  row.dataset.eligible = service.homepageEligible ? 'true' : 'false';

  const identity = document.createElement('div');
  identity.className = 'homepage-site-identity';
  const name = document.createElement('strong');
  name.textContent = service.name || service.id;
  const domain = document.createElement('small');
  domain.textContent = service.domain || service.label || service.id;
  identity.append(name, domain);

  const showLabel = document.createElement('label');
  showLabel.className = 'homepage-site-control';
  const show = document.createElement('input');
  show.type = 'checkbox';
  show.dataset.homepageShow = 'true';
  show.checked = service.visibility !== 'hidden';
  show.disabled = !service.homepageEligible;
  showLabel.append(show, document.createTextNode(' 첫화면'));

  const featureLabel = document.createElement('label');
  featureLabel.className = 'homepage-site-control';
  const feature = document.createElement('input');
  feature.type = 'checkbox';
  feature.dataset.homepageFeatured = 'true';
  feature.checked = service.visibility === 'featured';
  feature.disabled = !service.homepageEligible || !show.checked;
  featureLabel.append(feature, document.createTextNode(' ★ 주요'));

  const orderLabel = document.createElement('label');
  orderLabel.className = 'homepage-site-control homepage-site-order';
  const order = document.createElement('input');
  order.type = 'number';
  order.min = '0';
  order.max = '9999';
  order.step = '1';
  order.value = String(service.order ?? service.defaultOrder ?? 9999);
  order.dataset.homepageOrder = 'true';
  order.setAttribute('aria-label', `${service.name || service.id} 표시 순서`);
  orderLabel.append(document.createTextNode('순서 '), order);

  const state = document.createElement('div');
  state.className = 'homepage-site-status';
  const stateTitle = document.createElement('b');
  stateTitle.textContent = service.homepageEligible ? '공개 가능' : '공개 차단';
  const reason = document.createElement('span');
  reason.textContent = service.homepageEligible ? '운영중 · 운영 검증 완료' : `${service.status || '준비'} · 운영 검증 후 선택 가능`;
  state.append(stateTitle, reason);

  show.addEventListener('change', () => {
    feature.disabled = !service.homepageEligible || !show.checked;
    if (!show.checked) feature.checked = false;
  });
  feature.addEventListener('change', () => {
    if (feature.checked) show.checked = true;
    feature.disabled = !service.homepageEligible || !show.checked;
  });
  row.append(identity, showLabel, featureLabel, orderLabel, state);
  return row;
}

function render(services) {
  const grid = document.querySelector('#homepageAdminGrid');
  if (!grid) return;
  grid.replaceChildren(...(services || []).map(rowFor));
  status('첫화면 표시 설정을 불러왔습니다.', '체크는 노출, ★ 주요는 강조만 바꿉니다. 운영 검증이 안 된 사이트는 자동 차단됩니다.', 'ready');
}

function draft() {
  return [...document.querySelectorAll('[data-homepage-service]')].map(row => {
    const show = row.querySelector('[data-homepage-show]');
    const featured = row.querySelector('[data-homepage-featured]');
    const order = row.querySelector('[data-homepage-order]');
    const eligible = row.dataset.eligible === 'true';
    return {
      id: row.dataset.homepageService,
      visibility: !eligible || !show?.checked ? 'hidden' : featured?.checked ? 'featured' : 'normal',
      order: Math.max(0, Math.min(9999, Math.trunc(Number(order?.value) || 9999))),
      name: row.querySelector('.homepage-site-identity strong')?.textContent || row.dataset.homepageService,
      eligible,
    };
  });
}

function preview() {
  const box = document.querySelector('#homepageAdminPreview');
  const list = document.querySelector('#homepageAdminPreviewList');
  if (!box || !list) return;
  const visible = draft().filter(item => item.eligible && item.visibility !== 'hidden').sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  list.replaceChildren();
  const items = visible.length ? visible : [{ name: '표시할 사이트가 없습니다.', visibility: 'hidden', order: '' }];
  for (const item of items) {
    const chip = document.createElement('span');
    chip.className = `homepage-preview-chip${item.visibility === 'featured' ? ' featured' : ''}`;
    chip.textContent = `${item.visibility === 'featured' ? '★ ' : ''}${item.order !== '' ? `${item.order}. ` : ''}${item.name}`;
    list.append(chip);
  }
  box.hidden = false;
  status('미리보기를 만들었습니다.', '아직 공개 화면에는 반영되지 않았습니다. 확인 후 적용을 누르세요.', 'preview');
}

async function load() {
  if (!token()) {
    status('관리자 인증이 필요합니다.', '통합인증센터에서 로그인한 뒤 다시 열어 주세요.', 'warning');
    return;
  }
  status('첫화면 설정을 확인하는 중입니다.', '중앙 서비스 레지스트리와 현재 공개 설정을 비교합니다.', 'loading');
  try { render((await api()).services || []); }
  catch (error) { status('첫화면 설정을 불러오지 못했습니다.', error.message, 'error'); }
}

async function save() {
  const button = document.querySelector('#homepageAdminApply');
  if (!button || !token()) return;
  const services = draft().map(({ id, visibility, order }) => ({ id, visibility, order }));
  button.disabled = true;
  button.textContent = '적용 중…';
  status('안전하게 적용하는 중입니다.', '운영 검증과 공개 가능 여부를 서버에서 다시 확인합니다.', 'loading');
  try {
    const data = await api({ method: 'PUT', body: JSON.stringify({ services }) });
    render(data.services || []);
    document.querySelector('#homepageAdminPreview')?.setAttribute('hidden', '');
    status('EKODI.KR 첫화면 설정을 적용했습니다.', '공개 화면은 새 표시 여부, 주요 노출과 순서를 즉시 읽어 반영합니다.', 'success');
  } catch (error) {
    status('적용하지 못했습니다.', error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '적용';
  }
}

export function mountHomepageAdmin() {
  installStyle();
  let panel = document.querySelector('#homepageAdminPanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'homepageAdminPanel';
    panel.className = 'section hidden-panel';
    panel.dataset.panel = 'sites';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="homepage-admin-head">
        <div><p class="kicker">SITE MANAGEMENT · PUBLIC GATEWAY</p><h2>사이트 관리 · EKODI.KR 첫화면</h2><p>생태계 사이트의 존재와 첫화면 노출을 분리해 관리합니다. 새 사이트는 중앙 레지스트리에 등록되면 자동으로 나타나며, 운영 검증이 끝난 사이트만 공개할 수 있습니다.</p></div>
        <div class="homepage-admin-actions"><button class="secondary" id="homepageAdminRefresh" type="button">↻ 새로고침</button><button class="secondary" id="homepageAdminPreviewButton" type="button">미리보기</button><button class="primary" id="homepageAdminApply" type="button">적용</button></div>
      </div>
      <div class="homepage-admin-notice" id="homepageAdminNotice" role="status" aria-live="polite"><span aria-hidden="true">▦</span><div><strong>첫화면 설정을 준비합니다.</strong><small>사이트별 공개 상태와 다음 행동을 바로 확인할 수 있습니다.</small></div></div>
      <div class="homepage-admin-grid" id="homepageAdminGrid"></div>
      <div class="homepage-preview" id="homepageAdminPreview" hidden><strong>공개 순서 미리보기</strong><div class="homepage-preview-list" id="homepageAdminPreviewList"></div></div>`;
    document.querySelector('.content')?.append(panel);
    panel.querySelector('#homepageAdminRefresh')?.addEventListener('click', load);
    panel.querySelector('#homepageAdminPreviewButton')?.addEventListener('click', preview);
    panel.querySelector('#homepageAdminApply')?.addEventListener('click', save);
  }
  load();
  return panel;
}

if (typeof window !== 'undefined') {
  window.EKODIHomepageAdmin = Object.freeze({ mount: mountHomepageAdmin, reload: load });
}
