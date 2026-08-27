(() => {
  'use strict';
  const API='https://api.ekodi.kr/api/service-demands';
  const LOCAL_KEY='ekodi.my.unmetNeeds.v1';
  const ROUTES=[
    {intent:'marketing',services:['marketing','social'],re:/(홍보|마케팅|광고|sns|콘텐츠|marketing|advertis)/i},
    {intent:'publishing',services:['publishing','author','books'],re:/(출판|전자책|책\s*만들|원고|epub|작가|publish)/i},
    {intent:'career',services:['work','edu'],re:/(취업|채용|진로|이력서|면접|career|job)/i},
    {intent:'energy',services:['energy'],re:/(전기|전기료|전기세|에너지|태양광|energy|전력)/i},
    {intent:'education',services:['edu','lab'],re:/(교육|학습|강의|수업|입시|유학|연구|education|learn|study)/i},
    {intent:'ministry',services:['bible','church','community'],re:/(교회|사역|예배|성경|말씀|기도|church|ministry|bible)/i},
    {intent:'commerce',services:['biz','business','mall','trade','pay'],re:/(사업|창업|판매|쇼핑몰|상품|결제|주문|무역|business|commerce|shop|trade)/i},
    {intent:'support',services:['support'],re:/(지원금|보조금|장학금|사업공고|정부지원|grant|subsid)/i},
    {intent:'finance',services:['money','invest','pay'],re:/(돈|재무|자금|투자|통장|자동이체|finance|money|invest)/i},
    {intent:'communication',services:['messenger','community','social'],re:/(메시지|연락|소통|모임|그룹|messenger|message)/i},
  ];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function readLocal(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]')}catch{return[]}}
  function saveLocal(items){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(items.slice(-30)))}catch{}}
  function rememberNeed(query,intent){const items=readLocal().filter(x=>x.query!==query);items.push({query,intent,createdAt:new Date().toISOString(),status:'requested'});saveLocal(items)}
  function findRoute(query,services){
    const rule=ROUTES.find(item=>item.re.test(query));
    if(rule){const matches=rule.services.map(id=>services.find(s=>s.id===id)).filter(Boolean);return{intent:rule.intent,matches};}
    const words=query.toLowerCase().replace(/[^0-9a-z가-힣\s]/g,' ').split(/\s+/).filter(w=>w.length>1);
    const scored=services.map(service=>{
      const hay=[service.id,service.name,service.shortName,service.group,...(service.capabilities||[])].join(' ').toLowerCase();
      return{service,score:words.reduce((n,w)=>n+(hay.includes(w)?1:0),0)};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.service);
    return{intent:'other',matches:scored};
  }
  function serviceLink(service){
    const target=service.url||'#';
    if(service.openSso===true)return `https://auth.ekodi.kr/?site=${encodeURIComponent(service.id)}&return_to=${encodeURIComponent(target)}`;
    return target;
  }

  function installDisclosure(sectionId,label){
    const section=document.getElementById(sectionId); if(!section||section.dataset.needDisclosure==='true')return;
    section.dataset.needDisclosure='true';
    const head=section.querySelector('.section-head'); if(!head)return;
    const body=[...section.children].filter(node=>node!==head);
    body.forEach(node=>node.hidden=true);
    const button=document.createElement('button');button.type='button';button.className='ghost need-disclosure';button.textContent=label;
    button.addEventListener('click',()=>{const opening=body.some(node=>node.hidden);body.forEach(node=>node.hidden=!opening);button.textContent=opening?'접기':label;});
    head.append(button);
  }

  async function record(query,intent){
    rememberNeed(query,intent);
    const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestText:query,intent,userSegment:'person',source:'my'}),cache:'no-store'});
    if(!response.ok)throw new Error(`Demand API ${response.status}`);
    return response.json();
  }

  async function install(){
    if(document.getElementById('need-router'))return;
    const welcome=document.querySelector('.welcome-shell'); if(!welcome)return;
    let services=[];
    try{const response=await fetch('/service-manifest.json',{cache:'no-store'});const data=await response.json();services=(data.services||[]).filter(s=>s.state!=='planned');}catch{}
    const section=document.createElement('section');section.id='need-router';section.className='section need-router-section';
    section.innerHTML=`<div class="need-router-head"><p class="eyebrow">NEED FIRST · EKODI SERVICE ROUTER</p><h2>지금 무엇이 필요하세요?</h2><p>서비스 이름을 몰라도 괜찮습니다. 하고 싶은 일을 말하면 지금 이용할 수 있는 길만 보여드립니다.</p></div>
      <form id="needRouterForm" class="need-router-form"><label for="needQuery" class="sr-only">필요한 일</label><input id="needQuery" maxlength="500" autocomplete="off" placeholder="예: 가게 홍보를 시작하고 싶어요" required><button class="primary" type="submit">길 찾기</button></form>
      <div class="need-prompts" aria-label="빠른 예시"><button type="button" data-need="가게 홍보를 하고 싶어요">홍보</button><button type="button" data-need="원고를 책으로 만들고 싶어요">책 만들기</button><button type="button" data-need="전기요금을 줄이고 싶어요">전기요금</button><button type="button" data-need="지원금이나 보조금을 찾고 싶어요">지원기회</button><button type="button" data-need="취업과 진로를 준비하고 싶어요">취업·진로</button></div>
      <div id="needRouterResult" class="need-router-result" aria-live="polite"><p>필요를 입력하면 전체 서비스 목록 대신 관련된 선택지만 꺼내 보여드립니다.</p></div>`;
    welcome.insertAdjacentElement('afterend',section);
    document.querySelectorAll('.topbar nav a[href="#workspaces"],.topbar nav a[href="#platforms"]').forEach(a=>a.hidden=true);
    const nav=document.querySelector('.topbar nav');
    if(nav&&!nav.querySelector('a[href="#need-router"]')){const a=document.createElement('a');a.href='#need-router';a.textContent='필요 찾기';nav.prepend(a);}
    installDisclosure('workspaces','내 공간 보기');
    installDisclosure('platforms','전체 서비스 보기');

    const form=section.querySelector('#needRouterForm'),input=section.querySelector('#needQuery'),result=section.querySelector('#needRouterResult');
    section.querySelectorAll('[data-need]').forEach(button=>button.addEventListener('click',()=>{input.value=button.dataset.need||'';form.requestSubmit();}));
    form.addEventListener('submit',async event=>{
      event.preventDefault(); const query=input.value.trim(); if(query.length<2)return;
      const routed=findRoute(query,services);
      if(routed.matches.length){
        result.innerHTML=`<div class="need-result-copy"><small>${esc(routed.intent.toUpperCase())}</small><strong>이 일에는 ${routed.matches.length}개의 길이 잘 맞습니다.</strong><span>필요한 것만 골라 바로 시작하세요.</span></div><div class="need-result-services">${routed.matches.map(service=>`<a href="${esc(serviceLink(service))}"><strong>${esc(service.name)}</strong><span>${esc((service.capabilities||[]).slice(0,3).join(' · '))}</span><b>시작 →</b></a>`).join('')}</div>`;
        const unresolved=readLocal().map(item=>routed.matches.some(s=>ROUTES.find(r=>r.intent===item.intent)?.services.includes(s.id))?{...item,status:'available'}:item);saveLocal(unresolved);
        return;
      }
      result.innerHTML='<p class="need-recording">현재 바로 연결할 전문서비스를 찾지 못했습니다. 이 필요를 내부 수요로 기록하고 있습니다.</p>';
      try{await record(query,routed.intent);result.innerHTML='<div class="need-result-copy"><small>DEMAND RECORDED</small><strong>요청하신 필요를 기록했습니다.</strong><span>지금 가능한 가까운 방법을 계속 찾고, 서비스가 생기면 My EKODI에서 다시 발견할 수 있도록 연결합니다.</span></div>';}catch{result.innerHTML='<div class="need-result-copy"><small>LOCAL CHECKPOINT</small><strong>이 브라우저에는 필요를 기록했습니다.</strong><span>중앙 수요 저장 연결이 불안정해 서버 집계는 완료되지 않았습니다. 다시 시도할 수 있습니다.</span></div>';}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
