// EKODIBIZ 매장 홈페이지 구독 서비스 — 요금 안내 + 유형별 기능 탭 + 예상 구독료 계산 신청서
// Canonical public page: https://ekodi.kr/ekodibiz/homepage (ekodibiz.kr/homepage 는 301 로 이 주소에 도착)
// 신청서는 별도 저장소 없이 기존 공개 문의 API(/mail/api/contact)로 joseph@ekodi.kr 에 전달된다.
// 예상 구독료 계산은 estimateHomepageSubscription() 하나만 정본으로 쓰고, 같은 함수 원문을 브라우저에 그대로 싣는다.
export const EKODIBIZ_HOMEPAGE_SERVICE_PATH = '/ekodibiz/homepage';
export const EKODIBIZ_HOMEPAGE_SERVICE_URL = 'https://ekodi.kr/ekodibiz/homepage';
export const EKODIBIZ_HOMEPAGE_SERVICE_VERSION = 'v0.2-2026-11-18';
export const EKODIBIZ_HOMEPAGE_CONTACT_SOURCE = 'ekodibiz-homepage-subscription';

const OPERATOR = Object.freeze({
  name: '에코디비즈', representative: '정찬균', businessRegistrationNumber: '213-13-01959',
  address: '전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층',
  email: 'joseph@ekodibiz.kr', phone: '010-3501-8542', manager: '정찬균',
});

// 요금 정본 (부가세 별도, 원)
export const HOMEPAGE_PRICING = Object.freeze({
  plans: {
    S1: { id: 'S1', name: 'S1 스타터', setup: 0, monthly: 9900, includes: { booking: false, social: 0, lang: 0, payment: false },
      scope: '원페이지(소개·영업시간·전화·지도·SNS 링크), 모바일 최적화, 보안(SSL)·호스팅, 방문통계, 월 1회 수정' },
    S2: { id: 'S2', name: 'S2 베이직', setup: 49000, monthly: 19900, includes: { booking: false, social: 0, lang: 0, payment: false },
      scope: '5~7페이지(메뉴/서비스·갤러리·소식·오시는 길), 네이버·구글 검색 등록, 기본 SEO/AEO, 문의폼, 월 3회 수정' },
    S3: { id: 'S3', name: 'S3 그로스', setup: 99000, monthly: 39900, includes: { booking: true, social: 1, lang: 0, payment: false },
      scope: 'S2 + 예약/견적 신청·휴대폰 알림, 리뷰 모음, 소식글 AI 초안 월 4건, 소셜 자동게시 1채널, 월간 성과 리포트, 소규모 수정 무제한' },
    S4: { id: 'S4', name: 'S4 프로', setup: 149000, monthly: 79000, includes: { booking: true, social: 1, lang: 1, payment: true },
      scope: 'S3 + 온라인 주문·결제, 회원·포인트, POS·예약 시스템 연동, 다국어 1개, 전담 관리' },
  },
  addons: { page: 2000, booking: 5000, social: 5000, lang: 5000, payment: 10000 },
  oneTime: { logo: 50000, photo: 50000 },
  discounts: { member: 0.2, nonprofit: 0.3 },
  contract: { '12': 1, monthly: 1.3, annual: 10 / 12 },
});

/**
 * 월 예상 구독료 계산 (정본). 브라우저에도 이 함수 원문이 그대로 실린다 — 바깥 변수를 참조하지 말 것.
 * sel: { plan, pages, booking, social, lang, payment, logo, photo, member, nonprofit, contract }
 */
