import { renderEkodiUserFooter } from './config/user-footer.js';

function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

const MODULE_PRESENTATION=Object.freeze({
  directory:{name:'기관·단체',tag:'연결',desc:'지역 기관·단체·대학과 생활정보 찾기',audiences:'resident student merchant organization'},
  commerce:{name:'상권·상점',tag:'상권',desc:'지역 상점과 상권 공개정보',audiences:'resident student merchant'},
  'commerce-pass':{name:'청계패스',tag:'혜택',desc:'쿠폰·포인트·지역상품권·상권혜택',audiences:'resident student merchant'},
  events:{name:'행사·프로그램',tag:'참여',desc:'지역 행사와 신청',audiences:'resident student merchant organization'},
  forest:{name:'국민의숲',tag:'숲',desc:'승달산·목포대 지역상생 프로젝트',audiences:'resident student merchant organization'},
  jobs:{name:'구인구직',tag:'일자리',desc:'지역 일자리 연결',audiences:'resident student merchant'},
  sharing:{name:'나눔마켓',tag:'나눔',desc:'지역 나눔과 교환',audiences:'resident student merchant'},
  broadcast:{name:'지역방송',tag:'소식',desc:'라이브와 지역 콘텐츠',audiences:'resident student merchant organization'},
  proposals:{name:'참여·제안',tag:'소통',desc:'주민 의견과 제안',audiences:'resident student merchant organization'},
});

const EXPERIENCE_LINKS=Object.freeze({
  neighborhood:{id:'neighborhood',name:'우리동네',tag:'생활',desc:'지역 소식과 생활정보',audiences:'resident student merchant organization',href:'/cheonggye/directory'},
  campus:{id:'campus',name:'목포대 × 청계',tag:'대학',desc:'대학과 지역의 프로그램·상권·일자리 연결',audiences:'student resident merchant organization',href:'/cheonggye/directory#campus'},
});

function publicLinks(region){
  const modules=Object.fromEntries((region.modules||[]).map(module=>{
    const presentation=MODULE_PRESENTATION[module.id]||{};
    return [module.id,{
      id:module.id,
      name:presentation.name||module.label,
      tag:presentation.tag||'지역',
      desc:presentation.desc||module.summary,
      audiences:presentation.audiences||'resident student merchant organization',
      href:module.publicPath,
    }];
  }));
  return [
    EXPERIENCE_LINKS.neighborhood,
    modules.commerce,
    modules['commerce-pass'],
    EXPERIENCE_LINKS.campus,
    modules.directory,
    modules.events,
    modules.forest,
    modules.jobs,
    modules.sharing,
    modules.broadcast,
    modules.proposals,
  ].filter(Boolean);
}

