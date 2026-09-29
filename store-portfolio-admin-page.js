const STORES=Object.freeze([
  {slug:'jadam',name:'자담치킨 목포대점',short:'자담치킨',mark:'JD'},
  {slug:'pizzamaru',name:'피자마루 목포대점',short:'피자마루',mark:'PM'},
  {slug:'yogurt',name:'요거트퍼플 목포대점',short:'요거트퍼플',mark:'YP'},
]);

const SECTIONS=Object.freeze([
  ['','운영 홈'],
  ['pos','POS 통합화면'],
  ['delivery','배달플랫폼'],
  ['menu','메뉴 · 가격'],
  ['orders','주문 · 채널'],
  ['sales','매출'],
  ['inventory','재고'],
  ['customers','고객'],
  ['reviews','리뷰'],
  ['marketing','Marketing AI'],
  ['publishing','채널 · 자동게시'],
  ['work','매장업무'],
  ['finance','비용 · 정산'],
  ['connections','연결관리'],
  ['site','사용자 사이트'],
  ['members','권한 · 구성원'],
]);

const COMMON_VIEWS=Object.freeze({
  overview:{
    label:'통합 대시보드',
    description:'세 브랜드의 주요 운영 메뉴와 상태 확인 경로를 한 화면에서 엽니다.',
    sections:[['','운영 홈'],['delivery','배달플랫폼'],['orders','주문 · 채널'],['sales','매출']],
  },
  pos:{
    label:'POS 통합화면',
    description:'세 브랜드의 웹 운영 화면을 기본으로 사용하고, 필요할 때 해당 POS PC의 Windows 프로그램 전환을 Agent로 보조합니다.',
    sections:[['pos','POS 통합화면'],['orders','주문 · 채널'],['connections','연결관리']],
  },
  delivery:{
    label:'배달플랫폼 통합관리',
    description:'세 브랜드의 배달앱 업무를 한 화면에서 찾고, 실제 변경은 각 브랜드의 정식 관리자에서 안전하게 실행합니다.',
    sections:[['delivery','배달앱 통합관리'],['menu','메뉴 · 가격'],['orders','주문 · 채널'],['inventory','품절 · 재고'],['reviews','리뷰'],['finance','비용 · 정산'],['connections','배달앱 · POS 연결']],
  },
  menu:{
    label:'메뉴 · 가격 통합관리',
    description:'세 브랜드의 메뉴와 가격 관리 화면을 한곳에서 선택합니다.',
    sections:[['menu','메뉴 · 가격']],
  },
  orders:{
    label:'주문 · 채널 통합관리',
    description:'브랜드별 주문과 판매채널 운영 화면을 바로 엽니다.',
    sections:[['orders','주문 · 채널']],
  },
  sales:{
    label:'매출 통합보기',
    description:'세 브랜드의 매출 관리 화면을 빠르게 전환합니다.',
    sections:[['sales','매출']],
  },
  customer:{
    label:'고객 · 리뷰',
    description:'브랜드별 고객 흐름과 리뷰 관리 화면을 함께 모았습니다.',
    sections:[['customers','고객'],['reviews','리뷰']],
  },
  marketing:{
    label:'Marketing AI',
    description:'브랜드별 Marketing AI 작업공간으로 이동합니다.',
    sections:[['marketing','Marketing AI']],
  },
  publishing:{
    label:'채널 · 자동게시 통합관리',
    description:'세 브랜드의 채널 상태를 같은 위치에서 선택하고, 실제 계정·OAuth·예약게시·자동게시 관리는 브랜드별 권한 경계에서 실행합니다.',
    sections:[['publishing','채널 · 자동게시'],['connections','연결관리'],['marketing','Marketing AI']],
  },
  operations:{
    label:'매장 운영',
    description:'재고·매장업무·비용과 정산을 브랜드별로 관리합니다.',
    sections:[['inventory','재고'],['work','매장업무'],['finance','비용 · 정산']],
  },
  agent:{
    label:'POS Agent 설치·관리',
    description:'여러 POS Windows PC에서 EKODI POS Agent를 설치·실행·중지·진단·삭제하고 이 PC의 연결상태를 확인합니다.',
    sections:[],
  },
  connections:{
    label:'연결 · 사이트 · 권한',
    description:'브랜드별 외부 연결, 사용자 사이트, 구성원 권한을 관리합니다.',
    sections:[['connections','연결관리'],['site','사용자 사이트'],['members','권한 · 구성원']],
  },
});

const COMMON_MENU=Object.freeze([
  ['overview','통합 대시보드'],
  ['pos','POS 통합화면'],
  ['agent','POS Agent 관리'],
  ['delivery','배달플랫폼'],
  ['menu','메뉴 · 가격'],
  ['orders','주문 · 채널'],
  ['sales','매출'],
  ['customer','고객 · 리뷰'],
  ['marketing','Marketing AI'],
  ['publishing','채널 · 자동게시'],
  ['operations','매장 운영'],
  ['connections','연결 · 권한'],
]);

const DELIVERY_PLATFORMS=Object.freeze(['배달의민족','쿠팡이츠','요기요','땡겨요','먹깨비','당근 주문','네이버 주문']);

