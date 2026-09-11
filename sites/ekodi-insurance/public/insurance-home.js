(() => {
  const basics=[
    ['🧭','보험이란?','우연한 위험으로 생길 수 있는 경제적 손실을 여러 가입자가 보험료로 나누어 대비합니다.','insurance-basics'],
    ['🧾','보험료와 보험금','내는 보험료와 약관에 따라 받는 보험금은 서로 다른 개념입니다.','premium-benefit'],
    ['🛡️','보장·면책·한도','무엇을 보장하는지와 함께 보장하지 않는 경우, 자기부담금, 지급한도를 봅니다.','coverage-exclusions'],
    ['🔄','갱신·만기·해지','갱신 여부, 보장기간, 납입기간과 중도해지 조건을 확인합니다.','renewal-cancel'],
    ['👥','계약자·피보험자·수익자','보험료를 내는 사람, 보장의 대상, 보험금을 받을 사람이 다를 수 있습니다.','parties'],
    ['📌','고지·통지의무','가입 전 질문사항과 계약 후 중요한 변경사항을 약관에 따라 정확히 알립니다.','disclosure']
  ];
  const products=[
    ['🚗','자동차보험','의무보험과 선택 보장, 사고·차량 관련 위험을 이해합니다.','auto','/insurance/car'],
    ['🏥','실손의료보험','실제 부담한 의료비와 자기부담금 기준을 살펴봅니다.','medical','/insurance/medical'],
    ['❤️','건강·질병보험','진단·수술·입원 등 질병 위험의 보장구조를 확인합니다.','health'],
    ['🦺','상해보험','우연한 사고로 인한 상해 위험을 중심으로 살펴봅니다.','accident'],
    ['👨‍👩‍👧','생명·사망보험','사망·생존·가족의 경제적 위험에 대비하는 구조입니다.','life','/insurance/life'],
    ['🚘','운전자보험','운전자 개인의 약관상 법률비용·상해 보장을 확인합니다.','driver','/insurance/driver'],
    ['🏠','화재·재산보험','주택·상가·시설·재산의 손해 위험을 다룹니다.','property','/insurance/property'],
    ['⚖️','배상책임보험','타인에게 법률상 손해배상책임을 부담할 위험을 다룹니다.','liability','/insurance/liability'],
    ['✈️','여행보험','여행 중 상해·질병·휴대품·배상책임 등 단기 위험을 봅니다.','travel'],
    ['🌱','연금·저축성보험','노후자금·장기저축의 적립·환급 구조를 확인합니다.','savings','/insurance/pension'],
    ['🐾','생활형 보험','어린이·펫·레저 등 생활상황별 보장의 기본을 확인합니다.','lifestyle'],
    ['📚','보험 용어사전','약관에서 자주 만나는 핵심 보험용어를 쉽게 확인합니다.','glossary']
  ];
  const STAGING_API='https://ekodi-insurance-api-staging.ekodi-development.workers.dev';
  const PROD_API='https://insurance-api.ekodi.kr';
  const production=location.hostname==='ekodi.kr';
  const API=production?PROD_API:STAGING_API;

  function fallbackDetail(slug){return `/guide/insurance/${encodeURIComponent(slug)}`;}
  function card(item,product=false){
    const [icon,title,summary,slug,canonical]=item;
    const a=document.createElement('a');
    a.className='info-card';
    a.href=canonical||(product?fallbackDetail(slug):fallbackDetail(slug));
    a.innerHTML='<span class="icon" aria-hidden="true"></span><strong></strong><small></small><span class="more">자세히 보기 →</span>';
    a.querySelector('.icon').textContent=icon;
    a.querySelector('strong').textContent=title;
    a.querySelector('small').textContent=summary;
    return a;
  }
  function renderCards(){
    document.querySelector('#basicGrid')?.append(...basics.map(item=>card(item)));
    document.querySelector('#productGrid')?.append(...products.map(item=>card(item,true)));
  }
  function safeLink(url){try{const parsed=new URL(url);return parsed.protocol==='https:'?parsed.toString():''}catch{return''}}
  async function renderAdvisor(){
    const host=document.querySelector('#advisorDirectory');
    if(!host)return;
    try{
      const response=await fetch(`${API}/api/advisor/profile`,{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.profile)throw new Error('no public advisor');
      const profile=data.profile;
      const affiliations=Array.isArray(data.affiliations)?data.affiliations:[];
      host.replaceChildren();
      const article=document.createElement('article');
      article.className='advisor-card';
      const insurerNames=[profile.insurerName,...affiliations.map(item=>item.carrierName)].filter(Boolean);
      const unique=[...new Set(insurerNames)];
      article.innerHTML='<small>등록·검증된 공개 설계사</small><h3></h3><p class="insurers"></p><p>보험사별 상품·특약·서비스·가입조건처럼 공통 설명을 넘어서는 내용은 설계사 페이지에서 확인합니다.</p><div class="links"></div>';
      article.querySelector('h3').textContent=profile.displayName||'보험설계사';
      article.querySelector('.insurers').textContent=unique.join(' · ')||profile.roleLabel||'';
      const links=article.querySelector('.links');
      const advisor=document.createElement('a');advisor.href='/insurance/advisors/'+encodeURIComponent(profile.slug||'primary');advisor.textContent='설계사 안내 →';links.append(advisor);
      const verify=safeLink(profile.verificationUrl);if(verify){const a=document.createElement('a');a.href=verify;a.target='_blank';a.rel='noopener noreferrer';a.textContent='모집인 확인 ↗';links.append(a)}
      host.append(article);
    }catch(error){
      host.innerHTML='<div class="empty">현재 공개·검증 절차를 통과한 보험사·설계사 정보만 표시합니다.</div>';
    }
  }
  async function renderLawStatus(){
    const el=document.querySelector('#lawStatus');if(!el)return;
    try{const response=await fetch('/insurance-law-sources.json',{cache:'no-store'});const data=await response.json();el.textContent=`기준 확인일 ${data.lastVerifiedAt||'검증 관리 중'}`;}catch{el.textContent='공식 원문 검증 관리 중';}
  }
  renderCards();renderAdvisor();renderLawStatus();
})();