function baseStyle(){
  return `<style>
  :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Noto Sans KR","Segoe UI",sans-serif;color:#16312a;background:#f4efe4;--local:#22634d;--local-dark:#174837;--local-soft:#e6f1eb;--paper:#fffdf8;--sand:#f4efe4;--ink:#16312a;--muted:#52645e;--line:#d8dfd9;--clay:#b85828}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--sand);color:var(--ink);word-break:keep-all;overflow-wrap:break-word}a{color:inherit}
  .site-header{width:100%;background:rgba(255,253,248,.97);border-bottom:1px solid var(--line)}
  .site-header__inner{width:min(1120px,calc(100% - 28px));min-height:66px;margin:0 auto;display:flex;align-items:center;gap:18px}
  .site-brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:900;letter-spacing:-.03em}.site-brand__mark{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:var(--local);color:#fff;font-size:15px}.site-brand__text{font-size:18px}
  .site-nav{margin-left:auto;display:flex;align-items:center;gap:4px}.site-nav a{min-height:44px;display:inline-flex;align-items:center;padding:0 11px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:760;color:#2f4b42}.site-nav a:hover,.site-nav a:focus-visible{background:var(--local-soft);outline:none}
  main{width:min(1120px,calc(100% - 28px));margin:0 auto;padding:24px 0 54px}
  .hero{position:relative;overflow:hidden;padding:clamp(26px,5vw,48px);border:1px solid #cbd9d1;border-radius:28px;background:linear-gradient(135deg,#e4f1ea 0%,#fff9ec 62%,#f6e8dc 100%)}
  .hero:after{content:"";position:absolute;right:-80px;bottom:-100px;width:250px;height:250px;border-radius:50%;border:48px solid rgba(34,99,77,.08)}
  .eyebrow{font-size:13px;font-weight:900;letter-spacing:.08em;color:#315e4f;text-transform:uppercase}
  .hero h1{position:relative;z-index:1;font-size:clamp(36px,8vw,64px);line-height:1.03;margin:10px 0 14px;letter-spacing:-.055em;color:#173f32}
  .hero .lead{position:relative;z-index:1;margin:0;max-width:720px;font-size:clamp(16px,2.4vw,19px);line-height:1.7;color:#334f45}
  .hero-actions{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.hero-actions a{min-height:44px;display:inline-flex;align-items:center;padding:0 14px;border:1px solid rgba(23,72,55,.22);border-radius:999px;background:rgba(255,255,255,.72);text-decoration:none;font-size:14px;font-weight:800}.hero-actions a:first-child{background:var(--local-dark);color:#fff;border-color:var(--local-dark)}
  .section{margin-top:30px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:12px}.section h2{margin:0;font-size:clamp(22px,4vw,28px);letter-spacing:-.035em}.section-note{margin:5px 0 0;color:var(--muted);font-size:14px;line-height:1.55}
  .intent-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.intent-strip a{min-height:52px;display:flex;align-items:center;justify-content:center;padding:10px;border:1px solid #cfdbd4;border-radius:14px;background:#fffdf8;text-align:center;text-decoration:none;font-size:14px;font-weight:820;color:#24463a}
  .grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
  .card{min-height:142px;display:flex;flex-direction:column;justify-content:space-between;padding:16px;border:1px solid #d7dfda;border-radius:20px;background:var(--paper);text-decoration:none;box-shadow:0 1px 0 rgba(20,49,40,.02)}
  .card-link:hover,.card-link:focus-visible{transform:translateY(-1px);border-color:#91ad9e;box-shadow:0 10px 24px rgba(25,67,52,.08);outline:none}.card__tag{align-self:flex-start;padding:5px 8px;border-radius:999px;background:var(--local-soft);color:#2b5d4b;font-size:11px;font-weight:900}.card strong{display:block;margin:10px 0 5px;font-size:17px;line-height:1.25;color:#183c31}.card span{color:#566860;font-size:13px;line-height:1.55}.card__arrow{margin-top:10px;color:var(--local);font-weight:900;font-size:13px}
  .personal{display:grid;grid-template-columns:1.2fr .8fr;gap:12px}.personal__main,.personal__aside{padding:20px;border-radius:22px}.personal__main{background:#173f32;color:#fff}.personal__main p{margin:8px 0 0;color:#dce9e3;line-height:1.65}.personal__aside{border:1px solid #d8dfd9;background:#fffdf8}.personal__aside p{margin:7px 0 0;color:var(--muted);line-height:1.6}
  .button{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border-radius:12px;background:#173f32;color:#fff;text-decoration:none;font-weight:800;white-space:nowrap}.button-light{margin-top:16px;background:#fff;color:#173f32}
  .talk{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;padding:20px;border:1px solid #ddcfc2;border-radius:22px;background:#fff8ef}.talk strong{font-size:18px}.talk p{margin:5px 0 0;color:#68594d;line-height:1.6}
  .org{display:flex;gap:14px;align-items:center;justify-content:space-between;padding:18px;border:1px solid #dce3de;border-radius:18px;background:#fff}.muted{color:#63736d;font-size:14px;line-height:1.55}
  .admin-header{background:#10271f;color:#fff;border-bottom-color:#24473b}.admin-header .site-brand__mark{background:#d5eadf;color:#173f32}.admin-header .site-brand__text{color:#fff}.admin-header .site-nav a{color:#d9e8e1}.admin-header .site-nav a:hover,.admin-header .site-nav a:focus-visible{background:#24473b}.admin-header .site-nav__public{border:1px solid #476c5f}
  .admin-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.admin-kpi{padding:16px;border:1px solid #d6dfda;border-radius:18px;background:#fff}.admin-kpi span{display:block;color:#63736d;font-size:12px;font-weight:800}.admin-kpi strong{display:block;margin-top:6px;font-size:20px;letter-spacing:-.03em}.admin-kpi small{display:block;margin-top:5px;color:#73817c;line-height:1.45}
  .operator-table .button{min-height:36px;padding:0 10px;font-size:12px}.operator-note{margin-top:10px;padding:13px 15px;border-left:4px solid var(--local);background:#f4f8f5;color:#4d625a;line-height:1.6;font-size:14px}.admin-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.admin-action{display:flex;flex-direction:column;gap:7px;padding:16px;border:1px solid #d8dfda;border-radius:18px;background:#fff;text-decoration:none}.admin-action strong{font-size:16px}.admin-action span{color:#687770;font-size:13px;line-height:1.5}
  .ledger-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:14px}.ledger-kpi{padding:13px 14px;border:1px solid #d8dfda;border-radius:15px;background:#fff}.ledger-kpi span{display:block;color:#66776f;font-size:12px;font-weight:800}.ledger-kpi strong{display:block;margin-top:4px;font-size:20px}.ledger-title{margin:18px 0 9px;font-size:16px}.ledger-events{display:grid;gap:8px}.ledger-event{padding:12px 14px;border:1px solid #dce3de;border-radius:14px;background:#fff}.ledger-event__top{display:flex;justify-content:space-between;gap:12px;align-items:center}.ledger-event__top span{color:#718079;font-size:12px}.ledger-event p{margin:5px 0 0;color:#586a62;font-size:13px;line-height:1.5}.ledger-meta{margin:12px 0 0;color:#64756d;font-size:13px;line-height:1.55}
  .ledger-manage{margin:16px 0 20px;padding:16px;border:1px solid #cfdad4;border-radius:18px;background:#f8fbf9}.ledger-manage>.ledger-title{margin-top:0}.ledger-manage-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ledger-manage-card{display:grid;gap:10px;padding:14px;border:1px solid #d8dfda;border-radius:15px;background:#fff}.ledger-manage-card>strong{font-size:15px}.ledger-manage-card label{display:grid;gap:5px;color:#43584f;font-size:12px;font-weight:800}.ledger-manage-card input,.ledger-manage-card select{min-height:42px;width:100%;padding:8px 10px;border:1px solid #d1dbd5;border-radius:10px;background:#fff;color:#173f32;font:inherit}.ledger-manage-card .button{width:max-content;border:0;cursor:pointer}.ledger-manage-card .button:disabled{opacity:.55;cursor:wait}.ledger-warning{margin:0;padding:10px 11px;border-radius:10px;background:#fff4df;color:#74521d;font-size:12px;line-height:1.55}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dce3e8;border-radius:16px;overflow:hidden}th,td{padding:12px;border-bottom:1px solid #e7ecef;text-align:left;vertical-align:top;font-size:14px}th{background:#f8fafb;color:#4c5b68}.status{display:inline-block;padding:4px 8px;border-radius:999px;background:#edf4ef;font-size:12px;font-weight:750}
  .policy{padding:16px 18px;border-radius:16px;background:#eef3f6;line-height:1.65;color:#475866}.access-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.access-form label{display:grid;gap:6px;font-size:13px;font-weight:750}.access-form input,.access-form select{min-height:44px;padding:9px 11px;border:1px solid #dce3e8;border-radius:10px;background:#fff}.access-form .wide{grid-column:1/-1}.access-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.access-result{font-size:13px;color:#52606d}.auth-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.auth-chip{padding:6px 9px;border-radius:999px;background:#eef3f6;font-size:12px}.auth-chip span{font-weight:800}.content-list{display:grid;gap:10px}.content-item{padding:18px;border:1px solid #d8dfda;border-radius:18px;background:#fff}.content-item__head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.content-item h3{margin:10px 0 6px;font-size:18px;letter-spacing:-.02em}.content-item__meta,.content-item__summary{margin:5px 0;color:#5b6d65;line-height:1.6;font-size:14px}.content-item__link{display:inline-flex;margin-top:9px;color:var(--local);font-weight:850;text-decoration:none}.content-empty{padding:20px;border:1px dashed #cbd7d0;border-radius:16px;background:#fbfdfb;color:#63736d;line-height:1.6}.content-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.mini{min-height:36px;padding:0 11px;border:1px solid #cfd9d3;border-radius:10px;background:#fff;color:#28483d;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.mini.danger{border-color:#e4c8c8;color:#8a3a3a}.module-form textarea{min-height:110px;padding:9px 11px;border:1px solid #dce3e8;border-radius:10px;background:#fff;resize:vertical;font:inherit}[data-region-auth-pending="1"] main{visibility:hidden}[data-region-auth-pending="1"] [data-region-capability]{display:none!important}
  @media(max-width:900px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}.intent-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.personal{grid-template-columns:1fr}.admin-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-actions{grid-template-columns:1fr}.ledger-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.ledger-manage-grid{grid-template-columns:1fr}}
  @media(max-width:680px){.site-header__inner{min-height:58px;gap:8px}.site-brand__text{font-size:16px}.site-nav a{padding:0 9px;font-size:12px}.site-nav a:nth-child(2),.site-nav a:nth-child(3){display:none}main{width:min(100% - 20px,1120px);padding-top:14px}.hero{padding:24px 20px;border-radius:22px}.hero h1{font-size:40px}.hero .lead{font-size:16px;line-height:1.65}.section{margin-top:24px}.section-head{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.card{min-height:132px;padding:14px;border-radius:16px}.card strong{font-size:16px}.talk{grid-template-columns:1fr}.talk .button{width:100%}.org{align-items:flex-start;flex-direction:column}.access-form{grid-template-columns:1fr}.access-form .wide{grid-column:auto}th:nth-child(3),td:nth-child(3){display:none}}
  @media(max-width:390px){.site-nav a:not(:first-child){display:none}.grid{grid-template-columns:1fr 1fr}.card{min-height:126px}.hero-actions a{flex:1 1 calc(50% - 8px);justify-content:center}}
  </style>`;
}

