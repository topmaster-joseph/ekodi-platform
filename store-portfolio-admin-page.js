const STORES=Object.freeze([
  {slug:'jadam',name:'자담치킨 목포대점',short:'자담치킨',mark:'JD'},
  {slug:'pizzamaru',name:'피자마루 목포대점',short:'피자마루',mark:'PM'},
  {slug:'yogurt',name:'요거트퍼플 목포대점',short:'요거트퍼플',mark:'YP'},
]);

const SECTIONS=Object.freeze([
  ['','운영 홈'],
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
  delivery:{
    label:'배달플랫폼 통합관리',
    description:'브랜드별 배달플랫폼 관리 화면으로 바로 이동합니다.',
    sections:[['delivery','배달플랫폼'],['menu','메뉴 · 가격'],['orders','주문 · 채널']],
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
    label:'Marketing AI · 채널',
    description:'브랜드별 마케팅 AI와 채널 자동게시 관리 화면으로 이동합니다.',
    sections:[['marketing','Marketing AI'],['publishing','채널 · 자동게시']],
  },
  operations:{
    label:'매장 운영',
    description:'재고·매장업무·비용과 정산을 브랜드별로 관리합니다.',
    sections:[['inventory','재고'],['work','매장업무'],['finance','비용 · 정산']],
  },
  connections:{
    label:'연결 · 사이트 · 권한',
    description:'브랜드별 외부 연결, 사용자 사이트, 구성원 권한을 관리합니다.',
    sections:[['connections','연결관리'],['site','사용자 사이트'],['members','권한 · 구성원']],
  },
});

const COMMON_MENU=Object.freeze([
  ['overview','통합 대시보드'],
  ['delivery','배달플랫폼'],
  ['menu','메뉴 · 가격'],
  ['orders','주문 · 채널'],
  ['sales','매출'],
  ['customer','고객 · 리뷰'],
  ['marketing','Marketing AI'],
  ['operations','매장 운영'],
  ['connections','연결 · 권한'],
]);

