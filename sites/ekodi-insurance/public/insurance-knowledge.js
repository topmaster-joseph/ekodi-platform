(() => {
  const basics=[
    ['🧭','보험이란?','예상하기 어려운 위험을 여러 사람이 보험료로 나누어 대비하는 제도입니다.','insurance-basics'],
    ['🧾','보험료와 보험금','보험료는 계약을 유지하기 위해 내는 금액이고, 보험금은 약관상 지급사유가 생겼을 때 받는 금액입니다.','premium-benefit'],
    ['🛡️','보장·면책·한도','무엇을 보장하는지뿐 아니라 보장하지 않는 경우, 자기부담금, 지급한도를 함께 확인해야 합니다.','coverage-exclusions'],
    ['🔄','갱신·만기·해지','갱신형 여부, 보장기간, 납입기간, 중도해지 시 불이익은 계약 전 확인이 필요합니다.','renewal-cancel'],
    ['👥','계약자·피보험자·수익자','보험료를 내는 사람, 보장의 대상, 보험금을 받는 사람이 서로 다를 수 있습니다.','parties'],
    ['📌','고지·통지의무','계약 전 알릴 사항과 계약 후 변경사항을 약관에 따라 정확히 알리는 것이 중요합니다.','disclosure']
  ];
  const topics=[
    ['🚗','자동차보험','법으로 정한 의무보험과 선택 가능한 보장을 함께 확인합니다.','auto'],
    ['🏥','실손의료보험','실제 부담한 의료비를 약관과 자기부담금 기준에 따라 보전하는 구조를 살펴봅니다.','medical'],
    ['❤️','건강·질병보험','암·뇌·심장질환 등 질병 위험과 진단·수술·입원 보장을 이해합니다.','health'],
    ['🦺','상해보험','우연하고 급격한 사고로 인한 상해 위험을 중심으로 보장합니다.','accident'],
    ['👨‍👩‍👧','생명·사망보험','사망·생존·가족보장 등 장기적인 생활위험을 대비합니다.','life'],
    ['🚘','운전자보험','교통사고 시 운전자 본인의 비용·책임 관련 보장을 확인합니다.','driver'],
    ['🏠','화재·재산보험','주택·상가·시설·재산의 화재 및 각종 손해 위험을 대비합니다.','property'],
    ['⚖️','배상책임보험','타인에게 법률상 손해배상책임을 부담할 위험을 보장합니다.','liability'],
    ['✈️','여행보험','여행 중 상해·질병·휴대품·배상책임 등 단기 위험을 다룹니다.','travel'],
    ['🌱','연금·저축성보험','노후자금·장기저축 목적과 사업비·해지환급 구조를 함께 봅니다.','savings'],
    ['🐾','생활형 보험','어린이·펫·레저 등 생활상황별 보장의 기본구조를 확인합니다.','lifestyle'],
    ['📚','보험 용어사전','약관에서 자주 만나는 핵심 용어를 쉽게 찾아봅니다.','glossary']
  ];
  function card(item){const [icon,title,summary,slug]=item;const a=document.createElement('a');a.className='knowledge-card';a.href=`/guide/insurance/${encodeURIComponent(slug)}`;a.innerHTML=`<span class="knowledge-icon" aria-hidden="true">${icon}</span><strong></strong><small></small><span class="more">자세히 보기 →</span>`;a.querySelector('strong').textContent=title;a.querySelector('small').textContent=summary;return a;}
  function render(){const home=document.querySelector('#home');if(!home||document.querySelector('.insurance-knowledge'))return;const section=document.createElement('section');section.className='insurance-knowledge';section.innerHTML=`<div class="knowledge-head"><div><p class="eyebrow">INSURANCE KNOWLEDGE HUB</p><h2>보험을 먼저 이해하고, 필요한 보장을 확인하세요.</h2></div><p>보험 자체의 공통 원리를 먼저 설명하고, 보험사별 추가조건·서비스가 있는 경우 에코디보험에 등록된 보험사와 설계사 안내로 연결합니다.</p></div><div class="knowledge-divider">보험을 이해하는 기본 항목</div><div class="knowledge-basics"></div><div class="knowledge-divider">보험 종류별 한눈에 보기</div><div class="knowledge-topics"></div><div class="knowledge-law-note"><strong>법령 기반 업데이트</strong> 자동차보험 등 법정 기준이 있는 항목은 국가법령정보센터 등 공식 원문을 기준으로 관리하며, 법령 변경 감지 시 공용 설명의 검증 상태를 다시 확인합니다.</div><p class="knowledge-advisor-note">특정 보험사 상품·특약·보험료·긴급출동 등 회사별 차이는 공용 설명과 분리하고, 등록된 보험사·설계사 페이지에서 추가 안내합니다.</p>`;section.querySelector('.knowledge-basics').append(...basics.map(card));section.querySelector('.knowledge-topics').append(...topics.map(card));const feature=home.querySelector('.feature-grid');if(feature)feature.before(section);else home.append(section);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
})();