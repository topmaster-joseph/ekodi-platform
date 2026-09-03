(() => {
  'use strict';

  const STYLE_ID='ekodi-illustration-system-style';
  const SERVICE_SCENES={
    church:'people-gathering',community:'neighborhood-circle',social:'signal-picnic',cafe:'harbor-cafe',biz:'small-business-day',business:'operator-table',mall:'market-street',marketing:'creative-studio',trade:'connected-route',invest:'diligence-table',support:'opportunity-desk',pay:'trust-ledger',books:'reading-room',publishing:'publishing-desk',author:'creator-room',lab:'field-research',edu:'learning-table',my:'personal-journey',work:'project-workbench',energy:'sunny-grid',insurance:'protective-home',messenger:'conversation-bridge',mail:'correspondence-desk',live:'small-stage',cloud:'shared-library',media:'story-studio'
  };

  const css=`
  :root{--ekodi-ill-ink:#28352e;--ekodi-ill-skin:#f2c7a8;--ekodi-ill-paper:#fffdf8;--ekodi-ill-leaf:#83b58c;--ekodi-ill-sun:#f1c76b;--ekodi-ill-sky:#a9d2e5;--ekodi-ill-accent:var(--accent,#78b89b)}
  .ekodi-illustration{position:relative;display:grid;place-items:center;isolation:isolate;color:var(--ekodi-ill-ink)}
  .ekodi-illustration svg{display:block;width:100%;height:auto;overflow:visible}
  .ekodi-illustration[data-size="sm"]{width:min(100%,140px)}.ekodi-illustration[data-size="md"]{width:min(100%,220px)}.ekodi-illustration[data-size="lg"]{width:min(100%,340px)}
  .ekodi-illustration__float{transform-origin:center;animation:ekodi-ill-float 4.8s ease-in-out infinite}.ekodi-illustration__breathe{transform-origin:center;animation:ekodi-ill-breathe 5.4s ease-in-out infinite}
  @keyframes ekodi-ill-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}@keyframes ekodi-ill-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.018)}}
  [data-ekodi-shell-surface="admin"] .ekodi-illustration{filter:saturate(.72);opacity:.92}
  [data-ekodi-shell-surface="admin"] .ekodi-illustration[data-size="lg"]{width:min(100%,220px)}
  .ekodi-friendly-empty{display:grid;justify-items:center;gap:14px;padding:28px;text-align:center}.ekodi-friendly-empty .ekodi-illustration{margin-bottom:2px}
  .ekodi-friendly-welcome{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:24px}.ekodi-friendly-welcome .ekodi-illustration{max-width:180px}
  @media(max-width:680px){.ekodi-friendly-welcome{grid-template-columns:1fr}.ekodi-friendly-welcome .ekodi-illustration{max-width:150px}}
  @media(prefers-reduced-motion:reduce){.ekodi-illustration__float,.ekodi-illustration__breathe{animation:none!important}}
  `;

  function installStyles(){if(document.getElementById(STYLE_ID))return;const s=document.createElement('style');s.id=STYLE_ID;s.textContent=css;document.head.appendChild(s);}
  function serviceId(){return document.documentElement.dataset.ekodiService||document.body?.dataset?.ekodiService||location.hostname.split('.')[0]||'my';}
  function sceneFor(service=serviceId()){return SERVICE_SCENES[service]||'personal-journey';}
  function person(x,y,scale=1,shirt='var(--ekodi-ill-accent)'){return `<g transform="translate(${x} ${y}) scale(${scale})"><circle cx="0" cy="-22" r="11" fill="var(--ekodi-ill-skin)" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M-12-24c3-11 19-13 24 0-4-2-7-5-9-9-5 6-10 8-15 9Z" fill="var(--ekodi-ill-ink)"/><path d="M-15-7c8-8 22-8 30 0l5 30h-40l5-30Z" fill="${shirt}" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M-6-19h2M5-19h2" stroke="var(--ekodi-ill-ink)" stroke-width="2" stroke-linecap="round"/><path d="M-4-13c3 2 5 2 8 0" stroke="var(--ekodi-ill-ink)" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>`;}
  function tree(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M0 4v30" stroke="#7b5a3f" stroke-width="5" stroke-linecap="round"/><circle cx="0" cy="-10" r="20" fill="var(--ekodi-ill-leaf)"/><circle cx="-13" cy="-1" r="13" fill="#9ac49f"/><circle cx="13" cy="0" r="14" fill="#79aa82"/></g>`;}
  function house(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-35 4 0-24 35 4v38h-70Z" fill="var(--ekodi-ill-paper)" stroke="var(--ekodi-ill-ink)" stroke-width="2.5"/><path d="M-41 5 0-31 41 5" fill="none" stroke="var(--ekodi-ill-ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><rect x="-9" y="20" width="18" height="22" rx="3" fill="#d9b98a"/><rect x="15" y="12" width="12" height="12" rx="2" fill="var(--ekodi-ill-sky)"/></g>`;}
  function table(x,y,w=90){return `<g transform="translate(${x} ${y})"><rect x="${-w/2}" y="0" width="${w}" height="11" rx="5" fill="#c69362" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M${-w/2+12} 10v25M${w/2-12} 10v25" stroke="var(--ekodi-ill-ink)" stroke-width="3"/></g>`;}
  function book(x,y,s=1){return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-24 0c12-5 21-3 24 2v27c-7-5-15-6-24-3Z" fill="#f7efe1" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M24 0C12-5 3-3 0 2v27c7-5 15-6 24-3Z" fill="#fff8ec" stroke="var(--ekodi-ill-ink)" stroke-width="2"/></g>`;}
  function sparkle(x,y,s=1){return `<g class="ekodi-illustration__float" transform="translate(${x} ${y}) scale(${s})"><path d="M0-12 4-4 12 0 4 4 0 12-4 4-12 0-4-4Z" fill="var(--ekodi-ill-sun)"/></g>`;}

  function sceneSvg(scene){
    const common=`<ellipse cx="160" cy="214" rx="118" ry="16" fill="rgba(100,120,105,.09)"/>`;
    const people=`${person(115,155,1,'#8fc6a4')}${person(205,158,.92,'#9eb8e7')}`;
    const scenes={
      'people-gathering':`${common}${tree(260,145,.9)}${table(160,175,92)}${book(160,158,.72)}${people}${sparkle(250,62,.8)}`,
      'neighborhood-circle':`${common}${tree(66,145,.95)}${house(253,148,.75)}${people}${person(160,145,.82,'#e8b58f')}`,
      'signal-picnic':`${common}${tree(70,148,.9)}${people}<path d="M145 92c14-13 32-13 46 0" fill="none" stroke="var(--ekodi-ill-accent)" stroke-width="4" stroke-linecap="round"/>${sparkle(245,70,.7)}`,
      'harbor-cafe':`${common}${house(245,148,.7)}${table(150,176,90)}${person(120,154,.9,'#8fc6a4')}${person(190,154,.88,'#d1ad7a')}<path d="M142 160h16v12h-16z" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>`,
      'small-business-day':`${common}${house(236,149,.8)}${person(105,158,.96,'#d0ad76')}${person(170,156,.88,'#8eb7d9')}<rect x="82" y="85" width="78" height="43" rx="7" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>${sparkle(260,65,.7)}`,
      'operator-table':`${common}${table(162,173,130)}${people}<rect x="139" y="123" width="46" height="28" rx="5" fill="#e7f3f7" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>${sparkle(262,70,.7)}`,
      'market-street':`${common}${house(238,149,.82)}${person(105,158,.95,'#ef9d82')}${person(170,158,.86,'#f2c95b')}<path d="M211 104h55l-8 17h-39Z" fill="#f3a07f" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>`,
      'creative-studio':`${common}${people}<rect x="205" y="92" width="58" height="58" rx="8" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M216 132l15-18 10 10 11-15" fill="none" stroke="var(--ekodi-ill-accent)" stroke-width="4"/>${sparkle(77,72,.9)}${sparkle(271,58,.65)}`,
      'connected-route':`${common}${people}<path d="M69 128c42-58 143-63 188-8" fill="none" stroke="var(--ekodi-ill-sky)" stroke-width="4" stroke-dasharray="7 8"/><rect x="55" y="142" width="36" height="30" rx="4" fill="#d5b37a" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>${sparkle(258,78,.65)}`,
      'diligence-table':`${common}${table(162,174,126)}${people}<rect x="141" y="124" width="44" height="31" rx="3" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M150 134h26M150 142h18" stroke="#88a884" stroke-width="2"/>`,
      'opportunity-desk':`${common}${table(165,175,120)}${person(128,155,.95,'#9cc4a8')}<rect x="170" y="112" width="52" height="48" rx="5" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M183 105v14M208 105v14M178 130h36" stroke="var(--ekodi-ill-accent)" stroke-width="3"/>${sparkle(245,69,.8)}`,
      'trust-ledger':`${common}${people}<path d="M236 93 258 102v18c0 17-10 28-22 34-12-6-22-17-22-34v-18Z" fill="#dff4e8" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="m226 120 7 7 14-16" fill="none" stroke="#4c9d70" stroke-width="4"/>`,
      'reading-room':`${common}${tree(259,145,.85)}${person(108,158,.95,'#c99184')}${person(202,158,.88,'#8ca9cc')}${book(156,136,1)}${sparkle(75,71,.7)}`,
      'publishing-desk':`${common}${table(164,175,122)}${person(118,155,.95,'#ba8b7c')}${book(181,132,.85)}<rect x="218" y="110" width="35" height="48" rx="3" fill="#f7efe1" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>${sparkle(262,68,.65)}`,
      'creator-room':`${common}${person(144,158,1,'#b7d86f')}<rect x="186" y="108" width="55" height="49" rx="6" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M198 142c16-18 25-19 33-25" stroke="var(--ekodi-ill-accent)" stroke-width="3" fill="none"/>${sparkle(242,68,.9)}${sparkle(87,83,.6)}`,
      'field-research':`${common}${tree(252,145,.9)}${person(120,158,.95,'#d99a69')}<circle cx="204" cy="117" r="17" fill="none" stroke="var(--ekodi-ill-ink)" stroke-width="4"/><path d="m216 130 18 18" stroke="var(--ekodi-ill-ink)" stroke-width="5" stroke-linecap="round"/><rect x="78" y="103" width="38" height="49" rx="4" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>`,
      'learning-table':`${common}${table(163,175,124)}${people}${book(164,133,.78)}${sparkle(258,66,.75)}`,
      'personal-journey':`${common}${house(245,148,.72)}${tree(68,147,.9)}${person(154,162,1,'#8dbde1')}<path d="M148 195c-39 9-61 2-81-8M165 195c36 7 58 2 78-9" fill="none" stroke="#d9bd81" stroke-width="7" stroke-linecap="round" opacity=".7"/>${sparkle(232,62,.8)}`,
      'project-workbench':`${common}${table(164,174,130)}${people}<rect x="134" y="105" width="59" height="40" rx="5" fill="#eef4ff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M145 118h37M145 128h27" stroke="var(--ekodi-ill-accent)" stroke-width="3"/>`,
      'sunny-grid':`${common}${house(218,149,.82)}${tree(73,146,.9)}<circle cx="250" cy="64" r="22" fill="var(--ekodi-ill-sun)"/><path d="M111 112h72l-8 38h-72Z" fill="#96c8dd" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>${person(102,161,.82,'#8bc795')}`,
      'protective-home':`${common}${house(216,149,.83)}${person(102,161,.9,'#9db8e8')}<path d="M73 111c15-22 52-22 67 0h-67Z" fill="#a9c8ef" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M106 111v45" stroke="var(--ekodi-ill-ink)" stroke-width="3"/>`,
      'conversation-bridge':`${common}${people}<path d="M96 128c31-28 98-28 129 0" fill="none" stroke="#8ecbd1" stroke-width="7" stroke-linecap="round"/><rect x="83" y="80" width="44" height="28" rx="12" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><rect x="205" y="74" width="42" height="27" rx="12" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>${sparkle(160,69,.65)}`,
      'correspondence-desk':`${common}${table(165,175,120)}${person(123,156,.95,'#8eaed6')}<path d="M177 118h65v42h-65Z" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="m178 119 31 25 32-25" fill="none" stroke="var(--ekodi-ill-accent)" stroke-width="3"/>${tree(265,157,.58)}`,
      'small-stage':`${common}<rect x="85" y="112" width="150" height="68" rx="10" fill="#fff7f0" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>${people}<circle cx="255" cy="88" r="15" fill="#ff8a78"/><path d="M250 88h10" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
      'shared-library':`${common}${people}<rect x="215" y="92" width="58" height="75" rx="7" fill="#eef4f7" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="M226 108h36M226 124h36M226 140h36" stroke="#9ab7c8" stroke-width="5"/><path d="M80 94c9-15 31-16 42-2 17-5 31 7 31 21H73c0-10 3-15 7-19Z" fill="#d8eaf3" stroke="var(--ekodi-ill-ink)" stroke-width="2"/>`,
      'story-studio':`${common}${person(112,160,.95,'#e88986')}<rect x="176" y="103" width="76" height="52" rx="7" fill="#fff" stroke="var(--ekodi-ill-ink)" stroke-width="2"/><path d="m204 116 23 13-23 13Z" fill="var(--ekodi-ill-accent)"/>${sparkle(262,70,.7)}`
    };
    return `<svg viewBox="0 0 320 230" aria-hidden="true" focusable="false"><g class="ekodi-illustration__breathe">${scenes[scene]||scenes['personal-journey']}</g></svg>`;
  }

  function render(target,{scene=sceneFor(),size='md'}={}){installStyles();const host=typeof target==='string'?document.querySelector(target):target;if(!host)return null;host.classList.add('ekodi-illustration');host.dataset.size=size;host.dataset.scene=scene;host.setAttribute('aria-hidden','true');host.innerHTML=sceneSvg(scene);return host;}
  function create(options={}){const el=document.createElement('div');render(el,options);return el;}
  function upgrade(root=document){
    root.querySelectorAll('[data-ekodi-illustration]').forEach(node=>{if(node.dataset.ekodiIllustrationReady)return;node.dataset.ekodiIllustrationReady='true';render(node,{scene:node.dataset.ekodiIllustration||sceneFor(),size:node.dataset.illustrationSize||'md'});});
    root.querySelectorAll('[data-ekodi-empty-state]').forEach(node=>{if(node.dataset.ekodiFriendlyReady)return;node.dataset.ekodiFriendlyReady='true';node.classList.add('ekodi-friendly-empty');node.prepend(create({scene:node.dataset.ekodiIllustration||sceneFor(),size:'sm'}));});
    root.querySelectorAll('[data-ekodi-welcome]').forEach(node=>{if(node.dataset.ekodiFriendlyReady)return;node.dataset.ekodiFriendlyReady='true';node.classList.add('ekodi-friendly-welcome');node.append(create({scene:node.dataset.ekodiIllustration||sceneFor(),size:'sm'}));});
  }
  function enhanceMessageUI(){document.querySelectorAll('.ekodi-message-ui__visual').forEach(v=>{if(v.dataset.ekodiIllustrationEnhanced)return;v.dataset.ekodiIllustrationEnhanced='true';v.innerHTML=sceneSvg(sceneFor());});}
  function observe(){const observer=new MutationObserver(()=>{upgrade();enhanceMessageUI();});observer.observe(document.documentElement,{childList:true,subtree:true});}
  function installEkodian(){if(window.EKODIAN||document.querySelector('script[data-ekodian-runtime]'))return;const script=document.createElement('script');const base=document.currentScript?.src||'https://shell.ekodi.kr/illustration-system.js';script.src=new URL('/character-system.js',base).toString();script.defer=true;script.dataset.ekodianRuntime='v2';script.dataset.ekodiService=serviceId();script.dataset.ekodiSurface=document.documentElement.dataset.ekodiUserSurface||'public';document.head.appendChild(script);}

  window.EKODIIllustration=Object.freeze({version:1,scenes:{...SERVICE_SCENES},sceneFor,render,create,upgrade});
  installStyles();
  const boot=()=>{document.documentElement.dataset.ekodiIllustrationSystem='v1';upgrade();enhanceMessageUI();installEkodian();observe();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
