// EKODIBIZ 매장 홈페이지 구독 서비스 — 요금 안내 + 신청서
// Canonical public page: https://ekodi.kr/ekodibiz/homepage (ekodibiz.kr/homepage 는 301 로 이 주소에 도착)
// Served by the Shared Site router ("/ekodibiz*" is already Worker-first).
// 신청서는 별도 저장소 없이 기존 공개 문의 API(/mail/api/contact)로 joseph@ekodi.kr 에 전달된다.
// (출처 검사·속도 제한·스팸 함정은 그 API 가 이미 강제한다.)
export const EKODIBIZ_HOMEPAGE_SERVICE_PATH = '/ekodibiz/homepage';
export const EKODIBIZ_HOMEPAGE_SERVICE_URL = 'https://ekodi.kr/ekodibiz/homepage';
export const EKODIBIZ_HOMEPAGE_SERVICE_VERSION = 'v0.1-2026-11-15';
export const EKODIBIZ_HOMEPAGE_CONTACT_SOURCE = 'ekodibiz-homepage-subscription';

const OPERATOR = Object.freeze({
  name: '에코디비즈', representative: '정찬균', businessRegistrationNumber: '213-13-01959',
  address: '전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층',
  email: 'joseph@ekodibiz.kr', phone: '010-3501-8542', manager: '정찬균',
});

export const HOMEPAGE_PLANS = Object.freeze([
  { id: 'S1', name: 'S1 스타터', setup: 0, monthly: 19000, scope: '원페이지(소개·영업시간·전화·지도·SNS 링크), 모바일 최적화, 보안(SSL)·호스팅, 방문통계, 월 1회 수정' },
  { id: 'S2', name: 'S2 베이직', setup: 99000, monthly: 39000, scope: '5~7페이지(메뉴/서비스·갤러리·소식·오시는 길), 네이버·구글 검색 등록, 기본 SEO/AEO, 문의폼, 월 3회 수정' },
  { id: 'S3', name: 'S3 그로스', setup: 199000, monthly: 79000, scope: 'S2 + 예약/견적 신청·휴대폰 알림, 리뷰 모음, 소식글 AI 초안 월 4건, 소셜 자동게시(승인 후), 월간 성과 리포트, 소규모 수정 무제한' },
  { id: 'S4', name: 'S4 프로', setup: 299000, monthly: 149000, scope: 'S3 + 온라인 주문·결제, 회원·포인트, POS·예약 시스템 연동, 다국어 1개, 전담 관리' },
]);

export const HOMEPAGE_ADDONS = Object.freeze([
  ['추가 페이지', '페이지당 월 3,000원 (또는 1회 30,000원)'],
  ['예약/견적 신청', '월 10,000원 (휴대폰 알림 포함)'],
  ['소셜 자동게시', '채널당 월 10,000원 (게시 전 승인)'],
  ['다국어', '언어당 월 10,000원'],
  ['온라인 결제', '월 20,000원 + 결제대행(PG) 수수료 실비'],
  ['추가 수정', '건당 10,000원 (1건 = 30분 이내 작업)'],
  ['로고·간판 디자인', '1회 100,000원~'],
  ['사진 촬영', '1회 100,000원~ (외부 촬영 시 실비)'],
  ['도메인', '실비 (고객 명의 등록)'],
  ['광고 운영 대행', '광고비의 15% (최소 월 50,000원, 광고비는 고객 직접 결제)'],
]);