const SHELL_STYLE=`:root{
  font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;
  color:#172018;background:#f3f6f3;word-break:keep-all;
  --ink:#172018;--muted:#68756d;--line:#dfe6df;--panel:#fff;
  --green:#1f5b36;--green-strong:#17492b;--green-soft:#eaf5ed;--green-line:#c8dfce
}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f3f6f3;color:var(--ink)}
a{color:inherit}.top{
  height:54px;display:flex;align-items:center;gap:9px;padding:0 12px;background:#fff;
  border-bottom:1px solid var(--line);position:sticky;top:0;z-index:30
}
.brand{display:flex;align-items:center;gap:8px;text-decoration:none;min-width:0}
.mark{width:32px;height:32px;border-radius:9px;background:#173f2b;color:#fff;display:grid;place-items:center;font-size:10px;font-weight:900}
.brand strong{display:block;font-size:13px}.brand small{display:block;margin-top:1px;color:#758179;font-size:9px}
.top-actions{margin-left:auto}.top-actions a{
  display:inline-flex;align-items:center;border:1px solid #d7e0d8;border-radius:8px;background:#fff;
  padding:7px 9px;text-decoration:none;color:#35453a;font-size:10px;font-weight:800
}
.app{display:grid;grid-template-columns:264px minmax(0,1fr);min-height:calc(100vh - 54px)}
.portfolio-sidebar{
  height:calc(100vh - 54px);position:sticky;top:54px;overflow:auto;background:#fff;
  border-right:1px solid var(--line);padding:8px 7px 12px
}
.side-intro{padding:2px 6px 7px;border-bottom:1px solid #e8ede7;margin-bottom:5px}
.side-intro small{display:block;color:#758179;font-size:8.5px;font-weight:850;letter-spacing:.06em}
.side-intro strong{display:block;margin-top:2px;font-size:13px}.side-intro span{display:block;margin-top:2px;color:#879189;font-size:8.5px;line-height:1.4}
.menu-title{display:flex;align-items:center;justify-content:space-between;padding:5px 6px 4px}
.menu-title strong{font-size:12px;color:#324339}.menu-title small{font-size:10px;color:#879189}
.common-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;margin-bottom:6px}.common-nav a{
  min-width:0;padding:7px 8px;border:1px solid #e6ebe5;border-radius:7px;background:#fff;text-decoration:none;color:#405047;font-size:12px;font-weight:760;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap
}
.common-nav a:hover,.common-nav a:focus{background:#eef6f0;border-color:#cbdccd;color:#17492b;outline:none}
.common-nav a:first-child{grid-column:1/-1;background:var(--green);border-color:var(--green);color:#fff}
.brand-group{border-top:1px solid #edf1ec;padding:4px 3px 0;margin-top:3px}
.brand-group>summary{list-style:none;cursor:pointer}.brand-group>summary::-webkit-details-marker{display:none}
.brand-head{display:flex;align-items:center;gap:7px;margin:0;padding:5px 4px;border-radius:7px}
.brand-head:hover,.brand-head:focus{background:#f5f8f5;outline:none}
.brand-mark{width:24px;height:24px;border-radius:7px;background:#edf4ef;color:#31543e;display:grid;place-items:center;font-size:8px;font-weight:900;flex:0 0 auto}
.brand-head>div{min-width:0;flex:1}.brand-head strong{display:block;font-size:12px}.brand-head span{display:block;color:#879189;font-size:10px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brand-caret{margin-left:auto;color:#748178;font-size:14px;line-height:1;transform:rotate(0deg);transition:transform .15s ease}.brand-group[open] .brand-caret{transform:rotate(90deg)}
.brand-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;padding:3px 0 2px}
.brand-links a{
  min-width:0;padding:6px 7px;border:1px solid #e4e9e3;border-radius:7px;background:#fff;
  color:#48584e;text-decoration:none;font-size:11px;font-weight:730;overflow:hidden;text-overflow:ellipsis;white-space:nowrap
}
.brand-links a:hover,.brand-links a:focus{background:#eef6f0;border-color:#cbdccd;color:#17492b;outline:none}
.brand-links a:first-child{grid-column:1/-1;background:#f3f8f4;color:#17492b;border-color:#d5e4d8;font-weight:900}
.portfolio-sidebar-note{margin:8px 4px 0;padding-top:7px;border-top:1px solid #edf1ec;color:#8a948c;font-size:10px;line-height:1.4}
.workspace{min-width:0;background:#f3f6f3;padding:6px}
.panel-frame{
  width:100%;height:calc(100vh - 66px);min-height:500px;border:1px solid #dbe3da;border-radius:10px;
  background:#fff;display:block;box-shadow:0 1px 7px rgba(28,67,42,.04)
}
@media(max-width:980px){
  .app{grid-template-columns:236px minmax(0,1fr)}
  .portfolio-sidebar{padding-left:6px;padding-right:6px}
  .brand-links{grid-template-columns:1fr}
  .brand-links a:first-child{grid-column:auto}
}
@media(max-width:760px){
  .top{height:52px;padding:0 9px}.brand small{display:none}.top-actions a{font-size:10px;padding:6px 8px}
  .app{display:block}.portfolio-sidebar{position:relative;top:auto;width:100%;height:auto;max-height:none;border-right:0;border-bottom:1px solid var(--line)}
  .common-nav{grid-template-columns:repeat(2,minmax(0,1fr))}
  .brand-links{grid-template-columns:repeat(2,minmax(0,1fr))}
  .workspace{padding:5px}.panel-frame{height:76vh;min-height:460px}
}
@media(max-width:390px){
  .common-nav,.brand-links{grid-template-columns:1fr}
  .brand-links a:first-child{grid-column:auto}
}`;

