(() => {
  'use strict';
  const allowedViews = new Set(['bulletin','operator','stage','vertical']);
  const query = new URLSearchParams(location.search);
  const view = allowedViews.has(query.get('view')) ? query.get('view') : 'bulletin';
  document.body.dataset.view = view;
  document.querySelectorAll('[data-mode-link]').forEach(link => {
    if (link.dataset.modeLink === view) link.setAttribute('aria-current','page');
  });

  // Public, fixed data derived from the 2026-11-08 worship preparation packet.
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
        "각 사람에게 다른 은사를 주신 하나님이 우리를 한 몸으로 불러 예배에 초대하십니다"
      ]
    },
    {
      "title": "Community Confession",
      "kicker": "공동고백",
      "lines": [
        "서로 다른 삶의 자리에서 한 몸으로 부르신 하나님 앞에 공동체가 고백합니다"
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
        "고린도전서 7:1–9",
        "EKODI 2026-11 공통본문"
      ]
    },
    {
      "title": "고린도 교회의 편지 · 질문에 답하는 바울",
      "kicker": "고린도전서 7장 배경",
      "lines": [
        "고린도 교회가 써 보낸 질문 → 7:1부터 바울의 답장",
        "6장: 무엇이든 괜찮다는 방종 · 7장: 몸을 멀리하는 금욕",
        "두 극단 사이에서 몸과 관계를 하나님의 선물로 보는 길"
      ]
    },
    {
      "title": "각자 받은\n은사대로",
      "kicker": "Sermon",
      "lines": [
        "Each According to the Gift Received.",
        "各人照所领受的恩赐。",
        "それぞれ受けた賜物に従って。",
        "Mỗi người theo ân tứ mình đã nhận."
      ],
      "cover": true
    },
    {
      "title": "それぞれ受けた賜物に従って。",
      "kicker": "SERMON · 日本語",
      "lines": [
        "각자 받은 은사대로",
        "설교 제목 · 화면을 보고 함께 읽기"
      ]
    },
    {
      "title": "Mỗi người theo ân tứ mình đã nhận.",
      "kicker": "SERMON · Tiếng Việt",
      "lines": [
        "각자 받은 은사대로",
        "설교 제목 · 화면을 보고 함께 읽기"
      ]
    },
    {
      "title": "같은 모양이 아니어도 괜찮습니다",
      "kicker": "말씀나눔",
      "lines": [
        "가정을 이룬 이, 홀로 지내는 이,\n먼저 배우자를 보낸 이가 함께 예배합니다.",
        "어떤 삶의 모양이 더 거룩하다고\n쉽게 말하지 않습니다.",
        "각자 받은 은사대로\n주님께 속한 삶을 삽니다."
      ]
    },
    {
      "title": "1 | 몸과 관계도 하나님 앞에 있습니다",
      "kicker": "말씀나눔",
      "lines": [
        "방종도 금욕도 몸을 하나님의 선물로\n보지 못한 모습입니다.",
        "바울은 유혹이 많은 현실을\n외면하지 않습니다.",
        "그 자리에서 하나님께\n신실하게 삽니다."
      ]
    },
    {
      "title": "2 | 서로에게 속한 사랑은 존중과 합의로 지켜집니다",
      "kicker": "말씀나눔",
      "lines": [
        "바울은 남편과 아내에게\n같은 책임과 같은 존중을 말합니다.",
        "기도를 위한 결정도\n서로 합의하여 정합니다.",
        "함께 묻고 함께 정하는 것이\n그리스도인의 사랑입니다."
      ]
    },
    {
      "title": "3 | 각자 받은 은사대로 살아갑니다",
      "kicker": "말씀나눔",
      "lines": [
        "결혼도 홀로 지냄도\n하나님께 받은 은사입니다.",
        "더 성숙한 모양, 더 거룩한 모양을\n비교하지 않습니다.",
        "지금 선 자리가\n주님을 섬기는 자리입니다."
      ]
    },
    {
      "title": "그리스도의 복음 | 자신을 내어 주신 주님",
      "kicker": "말씀나눔",
      "lines": [
        "그리스도는 교회를 사랑하여\n자신을 내어 주셨습니다.",
        "우리의 신실함은 은혜의 조건이 아니라\n먼저 받은 사랑에 대한 응답입니다.",
        "그 사랑 안에서 서로를 존중합시다."
      ]
    },
    {
      "title": "함께 나눌 세 가지 질문",
      "kicker": "말씀나눔",
      "lines": [
        "다른 사람의 삶의 모양을\n쉽게 판단했던 적은 없습니까?",
        "묻지 않고 혼자 정했던 일은\n무엇입니까?",
        "지금 내 자리에서 은사로 섬길\n한 가지는 무엇입니까?"
      ]
    },
    {
      "title": "공동체의 응답",
      "kicker": "인도자 · 회중",
      "lines": [
        "다른 삶의 모양 앞에서 / 판단하지 않고 존중하겠습니다",
        "가정과 공동체의 결정 앞에서 / 서로 묻고 함께 정하겠습니다",
        "몸과 관계와 시간을 / 하나님께 드리겠습니다",
        "각자 받은 은사대로 / 지금 선 자리에서 주님을 섬기겠습니다",
        "다함께 / 말씀대로 살아내고 살려내겠습니다"
      ]
    },
    {
      "title": "이번 주 실천 한 걸음",
      "kicker": "말씀나눔",
      "lines": [
        "가까운 이에게 요즘 무엇이 힘든지\n먼저 묻고 끝까지 들어 줍니다.",
        "홀로 지내는 이웃이나 다른 형편의 지체와\n식사나 안부로 함께합니다.",
        "들은 이야기는 조심스럽게 지켜 줍니다."
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
      "title": "이번 주 매일묵상 · 11/08–11/14",
      "kicker": "EKODI 2026-11 공통본문",
      "lines": [
        "일 11/08 고린도전서 7:1–9 · 월 11/09 고린도전서 7:10–16",
        "화 11/10 고린도전서 7:17–28 · 수 11/11 고린도전서 7:29–40",
        "목 11/12 고린도전서 8:1–13 · 금 11/13 고린도전서 9:1–12",
        "토 11/14 고린도전서 9:13–18"
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

  const storageKey='ekodi:church:worship:2026-11-08:slide';
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
    try{channel=new BroadcastChannel('ekodi-church-worship-20261108');channel.onmessage=event=>applyState(event.data);}catch{}
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