const STORES=Object.freeze([
  {slug:'jadam',name:'자담치킨 목포대점',short:'자담치킨',mark:'JD'},
  {slug:'pizzamaru',name:'피자마루 목포대점',short:'피자마루',mark:'PM'},
  {slug:'yogurt',name:'요거트퍼플 목포대점',short:'요거트퍼플',mark:'YP'},
]);

const SECTION_GROUPS=Object.freeze([
  {
    id:'sales',
    label:'판매 운영',
    description:'주문·메뉴·매출을 빠르게 관리합니다.',
    sections:[
      ['delivery','배달플랫폼'],
      ['menu','메뉴 · 가격'],
      ['orders','주문 · 채널'],
      ['sales','매출'],
    ],
  },
  {
    id:'customer',
    label:'고객 · 마케팅',
    description:'고객 반응과 홍보 채널을 관리합니다.',
    sections:[
      ['customers','고객'],
      ['reviews','리뷰'],
      ['marketing','Marketing AI'],
      ['publishing','채널 · 자동게시'],
    ],
  },
  {
    id:'operation',
    label:'매장 운영',
    description:'재고·업무·정산을 점검합니다.',
    sections:[
      ['inventory','재고'],
      ['work','매장업무'],
      ['finance','비용 · 정산'],
    ],
  },
  {
    id:'system',
    label:'시스템 · 권한',
    description:'연결·사이트·구성원 권한을 관리합니다.',
    sections:[
      ['connections','연결관리'],
      ['site','사용자 사이트'],
      ['members','권한 · 구성원'],
    ],
  },
]);

const SECTIONS=Object.freeze([
  ['','운영 홈'],
  ...SECTION_GROUPS.flatMap(group=>group.sections),
]);

