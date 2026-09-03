(() => {
  'use strict';

  const VERSION=2;
  const DEFAULT={
    accent:'#315d48',accent2:'#7fa9c8',warm:'#c79a45',leaf:'#6f9e7a',paper:'#fffdf8',ink:'#25332b',
    radius:'18px',softRadius:'12px',shadow:'0 18px 48px rgba(24,38,31,.10)',density:'medium',motion:'gentle'
  };
  const DESIGNS={
    church:{accent:'#2f5a47',accent2:'#d8c79a',warm:'#b99146',leaf:'#6f8f6d',paper:'#fbf7ea',ink:'#20372d',radius:'2px',softRadius:'2px',density:'low',motion:'still',mood:'sanctuary'},
    community:{accent:'#6f936d',accent2:'#d6b35f',warm:'#d19a58',leaf:'#3f684f',paper:'#fffaf0',ink:'#31463a',radius:'28px',softRadius:'999px',density:'medium',motion:'gentle',mood:'neighborhood-commons'},
    cafe:{accent:'#9b6b47',accent2:'#246b78',warm:'#d7a764',leaf:'#73876d',paper:'#fff8ed',ink:'#30424a',radius:'34px',softRadius:'24px',density:'low-medium',motion:'drift',mood:'harbor-commons'},
    books:{accent:'#15335a',accent2:'#7f2538',warm:'#b49a6b',leaf:'#65716a',paper:'#fbf6ea',ink:'#1d2a39',radius:'0px',softRadius:'2px',density:'medium-high',motion:'page',mood:'academic-press'},
    publishing:{accent:'#a05f3f',accent2:'#477f7d',warm:'#c7834c',leaf:'#748d75',paper:'#fff8eb',ink:'#2c2a27',radius:'8px',softRadius:'4px',density:'medium-high',motion:'proof',mood:'publisher-workroom'},
    journal:{accent:'#355d50',accent2:'#6f86a8',warm:'#d7a54a',leaf:'#6f8f70',paper:'#fffdf7',ink:'#1f2a32',radius:'10px',softRadius:'6px',density:'medium',motion:'turn',mood:'living-record'},
    author:{accent:'#b9f227',accent2:'#72f0c8',warm:'#d5ff62',leaf:'#95c83d',paper:'#111411',ink:'#f4f7ef',radius:'14px',softRadius:'10px',density:'medium-high',motion:'pulse',mood:'writing-lab'},
    lab:{accent:'#c05d2d',accent2:'#2b6da1',warm:'#d89a56',leaf:'#687d68',paper:'#fbf1df',ink:'#30302d',radius:'3px',softRadius:'3px',density:'medium-high',motion:'measured',mood:'field-research-journal'},
    work:{accent:'#245fda',accent2:'#7ba7d9',warm:'#dca74a',leaf:'#778b81',paper:'#f8fbff',ink:'#1f2937',radius:'7px',softRadius:'6px',density:'high',motion:'snappy',mood:'precision-workbench'},
    social:{accent:'#2a8cff',accent2:'#63e0ff',warm:'#e6aa55',leaf:'#6f9486',paper:'#081425',ink:'#f4f8ff',radius:'18px',softRadius:'12px',density:'high',motion:'stream',mood:'signal-stream'},
    messenger:{accent:'#0e8e91',accent2:'#c9f4f5',warm:'#e0b867',leaf:'#6b9c8f',paper:'#071b28',ink:'#effcfc',radius:'16px',softRadius:'999px',density:'medium-high',motion:'immediate',mood:'conversation-switchboard'},
    energy:{accent:'#e5a414',accent2:'#3e91bd',warm:'#ffd35b',leaf:'#3f8b55',paper:'#0d1a24',ink:'#f3f8f2',radius:'20px',softRadius:'999px',density:'medium-high',motion:'flow',mood:'solar-grid'},
    business:{accent:'#3aae91',accent2:'#dda74d',warm:'#dda74d',leaf:'#678b78',paper:'#f7f5ee',ink:'#252a29',radius:'6px',softRadius:'4px',density:'high',motion:'gated',mood:'operator-cockpit'},
    mall:{accent:'#ee725b',accent2:'#245dcc',warm:'#f1c54a',leaf:'#70a16f',paper:'#fff7e9',ink:'#273149',radius:'26px',softRadius:'999px',density:'medium',motion:'bouncy',mood:'curated-market'},
    marketing:{accent:'#7428b8',accent2:'#ff7b42',warm:'#ffab48',leaf:'#6f9976',paper:'#fbf5ff',ink:'#311c3c',radius:'22px',softRadius:'16px',density:'medium-high',motion:'kinetic',mood:'campaign-studio'},
    biz:{accent:'#3f3b36',accent2:'#b18a49',warm:'#c9a35d',leaf:'#77806e',paper:'#f3efe7',ink:'#242321',radius:'4px',softRadius:'2px',density:'high',motion:'restrained',mood:'business-briefing'},
    trade:{accent:'#00b9df',accent2:'#79e5ff',warm:'#c9a652',leaf:'#628f86',paper:'#07131e',ink:'#eefcff',radius:'5px',softRadius:'3px',density:'high',motion:'terminal',mood:'global-terminal'},
    invest:{accent:'#315f4d',accent2:'#b6d337',warm:'#b89b57',leaf:'#708d69',paper:'#f4ecd9',ink:'#23362c',radius:'2px',softRadius:'2px',density:'high',motion:'deliberate',mood:'investment-dossier'},
    pay:{accent:'#14855f',accent2:'#8bb8c4',warm:'#c7aa6b',leaf:'#5f9674',paper:'#ffffff',ink:'#10253a',radius:'10px',softRadius:'8px',density:'medium',motion:'quiet',mood:'trust-ledger'},
    insurance:{accent:'#2859c7',accent2:'#a9d8f2',warm:'#d8b36c',leaf:'#719384',paper:'#f6fbff',ink:'#1d3554',radius:'20px',softRadius:'14px',density:'medium',motion:'calm',mood:'protective-clarity'},
    edu:{accent:'#3559bb',accent2:'#f0c63d',warm:'#f0c63d',leaf:'#70a373',paper:'#fffdf3',ink:'#26324c',radius:'12px',softRadius:'8px',density:'medium',motion:'progress',mood:'learning-studio'},
    media:{accent:'#e33e45',accent2:'#f8f8f8',warm:'#d69a4e',leaf:'#77877d',paper:'#0b0b0d',ink:'#ffffff',radius:'0px',softRadius:'0px',density:'medium',motion:'cut',mood:'broadcast-stage'},
    my:{accent:'#48bddd',accent2:'#b8a8ff',warm:'#e8bd67',leaf:'#6b9b82',paper:'#0e1b35',ink:'#f5fbff',radius:'24px',softRadius:'18px',density:'medium',motion:'orbit',mood:'personal-constellation'},
    mail:{accent:'#3575bd',accent2:'#9dbbd4',warm:'#cba760',leaf:'#788d7b',paper:'#fbf4e6',ink:'#24303e',radius:'3px',softRadius:'3px',density:'high',motion:'quiet',mood:'correspondence-desk'},
    live:{accent:'#ff665d',accent2:'#b2a7df',warm:'#e8ac54',leaf:'#718b78',paper:'#17191c',ink:'#ffffff',radius:'12px',softRadius:'8px',density:'medium',motion:'live',mood:'live-stage'},
    cloud:{accent:'#4f7fa8',accent2:'#a7d5e6',warm:'#c8aa6c',leaf:'#6f9383',paper:'#f7fbfd',ink:'#1d2c3b',radius:'14px',softRadius:'10px',density:'medium-high',motion:'ordered',mood:'cloud-library'},
    money:{accent:'#2f7e5c',accent2:'#7da8c7',warm:'#d5ad57',leaf:'#6c9274',paper:'#fafdf9',ink:'#1f3329',radius:'8px',softRadius:'6px',density:'high',motion:'quiet',mood:'money-ledger'},
    support:{accent:'#5f8d76',accent2:'#7899bd',warm:'#d7ad5b',leaf:'#709778',paper:'#fbfaf5',ink:'#27352d',radius:'16px',softRadius:'10px',density:'medium',motion:'gentle',mood:'opportunity-desk'}
  };
  const HOST_ALIAS={'ins':'insurance'};

  function serviceId(){
    const explicit=document.documentElement.dataset.ekodiService||document.body?.dataset?.ekodiService;
    if(explicit)return String(explicit).toLowerCase();
    const sub=String(location.hostname||'').split('.')[0].toLowerCase();
    return HOST_ALIAS[sub]||sub||'my';
  }
  function designFor(id=serviceId()){return {...DEFAULT,...(DESIGNS[id]||DESIGNS.my)};}
  function apply(id=serviceId()){
    const d=designFor(id);const root=document.documentElement;const style=root.style;
    root.dataset.ekodiService=id;
    root.dataset.ekodiDesignInheritance=`v${VERSION}`;
    root.dataset.ekodiDesignMood=d.mood;
    root.dataset.ekodiDesignDensity=d.density;
    root.dataset.ekodiDesignMotion=d.motion;
    style.setProperty('--ekodi-service-accent',d.accent);
    style.setProperty('--ekodi-service-accent-2',d.accent2);
    style.setProperty('--ekodi-service-warm',d.warm);
    style.setProperty('--ekodi-service-leaf',d.leaf);
    style.setProperty('--ekodi-service-paper',d.paper);
    style.setProperty('--ekodi-service-ink',d.ink);
    style.setProperty('--ekodi-service-radius',d.radius);
    style.setProperty('--ekodi-service-radius-soft',d.softRadius);
    style.setProperty('--ekodi-service-shadow',d.shadow);
    style.setProperty('--ekodi-service-density',d.density);
    style.setProperty('--ekodi-service-motion',d.motion);
    style.setProperty('--ekodi-ill-accent',d.accent);
    style.setProperty('--ekodi-ill-sky',d.accent2);
    style.setProperty('--ekodi-ill-sun',d.warm);
    style.setProperty('--ekodi-ill-leaf',d.leaf);
    if(!style.getPropertyValue('--accent'))style.setProperty('--accent',d.accent);
    window.dispatchEvent(new CustomEvent('ekodi:design-inherited',{detail:{service:id,version:VERSION,design:d}}));
    return d;
  }

  const css=`
  :root[data-ekodi-design-inheritance]{
    --ekodi-card-radius:var(--ekodi-service-radius);
    --ekodi-button-radius:var(--ekodi-service-radius-soft);
    --ekodi-panel-shadow:var(--ekodi-service-shadow);
  }
  :root[data-ekodi-design-inheritance] .ekodi-card,
  :root[data-ekodi-design-inheritance] [data-ekodi-card],
  :root[data-ekodi-design-inheritance] .ekodi-panel{
    border-radius:var(--ekodi-service-radius)!important;
  }
  :root[data-ekodi-design-inheritance] .ekodi-primary,
  :root[data-ekodi-design-inheritance] [data-ekodi-primary],
  :root[data-ekodi-design-inheritance] .ekodi-cta{
    background:var(--ekodi-service-accent)!important;
  }
  :root[data-ekodi-design-inheritance] .ekodi-soft-surface,
  :root[data-ekodi-design-inheritance] [data-ekodi-soft-surface]{
    background:color-mix(in srgb,var(--ekodi-service-accent) 8%,var(--ekodi-service-paper))!important;
  }
  :root[data-ekodi-design-inheritance] .ekodi-friendly-empty,
  :root[data-ekodi-design-inheritance] .ekodi-friendly-welcome,
  :root[data-ekodi-design-inheritance] .ekodi-message-ui{
    --accent:var(--ekodi-service-accent);
  }
  [data-ekodi-shell-surface="admin"]{--ekodi-service-shadow:0 10px 30px rgba(0,0,0,.16)}
  [data-ekodi-shell-surface="admin"] .ekodi-illustration{filter:saturate(.72);opacity:.9}
  @media(prefers-reduced-motion:reduce){:root[data-ekodi-design-inheritance]{scroll-behavior:auto!important}}
  `;
  function installStyles(){if(document.getElementById('ekodi-service-design-inheritance-style'))return;const s=document.createElement('style');s.id='ekodi-service-design-inheritance-style';s.textContent=css;document.head.appendChild(s);}
  function boot(){installStyles();apply();}

  window.EKODIServiceDesign=Object.freeze({version:VERSION,designs:Object.freeze({...DESIGNS}),serviceId,designFor,apply});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
