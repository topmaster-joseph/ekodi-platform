(() => {
  'use strict';

  const VERSION=1;
  const DEFAULT={
    accent:'#78b89b',accent2:'#a9d2e5',warm:'#f1c76b',leaf:'#83b58c',paper:'#fffdf8',ink:'#28352e',
    radius:'22px',softRadius:'16px',shadow:'0 18px 48px rgba(49,75,61,.10)',density:'friendly',motion:'gentle'
  };
  const DESIGNS={
    my:{accent:'#78b89b',accent2:'#9fc9e8',warm:'#f1c76b',leaf:'#83b58c',mood:'personal-journey'},
    marketing:{accent:'#d98aa3',accent2:'#9eafe8',warm:'#f3c36b',leaf:'#91bb91',mood:'creative-studio'},
    community:{accent:'#77b99a',accent2:'#a7cfe0',warm:'#efc06f',leaf:'#7fb787',mood:'neighborhood-circle'},
    church:{accent:'#8cab83',accent2:'#a7c6de',warm:'#e8bf73',leaf:'#79aa82',mood:'people-gathering'},
    business:{accent:'#7396b8',accent2:'#92c4bf',warm:'#dbb36e',leaf:'#829e85',mood:'operator-table'},
    biz:{accent:'#c58f63',accent2:'#8eb7d9',warm:'#efc466',leaf:'#86ad82',mood:'small-business-day'},
    work:{accent:'#6d9dba',accent2:'#8fbea9',warm:'#e5b961',leaf:'#82a987',mood:'project-workbench'},
    author:{accent:'#b28ab9',accent2:'#c5a47d',warm:'#edc26d',leaf:'#8eb68a',mood:'creator-room'},
    books:{accent:'#ad7f70',accent2:'#8ca9cc',warm:'#e8bd70',leaf:'#82ad83',mood:'reading-room'},
    publishing:{accent:'#a8756e',accent2:'#8fa7c6',warm:'#e7b96b',leaf:'#88aa80',mood:'publishing-desk'},
    lab:{accent:'#bd865d',accent2:'#7fa9b0',warm:'#e6bb68',leaf:'#78ad86',mood:'field-research'},
    social:{accent:'#7fa8c8',accent2:'#8ec9be',warm:'#ecc06c',leaf:'#82b48c',mood:'signal-picnic'},
    messenger:{accent:'#76b5bb',accent2:'#94b0d3',warm:'#efc371',leaf:'#84ad8a',mood:'conversation-bridge'},
    energy:{accent:'#78aa7f',accent2:'#8ec5dd',warm:'#f0c557',leaf:'#77ad7e',mood:'sunny-grid'},
    cafe:{accent:'#a47f62',accent2:'#87b9cc',warm:'#e9bb6f',leaf:'#7fa67d',mood:'harbor-cafe'},
    mall:{accent:'#d68872',accent2:'#dfad63',warm:'#f0c65d',leaf:'#87aa7e',mood:'market-street'},
    trade:{accent:'#628fae',accent2:'#79b8b4',warm:'#ddb56a',leaf:'#7fab82',mood:'connected-route'},
    invest:{accent:'#557e75',accent2:'#899bb7',warm:'#d9b666',leaf:'#78957c',mood:'diligence-table'},
    money:{accent:'#5f9479',accent2:'#8ca9c7',warm:'#e4ba63',leaf:'#77a27e',mood:'trust-ledger'},
    pay:{accent:'#579775',accent2:'#8db7c7',warm:'#dfb85f',leaf:'#79a680',mood:'trust-ledger'},
    edu:{accent:'#7f91c0',accent2:'#8fbca8',warm:'#edc26d',leaf:'#83ad85',mood:'learning-table'},
    support:{accent:'#75a38c',accent2:'#8ea9c9',warm:'#e8bb66',leaf:'#7fa883',mood:'opportunity-desk'},
    media:{accent:'#cc7777',accent2:'#8eadd0',warm:'#e8b75e',leaf:'#7fa287',mood:'story-studio'},
    insurance:{accent:'#6d91b8',accent2:'#92b8c9',warm:'#e4bd70',leaf:'#829f82',mood:'protective-home'},
    mail:{accent:'#799bc1',accent2:'#9bb9cf',warm:'#e7bd6b',leaf:'#86a489',mood:'correspondence-desk'},
    live:{accent:'#c66f68',accent2:'#9a98c9',warm:'#e8b65c',leaf:'#7f9f84',mood:'small-stage'},
    cloud:{accent:'#7199b6',accent2:'#9fc8d8',warm:'#e3bb6d',leaf:'#7fa78a',mood:'shared-library'}
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
    style.setProperty('--ekodi-service-accent',d.accent);
    style.setProperty('--ekodi-service-accent-2',d.accent2);
    style.setProperty('--ekodi-service-warm',d.warm);
    style.setProperty('--ekodi-service-leaf',d.leaf);
    style.setProperty('--ekodi-service-paper',d.paper);
    style.setProperty('--ekodi-service-ink',d.ink);
    style.setProperty('--ekodi-service-radius',d.radius);
    style.setProperty('--ekodi-service-radius-soft',d.softRadius);
    style.setProperty('--ekodi-service-shadow',d.shadow);
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
    --ekodi-button-radius:14px;
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