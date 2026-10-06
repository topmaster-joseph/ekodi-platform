(() => {
  'use strict';
  const SECTION='pos-agent';
  const BASE='/cmpmyi/admin/agent/download/';
  const STORES=[
    {id:'jadam',label:'자담치킨',href:'/jadam/admin/pos'},
    {id:'pizzamaru',label:'피자마루',href:'/pizzamaru/admin/pos'},
    {id:'yogurt',label:'요거트퍼플',href:'/yogurt/admin/pos'},
  ];

  function ensureStyle(){
    if(document.querySelector('link[data-pos-agent-admin-style]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/admin/pos-agent-admin.css';
    link.dataset.posAgentAdminStyle='true';
    document.head.append(link);
  }

  function panel(){return document.getElementById('ekodiPosAgentAdmin')}

  function ensurePanel(){
    if(panel())return panel();
    const host=document.querySelector('.content');
    if(!host)return null;
    const section=document.createElement('section');
    section.id='ekodiPosAgentAdmin';
    section.className='section pos-agent-admin hidden-panel';
    section.dataset.panel=SECTION;
    section.innerHTML=`
      <div class="pos-agent-head">
        <div>
          <p class="kicker">POS AGENT · INSTALL & MANAGEMENT</p>
          <h2>POS Agent 설치·관리</h2>
          <p>최고관리자 화면을 유지한 채 각 Windows POS의 Agent 설치·업그레이드·실행·진단·삭제를 관리합니다.</p>
        </div>
        <a class="pos-agent-open-legacy" href="/cmpmyi/admin/agent" target="_blank" rel="noopener">매장 통합관리 새창 ↗</a>
      </div>

      <div class="pos-agent-status" id="posAgentLocalStatus" data-state="checking">
        <div><b>현재 PC의 Agent 상태</b><span id="posAgentLocalState">127.0.0.1:17831 연결을 확인합니다.</span></div>
        <button id="posAgentCheck" type="button">상태 다시 확인</button>
      </div>

      <div class="pos-agent-steps" aria-label="POS Agent 설치 순서">
        <article><b>1 · POS PC에서 열기</b><span>설치하려는 Windows POS에서 이 화면을 엽니다.</span></article>
        <article><b>2 · 원클릭 설치</b><span>설치 파일을 내려받고 관리자 권한을 허용합니다.</span></article>
        <article><b>3 · 상태 확인</b><span>Agent 버전과 연결 상태를 확인합니다.</span></article>
        <article><b>4 · 필요 시 진단</b><span>프로세스명·창 제목을 확인해 매핑합니다.</span></article>
      </div>

      <div class="pos-agent-grid">
        <article class="pos-agent-card">
          <h3>설치 · 업그레이드</h3>
          <p>처음 설치하거나 기존 Agent를 최신 버전으로 갱신합니다. 기존 로컬 설정은 업그레이드 시 보존됩니다. <strong>0x80041318 / 작업 XML 범위 오류는 최신 설치기가 자동 보정합니다.</strong></p>
          <div class="pos-agent-actions">
            <a class="primary" href="${BASE}setup-pos-agent.cmd" download>원클릭 설치 다운로드</a>
            <a href="${BASE}setup-pos-agent-compat.cmd" download>호환 설치 · 작업 XML 오류용</a>
            <a href="${BASE}install-pos-agent.ps1" download>수동 설치 스크립트</a>
          </div>
        </article>

        <article class="pos-agent-card">
          <h3>실행 · 중지</h3>
          <p>설치는 유지한 채 현재 Agent만 시작하거나 중지합니다.</p>
          <div class="pos-agent-actions">
            <a href="${BASE}start-pos-agent.cmd" download>Agent 실행 파일</a>
            <a href="${BASE}stop-pos-agent.cmd" download>Agent 중지 파일</a>
          </div>
        </article>

        <article class="pos-agent-card">
          <h3>진단 · 고급 설정</h3>
          <p>실제 프로세스명과 창 제목을 확인합니다. 진단은 프로그램을 실행·종료·전환하지 않습니다.</p>
          <div class="pos-agent-actions">
            <a href="${BASE}diagnose-pos-targets.ps1" download>진단 파일</a>
            <a href="${BASE}pos-agent.config.example.json" download>설정 예시</a>
            <a href="${BASE}README.md" download>전체 안내</a>
          </div>
        </article>

        <article class="pos-agent-card">
          <h3>삭제</h3>
          <p>이 POS PC에서 EKODI POS Agent 예약 작업과 설치 파일을 제거합니다.</p>
          <div class="pos-agent-actions">
            <a class="danger" href="${BASE}remove-pos-agent.cmd" download>원클릭 삭제 다운로드</a>
            <a href="${BASE}uninstall-pos-agent.ps1" download>수동 삭제 스크립트</a>
          </div>
        </article>
      </div>

      <article class="pos-agent-card">
        <h3>매장 POS 바로가기</h3>
        <p>설치 완료 후 각 매장 POS 화면에서 Agent 상태 확인과 Windows 프로그램 전환을 사용합니다.</p>
        <div class="pos-agent-store-links">${STORES.map(s=>`<a href="${s.href}" target="_blank" rel="noopener">${s.label} POS ↗</a>`).join('')}</div>
      </article>

      <div class="pos-agent-note">
        브라우저 보안상 Windows 설치·삭제 파일을 자동 실행하지 않습니다. 다운로드한 <strong>.cmd</strong> 파일을 해당 POS PC에서 직접 실행하고, 관리자 권한 요청 내용을 확인한 뒤 허용합니다. 이전 설치에서 <strong>0x80041318</strong> 또는 <strong>작업 XML 범위 오류</strong>가 반복되면 <strong>호환 설치 · 작업 XML 오류용</strong>을 사용하세요. 이 설치는 Windows 작업 스케줄러를 아예 우회하고 현재 사용자 시작프로그램 폴더로 Agent를 자동 시작하므로 같은 오류 경로를 다시 타지 않습니다. 기존 <strong>20초 재시작 설정</strong> 때문에 발생했던 오류도 이 경로에서는 사용하지 않습니다. Agent는 <strong>127.0.0.1</strong> 로컬 연결만 사용합니다.
      </div>
    `;
    host.prepend(section);
    section.querySelector('#posAgentCheck')?.addEventListener('click',check);
    return section;
  }

  async function probe(store){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),1800);
    try{
      const response=await fetch('http://127.0.0.1:17831/v1/health',{
        method:'GET',
        headers:{'X-EKODI-Store':store.id},
        cache:'no-store',
        signal:controller.signal
      });
      const data=await response.json().catch(()=>null);
      if(response.ok&&data?.ok)return {store,data};
    }catch{}finally{clearTimeout(timer)}
    return null;
  }

  async function check(){
    const root=ensurePanel();
    const host=root?.querySelector('#posAgentLocalStatus');
    const state=root?.querySelector('#posAgentLocalState');
    const button=root?.querySelector('#posAgentCheck');
    if(button)button.disabled=true;
    if(host)host.dataset.state='checking';
    if(state)state.textContent='현재 PC의 로컬 Agent를 확인하고 있습니다.';
    try{
      const results=(await Promise.all(STORES.map(probe))).filter(Boolean);
      if(results.length){
        const first=results[0].data||{};
        const version=first.version||first.agentVersion||'확인됨';
        const targets=Array.isArray(first.targets)?first.targets:[];
        const configured=targets.filter(row=>row&&row.configured!==false).length;
        if(host)host.dataset.state='online';
        if(state)state.textContent=`Agent 연결됨 · 버전 ${version} · 확인된 매장 ${results.length}개 · 대상 ${configured}개`;
      }else{
        if(host)host.dataset.state='offline';
        if(state)state.textContent='이 PC에서 Agent 연결이 확인되지 않습니다. POS PC에서 설치 후 다시 확인하세요.';
      }
    }finally{
      if(button)button.disabled=false;
    }
  }

  function activateIfRequested(){
    const requested=location.pathname==='/admin/status/pos-agent'||location.hash==='#pos-agent';
    if(requested)queueMicrotask(()=>window.EKODIAdminPanels?.activate?.(SECTION));
  }

  function init(){
    ensureStyle();
    ensurePanel();
    window.EKODIAdminSidebar?.sync?.(document);
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed',{detail:{feature:SECTION}}));
    activateIfRequested();
  }

  window.addEventListener('ekodi-admin-section-changed',event=>{
    if(event?.detail?.section===SECTION)check();
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();