function publicHeader(region){
  return `<header class="site-header"><div class="site-header__inner"><a class="site-brand" href="/cheonggye" aria-label="${esc(region.brand)} 홈"><span class="site-brand__mark">청계</span><span class="site-brand__text">${esc(region.brand)}</span></a><nav class="site-nav" aria-label="청계잇다 주요 메뉴"><a href="#local-services">지역서비스</a><a href="/cheonggye/pass">청계패스</a><a href="#participate">소통</a></nav></div></header>`;
}

function adminHeader(region){
  return `<header class="site-header admin-header"><div class="site-header__inner"><a class="site-brand" href="/cheonggye/admin" aria-label="${esc(region.brand)} 관리자 홈"><span class="site-brand__mark">관리</span><span class="site-brand__text">${esc(region.brand)} 관리자</span></a><nav class="site-nav" aria-label="청계잇다 관리자 메뉴"><a href="/cheonggye/admin">통합현황</a><a href="/cheonggye/admin#operations" data-region-capability="tenant.operations.manage">운영권</a><a href="/cheonggye/admin/pass">청계패스</a><a href="/cheonggye/admin/forest">국민의숲</a><a href="/cheonggye/admin/access" data-region-capability="tenant.access.manage">사용자·권한</a><a href="/cgma/admin">상인회 관리</a><a class="site-nav__public" href="/cheonggye">사용자 화면</a></nav></div></header>`;
}

