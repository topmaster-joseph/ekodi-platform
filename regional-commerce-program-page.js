import { renderRegionTabsScript } from './region-tabs-ui.js';
import { renderEkodiUserFooter } from './config/user-footer.js';

function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

function style(){
  return `<style>
  :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17212b;background:#f5f7f9}
  *{box-sizing:border-box}body{margin:0}main{width:min(1040px,calc(100% - 28px));margin:0 auto;padding:28px 0 60px}
  .hero,.panel{background:#fff;border:1px solid #dce3e8;border-radius:22px}.hero{padding:28px}.panel{padding:20px;margin-top:16px}
  .eyebrow{font-size:12px;font-weight:800;letter-spacing:.08em;color:#526b7d}h1{margin:8px 0 10px;font-size:clamp(30px,6vw,48px)}
  h2{font-size:19px;margin:0 0 12px}.lead,.muted{color:#5e6d79;line-height:1.65;word-break:keep-all}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:15px}
  .item{padding:15px;border-radius:14px;background:#f7f9fa;border:1px solid #e4e9ed}.item strong{display:block;margin-bottom:5px}
  .status{display:inline-flex;padding:6px 10px;border-radius:999px;background:#eef3f6;font-size:12px;font-weight:800}
  .row{display:grid;grid-template-columns:180px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #edf0f2}.row:last-child{border-bottom:0}
  a.button{display:inline-flex;margin-top:16px;padding:10px 14px;border-radius:12px;background:#172c3e;color:#fff;text-decoration:none;font-weight:750}.ecosystem{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.ecosystem a{display:inline-flex;align-items:center;min-height:38px;padding:0 11px;border:1px solid #dce3e8;border-radius:999px;background:#fff;color:#334a5d;text-decoration:none;font-size:13px;font-weight:800}.ecosystem a[aria-current="page"]{background:#172c3e;color:#fff;border-color:#172c3e}
  .pass-handoff [hidden],[data-pass-vendor-intake][hidden]{display:none!important}
  .pass-handoff{display:grid;gap:12px}.pass-handoff-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pass-handoff label{display:grid;gap:5px;font-size:13px;font-weight:750}.pass-handoff input,.pass-handoff select,.pass-review input,.pass-review select{width:100%;min-height:42px;border:1px solid #cdd9e1;border-radius:10px;padding:8px 10px;background:#fff;color:#17212b;font:inherit}.pass-handoff button,.pass-review button{min-height:42px;border:0;border-radius:10px;padding:8px 16px;background:#173f32;color:#fff;font:inherit;font-weight:800;cursor:pointer}.pass-handoff button:disabled,.pass-review button:disabled{opacity:.6;cursor:wait}.pass-handoff .wide{grid-column:1/-1}.pass-submission{border:1px solid #dce3e8;border-radius:13px;padding:13px;margin-top:8px;display:grid;gap:5px}.pass-submission a{color:#174837;font-size:14px}.pass-review{display:grid;grid-template-columns:140px minmax(0,1fr) auto;gap:8px}.pass-intake-note{font-size:13px;line-height:1.6;color:#526b7d}@media(max-width:620px){.pass-handoff-grid,.pass-review{grid-template-columns:1fr}}
  @media(max-width:620px){.row{grid-template-columns:1fr;gap:3px}}

  /* Public pass: condensed status-led information, no active financial affordances. */
  .pass-site-header{background:#fffdf8;border-bottom:1px solid #d9e3dc}
  .pass-site-header__inner{max-width:1120px;width:calc(100% - 28px);margin:auto;min-height:60px;display:flex;align-items:center;justify-content:space-between;gap:12px}
  .pass-site-header__brand{text-decoration:none;font-size:18px;font-weight:900;letter-spacing:-.03em;color:#173f32}
  .pass-site-header__links{display:flex;gap:6px;flex-wrap:wrap}
  .pass-site-header__links a{min-height:40px;display:inline-flex;align-items:center;padding:5px 11px;text-decoration:none;font-size:13px;font-weight:800;color:#315548;border-radius:9px}
  .pass-site-header__links a:hover,.pass-site-header__links a:focus-visible{background:#e5f0e8}
  .pass-public{padding-top:16px}
  .pass-public .ecosystem{margin-bottom:10px}
  .pass-public .hero{padding:18px 22px;border-radius:18px;background:linear-gradient(110deg,#edf6f0,#fffaf0);border-color:#d1e1d6}
  .pass-public .hero h1{margin:2px 0 6px;font-size:clamp(28px,4vw,38px);line-height:1.25;color:#173f32}
  .pass-public .hero .lead{margin:0;font-size:14px;line-height:1.6}
  .pass-public .hero .eyebrow{color:#315e4f}
  .pass-public .hero .status{margin-top:9px;background:#e0ece5;color:#214d3a}
  .pass-public .panel{margin-top:12px;padding:15px;border-radius:15px}
  .pass-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}
  .pass-tab{min-width:0;min-height:46px;padding:9px 10px;border:1px solid #cfddd3;border-radius:12px;background:#fff;color:#315548;font:inherit;font-size:14px;font-weight:800;cursor:pointer;word-break:keep-all}
  .pass-tab[aria-selected="true"]{background:#173f32;border-color:#173f32;color:#fff}
  .pass-tab:focus-visible{outline:3px solid #7aac93;outline-offset:2px}
  .pass-panel[hidden]{display:none!important}
  .pass-panel{padding:16px 4px 4px;min-height:110px}
  .pass-panel h2{font-size:17px;margin:0 0 6px}
  .pass-panel p{margin:0;font-size:14px;line-height:1.65;color:#4b6257}
  .pass-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .pass-links a{min-height:40px;display:inline-flex;align-items:center;padding:8px 12px;border:1px solid #d5e0d9;border-radius:10px;background:#f6faf7;color:#174837;text-decoration:none;font-size:13px;font-weight:800}
  .pass-public{word-break:keep-all;overflow-wrap:break-word}
  @media(max-width:620px){.pass-public .hero{padding:16px}.pass-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.pass-public .panel{padding:10px}.pass-tab{min-height:44px;font-size:13px}.pass-panel{padding:14px 5px 5px}}
  </style>`;
}

