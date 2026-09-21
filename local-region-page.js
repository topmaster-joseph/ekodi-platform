import { renderEkodiUserFooter } from './config/user-footer.js';

function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

const PUBLIC_LINKS=Object.freeze([
  {id:'neighborhood',name:'우리동네',tag:'생활',desc:'지역 소식과 생활정보',audiences:'resident student merchant organization'},
  {id:'commerce',name:'상권·상점',tag:'상권',desc:'지역 상점과 상권 정보',audiences:'resident student merchant',href:'/cgma'},
  {id:'pass',name:'청계패스',tag:'혜택',desc:'지역상품권·쿠폰·포인트·상권혜택',audiences:'resident student merchant',href:'/cheonggye/pass'},
  {id:'campus',name:'목포대',tag:'대학',desc:'대학과 지역의 연결',audiences:'student resident merchant organization'},
  {id:'directory',name:'기관·단체',tag:'연결',desc:'지역 기관과 단체 찾기',audiences:'resident organization'},
  {id:'events',name:'행사·프로그램',tag:'참여',desc:'지역 행사와 신청',audiences:'resident student merchant organization'},
  {id:'jobs',name:'구인구직',tag:'일자리',desc:'지역 일자리 연결',audiences:'resident student merchant'},
  {id:'sharing',name:'나눔마켓',tag:'나눔',desc:'지역 나눔과 교환',audiences:'resident student merchant'},
  {id:'broadcast',name:'지역방송',tag:'소식',desc:'라이브와 지역 콘텐츠',audiences:'resident student merchant organization'},
  {id:'proposal',name:'참여·제안',tag:'소통',desc:'주민 의견과 제안',audiences:'resident student merchant organization'},
]);

function baseStyle(){
  return `<style>
  :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Noto Sans KR","Segoe UI",sans-serif;color:#16312a;background:#f4efe4;--local:#22634d;--local-dark:#174837;--local-soft:#e6f1eb;--paper:#fffdf8;--sand:#f4efe4;--ink:#16312a;--muted:#52645e;--line:#d8dfd9;--clay:#b85828}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--sand);color:var(--ink);word-break:keep-all;overflow-wrap:break-word}a{color:inherit}
  .site-header{width:100%;background:rgba(255,253,248,.97);border-bottom:1px solid var(--line)}
  .site-header__inner{width:min(1120px,calc(100% - 28px));min-height:66px;margin:0 auto;display:flex;align-items:center;gap:18px}
  .site-brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:900;letter-spacing:-.03em}.site-brand__mark{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:var(--local);color:#fff;font-size:15px}.site-brand__text{font-size:18px}
  .site-nav{margin-left:auto;display:flex;align-items:center;gap:4px}.site-nav a{min-height:44px;display:inline-flex;align-items:center;padding:0 11px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:760;color:#2f4b42}.site-nav a:hover,.site-nav a:focus-visible{background:var(--local-soft);outline:none}.site-nav .site-nav__my{background:#173f32;color:#fff}
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
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dce3e8;border-radius:16px;overflow:hidden}th,td{padding:12px;border-bottom:1px solid #e7ecef;text-align:left;vertical-align:top;font-size:14px}th{background:#f8fafb;color:#4c5b68}.status{display:inline-block;padding:4px 8px;border-radius:999px;background:#edf4ef;font-size:12px;font-weight:750}
  .policy{padding:16px 18px;border-radius:16px;background:#eef3f6;line-height:1.65;color:#475866}.access-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.access-form label{display:grid;gap:6px;font-size:13px;font-weight:750}.access-form input,.access-form select{min-height:44px;padding:9px 11px;border:1px solid #dce3e8;border-radius:10px;background:#fff}.access-form .wide{grid-column:1/-1}.access-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.access-result{font-size:13px;color:#52606d}.auth-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.auth-chip{padding:6px 9px;border-radius:999px;background:#eef3f6;font-size:12px}.auth-chip span{font-weight:800}[data-region-auth-pending="1"] main{visibility:hidden}
  @media(max-width:900px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}.intent-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.personal{grid-template-columns:1fr}}
  @media(max-width:680px){.site-header__inner{min-height:58px;gap:8px}.site-brand__text{font-size:16px}.site-nav a{padding:0 9px;font-size:12px}.site-nav a:nth-child(2),.site-nav a:nth-child(3){display:none}main{width:min(100% - 20px,1120px);padding-top:14px}.hero{padding:24px 20px;border-radius:22px}.hero h1{font-size:40px}.hero .lead{font-size:16px;line-height:1.65}.section{margin-top:24px}.section-head{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.card{min-height:132px;padding:14px;border-radius:16px}.card strong{font-size:16px}.talk{grid-template-columns:1fr}.talk .button{width:100%}.org{align-items:flex-start;flex-direction:column}.access-form{grid-template-columns:1fr}.access-form .wide{grid-column:auto}th:nth-child(3),td:nth-child(3){display:none}}
  @media(max-width:390px){.site-nav a:not(.site-nav__my){display:none}.grid{grid-template-columns:1fr 1fr}.card{min-height:126px}.hero-actions a{flex:1 1 calc(50% - 8px);justify-content:center}}
  </style>`;
}

