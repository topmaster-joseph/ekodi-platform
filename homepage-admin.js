const API = 'https://api.ekodi.kr';

let servicesById = new Map();
let servicesByDomain = new Map();
let loading = null;

function token() {
  return sessionStorage.getItem('ekodi-auth-token') || '';
}

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
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

function campusPanel() {
  return document.querySelector('#campusPanel');
}

function ensureSurface() {
  const panel = campusPanel();
  if (!panel) return null;

  const targets = new Set(String(panel.dataset.panel || '').split(/\s+/).filter(Boolean));
  targets.add('campus');
  targets.add('sites');
  panel.dataset.panel = [...targets].join(' ');
  document.querySelector('#homepageAdminPanel')?.remove();

  const toolbar = panel.querySelector('.campus-toolbar');
  const toolbarActions = panel.querySelector('.campus-toolbar-actions');
  if (toolbarActions && !toolbarActions.querySelector('[data-homepage-toolbar]')) {
    const group = document.createElement('span');
    group.className = 'campus-homepage-toolbar';
    group.dataset.homepageToolbar = 'true';

    const refresh = document.createElement('button');
    refresh.id = 'homepageAdminRefresh';
    refresh.type = 'button';
    refresh.className = 'secondary';
    refresh.textContent = '↻ 새로고침';

    const previewButton = document.createElement('button');
    previewButton.id = 'homepageAdminPreviewButton';
    previewButton.type = 'button';
    previewButton.className = 'secondary';
    previewButton.textContent = '미리보기';

    const apply = document.createElement('button');
    apply.id = 'homepageAdminApply';
    apply.type = 'button';
    apply.className = 'primary';
    apply.textContent = '적용';

    group.append(refresh, previewButton, apply);
    toolbarActions.prepend(group);
  }

  let notice = panel.querySelector('#homepageAdminNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'campus-homepage-notice';
    notice.id = 'homepageAdminNotice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.innerHTML = '<span aria-hidden="true">▦</span><div><strong>첫화면 설정을 준비합니다.</strong><small>사이트 운영 목록과 EKODI.KR 공개 설정을 연결하고 있습니다.</small></div>';
    toolbar?.insertAdjacentElement('afterend', notice);
  }

  let preview = panel.querySelector('#homepageAdminPreview');
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'campus-homepage-preview';
    preview.id = 'homepageAdminPreview';
    preview.hidden = true;
    preview.innerHTML = '<strong>EKODI.KR 공개 순서 미리보기</strong><div class="campus-homepage-preview-list" id="homepageAdminPreviewList"></div>';
    notice.insertAdjacentElement('afterend', preview);
  }

  if (panel.dataset.homepageAdminBound !== 'true') {
    panel.dataset.homepageAdminBound = 'true';
    panel.querySelector('#homepageAdminRefresh')?.addEventListener('click', load);
    panel.querySelector('#homepageAdminPreviewButton')?.addEventListener('click', previewHomepage);
    panel.querySelector('#homepageAdminApply')?.addEventListener('click', save);
  }

  return panel;
}

function status(message, detail = '', state = 'info') {
  const notice = campusPanel()?.querySelector('#homepageAdminNotice');
  if (!notice) return;
  notice.dataset.state = state;
  const title = notice.querySelector('strong');
  const copy = notice.querySelector('small');
  if (title) title.textContent = message;
  if (copy) copy.textContent = detail;
}

function serviceForRow(row) {
  const id = String(row?.dataset?.siteId || '').trim().toLowerCase();
  if (id && servicesById.has(id)) return servicesById.get(id);
  const domain = normalizeDomain(row?.dataset?.siteDomain);
  return domain ? servicesByDomain.get(domain) || null : null;
}

function effectiveVisibility(row) {
  const show = row.querySelector('[data-homepage-show]');
  const featured = row.querySelector('[data-homepage-featured]');
  if (row.dataset.eligible !== 'true' || !show?.checked) return 'hidden';
  return featured?.checked ? 'featured' : 'normal';
}