const PANEL_STYLE=`:root{
  font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#172018;background:#f5f7f4;word-break:keep-all;
  --line:#dfe6df;--muted:#68756d;--green:#1f5b36;--green-soft:#eaf5ed
}
*{box-sizing:border-box}body{margin:0;background:#f5f7f4;padding:13px;color:#172018}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:9px}
.eyebrow{margin:0 0 4px;color:#567060;font-size:11px;font-weight:900;letter-spacing:.1em}
h1{margin:0 0 4px;font-size:24px;letter-spacing:-.04em;line-height:1.18}p{margin:0;color:var(--muted);font-size:12px;line-height:1.5}
.badge{white-space:nowrap;border:1px solid #c9dfce;background:var(--green-soft);color:#17492b;border-radius:999px;padding:6px 8px;font-size:11px;font-weight:900}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.card{background:#fff;border:1px solid var(--line);border-radius:11px;padding:11px}
.card-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.mark{width:30px;height:30px;border-radius:9px;background:#edf4ef;color:#31543e;display:grid;place-items:center;font-size:11px;font-weight:900}
.card h2{margin:0;font-size:14px}.card small{display:block;color:#879189;font-size:8.5px;margin-top:1px}
.actions{display:grid;gap:5px}.actions a{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:8px 9px;border:1px solid #e0e6df;border-radius:7px;background:#fff;text-decoration:none;color:#405047;font-size:11px;font-weight:780}
.actions a:hover{background:#eff6f0;color:#17492b;border-color:#cddfd1}.actions a:first-child{background:#1f5b36;color:#fff;border-color:#1f5b36}
.help{margin-top:9px;padding:10px 11px;background:#fff;border:1px solid var(--line);border-radius:10px;color:#768279;font-size:11px;line-height:1.5}
.delivery-overview{margin-bottom:14px;padding:14px 15px;border:1px solid #d7e3d8;border-radius:13px;background:#f8fbf8}.delivery-overview strong{display:block;font-size:13px;margin-bottom:5px}.delivery-overview p{font-size:11px}.delivery-platforms{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.delivery-platform{display:inline-flex;align-items:center;padding:6px 8px;border:1px solid #dfe7df;border-radius:999px;background:#fff;color:#4b5b50;font-size:9.5px;font-weight:800}.delivery-card-note{margin:-3px 0 10px;padding:8px 9px;border-radius:8px;background:#f5f8f5;color:#758078;font-size:9.5px;line-height:1.5}.delivery-card .actions{grid-template-columns:repeat(2,minmax(0,1fr))}.delivery-card .actions a:first-child{grid-column:1/-1}.delivery-card .actions a:nth-child(2){background:#eef6f0;color:#17492b;border-color:#cddfd1}.delivery-safety{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.delivery-safety div{padding:10px;border:1px solid #e1e7df;border-radius:9px;background:#fff}.delivery-safety b{display:block;font-size:10px;margin-bottom:3px}.delivery-safety span{display:block;color:#7a867e;font-size:11px;line-height:1.45}.delivery-live-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:11px;border-top:1px solid #e1e8e1}.delivery-live-toolbar span{font-size:10px;color:#607068;font-weight:750}.delivery-live-toolbar-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.delivery-live-toolbar button,.delivery-live-toolbar a{border:1px solid #cbd9cd;border-radius:8px;background:#fff;color:#285239;padding:7px 9px;font-size:10px;font-weight:800;text-decoration:none;cursor:pointer}.delivery-live-toolbar button[aria-pressed="true"]{background:#174e2d;color:#fff;border-color:#174e2d}.delivery-summary-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:10px}.delivery-summary-grid[hidden]{display:none}.delivery-summary-grid div{padding:9px 10px;border:1px solid #e0e7df;border-radius:9px;background:#fff}.delivery-summary-grid small{display:block;color:#7d8880;font-size:8.5px}.delivery-summary-grid b{display:block;margin-top:3px;color:#20382a;font-size:13px}.delivery-live{margin:0 0 11px;padding:10px;border:1px solid #e0e7df;border-radius:9px;background:#fbfcfb}.delivery-live-state{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.delivery-live-state b{font-size:10px}.delivery-live-state span{font-size:8.5px;color:#768178}.delivery-live-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.delivery-live-metrics a{display:block;padding:7px;border-radius:7px;background:#f4f7f4;color:inherit;text-decoration:none;border:1px solid transparent}.delivery-live-metrics a:hover,.delivery-live-metrics a:focus-visible{background:#edf5ef;border-color:#c9ddce;outline:none}.delivery-live-metrics a.is-issue{background:#fff7f4;border-color:#efd2c8}.delivery-live-metrics small{display:block;color:#7d8880;font-size:8px}.delivery-live-metrics strong{display:block;margin-top:2px;font-size:11px;color:#243a2b}.delivery-card[data-issues-only="hidden"]{display:none}.delivery-live-error{color:#9a3f34;font-size:9.5px;line-height:1.5}.delivery-live-muted{color:#7a867e;font-size:9.5px;line-height:1.5}.delivery-live-login{display:inline-flex;margin-top:7px;padding:7px 9px;border:1px solid #cbd9cd;border-radius:8px;background:#fff;color:#285239;text-decoration:none;font-size:9.5px;font-weight:800}
.direct-workspace{background:#fff;border:1px solid var(--line);border-radius:11px;overflow:hidden}.direct-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 9px;border-bottom:1px solid var(--line);background:#fbfcfb}.direct-toolbar-group{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.direct-toolbar-group>span{font-size:9px;font-weight:900;color:#768279;margin-right:2px}.direct-toolbar button{border:1px solid #dce4dc;border-radius:7px;background:#fff;color:#425248;padding:6px 8px;font-size:10px;font-weight:800;cursor:pointer}.direct-toolbar button.is-active,.direct-toolbar button[aria-pressed="true"]{background:#1f5b36;color:#fff;border-color:#1f5b36}.direct-frame{display:block;width:100%;height:calc(100vh - 132px);min-height:600px;border:0;background:#fff}
.agent-manager{display:grid;gap:10px}.agent-status{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px;border:1px solid #cfe0d2;border-radius:11px;background:#f8fbf8}.agent-status-copy{min-width:0}.agent-status-copy b{display:block;font-size:13px}.agent-status-copy span{display:block;margin-top:3px;color:#66746b;font-size:11px;line-height:1.5}.agent-status button{flex:0 0 auto;border:1px solid #c6d9ca;border-radius:8px;background:#fff;color:#285239;padding:8px 10px;font-size:11px;font-weight:850;cursor:pointer}.agent-status[data-state="online"]{background:#edf7ef;border-color:#bcd8c2}.agent-status[data-state="offline"]{background:#fff8f4;border-color:#ecd7cb}.agent-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.agent-card{padding:12px;border:1px solid var(--line);border-radius:11px;background:#fff}.agent-card h2{margin:0 0 4px;font-size:14px}.agent-card p{font-size:11px}.agent-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.agent-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:8px 10px;border:1px solid #cfddd1;border-radius:8px;background:#fff;color:#274c34;text-decoration:none;font-size:11px;font-weight:850}.agent-actions a.primary{background:#1f5b36;border-color:#1f5b36;color:#fff}.agent-actions a.danger{background:#fff6f2;border-color:#e7cabc;color:#8d3b2f}.agent-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.agent-step{padding:10px;border:1px solid #e0e7df;border-radius:9px;background:#fff}.agent-step b{display:block;font-size:11px;margin-bottom:3px}.agent-step span{display:block;color:#748078;font-size:10px;line-height:1.45}.agent-store-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.agent-store-links a{padding:7px 9px;border:1px solid #dce4dc;border-radius:8px;background:#fff;color:#365342;text-decoration:none;font-size:10px;font-weight:800}.agent-note{padding:10px 11px;border:1px solid #e1e6df;border-radius:9px;background:#fbfcfb;color:#6e7a72;font-size:10.5px;line-height:1.55}
@media(max-width:900px){.agent-grid{grid-template-columns:1fr}.agent-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.grid{grid-template-columns:1fr}.head{display:block}.badge{display:inline-block;margin-top:10px}.delivery-safety{grid-template-columns:1fr}.delivery-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.direct-toolbar{align-items:flex-start;flex-direction:column}.direct-frame{height:72vh;min-height:520px}}
@media(max-width:390px){body{padding:10px}h1{font-size:22px}.direct-frame{min-height:500px}}`;

