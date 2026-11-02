(() => {
  'use strict';
  const allowedViews = new Set(['bulletin','operator','stage','vertical']);
  const query = new URLSearchParams(location.search);
  const view = allowedViews.has(query.get('view')) ? query.get('view') : 'bulletin';
  document.body.dataset.view = view;
  document.querySelectorAll('[data-mode-link]').forEach(link => {
    if (link.dataset.modeLink === view) link.setAttribute('aria-current','page');
  });

  // Public, fixed data derived from the 2026-10-25 worship preparation packet.
  // No viewer data, platform tokens, stream keys or unpublished member content.
  const slides = [
    {
      "title": "에코디교회",
      "kicker": "WHO IS GOD? WHO AM I? WHAT DO I DO?",
      "lines": [
        "잠시 후 예배가 시작됩니다",
        "기대하는 마음으로 미리 준비해 주세요"
      ],
      "image": "./slides/01.webp"
    },
    {
      "title": "Call to Worship",
      "kicker": "예배부름",
      "lines": [
        "우리의 모습을 말씀 앞에 비추시고 사랑으로 돌이키게 하시는 하나님이 모두를 예배로 부르십니다"
      ],
      "image": "./slides/02.webp"
    },
    {
      "title": "Community Confession",
      "kicker": "공동고백",
      "lines": [
        "형제의 고통을 외면하지 않으시는 하나님 앞에 에코디 공동체가 믿음으로 고백합니다"
      ],
      "image": "./slides/03.webp"
    },
    {
      "title": "공동체 고백",
      "kicker": "Community Confession",
      "lines": [
        "하나님은 우리를 세상에서 하나님의 구별된 백성으로 부르셨습니다.",
        "하나님은 우리를 복음으로 서로 환대하며 나누는 공동체로 세우셨습니다.",
        "하나님은 우리를 세상에서 자기비움과 자기부정으로 자유롭고 거룩하게 하십니다."
      ],
      "image": "./slides/04.webp"
    },
    {
      "title": "경배와 찬양",
      "kicker": "Praise & Worship",
      "lines": [
        "다같이"
      ],
      "image": "./slides/05.webp"
    },
    {
      "title": "Represent Praying",
      "kicker": "대표기도",
      "lines": [
        "맡은이"
      ],
      "image": "./slides/06.webp"
    },
    {
      "title": "Song of Offering",
      "kicker": "헌신찬양",
      "lines": [
        "다같이"
      ],
      "image": "./slides/07.webp"
    },
    {
      "title": "Scripture Reading",
      "kicker": "말씀읽기",
      "lines": [
        "오바댜 1:10–16"
      ],
      "image": "./slides/08.webp"
    },
    {
      "title": "오바댜 1:10–11",
      "kicker": "본문 핵심 (요약)",
      "lines": [
        "10 형제 야곱에게 행한 폭력은 에돔의 수치를 드러냅니다.",
        "11 예루살렘의 재난을 구경한 날, 너도 그들과 같았습니다.",
        "본문 핵심 요약 · 실제 봉독은 성경 원문으로"
      ],
      "image": "./slides/09.webp"
    },
    {
      "title": "오바댜 1:12–13",
      "kicker": "본문 핵심 (요약)",
      "lines": [
        "12 형제의 재난을 보고 기뻐하거나 크게 말하지 말라.",
        "13 그 성문에 들어가 남의 재물을 빼앗지 말라.",
        "본문 핵심 요약 · 실제 봉독은 성경 원문으로"
      ],
      "image": "./slides/10.webp"
    },
    {
      "title": "오바댜 1:14",
      "kicker": "본문 핵심 (요약)",
      "lines": [
        "14 도망치는 이웃의 길을 막지 말라.",
        "살아남은 이들을 원수에게 넘기지 말라.",
        "고통받는 이를 이용하는 일이 바로 폭력입니다."
      ],
      "image": "./slides/11.webp"
    },
    {
      "title": "오바댜 1:15",
      "kicker": "본문 핵심 (요약)",
      "lines": [
        "15 여호와의 날이 모든 나라에 가까웠습니다.",
        "다른 이에게 행한 일이 자신에게 돌아옵니다.",
        "심판을 남에게 돌리기 전에 자신을 돌아봅니다."
      ],
      "image": "./slides/12.webp"
    },
    {
      "title": "오바댜 1:16",
      "kicker": "본문 핵심 (요약)",
      "lines": [
        "16 하나님의 거룩한 산과 여러 나라를 향한 심판의 이미지가 이어집니다.",
        "이는 보복의 허락이 아니라 공의의 경고입니다."
      ],
      "image": "./slides/13.webp"
    },
    {
      "title": "Sermon",
      "kicker": "깨어진 형제애, 다시 세울 공동체",
      "lines": [
        "Broken kinship, a community renewed.",
        "破碎的手足情，重新建立共同体。",
        "壊れた兄弟愛、再び築く共同体。",
        "Tình anh em tan vỡ, cộng đồng được dựng lại."
      ],
      "image": "./slides/14.webp"
    },
    {
      "title": "SERMON · 日本語",
      "kicker": "壊れた兄弟愛、再び築く共同体。",
      "lines": [
        "깨어진 형제애, 다시 세울 공동체"
      ],
      "image": "./slides/15.webp"
    },
    {
      "title": "SERMON · Tiếng Việt",
      "kicker": "Tình anh em tan vỡ, cộng đồng được dựng lại.",
      "lines": [
        "깨어진 형제애, 다시 세울 공동체"
      ],
      "image": "./slides/16.webp"
    },
    {
      "title": "고통을 바라보는 우리의 자리",
      "kicker": "말씀나눔",
      "lines": [
        "에돔은 형제의 무너짐을 보고 그들 중 한 사람처럼 행동했습니다.",
        "위험은 남의 고통을 구경거리로 만드는 데서 시작됩니다.",
        "종교개혁주일, 먼저 교회의 언어와 태도를 돌아봅니다."
      ],
      "image": "./slides/17.webp"
    },
    {
      "title": "1 | 재난을 구경하는 신앙을 멈추십시오",
      "kicker": "말씀나눔",
      "lines": [
        "형제가 무너질 때 에돔은 그들 중 한 사람처럼 행동했습니다.",
        "직접 해치지 않았다는 말로 방관을 정당화할 수 없습니다.",
        "누군가의 형편을 평가하기보다 필요한 것을 먼저 물어봅시다."
      ],
      "image": "./slides/18.webp"
    },
    {
      "title": "2 | 타인의 실패로 높아지지 마십시오",
      "kicker": "말씀나눔",
      "lines": [
        "본문은 조롱과 약탈, 도망자의 길을 막는 행동을 책망합니다.",
        "교회의 개혁은 다른 이의 허물을 찾아내는 경쟁이 아닙니다.",
        "소문 대신 경청을, 배제 대신 회복의 기회를 나눕시다."
      ],
      "image": "./slides/19.webp"
    },
    {
      "title": "3 | 하나님의 공의 앞에 서십시오",
      "kicker": "말씀나눔",
      "lines": [
        "여호와의 날은 에돔만이 아니라 만국을 향합니다.",
        "우리가 쌓은 지위와 신앙 경력도 타인을 외면한 책임을 지우지 못합니다.",
        "보복은 하나님께 맡기고 우리는 오늘 사랑을 선택합시다."
      ],
      "image": "./slides/20.webp"
    },
    {
      "title": "그리스도는 외면하지 않으셨습니다",
      "kicker": "말씀나눔",
      "lines": [
        "예수께서는 고통받는 이웃의 곁에 오셨고 십자가를 지셨습니다.",
        "우리는 선한 사마리아인처럼 멈추어 서서 돌보도록 부름받습니다.",
        "이 실천은 구원을 사는 공로가 아니라 받은 은혜에 대한 응답입니다."
      ],
      "image": "./slides/21.webp"
    },
    {
      "title": "함께 나눌 세 가지 질문",
      "kicker": "말씀나눔",
      "lines": [
        "하나님이 내 고통을 외면하지 않으셨던 순간은 언제입니까?",
        "누군가의 고통을 구경하거나 판단했던 태도는 없었습니까?",
        "이번 주 곁에 서서 도울 한 사람과 한 가지 행동은 무엇입니까?"
      ],
      "image": "./slides/22.webp"
    },
    {
      "title": "공동체의 응답",
      "kicker": "인도자 · 회중",
      "lines": [
        "형제의 고통 앞에서 / 외면하지 않겠습니다",
        "타인의 실패를 볼 때 / 기뻐하거나 높아지지 않겠습니다",
        "공의의 하나님 앞에서 / 우리 자신부터 돌아보겠습니다",
        "그리스도의 사랑을 따라 / 이웃 곁에 서겠습니다",
        "다함께 / 말씀대로 살아내고 살려내겠습니다"
      ],
      "image": "./slides/23.webp"
    },
    {
      "title": "이번 주 실천 한 걸음",
      "kicker": "말씀나눔",
      "lines": [
        "힘겨운 한 이웃의 이름을 떠올립니다.",
        "그 사람의 사정과 동의를 존중하며 필요한 도움을 먼저 묻습니다.",
        "말씀 앞에서 개혁되는 교회는 작은 돌봄의 행동으로 시작됩니다."
      ],
      "image": "./slides/24.webp"
    },
    {
      "title": "Response Sharing & Praying",
      "kicker": "나눔기도",
      "lines": [
        "다같이"
      ],
      "image": "./slides/25.webp"
    },
    {
      "title": "Song of Commitment",
      "kicker": "결단찬양",
      "lines": [
        "다같이"
      ],
      "image": "./slides/26.webp"
    },
    {
      "title": "Community Announce",
      "kicker": "교회소식",
      "lines": [
        "인도자"
      ],
      "image": "./slides/27.webp"
    },
    {
      "title": "주기도문",
      "kicker": "THE LORD'S PRAYER",
      "lines": [
        "한국어 · English · 中文 · 日本語 · Tiếng Việt"
      ],
      "image": "./slides/28.webp"
    }
  ];

  const storageKey='ekodi:church:worship:2026-10-25:slide';
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
    try{channel=new BroadcastChannel('ekodi-church-worship-20261025');channel.onmessage=event=>applyState(event.data);}catch{}
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