function document(region,title,body,admin=false,canonicalPath=null){
  const surface=admin?'admin':'public';
  const authAttrs=admin?' data-region-auth-pending="1"':'';
  const scripts=admin?'<script src="/cheonggye/local-region-admin-auth.js" defer></script>':'';
  const chrome=admin?adminHeader(region):publicHeader(region);
  const footer=admin?'':renderEkodiUserFooter();
  const path=admin?'':(canonicalPath===null?String(region.publicPath||''):String(canonicalPath||''));
  const canonical=path?`<link rel="canonical" href="https://ekodi.kr${esc(path)}"><meta property="og:url" content="https://ekodi.kr${esc(path)}">`:'';
  return `<!doctype html><html lang="ko" data-ekodi-site-subject="${esc(region.siteSubject)}" data-ekodi-local-region="${esc(region.id)}" data-ekodi-region-surface="${surface}" data-ekodi-site-experience="local-conversational-adaptive-v1" data-ekodi-personalization="progressive-consent"${authAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${canonical}${baseStyle()}</head><body>${chrome}${body}${footer}${scripts}</body></html>`;
}

function publicCard(item){
  const tag=`<span class="card__tag">${esc(item.tag)}</span>`;
  const body=`${tag}<div><strong>${esc(item.name)}</strong><span>${esc(item.desc)}</span></div>`;
  if(item.href)return `<a id="${esc(item.id)}" class="card card-link" href="${esc(item.href)}" data-audiences="${esc(item.audiences)}">${body}<span class="card__arrow">바로가기 →</span></a>`;
  return `<article id="${esc(item.id)}" class="card" data-audiences="${esc(item.audiences)}">${body}<span class="card__arrow">서비스 영역</span></article>`;
}

