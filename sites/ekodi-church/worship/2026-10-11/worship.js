(() => {
  'use strict';
  const allowedViews = new Set(['bulletin','operator','stage','vertical']);
  const query = new URLSearchParams(location.search);
  const view = allowedViews.has(query.get('view')) ? query.get('view') : 'bulletin';
  document.body.dataset.view = view;
  document.querySelectorAll('[data-mode-link]').forEach(link => {
    if (link.dataset.modeLink === view) link.setAttribute('aria-current','page');
  });

  // Public, fixed data derived from the 2026-10-11 approved worship packet.
  // No viewer data, platform tokens, stream keys or unpublished member content.
  const slides = [
    {title:'모두가 듣도록,\n다음 세대까지',kicker:'2026.10.11 · 주일모임 · 오전 11시',lines:['신명기 31:9–18','말씀나눔 정찬균 목사'],cover:true},
    {title:'Community Sunday Worship',kicker:'예배순서',lines:['예배부름 · 공동고백 · 경배찬양','대표기도 박은희 · 헌신찬양','말씀읽기 · 말씀나눔','나눔기도 · 결단찬양 · 교회소식 · 주기도문']},
    {title:'우리의 공동체 고백',kicker:'EKODI CHURCH',lines:['우리는 하나님의 부르심으로 모였습니다.','우리는 복음으로 서로 환대하고 나눕니다.','우리는 일상에서 섬김으로 살아갑니다.']},
    {title:'오늘의 공통본문',kicker:'SCRIPTURE READING',lines:['신명기 31:9–18','EKODI 공통본문 레지스트리 승인 원본']},
    {title:'모세가 떠난 뒤,\n무엇이 남는가?',kicker:'말씀나눔 · 들어가기',lines:['지도자의 역할은 끝나지만 하나님의 일은 이어집니다.','모세는 말씀을 기록하여 공동체에 맡깁니다.','다음 세대가 말씀을 들을 자리를 준비합니다.']},
    {title:'읽고, 듣고,\n배우고, 지키다',kicker:'신명기 31:9–11',lines:['기록된 말씀은 개인의 기억에 머물지 않습니다.','백성이 모일 때 다시 읽고 들어야 합니다.','사람이 바뀌어도 말씀의 방향은 남아야 합니다.']},
    {title:'모두를 모으라',kicker:'신명기 31:12–13',lines:['남자와 여자','어린이와 다음 세대','나그네와 처음 온 이웃','말씀의 자리는 모두에게 열려 있습니다.']},
    {title:'다음 세대는\n어떻게 배울까요?',kicker:'신명기 31:13',lines:['어른의 설명을 듣습니다.','어른의 삶을 봅니다.','함께 묻고 실패를 고치며 배웁니다.']},
    {title:'새로운 지도자,\n변함없는 하나님',kicker:'신명기 31:14–15',lines:['모세는 여호수아에게 공동체의 길을 맡깁니다.','하나님은 부르시고 함께하십니다.','우리의 중심은 사람이 아니라 하나님께 있습니다.']},
    {title:'듣는 것만으로\n충분할까요?',kicker:'신명기 31:16–18',lines:['말씀을 듣고도 잊을 수 있습니다.','믿음은 정보보다 관계와 실천이 필요합니다.','듣기 → 배우기 → 살기 → 다음 세대에 전하기']},
    {title:'그리스도와\n복음의 연결',kicker:'GOSPEL',lines:['우리는 스스로 완벽하게 기억하는 사람들이 아닙니다.','그리스도의 은혜는 다시 돌아설 길을 여십니다.','받은 은혜로 다른 이가 들을 자리를 만듭니다.']},
    {title:'에코디 공동체의\n네 가지 실천',kicker:'EKODI MISSION',lines:['에클레시아 · 함께 모여 말씀을 듣기','코이노니아 · 서로 배울 자리를 나누기','디아스포라 · 가정과 일터에서 실천하기','희년 · 소외된 이웃에게 문턱을 낮추기']},
    {title:'함께 나눌\n세 가지 질문',kicker:'공동체 나눔',lines:['하나님 말씀보다 크게 들리는 목소리는?','말씀을 듣기 어려운 이웃은 누구인가?','이번 주 함께 말씀을 읽을 한 사람은?']},
    {title:'공동체의 응답',kicker:'말씀대로 살아내기',lines:['말씀을 들을 때 — 마음을 열겠습니다.','처음 온 이웃을 만날 때 — 함께 배우겠습니다.','다음 세대를 바라볼 때 — 삶으로 전하겠습니다.','길을 잊었을 때 — 은혜로 돌아서겠습니다.']},
    {title:'이번 주 매일묵상',kicker:'2026.10.11–10.17',lines:['10/11 일 신 31:9–18 · 10/12 월 신 31:19–29','10/13 화 신 31:30–32:14 · 10/14 수 신 32:15–27','10/15 목 신 32:28–42 · 10/16 금 신 32:43–52','10/17 토 신 33:1–11']},
    {title:'말씀대로\n살아내고 살려내겠습니다',kicker:'마침기도',lines:['하나님, 어린이와 새로 온 이웃도 함께 배우는 공동체가 되게 하소서.','환경이 달라져도 말씀의 길을 걷게 하소서.','우리의 관계와 선택으로 복음을 전하게 하소서.','예수 그리스도의 이름으로 기도합니다. 아멘.']}
  ];

  const storageKey='ekodi:church:worship:2026-10-11:slide';
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
    try{channel=new BroadcastChannel('ekodi-church-worship-20261011');channel.onmessage=event=>applyState(event.data);}catch{}
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