export const HOMEPAGE_TYPES = Object.freeze([
  ['프랜차이즈형', '지점 전용 로컬 페이지 — 지점 소식·이벤트, 지도·주차, 배달앱/전화 주문, 리뷰, 지역 검색 노출', 'S2 + 소셜 1채널 · 월 49,000원', '본사 상표·디자인 사용 승인 후 착수'],
  ['독립브랜드형', '브랜드 스토리, 로고, 상품·서비스 소개, 소셜 연동, 소식글 AI 초안', 'S3 + 로고 1회 · 월 79,000원', '사진·이야기 자료 제공 필요'],
  ['음식업종형', '사진 메뉴판, 원산지 표시, 영업시간, 예약, 테이블 QR 메뉴, 배달앱 링크', 'S2 + 예약 · 월 49,000원 (주문·결제는 S4)', '메뉴 변경이 잦으면 S3 권장'],
  ['건축·인테리어형', '시공 사례(전·후 사진), 견적 신청·즉시 알림, 면허·등록 정보, 시공 지역, 후기', 'S3 · 월 79,000원', '사례 사진·고객 동의 필요'],
  ['서비스업형', '서비스·가격 안내, 예약, 전문가 소개, 공지 (미용·학원 등)', 'S2 + 예약 · 월 49,000원', '업종별 광고 규제 확인'],
  ['농수산 직판형', '상품·산지 이야기, 온라인 주문·결제, 택배 안내, 에코디몰 연계', 'S4 · 월 149,000원', '통신판매업 신고·결제 심사 필요'],
  ['교회·단체·비영리형', '소개·일정·소식·자료실, 후원 안내', 'S2 · 비영리 30% 할인 시 월 27,300원', '후원 결제는 별도 검토'],
]);

const won = (n) => (n === 0 ? '0원' : `${n.toLocaleString('ko-KR')}원`);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function isEkodiBizHomepageServicePath(pathname = '') {
  return /^\/ekodibiz\/(?:homepage|homepage-service|web-subscription)\/?$/i.test(String(pathname || ''));
}