function publicBody(region){
  return `<main class="local-page"><section class="hero"><div class="eyebrow">청계 지역 공통 플랫폼</div><h1>${esc(region.brand)}</h1><p class="lead">청계에서 필요한 소식, 상점, 행사, 일자리와 나눔을 한곳에서 찾고 지역의 사람·단체와 자연스럽게 연결됩니다.</p><div class="hero-actions" aria-label="빠른 시작"><a href="#commerce">가게 찾기</a><a href="#events">행사 보기</a><a href="#jobs">일자리</a><a href="#proposal">의견·제안</a></div></section>
  <section class="section" aria-labelledby="intent-title"><div class="section-head"><div><h2 id="intent-title">오늘, 청계에서 무엇을 하시나요?</h2><p class="section-note">설명보다 목적을 먼저 고르면 필요한 영역으로 바로 이동합니다.</p></div></div><div class="intent-strip"><a href="#neighborhood">동네 소식 보기</a><a href="#commerce">상점·상권 찾기</a><a href="#events">행사 참여하기</a><a href="#proposal">지역에 의견 전하기</a></div></section>
  <section class="section" id="local-services"><div class="section-head"><div><h2>지역 서비스</h2><p class="section-note">주민·상인·학생·기관이 함께 쓰되, 각 서비스는 필요한 정보부터 짧고 분명하게 보여줍니다.</p></div></div><div class="grid">${publicLinks(region).map(publicCard).join('')}</div></section>
  <section class="section personal" data-personalization-surface="local-cheonggye"><div class="personal__main"><strong>필요한 정보부터 간단하게</strong><p>청계잇다는 로그인하지 않아도 기본 지역정보를 사용할 수 있습니다. 맞춤 기능이 제공되는 경우에도 각 지역서비스 안에서 필요한 설정만 안내합니다.</p></div><div class="personal__aside"><strong>이용 원칙</strong><p>민감한 정보를 추정하지 않고, 공개 정보와 개인·단체의 비공개 정보는 구분해서 다룹니다.</p></div></section>
  <section class="section" id="participate"><div class="talk"><div><strong>청계에 말하기</strong><p>지역 제안·행사·상권·생활정보는 관련 지역서비스와 연결합니다. 필요한 의견과 제안을 쉽게 남길 수 있는 흐름을 우선합니다.</p></div><a class="button" href="#proposal">참여·제안 보기</a></div></section>
  <section class="section" id="local-organizations"><div class="section-head"><div><h2>함께하는 지역 조직</h2><p class="section-note">지역의 기관·단체와 연결해 필요한 공개정보와 참여 기회를 안내합니다.</p></div></div><div class="org"><div><strong>청계면상인회</strong><div class="muted">지역 상권과 상인 네트워크를 연결하는 참여 조직입니다.</div></div><a class="button" href="/cgma">상인회 보기</a></div></section>
  </main>`;
}

function adminBody(region){
  const rows=region.modules.map(module=>{
    const lead=region.operators[module.leadOperatorId];
    const co=module.operatorIds.filter(id=>id!==module.leadOperatorId).map(id=>region.operators[id]?.name||id);
    return `<tr><td><strong>${esc(module.label)}</strong><div class="muted">${esc(module.id)}</div></td><td>${esc(lead?.name||module.leadOperatorId)}</td><td>${esc(co.length?co.join(', '):'없음')}</td><td><span class="status">운영중</span></td></tr>`;
  }).join('');
  const operatorRows=Object.values(region.operators).map(operator=>{
    const managed=region.modules.filter(module=>module.operatorIds.includes(operator.id));
    const leadCount=managed.filter(module=>module.leadOperatorId===operator.id).length;
    const role=operator.role==='lead_operator'?'주 운영단체':operator.role==='co_operator'?'공동 운영단체':operator.role;
    return `<tr><td><strong>${esc(operator.name)}</strong><div class="muted">${esc(operator.kind)}</div></td><td>${esc(role)}</td><td>${managed.length}개 서비스 · 주 운영 ${leadCount}개</td><td><span class="status">${operator.status==='active'?'활성':'중지'}</span></td><td><a class="button" href="${esc(operator.adminPath)}">전용관리</a></td></tr>`;
  }).join('');
  const activeOperators=Object.values(region.operators).filter(operator=>operator.status==='active').length;
  return `<main class="admin-page"><section class="hero"><div class="eyebrow">청계 지역플랫폼 · 관리자</div><h1>${esc(region.brand)} 운영관리</h1><p class="lead">플랫폼 소유권은 청계 지역플랫폼에 유지하고, <strong>청계면상인회가 현재 지역 공통서비스의 주 운영권</strong>을 맡습니다. 운영단체의 고유 회원·회계·문서는 별도 영역에 남겨 지역 공통 데이터와 분리합니다.</p></section>
  <section class="admin-summary" aria-label="관리 현황"><div class="admin-kpi"><span>운영권 보유 단체</span><strong>${activeOperators}</strong><small>현재 청계면상인회</small></div><div class="admin-kpi"><span>지역 공통서비스</span><strong>${region.modules.length}</strong><small>서비스별 운영권 분리 가능</small></div><div class="admin-kpi"><span>운영 모델</span><strong>위임·공동운영</strong><small>운영권 이양 시 감사이력 보존</small></div><div class="admin-kpi"><span>데이터 이양</span><strong>이동 없음</strong><small>운영주체가 바뀌어도 지역 데이터 유지</small></div></section>
  <section class="section" id="operations" data-region-capability="tenant.operations.manage"><div class="section-head"><div><h2>운영권</h2><p class="section-note">현재 등록된 지역 운영단체와 실제 운영범위를 확인합니다.</p></div></div><table class="operator-table"><thead><tr><th>운영단체</th><th>역할</th><th>운영범위</th><th>상태</th><th>관리</th></tr></thead><tbody>${operatorRows}</tbody></table><div class="operator-note"><strong>청계면상인회 운영권 적용:</strong> 상인회 책임관리자·관리자·운영책임자는 청계잇다 운영화면에 위임된 운영권으로 접근할 수 있습니다. 사용자·권한 관리와 플랫폼 소유권 변경은 별도 명시 권한이 있어야 합니다.</div></section>
  <section class="section" data-region-capability="tenant.operations.manage"><div class="section-head"><div><h2>서비스별 운영주체</h2><p class="section-note">청계면상인회가 현재 모든 지역 공통서비스의 주 운영단체로 등록되어 있습니다.</p></div></div><table><thead><tr><th>지역서비스</th><th>주 운영단체</th><th>공동운영</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table></section>
  <section class="section" id="operations-history" data-region-capability="tenant.operations.manage"><div class="section-head"><div><h2>운영권 이력</h2><p class="section-note">현재 운영권과 변경 기록을 실제 운영 데이터 기준으로 확인합니다. 이후 공동운영·이양이 발생해도 기록은 삭제하지 않습니다.</p></div></div><div data-region-operations-ledger><p class="muted">운영권 현황을 확인하고 있습니다.</p></div></section>
  <section class="section"><div class="section-head"><div><h2>관리 바로가기</h2><p class="section-note">권한에 맞는 관리화면으로 이동합니다.</p></div></div><div class="admin-actions"><a class="admin-action" href="/cheonggye/admin/forest"><strong>국민의숲 프로젝트</strong><span>추진이력·현재단계·근거자료 공개상태를 관리합니다.</span></a><a class="admin-action" href="/cheonggye/admin/pass"><strong>청계패스 운영</strong><span>지역상품권·쿠폰·포인트와 외부 연동 상태를 관리합니다.</span></a><a class="admin-action" href="/cheonggye/admin/access" data-region-capability="tenant.access.manage"><strong>사용자·권한</strong><span>Google 이메일 사전등록, 역할, 만료일과 권한 회수를 관리합니다.</span></a><a class="admin-action" href="/cgma/admin"><strong>청계면상인회 관리</strong><span>회원·회비·회의·문서·회계 등 상인회 고유업무를 관리합니다.</span></a></div></section>
  <section class="section"><h2>권한 이양 원칙</h2><div class="policy">새 운영주체 등록 → 서비스별 공동운영 기간 → 책임권한 이양 → 기존 운영자 권한 축소의 순서로 처리합니다. 이양 시 지역 데이터는 이동·복사하지 않고 그대로 유지하며, 변경 전후 운영자와 감사이력을 보존합니다. 상인회 자체 데이터는 <strong>/cgma</strong> 소유로 남습니다.</div></section>
  <div class="auth-meta"><span class="auth-chip">로그인 <span data-region-auth-email></span></span><span class="auth-chip">권한 <span data-region-auth-role></span></span></div>
  </main>`;
}