function eligibleRows() {
  return [...document.querySelectorAll('#campusSiteGroups [data-homepage-service][data-eligible="true"]')];
}

function orderedEligibleRows() {
  return eligibleRows().sort((a, b) => {
    const aOrder = Number(a.dataset.homepageOrder || 9999);
    const bOrder = Number(b.dataset.homepageOrder || 9999);
    return aOrder - bOrder || String(a.dataset.homepageService).localeCompare(String(b.dataset.homepageService));
  });
}

function syncOrderLabels() {
  const ordered = orderedEligibleRows();
  ordered.forEach((row, index) => {
    const label = row.querySelector('[data-homepage-order-label]');
    if (label) label.textContent = `순서 ${index + 1}`;
    const up = row.querySelector('[data-homepage-move="-1"]');
    const down = row.querySelector('[data-homepage-move="1"]');
    if (up) up.disabled = index === 0;
    if (down) down.disabled = index === ordered.length - 1;
  });
}

function normalizeOrderValues() {
  orderedEligibleRows().forEach((row, index) => {
    row.dataset.homepageOrder = String((index + 1) * 10);
  });
  syncOrderLabels();
}

function moveRow(row, direction) {
  normalizeOrderValues();
  const ordered = orderedEligibleRows();
  const index = ordered.indexOf(row);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
  const other = ordered[targetIndex];
  const currentOrder = row.dataset.homepageOrder;
  row.dataset.homepageOrder = other.dataset.homepageOrder;
  other.dataset.homepageOrder = currentOrder;
  syncOrderLabels();
  if (!campusPanel()?.querySelector('#homepageAdminPreview')?.hidden) previewHomepage();
}

function unavailableControls() {
  const strip = document.createElement('div');
  strip.className = 'campus-homepage-controls is-unavailable';
  strip.innerHTML = '<span class="campus-homepage-scope">EKODI.KR 첫화면 비대상</span><small>코어·관리자·고객 사이트는 공개 게이트웨이 목록과 분리해 관리합니다.</small>';
  return strip;
}

function controlsFor(service) {
  const strip = document.createElement('div');
  strip.className = 'campus-homepage-controls';
  strip.dataset.homepageControls = service.id;

  const showLabel = document.createElement('label');
  showLabel.className = 'campus-homepage-check';
  const show = document.createElement('input');
  show.type = 'checkbox';
  show.dataset.homepageShow = 'true';
  show.checked = service.visibility !== 'hidden';
  show.disabled = !service.homepageEligible;
  show.setAttribute('aria-label', `${service.name} EKODI.KR 첫화면 노출`);
  showLabel.append(show, document.createTextNode(' 첫화면'));

  const featureLabel = document.createElement('label');
  featureLabel.className = 'campus-homepage-check';
  const feature = document.createElement('input');
  feature.type = 'checkbox';
  feature.dataset.homepageFeatured = 'true';
  feature.checked = service.visibility === 'featured';
  feature.disabled = !service.homepageEligible || !show.checked;
  feature.setAttribute('aria-label', `${service.name} 주요 사이트 강조`);
  featureLabel.append(feature, document.createTextNode(' ★ 주요'));

  const order = document.createElement('div');
  order.className = 'campus-homepage-order';
  const orderLabel = document.createElement('span');
  orderLabel.dataset.homepageOrderLabel = 'true';
  orderLabel.textContent = '순서';

  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'secondary';
  up.dataset.homepageMove = '-1';
  up.textContent = '↑';
  up.title = 'EKODI.KR 공개 순서를 한 칸 위로';
  up.setAttribute('aria-label', `${service.name} 첫화면 순서 위로`);

  const down = document.createElement('button');
  down.type = 'button';
  down.className = 'secondary';
  down.dataset.homepageMove = '1';
  down.textContent = '↓';
  down.title = 'EKODI.KR 공개 순서를 한 칸 아래로';
  down.setAttribute('aria-label', `${service.name} 첫화면 순서 아래로`);
  order.append(orderLabel, up, down);

  const state = document.createElement('div');
  state.className = 'campus-homepage-state';
  const stateTitle = document.createElement('b');
  stateTitle.textContent = service.homepageEligible ? '공개 가능' : '공개 차단';
  const reason = document.createElement('small');
  reason.textContent = service.homepageEligible
    ? `${service.status || 'live'} · 운영 검증 완료`
    : `${service.status || '준비'} · 운영 검증 후 선택 가능`;
  state.append(stateTitle, reason);

  show.addEventListener('change', () => {
    feature.disabled = !service.homepageEligible || !show.checked;
    if (!show.checked) feature.checked = false;
  });
  feature.addEventListener('change', () => {
    if (feature.checked) show.checked = true;
    feature.disabled = !service.homepageEligible || !show.checked;
  });
  order.addEventListener('click', event => {
    const button = event.target.closest('[data-homepage-move]');
    if (!button || button.disabled) return;
    const row = strip.closest('[data-homepage-service]');
    if (!row) return;
    moveRow(row, Number(button.dataset.homepageMove));
  });

  if (!service.homepageEligible) {
    up.disabled = true;
    down.disabled = true;
  }

  strip.append(showLabel, featureLabel, order, state);
  return strip;
}

