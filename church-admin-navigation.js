// Canonical site-local navigation projection shared by the two existing EKODI Church admin runtimes.
// A tab navigates to the original owning route. This module never grants capabilities.
export const CHURCH_ADMIN_MENU = Object.freeze([
  {id:'channels',scope:'common',label:'채널 · 자동게시',tabs:[
    {key:'publishing',label:'채널 관리',owner:'workspace',capability:'marketing'},
    {key:'marketing',label:'마케팅 AI',owner:'workspace',capability:'marketing'}
  ]},
  {id:'office',scope:'common',label:'운영 · 문서',tabs:[
    {key:'confirmations',label:'지급 · 수령 확인',owner:'workspace',capability:'confirmations'},
    {key:'mail',label:'메일',owner:'workspace',capability:'connections'},
    {key:'work',label:'업무',owner:'workspace',capability:'operations'}
  ]},
  {id:'site',scope:'common',label:'사이트 설정',tabs:[
    {key:'chrome',label:'헤더 · 푸터',owner:'church',capability:'site'},
    {key:'design',label:'사이트 디자인',owner:'workspace',capability:'site'},
    {key:'languages',label:'다국어',owner:'workspace',capability:'language'}
  ]},
  {id:'services',scope:'common',label:'서비스설정',tabs:[
    {key:'services',label:'서비스설정',owner:'workspace',capability:'site'}
  ]},
  {id:'authority',scope:'common',label:'사용자 · 권한',tabs:[
    {key:'members',label:'사용자 · 권한',owner:'workspace',capability:'access'},
    {key:'access',label:'목회자 · 권한',owner:'church',capability:'access'}
  ]},
  {id:'operations',scope:'common',label:'운영 상태 · 기록',tabs:[
    {key:'status',label:'운영 상태',owner:'workspace',capability:'logs'},
    {key:'records',label:'변경 · 감사 기록',owner:'workspace',capability:'reports'}
  ]},
  {id:'home',scope:'dedicated',label:'오늘의 교회',tabs:[
    {key:'overview',label:'오늘의 교회',owner:'church',capability:'dashboard'}
  ]},
  {id:'people',scope:'dedicated',label:'교인 · 돌봄',tabs:[
    {key:'people',label:'교인 · 가정',owner:'church',capability:'people'},
    {key:'attendance',label:'개인별 출결',owner:'church',capability:'attendance'},
    {key:'care',label:'돌봄 · 후속',owner:'church',capability:'care'}
  ]},
  {id:'ministry',scope:'dedicated',label:'예배 · 사역',tabs:[
    {key:'worship',label:'예배 · 말씀',owner:'church',capability:'worship'},
    {key:'calendar',label:'일정',owner:'church',capability:'calendar'},
    {key:'ministry',label:'사역 · 팀',owner:'church',capability:'ministry'},
    {key:'reports',label:'사역보고',owner:'church',capability:'reports'}
  ]},
  {id:'finance',scope:'dedicated',label:'재정 · 증빙',tabs:[
    {key:'offerings',label:'헌금관리',owner:'church',capability:'offerings'},
    {key:'banking',label:'통장 · 이체',owner:'church',capability:'financeManage'},
    {key:'accounting',label:'회계관리',owner:'church',capability:'financeManage'},
    {key:'receipts',label:'기부금영수증',owner:'church',capability:'receipts'}
  ]},
  {id:'pastoral-ai',scope:'dedicated',label:'AI 목회비서',tabs:[
    {key:'ai',label:'AI 목회비서',owner:'church',capability:'ai'}
  ]}
]);

// The same menu builder is serialized into both generated client scripts.
// Authorization is still enforced by each destination's own server-side gate.
export function mountChurchAdminNavigation({root,tabsRoot,groups,activeKey,activeOwner,canView,base='/ekodichurch/admin'}){
  if(!root||!tabsRoot)return;
  root.replaceChildren();
  tabsRoot.replaceChildren();
  const visible = groups.map(group=>({...group,tabs:group.tabs.filter(canView)})).filter(group=>group.tabs.length);
  const href = tab=>base+'/'+tab.key;
  const activeGroup=visible.find(group=>group.tabs.some(tab=>tab.key===activeKey&&tab.owner===activeOwner));
  for(const [scope,label] of [['common','공통메뉴'],['dedicated','전용메뉴']]){
    const scoped=visible.filter(group=>group.scope===scope);
    if(!scoped.length)continue;
    const heading=document.createElement('span');heading.className='church-admin-nav-heading';heading.textContent=label;
    root.append(heading);
    for(const group of scoped){
      const link=document.createElement('a');
      const selected=group===activeGroup;
      const first=selected?group.tabs.find(tab=>tab.key===activeKey&&tab.owner===activeOwner):group.tabs[0];
      link.href=href(first);link.textContent=group.label;
      link.dataset.adminNavGroup=group.id;
      if(selected){link.classList.add('active');link.setAttribute('aria-current','location');}
      root.append(link);
    }
  }
  if(activeGroup&&activeGroup.tabs.length>1){
    tabsRoot.hidden=false;
    tabsRoot.setAttribute('aria-label',activeGroup.label+' 세부 메뉴');
    for(const tab of activeGroup.tabs){
      const link=document.createElement('a');link.href=href(tab);link.textContent=tab.label;
      link.dataset.adminDetail=tab.key;
      if(tab.key===activeKey&&tab.owner===activeOwner){link.classList.add('active');link.setAttribute('aria-current','page');}
      tabsRoot.append(link);
    }
  }else{
    tabsRoot.hidden=true;
  }
}