function modulePublicBody(region,module){
  const sourceLink=module.sourceWorkspace?'<a class="button" href="'+esc(module.sourceWorkspace)+'">관련 조직 보기</a>':'';
  return `<main class="local-page" data-ekodi-local-module="${esc(module.id)}"><section class="hero"><div class="eyebrow">청계잇다 · 지역서비스</div><h1>${esc(module.label)}</h1><p class="lead">${esc(module.summary)}</p><div class="hero-actions"><a href="/cheonggye">청계잇다 홈</a><a href="#service-info">이용 안내</a></div></section>
  ${module.contentMode==='regional-ledger'?'<section class="section" data-local-region-content-root><div class="section-head"><div><h2>최신 지역정보</h2><p class="section-note">공개된 최신 정보를 확인할 수 있습니다.</p></div><span class="status" data-local-region-content-count>확인 중</span></div><div class="content-list" data-local-region-content-list><div class="content-empty">공개정보를 불러오고 있습니다.</div></div></section>':''}
  <section class="section" id="service-info"><div class="section-head"><div><h2>이용 안내</h2><p class="section-note">이 페이지에는 지역에서 함께 볼 수 있는 공개정보만 표시합니다.</p></div></div><div class="grid">
    <article class="card"><span class="card__tag">정보</span><div><strong>공개 정보 중심</strong><span>지역에서 함께 확인할 수 있는 내용을 우선 보여줍니다.</span></div><span class="card__arrow">필요한 내용부터 간단하게</span></article>
    <article class="card"><span class="card__tag">연결</span><div><strong>청계잇다와 연계</strong><span>상점·행사·일자리·나눔 등 다른 지역서비스로 이어집니다.</span></div><span class="card__arrow">관련 서비스 함께 보기</span></article>
    <article class="card"><span class="card__tag">보호</span><div><strong>비공개 정보 보호</strong><span>개인정보와 단체 내부정보는 공개 화면에 표시하지 않습니다.</span></div><span class="card__arrow">공개 범위만 제공</span></article>
  </div></section>
  ${sourceLink?'<section class="section"><div class="talk"><div><strong>관련 지역 조직</strong><p>이 서비스와 연결된 지역 조직의 공개 페이지를 확인할 수 있습니다.</p></div><div class="access-actions">'+sourceLink+'</div></div></section>':''}
  </main>`;
}