const STYLE=`:root{
  font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;
  color:#18231c;
  background:#f3f6f3;
  word-break:keep-all;
  --ink:#18231c;
  --muted:#66736b;
  --line:#dfe6df;
  --panel:#ffffff;
  --soft:#f7faf7;
  --green:#1f5b36;
  --green-strong:#17492b;
  --green-soft:#eaf5ed;
  --green-line:#c8dfce;
}
*{box-sizing:border-box}
html{background:#f3f6f3}
body{margin:0;background:#f3f6f3;color:var(--ink)}
a{color:inherit}
.top{
  min-height:70px;
  display:flex;
  align-items:center;
  gap:14px;
  padding:0 26px;
  background:#fff;
  border-bottom:1px solid var(--line);
  position:sticky;
  top:0;
  z-index:20;
}
.brand{display:flex;align-items:center;gap:11px;text-decoration:none;min-width:0}
.mark{
  width:38px;height:38px;border-radius:12px;background:#173f2b;color:#fff;
  display:grid;place-items:center;font-size:12px;font-weight:900;flex:0 0 auto
}
.brand strong{display:block;font-size:15px;line-height:1.2}
.brand small{display:block;color:#738078;font-size:11px;margin-top:3px}
.top-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
.top a.user{
  border:1px solid #d7e0d8;border-radius:10px;background:#fff;padding:9px 12px;
  color:#35453a;text-decoration:none;font-size:12px;font-weight:760
}
.top a.user:hover{background:#f7faf7}
.wrap{width:min(1380px,100%);margin:auto;padding:30px 26px 52px}
.hero{
  display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;
  margin-bottom:20px
}
.hero small{color:#4f6a59;font-weight:900;letter-spacing:.12em;font-size:11px}
.hero h1{margin:8px 0 8px;font-size:clamp(28px,3.2vw,42px);line-height:1.16;letter-spacing:-.045em}
.hero p{margin:0;color:var(--muted);font-size:14px;line-height:1.75;max-width:900px}
.hero-badge{
  align-self:center;white-space:nowrap;border:1px solid var(--green-line);background:var(--green-soft);
  color:var(--green-strong);padding:9px 12px;border-radius:999px;font-size:12px;font-weight:900
}
.summary{
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:20px
}
.summary article{
  background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px
}
.summary small{display:block;color:#758179;font-size:11px;font-weight:700}
.summary strong{display:block;margin-top:5px;font-size:15px;letter-spacing:-.02em}
.section-title{
  display:flex;align-items:end;justify-content:space-between;gap:16px;margin:24px 0 10px
}
.section-title h2{margin:0;font-size:20px;letter-spacing:-.035em}
.section-title p{margin:0;color:var(--muted);font-size:12px}
.store-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.store{
  background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;
  box-shadow:0 1px 0 rgba(16,48,28,.02)
}
.store-head{display:flex;align-items:center;gap:11px}
.store-mark{
  width:42px;height:42px;border-radius:12px;background:#eef4ef;display:grid;place-items:center;
  font-size:11px;font-weight:900;color:#31543e;flex:0 0 auto
}
.store-head h3{margin:0;font-size:16px;letter-spacing:-.025em}
.store-head small{display:block;color:#78847c;font-size:11px;margin-top:3px}
.store-main{
  display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:14px;
  padding:11px 12px;border-radius:10px;background:var(--green);color:#fff;text-decoration:none;
  font-size:13px;font-weight:900
}
.store-main:hover{background:var(--green-strong)}
.store-quick{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}
.store-quick a{
  border:1px solid var(--line);border-radius:9px;background:#fff;padding:9px 10px;
  text-decoration:none;font-size:12px;font-weight:760;color:#34433a
}
.store-quick a:first-child{background:var(--green-soft);border-color:var(--green-line);color:var(--green-strong)}
.store-quick a:hover{border-color:#b9c8bb;background:#f8fbf8}
.matrix-wrap{
  margin-top:10px;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden
}
.group{border-top:1px solid var(--line)}
.group:first-child{border-top:0}
.group-head{
  display:flex;align-items:center;gap:14px;padding:13px 16px;background:#f8faf8
}
.group-head strong{font-size:14px}
.group-head span{color:#738078;font-size:12px}
.matrix-row{
  display:grid;grid-template-columns:minmax(180px,1.25fr) repeat(3,minmax(150px,1fr));
  min-height:52px;border-top:1px solid #edf1ed
}
.matrix-label{
  display:flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:850;color:#2f3f35
}
.matrix-link{
  display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;
  border-left:1px solid #edf1ed;text-decoration:none;font-size:12px;font-weight:760;color:#33463a
}
.matrix-link span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.matrix-link b{font-size:14px;color:#7a887f}
.matrix-link:hover{background:#f2f8f3;color:#17492b}
.matrix-head{
  display:grid;grid-template-columns:minmax(180px,1.25fr) repeat(3,minmax(150px,1fr));
  background:#173f2b;color:#fff
}
.matrix-head div{padding:11px 12px;font-size:12px;font-weight:900}
.matrix-head div:not(:first-child){border-left:1px solid rgba(255,255,255,.14)}
.note{
  margin-top:14px;padding:15px 16px;border:1px solid var(--line);border-radius:14px;background:#fff;
  color:#68766d;font-size:12px;line-height:1.75
}
.note strong{color:#304338}
@media(max-width:980px){
  .hero{grid-template-columns:1fr}.hero-badge{justify-self:start}
  .summary{grid-template-columns:1fr}
  .store-grid{grid-template-columns:1fr}
  .matrix-head{display:none}
  .matrix-row{grid-template-columns:1fr;padding:10px 12px;gap:7px}
  .matrix-label{padding:2px 2px 5px;font-size:14px}
  .matrix-link{border:1px solid var(--line);border-radius:9px;padding:10px 11px}
  .matrix-link::before{content:attr(data-store);font-weight:900;color:#31543e}
  .group-head{align-items:flex-start;flex-direction:column;gap:3px}
}
@media(max-width:620px){
  .top{padding:0 14px;min-height:64px}
  .top a.user{padding:8px 9px;font-size:11px}
  .wrap{padding:22px 14px 40px}
  .hero h1{font-size:28px}
  .hero p{font-size:13px}
  .store-quick{grid-template-columns:1fr}
  .section-title{align-items:flex-start;flex-direction:column;gap:4px}
}`;

function adminHref(store,section=''){
  return `/${store.slug}/admin${section?'/'+section:''}`;
}

