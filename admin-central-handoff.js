// Shared admin redeploy marker: fast session + deferred finance readiness.
(()=>{
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const token=hash.get('ekodi_admin_token');
  if(token){
    sessionStorage.setItem('ekodi-auth-token',token);
    history.replaceState({},document.title,location.pathname+location.search);
  }
  const form=document.querySelector('#loginForm');
  if(form)form.hidden=true;
  const legacy=document.querySelector('.login-screen .legacy-link');
  if(legacy)legacy.hidden=true;
  const card=document.querySelector('.login-card');
  if(card&&!document.querySelector('#centralAdminLogin')){
    const link=document.createElement('a');
    link.id='centralAdminLogin';
    link.className='primary full';
    link.href='https://auth.ekodi.kr/?site=admin&return_to=https%3A%2F%2Fadmin.ekodi.kr%2F';
    link.textContent='EKODI 통합인증센터로 관리자 로그인';
    link.style.display='block';link.style.textAlign='center';link.style.textDecoration='none';
    const copy=document.createElement('p');copy.className='login-copy';copy.textContent='관리자 계정은 통합인증센터에서 Google 관리자 허용목록을 별도로 확인합니다.';
    form?.insertAdjacentElement('beforebegin',copy);copy.insertAdjacentElement('afterend',link);
  }

  function hideLegacyReset(){
    const reset=document.querySelector('#passwordResetToggle');if(reset)reset.hidden=true;
    const resetForm=document.querySelector('#passwordResetForm');if(resetForm)resetForm.hidden=true;
    if(form)form.hidden=true;
    return Boolean(reset||resetForm);
  }
  if(card&&!hideLegacyReset()){
    const observer=new MutationObserver(()=>{if(hideLegacyReset())observer.disconnect();});
    observer.observe(card,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),1200);
  }

  function keyStatusCell(label,id){
    const item=document.createElement('div');item.className='payment-key-item';
    const small=document.createElement('small');small.textContent=label;
    const strong=document.createElement('strong');strong.id=id;strong.textContent='Finance 대기';
    item.append(small,strong);return item;
  }
  function ensurePaymentKeyPanel(){
    let panel=document.querySelector('#paymentKeyStatusPanel');
    if(panel)return panel;
    const financeTitle=document.querySelector('#financeTitle');
    const section=financeTitle?.closest('section');
    const status=section?.querySelector('.finance-status');
    if(!section||!status)return null;

    panel=document.createElement('section');
    panel.id='paymentKeyStatusPanel';
    panel.className='payment-key-panel';
    panel.setAttribute('aria-labelledby','paymentKeyStatusTitle');

    const head=document.createElement('div');head.className='payment-key-head';
    const titleBox=document.createElement('div');
    const kicker=document.createElement('p');kicker.className='kicker';kicker.textContent='PAYMENT KEY READINESS';
    const title=document.createElement('h3');title.id='paymentKeyStatusTitle';title.textContent='결제 키 연결 상태';
    const subtitle=document.createElement('p');subtitle.textContent='키 원문은 표시하지 않고 Finance가 이미 가져온 준비 상태를 재사용합니다.';
    titleBox.append(kicker,title,subtitle);
    const overall=document.createElement('span');overall.id='paymentKeyOverall';overall.className='payment-key-badge';overall.textContent='Finance 대기';
    head.append(titleBox,overall);

    const grid=document.createElement('div');grid.className='payment-key-grid';
    grid.append(
      keyStatusCell('Toss 서버키','paymentServerKey'),
      keyStatusCell('운영 모드','paymentKeyMode'),
      keyStatusCell('Toss MID','paymentMid'),
      keyStatusCell('결제 도메인','paymentDomain'),
      keyStatusCell('웹훅','paymentWebhook'),
      keyStatusCell('보안 경계','paymentKeySecurity')
    );

    const note=document.createElement('p');note.id='paymentKeyStatusNote';note.className='payment-key-note';note.textContent='Finance 화면을 열면 같은 응답으로 결제 키 상태를 표시합니다.';
    const checked=document.createElement('small');checked.id='paymentKeyChecked';checked.className='payment-key-checked';checked.textContent='';
    panel.append(head,grid,note,checked);
    status.insertAdjacentElement('afterend',panel);
    return panel;
  }
  function setKeyValue(id,text,state=''){
    const element=document.querySelector(`#${id}`);if(!element)return;
    element.textContent=text;
    element.classList.remove('finance-ready','finance-warn');
    if(state)element.classList.add(state);
  }
  function renderPaymentKeyStatus(data){
    const panel=ensurePaymentKeyPanel();
    if(!panel||!data)return;
    const readiness=data.readiness||{};
    const secret=Boolean(readiness.tossSecretConfigured);
    const live=Boolean(readiness.tossLiveKey);
    const mid=Boolean(readiness.tossMidConfigured);
    const overall=document.querySelector('#paymentKeyOverall');
    overall?.classList.remove('ready','warn');

    if(!secret){
      if(overall){overall.textContent='키 연결 필요';overall.classList.add('warn');}
      setKeyValue('paymentServerKey','미연결','finance-warn');
      setKeyValue('paymentKeyMode','비활성','finance-warn');
    }else if(live){
      if(overall){overall.textContent='라이브 연결';overall.classList.add('ready');}
      setKeyValue('paymentServerKey','연결됨','finance-ready');
      setKeyValue('paymentKeyMode','LIVE','finance-ready');
    }else{
      if(overall){overall.textContent='서버키 연결 · 모드 확인';overall.classList.add('warn');}
      setKeyValue('paymentServerKey','연결됨','finance-ready');
      setKeyValue('paymentKeyMode','TEST / 확인 필요','finance-warn');
    }
    setKeyValue('paymentMid',mid?'연결됨':'미연결',mid?'finance-ready':'finance-warn');
    setKeyValue('paymentDomain',(readiness.paymentDomain||'https://pay.ekodi.kr').replace('https://',''));
    setKeyValue('paymentWebhook',(readiness.webhookUrl||'https://finance-api.ekodi.kr/webhooks/toss').replace('https://',''));
    setKeyValue('paymentKeySecurity','원문 비노출 · Worker Secret','finance-ready');

    const note=document.querySelector('#paymentKeyStatusNote');
    if(note){
      if(!secret)note.textContent='Toss 서버키가 연결되기 전에는 결제 동기화가 자동으로 차단됩니다. 키는 GitHub/Cloudflare 비밀 저장소에서만 관리합니다.';
      else if(!live)note.textContent='서버키는 연결되어 있습니다. 라이브 키 여부를 확인한 뒤 실결제 운영으로 전환하세요. 키 원문은 관리자 화면에 노출되지 않습니다.';
      else if(!mid)note.textContent='라이브 서버키는 연결되어 있습니다. MID를 함께 연결하면 결제 계정 식별과 운영 점검이 더 명확해집니다.';
      else note.textContent='라이브 서버키와 MID가 연결되어 있습니다. 결제 키 원문은 브라우저와 소스코드에 노출되지 않습니다.';
    }
    const checked=document.querySelector('#paymentKeyChecked');
    if(checked)checked.textContent=`마지막 확인 ${new Date().toLocaleString('ko-KR')}`;
  }

  // Do not build Finance-specific DOM during every admin visit. Finance Monitor emits
  // this event only after the administrator actually opens Finance and data is available.
  window.addEventListener('ekodi-finance-overview',event=>renderPaymentKeyStatus(event.detail));
})();