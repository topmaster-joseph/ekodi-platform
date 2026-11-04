/* Role-aware EKODI Education home: view-only navigation, never authorization. */
(() => {
  'use strict';
  const main=document.querySelector('main.visual-home');
  if(!main)return;
  const tabs=[
    ['mine','나의 배움'],['explore','배움찾기'],['courses','교육과정'],
    ['community','커뮤니티'],['support','교육지원']
  ];
  const nav=document.createElement('nav');
  nav.className='edu-tabs';
  nav.setAttribute('aria-label','교육서비스 탭');
  const buttons=new Map();
  for(const [id,label] of tabs){
    const button=document.createElement('button');
    button.type='button';button.textContent=label;
    button.dataset.eduTarget=id;button.setAttribute('aria-pressed','false');
    nav.append(button);buttons.set(id,button);
  }
  main.prepend(nav);
  const service=document.querySelector('.visual-services');
  if(service){service.classList.add('edu-service-panel');main.insertBefore(service,document.querySelector('#learningCommunity'));}
  const groups={
    mine:['.my-learning-section','#today'],
    explore:['.hero','.discover-section','.paths-section'],
    courses:['.edu-service-panel','.visual-banners','section[aria-labelledby="areasTitle"]'],
    community:['#learningCommunity'],
    support:['#resources']
  };
  const managed=[];
  for(const [tab,selectors] of Object.entries(groups)){
    for(const selector of selectors){
      const el=document.querySelector(selector);
      if(el){el.dataset.eduPanel=tab;managed.push(el);}
    }
  }
  let active='explore';
  let authenticated=false;
  let resolved=false;
  const tabFromHash=()=>{
    const hash=location.hash.slice(1);
    const target=hash?document.getElementById(hash):null;
    return target?.closest('[data-edu-panel]')?.dataset.eduPanel||null;
  };
  function paint(){
    const visibleTabs=authenticated?tabs.map(t=>t[0]):['explore','courses','community','support'];
    if(!visibleTabs.includes(active))active=authenticated?'mine':'explore';
    for(const [id,button] of buttons){
      button.hidden=!visibleTabs.includes(id);
      const selected=id===active;
      button.setAttribute('aria-pressed',String(selected));
      button.classList.toggle('is-active',selected);
    }
    for(const el of managed){
      const show=resolved && el.dataset.eduPanel===active &&
        (authenticated || !['mine'].includes(el.dataset.eduPanel));
      el.hidden=!show;
    }
    document.body.dataset.eduView=authenticated?'member':resolved?'guest':'pending';
    nav.hidden=!resolved;
    document.querySelector('.visual-sidebar')?.setAttribute('hidden','');
    const heroHeading=document.querySelector('#heroTitle');
    if(heroHeading && !authenticated)heroHeading.textContent='누구나 배울 수 있는 EKODI Education';
  }
  function activate(id,scroll=true){
    if(!buttons.has(id))return;
    active=id;paint();
    if(scroll)nav.scrollIntoView({block:'start',behavior:'smooth'});
  }
  nav.addEventListener('click',event=>{
    const button=event.target.closest('button[data-edu-target]');
    if(button)activate(button.dataset.eduTarget);
  });
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');
    if(!link)return;
    const section=document.querySelector(link.getAttribute('href'));
    const tab=section?.closest('[data-edu-panel]')?.dataset.eduPanel;
    if(tab)activate(tab,false);
  });
  window.addEventListener('hashchange',()=>{
    const tab=tabFromHash();if(tab)activate(tab,false);
  });
  document.addEventListener('ekodi-edu-session',event=>{
    authenticated=Boolean(event.detail?.authenticated);
    resolved=true;
    active=tabFromHash()||(authenticated?'mine':'explore');
    paint();
  });
  // Never expose member-only sections before the existing auth client resolves.
  paint();
})();