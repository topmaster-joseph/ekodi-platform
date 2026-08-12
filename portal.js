const grid = document.querySelector('#serviceGrid');
const adminDock = document.querySelector('#adminDock');
const note = document.querySelector('#portalNote');

function makeState(service, health) {
  if (!service.qaVerified) return { enabled: false, label: '준비 중' };
  if (service.healthCheck === false) return { enabled: true, label: '이동하기' };
  if (!health) return { enabled: false, label: '확인 중' };
  if (health.status !== 'online' || health.httpStatus !== 200) return { enabled: false, label: '점검 중' };
  return { enabled: true, label: '이동하기' };
}

function serviceCard(service, health) {
  const state = makeState(service, health);
  const tag = state.enabled ? 'a' : 'div';
  const el = document.createElement(tag);
  el.className = `service-card${state.enabled ? '' : ' disabled'}`;
  el.dataset.service = service.id;
  if (state.enabled) {
    el.href = service.href;
    el.rel = 'noopener';
    el.setAttribute('aria-label', `${service.name} 열기`);
  } else {
    el.setAttribute('aria-disabled', 'true');
    el.title = service.qaVerified ? '현재 상태 점검 중입니다.' : '사이트 구축·배포 검수 완료 후 열립니다.';
  }
  el.innerHTML = `
    <div class="card-top">
      <span class="service-icon" aria-hidden="true">${service.icon}</span>
      <span class="card-state">${state.label}</span>
    </div>
    <div><strong>${service.name}</strong><small>${service.domain}</small></div>
  `;
  return el;
}

function renderAdmin(service, health) {
  const state = makeState(service, health);
  const tag = state.enabled ? 'a' : 'span';
  const el = document.createElement(tag);
  el.className = `admin-link${state.enabled ? '' : ' disabled'}`;
  el.innerHTML = `<span class="dot" aria-hidden="true"></span>관리자`;
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

async function loadPortal() {
  try {
    const [registryResponse, monitorResponse] = await Promise.all([
      fetch('./service-registry.json', { cache: 'no-store' }),
      fetch('./monitor-status.json', { cache: 'no-store' })
    ]);
    if (!registryResponse.ok) throw new Error('서비스 등록정보를 불러오지 못했습니다.');
    const registry = await registryResponse.json();
    const monitor = monitorResponse.ok ? await monitorResponse.json() : { sites: [] };
    const healthByDomain = new Map((monitor.sites || []).map(site => [site.domain, site]));
    const publicServices = registry.services.filter(service => !service.admin);
    const admin = registry.services.find(service => service.admin);

    grid.replaceChildren(...publicServices.map(service => serviceCard(service, healthByDomain.get(service.domain))));
    if (admin) renderAdmin(admin, healthByDomain.get(admin.domain));

    const enabledCount = publicServices.filter(service => makeState(service, healthByDomain.get(service.domain)).enabled).length;
    note.textContent = `검수가 완료되고 현재 정상 응답하는 서비스 ${enabledCount}개만 연결됩니다.`;
  } catch (error) {
    grid.innerHTML = '<div class="service-card disabled" aria-disabled="true"><div><strong>서비스 확인 중</strong><small>안전한 연결 상태를 확인하고 있습니다.</small></div></div>';
    note.textContent = '연결 상태를 확인할 수 없어 모든 외부 링크를 안전하게 잠갔습니다.';
    console.error(error);
  }
}

loadPortal();
