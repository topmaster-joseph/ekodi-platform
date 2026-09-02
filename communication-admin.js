(() => {
  'use strict';
  const TOKEN_KEY = 'ekodi-auth-token';
  const SECTION = 'communication';
  const CSS = 'communication-admin.css';
  const services = [
    { key:'mail-admin', title:'메일 관리', description:'개인·기관 메일 연결과 권한 경계를 관리합니다.', href:'https://mail.ekodi.kr/admin', action:'메일 관리 열기' },
    { key:'mail', title:'메일', description:'권한이 있는 메일 계정과 메시지 작업 공간을 엽니다.', href:'https://mail.ekodi.kr/', action:'메일 열기' },
    { key:'live', title:'라이브', description:'방송과 실시간 송출 서비스의 독립 운영 공간을 엽니다.', href:'https://live.ekodi.kr/', action:'라이브 열기' },
  ];

  function el(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function serviceCard(service) {
    const card = el('article', '', 'communication-card');
    card.dataset.communicationService = service.key;
    const copy = el('div', '', 'communication-card-copy');
    copy.append(el('span', service.key === 'live' ? 'LIVE' : 'MAIL', 'communication-kicker'));
    copy.append(el('h3', service.title));
    copy.append(el('p', service.description));
    const link = el('a', `${service.action} ↗`, 'primary communication-link');
    link.href = service.href;
    link.target = '_blank';
    link.rel = 'noopener';
    card.append(copy, link);
    return card;
  }
  function ensureStyle() {
    if (document.querySelector(`link[data-communication-style="${CSS}"]`)) return;
    const link = document.createElement('link');
    const version = new URL(document.currentScript?.src || location.href, location.href).searchParams.get('v');
    link.rel = 'stylesheet'; link.href = `${CSS}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
    link.dataset.communicationStyle = CSS; document.head.append(link);
  }

  function install() {
    ensureStyle();
    if (!sessionStorage.getItem(TOKEN_KEY)) return;
    const content = document.querySelector('.content');
    if (!content || document.querySelector('#communicationAdmin')) return;

    const section = el('section', '', 'section communication-admin hidden-panel');
    section.id = 'communicationAdmin';
    section.dataset.panel = SECTION;
    section.innerHTML = `
      <header class="communication-head">
        <div><p class="kicker">EKODI COMMUNICATION ADMIN</p><h2>메일 · 라이브</h2><p>공통 운영화면은 한곳에서 제공하되 Mail과 Live는 독립 서비스 경계를 유지합니다.</p></div>
      </header>
      <div class="communication-grid" id="communicationGrid"></div>
      <p class="communication-note">서비스 상태를 임의로 추정하지 않습니다. 각 독립 운영 공간의 실제 상태와 권한을 그대로 사용합니다.</p>`;
    section.querySelector('#communicationGrid')?.append(...services.map(serviceCard));
    content.prepend(section);
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail:{ section:SECTION } }));
  }

  install();
  window.addEventListener('ekodi-session-validated', install);
  window.addEventListener('ekodi-admin-ready', install);
})();
