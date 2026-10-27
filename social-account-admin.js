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
    status.classList.remove('ekodi-social-error');
    status.textContent='EKODI 인증 및 연결 현황을 확인하고 있습니다.';
    try{
      if(!await authenticatedSuperAdmin())throw new Error('최고관리자 인증이 필요합니다.');
      const res=await fetch(ENDPOINT,{headers:{authorization:'Bearer '+sessionToken()},cache:'no-store'});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||'연결 현황을 불러올 수 없습니다.');
      render(panel,data);
      status.textContent='조회 시각: '+new Date().toLocaleString('ko-KR')+' · 계정 연결 검증은 별도이며 이 표는 기록 기준입니다.';
    }catch(error){
      status.textContent=error?.message||'상태 조회에 실패했습니다.';
      status.classList.add('ekodi-social-error');
      panel.querySelector('[data-social-metrics]').replaceChildren();
      panel.querySelector('[data-social-providers]').replaceChildren();
      panel.querySelector('[data-social-links]').replaceChildren();
      panel.querySelector('[data-social-existing]').replaceChildren();
    }finally{busy=false}
  }
  function metric(label,value){
    const card=el('article');card.append(el('small',label),el('strong',String(value)));return card;
  }
  function renderRows(target,rows,kind){
    target.replaceChildren();
    if(!rows.length){target.append(el('p',kind==='identity'?'아직 등록된 EKODI 소셜계정 기록이 없습니다.':'기존 서비스 연결 기록이 없습니다.'));return}
    for(const account of rows){
      const row=el('article','','ekodi-social-record');
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
  function render(panel,data){
    const policy=data.policy||{};
    panel.querySelector('[data-social-feature]').textContent=policy.registrationEnabled
      ?'EKODI 인증 후 등록 요청: 제한적 허용 · 외부 공급자 인증과 자동게시: 비활성화'
      :'EKODI 인증 후 신규 등록: 비활성화 · 외부 소셜 로그인·OAuth·자동게시: 비활성화';
    panel.querySelector('[data-social-storage]').textContent=data.storageReady
      ?'등록 원장 조회 가능':'등록 원장 조회 불가 — DB 배포·연결 확인 필요';
    const providers=data.providers||[];
    const links=data.accounts||[];
    const legacy=data.existingServiceConnections||[];
    panel.querySelector('[data-social-metrics]').replaceChildren(
      metric('연결 대상 서비스',providers.length),
      metric('신규 등록 기록',links.length),
      metric('기존 서비스 연결 기록',legacy.length),
      metric('새 연결 활성화',policy.oauthLinkingEnabled?'설정됨':'차단')
    );
    const wrap=panel.querySelector('[data-social-providers]');wrap.replaceChildren();
    for(const item of providers){
      const card=el('article','','ekodi-social-card');
      card.append(el('strong',item.name),el('span',stateText[item.status]||'비활성화','ekodi-social-badge'),
        el('small','EKODI 등록 '+(item.registered||0)+'건 · 기존 서비스 '+(item.existingService||0)+'건'));
      wrap.append(card);
    }
    renderRows(panel.querySelector('[data-social-links]'),links,'identity');
    renderRows(panel.querySelector('[data-social-existing]'),legacy,'existing');
  }
  async function install(){
    if(document.getElementById(ROOT))return;
    if(!document.getElementById('ekodi-social-account-css')){const style=document.createElement('link');style.id='ekodi-social-account-css';style.rel='stylesheet';style.href='/admin/social-account-admin.css';document.head.append(style)}
    const content=document.querySelector('.content');
    if(!content)return;
    const panel=el('section','','section ekodi-social-accounts hidden-panel');
    panel.id=ROOT;panel.dataset.panel='social-accounts';panel.hidden=true;
    panel.innerHTML='<div class="ekodi-social-head"><div><p class="ekodi-social-caption">EKODI ORCHESTRATOR · IDENTITY CONTROL</p><h2>소셜계정 연결 현황</h2><p>EKODI 계정 ID가 기본 신원입니다. 공급자 소셜계정은 본인 인증 뒤에만 연결되며 현재는 신규 연결과 자동활동이 차단되어 있습니다.</p></div><button type="button" data-social-refresh>새로고침</button></div><div class="ekodi-social-state" data-social-feature>등록 기능 비활성화</div><p data-social-storage role="status">등록 원장 상태 확인 전</p><div class="ekodi-social-metrics" data-social-metrics></div><section><h3>지원 예정 소셜 서비스</h3><div class="ekodi-social-grid" data-social-providers></div></section><section class="ekodi-social-list"><h3>EKODI ID 기준 등록 기록</h3><p>등록이 허용되어도 외부 공급자 본인 확인 전에는 연결 완료가 아닙니다. 이곳에서는 활성화할 수 없습니다.</p><div class="ekodi-social-records" data-social-links></div></section><section class="ekodi-social-list"><h3>기존 사이트·채널 연결</h3><p>기존 업무·채널 연동 기록을 별도로 표시합니다. 기존의 연결 상태가 새 소셜계정 등록 기능을 활성화한다는 뜻은 아닙니다.</p><div class="ekodi-social-records" data-social-existing></div></section><p data-social-message role="status" aria-live="polite"></p>';
    content.append(panel);
    panel.querySelector('[data-social-refresh]').addEventListener('click',()=>{void load()});
    window.addEventListener('ekodi-admin-section-changed',event=>{if(event.detail?.section==='social-accounts')void load()});
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{feature:'social-accounts'}}));
    if(location.pathname==='/admin/accounts/social-accounts')void load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else void install();
})();