function publicHeader(region){
  return `<header class="site-header"><div class="site-header__inner"><a class="site-brand" href="/cheonggye" aria-label="${esc(region.brand)} 홈"><span class="site-brand__mark">청계</span><span class="site-brand__text">${esc(region.brand)}</span></a><nav class="site-nav" aria-label="청계잇다 주요 메뉴"><a href="#local-services">지역서비스</a><a href="/cheonggye/pass">청계패스</a><a href="#participate">소통</a><a class="site-nav__my" href="/my/">내 에코디</a></nav></div></header>`;
}

function document(region,title,body,admin=false){
  const surface=admin?'admin':'public';
  const authAttrs=admin?' data-region-auth-pending="1"':'';
  const scripts=admin?'<script src="/cheonggye/local-region-admin-auth.js" defer></script>':'';
  const chrome=admin?'':publicHeader(region);
  const footer=admin?'':renderEkodiUserFooter();
  return `<!doctype html><html lang="ko" data-ekodi-site-subject="${esc(region.siteSubject)}" data-ekodi-local-region="${esc(region.id)}" data-ekodi-region-surface="${surface}" data-ekodi-site-experience="local-conversational-adaptive-v1" data-ekodi-personalization="progressive-consent"${authAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${baseStyle()}</head><body>${chrome}${body}${footer}${scripts}</body></html>`;
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
  <section class="section" id="local-services"><div class="section-head"><div><h2>지역 서비스</h2><p class="section-note">주민·상인·학생·기관이 함께 쓰되, 각 서비스는 필요한 정보부터 짧고 분명하게 보여줍니다.</p></div></div><div class="grid">${PUBLIC_LINKS.map(publicCard).join('')}</div></section>
  <section class="section personal" data-personalization-surface="local-cheonggye"><div class="personal__main"><strong>나에게 맞게 보기</strong><p>로그인하면 주민·상인·학생·기관 등 내가 선택한 역할과 관심사에 맞춰 자주 쓰는 지역서비스와 알림을 우선 보여주는 방식으로 확장합니다. 비로그인 상태에서도 모든 기본 정보는 그대로 사용할 수 있습니다.</p><a class="button button-light" href="/my/">내 에코디에서 맞춤 설정</a></div><div class="personal__aside"><strong>맞춤의 원칙</strong><p>권한은 바꾸지 않고 화면 순서와 추천만 조정합니다. 민감한 정보를 추정하지 않으며, 맞춤 설정은 언제든 되돌릴 수 있습니다.</p></div></section>
  <section class="section" id="participate"><div class="talk"><div><strong>청계에 말하기</strong><p>지역 제안·행사·상권·생활정보는 해당 서비스의 운영주체와 연결합니다. 플랫폼은 주민의 목소리를 묻고 듣는 통로를 우선합니다.</p></div><a class="button" href="#proposal">참여·제안 보기</a></div></section>
  <section class="section" id="local-organizations"><div class="section-head"><div><h2>함께 운영하는 지역 조직</h2><p class="section-note">지역 공통서비스와 단체의 고유업무는 분리해 운영합니다.</p></div></div><div class="org"><div><strong>청계면상인회</strong><div class="muted">현재 청계 지역 공통서비스의 초기 운영기관입니다. 상인회 정회원·회비·내부문서 등 고유 데이터는 지역플랫폼과 분리됩니다.</div></div><a class="button" href="/cgma">상인회 바로가기</a></div></section>
  </main>`;
}

function adminBody(region){
  const rows=region.modules.map(module=>{
    const lead=region.operators[module.leadOperatorId];
    const co=module.operatorIds.filter(id=>id!==module.leadOperatorId).map(id=>region.operators[id]?.name||id);
    return `<tr><td><strong>${esc(module.label)}</strong><div class="muted">${esc(module.id)}</div></td><td>${esc(lead?.name||module.leadOperatorId)}</td><td>${esc(co.length?co.join(', '):'없음')}</td><td><span class="status">운영중</span></td></tr>`;
  }).join('');
  return `<main><section class="hero"><div class="eyebrow">REGIONAL GOVERNANCE</div><h1>${esc(region.brand)} 운영관리</h1><p class="lead">지역플랫폼의 소유권과 서비스 운영권을 분리합니다. 현재는 청계면상인회가 초기 운영을 맡고, 추후 서비스별로 주 운영단체·공동운영단체를 지정하거나 운영권을 이양할 수 있는 구조입니다.</p></section>
  <section class="section"><h2>서비스별 운영주체</h2><table><thead><tr><th>지역서비스</th><th>주 운영단체</th><th>공동운영</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table></section>
  <section class="section"><h2>권한 이양 원칙</h2><div class="policy">새 운영주체 등록 → 서비스별 공동운영 기간 → 책임권한 이양 → 기존 운영자 권한 축소의 순서로 처리합니다. 이양 시 지역 데이터는 이동·복사하지 않고 그대로 유지하며, 변경 전후 운영자와 감사이력을 보존합니다. 상인회 자체 데이터는 <strong>/cgma</strong> 소유로 남습니다.</div></section>
  <section class="section" data-region-capability="tenant.access.manage"><div class="org"><div><strong>사용자 · 관리자 · 외부업체 권한</strong><div class="muted">Google 이메일을 지역플랫폼 또는 청계패스 범위에 등록하고 역할·만료일·권한회수를 관리합니다.</div></div><a class="button" href="/cheonggye/admin/access">권한 관리</a></div></section>
  <section class="section"><div class="org"><div><strong>청계면상인회 자체 운영</strong><div class="muted">회원·회비·회의·상인회 사업·문서·회계 등 조직 고유업무는 지역플랫폼 운영권 이양과 무관하게 유지됩니다.</div></div><a class="button" href="/cgma/admin">상인회 관리자</a></div></section>
  <div class="auth-meta"><span class="auth-chip">로그인 <span data-region-auth-email></span></span><span class="auth-chip">권한 <span data-region-auth-role></span></span></div>
  </main>`;
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
  return new Response(document(region,`${region.brand} 운영관리`,adminBody(region),true),{status:200,headers:headers('local-region-admin')});
}

export function localRegionAccessAdminPage(region){
  const response=document(region,`${region.brand} 사용자·권한`,accessAdminBody(region),true).replace('</body>','<script src="/cheonggye/local-region-access-admin.js" defer></script></body>');
  return new Response(response,{status:200,headers:headers('local-region-access-admin')});
}