function doc(region,program,title,body,surface){
  const admin=surface==='admin';const authAttrs=admin?' data-region-auth-pending="1"':'';const scripts=admin?'<script src="/cheonggye/local-region-admin-auth.js" defer></script><script src="/cheonggye/cheonggyepass-vendor-intake-ui.js" defer></script>':'';
  const canonical=admin?'':`<link rel="canonical" href="https://ekodi.kr${esc(program.publicPath)}"><meta property="og:url" content="https://ekodi.kr${esc(program.publicPath)}">`;
  const robots=admin?'<meta name="robots" content="noindex,nofollow,noarchive">':'';
  return `<!doctype html><html lang="ko" data-ekodi-site-subject="${esc(region.siteSubject)}" data-ekodi-local-region="${esc(region.id)}" data-ekodi-commerce-program="${esc(program.id)}" data-ekodi-region-surface="${surface}"${authAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="청계 지역의 쿠폰·포인트·상권 혜택을 연결하는 청계패스"><title>${esc(title)}</title>${canonical}${robots}${style()}<style>[data-region-auth-pending="1"] main{visibility:hidden}.auth-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.auth-chip{padding:6px 9px;border-radius:999px;background:#eef3f6;font-size:12px}.auth-chip span{font-weight:800}</style></head><body>${body}${scripts}</body></html>`;
}


