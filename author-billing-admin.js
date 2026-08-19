(() => {
  'use strict';

  const API='https://api.ekodi.kr';
  const TOKEN_KEY='ekodi-auth-token';
  let mounted=false;

  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||'';}catch{return '';}}
  function headers(json=false){const value=token();const result=value?{authorization:`Bearer ${value}`}:{ };if(json)result['content-type']='application/json';return result;}
  async function request(path,options={}){const response=await fetch(`${API}${path}`,{...options,headers:{...headers(Boolean(options.body)),...(options.headers||{})},cache:'no-store'});const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={};}if(!response.ok)throw Object.assign(new Error(data.error||`HTTP ${response.status}`),{status:response.status,data});return data;}
  function won(value){return `${Number(value||0).toLocaleString('ko-KR')}원`;}

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

    const note=document.createElement('p');note.id='paymentKeyStatusNote';note.className='payment-key-note';note.textContent='Finance 데이터를 불러오면 같은 응답으로 결제 키 상태를 표시합니다.';
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

  // This listener exists only after Finance is opened because this whole file is demand-loaded.
  // Finance Monitor owns the single overview request and shares its already-fetched readiness data.
  window.addEventListener('ekodi-finance-overview',event=>renderPaymentKeyStatus(event.detail));

  function install(){
    if(mounted||!token())return;
    const finance=document.querySelector('[data-panel~="finance"]');
    if(!finance)return;
    mounted=true;
    const panel=document.createElement('section');
    panel.className='author-billing-admin';
    panel.id='authorBillingAdmin';
    panel.innerHTML=`
      <div class="author-billing-admin-head">
        <div><small>CREATOR AI · PRICING</small><h3>Creator AI 유료회원 요금</h3></div>
        <button type="button" class="secondary compact" data-author-billing-refresh>↻ 새로고침</button>
      </div>
      <div class="author-billing-admin-status" data-author-billing-status>요금제와 결제상태를 확인하고 있습니다.</div>
      <div class="author-billing-admin-grid" data-author-billing-grid></div>
      <div class="author-billing-admin-actions"><button type="button" class="primary compact" data-author-billing-save>요금 설정 저장</button></div>
      <p class="author-billing-admin-note">가격 변경은 새 구독에 적용됩니다. 이미 결제 중인 회원의 현재 월 약정금액은 자동 변경하지 않습니다. 0원 또는 비활성 상태에서는 신규 결제가 시작되지 않습니다.</p>
    `;
    const marker=finance.querySelector('#financeNotice');
    if(marker)marker.insertAdjacentElement('afterend',panel);else finance.querySelector('.section-head')?.insertAdjacentElement('afterend',panel);
    panel.querySelector('[data-author-billing-refresh]')?.addEventListener('click',()=>load(panel).catch(error=>show(panel,error.message,'error')));
    panel.querySelector('[data-author-billing-save]')?.addEventListener('click',()=>save(panel).catch(error=>show(panel,error.message,'error')));
    load(panel).catch(error=>show(panel,error.message,'error'));
  }

  function show(panel,text,state=''){
    const el=panel.querySelector('[data-author-billing-status]');if(!el)return;el.textContent=text;el.dataset.state=state;
  }

  function renderPlan(plan){
    const card=document.createElement('article');card.className='author-billing-admin-plan';card.dataset.planId=plan.id;
    const identity=document.createElement('div');
    const name=document.createElement('strong');name.textContent=plan.label;
    const note=document.createElement('small');note.textContent=plan.id==='pro'?'월 500 AI units':'월 120 AI units';
    identity.append(name,note);
    const fields=document.createElement('div');
    const priceLabel=document.createElement('label');priceLabel.textContent='신규 구독 월 가격';
    const price=document.createElement('input');price.type='number';price.min='0';price.max='10000000';price.step='100';price.value=String(Number(plan.monthlyFee||0));price.dataset.price='true';priceLabel.append(price);
    const toggle=document.createElement('label');toggle.className='author-billing-admin-toggle';
    const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=Boolean(plan.enabled);enabled.dataset.enabled='true';
    toggle.append(enabled,document.createTextNode(' 신규 결제 활성'));
    fields.append(priceLabel,toggle);card.append(identity,fields);return card;
  }

  async function load(panel){
    show(panel,'Creator AI 요금제와 결제 연결상태를 불러오는 중입니다.');
    const data=await request('/api/author/billing/admin/plans');
    const grid=panel.querySelector('[data-author-billing-grid]');grid.replaceChildren(...(data.plans||[]).map(renderPlan));
    let subCount=0;let activeCount=0;
    try{const subscriptions=await request('/api/author/billing/admin/subscriptions');subCount=(subscriptions.subscriptions||[]).length;activeCount=(subscriptions.subscriptions||[]).filter(item=>item.paidAiActive).length;}catch{}
    if(!data.billingReady)show(panel,`요금 설정은 저장할 수 있지만 Toss 자동결제 계약키가 준비될 때까지 실제 신규 결제는 시작되지 않습니다. 구독 ${subCount}건 · 현재 유료 AI ${activeCount}명`,'warn');
    else show(panel,`Toss 자동결제 연결 정상 · 구독 ${subCount}건 · 현재 유료 AI ${activeCount}명`);
  }

  async function save(panel){
    const button=panel.querySelector('[data-author-billing-save]');button.disabled=true;button.textContent='저장 중…';
    try{
      const cards=[...panel.querySelectorAll('[data-plan-id]')];
      for(const card of cards){
        const planId=card.dataset.planId;
        const monthlyFee=Number(card.querySelector('[data-price]')?.value||0);
        const enabled=Boolean(card.querySelector('[data-enabled]')?.checked);
        if(!Number.isSafeInteger(monthlyFee)||monthlyFee<0)throw new Error(`${planId.toUpperCase()} 가격을 확인해 주세요.`);
        if(enabled&&monthlyFee<=0)throw new Error(`${planId.toUpperCase()} 신규 결제를 활성화하려면 1원 이상의 가격이 필요합니다.`);
        await request('/api/author/billing/admin/plans',{method:'PUT',body:JSON.stringify({planId,monthlyFee,enabled})});
      }
      show(panel,`요금 설정을 저장했습니다. 새 구독에는 현재 가격이 적용됩니다. (${cards.map(card=>`${card.dataset.planId.toUpperCase()} ${won(card.querySelector('[data-price]')?.value)}`).join(' · ')})`);
      await load(panel);
    }finally{button.disabled=false;button.textContent='요금 설정 저장';}
  }

  function ready(){if(document.documentElement.dataset.ekodiAdminReady==='true'||(!document.querySelector('#app')?.hidden&&token()))install();}
  window.addEventListener('ekodi-admin-ready',ready,{once:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