export function ekodiBizHomepageServiceHtml() {
  const o = OPERATOR;
  const planRows = HOMEPAGE_PLANS.map((p) => `<tr><th scope="row">${esc(p.name)}</th><td data-label="기능·개발 범위">${esc(p.scope)}</td><td class="num" data-label="제작비">${won(p.setup)}</td><td class="num" data-label="월 구독료"><strong>${won(p.monthly)}</strong></td></tr>`).join('');
  const addonRows = HOMEPAGE_ADDONS.map(([a, b]) => `<tr><th scope="row">${esc(a)}</th><td data-label="요금">${esc(b)}</td></tr>`).join('');
  const typeRows = HOMEPAGE_TYPES.map(([a, b, c, d]) => `<tr><th scope="row">${esc(a)}</th><td data-label="추천 구성">${esc(b)}</td><td data-label="추천 요금"><strong>${esc(c)}</strong></td><td data-label="유의사항">${esc(d)}</td></tr>`).join('');
  const planOptions = HOMEPAGE_PLANS.map((p) => `<option value="${esc(p.name)}">${esc(p.name)} (월 ${won(p.monthly)})</option>`).join('');
  const typeOptions = HOMEPAGE_TYPES.map(([a]) => `<option>${esc(a)}</option>`).join('');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>매장 홈페이지 구독 서비스 요금 안내·신청 | 에코디비즈 EKODIBIZ</title>
  <meta name="description" content="제작비는 낮게, 월 구독으로 관리까지. 프랜차이즈·음식·건축·서비스업 매장 홈페이지 요금제와 업종별 추천 상품, 신청서.">
  <link rel="canonical" href="${EKODIBIZ_HOMEPAGE_SERVICE_URL}">
  <meta name="robots" content="index,follow">
  <style>
    :root{color-scheme:light dark;--bg:#f7f7f3;--card:#fff;--text:#17211c;--muted:#59635d;--line:#dfe4df;--accent:#1f6b4f;--soft:#eef5f0;--ok:#1f6b4f;--err:#a3302a}
    @media(prefers-color-scheme:dark){:root{--bg:#101512;--card:#18201b;--text:#edf4ef;--muted:#b0bbb4;--line:#344038;--accent:#8fd2ad;--soft:#202c25;--ok:#8fd2ad;--err:#ff9b93}}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;line-height:1.7}
    .topbar{position:sticky;top:0;z-index:5;min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px max(16px,calc((100vw - 1040px)/2));border-bottom:1px solid var(--line);background:var(--card)}
    .brand{font-weight:900;letter-spacing:.08em;color:var(--text);text-decoration:none}.topbar nav{display:flex;flex-wrap:wrap;gap:2px}
    .topbar nav a{display:inline-flex;min-height:44px;align-items:center;padding:8px 10px;border-radius:9px;font-size:13px;color:var(--text);text-decoration:none}
    .topbar nav a[aria-current="page"],.topbar nav a:hover{background:var(--soft);color:var(--accent)}
    main{flex:1;width:100%;max-width:1040px;margin:0 auto;padding:28px 16px 64px}
    section{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:clamp(18px,4vw,34px);margin-bottom:18px}
    h1{margin:0 0 .4rem;font-size:clamp(1.6rem,5vw,2.3rem);letter-spacing:-.03em}h2{margin:0 0 .7rem;font-size:1.2rem}
    p,li,td{color:var(--muted)}.lead{font-size:1.04rem}.badge{display:inline-block;padding:3px 10px;border-radius:999px;background:var(--soft);color:var(--accent);font-size:12px;font-weight:800}
    .cta{display:inline-flex;align-items:center;min-height:46px;padding:10px 20px;border-radius:999px;background:var(--accent);color:#fff;font-weight:800;text-decoration:none;margin-top:8px}
    @media(prefers-color-scheme:dark){.cta{color:#0d1a14}}
    .table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.93rem;min-width:620px}
    th,td{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top}thead th{background:var(--soft);color:var(--text)}tbody th{color:var(--text);white-space:nowrap}.num{text-align:right;white-space:nowrap}
    ul{padding-left:1.2rem}.note{font-size:.88rem}
    form{display:grid;gap:12px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}label{display:grid;gap:6px;font-size:13px;font-weight:700;color:var(--text)}
    input,select,textarea{width:100%;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit;background:var(--bg);color:var(--text)}textarea{min-height:110px}
    .trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.consent{display:flex;gap:8px;align-items:flex-start;font-weight:500;font-size:13px}.consent input{width:auto;min-height:auto;margin-top:5px}
    button{min-height:48px;border:0;border-radius:999px;background:var(--accent);color:#fff;font-weight:800;font-size:15px;cursor:pointer}button[disabled]{opacity:.6}
    @media(prefers-color-scheme:dark){button{color:#0d1a14}}
    .status{min-height:1.4em;font-weight:700}.status.ok{color:var(--ok)}.status.error{color:var(--err)}
    .done{display:none;padding:18px;border-radius:14px;background:var(--soft);border:1px solid var(--line)}.done strong{color:var(--text)}
    .footer{width:min(1040px,calc(100% - 32px));margin:0 auto 28px;padding:24px 0;border-top:1px solid var(--line);text-align:center;color:var(--muted);font-size:12px}
    .footer nav{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px}.footer a{display:inline-flex;min-height:44px;align-items:center;color:var(--accent)}
    :focus-visible{outline:2px solid var(--accent);outline-offset:3px}
    @media(max-width:640px){.row{grid-template-columns:1fr}.topbar{flex-wrap:wrap}table{min-width:0}thead{display:none}tr{display:block;border:1px solid var(--line);border-radius:12px;margin-bottom:10px;padding:4px 0}th,td{display:block;border:0;padding:6px 12px}tbody th{white-space:normal;background:var(--soft);border-radius:12px 12px 0 0;margin-top:-4px}td[data-label]::before{content:attr(data-label);display:block;font-size:11px;font-weight:800;color:var(--text)}.num{text-align:left}}
  </style>
</head>
<body>
<header class="topbar" data-site-shell="header" role="banner">
  <a class="brand" href="/ekodibiz" aria-label="에코디비즈 홈">EKODIBIZ</a>
  <nav aria-label="에코디비즈 주요 메뉴">
    <a href="/ekodibiz/#business">사업분야</a>
    <a href="/ekodibiz/homepage" aria-current="page">홈페이지 구독</a>
    <a href="#apply">신청하기</a>
    <a href="/ekodibiz/refund">환불정책</a>
  </nav>
</header>
<main data-ekodibiz-homepage-service="${EKODIBIZ_HOMEPAGE_SERVICE_VERSION}">
  <section>
    <span class="badge">매장 디지털 관리 구독</span>
    <h1>제작비는 낮게, 관리는 매달 맡기세요</h1>
    <p class="lead">에코디비즈가 매장 홈페이지를 만들고 호스팅·보안·검색 노출·수정·방문통계까지 매달 관리합니다. 대표 사례는 <a href="/bbqcg">BBQ 무안청계점</a>입니다.</p>
    <a class="cta" href="#apply">무료 상담 신청하기</a>
  </section>

  <section aria-labelledby="plans">
    <h2 id="plans">기본 요금제 <span class="note">(12개월 약정 · 부가세 별도)</span></h2>
    <div class="table-wrap"><table><thead><tr><th>요금제</th><th>기능·개발 범위</th><th>제작비</th><th>월 구독료</th></tr></thead><tbody>${planRows}
      <tr><th scope="row">맞춤 개발</th><td data-label="기능·개발 범위">요금제 밖 전용 기능(외부 시스템 연동 등)</td><td class="num" data-label="제작비">견적</td><td class="num" data-label="월 구독료">기능별 유지비</td></tr></tbody></table></div>
    <p class="note">약정 없이 월 단위 이용 시 월 구독료 +30%. 연납 시 2개월 무료.</p>
  </section>

  <section aria-labelledby="types">
    <h2 id="types">업종·유형별 추천 상품</h2>
    <div class="table-wrap"><table><thead><tr><th>유형</th><th>추천 구성</th><th>추천 요금</th><th>유의사항</th></tr></thead><tbody>${typeRows}</tbody></table></div>
  </section>

  <section aria-labelledby="addons">
    <h2 id="addons">추가 옵션</h2>
    <div class="table-wrap"><table><thead><tr><th>옵션</th><th>요금</th></tr></thead><tbody>${addonRows}</tbody></table></div>
  </section>

  <section aria-labelledby="discount">
    <h2 id="discount">할인 · 서비스 기준</h2>
    <ul>
      <li>청계면상인회 회원 월 구독료 20% 할인, 비영리·종교단체 30% 할인 (중복 시 큰 할인 1개만 적용)</li>
      <li>첫 고객 5개 매장 제작비 면제 (대표 사례 공개 동의 시)</li>
      <li>약정 12개월 후 1개월 단위 자동 연장. 약정 중 해지 시 남은 기간 월 구독료의 30% 위약금</li>
      <li>도메인·글·사진은 고객 소유. 해지 시 도메인 이전과 자료 백업 파일을 무료로 제공 (해지 후 30일 이내 요청)</li>
      <li>제작 착수 전 전액 환불, 착수 후 제작비 환불 불가. 월 구독료는 해지 다음 달부터 중지</li>
      <li>수정 1건 = 30분 이내의 글·사진·가격 교체. 평일 1영업일 이내 응답, 2영업일 이내 반영</li>
      <li>요금 변경은 30일 전 공지하며 약정 기간 중에는 기존 요금 유지. 자세한 기준은 <a href="/ekodibiz/refund">환불정책</a>을 따릅니다.</li>
    </ul>
  </section>

  <section id="apply" aria-labelledby="applyTitle">
    <h2 id="applyTitle">상담·신청서</h2>
    <p>신청서를 보내 주시면 담당자가 1영업일 이내 연락드립니다. 결제는 상담 후 계약 시점에 진행되며, 이 신청만으로 요금이 청구되지 않습니다.</p>
    <form id="hpForm" novalidate>
      <div class="row">
        <label>상호(매장명) * <input id="business" maxlength="80" required autocomplete="organization"></label>
        <label>담당자 이름 * <input id="name" maxlength="40" required autocomplete="name"></label>
      </div>
      <div class="row">
        <label>연락처(휴대폰) * <input id="phone" maxlength="20" required inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></label>
        <label>이메일 * <input id="email" type="email" maxlength="254" required autocomplete="email"></label>
      </div>
      <div class="row">
        <label>업종·유형 <select id="type"><option value="">선택해 주세요</option>${typeOptions}<option>기타</option></select></label>
        <label>희망 요금제 <select id="plan"><option value="">상담 후 결정</option>${planOptions}<option>맞춤 개발</option></select></label>
      </div>
      <div class="row">
        <label>현재 홈페이지·SNS 주소 <input id="current" maxlength="300" placeholder="없으면 비워 두세요"></label>
        <label>청계면상인회 회원 여부 <select id="member"><option>아니오</option><option>예</option><option>가입 희망</option></select></label>
      </div>
      <label>원하는 기능·요청사항 <textarea id="message" maxlength="3000" placeholder="예: 메뉴판, 예약, 네이버 검색 노출, 인스타 연동"></textarea></label>
      <label class="trap" aria-hidden="true">Website <input id="website" tabindex="-1" autocomplete="off"></label>
      <label class="consent"><input id="consent" type="checkbox" required> 상담을 위해 상호·이름·연락처·이메일을 수집하고 상담 완료 후 1년간 보관하는 데 동의합니다. (<a href="/privacy">개인정보처리방침</a>)</label>
      <button id="send" type="submit">신청서 보내기</button>
      <div id="status" class="status" role="status" aria-live="polite"></div>
    </form>
    <div id="done" class="done" role="status"><strong>신청이 정상 접수되었습니다.</strong><p>담당자가 1영업일 이내 연락드리겠습니다. 기타 문의: 담당자 ${o.manager} · ${o.phone} · <a href="mailto:${o.email}">${o.email}</a></p></div>
    <p class="note">기타 문의: 담당자 ${o.manager} · <a href="tel:${o.phone.replace(/-/g, '')}">${o.phone}</a> · <a href="mailto:${o.email}">${o.email}</a></p>
  </section>
</main>
<footer class="footer" data-site-shell="footer" aria-label="에코디비즈 사업자 정보 및 정책">
  <p><strong>EKODIBIZ</strong> · ${o.name} · 대표 ${o.representative} · 사업자등록번호 ${o.businessRegistrationNumber}<br>${o.address} · <a href="mailto:${o.email}">${o.email}</a></p>
  <nav aria-label="에코디비즈 푸터 메뉴"><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a><a href="/ekodibiz/refund">환불정책</a><a href="/">EKODI</a></nav>
</footer>
<script>(function(){
  var f=document.getElementById('hpForm'),s=document.getElementById('status'),b=document.getElementById('send'),d=document.getElementById('done');
  function v(id){return (document.getElementById(id).value||'').trim();}
  f.addEventListener('submit',async function(e){e.preventDefault();s.className='status';
    if(!v('business')||!v('name')||!v('phone')||!v('email')){s.className='status error';s.textContent='* 표시 항목을 모두 입력해 주세요.';return;}
    if(!/^[0-9+\\-\\s()]{8,20}$/.test(v('phone'))){s.className='status error';s.textContent='연락처를 확인해 주세요.';return;}
    if(!document.getElementById('consent').checked){s.className='status error';s.textContent='개인정보 수집·이용에 동의해 주세요.';return;}
    b.disabled=true;s.textContent='신청서를 보내고 있습니다.';
    var msg=['[매장 홈페이지 구독 신청]','상호: '+v('business'),'담당자: '+v('name'),'연락처: '+v('phone'),'이메일: '+v('email'),'업종·유형: '+(v('type')||'-'),'희망 요금제: '+(v('plan')||'상담 후 결정'),'현재 홈페이지·SNS: '+(v('current')||'-'),'상인회 회원: '+v('member'),'개인정보 동의: 예','','요청사항:',v('message')||'-'].join('\\n');
    try{var r=await fetch('/mail/api/contact',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({name:v('name'),email:v('email'),subject:'홈페이지 구독 신청 · '+v('business'),message:msg,website:v('website'),site:'ekodibiz',source:'${EKODIBIZ_HOMEPAGE_CONTACT_SOURCE}',sourceUrl:location.href})});
      var data=await r.json().catch(function(){return{};});if(!r.ok)throw new Error(data.error||'신청서 전송에 실패했습니다.');
      f.style.display='none';d.style.display='block';d.scrollIntoView({behavior:'smooth',block:'center'});
    }catch(err){s.className='status error';s.textContent=(err&&err.message||'신청서 전송에 실패했습니다.')+' 계속 안 되면 ${o.phone} 로 연락 주세요.';b.disabled=false;}
  });
})();</script>
</body>
</html>`;
}

export function ekodiBizHomepageServiceResponse({ head = false } = {}) {
  return new Response(head ? null : ekodiBizHomepageServiceHtml(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
      'x-ekodi-route': 'ekodibiz-homepage-service',
    },
  });
}