function adminHref(store,section='',embedded=true){
  const base=`/${store.slug}/admin${section?'/'+section:''}`;
  return embedded?`${base}?embed=cmpmyi`:base;
}

function commonHref(view){
  return `/cmpmyi/admin/panel/${view}`;
}

function brandMenu(store){
  return `<details class="brand-group" aria-label="${store.short} 관리자 메뉴">
    <summary class="brand-head"><span class="brand-mark">${store.mark}</span><div><strong>${store.short}</strong><span>${store.name}</span></div><span class="brand-caret" aria-hidden="true">›</span></summary>
    <nav class="brand-links">${SECTIONS.map(([section,label])=>`<a href="${adminHref(store,section)}" target="cmpmyi-panel">${label}</a>`).join('')}</nav>
  </details>`;
}

function panelCard(store,view){
  const actions=view.sections.map(([section,label])=>`<a href="${adminHref(store,section)}"><span>${label}</span><b>→</b></a>`).join('');
  return `<article class="card"><div class="card-head"><span class="mark">${store.mark}</span><div><h2>${store.name}</h2><small>${store.short} 관리자</small></div></div><div class="actions">${actions}</div></article>`;
}

function deliveryPanelCard(store,view){
  const actions=view.sections.map(([section,label])=>`<a href="${adminHref(store,section)}"><span>${label}</span><b>→</b></a>`).join('');
  return `<article class="card delivery-card" data-delivery-brand="${store.slug}"><div class="card-head"><span class="mark">${store.mark}</span><div><h2>${store.name}</h2><small>${store.short} · 배달 운영</small></div></div><p class="delivery-card-note">연결상태·주문·매출·정산·리뷰는 이 브랜드의 실제 관리자 원장에서 확인합니다. 다른 브랜드 데이터는 함께 수정되지 않습니다.</p><div class="delivery-live" data-delivery-live="${store.slug}"><div class="delivery-live-muted">로그인 권한과 실데이터를 확인하고 있습니다.</div></div><div class="actions">${actions}</div></article>`;
}

function directWorkspace(view,key){
  const primary=view.sections[0]?.[0]||'';
  const brandButtons=STORES.map((store,index)=>`<button type="button" class="direct-brand${index===0?' is-active':''}" data-direct-brand="${store.slug}" aria-pressed="${index===0?'true':'false'}">${store.short}</button>`).join('');
  const taskButtons=view.sections.map(([section,label],index)=>`<button type="button" class="direct-task${index===0?' is-active':''}" data-direct-section="${section}" aria-pressed="${index===0?'true':'false'}">${label}</button>`).join('');
  return `<section class="direct-workspace" data-cmpmyi-direct-workspace="${key}" data-default-section="${primary}">
    <div class="direct-toolbar"><div class="direct-toolbar-group"><span>브랜드</span>${brandButtons}</div><div class="direct-toolbar-group"><span>업무</span>${taskButtons}</div></div>
    <iframe class="direct-frame" title="${view.label} 실제 관리화면" src="${adminHref(STORES[0],primary)}"></iframe>
  </section>`;
}