export function regionalCommerceProgramPublicPage(region,program){
  const tabs=[
    {id:'stores',label:'참여점포',desc:'참여점포 정보는 확인·등록되는 대로 공개합니다. 현재는 지역 상점 정보를 먼저 확인할 수 있습니다.',links:[['청계 상점 정보','/cheonggye/commerce']]},
    {id:'offers',label:'쿠폰·할인',desc:'청계패스의 쿠폰과 할인 혜택은 서비스 준비 중입니다. 실제 제공이 확인된 혜택만 공개하겠습니다.',links:[['지역 상권 보기','/cheonggye/commerce']]},
    {id:'points',label:'포인트',desc:'포인트 적립·사용은 아직 준비 중입니다. 적립률·사용처와 사용 조건이 확인된 후 안내합니다.',links:[]},
    {id:'vouchers',label:'상품권',desc:'지역상품권의 발행·결제·정산 기능은 준비 중입니다. 공급자 계약과 운영 승인이 완료되기 전에는 사용할 수 없습니다.',links:[]},
    {id:'guide',label:'이용 안내',desc:'청계패스는 현재 안내 단계입니다. 지역의 공개정보는 청계잇다에서, 상인회 소식은 청계면상인회에서 확인하세요.',links:[['청계잇다','/cheonggye'],['청계면상인회','/cgma']]},
  ];
  const body=`<header class="pass-site-header"><div class="pass-site-header__inner"><a class="pass-site-header__brand" href="/cgpass" aria-current="page">청계패스</a><nav class="pass-site-header__links" aria-label="청계 연결"><a href="/cheonggye">청계잇다</a><a href="/cgma">청계면상인회</a></nav></div></header><main class="pass-public">
  <section class="hero"><div class="eyebrow">CHEONGGYE PASS · 지역 혜택</div><h1>${esc(program.publicName)}</h1><p class="lead">지역 참여점포와 혜택을 한곳에서 찾기 위한 청계패스입니다. 분야를 선택해 공개 정보와 준비 상태를 확인하세요.</p><span class="status">서비스 준비 중</span></section>
  <section class="panel" aria-label="청계패스 정보"><div class="pass-tabs" role="tablist" aria-label="청계패스 기능 안내" data-region-tablist>
    ${tabs.map((tab,index)=>`<button class="pass-tab" type="button" role="tab" id="pass-tab-${tab.id}" aria-controls="pass-panel-${tab.id}" aria-selected="${index===0?'true':'false'}" tabindex="${index===0?'0':'-1'}">${esc(tab.label)}</button>`).join('')}
  </div>
  ${tabs.map((tab,index)=>`<section class="pass-panel" role="tabpanel" id="pass-panel-${tab.id}" aria-labelledby="pass-tab-${tab.id}"${index?' hidden':''}><h2>${esc(tab.label)}</h2><p>${esc(tab.desc)}</p>${tab.links.length?`<div class="pass-links">${tab.links.map(([label,url])=>`<a href="${esc(url)}">${esc(label)}</a>`).join('')}</div>`:''}</section>`).join('')}
  </section></main>${renderEkodiUserFooter()}${renderRegionTabsScript()}`;
  return new Response(doc(region,program,`${program.publicName} | ${region.brand}`,body,'public'),{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':'regional-commerce-program-public','x-ekodi-user-chrome':'v1'}});
}

export function regionalCommerceProgramAdminPage(region,program){
  const body=`<main><nav class="ecosystem" aria-label="청계 연결"><a href="/cgma/admin">상인회 관리</a><a href="/cheonggye/admin">청계잇다 관리</a><a href="/cgpass/admin" aria-current="page">청계패스 관리</a></nav><section class="hero"><div class="eyebrow">CHEONGGYE PASS · ADMIN</div><h1>${esc(program.publicName)} 운영관리</h1><p class="lead">현재 주 운영단체는 청계면상인회입니다. 외주개발사를 선정해도 지역플랫폼의 브랜드·운영권·가맹점 공개 연결은 유지되고, 공급자 어댑터만 교체할 수 있도록 구성합니다.</p></section>
  <section class="panel"><h2>현재 연동 상태</h2><div class="row"><strong>운영모드</strong><span>혼합형 (EKODI 지역관리 + 외부 엔진 연동 가능)</span></div><div class="row"><strong>외부 공급자</strong><span>미선정</span></div><div class="row"><strong>금융 실행</strong><span>공급자 계약·승인 전 비활성</span></div><div class="row"><strong>직접 DB 접근</strong><span>허용하지 않음</span></div><div class="row"><strong>자격증명</strong><span>서버측 보안 저장소에서만 관리</span></div></section>
  <section class="panel" data-region-capability="tenant.integration.inspect"><h2>외주사 연동 계약</h2><div class="grid"><div class="item"><strong>필수</strong><span class="muted">상태확인, 가맹점 동기화, 혜택 동기화, 거래·정산 요약조회, 서명 웹훅</span></div><div class="item"><strong>선택</strong><span class="muted">쿠폰발급, 포인트적립, 상품권발행, SSO</span></div><div class="item"><strong>교체</strong><span class="muted">외주사 변경 시 어댑터와 자격증명만 변경</span></div><div class="item"><strong>보존</strong><span class="muted">지역 운영권·감사이력·공개주소는 유지</span></div></div><a class="button" href="/cheonggye/admin">지역플랫폼 운영관리</a> <a class="button" href="/cheonggye/admin/access" data-region-capability="tenant.access.manage">외부업체·권한관리</a> <a class="button" href="/cgpass">사용자 화면</a></section><section class="panel" data-region-capability="tenant.access.manage"><h2>외부업체 접근원칙</h2><div class="row"><strong>등록</strong><span>Google 이메일 기준으로 청계패스 범위에만 사전등록</span></div><div class="row"><strong>허용</strong><span>연동상태 확인·연동 테스트·로그 확인</span></div><div class="row"><strong>차단</strong><span>회원명부·재무·비밀키·권한관리·운영배포</span></div><div class="row"><strong>회수</strong><span>만료일 또는 관리자 즉시 회수</span></div></section><section class="panel" data-pass-vendor-intake hidden><h2>외부업체 소스·API 통합 접수</h2><p class="muted">GitHub PR, ZIP 파일, 외부 API 명세를 같은 절차로 접수합니다. ZIP은 격리 저장소에만 보관하고 외부 코드 자동 실행·운영 반영은 금지합니다.</p><form class="pass-handoff" data-pass-intake-form><div class="pass-handoff-grid"><label>납품 방식<select name="delivery"><option value="github_pr">GitHub PR (소스 납품)</option><option value="zip">ZIP 파일 격리 접수</option><option value="external_api">외부 서버 API 연동</option></select></label><label>외부업체명<input name="vendorName" maxlength="100" autocomplete="organization" required placeholder="업체 또는 개발팀 이름"></label></div><div class="pass-handoff-grid" data-pass-github><label class="wide">GitHub PR 주소<input name="sourceUrl" placeholder="https://github.com/owner/repo/pull/123" maxlength="500"></label><label class="wide">검증할 정확한 커밋 SHA (선택)<input name="sourceRef" maxlength="40" placeholder="40자리 Git 커밋 SHA"></label></div><div data-pass-zip-field hidden><label>소스 ZIP 파일 (최대 8MB)<input data-pass-zip type="file" accept=".zip,application/zip"></label><p class="pass-intake-note" data-pass-upload-availability>격리 저장소 연결 상태를 확인하고 있습니다.</p></div><div class="pass-handoff-grid" data-pass-api hidden><label class="wide">외부 API 기본 주소 (HTTPS)<input name="apiBaseUrl" type="url" maxlength="500" placeholder="https://api.vendor.example/v1"></label><label class="wide">공개 API 명세 주소 (HTTPS)<input name="documentationUrl" type="url" maxlength="500" placeholder="https://docs.vendor.example/openapi"></label><label class="wide">지원 기능 (쉼표 구분, health는 필수)<input name="capabilities" placeholder="merchant-status,coupon,points" maxlength="240"></label></div><div><button type="submit">검증 대기 접수</button></div></form><p class="pass-intake-note" data-pass-intake-status role="status" aria-live="polite">로그인 권한을 확인하고 있습니다.</p><h2>접수·검토 현황</h2><div data-pass-intake-list><p class="muted">접수 정보를 확인하고 있습니다.</p></div><p class="pass-intake-note">접수·검토는 배포 승인이 아닙니다. 정적 분석, 악성코드 검사, 격리 스테이징, 필수 CI 및 EKODI Human Gate를 통과한 뒤에만 운영 반영합니다. 회원정보·정산정보·비밀키는 업체에 공개하지 않습니다.</p></section><div class="auth-meta"><span class="auth-chip">로그인 <span data-region-auth-email></span></span><span class="auth-chip">권한 <span data-region-auth-role></span></span></div></main>`;
  return new Response(doc(region,program,`${program.publicName} 운영관리`,body,'admin'),{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':'regional-commerce-program-admin','x-robots-tag':'noindex, nofollow, noarchive'}});
}