const SHELL_STYLE=`:root{
  font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;
  color:#172018;background:#f3f6f3;word-break:keep-all;
  --ink:#172018;--muted:#68756d;--line:#dfe6df;--panel:#fff;
  --green:#1f5b36;--green-strong:#17492b;--green-soft:#eaf5ed;--green-line:#c8dfce
}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f3f6f3;color:var(--ink)}
a{color:inherit}.top{
  height:70px;display:flex;align-items:center;gap:14px;padding:0 22px;background:#fff;
  border-bottom:1px solid var(--line);position:sticky;top:0;z-index:30
}
.brand{display:flex;align-items:center;gap:11px;text-decoration:none;min-width:0}
.mark{width:38px;height:38px;border-radius:12px;background:#173f2b;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:900}
.brand strong{display:block;font-size:15px}.brand small{display:block;margin-top:3px;color:#758179;font-size:11px}
.top-actions{margin-left:auto}.top-actions a{
  display:inline-flex;align-items:center;border:1px solid #d7e0d8;border-radius:10px;background:#fff;
  padding:9px 12px;text-decoration:none;color:#35453a;font-size:12px;font-weight:800
}
.app{display:grid;grid-template-columns:310px minmax(0,1fr);min-height:calc(100vh - 70px)}
.sidebar{
  height:calc(100vh - 70px);position:sticky;top:70px;overflow:auto;background:#fff;
  border-right:1px solid var(--line);padding:14px 12px 22px
}
.side-intro{padding:4px 8px 12px;border-bottom:1px solid #e8ede7;margin-bottom:10px}
.side-intro small{display:block;color:#758179;font-size:10px;font-weight:850;letter-spacing:.06em}
.side-intro strong{display:block;margin-top:4px;font-size:15px}.side-intro span{display:block;margin-top:4px;color:#879189;font-size:10px;line-height:1.5}
.menu-title{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 6px}
.menu-title strong{font-size:12px;color:#324339}.menu-title small{font-size:9px;color:#879189}
.common-nav{display:grid;gap:3px;margin-bottom:12px}.common-nav a{
  padding:9px 10px;border-radius:8px;text-decoration:none;color:#405047;font-size:12px;font-weight:760
}
.common-nav a:hover,.common-nav a:focus{background:#f1f6f2;color:#17492b;outline:none}
.common-nav a:first-child{background:var(--green);color:#fff}
.brand-group{border-top:1px solid #edf1ec;padding:10px 4px 0;margin-top:8px}
.brand-head{display:flex;align-items:center;gap:8px;margin-bottom:7px;padding:0 4px}
.brand-mark{width:27px;height:27px;border-radius:9px;background:#edf4ef;color:#31543e;display:grid;place-items:center;font-size:9px;font-weight:900}
.brand-head strong{font-size:12px}.brand-head span{display:block;color:#879189;font-size:9px;margin-top:1px}
.brand-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}
.brand-links a{
  min-width:0;padding:7px 8px;border:1px solid #e4e9e3;border-radius:7px;background:#fff;
  color:#48584e;text-decoration:none;font-size:10.5px;font-weight:730;overflow:hidden;text-overflow:ellipsis;white-space:nowrap
}
.brand-links a:hover,.brand-links a:focus{background:#eef6f0;border-color:#cbdccd;color:#17492b;outline:none}
.brand-links a:first-child{grid-column:1/-1;background:#f3f8f4;color:#17492b;border-color:#d5e4d8;font-weight:900}
.sidebar-note{margin:14px 5px 0;padding-top:11px;border-top:1px solid #edf1ec;color:#8a948c;font-size:9.5px;line-height:1.55}
.workspace{min-width:0;background:#f3f6f3;padding:12px}
.panel-frame{
  width:100%;height:calc(100vh - 94px);min-height:620px;border:1px solid #dbe3da;border-radius:15px;
  background:#fff;display:block;box-shadow:0 2px 12px rgba(28,67,42,.05)
}
@media(max-width:980px){
  .app{grid-template-columns:250px minmax(0,1fr)}
  .sidebar{padding-left:9px;padding-right:9px}
  .brand-links{grid-template-columns:1fr}
  .brand-links a:first-child{grid-column:auto}
}
@media(max-width:760px){
  .top{height:64px;padding:0 14px}.brand small{display:none}.top-actions a{font-size:11px;padding:8px 9px}
  .app{display:block}.sidebar{position:relative;top:auto;width:100%;height:auto;max-height:none;border-right:0;border-bottom:1px solid var(--line)}
  .common-nav{grid-template-columns:repeat(2,minmax(0,1fr))}
  .brand-links{grid-template-columns:repeat(2,minmax(0,1fr))}
  .workspace{padding:10px}.panel-frame{height:72vh;min-height:520px}
}
@media(max-width:390px){
  .common-nav,.brand-links{grid-template-columns:1fr}
  .brand-links a:first-child{grid-column:auto}
}`;

const PANEL_STYLE=`:root{
  font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#172018;background:#f5f7f4;word-break:keep-all;
  --line:#dfe6df;--muted:#68756d;--green:#1f5b36;--green-soft:#eaf5ed
}
*{box-sizing:border-box}body{margin:0;background:#f5f7f4;padding:24px;color:#172018}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}
.eyebrow{margin:0 0 6px;color:#567060;font-size:10px;font-weight:900;letter-spacing:.11em}
h1{margin:0 0 7px;font-size:28px;letter-spacing:-.04em;line-height:1.2}p{margin:0;color:var(--muted);font-size:12px;line-height:1.65}
.badge{white-space:nowrap;border:1px solid #c9dfce;background:var(--green-soft);color:#17492b;border-radius:999px;padding:8px 10px;font-size:10px;font-weight:900}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:15px}
.card-head{display:flex;align-items:center;gap:9px;margin-bottom:12px}.mark{width:34px;height:34px;border-radius:10px;background:#edf4ef;color:#31543e;display:grid;place-items:center;font-size:10px;font-weight:900}
.card h2{margin:0;font-size:15px}.card small{display:block;color:#879189;font-size:9px;margin-top:2px}
.actions{display:grid;gap:6px}.actions a{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border:1px solid #e0e6df;border-radius:8px;background:#fff;text-decoration:none;color:#405047;font-size:11px;font-weight:780}
.actions a:hover{background:#eff6f0;color:#17492b;border-color:#cddfd1}.actions a:first-child{background:#1f5b36;color:#fff;border-color:#1f5b36}
.help{margin-top:14px;padding:13px 14px;background:#fff;border:1px solid var(--line);border-radius:12px;color:#768279;font-size:10px;line-height:1.6}
@media(max-width:900px){.grid{grid-template-columns:1fr}.head{display:block}.badge{display:inline-block;margin-top:10px}}
@media(max-width:390px){body{padding:16px}h1{font-size:24px}}`;