const AGENT_DOWNLOAD_BASE='/cmpmyi/admin/agent/download/';
function agentManagementPanel(){
  const stores=STORES.map(store=>`<a href="/${store.slug}/admin/pos" target="_top">${store.short} POS 화면</a>`).join('');
  return `<section class="agent-manager" data-cmpmyi-pos-agent-manager="v1">
    <div class="agent-status" id="posAgentLocalStatus" data-state="checking">
      <div class="agent-status-copy"><b>이 POS PC의 Agent 상태</b><span id="posAgentLocalState">연결상태를 확인하고 있습니다.</span></div>
      <button id="posAgentCheck" type="button">상태 다시 확인</button>
    </div>
    <div class="agent-steps" aria-label="POS Agent 설치 순서">
      <div class="agent-step"><b>1 · POS PC에서 열기</b><span>설치하려는 각 Windows POS에서 이 관리페이지를 엽니다.</span></div>
      <div class="agent-step"><b>2 · 원클릭 설치</b><span>설치 파일을 내려받아 실행하고 Windows 관리자 권한을 허용합니다.</span></div>
      <div class="agent-step"><b>3 · 연결 확인</b><span>상태 확인에서 Agent 버전과 실행 중 프로그램 수를 확인합니다.</span></div>
      <div class="agent-step"><b>4 · 필요 시 진단</b><span>프로그램명이 맞지 않으면 진단 파일로 실제 창 이름을 확인해 매핑합니다.</span></div>
    </div>
    <div class="agent-grid">
      <article class="agent-card"><h2>설치 · 업그레이드</h2><p>처음 설치하거나 기존 Agent를 최신 버전으로 갱신할 때 사용합니다. 기존 로컬 설정은 업그레이드 시 보존됩니다.</p>
        <div class="agent-actions"><a class="primary" href="${AGENT_DOWNLOAD_BASE}setup-pos-agent.cmd" download>원클릭 설치 다운로드</a><a href="${AGENT_DOWNLOAD_BASE}install-pos-agent.ps1" download>수동 설치 스크립트</a></div>
      </article>
      <article class="agent-card"><h2>실행 · 중지</h2><p>설치는 유지한 채 현재 Agent만 시작하거나 중지합니다. 중지해도 다음 Windows 로그인 자동 시작 설정은 유지됩니다.</p>
        <div class="agent-actions"><a href="${AGENT_DOWNLOAD_BASE}start-pos-agent.cmd" download>Agent 실행 파일</a><a href="${AGENT_DOWNLOAD_BASE}stop-pos-agent.cmd" download>Agent 중지 파일</a></div>
      </article>
      <article class="agent-card"><h2>진단 · 고급 설정</h2><p>VPOS·먹깨비 등 실제 프로세스 이름과 창 제목을 확인합니다. 진단은 프로그램을 실행·종료·전환하지 않습니다.</p>
        <div class="agent-actions"><a href="${AGENT_DOWNLOAD_BASE}diagnose-pos-targets.ps1" download>진단 파일</a><a href="${AGENT_DOWNLOAD_BASE}pos-agent.config.example.json" download>설정 예시</a><a href="${AGENT_DOWNLOAD_BASE}README.md" download>전체 안내</a></div>
      </article>
      <article class="agent-card"><h2>삭제</h2><p>이 POS PC에서 EKODI POS Agent 예약 작업과 설치 파일을 완전히 제거합니다. 삭제 전 확인창이 표시됩니다.</p>
        <div class="agent-actions"><a class="danger" href="${AGENT_DOWNLOAD_BASE}remove-pos-agent.cmd" download>원클릭 삭제 다운로드</a><a href="${AGENT_DOWNLOAD_BASE}uninstall-pos-agent.ps1" download>수동 삭제 스크립트</a></div>
      </article>
    </div>
    <div class="agent-card"><h2>매장 POS 바로가기</h2><p>설치가 끝난 각 POS PC에서 해당 매장 POS 통합화면을 열고 Agent 상태 확인 및 Windows 프로그램 전환을 사용합니다.</p><div class="agent-store-links">${stores}</div></div>
    <div class="agent-note">브라우저 보안상 웹페이지가 Windows 설치·삭제 파일을 자동 실행할 수는 없습니다. 다운로드한 <strong>.cmd</strong> 파일을 해당 POS PC에서 직접 실행해야 하며, Windows가 관리자 권한을 요청하면 내용을 확인한 뒤 허용합니다. Agent는 계속 <strong>127.0.0.1</strong>에만 연결됩니다.</div>
  </section>`;
}

function deliveryOverview(){
  return `<section class="delivery-overview" data-cmpmyi-delivery-control="brand-handoff"><strong>3개 브랜드 · 7개 배달/주문 채널을 한곳에서 관리</strong><p>여기서는 브랜드와 업무를 빠르게 선택합니다. 가격·품절·게시·주문 변경은 선택한 브랜드 관리자에서 권한을 다시 확인하고 사람 승인과 공식 Adapter를 거쳐 실행합니다.</p><div class="delivery-platforms">${DELIVERY_PLATFORMS.map(label=>`<span class="delivery-platform">${label}</span>`).join('')}</div><div class="delivery-safety"><div><b>1 · 상태 확인</b><span>브랜드별 연결·동기화·가격차이·주문·정산·리뷰를 확인합니다.</span></div><div><b>2 · 변경 선택</b><span>메뉴·가격·품절 등 변경할 업무와 배달앱을 선택합니다.</span></div><div><b>3 · 승인 후 실행</b><span>브랜드 권한과 Human Gate를 확인한 뒤 연결된 공식 Adapter만 실행합니다.</span></div></div><div class="delivery-live-toolbar"><span id="deliveryLiveState">실데이터 권한 확인 중</span><div class="delivery-live-toolbar-actions"><button id="deliveryIssuesOnly" type="button" aria-pressed="false">이상 브랜드만 보기</button><button id="deliveryRefresh" type="button">실데이터 새로고침</button></div></div><div class="delivery-summary-grid" id="deliveryPortfolioSummary" hidden aria-label="배달플랫폼 통합 실데이터 요약"></div></section>`;
}


