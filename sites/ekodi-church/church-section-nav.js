// EKODI Church single-content navigation. Only the selected subject is visible.
// Preserve the original deep links, tenant boundaries, and locally saved private records.
(() => {
  'use strict';
  const main=document.querySelector('body > main');
  if(!main) return;
  const sections=[...main.children].filter(node=>node.matches('section'));
  const strip=document.createElement('nav');
  strip.className='church-section-subnav';
  strip.setAttribute('aria-label','선택한 메뉴의 세부 항목');
  strip.hidden=true;
  main.prepend(strip);

  const categories={
    worship:[
      ['예배안내','#worship'],
      ['주보·PPT','#weekly-worship'],
      ['온라인 방송','#online']
    ],
    together:[
      ['교회소개','#about'],
      ['공동체','#community'],
      ['협력소식','#partner-news'],
      ['오시는 길','#location'],
      ['참여·후원','/ekodichurch/together/'],
      ['큐티인 신청','/qtin/church']
    ]
  };
  const match={
    worship:'worship','weekly-worship':'worship',online:'worship',
    together:'together',about:'together',community:'together',
    'partner-news':'together',location:'together'
  };
  const targetSections={
    home:['hero','church-public-panels'],
    worship:['worship'],
    'weekly-worship':['weekly-worship'],
    online:['online'],
    together:['community'],
    about:['about'],
    community:['community'],
    'partner-news':['partner-news'],
    location:['location'],
    message:['message'],
    'church-schedules':['church-public-panels'],
    notices:['church-public-panels'],
    schedule:['church-public-panels']
  };
  const name=node=>node.id||(['hero','church-public-panels'].find(v=>node.classList.contains(v))||'');
  const current=()=>{
    let key='home';
    try{key=decodeURIComponent(location.hash.slice(1)||'home')}catch{return 'home'}
    if(Object.hasOwn(targetSections,key))return key;
    const target=document.getElementById(key);
    const section=target&&sections.find(item=>item.contains(target));
    return section?name(section):'home';
  };

  function show(){
    const key=Object.hasOwn(targetSections,current())?current():'home';
    const showing=new Set(targetSections[key]);
    sections.forEach(section=>section.classList.toggle('church-section-active',showing.has(name(section))));
    main.classList.add('church-section-filtered');
    document.body.dataset.churchSelectedSection=key;
    const group=match[key];
    strip.replaceChildren();
    if(group){
      const choices=categories[group];
      for(const [label,url] of choices){
        const link=document.createElement('a');
        link.href=url;
        link.textContent=label;
        const active=url==='#'+key||(key==='together'&&url==='#community');
        if(active)link.setAttribute('aria-current','page');
        strip.append(link);
      }
      strip.hidden=false;
    }else strip.hidden=true;
    document.querySelectorAll('.site-header #main-nav a').forEach(link=>{
      if(!link.hash || !['#worship','#together'].includes(link.hash))return;
      if(group&&link.hash==='#'+group)link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    window.EKODIChurchI18n?.refresh?.();
    // URL back/forward navigation also restores the selected content.
    if(key!=='home'){
      const focus=strip.hidden?sections.find(node=>showing.has(name(node))):strip;
      if(focus && location.hash){
        requestAnimationFrame(()=>focus.scrollIntoView({block:'start',behavior:'auto'}));
      }
    }
  }
  window.addEventListener('hashchange',show);
  show();
})();