export function estimateHomepageSubscription(pricing, sel) {
  var P = pricing, s = sel || {};
  var plan = P.plans[s.plan] || P.plans.S2;
  var inc = plan.includes, a = P.addons;
  var n = function (v) { v = Math.floor(Number(v) || 0); return v < 0 ? 0 : (v > 50 ? 50 : v); };
  var lines = [{ label: plan.name, amount: plan.monthly }];
  var pages = n(s.pages); if (pages) lines.push({ label: '추가 페이지 ' + pages + '개', amount: pages * a.page });
  if (s.booking && !inc.booking) lines.push({ label: '예약/견적 신청', amount: a.booking });
  var social = Math.max(0, n(s.social) - inc.social); if (social) lines.push({ label: '소셜 자동게시 ' + social + '채널', amount: social * a.social });
  var lang = Math.max(0, n(s.lang) - inc.lang); if (lang) lines.push({ label: '다국어 ' + lang + '개', amount: lang * a.lang });
  if (s.payment && !inc.payment) lines.push({ label: '온라인 결제', amount: a.payment });
  var subtotal = 0; for (var i = 0; i < lines.length; i++) subtotal += lines[i].amount;
  var discountRate = Math.max(s.member ? P.discounts.member : 0, s.nonprofit ? P.discounts.nonprofit : 0);
  var contract = Object.prototype.hasOwnProperty.call(P.contract, s.contract) ? s.contract : '12';
  var r100 = function (v) { return Math.round(v / 100) * 100; };
  var monthly = r100(subtotal * (1 - discountRate) * P.contract[contract]);
  var setup = plan.setup + (s.logo ? P.oneTime.logo : 0) + (s.photo ? P.oneTime.photo : 0);
  var yearly = contract === 'annual' ? r100(subtotal * (1 - discountRate) * 10) : monthly * 12;
  var firstPayment = setup + (contract === 'annual' ? yearly : monthly);
  return { plan: plan.id, lines: lines, subtotal: subtotal, discountRate: discountRate, contract: contract, monthly: monthly, setup: setup, yearly: yearly, firstPayment: firstPayment };
}

// 유형별 안내 (탭) — preset 은 계산기 기본 선택값
export const HOMEPAGE_TYPES = Object.freeze([
  { id: 'franchise', name: '프랜차이즈형', summary: '본사 사이트가 못 하는 "우리 동네 지점" 검색 노출에 집중합니다.',
    features: ['지점 전용 소개(주소·영업시간·주차)', '지점 소식·이벤트 게시', '배달앱·전화 주문 바로가기', '네이버·구글 리뷰 모음', '지역 검색 최적화(지도·플레이스 연동)', '인스타그램 등 소셜 1채널 자동게시'],
    caution: '본사 상표·디자인 사용 승인 후 착수, 메뉴·가격은 본사 기준과 일치', preset: { plan: 'S2', social: 1 } },
  { id: 'brand', name: '독립브랜드형', summary: '우리 가게만의 이야기와 얼굴을 만듭니다.',
    features: ['브랜드 스토리·대표 인사', '로고 제작(1회)', '상품·서비스 소개', '예약/문의 접수와 휴대폰 알림', '소식글 AI 초안 월 4건', '소셜 1채널 자동게시'],
    caution: '사진·이야기 자료 제공 필요', preset: { plan: 'S3', logo: true } },
  { id: 'food', name: '음식업종형', summary: '메뉴를 보고 바로 찾아오거나 예약하게 합니다.',
    features: ['사진 메뉴판·가격', '원산지 표시', '영업시간·휴무 안내', '예약 접수', '테이블 QR 메뉴', '배달앱 바로가기'],
    caution: '메뉴 변경이 잦으면 S3, 온라인 주문·결제는 S4', preset: { plan: 'S2', booking: true } },
  { id: 'build', name: '건축·인테리어형', summary: '시공 사례로 신뢰를 보여 주고 견적 문의를 받습니다.',
    features: ['시공 사례 포트폴리오(전·후 사진)', '견적 신청서·즉시 휴대폰 알림', '면허·등록 정보', '시공 가능 지역', '고객 후기', '소식글 AI 초안 월 4건'],
    caution: '사례 사진 확보·고객 동의 필요', preset: { plan: 'S3' } },
  { id: 'service', name: '서비스업형', summary: '미용·학원 등 예약이 중요한 업종에 맞춥니다.',
    features: ['서비스·가격 안내', '예약 접수', '전문가·강사 소개', '공지사항', '오시는 길'],
    caution: '업종별 광고 규제 확인', preset: { plan: 'S2', booking: true } },
  { id: 'farm', name: '농수산 직판형', summary: '무안 특산물을 소비자에게 직접 팝니다.',
    features: ['상품·산지 이야기', '온라인 주문·결제', '택배·배송 안내', '회원·포인트', '에코디몰 연계 판매'],
    caution: '통신판매업 신고·결제 심사 필요', preset: { plan: 'S4' } },
  { id: 'nonprofit', name: '교회·단체·비영리형', summary: '단체 소식과 일정을 부담 없이 알립니다.',
    features: ['단체 소개·연혁', '일정·행사 안내', '소식·자료실', '오시는 길', '비영리 30% 할인'],
    caution: '후원금 결제 기능은 별도 검토', preset: { plan: 'S2', nonprofit: true } },
]);