function portfolioPanelClient(){
  const root=document.documentElement;
  const directHost=document.querySelector('[data-cmpmyi-direct-workspace]');
  if(directHost){
    const frame=directHost.querySelector('.direct-frame');
    const brandButtons=[...directHost.querySelectorAll('[data-direct-brand]')];
    const taskButtons=[...directHost.querySelectorAll('[data-direct-section]')];
    const brandKey='ekodi-cmpmyi-direct-brand';
    const view=directHost.dataset.cmpmyiDirectWorkspace||'common';
    const sectionKey='ekodi-cmpmyi-direct-section:'+view;
    const validBrand=value=>brandButtons.some(button=>button.dataset.directBrand===value);
    const validSection=value=>taskButtons.some(button=>button.dataset.directSection===value);
    let brand='jadam',section=directHost.dataset.defaultSection||'';
    try{
      const savedBrand=localStorage.getItem(brandKey);if(validBrand(savedBrand))brand=savedBrand;
      const savedSection=localStorage.getItem(sectionKey);if(validSection(savedSection))section=savedSection;
    }catch{}
    function sync(){
      brandButtons.forEach(button=>{const active=button.dataset.directBrand===brand;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});
      taskButtons.forEach(button=>{const active=button.dataset.directSection===section;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});
      const suffix=section?'/'+section:'';
      const next='/'+brand+'/admin'+suffix+'?embed=cmpmyi';
      if(frame&&frame.getAttribute('src')!==next)frame.setAttribute('src',next);
    }
    brandButtons.forEach(button=>button.addEventListener('click',()=>{brand=button.dataset.directBrand||brand;try{localStorage.setItem(brandKey,brand)}catch{}sync()}));
    taskButtons.forEach(button=>button.addEventListener('click',()=>{section=button.dataset.directSection??section;try{localStorage.setItem(sectionKey,section)}catch{}sync()}));
    sync();
    return;
  }
  if(root.dataset.ekodiStorePortfolioPanel==='agent'){
    const host=document.getElementById('posAgentLocalStatus');
    const state=document.getElementById('posAgentLocalState');
    const button=document.getElementById('posAgentCheck');
    const stores=['jadam','pizzamaru','yogurt'];
    const label={jadam:'자담치킨',pizzamaru:'피자마루',yogurt:'요거트퍼플'};
    async function probe(store){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),1800);
      try{
        const response=await fetch('http://127.0.0.1:17831/v1/health',{method:'GET',headers:{'X-EKODI-Store':store},cache:'no-store',signal:controller.signal});
        const data=await response.json().catch(()=>null);
        if(response.ok&&data?.ok)return{store,data};
      }catch{}finally{clearTimeout(timer)}
      return null;
    }
    async function check(){
      if(button)button.disabled=true;
      if(host)host.dataset.state='checking';
      if(state)state.textContent='이 PC의 127.0.0.1:17831 Agent를 확인하고 있습니다.';
      const results=(await Promise.all(stores.map(probe))).filter(Boolean);
      if(results.length){
        const first=results[0].data;
        const targets=Array.isArray(first.targets)?first.targets:[];
        const configured=targets.filter(row=>row.configured).length;
        const running=targets.filter(row=>row.running).length;
        const allowed=results.map(row=>label[row.store]||row.store).join(' · ');
        if(host)host.dataset.state='online';
        if(state)state.textContent='연결됨 · Agent '+(first.version||'')+' · 허용 매장 '+allowed+' · 설정 '+configured+'개 · 실행 '+running+'개';
      }else{
        if(host)host.dataset.state='offline';
        if(state)state.textContent='Agent 미연결 · 웹 관리기능은 계속 사용할 수 있습니다. 이 PC에 처음 설치하려면 아래 원클릭 설치를 사용하세요.';
      }
      if(button)button.disabled=false;
    }
    button?.addEventListener('click',check);
    check();
    return;
  }
  if(root.dataset.ekodiStorePortfolioPanel!=='delivery')return;
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const STORES=[{slug:'jadam',name:'자담치킨 목포대점'},{slug:'pizzamaru',name:'피자마루 목포대점'},{slug:'yogurt',name:'요거트퍼플 목포대점'}];
  const PROVIDERS=['baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order'];
  const SESSION_KEYS=['ekodi-cmpmyi-admin-session','ekodi-store-admin-session:jadam','ekodi-store-admin-session:pizzamaru','ekodi-store-admin-session:yogurt','ekodi-jadam-admin-session','ekodi-pizzamaru-admin-session','ekodi-yogurt-admin-session'];
  const stateEl=document.getElementById('deliveryLiveState');
  const summaryEl=document.getElementById('deliveryPortfolioSummary');
  const refresh=document.getElementById('deliveryRefresh');
  const issuesOnlyButton=document.getElementById('deliveryIssuesOnly');
  let issuesOnly=false;
  const won=value=>new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(Number(value||0));
  const num=value=>new Intl.NumberFormat('ko-KR').format(Number(value||0));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parseSession=raw=>{try{const value=JSON.parse(raw||'null');const session=value?.currentSession||value?.session||value;if(session?.accessToken)return{accessToken:session.accessToken,refreshToken:session.refreshToken||'',expiresAt:Number(session.expiresAt||0)};if(session?.access_token)return{accessToken:session.access_token,refreshToken:session.refresh_token||'',expiresAt:Number(session.expires_at||0)};return null}catch{return null}};
  function scanStorage(storage){
    if(!storage)return null;
    for(const key of SESSION_KEYS){const session=parseSession(storage.getItem(key));if(session?.accessToken)return session}
    for(let i=0;i<storage.length;i++){const key=storage.key(i)||'';if(!/^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(key))continue;const session=parseSession(storage.getItem(key));if(session?.accessToken)return session}
    return null;
  }
  function session(){try{return scanStorage(localStorage)||scanStorage(sessionStorage)}catch{return null}}
  async function token(){
    const current=session();if(!current?.accessToken)return'';
    const now=Math.floor(Date.now()/1000);if(!current.expiresAt||current.expiresAt>now+60)return current.accessToken;
    if(!current.refreshToken)return'';
    try{
      const response=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SUPABASE_KEY,'content-type':'application/json'},body:JSON.stringify({refresh_token:current.refreshToken}),cache:'no-store'});
      const data=await response.json().catch(()=>({}));if(!response.ok||!data.access_token)return'';
      return data.access_token;
    }catch{return''}
  }
  async function rpc(accessToken,name,body){
    const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SUPABASE_KEY,authorization:'Bearer '+accessToken,'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.message||data.error||('rpc_'+response.status)),{status:response.status});
    return data;
  }
  function mismatch(menu,key,listingKey){
    let count=0;
    for(const item of Array.isArray(menu?.menu)?menu.menu:[]){
      const values=[item?.[key],...(Array.isArray(item?.listings)?item.listings.map(row=>row?.[listingKey]):[])].filter(v=>v!==null&&v!==undefined&&String(v)!=='');
      if(new Set(values.map(v=>String(v))).size>1)count++;
    }
    return count;
  }
  function syncIssues(menu){
    const now=Date.now(),channels=Array.isArray(menu?.channels)?menu.channels:[];
    return PROVIDERS.reduce((total,provider)=>{
      const row=channels.find(item=>item?.provider===provider);
      if(!row)return total;
      if(row.connection_status==='error')return total+1;
      if(['ready','active'].includes(row.connection_status)){
        const synced=Date.parse(row.last_synced_at||'');
        if(!Number.isFinite(synced)||now-synced>36*60*60*1000)return total+1;
      }
      return total;
    },0);
  }
  function latestSync(menu){
    const values=(Array.isArray(menu?.channels)?menu.channels:[]).map(row=>Date.parse(row?.last_synced_at||'')).filter(Number.isFinite);
    if(!values.length)return'동기화 기록 없음';
    return '최근 '+new Date(Math.max(...values)).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function normalize(store,menu,delivery){
    const channels=Array.isArray(menu?.channels)?menu.channels:[];
    const connected=PROVIDERS.filter(provider=>channels.some(row=>row?.provider===provider&&['ready','active'].includes(row?.connection_status))).length;
    const settlements=Array.isArray(delivery?.settlements)?delivery.settlements:[];
    return{
      slug:store.slug,name:store.name,connected,syncIssues:syncIssues(menu),
      priceDiff:mismatch(menu,'base_price','price'),availabilityDiff:mismatch(menu,'availability','availability'),
      orders:Number(delivery?.summary?.orders||0),gross:Number(delivery?.summary?.gross_sales||0),
      pendingSettlements:settlements.filter(row=>!row?.paid_at).length,
      unansweredReviews:Number(delivery?.summary?.unanswered_reviews||0),
      lastSync:latestSync(menu)
    };
  }
  async function loadStore(accessToken,store){
    try{
      const [menu,delivery]=await Promise.all([
        rpc(accessToken,'store_operating_space_snapshot',{p_operating_slug:store.slug}),
        rpc(accessToken,'store_delivery_platform_admin_snapshot',{p_slug:store.slug,p_days:30})
      ]);
      return{ok:true,data:normalize(store,menu,delivery)};
    }catch(error){
      if(Number(error.status)===403)return{ok:false,forbidden:true,error};
      if(Number(error.status)===401)return{ok:false,unauthorized:true,error};
      return{ok:false,error};
    }
  }
  function storeAdminHref(store,section){return '/'+store.slug+'/admin/'+section+'?embed=cmpmyi'}
  function issueCount(d){return Number(d.syncIssues||0)+Number(d.priceDiff||0)+Number(d.availabilityDiff||0)+Number(d.pendingSettlements||0)+Number(d.unansweredReviews||0)}
  function applyIssuesFilter(){
    document.querySelectorAll('[data-delivery-brand]').forEach(card=>{
      const count=Number(card.dataset.issueCount||-1);
      card.dataset.issuesOnly=issuesOnly&&count===0?'hidden':'visible';
    });
    if(issuesOnlyButton){issuesOnlyButton.setAttribute('aria-pressed',String(issuesOnly));issuesOnlyButton.textContent=issuesOnly?'전체 브랜드 보기':'이상 브랜드만 보기'}
  }
  function metricLink(store,section,label,value,isIssue=false){
    return '<a class="'+(isIssue?'is-issue':'')+'" href="'+storeAdminHref(store,section)+'"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></a>';
  }
  function renderStore(store,result){
    const host=document.querySelector('[data-delivery-live="'+store.slug+'"]');if(!host)return;
    const card=host.closest('[data-delivery-brand]');
    if(result.forbidden){if(card)card.dataset.issueCount='-1';host.innerHTML='<div class="delivery-live-muted">이 브랜드의 배달 운영 데이터를 볼 권한이 없습니다.</div>';applyIssuesFilter();return}
    if(!result.ok){if(card)card.dataset.issueCount='-1';host.innerHTML='<div class="delivery-live-error">실데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</div>';applyIssuesFilter();return}
    const d=result.data,issues=issueCount(d);if(card)card.dataset.issueCount=String(issues);
    host.innerHTML='<div class="delivery-live-state"><b>실데이터 · 읽기 전용'+(issues?(' · 이상 '+num(issues)+'건'):' · 이상 없음')+'</b><span>'+esc(d.lastSync)+'</span></div><div class="delivery-live-metrics">'+
      metricLink(store,'connections','플랫폼 연결',d.connected+' / 7',false)+
      metricLink(store,'connections','동기화 주의',num(d.syncIssues),d.syncIssues>0)+
      metricLink(store,'menu','가격차이',num(d.priceDiff),d.priceDiff>0)+
      metricLink(store,'inventory','품절차이',num(d.availabilityDiff),d.availabilityDiff>0)+
      metricLink(store,'orders','30일 주문',num(d.orders),false)+
      metricLink(store,'sales','30일 매출',won(d.gross),false)+
      metricLink(store,'finance','정산대기',num(d.pendingSettlements),d.pendingSettlements>0)+
      metricLink(store,'reviews','미응답 리뷰',num(d.unansweredReviews),d.unansweredReviews>0)+'</div>';
    applyIssuesFilter();
  }
  function renderSummary(results){
    const rows=results.filter(row=>row.ok).map(row=>row.data);
    if(!rows.length){summaryEl.hidden=true;return}
    const sum=key=>rows.reduce((total,row)=>total+Number(row[key]||0),0);
    const items=[
      ['관리 가능 브랜드',rows.length+' / 3'],
      ['연결 플랫폼',sum('connected')+' / '+(rows.length*7)],
      ['동기화 주의',num(sum('syncIssues'))],
      ['가격·품절 차이',num(sum('priceDiff')+sum('availabilityDiff'))],
      ['30일 주문',num(sum('orders'))],
      ['30일 매출',won(sum('gross'))],
      ['정산대기',num(sum('pendingSettlements'))],
      ['미응답 리뷰',num(sum('unansweredReviews'))]
    ];
    summaryEl.innerHTML=items.map(([label,value])=>'<div><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>').join('');
    summaryEl.hidden=false;
  }
  function loginState(){
    const returnTo=location.origin+'/cmpmyi/admin';
    const href='/auth/?site=space&return_to='+encodeURIComponent(returnTo);
    stateEl.innerHTML='로그인 후 권한 범위의 실데이터를 표시합니다. <a class="delivery-live-login" target="_top" href="'+href+'">로그인</a>';
    for(const store of STORES){const host=document.querySelector('[data-delivery-live="'+store.slug+'"]');if(host)host.innerHTML='<div class="delivery-live-muted">로그인 후 실데이터를 표시합니다.</div>'}
    summaryEl.hidden=true;
  }
  let loading=false;
  async function load(){
    if(loading)return;loading=true;if(refresh)refresh.disabled=true;
    try{
      const accessToken=await token();if(!accessToken){loginState();return}
      stateEl.textContent='실데이터 확인 중 · 읽기 전용';
      const results=await Promise.all(STORES.map(store=>loadStore(accessToken,store)));
      STORES.forEach((store,index)=>renderStore(store,results[index]));
      renderSummary(results);
      const allowed=results.filter(row=>row.ok).length;
      stateEl.textContent=allowed?('실데이터 '+allowed+'개 브랜드 · 5분 자동갱신'):'관리 가능한 브랜드가 없습니다.';
    }finally{loading=false;if(refresh)refresh.disabled=false}
  }
  if(refresh)refresh.addEventListener('click',load);
  if(issuesOnlyButton)issuesOnlyButton.addEventListener('click',()=>{issuesOnly=!issuesOnly;applyIssuesFilter()});
  load();
  setInterval(()=>{if(document.visibilityState==='visible')load()},300000);
}
export function storePortfolioAdminPage(initialView='overview'){
  const startView=COMMON_VIEWS[String(initialView||'overview').toLowerCase()]?String(initialView||'overview').toLowerCase():'overview';
  const html=`<!doctype html><html lang="ko" data-ekodi-store-portfolio="cmpmyi" data-ekodi-authority-scope="platform-entry">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>통합 매장 운영 · EKODI</title><style>${SHELL_STYLE}</style></head>
  <body>
    <header class="top">
      <a class="brand" href="/cmpmyi/admin"><span class="mark">3S</span><span><strong>통합 매장 운영</strong><small>자담치킨 · 피자마루 · 요거트퍼플</small></span></a>
      <div class="top-actions"><a href="/cmpmyi" target="_blank" rel="noopener">통합 사용자페이지</a></div>
    </header>
    <div class="app">
      <aside class="portfolio-sidebar" aria-label="통합 매장 관리자 메뉴" data-cmpmyi-navigation="left-fixed">
        <div class="side-intro"><small>3 BRAND ADMIN</small><strong>통합 관리자</strong><span>공통 업무와 브랜드별 메뉴를 왼쪽에서 바로 선택합니다.</span></div>
        <div class="menu-title"><strong>공통관리</strong><small>3개 브랜드</small></div>
        <nav class="common-nav">${COMMON_MENU.map(([view,label])=>`<a href="${commonHref(view)}" target="cmpmyi-panel">${label}</a>`).join('')}</nav>
        <div class="menu-title"><strong>브랜드 관리자 전체 메뉴</strong><small>직접 이동</small></div>
        ${STORES.map(brandMenu).join('')}
        <p class="portfolio-sidebar-note">각 브랜드의 데이터와 권한은 독립적으로 유지됩니다. 통합 화면은 해당 브랜드의 정식 관리자 화면을 오른쪽 작업영역에 표시합니다.</p>
      </aside>
      <main class="workspace">
        <iframe class="panel-frame" name="cmpmyi-panel" title="통합 매장 관리자 작업영역" src="${commonHref(startView)}"></iframe>
      </main>
    </div>
  </body></html>`;
  return new Response(html,{headers:{
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'strict-origin-when-cross-origin',
    'content-security-policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'x-ekodi-route':'cmpmyi-store-portfolio-admin',
    'x-ekodi-authority-scope':'platform-entry'
  }});
}