function moduleAdminBody(region,module){
  const lead=region.operators?.[module.leadOperatorId]||null;
  return `<main class="admin-page" data-ekodi-local-module="${esc(module.id)}"><section class="hero"><div class="eyebrow">청계잇다 · 하위서비스 관리자</div><h1>${esc(module.label)} 운영관리</h1><p class="lead">${esc(module.summary)} 공개 지역데이터는 청계 지역플랫폼에 남고, 현재 운영권은 ${esc(lead?.name||module.leadOperatorId)}에 위임되어 있습니다.</p></section>
  <section class="admin-summary" aria-label="하위서비스 운영계약"><div class="admin-kpi"><span>주 운영단체</span><strong>${esc(lead?.name||module.leadOperatorId)}</strong><small>${esc(module.leadOperatorId)}</small></div><div class="admin-kpi"><span>데이터 소유</span><strong>지역플랫폼</strong><small>${esc(module.dataOwner)}</small></div><div class="admin-kpi"><span>소스정책</span><strong>분리·투영</strong><small>${esc(module.sourcePolicy)}</small></div><div class="admin-kpi"><span>공개범위</span><strong>${esc(module.publishScope)}</strong><small>공개 경로 ${esc(module.publicPath)}</small></div></section>
  <section class="section"><div class="section-head"><div><h2>강제 실행 계약</h2><p class="section-note">이 서비스는 등록 경로·운영주체·데이터 소유경계·소스정책이 모두 유효해야 라우팅됩니다.</p></div></div><div class="policy"><strong>공개:</strong> ${esc(module.publicPath)}<br><strong>관리:</strong> ${esc(module.adminPath)}<br><strong>운영주체:</strong> ${esc(lead?.name||module.leadOperatorId)}<br><strong>데이터 원칙:</strong> 조직 내부 원본은 복제하지 않고 승인된 공개 투영만 지역플랫폼에 연결합니다.</div></section>
  ${module.contentMode==='regional-ledger'?'<section class="section" data-local-region-content-admin hidden><div class="section-head"><div><h2>운영정보 등록·수정</h2><p class="section-note">공개할 지역정보만 등록합니다. 상인회 내부자료는 이 원장에 저장하지 않습니다.</p></div></div><form class="access-form module-form" data-content-form><input type="hidden" name="itemId"><label>종류<input name="kind" maxlength="64" value="item" placeholder="event, job, shop 등"></label><label>상태<select name="status"><option value="active">활성</option><option value="planned">예정</option><option value="completed">완료</option><option value="closed">종료</option><option value="filled">마감</option></select></label><label class="wide">제목<input name="title" maxlength="180" required></label><label class="wide">설명<textarea name="summary" maxlength="1800"></textarea></label><label>시작일<input name="startsOn" type="date"></label><label>종료일<input name="endsOn" type="date"></label><label>장소<input name="location" maxlength="240"></label><label>연락·문의<input name="contactText" maxlength="240"></label><label class="wide">연결주소<input name="targetUrl" maxlength="600" placeholder="/cheonggye/... 또는 https://..."></label><label>공개상태<select name="visibility"><option value="public">공개</option><option value="private">비공개</option><option value="archived">보관</option></select></label><label>정렬순서<input name="sortOrder" type="number" min="-1000" max="1000" value="0"></label><div class="wide access-actions"><button class="button" type="submit">저장</button><button class="mini" type="button" data-content-reset>새 항목</button><span class="access-result" data-content-result></span></div></form><div class="section" style="margin-top:18px"><div class="content-list" data-content-admin-list><div class="content-empty">운영정보를 불러오고 있습니다.</div></div></div></section>':''}
  <section class="section"><div class="admin-actions"><a class="admin-action" href="${esc(module.publicPath)}"><strong>사용자 화면</strong><span>공개 하위서비스를 확인합니다.</span></a><a class="admin-action" href="/cheonggye/admin"><strong>청계잇다 통합관리</strong><span>전체 서비스 운영권과 이력을 확인합니다.</span></a><a class="admin-action" href="${esc(lead?.adminPath||'/cgma/admin')}"><strong>운영단체 관리</strong><span>회원·회비·내부문서 등 조직 고유업무로 이동합니다.</span></a></div></section>
  <div class="auth-meta"><span class="auth-chip">로그인 <span data-region-auth-email></span></span><span class="auth-chip">권한 <span data-region-auth-role></span></span></div></main>`;
}

