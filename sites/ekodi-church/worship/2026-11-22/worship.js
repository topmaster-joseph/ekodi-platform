(() => {
  'use strict';
  const allowedViews = new Set(['bulletin','operator','stage','vertical']);
  const query = new URLSearchParams(location.search);
  const view = allowedViews.has(query.get('view')) ? query.get('view') : 'bulletin';
  document.body.dataset.view = view;
  document.querySelectorAll('[data-mode-link]').forEach(link => {
    if (link.dataset.modeLink === view) link.setAttribute('aria-current','page');
  });

  // Public, fixed data derived from the 2026-11-22 worship preparation packet.
  // No viewer data, platform tokens, stream keys or unpublished member content.
  const slides = [
  {
    "title": "에코디교회",
    "kicker": "2026.11.22 · 추수감사주일",
    "lines": [
      "공동의 유익을 위한 은사",
      "고린도전서 12:1–11"
    ],
    "cover": true
  },
  {
    "title": "경배찬양",
    "kicker": "Praise & Worship",
    "lines": [
      "다같이"
    ]
  },
  {
    "title": "예배부름",
    "kicker": "Call to Worship",
    "lines": [
      "인도자"
    ]
  },
  {
    "title": "공동고백",
    "kicker": "Community Confession",
    "lines": [
      "다같이"
    ]
  },
  {
    "title": "입례찬송",
    "kicker": "Processional Hymn",
    "lines": [
      "다같이"
    ]
  },
  {
    "title": "대표기도",
    "kicker": "Congregational Prayer",
    "lines": [
      "맡은이"
    ]
  },
  {
    "title": "헌금찬송",
    "kicker": "Offertory Hymn",
    "lines": [
      "다같이"
    ]
  },
  {
    "title": "말씀봉독",
    "kicker": "Scripture Reading: 고린도전서 12:1–11",
    "lines": [
      "고린도전서 12:1–11"
    ]
  },
  {
    "title": "말씀찬송",
    "kicker": "Hymn before the Sermon",
    "lines": [
      "다같이"
    ]
  },
  {
    "title": "말씀선포",
    "kicker": "Proclamation of the Word · 공동의 유익을 위한 은사",
    "lines": [
      "공동의 유익을 위한 은사",
      "정찬균 목사"
    ]
  },
  {
    "title": "말씀기도",
    "kicker": "Prayer in Response to the Word",
    "lines": [
      "말씀에 응답하는 기도"
    ]
  },
  {
    "title": "결단찬송",
    "kicker": "Hymn of Commitment",
    "lines": [
      "다같이"
    ]
  },
  {
    "title": "교회소식",
    "kicker": "Church Announcements",
    "lines": [
      "인도자"
    ]
  },
  {
    "title": "파송찬송",
    "kicker": "Sending Hymn",
    "lines": [
      "다같이"
    ]
  },
  {
    "title": "주기도문",
    "kicker": "The Lord's Prayer",
    "lines": [
      "다같이"
    ]
  }
];

  const storageKey='ekodi:church:worship:2026-11-22:slide';
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
    try{channel=new BroadcastChannel('ekodi-church-worship-20261122');channel.onmessage=event=>applyState(event.data);}catch{}
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