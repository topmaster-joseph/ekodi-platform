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

const DELIVERY_PLATFORMS=Object.freeze(['배달의민족','쿠팡이츠','요기요','땡겨요','먹깨비','당근 주문','네이버 주문']);

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
.portfolio-sidebar{
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
.portfolio-sidebar-note{margin:14px 5px 0;padding-top:11px;border-top:1px solid #edf1ec;color:#8a948c;font-size:9.5px;line-height:1.55}
.workspace{min-width:0;background:#f3f6f3;padding:12px}
.panel-frame{
  width:100%;height:calc(100vh - 94px);min-height:620px;border:1px solid #dbe3da;border-radius:15px;
  background:#fff;display:block;box-shadow:0 2px 12px rgba(28,67,42,.05)
}
@media(max-width:980px){
  .app{grid-template-columns:250px minmax(0,1fr)}
  .portfolio-sidebar{padding-left:9px;padding-right:9px}
  .brand-links{grid-template-columns:1fr}
  .brand-links a:first-child{grid-column:auto}
}
@media(max-width:760px){
  .top{height:64px;padding:0 14px}.brand small{display:none}.top-actions a{font-size:11px;padding:8px 9px}
  .app{display:block}.portfolio-sidebar{position:relative;top:auto;width:100%;height:auto;max-height:none;border-right:0;border-bottom:1px solid var(--line)}
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
.delivery-overview{margin-bottom:14px;padding:14px 15px;border:1px solid #d7e3d8;border-radius:13px;background:#f8fbf8}.delivery-overview strong{display:block;font-size:13px;margin-bottom:5px}.delivery-overview p{font-size:11px}.delivery-platforms{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.delivery-platform{display:inline-flex;align-items:center;padding:6px 8px;border:1px solid #dfe7df;border-radius:999px;background:#fff;color:#4b5b50;font-size:9.5px;font-weight:800}.delivery-card-note{margin:-3px 0 10px;padding:8px 9px;border-radius:8px;background:#f5f8f5;color:#758078;font-size:9.5px;line-height:1.5}.delivery-card .actions{grid-template-columns:repeat(2,minmax(0,1fr))}.delivery-card .actions a:first-child{grid-column:1/-1}.delivery-card .actions a:nth-child(2){background:#eef6f0;color:#17492b;border-color:#cddfd1}.delivery-safety{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.delivery-safety div{padding:10px;border:1px solid #e1e7df;border-radius:9px;background:#fff}.delivery-safety b{display:block;font-size:10px;margin-bottom:3px}.delivery-safety span{display:block;color:#7a867e;font-size:9px;line-height:1.45}.delivery-live-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:11px;border-top:1px solid #e1e8e1}.delivery-live-toolbar span{font-size:10px;color:#607068;font-weight:750}.delivery-live-toolbar button,.delivery-live-toolbar a{border:1px solid #cbd9cd;border-radius:8px;background:#fff;color:#285239;padding:7px 9px;font-size:10px;font-weight:800;text-decoration:none;cursor:pointer}.delivery-summary-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:10px}.delivery-summary-grid[hidden]{display:none}.delivery-summary-grid div{padding:9px 10px;border:1px solid #e0e7df;border-radius:9px;background:#fff}.delivery-summary-grid small{display:block;color:#7d8880;font-size:8.5px}.delivery-summary-grid b{display:block;margin-top:3px;color:#20382a;font-size:13px}.delivery-live{margin:0 0 11px;padding:10px;border:1px solid #e0e7df;border-radius:9px;background:#fbfcfb}.delivery-live-state{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.delivery-live-state b{font-size:10px}.delivery-live-state span{font-size:8.5px;color:#768178}.delivery-live-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.delivery-live-metrics div{padding:7px;border-radius:7px;background:#f4f7f4}.delivery-live-metrics small{display:block;color:#7d8880;font-size:8px}.delivery-live-metrics strong{display:block;margin-top:2px;font-size:11px;color:#243a2b}.delivery-live-error{color:#9a3f34;font-size:9.5px;line-height:1.5}.delivery-live-muted{color:#7a867e;font-size:9.5px;line-height:1.5}.delivery-live-login{display:inline-flex;margin-top:7px;padding:7px 9px;border:1px solid #cbd9cd;border-radius:8px;background:#fff;color:#285239;text-decoration:none;font-size:9.5px;font-weight:800}
@media(max-width:900px){.grid{grid-template-columns:1fr}.head{display:block}.badge{display:inline-block;margin-top:10px}.delivery-safety{grid-template-columns:1fr}.delivery-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
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

function deliveryPanelCard(store,view){
  const actions=view.sections.map(([section,label])=>`<a href="${adminHref(store,section)}"><span>${label}</span><b>→</b></a>`).join('');
  return `<article class="card delivery-card" data-delivery-brand="${store.slug}"><div class="card-head"><span class="mark">${store.mark}</span><div><h2>${store.name}</h2><small>${store.short} · 배달 운영</small></div></div><p class="delivery-card-note">연결상태·주문·매출·정산·리뷰는 이 브랜드의 실제 관리자 원장에서 확인합니다. 다른 브랜드 데이터는 함께 수정되지 않습니다.</p><div class="delivery-live" data-delivery-live="${store.slug}"><div class="delivery-live-muted">로그인 권한과 실데이터를 확인하고 있습니다.</div></div><div class="actions">${actions}</div></article>`;
}

function deliveryOverview(){
  return `<section class="delivery-overview" data-cmpmyi-delivery-control="brand-handoff"><strong>3개 브랜드 · 7개 배달/주문 채널을 한곳에서 관리</strong><p>여기서는 브랜드와 업무를 빠르게 선택합니다. 가격·품절·게시·주문 변경은 선택한 브랜드 관리자에서 권한을 다시 확인하고 사람 승인과 공식 Adapter를 거쳐 실행합니다.</p><div class="delivery-platforms">${DELIVERY_PLATFORMS.map(label=>`<span class="delivery-platform">${label}</span>`).join('')}</div><div class="delivery-safety"><div><b>1 · 상태 확인</b><span>브랜드별 연결·동기화·가격차이·주문·정산·리뷰를 확인합니다.</span></div><div><b>2 · 변경 선택</b><span>메뉴·가격·품절 등 변경할 업무와 배달앱을 선택합니다.</span></div><div><b>3 · 승인 후 실행</b><span>브랜드 권한과 Human Gate를 확인한 뒤 연결된 공식 Adapter만 실행합니다.</span></div></div><div class="delivery-live-toolbar"><span id="deliveryLiveState">실데이터 권한 확인 중</span><button id="deliveryRefresh" type="button">실데이터 새로고침</button></div><div class="delivery-summary-grid" id="deliveryPortfolioSummary" hidden aria-label="배달플랫폼 통합 실데이터 요약"></div></section>`;
}


function portfolioPanelClient(){
  const root=document.documentElement;
  if(root.dataset.ekodiStorePortfolioPanel!=='delivery')return;
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const STORES=[{slug:'jadam',name:'자담치킨 목포대점'},{slug:'pizzamaru',name:'피자마루 목포대점'},{slug:'yogurt',name:'요거트퍼플 목포대점'}];
  const PROVIDERS=['baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order'];
  const SESSION_KEYS=['ekodi-cmpmyi-admin-session','ekodi-store-admin-session:jadam','ekodi-store-admin-session:pizzamaru','ekodi-store-admin-session:yogurt','ekodi-jadam-admin-session','ekodi-pizzamaru-admin-session','ekodi-yogurt-admin-session'];
  const stateEl=document.getElementById('deliveryLiveState');
  const summaryEl=document.getElementById('deliveryPortfolioSummary');
  const refresh=document.getElementById('deliveryRefresh');
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
  function renderStore(store,result){
    const host=document.querySelector('[data-delivery-live="'+store.slug+'"]');if(!host)return;
    if(result.forbidden){host.innerHTML='<div class="delivery-live-muted">이 브랜드의 배달 운영 데이터를 볼 권한이 없습니다.</div>';return}
    if(!result.ok){host.innerHTML='<div class="delivery-live-error">실데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</div>';return}
    const d=result.data;
    host.innerHTML='<div class="delivery-live-state"><b>실데이터 · 읽기 전용</b><span>'+esc(d.lastSync)+'</span></div><div class="delivery-live-metrics">'+
      '<div><small>플랫폼 연결</small><strong>'+d.connected+' / 7</strong></div>'+
      '<div><small>동기화 주의</small><strong>'+num(d.syncIssues)+'</strong></div>'+
      '<div><small>가격차이</small><strong>'+num(d.priceDiff)+'</strong></div>'+
      '<div><small>품절차이</small><strong>'+num(d.availabilityDiff)+'</strong></div>'+
      '<div><small>30일 주문</small><strong>'+num(d.orders)+'</strong></div>'+
      '<div><small>30일 매출</small><strong>'+esc(won(d.gross))+'</strong></div>'+
      '<div><small>정산대기</small><strong>'+num(d.pendingSettlements)+'</strong></div>'+
      '<div><small>미응답 리뷰</small><strong>'+num(d.unansweredReviews)+'</strong></div></div>';
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
  load();
  setInterval(()=>{if(document.visibilityState==='visible')load()},300000);
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
      <aside class="portfolio-sidebar" aria-label="통합 매장 관리자 메뉴" data-cmpmyi-navigation="left-fixed">
        <div class="side-intro"><small>3 BRAND ADMIN</small><strong>통합 관리자</strong><span>공통 업무와 브랜드별 메뉴를 왼쪽에서 바로 선택합니다.</span></div>
        <div class="menu-title"><strong>공통관리</strong><small>3개 브랜드</small></div>
        <nav class="common-nav">${COMMON_MENU.map(([view,label])=>`<a href="${commonHref(view)}" target="cmpmyi-panel">${label}</a>`).join('')}</nav>
        <div class="menu-title"><strong>브랜드 관리자 전체 메뉴</strong><small>직접 이동</small></div>
        ${STORES.map(brandMenu).join('')}
        <p class="portfolio-sidebar-note">각 브랜드의 데이터와 권한은 독립적으로 유지됩니다. 통합 화면은 해당 브랜드의 정식 관리자 화면을 오른쪽 작업영역에 표시합니다.</p>
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
    <section class="head"><div><p class="eyebrow">CMPMYI · COMMON MANAGEMENT</p><h1>${view.label}</h1><p>${view.description}</p></div><span class="badge">${key==='delivery'?'통합 확인 → 브랜드별 안전 실행':'브랜드 선택 → 오른쪽에서 계속 관리'}</span></section>
    ${key==='delivery'?deliveryOverview():''}
    <section class="grid" aria-label="${view.label} 브랜드 선택">${STORES.map(store=>key==='delivery'?deliveryPanelCard(store,view):panelCard(store,view)).join('')}</section>
    <div class="help">${key==='delivery'?'통합화면은 브랜드 간 데이터를 합쳐 쓰지 않습니다. 변경 요청은 반드시 선택한 브랜드의 고유 관리자 URL에서 수행하고, 연결되지 않은 플랫폼은 실행 대상에서 제외합니다.':'통합관리 메뉴는 세 브랜드의 동일 업무를 빠르게 찾는 공통 진입점입니다. 실제 수정·저장·권한 검사는 각 브랜드 관리자 범위에서 수행됩니다.'}</div>
    ${key==='delivery'?'<script src="/cmpmyi/admin/panel.js" defer></script>':''}
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

export function storePortfolioAdminPanelScript(){return new Response(`(${portfolioPanelClient.toString()})();`,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}

export { STORES as CMPMYI_STORES, SECTIONS as CMPMYI_ADMIN_SECTIONS, COMMON_MENU as CMPMYI_COMMON_MENU };
