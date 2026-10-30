(() => {
  'use strict';
  const ROOT='ekodiSocialAccountRegistry';
  const ENDPOINT='https://ekodi.kr/api/control/external-accounts/social-identities?scope=all';
  const sessionToken=()=>{try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return''}};
  const el=(tag,text='',className='')=>{
    const node=document.createElement(tag);
    if(text)node.textContent=String(text);
    if(className)node.className=className;
    return node;
  };
  const stateText={
    disabled:'비활성화',pending_provider_verification:'공급자 인증 대기',
    revoked:'해제',active:'기존 서비스 활성',paused:'기존 서비스 중지',
    reconnect_required:'재연결 필요',error:'오류'
  };
  async function authenticatedSuperAdmin(){
    const token=sessionToken();
    if(!token)return false;
    const res=await fetch('https://ekodi.kr/api/session',{headers:{authorization:'Bearer '+token},cache:'no-store'});
    if(!res.ok)return false;
    const session=await res.json();
    return session?.authenticated===true&&session.role==='super_admin';
  }
  let busy=false;
  async function load(){
    const panel=document.getElementById(ROOT);
    if(!panel||busy)return;
    const status=panel.querySelector('[data-social-message]');
    busy=true;
    panel.querySelector('[data-social-refresh]').disabled=true;
    status.classList.remove('ekodi-social-error');
    status.textContent='외부 채널 계정 연결 현황을 확인하고 있습니다.';
    try{
      if(!await authenticatedSuperAdmin())throw new Error('최고관리자 인증이 필요합니다.');
      const res=await fetch(ENDPOINT,{headers:{authorization:'Bearer '+sessionToken()},cache:'no-store'});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||'연결 현황을 불러올 수 없습니다.');
      render(panel,data);
      status.textContent='조회 시각: '+new Date().toLocaleString('ko-KR')+' · 외부 채널 기록 기준이며 회원 로그인 수단과는 별개입니다.';
    }catch(error){
      status.textContent=error?.message||'상태 조회에 실패했습니다.';
      status.classList.add('ekodi-social-error');
      panel.querySelector('[data-social-metrics]').replaceChildren();
      panel.querySelector('[data-social-providers]').replaceChildren();
      panel.querySelector('[data-social-links]').replaceChildren();
      panel.querySelector('[data-social-existing]').replaceChildren();
      panel.querySelector('[data-social-account-count]').textContent='조회 실패';
      panel.querySelector('[data-social-account-empty]').hidden=true;
      panel.querySelector('[data-social-result-count]').textContent='조회 실패';
      panel.querySelector('[data-social-empty]').hidden=true;
    }finally{busy=false;panel.querySelector('[data-social-refresh]').disabled=false}
  }
  function metric(label,value){
    const card=el('article');card.append(el('small',label),el('strong',String(value)));return card;
  }
  function renderRows(target,rows,kind){
    target.replaceChildren();
    if(!rows.length){target.append(el('p',kind==='identity'?'아직 등록된 EKODI 소셜계정 기록이 없습니다.':'기존 서비스 연결 기록이 없습니다.'));return}
    for(const account of rows){
      const row=el('article','','ekodi-social-record');
      row.dataset.socialRecord=kind;
      row.dataset.status=String(account.status||'unknown').toLowerCase();
      row.dataset.searchText=[
        account.provider,account.displayName,account.providerAccountId,
        account.ekodiUserId,account.workspaceSlug,account.status,stateText[account.status]
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      const info=el('div');
      const provider=el('strong',(account.provider||'')+' · '+(account.displayName||account.providerAccountId||'미지정'));
      const owner=kind==='identity'
        ?'EKODI ID: '+(account.ekodiUserId||'확인 필요')
        :'운영주체: '+(account.workspaceSlug||'미지정');
      info.append(provider,el('small',owner));
      if(account.providerAccountId)info.append(el('small','외부 ID: '+account.providerAccountId));
      row.append(info,el('span',stateText[account.status]||account.status||'미확인'));
      target.append(row);
    }
  }

  function filterAccounts(panel){
    const query=(panel.querySelector('[data-social-account-search]')?.value||'').trim().toLocaleLowerCase();
    const status=panel.querySelector('[data-social-account-filter]')?.value||'all';
    const source=panel.querySelector('[data-social-account-source]')?.value||'all';
    const rows=[...panel.querySelectorAll('[data-social-record]')];
    let count=0;
    for(const row of rows){
      const allowedStatus=status==='all'||row.dataset.status===status;
      const allowedSource=source==='all'||row.dataset.socialRecord===source;
      row.hidden=!(allowedStatus&&allowedSource&&row.dataset.searchText.includes(query));
      if(!row.hidden)count++;
    }
    const truncated=panel.dataset.recordsTruncated==='true';
    const limit=panel.dataset.recordLimit||'500';
    panel.querySelector('[data-social-account-count]').textContent='표시 '+count+' / 조회된 '+rows.length+'건'+
      (truncated?' · 최근 '+limit+'건까지만 조회됨 (전체 건수 아님)':'');
    panel.querySelector('[data-social-account-empty]').hidden=count!==0||rows.length===0;
  }

  const serviceMarks={youtube:'YT',facebook:'f',instagram:'IG',threads:'@',naver:'N',kakao:'K',tiktok:'TT',x:'X',linkedin:'in',pinterest:'P',bluesky:'B',discord:'D',telegram:'TG'};
  function filterProviders(panel){
    const search=(panel.querySelector('[data-social-search]')?.value||'').trim().toLocaleLowerCase();
    const filter=panel.querySelector('[data-social-filter]')?.value||'all';
    const cards=[...panel.querySelectorAll('[data-social-provider-card]')];
    let visible=0;
    for(const card of cards){
      const named=card.dataset.searchText.includes(search);
      const registered=Number(card.dataset.registered)>0;
      const existing=Number(card.dataset.existing)>0;
      const matches=filter==='all'||(filter==='existing'&&existing)||(filter==='registered'&&registered)||(filter==='unregistered'&&!registered&&!existing);
      card.hidden=!(named&&matches);
      if(!card.hidden)visible++;
    }
    panel.querySelector('[data-social-result-count]').textContent='표시 '+visible+' / 전체 '+cards.length;
    panel.querySelector('[data-social-empty]').hidden=visible!==0;
  }
  function render(panel,data){
    const policy=data.policy||{};
    panel.querySelector('[data-social-feature]').textContent=policy.registrationEnabled
      ?'외부 채널 메타데이터 등록: 제한적 허용 · 채널 OAuth·자동게시: 비활성화'
      :'외부 채널 신규 등록: 비활성화 · 채널 OAuth·자동게시: 비활성화 (회원 로그인 정책은 별도)';
    panel.querySelector('[data-social-policy-label]').textContent=policy.registrationEnabled?'제한적 등록 요청 허용':'안전 잠금 유지';
    panel.querySelector('[data-social-storage]').textContent=data.storageReady
      ?'등록 원장 조회 가능':'등록 원장 조회 불가 — DB 배포·연결 확인 필요';
    const providers=data.providers||[];
    const links=data.accounts||[];
    const legacy=data.existingServiceConnections||[];
    panel.querySelector('[data-social-metrics]').replaceChildren(
      metric('연결 대상 서비스',providers.length),
      metric('조회된 신규 등록 기록',links.length),
      metric('조회된 기존 서비스 기록',legacy.length),
      metric('새 연결 활성화',policy.oauthLinkingEnabled?'설정됨':'차단')
    );
    const wrap=panel.querySelector('[data-social-providers]');wrap.replaceChildren();
    for(const item of providers){
      const card=el('article','','ekodi-social-card');
      card.dataset.socialProviderCard='true';
      card.dataset.searchText=String(item.name||item.id||'').toLocaleLowerCase();
      card.dataset.registered=String(item.registered||0);
      card.dataset.existing=String(item.existingService||0);
      const head=el('div','','ekodi-social-card-head');
      head.append(el('span',serviceMarks[item.id]||String(item.name||'?').slice(0,2),'ekodi-social-provider-mark'),el('span',stateText[item.status]||'비활성화','ekodi-social-badge'));
      const counts=el('div','','ekodi-social-card-counts');
      counts.append(el('small','신규 등록 '+(item.registered||0)),el('small','기존 서비스 '+(item.existingService||0)));
      card.append(head,el('strong',item.name||item.id||'미확인'),counts);
      wrap.append(card);
    }
    renderRows(panel.querySelector('[data-social-links]'),links,'identity');
    renderRows(panel.querySelector('[data-social-existing]'),legacy,'existing');
    panel.dataset.recordsTruncated=String(data.recordsTruncated===true);
    panel.dataset.recordLimit=String(Number(data.recordLimit)||500);
    filterProviders(panel);
    filterAccounts(panel);
  }
  async function install(){
    if(document.getElementById(ROOT))return;
    if(!document.getElementById('ekodi-social-account-css')){const style=document.createElement('link');style.id='ekodi-social-account-css';style.rel='stylesheet';style.href='/admin/social-account-admin.css';document.head.append(style)}
    const content=document.querySelector('.content');
    if(!content)return;
    const panel=el('section','','section ekodi-social-accounts hidden-panel');
    panel.id=ROOT;panel.dataset.panel='social-accounts';panel.dataset.adminListLayout='dashboard';panel.hidden=true;
    panel.innerHTML=[
      '<header class="ekodi-social-head">',
        '<div class="ekodi-social-heading"><p class="ekodi-social-caption">EKODI ORCHESTRATOR · EXTERNAL CHANNELS</p>',
        '<h2>외부 채널 계정 현황</h2><p>유튜브·인스타그램 등의 운영 계정을 EKODI ID별로 조회합니다. 회원 로그인(Google·네이버·카카오)은 EKODI 통합 인증에서 별도로 관리합니다.</p></div>',
        '<button type="button" class="ekodi-social-refresh" data-social-refresh>↻ 새로고침</button>',
      '</header>',
      '<div class="ekodi-social-state" role="note"><span class="ekodi-social-lock-mark" aria-hidden="true">●</span>',
        '<div><strong data-social-policy-label>안전 잠금 유지</strong><p data-social-feature>외부 채널 등록 기능 비활성화</p>',
        '<small data-social-storage role="status">등록 원장 상태 확인 전</small></div></div>',
      '<div class="ekodi-social-metrics" data-social-metrics aria-label="소셜계정 요약 현황"></div>',
      '<section class="ekodi-social-directory" aria-labelledby="ekodiSocialProvidersTitle">',
        '<div class="ekodi-social-section-head"><div><h3 id="ekodiSocialProvidersTitle">지원 예정 외부 채널 서비스</h3>',
        '<p>표시된 상태는 기록 기준이며 실제 공급자 인증 상태와 다를 수 있습니다.</p></div>',
        '<span class="ekodi-social-result-count" data-social-result-count>조회 중</span></div>',
        '<div class="ekodi-social-toolbar">',
          '<label class="ekodi-social-search-wrap"><span>서비스 검색</span>',
          '<input type="search" data-social-search autocomplete="off" placeholder="서비스 이름 검색"></label>',
          '<label class="ekodi-social-filter-wrap"><span>상태 필터</span>',
          '<select data-social-filter><option value="all">전체 서비스</option>',
          '<option value="existing">기존 서비스 기록 있음</option>',
          '<option value="registered">EKODI ID 등록 있음</option>',
          '<option value="unregistered">기록 없음</option></select></label>',
        '</div>',
        '<div class="ekodi-social-grid" data-social-providers></div>',
        '<p class="ekodi-social-empty" data-social-empty hidden>조건에 맞는 서비스가 없습니다. 검색어나 필터를 변경하세요.</p>',
      '</section>',
      '<div class="ekodi-social-account-toolbar" aria-label="계정 기록 검색 및 필터">',
        '<label><span>외부 채널 계정 검색</span><input type="search" data-social-account-search autocomplete="off" placeholder="EKODI ID·외부 ID·서비스 검색"></label>',
        '<label><span>연결 출처</span><select data-social-account-source>',
          '<option value="all">전체</option><option value="identity">EKODI ID 등록</option>',
          '<option value="existing">기존 서비스</option></select></label>',
        '<label><span>계정 상태</span><select data-social-account-filter>',
          '<option value="all">전체 상태</option><option value="pending_provider_verification">공급자 인증 대기</option>',
          '<option value="disabled">비활성화</option><option value="revoked">해제</option>',
          '<option value="active">기존 서비스 활성</option><option value="paused">기존 서비스 중지</option>',
          '<option value="reconnect_required">재연결 필요</option><option value="error">오류</option>',
          '<option value="unknown">미확인</option></select></label>',
      '</div>',
      '<p class="ekodi-social-account-count" data-social-account-count role="status">계정별 기록 조회 전</p>',
      '<p class="ekodi-social-account-empty" data-social-account-empty hidden>선택한 조건에 맞는 계정 기록이 없습니다.</p>',
      '<div class="ekodi-social-lower">',
        '<section class="ekodi-social-list" aria-labelledby="ekodiSocialLinksTitle"><h3 id="ekodiSocialLinksTitle">EKODI ID별 외부 채널 등록 기록</h3>',
        '<p>공급자 본인 확인 전에는 연결 완료가 아닙니다. 이 화면에서는 활성화할 수 없습니다.</p>',
        '<div class="ekodi-social-records" data-social-links></div></section>',
        '<section class="ekodi-social-list" aria-labelledby="ekodiSocialExistingTitle"><h3 id="ekodiSocialExistingTitle">기존 사이트·채널 연결</h3>',
        '<p>기존 연동 기록을 별도로 표시합니다. 신규 소셜계정 등록 기능과는 구분됩니다.</p>',
        '<div class="ekodi-social-records" data-social-existing></div></section>',
      '</div>',
      '<p class="ekodi-social-message" data-social-message role="status" aria-live="polite"></p>'
    ].join('')
    content.append(panel);
    panel.querySelector('[data-social-refresh]').addEventListener('click',()=>{void load()});
    panel.querySelector('[data-social-search]').addEventListener('input',()=>filterProviders(panel));
    panel.querySelector('[data-social-filter]').addEventListener('change',()=>filterProviders(panel));
    panel.querySelector('[data-social-account-search]').addEventListener('input',()=>filterAccounts(panel));
    panel.querySelector('[data-social-account-source]').addEventListener('change',()=>filterAccounts(panel));
    panel.querySelector('[data-social-account-filter]').addEventListener('change',()=>filterAccounts(panel));
    window.addEventListener('ekodi-admin-section-changed',event=>{if(event.detail?.section==='social-accounts')void load()});
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{feature:'social-accounts'}}));
    if(location.pathname==='/admin/accounts/social-accounts')void load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else void install();
})();