function adminHref(store,section='',embedded=true){
  const base=`/${store.slug}/admin${section?'/'+section:''}`;
  return embedded?`${base}?embed=cmpmyi`:base;
}

function commonHref(view){
  return `/cmpmyi/admin/panel/${view}`;
}

function brandMenu(store){
  return `<section class="brand-group" aria-label="${store.short} 관리자 메뉴">
    <div class="brand-head"><span class="brand-mark">${store.mark}</span><div><strong>${store.short}</strong><span>${store.name}</span></div></div>
    <nav class="brand-links">${SECTIONS.map(([section,label])=>`<a href="${adminHref(store,section)}" target="cmpmyi-panel">${label}</a>`).join('')}</nav>
  </section>`;
}

function panelCard(store,view){
  const actions=view.sections.map(([section,label])=>`<a href="${adminHref(store,section)}"><span>${label}</span><b>→</b></a>`).join('');
  return `<article class="card"><div class="card-head"><span class="mark">${store.mark}</span><div><h2>${store.name}</h2><small>${store.short} 관리자</small></div></div><div class="actions">${actions}</div></article>`;
}

export function storePortfolioAdminPage(){
  const html=`<!doctype html><html lang="ko" data-ekodi-store-portfolio="cmpmyi" data-ekodi-authority-scope="platform-entry">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>통합 매장 운영 · EKODI</title><style>${SHELL_STYLE}</style></head>
  <body>
    <header class="top">
      <a class="brand" href="/cmpmyi/admin"><span class="mark">3S</span><span><strong>통합 매장 운영</strong><small>자담치킨 · 피자마루 · 요거트퍼플</small></span></a>
      <div class="top-actions"><a href="/cmpmyi" target="_blank" rel="noopener">통합 사용자페이지</a></div>
    </header>
    <div class="app">
      <aside class="sidebar" aria-label="통합 매장 관리자 메뉴">
        <div class="side-intro"><small>3 BRAND ADMIN</small><strong>통합 관리자</strong><span>공통 업무와 브랜드별 메뉴를 왼쪽에서 바로 선택합니다.</span></div>
        <div class="menu-title"><strong>공통관리</strong><small>3개 브랜드</small></div>
        <nav class="common-nav">${COMMON_MENU.map(([view,label])=>`<a href="${commonHref(view)}" target="cmpmyi-panel">${label}</a>`).join('')}</nav>
        <div class="menu-title"><strong>브랜드 관리자 전체 메뉴</strong><small>직접 이동</small></div>
        ${STORES.map(brandMenu).join('')}
        <p class="sidebar-note">각 브랜드의 데이터와 권한은 독립적으로 유지됩니다. 통합 화면은 해당 브랜드의 정식 관리자 화면을 오른쪽 작업영역에 표시합니다.</p>
      </aside>
      <main class="workspace">
        <iframe class="panel-frame" name="cmpmyi-panel" title="통합 매장 관리자 작업영역" src="${commonHref('overview')}"></iframe>
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
  const html=`<!doctype html><html lang="ko" data-ekodi-store-portfolio-panel="${key}">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${view.label} · 통합 매장 운영</title><style>${PANEL_STYLE}</style></head>
  <body>
    <section class="head"><div><p class="eyebrow">CMPMYI · COMMON MANAGEMENT</p><h1>${view.label}</h1><p>${view.description}</p></div><span class="badge">브랜드 선택 → 오른쪽에서 계속 관리</span></section>
    <section class="grid" aria-label="${view.label} 브랜드 선택">${STORES.map(store=>panelCard(store,view)).join('')}</section>
    <div class="help">통합관리 메뉴는 세 브랜드의 동일 업무를 빠르게 찾는 공통 진입점입니다. 실제 수정·저장·권한 검사는 각 브랜드 관리자 범위에서 수행됩니다.</div>
  </body></html>`;
  return new Response(html,{headers:{
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'SAMEORIGIN',
    'referrer-policy':'strict-origin-when-cross-origin',
    'content-security-policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
    'x-ekodi-route':'cmpmyi-store-portfolio-panel',
    'x-ekodi-authority-scope':'platform-entry'
  }});
}

export { STORES as CMPMYI_STORES, SECTIONS as CMPMYI_ADMIN_SECTIONS, COMMON_MENU as CMPMYI_COMMON_MENU };
