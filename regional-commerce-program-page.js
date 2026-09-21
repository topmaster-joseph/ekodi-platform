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
  a.button{display:inline-flex;margin-top:16px;padding:10px 14px;border-radius:12px;background:#172c3e;color:#fff;text-decoration:none;font-weight:750}
  @media(max-width:620px){.row{grid-template-columns:1fr;gap:3px}}
  </style>`;
}

function doc(region,program,title,body,surface){
  const admin=surface==='admin';const authAttrs=admin?' data-region-auth-pending="1"':'';const scripts=admin?'<script src="/cheonggye/local-region-admin-auth.js" defer></script>':'';
  return `<!doctype html><html lang="ko" data-ekodi-site-subject="${esc(region.siteSubject)}" data-ekodi-local-region="${esc(region.id)}" data-ekodi-commerce-program="${esc(program.id)}" data-ekodi-region-surface="${surface}"${authAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${style()}<style>[data-region-auth-pending="1"] main{visibility:hidden}.auth-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.auth-chip{padding:6px 9px;border-radius:999px;background:#eef3f6;font-size:12px}.auth-chip span{font-weight:800}</style></head><body>${body}${scripts}</body></html>`;
}

export function regionalCommerceProgramPublicPage(region,program){
  const body=`<main><section class="hero"><div class="eyebrow">LOCAL COMMERCE PASS</div><h1>${esc(program.publicName)}</h1><p class="lead">청계 지역 상권에서 사용할 수 있는 지역 혜택 서비스입니다. 쿠폰·포인트·상품권형 기능을 하나의 지역 서비스로 연결하고, 실제 발행·거래·정산 엔진은 승인된 외부 사업자 또는 EKODI 호환 엔진과 표준 어댑터로 연동할 수 있습니다.</p><div style="margin-top:14px"><span class="status">외부 연동 준비 · 공급자 미선정</span></div></section>
  <section class="panel"><h2>서비스 구성</h2><div class="grid"><div class="item"><strong>가맹점</strong><span class="muted">참여점포 등록·상태·공개정보</span></div><div class="item"><strong>혜택</strong><span class="muted">쿠폰·할인·포인트 정책</span></div><div class="item"><strong>상품권</strong><span class="muted">외부 발행·결제·정산 엔진 연동</span></div><div class="item"><strong>이용현황</strong><span class="muted">지역 단위 요약 성과와 운영지표</span></div></div><a class="button" href="/cheonggye">청계잇다 홈</a></section></main>`;
  return new Response(doc(region,program,`${program.publicName} | ${region.brand}`,body,'public'),{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':'regional-commerce-program-public'}});
}

export function regionalCommerceProgramAdminPage(region,program){
  const body=`<main><section class="hero"><div class="eyebrow">COMMERCE PROGRAM ADMIN</div><h1>${esc(program.publicName)} 운영관리</h1><p class="lead">현재 주 운영단체는 청계면상인회입니다. 외주개발사를 선정해도 지역플랫폼의 브랜드·운영권·가맹점 공개 연결은 유지되고, 공급자 어댑터만 교체할 수 있도록 구성합니다.</p></section>
  <section class="panel"><h2>현재 연동 상태</h2><div class="row"><strong>운영모드</strong><span>혼합형 (EKODI 지역관리 + 외부 엔진 연동 가능)</span></div><div class="row"><strong>외부 공급자</strong><span>미선정</span></div><div class="row"><strong>금융 실행</strong><span>공급자 계약·승인 전 비활성</span></div><div class="row"><strong>직접 DB 접근</strong><span>허용하지 않음</span></div><div class="row"><strong>자격증명</strong><span>서버측 보안 저장소에서만 관리</span></div></section>
  <section class="panel" data-region-capability="tenant.integration.inspect"><h2>외주사 연동 계약</h2><div class="grid"><div class="item"><strong>필수</strong><span class="muted">상태확인, 가맹점 동기화, 혜택 동기화, 거래·정산 요약조회, 서명 웹훅</span></div><div class="item"><strong>선택</strong><span class="muted">쿠폰발급, 포인트적립, 상품권발행, SSO</span></div><div class="item"><strong>교체</strong><span class="muted">외주사 변경 시 어댑터와 자격증명만 변경</span></div><div class="item"><strong>보존</strong><span class="muted">지역 운영권·감사이력·공개주소는 유지</span></div></div><a class="button" href="/cheonggye/admin">지역플랫폼 운영관리</a></section><div class="auth-meta"><span class="auth-chip">로그인 <span data-region-auth-email></span></span><span class="auth-chip">권한 <span data-region-auth-role></span></span></div></main>`;
  return new Response(doc(region,program,`${program.publicName} 운영관리`,body,'admin'),{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':'regional-commerce-program-admin'}});
}