function attachControls(row, service) {
  row.querySelector('.campus-homepage-controls')?.remove();

  if (!service) {
    row.removeAttribute('data-homepage-service');
    row.removeAttribute('data-eligible');
    row.removeAttribute('data-homepage-order');
    row.append(unavailableControls());
    return;
  }

  row.dataset.homepageService = service.id;
  row.dataset.siteId = service.id;
  row.dataset.eligible = service.homepageEligible ? 'true' : 'false';
  row.dataset.homepageOrder = String(service.order ?? service.defaultOrder ?? 9999);
  row.append(controlsFor(service));
}

function render(services) {
  const panel = ensureSurface();
  if (!panel) return;

  const list = Array.isArray(services) ? services : [];
  window.EKODICampus?.reconcileRegistryServices?.(list);

  servicesById = new Map(list.map(service => [String(service.id || '').toLowerCase(), service]));
  servicesByDomain = new Map(list.map(service => [normalizeDomain(service.domain || service.label || service.url), service]));

  for (const row of panel.querySelectorAll('#campusSiteGroups .campus-site-item')) {
    attachControls(row, serviceForRow(row));
  }

  syncOrderLabels();
  status(
    '사이트 목록과 첫화면 설정을 하나로 연결했습니다.',
    '체크는 노출, ★ 주요는 강조, ↑↓는 EKODI.KR 공개 순서를 바꿉니다. 운영 검증 전 사이트는 자동 차단됩니다.',
    'ready',
  );
}

function draft() {
  return [...document.querySelectorAll('#campusSiteGroups [data-homepage-service]')].map(row => ({
    id: row.dataset.homepageService,
    visibility: effectiveVisibility(row),
    order: Math.max(0, Math.min(9999, Math.trunc(Number(row.dataset.homepageOrder || 9999)))),
    eligible: row.dataset.eligible === 'true',
    name: row.querySelector('.campus-site-identity strong')?.textContent || row.dataset.homepageService,
  }));
}

function previewHomepage() {
  const panel = ensureSurface();
  const box = panel?.querySelector('#homepageAdminPreview');
  const list = panel?.querySelector('#homepageAdminPreviewList');
  if (!box || !list) return;

  const visible = draft()
    .filter(item => item.eligible && item.visibility !== 'hidden')
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  list.replaceChildren();
  const items = visible.length ? visible : [{ name: '표시할 사이트가 없습니다.', visibility: 'hidden' }];
  items.forEach((item, index) => {
    const chip = document.createElement('span');
    chip.className = `campus-homepage-preview-chip${item.visibility === 'featured' ? ' featured' : ''}`;
    chip.textContent = `${item.visibility === 'featured' ? '★ ' : ''}${visible.length ? `${index + 1}. ` : ''}${item.name}`;
    list.append(chip);
  });
  box.hidden = false;
  status('EKODI.KR 첫화면 미리보기입니다.', '아직 공개 화면에는 반영되지 않았습니다. 확인 후 적용을 누르세요.', 'preview');
}

