// EKODIBIZ 홈페이지 구독 서비스 — 화면 탭(신청·요금제·업종별 기능·이용 기준) + 단계형 신청(유형→요금제 설명→결제·추가→상담/바로 구독)
// Canonical public page: https://ekodi.kr/ekodibiz/homepage (ekodibiz.kr/homepage 는 301 로 이 주소에 도착)
// 신청서는 별도 저장소 없이 기존 공개 문의 API(/mail/api/contact)로 joseph@ekodi.kr 에 전달된다.
// 예상 구독료 계산은 estimateHomepageSubscription() 하나만 정본으로 쓰고, 같은 함수 원문을 브라우저에 그대로 싣는다.
export const EKODIBIZ_HOMEPAGE_SERVICE_PATH = '/ekodibiz/homepage';
export const EKODIBIZ_HOMEPAGE_SERVICE_URL = 'https://ekodi.kr/ekodibiz/homepage';
export const EKODIBIZ_HOMEPAGE_SERVICE_VERSION = 'v0.4-2026-11-21';
export const EKODIBIZ_HOMEPAGE_CONTACT_SOURCE = 'ekodibiz-homepage-subscription';

const OPERATOR = Object.freeze({
  name: '에코디비즈', representative: '정찬균', businessRegistrationNumber: '213-13-01959',
  address: '전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층',
  email: 'joseph@ekodibiz.kr', phone: '010-3501-8542', manager: '정찬균',
});

// 요금 정본 (부가세 포함, 원)
export const HOMEPAGE_PRICING = Object.freeze({
  taxIncluded: true,
  plans: {
    S1: { id: 'S1', name: 'S1 기본형', setup: 0, monthly: 9900, includes: { booking: false, social: 0, lang: 0, payment: false },
      scope: '소개 1페이지(글·사진·활동 또는 서비스·전화·지도·외부 링크), 모바일 최적화, 보안(SSL)·호스팅, 방문통계, 월 1회 수정' },
    S2: { id: 'S2', name: 'S2 소식형', setup: 0, monthly: 19900, includes: { booking: false, social: 0, lang: 0, payment: false },
      scope: '5~7페이지(메뉴/서비스·갤러리·소식·오시는 길), 네이버·구글 검색 등록, 기본 SEO/AEO, 문의폼, 월 3회 수정' },
    S3: { id: 'S3', name: 'S3 운영형', setup: 0, monthly: 29900, includes: { booking: true, social: 1, lang: 0, payment: false },
      scope: 'S2 + 예약/견적 신청·휴대폰 알림, 리뷰 모음, 소식글 AI 초안 월 4건, 소셜 자동게시 1채널, 월간 성과 리포트, 월 5회 기본 수정' },
    S4: { id: 'S4', name: 'S4 확장형', setup: 0, monthly: 49900, includes: { booking: true, social: 1, lang: 1, payment: true },
      scope: 'S3 + 온라인 주문·결제, 회원·포인트, POS·예약 시스템 연동, 다국어 1개, 전담 관리' },
  },
  addons: { page: 2000, booking: 5000, social: 5000, lang: 5000, payment: 10000 },
  oneTime: { logo: 50000, photo: 50000 },
  discounts: { member: 0.2, nonprofit: 0.3 },
  contract: { '12': 1, monthly: 1, annual: 10 / 12 },
});

/**
 * 월 예상 구독료 계산 (정본). 브라우저에도 이 함수 원문이 그대로 실린다 — 바깥 변수를 참조하지 말 것.
 * sel: { plan, pages, booking, social, lang, payment, logo, photo, member, nonprofit, contract }
 */
export function estimateHomepageSubscription(pricing, sel) {
  var P = pricing, s = sel || {};
  var plan = Object.prototype.hasOwnProperty.call(P.plans, s.plan) ? P.plans[s.plan] : P.plans.S1;
  var inc = plan.includes, a = P.addons;
  // Keep this serialized function self-contained after Worker keepNames bundling.
  var quantities = {};
  for (var key of ['pages', 'social', 'lang']) {
    var value = Math.floor(Number(s[key]) || 0);
    quantities[key] = Math.max(0, Math.min(50, value));
  }
  var lines = [{ label: plan.name, amount: plan.monthly }];
  var pages = quantities.pages;
  if (pages) lines.push({ label: '추가 페이지 ' + pages + '개', amount: pages * a.page });
  if (s.booking && !inc.booking) lines.push({ label: '예약/견적 신청', amount: a.booking });
  var social = Math.max(0, quantities.social - inc.social);
  if (social) lines.push({ label: '소셜 자동게시 ' + social + '채널', amount: social * a.social });
  var lang = Math.max(0, quantities.lang - inc.lang);
  if (lang) lines.push({ label: '다국어 ' + lang + '개', amount: lang * a.lang });
  if (s.payment && !inc.payment) lines.push({ label: '온라인 결제', amount: a.payment });
  var subtotal = 0;
  for (var i = 0; i < lines.length; i++) subtotal += lines[i].amount;
  var discountRate = Math.max(s.member ? P.discounts.member : 0, s.nonprofit ? P.discounts.nonprofit : 0);
  var contract = Object.prototype.hasOwnProperty.call(P.contract, s.contract) ? s.contract : 'monthly';
  var monthly = Math.round(subtotal * (1 - discountRate) * P.contract[contract] / 100) * 100;
  var setup = plan.setup + (s.logo ? P.oneTime.logo : 0) + (s.photo ? P.oneTime.photo : 0);
  var yearly = contract === 'annual' ? Math.round(subtotal * (1 - discountRate) * 10 / 100) * 100 : monthly * 12;
  if (contract === 'annual') monthly = Math.round(yearly / 12);
  var firstPayment = setup + (contract === 'annual' ? yearly : monthly);
  return { plan: plan.id, lines: lines, subtotal: subtotal, discountRate: discountRate, contract: contract, monthly: monthly, setup: setup, yearly: yearly, firstPayment: firstPayment };
}

