(() => {
  'use strict';
  const API = 'https://api.ekodi.kr/api/control/services';
  const TOKEN_KEY = 'ekodi-auth-token';
  let installed = false;
  let loading = false;

  const token = () => {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));

  function ensureStyle() {
    if (document.querySelector('#ekodi-community-admin-style')) return;
    const style = document.createElement('style');
    style.id = 'ekodi-community-admin-style';
    style.textContent = '.community-admin-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.community-admin-card{padding:16px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(15,23,42,.4)}.community-admin-card small{display:block;margin-bottom:7px}.community-admin-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.community-admin-actions a,.community-admin-actions button{min-height:36px;padding:8px 12px;border:1px solid rgba(148,163,184,.24);border-radius:8px;background:rgba(56,189,248,.08);color:inherit;text-decoration:none;cursor:pointer}.community-admin-boundary{margin-top:14px;padding:13px 14px;border-left:3px solid rgba(56,189,248,.5);background:rgba(56,189,248,.06)}@media(max-width:860px){.community-admin-grid{grid-template-columns:1fr}}';
    document.head.append(style);
  }
  function statusLabel(service) {
    const latest = service?.latest?.status || '';
    if (latest === 'online') return '정상';
    if (latest === 'degraded') return '주의';
    if (latest === 'offline') return '오프라인';
    return service?.state === 'active' ? '운영 중' : service?.state === 'paused' ? '일시중지' : '준비 중';
  }

  async function requestService() {
    const headers = new Headers({ accept: 'application/json' });
    const current = token();
    if (current) headers.set('authorization', `Bearer ${current}`);
    const response = await fetch(API, { headers, credentials:'omit', cache:'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Community 운영정보 조회 실패 (${response.status})`);
    const services = Array.isArray(payload.services) ? payload.services : [];
    return services.find(service => service.id === 'community') || null;
  }

  function render(service, error = '') {
    const root = document.querySelector('#communityAdminStatus');
    if (!root) return;
    if (error) {
      root.innerHTML = `<article class="community-admin-card"><small>운영 상태</small><strong>확인 필요</strong><p>${escapeHtml(error)}</p></article>`;
      return;
    }
    const availability = service?.stats24h?.availabilityPercent;
    root.innerHTML = `
      <article class="community-admin-card"><small>서비스 상태</small><strong>${escapeHtml(statusLabel(service))}</strong><p>${escapeHtml(service?.domain || 'community.ekodi.kr')}</p></article>
      <article class="community-admin-card"><small>24시간 가용성</small><strong>${availability == null ? '집계 대기' : `${Number(availability).toFixed(2)}%`}</strong><p>${Number(service?.stats24h?.checks || 0).toLocaleString('ko-KR')}회 점검</p></article>
      <article class="community-admin-card"><small>운영 정책</small><strong>${service?.monitorEnabled ? '모니터링 사용' : '수동 확인'}</strong><p>${escapeHtml(service?.note || 'Community 서비스 운영 경계')}</p></article>`;
  }

  async function load() {
    if (loading) return;
    loading = true;
    const root = document.querySelector('#communityAdminStatus');
    if (root) root.setAttribute('aria-busy', 'true');
    try { render(await requestService()); }
    catch (error) { render(null, error?.message || String(error)); }
    finally {
      loading = false;
      if (root) root.removeAttribute('aria-busy');
    }
  }

  function install() {
    if (installed) return true;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return false;
    ensureStyle();
    installed = true;
    let button = nav.querySelector('[data-section="community"], [data-lazy-section="community"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav';
      button.dataset.section = 'community';
      button.innerHTML = '◎ <span>커뮤니티</span>';
      const books = nav.querySelector('[data-section="books"], [data-lazy-section="books"]');
      if (books) books.insertAdjacentElement('beforebegin', button); else nav.append(button);
    }
    let panel = content.querySelector('[data-panel~="community"]');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'section hidden-panel';
      panel.dataset.panel = 'community';
      panel.innerHTML = `<div><p class="kicker">COMMUNITY · SERVICE OPERATIONS</p><h2>커뮤니티 운영</h2><p>Community 서비스의 운영 상태와 중앙 관리 경계를 확인합니다.</p></div>
        <div id="communityAdminStatus" class="community-admin-grid"><article class="community-admin-card"><small>운영 상태</small><strong>확인 중</strong></article></div>
        <div class="community-admin-actions"><a href="https://community.ekodi.kr/" target="_blank" rel="noopener">Community 열기 ↗</a><button id="communityAdminRefresh" type="button">상태 새로고침</button></div>
        <div class="community-admin-boundary"><strong>사역보고는 에코디교회에서 관리합니다.</strong><p>Community는 공동체 서비스 운영만 담당하고, 교회 사역보고는 교회 목회자 관리자에 분리되어 있습니다.</p><a href="https://ekodi.kr/ekodi-church/admin/reports">교회 사역보고 관리 ↗</a></div>`;
      content.append(panel);
    }
    panel.querySelector('#communityAdminRefresh')?.addEventListener('click', load);
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail:{ section:'community' } }));
    load();
    return true;
  }

  const observer = new MutationObserver(() => {
    if (install()) observer.disconnect();
  });
  if (!install()) observer.observe(document.documentElement, { childList:true, subtree:true });
  window.EKODICommunityAdmin = Object.freeze({ load });
})();