function storeCard(store){
  const quick=[
    ['delivery','배달플랫폼'],
    ['menu','메뉴 · 가격'],
    ['orders','주문 · 채널'],
    ['sales','매출'],
  ].map(([section,label])=>`<a href="${adminHref(store,section)}">${label}</a>`).join('');
  return `<article class="store">
    <div class="store-head">
      <span class="store-mark">${store.mark}</span>
      <div><h3>${store.name}</h3><small>브랜드 관리자 전체 메뉴</small></div>
    </div>
    <a class="store-main" href="${adminHref(store)}"><span>운영 홈 열기</span><b>→</b></a>
    <div class="store-quick">${quick}</div>
  </article>`;
}

function matrixRow(section,label){
  const links=STORES.map(store=>`<a class="matrix-link" data-store="${store.short}" href="${adminHref(store,section)}"><span>${store.short}</span><b>→</b></a>`).join('');
  return `<div class="matrix-row"><div class="matrix-label">${label}</div>${links}</div>`;
}

function groupBlock(group){
  return `<section class="group">
    <div class="group-head"><strong>${group.label}</strong><span>${group.description}</span></div>
    ${group.sections.map(([section,label])=>matrixRow(section,label)).join('')}
  </section>`;
}

export function storePortfolioAdminPage(){
  const html=`<!doctype html>
  <html lang="ko" data-ekodi-store-portfolio="cmpmyi" data-ekodi-authority-scope="platform-entry">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="robots" content="noindex,nofollow">
    <title>통합 매장 운영 · EKODI</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <header class="top">
      <a class="brand" href="/cmpmyi/admin">
        <span class="mark">3S</span>
        <span><strong>통합 매장 운영</strong><small>자담치킨 · 피자마루 · 요거트퍼플</small></span>
      </a>
      <div class="top-actions">
        <a class="user" href="/cmpmyi" target="_blank" rel="noopener">통합 사용자페이지</a>
      </div>
    </header>
    <main class="wrap">
      <section class="hero">
        <div>
          <small>THREE STORES · ONE OPERATIONS HUB</small>
          <h1>3개 매장을 한 화면에서 빠르게 관리합니다.</h1>
          <p>자담치킨·피자마루·요거트퍼플은 각각 독립 관리자에서 운영하고, 이 화면에서는 세 브랜드의 전체 관리자 메뉴를 업무별로 모아 바로 이동합니다. 배달플랫폼 관리는 각 브랜드의 배달플랫폼 메뉴에서 수행합니다.</p>
        </div>
        <span class="hero-badge">통합 진입 · 브랜드별 독립 관리</span>
      </section>

      <section class="summary" aria-label="운영 요약">
        <article><small>관리 대상</small><strong>3개 브랜드 · 3개 독립 관리자</strong></article>
        <article><small>권한</small><strong>점포별 재확인</strong></article>
        <article><small>관리 엔진</small><strong>공통 Store Admin</strong></article>
      </section>

      <div class="section-title">
        <div><h2>브랜드 바로가기</h2><p>매장별 주요 업무를 즉시 엽니다.</p></div>
      </div>
      <section class="store-grid" aria-label="브랜드 관리자 바로가기">${STORES.map(storeCard).join('')}</section>

      <div class="section-title">
        <div><h2>업무별 바로가기</h2><p>먼저 업무를 찾고, 관리할 브랜드를 선택합니다.</p></div>
      </div>
      <section class="matrix-wrap" aria-label="업무별 브랜드 관리자 메뉴">
        <div class="matrix-head"><div>업무</div>${STORES.map(store=>`<div>${store.short}</div>`).join('')}</div>
        ${SECTION_GROUPS.map(groupBlock).join('')}
      </section>

      <section class="note"><strong>권한 경계</strong><br>최고관리자 메뉴에서 이 허브로 진입할 수 있지만, 각 점포 데이터 권한은 자동 승계하지 않습니다. 점포별 Membership Role과 Capability를 확인한 뒤 해당 기능만 엽니다.</section>
    </main>
  </body>
  </html>`;
  return new Response(html,{headers:{
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'strict-origin-when-cross-origin',
    'content-security-policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'x-ekodi-route':'cmpmyi-store-portfolio-admin',
    'x-ekodi-authority-scope':'platform-entry'
  }});
}

export { STORES as CMPMYI_STORES, SECTIONS as CMPMYI_ADMIN_SECTIONS };
