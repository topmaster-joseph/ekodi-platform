const grid = document.querySelector('#serviceGrid');
const adminDock = document.querySelector('#adminDock');
const note = document.querySelector('#portalNote');

function serviceState(service, health) {
  if (!service.qaVerified) return { enabled: false, tone: 'disabled', label: '준비 중' };
  if (!health) return { enabled: true, tone: 'ready', label: '연결 가능' };
  if (health.status === 'online' && health.httpStatus === 200) return { enabled: true, tone: 'online', label: '정상' };
  return { enabled: true, tone: 'degraded', label: '점검 중' };
}

function serviceNode(service, health) {
  const state = serviceState(service, health);
  const tag = state.enabled ? 'a' : 'div';
  const el = document.createElement(tag);
  el.className = `service-node ${state.tone}`;
  el.dataset.service = service.id;

  if (state.enabled) {
    el.href = service.href;
    el.rel = 'noopener';
    el.setAttribute('aria-label', `${service.name} 열기`);
  } else {
    el.setAttribute('aria-disabled', 'true');
    el.title = '사이트 구축·배포 검수 완료 후 열립니다.';
  }

  el.innerHTML = `
    <span class="node-icon" aria-hidden="true">${service.icon}</span>
    <span class="node-text"><strong>${service.name}</strong><small>${service.domain}</small></span>
    <span class="node-status" title="${state.label}" aria-hidden="true"></span>
  `;
  return el;
}

function renderServices(services, healthByDomain = new Map()) {
  grid.replaceChildren(...services.map(service => serviceNode(service, healthByDomain.get(service.domain))));
}

function renderAdmin(service, health) {
  const state = serviceState(service, health);
  const tag = state.enabled ? 'a' : 'span';
  const el = document.createElement(tag);
  el.className = `admin-link${state.enabled ? '' : ' disabled'}`;
  el.innerHTML = '<span class="dot" aria-hidden="true"></span>관리자';

  if (state.enabled) {
    el.href = service.href;
    el.rel = 'noopener';
    el.setAttribute('aria-label', 'EKODI 관리자 페이지 열기');
  } else {
    el.setAttribute('aria-disabled', 'true');
    el.title = '관리자 사이트 배포·검수 완료 후 열립니다.';
  }

  adminDock.replaceChildren(el);
}

async function refreshHealth(publicServices, admin) {
  try {
    const response = await fetch('./monitor-status.json', { cache: 'no-cache' });
    if (!response.ok) return;

    const monitor = await response.json();
    const healthByDomain = new Map((monitor.sites || []).map(site => [site.domain, site]));
    renderServices(publicServices, healthByDomain);
    if (admin) renderAdmin(admin, healthByDomain.get(admin.domain));

    const linkedCount = publicServices.filter(service => service.qaVerified).length;
    const onlineCount = publicServices.filter(service => {
      const health = healthByDomain.get(service.domain);
      return service.qaVerified && health?.status === 'online' && health?.httpStatus === 200;
    }).length;
    note.textContent = `연결 서비스 ${linkedCount}개 · 현재 정상 응답 ${onlineCount}개`;
  } catch (error) {
    console.warn('Health status refresh skipped:', error);
  }
}

async function loadPortal() {
  try {
    const registryResponse = await fetch('./service-registry.json');
    if (!registryResponse.ok) throw new Error('서비스 등록정보를 불러오지 못했습니다.');

    const registry = await registryResponse.json();
    const publicServices = registry.services.filter(service => !service.admin);
    const admin = registry.services.find(service => service.admin);

    renderServices(publicServices);
    if (admin) renderAdmin(admin);

    const linkedCount = publicServices.filter(service => service.qaVerified).length;
    note.textContent = `검수 완료 서비스 ${linkedCount}개를 바로 연결합니다. 상태 정보는 별도로 갱신됩니다.`;

    void refreshHealth(publicServices, admin);
  } catch (error) {
    grid.innerHTML = '<div class="service-node disabled" aria-disabled="true"><span class="node-icon">!</span><span class="node-text"><strong>서비스 목록 확인 중</strong><small>registry unavailable</small></span><span class="node-status"></span></div>';
    note.textContent = '서비스 목록을 확인할 수 없습니다.';
    console.error(error);
  }
}

loadPortal();