async function load() {
  const panel = ensureSurface();
  if (!panel) return;
  if (loading) return loading;
  if (!token()) {
    status('관리자 인증이 필요합니다.', '통합인증센터에서 로그인한 뒤 사이트 관리를 다시 열어 주세요.', 'warning');
    return;
  }

  status('첫화면 설정을 확인하는 중입니다.', '중앙 서비스 레지스트리와 현재 공개 설정을 비교합니다.', 'loading');
  loading = api()
    .then(data => render(data.services || []))
    .catch(error => status('첫화면 설정을 불러오지 못했습니다.', error.message, 'error'))
    .finally(() => { loading = null; });
  return loading;
}

async function save() {
  const panel = ensureSurface();
  const button = panel?.querySelector('#homepageAdminApply');
  if (!button || !token()) return;

  normalizeOrderValues();
  const services = draft().map(({ id, visibility, order }) => ({ id, visibility, order }));
  if (!services.length) {
    status('적용할 첫화면 서비스가 없습니다.', '중앙 서비스 레지스트리를 새로고침한 뒤 다시 시도해 주세요.', 'warning');
    return;
  }

  button.disabled = true;
  button.textContent = '적용 중…';
  status('안전하게 적용하는 중입니다.', '운영 검증과 공개 가능 여부를 서버에서 다시 확인합니다.', 'loading');

  try {
    const data = await api({ method: 'PUT', body: JSON.stringify({ services }) });
    render(data.services || []);
    const preview = panel.querySelector('#homepageAdminPreview');
    if (preview) preview.hidden = true;
    status('EKODI.KR 첫화면 설정을 적용했습니다.', '공개 화면은 새 노출 여부, 주요 강조와 순서를 즉시 읽어 반영합니다.', 'success');
  } catch (error) {
    status('적용하지 못했습니다.', error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '적용';
  }
}

function mountWhenCampusReady() {
  const existing = campusPanel();
  if (existing) return existing;

  let compatibility = document.querySelector('#homepageAdminPanel');
  if (!compatibility) {
    compatibility = document.createElement('section');
    compatibility.id = 'homepageAdminPanel';
    compatibility.className = 'section hidden-panel';
    compatibility.dataset.panel = 'sites';
    compatibility.hidden = true;
    compatibility.innerHTML = '<div class="campus-homepage-notice" role="status" aria-live="polite"><span aria-hidden="true">▦</span><div><strong>사이트 관리 화면을 불러오는 중입니다.</strong><small>별도 목록을 만들지 않고 Campus의 동일 목록으로 연결합니다.</small></div></div>';
    document.querySelector('.content')?.append(compatibility);
  }

  document.querySelector('[data-demand-feature="campus"], [data-lazy-section="campus"]')?.click();

  if (document.documentElement.dataset.homepageCampusWait !== 'true') {
    document.documentElement.dataset.homepageCampusWait = 'true';
    const observer = new MutationObserver(() => {
      if (!campusPanel()) return;
      observer.disconnect();
      delete document.documentElement.dataset.homepageCampusWait;
      ensureSurface();
      load();
      window.EKODIAdminPanels?.activate?.('sites');
    });
    observer.observe(document.querySelector('.content') || document.documentElement, { childList: true, subtree: true });
  }
  return compatibility;
}

export function mountHomepageAdmin() {
  const panel = ensureSurface();
  if (!panel) return mountWhenCampusReady();
  load();
  return panel;
}

if (typeof window !== 'undefined') {
  window.EKODIHomepageAdmin = Object.freeze({
    mount: mountHomepageAdmin,
    reload: load,
    preview: previewHomepage,
    save,
  });
}
