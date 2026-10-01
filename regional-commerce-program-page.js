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
  @media(max-width:620px){.row{grid-template-columns:1fr;gap:3px}}
  </style>`;
}

function doc(region,program,title,body,surface){
  const admin=surface==='admin';const authAttrs=admin?' data-region-auth-pending="1"':'';const scripts=admin?'<script src="/cheonggye/local-region-admin-auth.js" defer></script>':'';
  const canonical=admin?'':`<link rel="canonical" href="https://ekodi.kr${esc(program.publicPath)}"><meta property="og:url" content="https://ekodi.kr${esc(program.publicPath)}">`;
  return `<!doctype html><html lang="ko" data-ekodi-site-subject="${esc(region.siteSubject)}" data-ekodi-local-region="${esc(region.id)}" data-ekodi-commerce-program="${esc(program.id)}" data-ekodi-region-surface="${surface}"${authAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="청계 지역의 쿠폰·포인트·상권 혜택을 연결하는 청계패스"><title>${esc(title)}</title>${canonical}${style()}<style>[data-region-auth-pending="1"] main{visibility:hidden}.auth-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.auth-chip{padding:6px 9px;border-radius:999px;background:#eef3f6;font-size:12px}.auth-chip span{font-weight:800}</style></head><body>${body}${scripts}</body></html>`;
}

export function regionalCommerceProgramPublicPage(region,program){
  const body=`<main><nav class="ecosystem" aria-label="청계 연결"><a href="/cgma">청계면상인회</a><a href="/cheonggye">청계잇다</a><a href="/cheonggyepass" aria-current="page">청계패스</a></nav><section class="hero"><div class="eyebrow">CHEONGGYE PASS · 지역 혜택</div><h1>${esc(program.publicName)}</h1><p class="lead">청계 지역의 참여점포와 쿠폰·할인·포인트 같은 상권 혜택을 한곳에서 확인하도록 준비하는 지역 서비스입니다.</p><div style="margin-top:14px"><span class="status">서비스 준비 중</span></div></section>
  <section class="panel"><h2>이용할 수 있는 기능</h2><div class="grid"><div class="item"><strong>참여점포</strong><span class="muted">청계패스에 참여하는 가게와 공개정보를 확인합니다.</span></div><div class="item"><strong>쿠폰·할인</strong><span class="muted">점포와 지역에서 제공하는 혜택을 모아봅니다.</span></div><div class="item"><strong>포인트·상품권</strong><span class="muted">사용 가능한 혜택이 준비되면 이용 방법을 안내합니다.</span></div><div class="item"><strong>이용 안내</strong><span class="muted">현재 사용할 수 있는 기능과 준비 상태를 쉽게 확인합니다.</span></div></div><a class="button" href="/cheonggye">청계잇다에서 지역정보 보기</a> <a class="button" href="/cgma">청계면상인회 보기</a></section></main>`;
  return new Response(doc(region,program,`${program.publicName} | ${region.brand}`,body,'public'),{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':'regional-commerce-program-public'}});
}

export function regionalCommerceProgramAdminPage(region,program){
  const body=`<main><nav class="ecosystem" aria-label="청계 연결"><a href="/cgma/admin">상인회 관리</a><a href="/cheonggye/admin">청계잇다 관리</a><a href="/cheonggyepass/admin" aria-current="page">청계패스 관리</a></nav><section class="hero"><div class="eyebrow">CHEONGGYE PASS · ADMIN</div><h1>${esc(program.publicName)} 운영관리</h1><p class="lead">현재 주 운영단체는 청계면상인회입니다. 외주개발사를 선정해도 지역플랫폼의 브랜드·운영권·가맹점 공개 연결은 유지되고, 공급자 어댑터만 교체할 수 있도록 구성합니다.</p></section>
  <section class="panel"><h2>현재 연동 상태</h2><div class="row"><strong>운영모드</strong><span>혼합형 (EKODI 지역관리 + 외부 엔진 연동 가능)</span></div><div class="row"><strong>외부 공급자</strong><span>미선정</span></div><div class="row"><strong>금융 실행</strong><span>공급자 계약·승인 전 비활성</span></div><div class="row"><strong>직접 DB 접근</strong><span>허용하지 않음</span></div><div class="row"><strong>자격증명</strong><span>서버측 보안 저장소에서만 관리</span></div></section>
  <section class="panel" data-region-capability="tenant.integration.inspect"><h2>외주사 연동 계약</h2><div class="grid"><div class="item"><strong>필수</strong><span class="muted">상태확인, 가맹점 동기화, 혜택 동기화, 거래·정산 요약조회, 서명 웹훅</span></div><div class="item"><strong>선택</strong><span class="muted">쿠폰발급, 포인트적립, 상품권발행, SSO</span></div><div class="item"><strong>교체</strong><span class="muted">외주사 변경 시 어댑터와 자격증명만 변경</span></div><div class="item"><strong>보존</strong><span class="muted">지역 운영권·감사이력·공개주소는 유지</span></div></div><a class="button" href="/cheonggye/admin">지역플랫폼 운영관리</a> <a class="button" href="/cheonggye/admin/access" data-region-capability="tenant.access.manage">외부업체·권한관리</a> <a class="button" href="/cheonggyepass">사용자 화면</a></section><section class="panel" data-region-capability="tenant.access.manage"><h2>외부업체 접근원칙</h2><div class="row"><strong>등록</strong><span>Google 이메일 기준으로 청계패스 범위에만 사전등록</span></div><div class="row"><strong>허용</strong><span>연동상태 확인·연동 테스트·로그 확인</span></div><div class="row"><strong>차단</strong><span>회원명부·재무·비밀키·권한관리·운영배포</span></div><div class="row"><strong>회수</strong><span>만료일 또는 관리자 즉시 회수</span></div></section><div class="auth-meta"><span class="auth-chip">로그인 <span data-region-auth-email></span></span><span class="auth-chip">권한 <span data-region-auth-role></span></span></div></main>`;
  return new Response(doc(region,program,`${program.publicName} 운영관리`,body,'admin'),{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':'regional-commerce-program-admin'}});
}