// 유형별 안내 (탭) — preset 은 계산기 기본 선택값
export const HOMEPAGE_TYPES = Object.freeze([
  { id: 'franchise', name: '프랜차이즈형', summary: '본사 사이트가 못 하는 "우리 동네 지점" 검색 노출에 집중합니다.',
    features: ['지점 전용 소개(주소·영업시간·주차)', '지점 소식·이벤트 게시', '배달앱·전화 주문 바로가기', '네이버·구글 리뷰 모음', '지역 검색 최적화(지도·플레이스 연동)', '인스타그램 등 소셜 1채널 자동게시'],
    caution: '본사 상표·디자인 사용 승인 후 착수, 메뉴·가격은 본사 기준과 일치', preset: { plan: 'S2', social: 1 } },
  { id: 'brand', name: '독립브랜드형', summary: '우리 가게만의 이야기와 얼굴을 만듭니다.',
    features: ['브랜드 스토리·대표 인사', '기존 로고 게시(로고 제작은 선택)' , '상품·서비스 소개', '예약/문의 접수와 휴대폰 알림', '소식글 AI 초안 월 4건', '소셜 1채널 자동게시'],
    caution: '사진·이야기 자료 제공 필요', preset: { plan: 'S3' } },
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

export const HOMEPAGE_AUDIENCES = Object.freeze([
  { id: 'personal', name: '개인', examples: '프리랜서 · 강사 · 작가 · 구직자', guide: '프로필과 활동·작품, 연락처를 담은 소개 페이지로 시작하세요.' },
  { id: 'business', name: '매장·기업', examples: '동네 가게 · 소상공인 · 소기업', guide: '상품·서비스 소개, 영업시간과 전화·지도를 한 페이지에 담아보세요.' },
  { id: 'institution', name: '기관·학교', examples: '교육기관 · 연구소 · 공공기관', guide: '기관 소개와 사업·교육 안내, 담당 연락처를 한 페이지에서 안내하세요.' },
  { id: 'community', name: '단체', examples: '교회 · 선교회 · 동호회 · 비영리', guide: '단체의 사명과 모임·활동, 참여 문의를 한 페이지에서 알려보세요.' },
  { id: 'organization', name: '조직', examples: '상인회 · 협회 · 협동조합 · 부서', guide: '조직 소개와 주요 활동, 담당자 연락처를 한 페이지에서 시작하세요.' },
  { id: 'event', name: '행사·프로젝트', examples: '세미나 · 캠페인 · 기간별 사업', guide: '목적과 일정·장소, 참여 안내 링크를 담은 한 페이지로 시작하세요.' },
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
  ['도메인', '에코디 기본 주소 포함 · 별도 고객 도메인 등록·갱신은 선택 시 실비'],
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
    const est = estimateHomepageSubscription(P, { contract: 'monthly', ...t.preset });
    return `<div class="panel" role="tabpanel" id="panel-${t.id}" aria-labelledby="tab-${t.id}"${i === 0 ? '' : ' hidden'}>
      <h3>${esc(t.name)}</h3><p>${esc(t.summary)}</p>
      <ul class="feat">${t.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <p class="rec">추천 구성: <strong>${esc(est.lines.map((l) => l.label).join(' + '))}</strong>${t.preset.logo ? ' + 로고(1회)' : ''}${t.preset.nonprofit ? ' · 비영리 할인' : ''}<br>예상 월 구독료 <strong class="big">${won(est.monthly)}</strong> · 제작비 ${won(est.setup)}</p>
      <p class="note">유의: ${esc(t.caution)}</p>
      <button type="button" class="ghost" data-preset="${esc(JSON.stringify({ type: t.name, ...t.preset }))}">이 구성으로 계산·신청하기</button>
    </div>`;
  }).join('');
  const planOptions = plans.map((p) => `<option value="${p.id}">${esc(p.name)} (월 ${won(p.monthly)})</option>`).join('');
  const audienceCards = HOMEPAGE_AUDIENCES.map((a, i) => `<label class="audience-choice"><input type="radio" name="audience" value="${a.id}"${i === 0 ? ' checked' : ''}><span><strong>${esc(a.name)}</strong><small>${esc(a.examples)}</small></span></label>`).join('');
  const planFor = { S1: '개인·소개 한 페이지로 충분한 분', S2: '소식·사진을 꾸준히 올리고 검색에 노출하려는 곳', S3: '예약·견적을 받고 홍보까지 맡기려는 곳', S4: '온라인 주문·결제와 회원 관리가 필요한 곳' };
  const planCards = plans.map((p, i) => `<label class="plan-choice"><input type="radio" name="planChoice" value="${p.id}"${i === 0 ? ' checked' : ''}><span><strong>${esc(p.name)}</strong><b>월 ${won(p.monthly)}</b><small>${esc(planFor[p.id])}</small></span></label>`).join('');
  const planDetails = plans.map((p, i) => `<div class="plan-info" data-plan="${p.id}"${i === 0 ? '' : ' hidden'}><h4>${esc(p.name)} · 월 ${won(p.monthly)} <small>(제작비 ${won(p.setup)} · 부가세 포함)</small></h4><p>${esc(planFor[p.id])}에게 맞습니다.</p><ul class="feat">${p.scope.split(/,\s*/).map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`).join('');
  const typeOptions = HOMEPAGE_TYPES.map((t) => `<option>${esc(t.name)}</option>`).join('');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>개인·기관·단체 홈페이지 구독 요금·신청 | 에코디비즈 EKODIBIZ</title>
  <meta name="description" content="월 9,900원부터. 제작비 0원, 부가세 포함 월 9,900원부터 월 단위로 이용합니다. 업종별 기능 안내와 예상 구독료 계산, 상담 신청.">
  <link rel="canonical" href="${EKODIBIZ_HOMEPAGE_SERVICE_URL}">
  <meta name="robots" content="index,follow">
  <style>
    :root{color-scheme:light dark;--bg:#f7f7f3;--card:#fff;--text:#17211c;--muted:#59635d;--line:#dfe4df;--accent:#1f6b4f;--soft:#eef5f0;--ok:#1f6b4f;--err:#a3302a}
    @media(prefers-color-scheme:dark){:root{--bg:#101512;--card:#18201b;--text:#edf4ef;--muted:#b0bbb4;--line:#344038;--accent:#8fd2ad;--soft:#202c25;--ok:#8fd2ad;--err:#ff9b93}}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;line-height:1.7}
    .topbar{position:sticky;top:0;z-index:5;min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px max(16px,calc((100vw - 1040px)/2));border-bottom:1px solid var(--line);background:var(--card)}
    .brand{font-weight:900;letter-spacing:.08em;color:var(--text);text-decoration:none}.topbar nav{display:flex;flex-wrap:wrap;gap:2px}
    .topbar nav a{display:inline-flex;min-height:44px;align-items:center;padding:8px 10px;border-radius:9px;font-size:14px;color:var(--text);text-decoration:none}
    .topbar nav a[aria-current="page"],.topbar nav a:hover{background:var(--soft);color:var(--accent)}
    main{flex:1;width:100%;max-width:1040px;margin:0 auto;padding:28px 16px 64px}
    section{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:clamp(18px,4vw,34px);margin-bottom:18px}
    h1{margin:0 0 .4rem;font-size:clamp(1.6rem,5vw,2.3rem);letter-spacing:-.03em}h2{margin:0 0 .7rem;font-size:1.2rem}h3{margin:.2rem 0 .3rem;font-size:1.08rem}
    p,li,td{color:var(--muted)}.lead{font-size:1.04rem}.badge{display:inline-block;padding:3px 10px;border-radius:999px;background:var(--soft);color:var(--accent);font-size:14px;font-weight:800}
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
    label{display:grid;gap:6px;font-size:14px;font-weight:700;color:var(--text)}
    input,select,textarea{width:100%;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit;background:var(--bg);color:var(--text)}textarea{min-height:100px}
    fieldset{border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:0;display:grid;gap:10px}legend{font-weight:800;padding:0 6px}
    .checks{display:flex;flex-wrap:wrap;gap:6px 18px}.chk{display:flex;gap:8px;align-items:center;font-weight:500;font-size:14px}.chk input{width:auto;min-height:auto}
    .calc{position:sticky;bottom:8px;z-index:3;border:2px solid var(--accent);border-radius:14px;padding:12px 16px;background:var(--card);box-shadow:0 6px 20px rgba(0,0,0,.08)}
    .calc .total{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}.calc .total strong{font-size:1.5rem;color:var(--accent)}
    .calc details{font-size:14px;color:var(--muted)}.calc ul{margin:.3rem 0}
    .trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.consent{display:flex;gap:8px;align-items:flex-start;font-weight:500;font-size:14px}.consent input{width:auto;min-height:auto;margin-top:5px}
    button[type=submit]{min-height:48px;border:0;border-radius:999px;background:var(--accent);color:#fff;font-weight:800;font-size:15px;cursor:pointer}button[disabled]{opacity:.6}
    @media(prefers-color-scheme:dark){.cta,button[type=submit],[role=tab][aria-selected=true]{color:#0d1a14}}
    .status{min-height:1.4em;font-weight:700}.status.ok{color:var(--ok)}.status.error{color:var(--err)}
    .done{display:none;padding:18px;border-radius:14px;background:var(--soft);border:1px solid var(--line)}.done strong{color:var(--text)}
    .footer{width:min(1040px,calc(100% - 32px));margin:0 auto 28px;padding:24px 0;border-top:1px solid var(--line);text-align:center;color:var(--muted);font-size:14px}
    .footer nav{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px}.footer a{display:inline-flex;min-height:44px;align-items:center;color:var(--accent)}
    .service-details{border:1px solid var(--line);border-radius:14px;margin-bottom:18px;background:var(--card)}.service-details>summary{padding:16px 20px;font-weight:800;cursor:pointer}.service-details>section{margin:0;border:0;border-top:1px solid var(--line);border-radius:0}.calc{position:static}
    .audience-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.audience-choice{position:relative;display:flex;gap:9px;align-items:flex-start;border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--bg);cursor:pointer}.audience-choice:has(input:checked){border:2px solid var(--accent);padding:13px;background:var(--soft)}.audience-choice input{width:18px;min-height:18px;height:18px;margin-top:5px;accent-color:var(--accent);flex:none}.audience-choice strong{display:block;font-size:16px}.audience-choice small{display:block;color:var(--muted);font-weight:400;font-size:14px;margin-top:4px}.audience-guide{margin:0;padding:12px;background:var(--soft);border-radius:10px;color:var(--text)}@media(max-width:640px){.audience-grid{grid-template-columns:1fr 1fr}.audience-choice{padding:11px}.audience-choice:has(input:checked){padding:10px}}
    .page-tabs{position:sticky;top:64px;z-index:4;display:flex;gap:6px;overflow-x:auto;padding:8px 0;margin:0 0 12px;background:var(--bg)}
    .page-tabs [role=tab]{font-size:15px;padding:10px 18px}
    .hero{padding:clamp(16px,3vw,26px)}.hero .lead{margin:.3rem 0}
    .step{border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:grid;gap:10px;background:var(--card)}.step h3{display:flex;align-items:center;gap:8px;margin:0}.step .num{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;font-size:14px}
    .plan-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.plan-choice{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--bg);cursor:pointer}.plan-choice:has(input:checked){border:2px solid var(--accent);padding:11px;background:var(--soft)}.plan-choice input{width:18px;min-height:18px;height:18px;margin-top:4px;accent-color:var(--accent);flex:none}.plan-choice strong,.plan-choice b{display:block}.plan-choice b{color:var(--accent);font-size:16px}.plan-choice small{display:block;color:var(--muted);font-weight:400;font-size:13px;line-height:1.5;margin-top:4px}
    .plan-detail{border-left:4px solid var(--accent);background:var(--soft);border-radius:10px;padding:12px 16px}.plan-detail h4{margin:0 0 .2rem;font-size:1.02rem}.plan-detail p{margin:0 0 .3rem;color:var(--text)}.plan-detail ul{margin:.2rem 0}
    .addons{display:grid;gap:10px}.addons[open]{padding-bottom:4px}
    .actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}button.secondary{background:transparent;color:var(--accent);border:2px solid var(--accent)}
    .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
    @media(max-width:640px){.plan-grid{grid-template-columns:1fr 1fr}.topbar{position:static}.page-tabs{top:0}.page-tabs [role=tab]{padding:8px 12px;font-size:14px}.actions{grid-template-columns:1fr}}
    :focus-visible{outline:2px solid var(--accent);outline-offset:3px}
    @media(max-width:640px){.row,.row3{grid-template-columns:1fr}.feat{columns:1}.topbar{flex-wrap:wrap}table{min-width:0}thead{display:none}tr{display:block;border:1px solid var(--line);border-radius:12px;margin-bottom:10px;padding:4px 0}th,td{display:block;border:0;padding:6px 12px}tbody th{white-space:normal;background:var(--soft);border-radius:12px 12px 0 0;margin-top:-4px}td[data-label]::before{content:attr(data-label);display:block;font-size:13px;font-weight:800;color:var(--text)}.num{text-align:left}}
  </style>
</head>
<body>
<header class="topbar" data-site-shell="header" role="banner">
  <a class="brand" href="/ekodibiz" aria-label="에코디비즈 홈">EKODIBIZ</a>
  <nav aria-label="에코디비즈 주요 메뉴">
    <a href="/ekodibiz/#business">사업분야</a>
    <a href="/ekodibiz/homepage" aria-current="page">홈페이지 구독</a>
    <a href="#apply">구독 신청</a>
    <a href="/ekodibiz/refund">환불정책</a>
  </nav>
</header>
<main data-ekodibiz-homepage-service="${EKODIBIZ_HOMEPAGE_SERVICE_VERSION}">
  <section class="hero">
    <span class="badge">제작비 0원 · 부가세 포함 · 월납 9,900원부터</span>
    <h1>홈페이지, 월 9,900원으로 시작하세요</h1>
    <p class="lead">개인과 매장, 기관과 단체의 소개·사진·연락처를 담은 모바일 홈페이지를 만듭니다. 기본 주소·호스팅·보안 연결과 월 1회 기본 수정까지 9,900원에 포함합니다.</p>
    <p class="lead"><strong>처음 내는 금액 9,900원 · 12개월 이용 합계 118,800원</strong></p>
  </section>

  <div class="page-tabs" role="tablist" aria-label="홈페이지 구독 안내" id="pageTabs">
    <button type="button" role="tab" id="ptab-apply" aria-controls="apply" aria-selected="true" tabindex="0">구독 신청</button>
    <button type="button" role="tab" id="ptab-plans" aria-controls="plansPanel" aria-selected="false" tabindex="-1">요금제 비교</button>
    <button type="button" role="tab" id="ptab-types" aria-controls="typesPanel" aria-selected="false" tabindex="-1">업종별 기능</button>
    <button type="button" role="tab" id="ptab-rules" aria-controls="rulesPanel" aria-selected="false" tabindex="-1">이용 기준</button>
  </div>

  <section id="apply" class="page-panel" role="tabpanel" aria-labelledby="ptab-apply">
    <h2 id="applyTitle" class="sr-only">유형 선택하고 구독 신청</h2>
    <form id="hpForm" novalidate>
      <div class="step"><h3><span class="num">1</span>유형 선택</h3>
        <div class="audience-grid" role="group" aria-label="홈페이지 이용 유형">${audienceCards}</div>
        <p class="audience-guide" id="audienceGuide" aria-live="polite">${esc(HOMEPAGE_AUDIENCES[0].guide)} 모든 유형에서 기본형 월 9,900원으로 시작할 수 있습니다.</p>
      </div>
      <div class="step"><h3><span class="num">2</span>요금제 선택</h3>
        <input type="hidden" id="plan" value="S1">
        <div class="plan-grid" role="radiogroup" aria-label="요금제">${planCards}</div>
        <div class="plan-detail" id="planDetail" aria-live="polite">${planDetails}</div>
      </div>
      <div class="step"><h3><span class="num">3</span>결제 방식 · 추가 선택</h3>
        <div class="row3">
          <label>납부 방식 <select id="contract"><option value="monthly">월납 · 표시 요금 그대로</option><option value="annual">연납 · 12개월분 선납 (2개월 할인)</option></select></label>
          <label>청계면상인회 회원 <select id="member"><option value="">아니오</option><option value="y">예 (20% 할인)</option><option value="join">가입 희망</option></select></label>
          <label class="chk" style="align-self:end"><input id="nonprofit" type="checkbox"> 비영리·종교단체 (30% 할인)</label>
        </div>
        <details class="addons"><summary>추가 기능 선택 (필요할 때만)</summary>
          <label>세부 업종·유형 <select id="type"><option value="">선택 사항</option>${typeOptions}<option>기타</option></select></label>
          <div class="row3">
            <label>추가 페이지 수 <input id="pages" type="number" min="0" max="50" value="0" inputmode="numeric"></label>
            <label>소셜 자동게시 채널 수 <input id="social" type="number" min="0" max="10" value="0" inputmode="numeric"></label>
            <label>다국어 수 <input id="lang" type="number" min="0" max="10" value="0" inputmode="numeric"></label>
          </div>
          <div class="checks">
            <label class="chk"><input id="booking" type="checkbox"> 예약/견적 신청 (월 5,000원)</label>
            <label class="chk"><input id="payment" type="checkbox"> 온라인 결제 (월 10,000원)</label>
            <label class="chk"><input id="logo" type="checkbox"> 로고 디자인 (1회 50,000원)</label>
            <label class="chk"><input id="photo" type="checkbox"> 사진 촬영 (1회 50,000원)</label>
          </div>
        </details>
      </div>
      <div class="calc" id="calc" aria-live="polite">
        <div class="total"><span><span id="calcMonthlyLabel">월 예상 구독료</span> <small>(부가세 포함)</small></span><strong id="calcMonthly">-</strong></div>
        <div class="note" id="calcSub">-</div>
        <details><summary>계산 내역 보기</summary><ul id="calcLines"></ul><p id="calcNote"></p></details>
      </div>
      <div class="step"><h3><span class="num">4</span>신청자 정보</h3>
        <div class="row">
          <label>이름·기관·단체명 * <input id="business" maxlength="80" required autocomplete="organization"></label>
          <label>회신 이메일 * <input id="email" type="email" maxlength="254" required autocomplete="email"></label>
        </div>
        <div class="row">
          <label>담당자 이름 (선택) <input id="name" maxlength="40" autocomplete="name"></label>
          <label>전화번호 <span class="note">(바로 구독 신청 시 필수)</span> <input id="phone" maxlength="20" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></label>
        </div>
        <details><summary>추가 요청 남기기 (선택)</summary>
          <label>현재 홈페이지·SNS 주소 <input id="current" maxlength="300" placeholder="없으면 비워 두세요"></label>
          <label>원하는 기능·요청사항 <textarea id="message" maxlength="3000" placeholder="예: 개인 소개, 단체 소식, 행사 일정"></textarea></label>
        </details>
      </div>
      <label class="trap" aria-hidden="true">Website <input id="website" tabindex="-1" autocomplete="off"></label>
      <label class="consent"><input id="consent" type="checkbox" required><span>상담·구독 진행을 위해 이름·기관·단체명과 이메일, 입력한 담당자·연락처를 수집하고 상담 완료 후 1년간 보관하는 데 동의합니다. (<a href="/privacy">개인정보처리방침</a>)</span></label>
      <label class="consent"><input id="terms" type="checkbox"><span>바로 구독 신청 시: 선택한 요금제·납부 방식과 <a href="#rulesPanel" data-goto="rulesPanel">이용 기준</a>·<a href="/ekodibiz/refund">환불정책</a>을 확인했습니다.</span></label>
      <div class="actions">
        <button id="send" type="submit" data-mode="consult" class="secondary">상담 신청</button>
        <button id="subscribe" type="submit" data-mode="subscribe">바로 구독 신청</button>
      </div>
      <p class="note">상담 신청: 담당자가 1영업일 이내 연락드립니다. 바로 구독 신청: 선택한 구성으로 개설을 시작하고, 첫 결제 안내를 이메일·문자로 보내드립니다. 결제 전까지 요금은 청구되지 않습니다.</p>
      <div id="status" class="status" role="status" aria-live="polite"></div>
    </form>
    <div id="done" class="done" role="status"><strong id="doneTitle">신청이 정상 접수되었습니다.</strong><p id="doneText">담당자가 1영업일 이내 연락드리겠습니다.</p><p>기타 문의: 담당자 ${o.manager} · ${o.phone} · <a href="mailto:${o.email}">${o.email}</a></p></div>
  </section>

  <section id="plansPanel" class="page-panel" role="tabpanel" aria-labelledby="ptab-plans" hidden>
    <h2 id="plans">기본 요금제 <span class="note">(제작비 0원 · 월납 · 부가세 포함)</span></h2>
    <div class="table-wrap"><table><thead><tr><th>요금제</th><th>기능·개발 범위</th><th>제작비</th><th>월 구독료</th></tr></thead><tbody>${planRows}
      <tr><th scope="row">맞춤 개발</th><td data-label="기능·개발 범위">요금제 밖 전용 기능(외부 시스템 연동 등)</td><td class="num" data-label="제작비">견적</td><td class="num" data-label="월 구독료">기능별 유지비</td></tr></tbody></table></div>
    <p class="note">표시된 금액으로 매월 이용합니다. 최소 약정기간과 월납 할증이 없습니다. 첫 달만 적용되는 행사 가격이 아닌 기본 월 요금입니다. 연납은 선택할 수 있으며, 12개월 이용료를 10개월 금액으로 선납합니다.</p>
    <h2 id="addons">추가 옵션</h2>
    <div class="table-wrap"><table><thead><tr><th>옵션</th><th>요금</th></tr></thead><tbody>${addonRows}</tbody></table></div>
  </section>

  <section id="typesPanel" class="page-panel" role="tabpanel" aria-labelledby="ptab-types" hidden>
    <h2 id="types">업종·유형별 제공 기능</h2>
    <p>기본형부터 시작할 수 있습니다. 아래 구성과 추가 기능은 필요에 따라 선택합니다.</p>
    <div role="tablist" aria-label="업종·유형 선택" class="type-tabs">${tabs}</div>
    ${panels}
  </section>

  <section id="rulesPanel" class="page-panel" role="tabpanel" aria-labelledby="ptab-rules" hidden>
    <h2 id="discount">할인 · 서비스 기준</h2>
    <ul>
      <li>청계면상인회 회원 월 구독료 20% 할인, 비영리·종교단체 30% 할인 (중복 시 큰 할인 1개만 적용)</li>
      <li>모든 표준 요금제 제작비 0원. 표준 서식·고객 제공 자료 기준이며, 사례 공개 동의는 이용 조건에 포함되지 않습니다.</li>
      <li>월 단위 이용이며 다음 이용월 결제 전 해지를 신청할 수 있습니다. 월납 이용에는 잔여 약정 위약금이 없습니다.</li>
      <li>에코디 기본 주소 이용료는 구독에 포함됩니다. 별도로 구매한 고객 명의 도메인·글·사진은 고객 소유입니다. 해지 시 도메인 이전과 자료 백업 파일을 무료로 제공 (해지 후 30일 이내 요청)</li>
      <li>첫 월 이용료는 홈페이지 공개일부터 계산합니다. 취소·환불과 선택한 추가 작업의 정산 기준은 신청 전 안내하며, 상세 기준은 환불정책에서 확인할 수 있습니다.</li>
      <li>수정 1건 = 30분 이내의 글·사진·가격 교체. 평일 1영업일 이내 응답, 2영업일 이내 반영</li>
      <li>요금 변경은 30일 전 안내하며 다음 이용기간의 적용 여부를 확인할 수 있습니다. 자세한 기준은 <a href="/ekodibiz/refund">환불정책</a>을 따릅니다.</li>
    </ul>
    <p class="note">예상 구독료는 안내용이며 최종 금액은 개설 전 안내로 확정됩니다. 선택한 유료 기능, 고객 명의 별도 도메인 등록·갱신료, 결제대행 수수료와 광고비는 추가 선택 시에만 발생합니다. 기타 문의: 담당자 ${o.manager} · <a href="tel:${o.phone.replace(/-/g, '')}">${o.phone}</a> · <a href="mailto:${o.email}">${o.email}</a></p>
  </section>
</main>
<footer class="footer" data-site-shell="footer" aria-label="에코디비즈 사업자 정보 및 정책">
  <p><strong>EKODIBIZ</strong> · ${o.name} · 대표 ${o.representative} · 사업자등록번호 ${o.businessRegistrationNumber}<br>${o.address} · <a href="mailto:${o.email}">${o.email}</a></p>
  <nav aria-label="에코디비즈 푸터 메뉴"><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a><a href="/ekodibiz/refund">환불정책</a><a href="/">EKODI</a></nav>
</footer>
<script>(function(){
  var PRICING=${JSON.stringify(P)};
  var AUDIENCES=${JSON.stringify(HOMEPAGE_AUDIENCES)};
  var estimate=${estimateHomepageSubscription.toString()};
  function $(id){return document.getElementById(id);}
  function v(id){return ($(id).value||'').trim();}
  function won(n){return Number(n).toLocaleString('ko-KR')+'원';}
  function audience(){var selected=document.querySelector('[name=audience]:checked');return AUDIENCES.find(function(a){return a.id===(selected&&selected.value);})||AUDIENCES[0];}
  [].slice.call(document.querySelectorAll('[name=audience]')).forEach(function(input){input.addEventListener('change',function(){$('audienceGuide').textContent=audience().guide+' 모든 유형에서 기본형 월 9,900원으로 시작할 수 있습니다.';});});
  function tabset(list){list.forEach(function(t,i){t.addEventListener('click',function(){pick(list,t);});t.addEventListener('keydown',function(e){var k=e.key,j=k==='ArrowRight'?i+1:k==='ArrowLeft'?i-1:k==='Home'?0:k==='End'?list.length-1:null;if(j===null)return;e.preventDefault();var n=list[(j+list.length)%list.length];pick(list,n);n.focus();});});}
  function pick(list,t){list.forEach(function(x){var on=x===t;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;$(x.getAttribute('aria-controls')).hidden=!on;});}
  var pageTabs=[].slice.call(document.querySelectorAll('#pageTabs [role=tab]'));
  var typeTabs=[].slice.call(document.querySelectorAll('.type-tabs [role=tab]'));
  tabset(pageTabs);tabset(typeTabs);
  function openPage(panelId){var t=pageTabs.find(function(x){return x.getAttribute('aria-controls')===panelId;});if(t){pick(pageTabs,t);$('pageTabs').scrollIntoView({behavior:'smooth'});}}
  [].slice.call(document.querySelectorAll('[data-goto]')).forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();openPage(a.getAttribute('data-goto'));});});
  if(location.hash==='#plans')openPage('plansPanel');else if(location.hash==='#types')openPage('typesPanel');else if(location.hash==='#discount')openPage('rulesPanel');
  function setPlan(id){$('plan').value=id;[].slice.call(document.querySelectorAll('[name=planChoice]')).forEach(function(r){r.checked=r.value===id;});[].slice.call(document.querySelectorAll('.plan-info')).forEach(function(d){d.hidden=d.getAttribute('data-plan')!==id;});}
  [].slice.call(document.querySelectorAll('[name=planChoice]')).forEach(function(r){r.addEventListener('change',function(){setPlan(r.value);update();});});
  function sel(){return{plan:v('plan'),pages:v('pages'),social:v('social'),lang:v('lang'),booking:$('booking').checked,payment:$('payment').checked,logo:$('logo').checked,photo:$('photo').checked,member:v('member')==='y',nonprofit:$('nonprofit').checked,contract:v('contract')};}
  var last=null;
  function update(){var inc=PRICING.plans[v('plan')].includes;
    ['booking','payment'].forEach(function(k){var input=$(k);if(input.disabled&&!inc[k])input.checked=false;input.disabled=inc[k];if(inc[k])input.checked=true;});
    var e=estimate(PRICING,sel());last=e;
    $('calcMonthlyLabel').textContent=e.contract==='annual'?'월 환산 약':'월 예상 구독료';
    $('calcMonthly').textContent=won(e.monthly);
    $('calcSub').textContent=PRICING.plans[e.plan].name+' · '+(e.contract==='annual'?'연납 '+won(e.yearly):'연간 '+won(e.yearly))+' · 제작비 '+won(e.setup)+' · 첫 결제 예상 '+won(e.firstPayment);
    $('calcLines').innerHTML=e.lines.map(function(l){return '<li>'+l.label+': 월 '+won(l.amount)+'</li>';}).join('');
    $('calcNote').textContent=(e.discountRate?'할인 '+Math.round(e.discountRate*100)+'% 적용 · ':'')+(e.contract==='annual'?'연납 12개월 선납 · 2개월 할인 · ':'월 단위 이용 · ')+'부가세 포함 · 할인 금액은 100원 단위 반올림 · 연납 월 환산은 1원 단위 반올림';
  }
  ['pages','social','lang','booking','payment','logo','photo','member','nonprofit','contract'].forEach(function(id){$(id).addEventListener('input',update);$(id).addEventListener('change',update);});
  [].slice.call(document.querySelectorAll('[data-preset]')).forEach(function(b){b.addEventListener('click',function(){var p=JSON.parse(b.getAttribute('data-preset'));
    $('type').value=p.type;setPlan(p.plan);$('pages').value=0;$('social').value=p.social||0;$('lang').value=0;
    ['booking','payment','logo','photo'].forEach(function(k){$(k).disabled=false;$(k).checked=!!p[k];});$('nonprofit').checked=!!p.nonprofit;update();openPage('apply');});});
  setPlan('S1');$('plan').value='S1';update();
  var f=$('hpForm'),s=$('status'),d=$('done'),btns=[$('send'),$('subscribe')];
  f.addEventListener('submit',async function(e){e.preventDefault();s.className='status';
    var mode=(e.submitter&&e.submitter.getAttribute('data-mode'))||'consult',sub=mode==='subscribe';
    if(!v('business')||!v('email')){s.className='status error';s.textContent='* 표시 항목을 모두 입력해 주세요.';return;}
    if(sub&&!v('phone')){s.className='status error';s.textContent='바로 구독 신청은 결제 안내를 위해 전화번호가 필요합니다.';$('phone').focus();return;}
    if(v('phone')&&!/^[0-9+\\-\\s()]{8,20}$/.test(v('phone'))){s.className='status error';s.textContent='연락처를 확인해 주세요.';return;}
    if(!$('consent').checked){s.className='status error';s.textContent='개인정보 수집·이용에 동의해 주세요.';return;}
    if(sub&&!$('terms').checked){s.className='status error';s.textContent='바로 구독 신청은 요금제·이용 기준 확인에 체크해 주세요.';return;}
    update();var c=last;btns.forEach(function(x){x.disabled=true;});s.textContent='신청서를 보내고 있습니다.';
    var cm={'12':'월납 (기존 선택값)',annual:'연납 · 12개월 선납',monthly:'월납 · 최소 약정기간 없음'}[c.contract];
    var head=sub?'[홈페이지 바로 구독 신청]':'[홈페이지 구독 상담 신청]';
    var msg=[head,'신청 방식: '+(sub?'바로 구독 신청 (요금·이용기준 확인 동의)':'상담 신청'),'이용 유형: '+audience().name,'이름·기관·단체명: '+v('business'),'담당자: '+v('name'),'연락처: '+v('phone'),'이메일: '+v('email'),'업종·유형: '+(v('type')||'-'),'현재 홈페이지·SNS: '+(v('current')||'-'),'상인회 회원: '+$('member').options[$('member').selectedIndex].text,'비영리: '+($('nonprofit').checked?'예':'아니오'),'-',
      '[선택 구성 · 예상 금액(부가세 포함)]'].concat(c.lines.map(function(l){return '- '+l.label+': 월 '+won(l.amount);}),[$('logo').checked?'- 로고 디자인(1회)':'',$('photo').checked?'- 사진 촬영(1회)':'','납부 방식: '+cm+(c.discountRate?' · 할인 '+Math.round(c.discountRate*100)+'%':''),'월 예상 구독료: '+won(c.monthly),'제작비: '+won(c.setup),'첫 결제 예상: '+won(c.firstPayment),'-','개인정보 동의: 예','요청사항: '+(v('message')||'-')]).filter(function(x){return x!=='';}).join('\\n');
    try{var r=await fetch('/mail/api/contact',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({name:v('name')||v('business'),email:v('email'),subject:(sub?'홈페이지 바로 구독 신청 · ':'홈페이지 구독 상담 신청 · ')+v('business')+' · 월 '+won(c.monthly),message:msg,website:v('website'),site:'ekodibiz',source:'${EKODIBIZ_HOMEPAGE_CONTACT_SOURCE}',sourceUrl:location.href})});
      var data=await r.json().catch(function(){return{};});if(!r.ok)throw new Error(data.error||'신청서 전송에 실패했습니다.');
      $('doneTitle').textContent=sub?'구독 신청이 정상 접수되었습니다.':'신청이 정상 접수되었습니다.';
      $('doneText').textContent=sub?'선택하신 '+PRICING.plans[c.plan].name+' (월 '+won(c.monthly)+')으로 개설을 준비합니다. 1영업일 이내 첫 결제 안내를 이메일·문자로 보내드립니다.':'담당자가 1영업일 이내 연락드리겠습니다.';
      f.style.display='none';d.style.display='block';d.scrollIntoView({behavior:'smooth',block:'center'});
    }catch(err){s.className='status error';s.textContent=(err&&err.message||'신청서 전송에 실패했습니다.')+' 계속 안 되면 ${o.phone} 로 연락 주세요.';btns.forEach(function(x){x.disabled=false;});}
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