export function localRegionModulePublicPage(region,module){
  if(!region||!module)return localRegionNotFoundPage(region,{path:'unknown'});
  let response=document(region,`${module.label} | ${region.brand}`,modulePublicBody(region,module),false,module.publicPath);
  if(module.contentMode==='regional-ledger')response=response.replace('</body>','<script src="/cheonggye/local-region-module-public.js" defer></script></body>');
  return new Response(response,{status:200,headers:headers('local-region-module-public',{userChrome:true})});
}

export function localRegionModuleAdminPage(region,module){
  if(!region||!module)return localRegionNotFoundPage(region,{admin:true,path:'unknown'});
  let response=document(region,`${module.label} 운영관리 | ${region.brand}`,moduleAdminBody(region,module),true);
  if(module.contentMode==='regional-ledger')response=response.replace('</body>','<script src="/cheonggye/local-region-module-admin.js" defer></script></body>');
  return new Response(response,{status:200,headers:headers('local-region-module-admin')});
}

export function localRegionNotFoundPage(region,{admin=false,path=''}={}){
  const brand=region?.brand||'청계잇다';
  const home=admin?'/cheonggye/admin':'/cheonggye';
  const body=`<main><section class="hero"><div class="eyebrow">등록되지 않은 지역 경로</div><h1>페이지를 찾을 수 없습니다</h1><p class="lead">${esc(path||'요청한 경로')}는 ${esc(brand)}에 등록된 하위서비스가 아닙니다. 등록된 서비스만 운영 규칙에 따라 연결됩니다.</p><div class="hero-actions"><a href="${home}">돌아가기</a></div></section></main>`;
  return new Response(document(region||{brand,siteSubject:'local-cheonggye',id:'local:cheonggye'},`페이지 없음 | ${brand}`,body,admin,''),{status:404,headers:headers('local-region-not-found',{userChrome:!admin})});
}

function headers(route,{userChrome=false}={}){
  const result={'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-ekodi-route':route,'x-ekodi-site-experience':'local-conversational-adaptive-v1'};
  if(userChrome)result['x-ekodi-user-chrome']='v1';
  return result;
}

export function localRegionPublicPage(region){
  return new Response(document(region,`${region.brand} | ${region.name} 지역플랫폼`,publicBody(region),false),{status:200,headers:headers('local-region-public',{userChrome:true})});
}

function accessAdminBody(region){
  return `<main><section class="hero"><div class="eyebrow">IDENTITY · SCOPED ACCESS</div><h1>${esc(region.brand)} 사용자·권한</h1><p class="lead">관리자가 Google 이메일을 사전등록하면 사용자는 같은 Google 계정으로 로그인하고, 등록된 서비스 범위와 역할에 맞는 관리메뉴만 사용할 수 있습니다.</p></section>
  <section class="section"><h2>이메일 권한 등록</h2><div class="card"><form id="regionAccessForm" class="access-form">
    <label>적용 범위<select id="regionAccessScope"></select></label><label>역할<select id="regionAccessRole"></select></label>
    <label>이름<input id="regionAccessName" type="text" maxlength="120" placeholder="김전일"></label><label>Google 이메일<input id="regionAccessEmail" type="email" required placeholder="user@gmail.com"></label>
    <div class="wide access-form" data-external-fields hidden><label>GitHub 사용자명<input id="regionAccessGithub" type="text" maxlength="39" placeholder="외부개발자만 필수"></label><label>접근 만료일<input id="regionAccessExpiry" type="date"></label></div>
    <div class="wide access-actions"><button id="regionAccessSubmit" class="button" type="submit">이메일 권한 등록</button><span id="regionAccessResult" class="access-result"></span></div>
  </form></div></section>
  <section class="section"><h2>현재 등록 권한</h2><div data-region-access-list class="card"><p class="muted">권한 목록을 확인하고 있습니다.</p></div></section>
  <section class="section"><div class="policy">외부업체 권한은 회원명부·재무·비밀키·권한관리·운영배포를 포함하지 않습니다. 외부개발자는 별도로 GitHub 사용자명과 만료일이 필요합니다.</div></section>
  </main>`;
}

export function localRegionAdminPage(region){
  const response=document(region,`${region.brand} 운영관리`,adminBody(region),true).replace('</body>','<script src="/cheonggye/local-region-operations-admin.js" defer></script></body>');
  return new Response(response,{status:200,headers:headers('local-region-admin')});
}

export function localRegionAccessAdminPage(region){
  const response=document(region,`${region.brand} 사용자·권한`,accessAdminBody(region),true).replace('</body>','<script src="/cheonggye/local-region-access-admin.js" defer></script></body>');
  return new Response(response,{status:200,headers:headers('local-region-access-admin')});
}
