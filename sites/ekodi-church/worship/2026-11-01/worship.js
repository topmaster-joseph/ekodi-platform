(() => {
  'use strict';
  const allowedViews = new Set(['bulletin','operator','stage','vertical']);
  const query = new URLSearchParams(location.search);
  const view = allowedViews.has(query.get('view')) ? query.get('view') : 'bulletin';
  document.body.dataset.view = view;
  document.querySelectorAll('[data-mode-link]').forEach(link => {
    if (link.dataset.modeLink === view) link.setAttribute('aria-current','page');
  });

  // Public, fixed data derived from the 2026-11-01 worship preparation packet.
  // No viewer data, platform tokens, stream keys or unpublished member content.
  const slides = [
    {
      "title": "에코디교회",
      "kicker": "WHO IS GOD? WHO AM I? WHAT DO I DO?",
      "lines": [
        "잠시 후 예배가 시작됩니다",
        "기대하는 마음으로 미리 준비해 주세요"
      ],
      "cover": true
    },
    {
      "title": "Call to Worship",
      "kicker": "예배부름",
      "lines": [
        "하나님이 우리를 한 밭에 부르시고 함께 자라게 하시는 은혜로 예배에 초대하십니다"
      ]
    },
    {
      "title": "Community Confession",
      "kicker": "공동고백",
      "lines": [
        "그리스도의 몸 안에서 서로를 세우도록 부르신 하나님 앞에 공동체가 고백합니다"
      ]
    },
    {
      "title": "공동체 고백",
      "kicker": "Community Confession",
      "lines": [
        "하나님은 우리를 세상에서 하나님의 구별된 백성으로 부르셨습니다.\n(갈 4:4-7, 롬 8:14-17, 벧전 2:9, 히 10:24-25)",
        "하나님은 우리를 복음으로 서로 환대하며 나누는 공동체로 세우셨습니다.\n(창 1:27, 31, 행 2:42-47, 롬 12:13)",
        "하나님은 우리를 세상에서 자기비움과 자기부정으로 자유롭고 거룩하게 하십니다.\n(행 1:8, 롬 8:28, 벧전 2:11-12, 렘 29:4-7, 빌 2:5-8, 눅 9:23)"
      ]
    },
    {
      "title": "Praise & Worship",
      "kicker": "경배와 찬양",
      "lines": [
        "다같이"
      ]
    },
    {
      "title": "Represent Praying",
      "kicker": "대표기도",
      "lines": [
        "맡은이"
      ]
    },
    {
      "title": "Song of Offering",
      "kicker": "헌신찬양",
      "lines": [
        "다같이"
      ]
    },
    {
      "title": "Scripture Reading",
      "kicker": "말씀읽기",
      "lines": [
        "고린도전서 3:1–9",
        "EKODI 2026-11 공통본문"
      ]
    },
    {
      "title": "고린도 지협 · 서로 다른 길이 만나는 도시",
      "kicker": "고린도전서 3장 배경",
      "lines": [
        "서쪽 바다(이오니아해) → 레카이온 항 → 고린도 → 겐그레아 항 → 동쪽 바다(에게해)",
        "바울의 사역과 다양한 사람들이 만나던 항구 도시",
        "위치 개념도 · 축척·거리·시간 미표기"
      ]
    },
    {
      "title": "자라게 하시는\n하나님 앞에서",
      "kicker": "Sermon",
      "lines": [
        "Before the God Who Gives Growth.",
        "在使生命成长的上帝面前。",
        "成長させてくださる神の御前で。",
        "Trước Đức Chúa Trời là Đấng làm cho lớn lên."
      ],
      "cover": true
    },
    {
      "title": "成長させてくださる神の御前で。",
      "kicker": "SERMON · 日本語",
      "lines": [
        "자라게 하시는 하나님 앞에서",
        "설교 제목 · 화면을 보고 함께 읽기"
      ]
    },
    {
      "title": "Trước Đức Chúa Trời là Đấng làm cho lớn lên.",
      "kicker": "SERMON · Tiếng Việt",
      "lines": [
        "자라게 하시는 하나님 앞에서",
        "설교 제목 · 화면을 보고 함께 읽기"
      ]
    },
    {
      "title": "누구의 교회입니까?",
      "kicker": "말씀나눔",
      "lines": [
        "고린도 교회는 바울과 아볼로의 이름으로\n서로 편을 가르며 다투었습니다.",
        "교회의 주인은 어떤 사람이 아니라\n예수 그리스도이십니다.",
        "하나님이 자라게 하시는 한 밭에서\n서로를 살리는 공동체가 됩시다."
      ]
    },
    {
      "title": "1 | 시기와 다툼은 자라지 못한 신앙의 표시입니다",
      "kicker": "말씀나눔",
      "lines": [
        "고린도 교회에는 시기와 다툼이 있었습니다.",
        "사람의 이름을 내세우는 자랑은\n그리스도의 몸을 나눕니다.",
        "다른 의견을 적으로 만들지 말고\n말씀 앞에서 함께 들읍시다."
      ]
    },
    {
      "title": "2 | 사역자는 주인이 아니라 맡은 일꾼입니다",
      "kicker": "말씀나눔",
      "lines": [
        "바울은 심었고 아볼로는 물을 주었습니다.",
        "수고는 소중하지만 생명의 주인은 하나님입니다.",
        "눈에 보이는 일과 보이지 않는 수고를\n서로 감사하며 기다립시다."
      ]
    },
    {
      "title": "3 | 자라게 하시는 이는 하나님이십니다",
      "kicker": "말씀나눔",
      "lines": [
        "심는 사람과 물 주는 사람은\n한 목적을 위해 수고합니다.",
        "교회는 하나님의 밭이요 하나님의 집입니다.",
        "새로 온 사람과 다시 일어설 이웃에게\n환대와 회복의 자리를 열어 줍시다."
      ]
    },
    {
      "title": "그리스도의 복음 | 한 알의 밀알이 되신 주님",
      "kicker": "말씀나눔",
      "lines": [
        "십자가는 자기 높임의 경쟁을 끝내고\n부활은 새 창조의 소망을 엽니다.",
        "우리의 동역은 구원을 사는 공로가 아니라\n먼저 받은 은혜에 대한 응답입니다.",
        "그리스도 안에서 서로를 세웁시다."
      ]
    },
    {
      "title": "함께 나눌 세 가지 질문",
      "kicker": "말씀나눔",
      "lines": [
        "내 신앙에 누군가 심고 물 주었던\n감사의 기억은 무엇입니까?",
        "사람을 기준으로 편을 나누거나\n비교했던 내 태도는 없습니까?",
        "이번 주 내가 심거나 물 줄\n한 사람과 섬김은 무엇입니까?"
      ]
    },
    {
      "title": "공동체의 응답",
      "kicker": "인도자 · 회중",
      "lines": [
        "우리의 이름을 높이고 싶을 때 / 그리스도만 우리의 주인임을 고백합니다",
        "누군가 씨를 심을 때 / 함께 물을 주며 감사하겠습니다",
        "열매가 더딜 때 / 자라게 하시는 하나님을 신뢰하겠습니다",
        "다시 시작할 이웃 앞에서 / 회복의 자리를 함께 열겠습니다",
        "다함께 / 말씀대로 살아내고 살려내겠습니다"
      ]
    },
    {
      "title": "이번 주 실천 한 걸음",
      "kicker": "말씀나눔",
      "lines": [
        "눈에 잘 띄지 않는 수고를 하는\n한 사람에게 구체적으로 감사를 전합니다.",
        "어려운 이웃에게 필요한 도움을 묻고\n함께할 수 있는 한 가지를 실천합니다.",
        "하나님이 자라게 하시는 밭을 돌봅니다."
      ]
    },
    {
      "title": "Response Sharing & Praying",
      "kicker": "나눔기도",
      "lines": [
        "다같이"
      ]
    },
    {
      "title": "Song of Commitment",
      "kicker": "결단찬양",
      "lines": [
        "다같이"
      ]
    },
    {
      "title": "이번 주 매일묵상 · 11/01–11/07",
      "kicker": "EKODI 2026-11 공통본문",
      "lines": [
        "일 11/01 고린도전서 3:1–9 · 월 11/02 고린도전서 3:10–23",
        "화 11/03 고린도전서 4:1–13 · 수 11/04 고린도전서 4:14–21",
        "목 11/05 고린도전서 5:1–13 · 금 11/06 고린도전서 6:1–11",
        "토 11/07 고린도전서 6:12–20"
      ]
    },
    {
      "title": "Community Announce",
      "kicker": "교회소식",
      "lines": [
        "인도자"
      ]
    },
    {
      "title": "주기도문",
      "kicker": "THE LORD'S PRAYER",
      "lines": [
        "한국어 · English · 中文 · 日本語 · Tiếng Việt",
        "주기도문 5개 언어 전문 수록"
      ]
    },
    {
      "title": "주기도문 | 한국어",
      "kicker": "THE LORD'S PRAYER",
      "lines": [
        "하늘에 계신 우리 아버지,",
        "아버지의 이름을 거룩하게 하시며 아버지의 나라가 오게 하시며",
        "아버지의 뜻이 하늘에서와 같이 땅에서도 이루어지게 하소서.",
        "오늘 우리에게 일용할 양식을 주시고",
        "우리가 우리에게 잘못한 사람을 용서하여 준 것 같이",
        "우리 죄를 용서하여 주시고 우리를 시험에 빠지지 않게 하시고",
        "악에서 구하소서.",
        "나라와 권능과 영광이 영원히 아버지의 것입니다. 아멘."
      ]
    },
    {
      "title": "주기도문 | English",
      "kicker": "THE LORD'S PRAYER",
      "lines": [
        "Our Father which art in heaven,",
        "Hallowed be thy name. Thy kingdom come.",
        "Thy will be done in earth, as it is in heaven.",
        "Give us this day our daily bread.",
        "And forgive us our debts, as we forgive our debtors.",
        "And lead us not into temptation, but deliver us from evil:",
        "For thine is the kingdom, and the power, and the glory, for ever. Amen."
      ]
    },
    {
      "title": "주기도문 | 中文",
      "kicker": "THE LORD'S PRAYER",
      "lines": [
        "我们在天上的父：",
        "愿人都尊你的名为圣。愿你的国降临。",
        "愿你的旨意行在地上，如同行在天上。",
        "我们日用的饮食，今日赐给我们。",
        "免我们的债，如同我们免了人的债。",
        "不叫我们遇见试探，救我们脱离凶恶。",
        "因为国度、权柄、荣耀，全是你的，直到永远。阿们。"
      ]
    },
    {
      "title": "주기도문 | 日本語",
      "kicker": "THE LORD'S PRAYER",
      "lines": [
        "天にまします我らの父よ、",
        "願わくは御名をあがめさせたまえ。御国を来たらせたまえ。",
        "御心の天になるごとく、地にもなさせたまえ。",
        "我らの日用の糧を、今日も与えたまえ。",
        "我らに罪を犯す者を我らが赦すごとく、我らの罪をも赦したまえ。",
        "我らを試みにあわせず、悪より救い出したまえ。",
        "国と力と栄えとは、限りなく汝のものなればなり。アーメン。"
      ]
    },
    {
      "title": "주기도문 | Tiếng Việt",
      "kicker": "THE LORD'S PRAYER",
      "lines": [
        "Lạy Cha chúng con ở trên trời,",
        "danh Cha được thánh. Nước Cha được đến.",
        "Ý Cha được nên, ở đất như trời.",
        "Xin cho chúng con hôm nay đồ ăn đủ ngày.",
        "Xin tha tội lỗi cho chúng con, như chúng con cũng tha kẻ phạm tội nghịch cùng chúng con.",
        "Xin chớ để chúng con bị cám dỗ, mà cứu chúng con khỏi điều ác.",
        "Vì nước, quyền, vinh hiển đều thuộc về Cha đời đời. A-men."
      ]
    }
  ];

  const storageKey='ekodi:church:worship:2026-11-01:slide';
  let slideIndex=0;
  let blackout=false;
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(saved && Number.isInteger(saved.slide) && saved.slide>=0 && saved.slide<slides.length) slideIndex=saved.slide;
    if(saved && saved.blackout===true) blackout=true;
  } catch { /* Blocked/private storage starts safely from the first slide. */ }
  const slideEl=document.querySelector('#slide');
  const kickerEl=document.querySelector('#slide-kicker');
  const titleEl=document.querySelector('#slide-title');
  const bodyEl=document.querySelector('#slide-body');
  const numberEl=document.querySelector('#slide-number');
  const progressEl=document.querySelector('#progress');
  const selectEl=document.querySelector('#slide-picker');

  function render(){
    const data=slides[slideIndex];
    titleEl.textContent=data.title;
    kickerEl.textContent=data.kicker;
    bodyEl.replaceChildren();
    for(const line of data.lines){const p=document.createElement('p');p.textContent=line;bodyEl.append(p);}
    // Original Google Slides page rendered as an image; the text above stays
    // in the DOM for screen readers, search and the operator picker.
    let picture=slideEl.querySelector('.slide-picture');
    if(data.image){
      if(!picture){picture=document.createElement('img');picture.className='slide-picture';picture.decoding='async';slideEl.prepend(picture);}
      picture.src=data.image;picture.alt=[data.title,data.kicker,...data.lines].join(' · ');
      const next=slides[slideIndex+1];if(next&&next.image){const pre=new Image();pre.src=next.image;}
    }else if(picture){picture.remove();}
    slideEl.dataset.image=data.image?'true':'false';
    slideEl.dataset.titleSlide=data.cover?'true':'false';
    slideEl.dataset.blackout=blackout?'true':'false';
    numberEl.textContent=(slideIndex+1)+' / '+slides.length;
    progressEl.textContent=(slideIndex+1)+' / '+slides.length;
    document.querySelectorAll('#blackout,#operator-blackout').forEach(button=>button.setAttribute('aria-pressed',String(blackout)));
    if(selectEl)selectEl.value=String(slideIndex);
    document.title=data.title.replaceAll('\n',' ')+' | 에코디교회';
  }
  function broadcastState(){
    const state=JSON.stringify({slide:slideIndex,blackout});
    try {localStorage.setItem(storageKey,state);}catch{/* Slide still works if storage is blocked. */}
    if(channel) try{channel.postMessage({slide:slideIndex,blackout});}catch{}
  }
  function goTo(index){
    slideIndex=Math.min(slides.length-1,Math.max(0,index));
    render();broadcastState();
  }
  function toggleBlackout(){blackout=!blackout;render();broadcastState();}
  function applyState(saved){
    if(!saved||!Number.isInteger(saved.slide)||saved.slide<0||saved.slide>=slides.length)return;
    slideIndex=saved.slide;blackout=saved.blackout===true;render();
  }
  let channel=null;
  if(typeof BroadcastChannel==='function'){
    try{channel=new BroadcastChannel('ekodi-church-worship-20261101');channel.onmessage=event=>applyState(event.data);}catch{}
  }
  window.addEventListener('storage',event=>{
    if(event.key!==storageKey||!event.newValue)return;
    try{applyState(JSON.parse(event.newValue));}catch{}
  });
  if(selectEl){
    slides.forEach((data,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=(index+1)+'. '+data.title.replaceAll('\n',' ');selectEl.append(option);});
    selectEl.addEventListener('change',()=>goTo(Number(selectEl.value)));
  }
  for(const [id,callback] of Object.entries({
    'previous':()=>goTo(slideIndex-1),'next':()=>goTo(slideIndex+1),
    'operator-prev':()=>goTo(slideIndex-1),'operator-next':()=>goTo(slideIndex+1),
    'blackout':toggleBlackout,'operator-blackout':toggleBlackout,
    'fullscreen':()=>{if(document.fullscreenElement){document.exitFullscreen?.();}else{document.querySelector('#presentation').requestFullscreen?.();}},
    'print-bulletin':()=>window.print(),
    'open-stage':()=>window.open('?view=stage','ekodi-church-stage'),
    'open-vertical':()=>window.open('?view=vertical','ekodi-church-vertical'),
    'copy-stage-url':async()=>{
      const url=new URL(location.href);url.search='?view=stage';
      try{await navigator.clipboard.writeText(url.href);}catch{window.prompt('발표 화면 주소를 복사하세요',url.href);}
    }
  })){
    document.getElementById(id)?.addEventListener('click',callback);
  }
  document.addEventListener('keydown',event=>{
    const tag=event.target?.tagName;
    if(event.altKey||event.metaKey||event.ctrlKey||['INPUT','SELECT','TEXTAREA'].includes(tag))return;
    if(view==='bulletin')return;
    let fn;
    if(['ArrowRight','PageDown',' '].includes(event.key))fn=()=>goTo(slideIndex+1);
    if(['ArrowLeft','PageUp'].includes(event.key))fn=()=>goTo(slideIndex-1);
    if(event.key==='Home')fn=()=>goTo(0);
    if(event.key==='End')fn=()=>goTo(slides.length-1);
    if(event.key.toLowerCase()==='b')fn=toggleBlackout;
    if(event.key.toLowerCase()==='f')fn=()=>{
      if(document.fullscreenElement)document.exitFullscreen?.();
      else document.querySelector('#presentation').requestFullscreen?.();
    };
    if(fn){event.preventDefault();fn();}
  });
  render();

  // Bulletin sheets keep the A4-landscape layout and scale proportionally so a
  // whole page always fits one screen (window resize and browser zoom alike).
  function fitSheets(){
    const top=(document.querySelector('#topbar')?.offsetHeight||0)+24;
    document.querySelectorAll('.bp-frame').forEach(frame=>{
      const avail=frame.parentElement.clientWidth;
      const scale=Math.min(avail/1123,Math.max(.2,(window.innerHeight-top)/794));
      frame.style.setProperty('--bp-scale',String(scale));
      frame.style.width=Math.floor(1123*scale)+'px';frame.style.height=Math.floor(794*scale)+'px';frame.style.margin='0 auto';
    });
  }
  fitSheets();window.addEventListener('resize',fitSheets);
  if(window.ResizeObserver){const ro=new ResizeObserver(fitSheets);document.querySelectorAll('.bp-pages').forEach(el=>ro.observe(el));}
})();