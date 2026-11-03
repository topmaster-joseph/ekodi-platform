(() => {
  'use strict';
  const TOKEN_KEY = 'ekodi-auth-token';
  const SECTION = 'communication';
  const CSS = 'communication-admin.css';
  const services = [
    { key:'mail-admin', title:'메일 관리', description:'개인·기관 메일 연결과 권한 경계를 관리합니다.', href:'https://ekodi.kr/mail/admin', action:'메일 관리 열기' },
    { key:'mail', title:'메일', description:'권한이 있는 메일 계정과 메시지 작업 공간을 엽니다.', href:'https://ekodi.kr/mail', action:'메일 열기' },
    { key:'live', title:'라이브', description:'방송과 실시간 송출 서비스의 독립 운영 공간을 엽니다.', href:'https://ekodi.kr/live', action:'라이브 열기' },
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
  function installNotificationTabs(section, grid) {
    const nav=el('nav','','communication-tabs');
    nav.setAttribute('role','tablist');
    nav.setAttribute('aria-label','소통 서비스');
    const output=el('section','','communication-notification-panel');
    output.hidden=true;
    const title=el('h3','통합 알림 운영');
    const hint=el('p','현재 구독 기기 수와 선택 기간의 발행·전달 처리 현황을 구분합니다. 개인별 정보는 표시하지 않습니다.');
    const status=el('p','현황을 선택하면 최신 정보를 불러옵니다.','communication-note');
    status.setAttribute('role','status');
    const list=el('div','','communication-notification-list');
    const refresh=el('button','새로고침','communication-refresh');
    refresh.type='button';
    const periodLabel=el('label','집계 기간 ');
    const periodSelect=el('select','','communication-period');
    periodSelect.setAttribute('aria-label','알림 집계 기간');
    for(const [value,label] of [['7d','최근 7일'],['30d','최근 30일'],['all','전체 기간']]){
      const option=el('option',label);
      option.value=value;periodSelect.append(option);
    }
    periodSelect.value='7d';
    periodLabel.append(periodSelect);
    const link=el('a','사용자 구독 화면','primary communication-link');
    link.href='/notifications/';link.target='_blank';link.rel='noopener';
    output.append(title,hint,periodLabel,refresh,link,status,list);
    async function reload() {
      const api=window.EKODIAdminCore?.request;
      list.replaceChildren();
      if(typeof api!=='function'){status.textContent='관리자 세션을 확인할 수 없습니다.';return;}
      status.textContent='알림 집계 현황을 조회하고 있습니다.';
      refresh.disabled=true;
      try {
        const data=await api('/api/notifications/admin/summary?window='+encodeURIComponent(periodSelect.value));
        const top=el('p','웹푸시 발송: '+(data.webPushEnabled?'활성화':'비활성화')+' · 기기 정보 비공개','communication-note');
        list.append(top);
        for(const item of data.topics||[]){
          const line=el('article','','communication-notification-row');
          const last=item.lastEventAt?new Date(item.lastEventAt):null;
          line.append(el('strong',item.label),
            el('span','현재 구독 기기 '+item.subscriberDevices+' · 기간 내 이벤트 '+item.events+
              ' · 전달 처리 '+item.delivered+' · 대기 '+item.pending+' · 실패 '+item.failed+
              ' · 지연 '+(item.stalled||0)+' · 발행 지연 '+(item.eventsOverdue||0)),
            el('small','자동 발행 준비: '+(item.publisher?.ready?'완료':'대기')+
              ' (서비스 허용 '+(item.publisher?.enabled?'설정됨':'꺼짐')+
              ' · 전용 인증키 '+(item.publisher?.credentialsConfigured?'설정됨':'미설정')+')'),
            el('small','마지막 발행: '+(last&&Number.isFinite(last.getTime())
              ?last.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'기록 없음')));
          list.append(line);
        }
        status.textContent='알림 현황을 갱신했습니다.';
      } catch(error) {
        status.textContent='조회 권한이나 운영 데이터 연결을 확인할 수 없습니다. '+String(error?.message||'');
      } finally {refresh.disabled=false;}
    }
    refresh.addEventListener('click',reload);
    periodSelect.addEventListener('change',()=>void reload());
    const tabs=[['mail','메일'],['live','라이브'],['notification','알림']];
    for(const [id,label] of tabs){
      const button=el('button',label,'communication-tab');
      button.type='button';button.setAttribute('role','tab');button.dataset.communicationTab=id;
      button.setAttribute('aria-selected',String(id==='mail'));
      button.addEventListener('click',()=>{
        for(const tab of nav.querySelectorAll('button'))tab.setAttribute('aria-selected',String(tab===button));
        for(const card of grid.children){
          card.hidden=id==='notification'||(id==='live'?card.dataset.communicationService!=='live':card.dataset.communicationService==='live');
        }
        grid.hidden=id==='notification';output.hidden=id!=='notification';
        if(id==='notification')void reload();
      });
      nav.append(button);
    }
    section.insertBefore(nav,grid);
    section.insertBefore(output,grid.nextSibling);
    for(const card of grid.children)card.hidden=card.dataset.communicationService==='live';
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
    const grid=section.querySelector('#communicationGrid');
    grid?.append(...services.map(serviceCard));
    if(grid)installNotificationTabs(section,grid);
    content.prepend(section);
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail:{ section:SECTION } }));
  }

  install();
  window.addEventListener('ekodi-session-validated', install);
  window.addEventListener('ekodi-admin-ready', install);
})();