export function storePortfolioAdminPanelPage(viewName='overview'){
  const key=String(viewName||'overview').toLowerCase();
  const view=COMMON_VIEWS[key]||COMMON_VIEWS.overview;
  const direct=!['overview','delivery','agent'].includes(key);
  const isAgent=key==='agent';
  const html=`<!doctype html><html lang="ko" data-ekodi-store-portfolio-panel="${key}">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${view.label} · 통합 매장 운영</title><style>${PANEL_STYLE}</style></head>
  <body>
    <section class="head"><div><p class="eyebrow">CMPMYI · COMMON MANAGEMENT</p><h1>${view.label}</h1><p>${view.description}</p></div><span class="badge">${key==='delivery'?'통합 확인 → 브랜드별 안전 실행':direct?'왼쪽 메뉴 → 실제 관리화면 바로 실행':'통합 현황'}</span></section>
    ${key==='delivery'?deliveryOverview():''}
    ${isAgent?agentManagementPanel():(direct?directWorkspace(view,key):`<section class="grid" aria-label="${view.label} 브랜드 선택">${STORES.map(store=>key==='delivery'?deliveryPanelCard(store,view):panelCard(store,view)).join('')}</section>`)}
    <div class="help">${isAgent?'여러 POS PC에서 같은 관리페이지를 사용합니다. 설치·삭제는 반드시 현재 보고 있는 해당 Windows POS PC에서 직접 실행하며, 중앙 웹페이지가 임의로 PC 프로그램을 실행하지 않습니다.':key==='delivery'?'통합화면은 브랜드 간 데이터를 합쳐 쓰지 않습니다. 변경 요청은 반드시 선택한 브랜드의 고유 관리자 URL에서 수행하고, 연결되지 않은 플랫폼은 실행 대상에서 제외합니다.':direct?'중간 선택 카드를 없앴습니다. 왼쪽 메뉴를 누르면 마지막으로 선택한 브랜드의 실제 관리자 화면이 즉시 열리며, 상단의 브랜드·업무 전환만 사용합니다.':'통합 대시보드는 세 브랜드의 주요 관리 진입점을 요약합니다.'}</div>
    ${key==='delivery'||isAgent||direct?'<script src="/cmpmyi/admin/panel.js" defer></script>':''}
  </body></html>`;
  return new Response(html,{headers:{
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'SAMEORIGIN',
    'referrer-policy':'strict-origin-when-cross-origin',
    'content-security-policy':isAgent?"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' http://127.0.0.1:17831 http://localhost:17831; frame-ancestors 'self'; base-uri 'self'; form-action 'self'":"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
    'x-ekodi-route':'cmpmyi-store-portfolio-panel',
    'x-ekodi-authority-scope':'platform-entry'
  }});
}

export function storePortfolioAdminPanelScript(){return new Response(`(${portfolioPanelClient.toString()})();`,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}

export { STORES as CMPMYI_STORES, SECTIONS as CMPMYI_ADMIN_SECTIONS, COMMON_MENU as CMPMYI_COMMON_MENU };
