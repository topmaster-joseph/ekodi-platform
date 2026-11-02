(() => {
  'use strict';
  const allowedViews = new Set(['bulletin','operator','stage','vertical']);
  const query = new URLSearchParams(location.search);
  const view = allowedViews.has(query.get('view')) ? query.get('view') : 'bulletin';
  document.body.dataset.view = view;
  document.querySelectorAll('[data-mode-link]').forEach(link => {
    if (link.dataset.modeLink === view) link.setAttribute('aria-current','page');
  });

  // Public, fixed data derived from the 2026-10-18 worship preparation packet.
  // No viewer data, platform tokens, stream keys or unpublished member content.
  const slides = [
    {
      "title": "품 안에서,\n세상으로",
      "kicker": "2026.10.18 · 주일모임 · 오전 11시",
      "lines": [
        "신명기 33:12–19",
        "말씀나눔 정찬균 목사"
      ],
      "cover": true
    },
    {
      "title": "Community Sunday Worship",
      "kicker": "예배순서",
      "lines": [
        "예배부름 · 공동고백 · 경배찬양",
        "대표기도(담당 확인 중) · 헌신찬양",
        "말씀읽기 · 말씀나눔",
        "나눔기도 · 결단찬양 · 교회소식 · 주기도문"
      ]
    },
    {
      "title": "우리의 공동체 고백",
      "kicker": "EKODI CHURCH",
      "lines": [
        "하나님의 부르심으로 모였습니다.",
        "복음으로 서로 환대하고 나눕니다.",
        "삶에서 섬김과 회복을 살아냅니다."
      ]
    },
    {
      "title": "오늘의 공통본문",
      "kicker": "SCRIPTURE READING",
      "lines": [
        "신명기 33:12–19",
        "EKODI 공통본문 레지스트리 2026-10"
      ]
    },
    {
      "title": "사랑받는 자는\n어디에 머무는가?",
      "kicker": "신명기 33:12",
      "lines": [
        "베냐민에게 선포된 하나님의 보호",
        "우리가 사는 자리 곁에서 덮으시는 사랑",
        "삶의 출발점은 성취가 아닌 은혜입니다."
      ]
    },
    {
      "title": "하루 종일\n덮으시는 사랑",
      "kicker": "신명기 33:12",
      "lines": [
        "보호받는 삶은 세상으로부터의 도피가 아닙니다.",
        "하나님 품에서 다시 일어설 힘을 얻습니다.",
        "우리도 서로에게 안전한 자리가 됩니다."
      ]
    },
    {
      "title": "복은 땅을\n살리는 선물",
      "kicker": "신명기 33:13–14",
      "lines": [
        "요셉에게 주어진 하늘과 깊음과 계절의 소산",
        "삶의 열매는 나만의 소유가 아닙니다.",
        "하나님이 맡기신 자원을 돌봄에 사용합니다."
      ]
    },
    {
      "title": "쌓는 복에서\n나누는 복으로",
      "kicker": "신명기 33:15–16",
      "lines": [
        "땅의 풍요와 오래된 산의 좋은 것이 선포됩니다.",
        "풍요는 독점보다 생명의 회복으로 이어집니다.",
        "희년의 실천은 다시 설 기회를 나누는 일입니다."
      ]
    },
    {
      "title": "힘은 누구를\n살리는가?",
      "kicker": "신명기 33:17",
      "lines": [
        "힘과 능력에는 바른 방향이 필요합니다.",
        "강함을 자랑하기보다 이웃을 지키는 데 씁니다.",
        "하나님이 주신 힘은 맡겨진 책임입니다."
      ]
    },
    {
      "title": "나갈 때도,\n머물 때도",
      "kicker": "신명기 33:18",
      "lines": [
        "스불론의 나감과 잇사갈의 장막",
        "서로 다른 삶의 자리에서 사명이 피어납니다.",
        "하나의 방식이 모두의 부르심은 아닙니다."
      ]
    },
    {
      "title": "예배로\n사람을 부르다",
      "kicker": "신명기 33:19",
      "lines": [
        "백성을 산으로 부르는 공동체",
        "함께 하나님을 예배하고 선한 것을 나눕니다.",
        "복은 사람을 살리는 환대가 됩니다."
      ]
    },
    {
      "title": "예수 그리스도,\n은혜와 파송",
      "kicker": "GOSPEL",
      "lines": [
        "지친 우리를 부르시고 새 힘을 주시는 그리스도",
        "은혜는 머무름으로 끝나지 않고 파송으로 이어집니다.",
        "예배에서 받은 평안을 일상에서 흘려보냅니다."
      ]
    },
    {
      "title": "에코디의 네 가지\n공동체적 응답",
      "kicker": "EKODI MISSION",
      "lines": [
        "에클레시아 · 부르심에 응답하여 모이기",
        "코이노니아 · 서로의 안전한 이웃 되기",
        "디아스포라 · 가정과 일터로 복을 전하기",
        "희년 · 회복의 기회를 함께 만들기"
      ]
    },
    {
      "title": "함께 나눌\n세 가지 질문",
      "kicker": "공동체 나눔",
      "lines": [
        "나는 어떤 자리에서 하나님의 보호를 경험합니까?",
        "내게 맡겨진 복은 지금 누구를 살리고 있습니까?",
        "이번 주 어떤 환대와 회복을 시작하겠습니까?"
      ]
    },
    {
      "title": "이번 주 매일묵상",
      "kicker": "2026.10.18–10.24",
      "lines": [
        "10/18 일 신 33:12–19 · 10/19 월 신 33:20–29",
        "10/20 화 신 34:1–12 · 10/21 수 시 70:1–5",
        "10/22 목 시 71:1–12 · 10/23 금 시 71:13–24",
        "10/24 토 옵 1:1–9"
      ]
    },
    {
      "title": "말씀대로\n살아내고 살려내겠습니다",
      "kicker": "마침기도",
      "lines": [
        "사랑하시는 하나님, 우리에게 평안을 주소서.",
        "우리에게 맡겨진 복으로 이웃을 돌보게 하소서.",
        "가정과 일터와 지역에서 회복의 증인이 되게 하소서.",
        "예수 그리스도의 이름으로 기도합니다. 아멘."
      ]
    }
  ];

  const storageKey='ekodi:church:worship:2026-10-18:slide';
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
    try{channel=new BroadcastChannel('ekodi-church-worship-20261018');channel.onmessage=event=>applyState(event.data);}catch{}
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
})();