export const CHURCH_ADMIN_NAV_CSS = `
html[data-ekodi-church-unified-admin="true"]{color-scheme:light}
html[data-ekodi-church-unified-admin="true"] .sidebar #adminNav{display:grid;gap:2px;align-content:start}
html[data-ekodi-church-unified-admin="true"] .sidebar #adminNav .church-admin-nav-heading{display:block;margin:12px 8px 5px;padding-top:10px;border-top:1px solid #e1e7ef;font-size:12px;font-weight:800;color:#526075;word-break:keep-all}
html[data-ekodi-church-unified-admin="true"] .sidebar #adminNav .church-admin-nav-heading:first-child{margin-top:0;padding-top:0;border-top:0}
html[data-ekodi-church-unified-admin="true"] .sidebar #adminNav a{font-size:13px;min-height:37px;line-height:1.4;word-break:keep-all;overflow-wrap:normal}
html[data-ekodi-church-unified-admin="true"] .sidebar #adminNav a.active{font-weight:800}
html[data-ekodi-church-unified-admin="true"] main{min-width:0;padding:20px clamp(12px,2.2vw,28px) 32px}
html[data-ekodi-church-unified-admin="true"] main > *{max-width:1240px;margin-left:auto;margin-right:auto}
html[data-ekodi-church-unified-admin="true"] main .heading{margin-bottom:8px}
html[data-ekodi-church-unified-admin="true"] .church-admin-detail-tabs{display:flex!important;flex-wrap:wrap;justify-content:flex-end;gap:6px;margin:0 auto 10px;padding:6px 0 10px;border-bottom:1px solid #e1e7ef;min-height:0}
html[data-ekodi-church-unified-admin="true"] .church-admin-detail-tabs[hidden]{display:none!important}
html[data-ekodi-church-unified-admin="true"] .church-admin-detail-tabs a{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 13px;border:1px solid #d8e0ec;border-radius:9px;background:#fff;color:#344256;font-size:13px;font-weight:650;text-align:center;text-decoration:none;word-break:keep-all}
html[data-ekodi-church-unified-admin="true"] .church-admin-detail-tabs a:hover{background:#f1f5fa}
html[data-ekodi-church-unified-admin="true"] .church-admin-detail-tabs a.active{border-color:#91b7f0;background:#eaf2ff;color:#173b7a;font-weight:850}
html[data-ekodi-church-unified-admin="true"] .church-admin-detail-tabs a:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
html[data-ekodi-church-unified-admin="true"] #mainPanel{min-width:0}
html[data-ekodi-church-unified-admin="true"] #mainPanel .table-wrap{overflow-x:auto;max-width:100%}
html[data-ekodi-church-unified-admin="true"] #mainPanel :is(input,select,textarea){color-scheme:light;background:#fff;color:#172033;border:1px solid #cbd5e1;border-radius:8px;min-height:40px;font-size:13px}
html[data-ekodi-church-unified-admin="true"] #mainPanel :is(input,select,textarea):focus-visible{outline:2px solid #2563eb;outline-offset:1px}
html[data-ekodi-church-unified-admin="true"] #mainPanel :is(input,select,textarea)::placeholder{color:#667085;opacity:1}
html[data-ekodi-church-unified-admin="true"] #mainPanel input[type="checkbox"]{min-height:18px;width:18px;accent-color:#1f3c88}
html[data-ekodi-church-unified-admin="true"] #mainPanel .trade-grid label{font-size:13px;line-height:1.4;word-break:keep-all}
html[data-ekodi-church-unified-admin="true"] #mainPanel .panel h2{font-size:16px}
html[data-ekodi-church-unified-admin="true"] .panel{padding:clamp(12px,1.6vw,20px)}
@media(max-width:900px){html[data-ekodi-church-unified-admin="true"] main{padding:16px 12px 26px}html[data-ekodi-church-unified-admin="true"] .church-admin-detail-tabs{justify-content:flex-start}}
@media(max-width:620px){html[data-ekodi-church-unified-admin="true"] .church-admin-detail-tabs{gap:5px}html[data-ekodi-church-unified-admin="true"] .church-admin-detail-tabs a{flex:1 1 auto;min-height:44px;padding:8px 10px}html[data-ekodi-church-unified-admin="true"] .sidebar #adminNav a{min-height:44px}}
`;