export const HOMEPAGE_ADDON_TEXT = Object.freeze([
  ['추가 페이지', '페이지당 월 2,000원'],
  ['예약/견적 신청', '월 5,000원 (S3·S4 포함)'],
  ['소셜 자동게시', '채널당 월 5,000원 (S3·S4 1채널 포함, 게시 전 승인)'],
  ['다국어', '언어당 월 5,000원 (S4 1개 포함)'],
  ['온라인 결제', '월 10,000원 + 결제대행(PG) 수수료 실비 (S4 포함)'],
  ['추가 수정', '건당 5,000원 (1건 = 30분 이내 작업)'],
  ['로고 디자인', '1회 50,000원'],
  ['사진 촬영', '1회 50,000원 (외부 촬영 시 실비)'],
  ['도메인', '실비 (고객 명의 등록)'],
  ['광고 운영 대행', '광고비의 10% (최소 월 30,000원, 광고비는 고객 직접 결제)'],
]);

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function isEkodiBizHomepageServicePath(pathname = '') {
  return /^\/ekodibiz\/(?:homepage|homepage-service|web-subscription)\/?$/i.test(String(pathname || ''));
}

export function ekodiBizHomepageServiceHtml() {
  const o = OPERATOR, P = HOMEPAGE_PRICING;
  const plans = Object.values(P.plans);
  const planRows = plans.map((p) => `<tr><th scope="row">${esc(p.name)}</th><td data-label="기능·개발 범위">${esc(p.scope)}</td><td class="num" data-label="제작비">${won(p.setup)}</td><td class="num" data-label="월 구독료"><strong>${won(p.monthly)}</strong></td></tr>`).join('');
  const addonRows = HOMEPAGE_ADDON_TEXT.map(([a, b]) => `<tr><th scope="row">${esc(a)}</th><td data-label="요금">${esc(b)}</td></tr>`).join('');
  const tabs = HOMEPAGE_TYPES.map((t, i) => `<button type="button" role="tab" id="tab-${t.id}" aria-controls="panel-${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(t.name)}</button>`).join('');
  const panels = HOMEPAGE_TYPES.map((t, i) => {
    const est = estimateHomepageSubscription(P, { contract: '12', ...t.preset });
    return `<div class="panel" role="tabpanel" id="panel-${t.id}" aria-labelledby="tab-${t.id}"${i === 0 ? '' : ' hidden'}>
      <h3>${esc(t.name)}</h3><p>${esc(t.summary)}</p>
      <ul class="feat">${t.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <p class="rec">추천 구성: <strong>${esc(est.lines.map((l) => l.label).join(' + '))}</strong>${t.preset.logo ? ' + 로고(1회)' : ''}${t.preset.nonprofit ? ' · 비영리 할인' : ''}<br>예상 월 구독료 <strong class="big">${won(est.monthly)}</strong> · 제작비 ${won(est.setup)}</p>
      <p class="note">유의: ${esc(t.caution)}</p>
      <button type="button" class="ghost" data-preset="${esc(JSON.stringify({ type: t.name, ...t.preset }))}">이 구성으로 계산·신청하기</button>
    </div>`;
  }).join('');
  const planOptions = plans.map((p) => `<option value="${p.id}">${esc(p.name)} (월 ${won(p.monthly)})</option>`).join('');
  const typeOptions = HOMEPAGE_TYPES.map((t) => `<option>${esc(t.name)}</option>`).join('');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>매장 홈페이지 구독 서비스 요금 안내·신청 | 에코디비즈 EKODIBIZ</title>
  <meta name="description" content="월 9,900원부터. 제작비는 낮게, 관리는 월 구독으로. 업종별 기능 안내와 예상 구독료 계산, 상담 신청.">
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
    h1{margin:0 0 .4rem;font-size:clamp(1.6rem,5vw,2.3rem);letter-spacing:-.03em}h2{margin:0 0 .7rem;font-size:1.2rem}h3{margin:.2rem 0 .3rem;font-size:1.08rem}
    p,li,td{color:var(--muted)}.lead{font-size:1.04rem}.badge{display:inline-block;padding:3px 10px;border-radius:999px;background:var(--soft);color:var(--accent);font-size:12px;font-weight:800}
    .cta{display:inline-flex;align-items:center;min-height:46px;padding:10px 20px;border-radius:999px;background:var(--accent);color:#fff;font-weight:800;text-decoration:none;margin-top:8px}
    .table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.93rem;min-width:620px}
    th,td{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top}thead th{background:var(--soft);color:var(--text)}tbody th{color:var(--text);white-space:nowrap}.num{text-align:right;white-space:nowrap}
    ul{padding-left:1.2rem}.note{font-size:.88rem}
    [role=tablist]{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:12px;scrollbar-width:thin}
    [role=tab]{flex:0 0 auto;min-height:44px;padding:8px 14px;border:1px solid var(--line);border-radius:999px;background:var(--bg);color:var(--text);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
    [role=tab][aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}
    .panel{border:1px solid var(--line);border-radius:14px;padding:16px 18px;background:var(--bg)}
    .feat{columns:2;column-gap:24px}.feat li{break-inside:avoid}.rec{color:var(--text)}.big{font-size:1.25rem;color:var(--accent)}
    .ghost{min-height:44px;padding:8px 16px;border:1px solid var(--accent);border-radius:999px;background:transparent;color:var(--accent);font:inherit;font-weight:800;cursor:pointer}
    form{display:grid;gap:12px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.row3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    label{display:grid;gap:6px;font-size:13px;font-weight:700;color:var(--text)}
    input,select,textarea{width:100%;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit;background:var(--bg);color:var(--text)}textarea{min-height:100px}
    fieldset{border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:0;display:grid;gap:10px}legend{font-weight:800;padding:0 6px}
    .checks{display:flex;flex-wrap:wrap;gap:6px 18px}.chk{display:flex;gap:8px;align-items:center;font-weight:500;font-size:14px}.chk input{width:auto;min-height:auto}
    .calc{position:sticky;bottom:8px;z-index:3;border:2px solid var(--accent);border-radius:14px;padding:12px 16px;background:var(--card);box-shadow:0 6px 20px rgba(0,0,0,.08)}
    .calc .total{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}.calc .total strong{font-size:1.5rem;color:var(--accent)}
    .calc details{font-size:13px;color:var(--muted)}.calc ul{margin:.3rem 0}
    .trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.consent{display:flex;gap:8px;align-items:flex-start;font-weight:500;font-size:13px}.consent input{width:auto;min-height:auto;margin-top:5px}
    button[type=submit]{min-height:48px;border:0;border-radius:999px;background:var(--accent);color:#fff;font-weight:800;font-size:15px;cursor:pointer}button[disabled]{opacity:.6}
    @media(prefers-color-scheme:dark){.cta,button[type=submit],[role=tab][aria-selected=true]{color:#0d1a14}}
    .status{min-height:1.4em;font-weight:700}.status.ok{color:var(--ok)}.status.error{color:var(--err)}
    .done{display:none;padding:18px;border-radius:14px;background:var(--soft);border:1px solid var(--line)}.done strong{color:var(--text)}
    .footer{width:min(1040px,calc(100% - 32px));margin:0 auto 28px;padding:24px 0;border-top:1px solid var(--line);text-align:center;color:var(--muted);font-size:12px}
    .footer nav{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px}.footer a{display:inline-flex;min-height:44px;align-items:center;color:var(--accent)}
    :focus-visible{outline:2px solid var(--accent);outline-offset:3px}
    @media(max-width:640px){.row,.row3{grid-template-columns:1fr}.feat{columns:1}.topbar{flex-wrap:wrap}table{min-width:0}thead{display:none}tr{display:block;border:1px solid var(--line);border-radius:12px;margin-bottom:10px;padding:4px 0}th,td{display:block;border:0;padding:6px 12px}tbody th{white-space:normal;background:var(--soft);border-radius:12px 12px 0 0;margin-top:-4px}td[data-label]::before{content:attr(data-label);display:block;font-size:11px;font-weight:800;color:var(--text)}.num{text-align:left}}
  </style>
</head>
<body>
<header class="topbar" data-site-shell="header" role="banner">
  <a class="brand" href="/ekodibiz" aria-label="에코디비즈 홈">EKODIBIZ</a>
  <nav aria-label="에코디비즈 주요 메뉴">
    <a href="/ekodibiz/#business">사업분야</a>
    <a href="/ekodibiz/homepage" aria-current="page">홈페이지 구독</a>
    <a href="#apply">계산·신청</a>
    <a href="/ekodibiz/refund">환불정책</a>
  </nav>
</header>
<main data-ekodibiz-homepage-service="${EKODIBIZ_HOMEPAGE_SERVICE_VERSION}">
  <section>
    <span class="badge">매장 디지털 관리 구독 · 월 9,900원부터</span>
    <h1>제작비는 낮게, 관리는 매달 맡기세요</h1>
    <p class="lead">에코디비즈가 매장 홈페이지를 만들고 호스팅·보안·검색 노출·수정·방문통계까지 매달 관리합니다. 대표 사례는 <a href="/bbqcg">BBQ 무안청계점</a>입니다.</p>
    <a class="cta" href="#apply">예상 구독료 계산하고 상담 신청</a>
  </section>

  <section aria-labelledby="types">
    <h2 id="types">업종·유형별 제공 기능</h2>
    <div role="tablist" aria-label="업종·유형 선택">${tabs}</div>
    ${panels}
  </section>

  <section aria-labelledby="plans">
    <h2 id="plans">기본 요금제 <span class="note">(12개월 약정 · 부가세 별도)</span></h2>
    <div class="table-wrap"><table><thead><tr><th>요금제</th><th>기능·개발 범위</th><th>제작비</th><th>월 구독료</th></tr></thead><tbody>${planRows}
      <tr><th scope="row">맞춤 개발</th><td data-label="기능·개발 범위">요금제 밖 전용 기능(외부 시스템 연동 등)</td><td class="num" data-label="제작비">견적</td><td class="num" data-label="월 구독료">기능별 유지비</td></tr></tbody></table></div>
    <p class="note">약정 없이 월 단위 이용 시 월 구독료 +30%. 연납 시 2개월 무료.</p>
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
    <h2 id="applyTitle">예상 구독료 계산 · 상담 신청서</h2>
    <p>항목을 고르면 월 예상 구독료가 바로 계산됩니다. 결제는 상담 후 계약 시점에 진행되며, 이 신청만으로 요금이 청구되지 않습니다.</p>
    <form id="hpForm" novalidate>
      <fieldset>
        <legend>1. 구성 선택</legend>
        <div class="row">
          <label>업종·유형 <select id="type"><option value="">선택해 주세요</option>${typeOptions}<option>기타</option></select></label>
          <label>요금제 <select id="plan">${planOptions}</select></label>
        </div>
        <div class="row3">
          <label>추가 페이지 수 <input id="pages" type="number" min="0" max="50" value="0" inputmode="numeric"></label>
          <label>소셜 자동게시 채널 수 <input id="social" type="number" min="0" max="10" value="0" inputmode="numeric"></label>
          <label>다국어 수 <input id="lang" type="number" min="0" max="10" value="0" inputmode="numeric"></label>
        </div>
        <div class="checks">
          <label class="chk"><input id="booking" type="checkbox"> 예약/견적 신청</label>
          <label class="chk"><input id="payment" type="checkbox"> 온라인 결제</label>
          <label class="chk"><input id="logo" type="checkbox"> 로고 디자인(1회)</label>
          <label class="chk"><input id="photo" type="checkbox"> 사진 촬영(1회)</label>
        </div>
        <div class="row3">
          <label>계약 방식 <select id="contract"><option value="12">12개월 약정</option><option value="annual">연납 (2개월 무료)</option><option value="monthly">무약정 (+30%)</option></select></label>
          <label>청계면상인회 회원 <select id="member"><option value="">아니오</option><option value="y">예 (20% 할인)</option><option value="join">가입 희망</option></select></label>
          <label class="chk" style="align-self:end"><input id="nonprofit" type="checkbox"> 비영리·종교단체 (30% 할인)</label>
        </div>
      </fieldset>
      <div class="calc" id="calc" aria-live="polite">
        <div class="total"><span>월 예상 구독료 <small>(부가세 별도)</small></span><strong id="calcMonthly">-</strong></div>
        <div class="note" id="calcSub">-</div>
        <details><summary>계산 내역 보기</summary><ul id="calcLines"></ul><p id="calcNote"></p></details>
      </div>
      <fieldset>
        <legend>2. 신청자 정보</legend>
        <div class="row">
          <label>상호(매장명) * <input id="business" maxlength="80" required autocomplete="organization"></label>
          <label>담당자 이름 * <input id="name" maxlength="40" required autocomplete="name"></label>
        </div>
        <div class="row">
          <label>연락처(휴대폰) * <input id="phone" maxlength="20" required inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></label>
          <label>이메일 * <input id="email" type="email" maxlength="254" required autocomplete="email"></label>
        </div>
        <label>현재 홈페이지·SNS 주소 <input id="current" maxlength="300" placeholder="없으면 비워 두세요"></label>
        <label>원하는 기능·요청사항 <textarea id="message" maxlength="3000" placeholder="예: 메뉴판, 네이버 검색 노출, 인스타 연동"></textarea></label>
      </fieldset>
      <label class="trap" aria-hidden="true">Website <input id="website" tabindex="-1" autocomplete="off"></label>
      <label class="consent"><input id="consent" type="checkbox" required><span>상담을 위해 상호·이름·연락처·이메일을 수집하고 상담 완료 후 1년간 보관하는 데 동의합니다. (<a href="/privacy">개인정보처리방침</a>)</span></label>
      <button id="send" type="submit">이 구성으로 상담 신청하기</button>
      <div id="status" class="status" role="status" aria-live="polite"></div>
    </form>
    <div id="done" class="done" role="status"><strong>신청이 정상 접수되었습니다.</strong><p>담당자가 1영업일 이내 연락드리겠습니다. 기타 문의: 담당자 ${o.manager} · ${o.phone} · <a href="mailto:${o.email}">${o.email}</a></p></div>
    <p class="note">예상 구독료는 안내용이며 최종 금액은 상담 후 계약서로 확정됩니다. 결제대행 수수료·도메인·광고비는 실비 별도. 기타 문의: 담당자 ${o.manager} · <a href="tel:${o.phone.replace(/-/g, '')}">${o.phone}</a> · <a href="mailto:${o.email}">${o.email}</a></p>
  </section>
</main>
<footer class="footer" data-site-shell="footer" aria-label="에코디비즈 사업자 정보 및 정책">
  <p><strong>EKODIBIZ</strong> · ${o.name} · 대표 ${o.representative} · 사업자등록번호 ${o.businessRegistrationNumber}<br>${o.address} · <a href="mailto:${o.email}">${o.email}</a></p>
  <nav aria-label="에코디비즈 푸터 메뉴"><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a><a href="/ekodibiz/refund">환불정책</a><a href="/">EKODI</a></nav>
</footer>
<script>(function(){
  var PRICING=${JSON.stringify(P)};
  var estimate=${estimateHomepageSubscription.toString()};
  function $(id){return document.getElementById(id);}
  function v(id){return ($(id).value||'').trim();}
  function won(n){return Number(n).toLocaleString('ko-KR')+'원';}
  var tabs=[].slice.call(document.querySelectorAll('[role=tab]'));
  function select(t){tabs.forEach(function(x){var on=x===t;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;$(x.getAttribute('aria-controls')).hidden=!on;});}
  tabs.forEach(function(t,i){t.addEventListener('click',function(){select(t);});t.addEventListener('keydown',function(e){var k=e.key,j=k==='ArrowRight'?i+1:k==='ArrowLeft'?i-1:k==='Home'?0:k==='End'?tabs.length-1:null;if(j===null)return;e.preventDefault();var n=tabs[(j+tabs.length)%tabs.length];select(n);n.focus();});});
  function sel(){return{plan:v('plan'),pages:v('pages'),social:v('social'),lang:v('lang'),booking:$('booking').checked,payment:$('payment').checked,logo:$('logo').checked,photo:$('photo').checked,member:v('member')==='y',nonprofit:$('nonprofit').checked,contract:v('contract')};}
  var last=null;
  function update(){var e=estimate(PRICING,sel());last=e;var inc=PRICING.plans[e.plan].includes;
    $('booking').disabled=inc.booking;if(inc.booking)$('booking').checked=true;$('payment').disabled=inc.payment;if(inc.payment)$('payment').checked=true;
    $('calcMonthly').textContent=won(e.monthly);
    $('calcSub').textContent=(e.contract==='annual'?'연납 '+won(e.yearly):'연간 '+won(e.yearly))+' · 제작비 '+won(e.setup)+' · 첫 결제 예상 '+won(e.firstPayment);
    $('calcLines').innerHTML=e.lines.map(function(l){return '<li>'+l.label+': 월 '+won(l.amount)+'</li>';}).join('');
    $('calcNote').textContent=(e.discountRate?'할인 '+Math.round(e.discountRate*100)+'% 적용 · ':'')+(e.contract==='monthly'?'무약정 +30% · ':e.contract==='annual'?'연납 2개월 무료 · ':'')+'요금제 포함 기능은 자동 반영 · 100원 단위 반올림';
  }
  ['plan','pages','social','lang','booking','payment','logo','photo','member','nonprofit','contract'].forEach(function(id){$(id).addEventListener('input',update);$(id).addEventListener('change',update);});
  [].slice.call(document.querySelectorAll('[data-preset]')).forEach(function(b){b.addEventListener('click',function(){var p=JSON.parse(b.getAttribute('data-preset'));
    $('type').value=p.type;$('plan').value=p.plan;$('pages').value=0;$('social').value=p.social||0;$('lang').value=0;
    ['booking','payment','logo','photo'].forEach(function(k){$(k).checked=!!p[k];});$('nonprofit').checked=!!p.nonprofit;update();$('apply').scrollIntoView({behavior:'smooth'});});});
  $('plan').value='S2';update();
  var f=$('hpForm'),s=$('status'),b=$('send'),d=$('done');
  f.addEventListener('submit',async function(e){e.preventDefault();s.className='status';
    if(!v('business')||!v('name')||!v('phone')||!v('email')){s.className='status error';s.textContent='* 표시 항목을 모두 입력해 주세요.';return;}
    if(!/^[0-9+\\-\\s()]{8,20}$/.test(v('phone'))){s.className='status error';s.textContent='연락처를 확인해 주세요.';return;}
    if(!$('consent').checked){s.className='status error';s.textContent='개인정보 수집·이용에 동의해 주세요.';return;}
    update();var c=last;b.disabled=true;s.textContent='신청서를 보내고 있습니다.';
    var cm={'12':'12개월 약정',annual:'연납',monthly:'무약정'}[c.contract];
    var msg=['[매장 홈페이지 구독 신청]','상호: '+v('business'),'담당자: '+v('name'),'연락처: '+v('phone'),'이메일: '+v('email'),'업종·유형: '+(v('type')||'-'),'현재 홈페이지·SNS: '+(v('current')||'-'),'상인회 회원: '+$('member').options[$('member').selectedIndex].text,'비영리: '+($('nonprofit').checked?'예':'아니오'),'-',
      '[선택 구성 · 예상 금액(부가세 별도)]'].concat(c.lines.map(function(l){return '- '+l.label+': 월 '+won(l.amount);}),[$('logo').checked?'- 로고 디자인(1회)':'',$('photo').checked?'- 사진 촬영(1회)':'','계약: '+cm+(c.discountRate?' · 할인 '+Math.round(c.discountRate*100)+'%':''),'월 예상 구독료: '+won(c.monthly),'제작비: '+won(c.setup),'첫 결제 예상: '+won(c.firstPayment),'-','개인정보 동의: 예','요청사항: '+(v('message')||'-')]).filter(function(x){return x!=='';}).join('\\n');
    try{var r=await fetch('/mail/api/contact',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({name:v('name'),email:v('email'),subject:'홈페이지 구독 신청 · '+v('business')+' · 월 '+won(c.monthly),message:msg,website:v('website'),site:'ekodibiz',source:'${EKODIBIZ_HOMEPAGE_CONTACT_SOURCE}',sourceUrl:location.href})});
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
