// EKODIBIZ 홈페이지 구독 서비스 — 화면 탭(신청·요금제·업종별 기능·이용 기준) + 단계형 신청(유형→요금제 설명→결제·추가→상담/바로 구독)
// Canonical public page: https://ekodi.kr/homepage , 관리자: https://ekodi.kr/homepage/admin
// 기존 신청·자동 개설 RPC를 재사용하고 공통 문의 API로 담당자에게 제안·후속 업무를 알린다.
// 예상 구독료 계산은 estimateHomepageSubscription() 하나만 정본으로 쓰고, 같은 함수 원문을 브라우저에 그대로 싣는다.
import { buildHomepageSalesPlan } from './homepage-sales-automation.js';
export const EKODIBIZ_HOMEPAGE_SERVICE_PATH = '/homepage';
export const EKODIBIZ_HOMEPAGE_SERVICE_URL = 'https://ekodi.kr/homepage';
export const EKODIBIZ_HOMEPAGE_ADMIN_PATH = '/homepage/admin';
export const EKODIBIZ_HOMEPAGE_SERVICE_VERSION = 'v0.6-2026-11-22';
export const EKODIBIZ_HOMEPAGE_CONTACT_SOURCE = 'ekodibiz-homepage-subscription';
export const EKODIBIZ_HOMEPAGE_SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const EKODIBIZ_HOMEPAGE_SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';

// 기능별 실제 제공 상태 (코드 검토 2026-11-21). auto=신청 즉시 자동, setup=개설 후 담당자가 기존 에코디 기능으로 설정,
// planned=준비 중 — 제공 전에는 해당 기능 금액을 청구하지 않는다.
export const FEATURE_STATUS = Object.freeze({
  auto: { label: '자동 개설', note: '바로 구독 신청 즉시 사이트 주소가 만들어지고, 공개 승인 후 바로 열립니다.' },
  setup: { label: '개설 후 설정', note: '공개 후 2영업일 안에 담당자가 에코디 기능으로 연결해 드립니다.' },
  planned: { label: '준비 중', note: '준비 중인 기능은 제공 전까지 해당 금액을 청구하지 않습니다.' },
});
export function featureStatus(text = '') {
  const t = String(text).trim().replace(/^S\d \+ /, '');
  if (/리뷰 모음|온라인 주문·결제|회원·포인트|POS/.test(t)) return 'planned';
  if (/^소개 1페이지|^모바일 최적화|^보안\(SSL\)·호스팅|^방문통계|SEO\/AEO|직접 올리기|^사진 \d+장/.test(t)) return 'auto';
  return 'setup';
}

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
      scope: '소개 1페이지(글·사진·활동 또는 서비스·전화·지도·외부 링크), 대표 이미지·사진 6장 직접 올리기, 모바일 최적화, 보안(SSL)·호스팅, 방문통계, 월 1회 수정' },
    S2: { id: 'S2', name: 'S2 소식형', setup: 0, monthly: 19900, includes: { booking: false, social: 0, lang: 0, payment: false },
      scope: '5~7페이지(메뉴/서비스·갤러리·소식·오시는 길), 사진 20장·게시판(소식)·일정표 직접 올리기, 네이버·구글 검색 등록, 기본 SEO/AEO, 문의폼, 월 3회 수정' },
    S3: { id: 'S3', name: 'S3 운영형', setup: 0, monthly: 29900, includes: { booking: true, social: 1, lang: 0, payment: false },
      scope: 'S2 + 사진 50장, 예약/견적 신청·휴대폰 알림, 리뷰 모음, 소식글 AI 초안 월 4건, 소셜 자동게시 1채널, 월간 성과 리포트, 월 5회 기본 수정' },
    S4: { id: 'S4', name: 'S4 확장형', setup: 0, monthly: 49900, includes: { booking: true, social: 1, lang: 1, payment: true },
      scope: 'S3 + 사진 100장, 온라인 주문·결제, 회원·포인트, POS·예약 시스템 연동, 다국어 1개, 전담 관리' },
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

// 사용자 안내·신청·내 홈페이지 관리: /homepage  ·  꼭 필요한 관리자 기능: /homepage/admin
// 예전 /ekodibiz/homepage 계열 주소는 완전히 폐지했다(리디렉션 없음).
export function isEkodiBizHomepageServicePath(pathname = '') {
  return /^\/homepage\/?$/i.test(String(pathname || ''));
}
export function isEkodiBizHomepageAdminPath(pathname = '') {
  return /^\/homepage\/admin\/?$/i.test(String(pathname || ''));
}
export function ekodiBizHomepageRoute(request, url) {
  if (!['GET', 'HEAD'].includes(request.method)) return null;
  const head = request.method === 'HEAD';
  if (isEkodiBizHomepageServicePath(url.pathname)) return ekodiBizHomepageServiceResponse({ head });
  if (isEkodiBizHomepageAdminPath(url.pathname)) return ekodiBizHomepageAdminResponse({ head });
  return null;
}

// 사용자 페이지와 관리자 페이지가 함께 쓰는 로그인·권한 도우미(브라우저용). 권한은 DB 함수가 다시 확인한다.
const SALES_CLIENT = `var hpSalesBuild=${buildHomepageSalesPlan.toString()},hpSalesEstimate=${estimateHomepageSubscription.toString()},hpSalesPricing=${JSON.stringify(HOMEPAGE_PRICING)},hpSalesAudiences=${JSON.stringify(HOMEPAGE_AUDIENCES)};
function hpSales(r){return hpSalesBuild(r,hpSalesPricing,hpSalesAudiences,hpSalesEstimate);}
function hpSalesPanel(r){var p=hpSales(r);return '<details class="hp-sales"><summary>'+hpEsc(p.nextAction)+(p.overdue?' · 접수 기준 기한 경과':'')+'</summary><p class="note">접수 기록으로 만든 영업 초안입니다. 실제 연락·결제 여부는 별도 확인합니다. 추가 옵션은 접수 원문을 확인해 주세요.</p><p>첫 답변 기준일: '+(p.dueAt?hpEsc(new Date(p.dueAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})):'해당 없음')+'</p><label>유형별 제안문<textarea readonly rows="10" aria-label="유형별 제안문">'+hpEsc(p.draft)+'</textarea></label><button type="button" class="ghost" data-hp-copy>제안문 복사</button>'+(p.needsResponse?'<label>후속 안내 초안<textarea readonly rows="4" aria-label="후속 안내 초안">'+hpEsc(p.followupDraft)+'</textarea></label><ul>'+p.tasks.map(function(t){return '<li>'+hpEsc(t.label)+(t.dueAt?' · '+hpEsc(new Date(t.dueAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})):'')+'</li>';}).join('')+'</ul>':'')+'<p class="note" data-copy-status role="status"></p></details>';}
function hpBindSales(root){root.addEventListener('click',async function(e){var b=e.target.closest('[data-hp-copy]');if(!b)return;var d=b.closest('.hp-sales'),t=d.querySelector('textarea'),st=d.querySelector('[data-copy-status]');try{await navigator.clipboard.writeText(t.value);st.textContent='제안문을 복사했습니다.';}catch(err){t.focus();t.select();st.textContent='제안문을 선택했습니다. 복사해 주세요.';}});}`;
const CLIENT_HELPERS = SALES_CLIENT + `var SB='https://renzehysxirjilvdxacv.supabase.co',SBK='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_',SKEY='sb-renzehysxirjilvdxacv-auth-token';
function hpEsc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function hpSession(){try{var d=JSON.parse(localStorage.getItem(SKEY)||'null');return d&&d.access_token?d:null;}catch(e){return null;}}
async function hpToken(){var s=hpSession();if(!s)return '';var now=Math.floor(Date.now()/1000);if(Number(s.expires_at||0)>now+60)return s.access_token;if(!s.refresh_token)return '';
  var r=await fetch(SB+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SBK,'content-type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
  var d=await r.json().catch(function(){return null;});if(!r.ok||!d||!d.access_token)return '';
  try{localStorage.setItem(SKEY,JSON.stringify(Object.assign({},s,d,{expires_at:d.expires_at||now+Number(d.expires_in||3600)})));}catch(e){}return d.access_token;}
async function hpRpc(name,body){var t=await hpToken();if(!t){var e=new Error('login_required');e.code='login_required';throw e;}
  var r=await fetch(SB+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SBK,authorization:'Bearer '+t,'content-type':'application/json'},cache:'no-store',body:JSON.stringify(body||{})});
  var d=await r.json().catch(function(){return {};});if(!r.ok)throw new Error(d.message||('요청 실패 ('+r.status+')'));
  if(d&&d.ok===false){var x=new Error({forbidden:'권한이 없습니다.',not_found:'대상을 찾을 수 없습니다.',invalid_phone:'전화번호를 확인해 주세요.',login_required:'로그인이 필요합니다.',plan_limit:'현재 요금제에서 쓸 수 없거나 한도를 넘었습니다.',invalid_date:'날짜를 확인해 주세요.',title_required:'제목을 입력해 주세요.',too_many:'더 이상 추가할 수 없습니다.',invalid_path:'사진 경로가 올바르지 않습니다.'}[d.error]||d.error);x.code=d.error;throw x;}return d;}
function hpLogin(back){return 'https://ekodi.kr/auth/?return_to='+encodeURIComponent(back);}
var HP_STATUS={received:'상담 접수',provisioned:'개설됨·공개 대기',published:'공개 중',cancelled:'취소'};
var HP_AUD={personal:'개인',business:'매장·기업',institution:'기관·학교',community:'단체',organization:'조직',event:'행사·프로젝트'};
function hpWon(n){return n==null?'-':Number(n).toLocaleString('ko-KR')+'원';}
async function hpPublish(slug,value){if(!window.confirm(value?slug+' 홈페이지를 공개할까요? 첫 결제를 확인한 뒤 공개해 주세요.':slug+' 홈페이지를 비공개로 전환할까요?'))return false;await hpRpc('homepage_subscription_publish',{p_slug:slug,p_published:value});return true;}
function hpAdminRow(r){var url=r.site_slug?'https://ekodi.kr/'+encodeURIComponent(r.site_slug):'';
  var btn=r.site_slug?(r.published?'<button type="button" class="ghost" data-hp-publish="'+hpEsc(r.site_slug)+'" data-hp-value="false">비공개로 전환</button>':'<button type="button" class="primary" data-hp-publish="'+hpEsc(r.site_slug)+'" data-hp-value="true">공개</button>'):'';
  return '<article class="hp-row'+(r.published?' is-pub':(r.site_slug?' is-wait':''))+'"><div><strong>'+hpEsc(r.display_name)+'</strong><p class="note">'+(r.mode==='subscribe'?'바로 구독':'상담')+' · '+hpEsc(HP_STATUS[r.status]||r.status)+' · '+hpEsc(HP_AUD[r.audience]||r.audience)+' · '+hpEsc(r.plan)+' · 월 '+hpWon(r.monthly_estimate)+' · '+hpEsc(r.email||'')+(r.phone?' · '+hpEsc(r.phone):'')+'</p></div><div class="hp-side">'+(url?'<a href="'+hpEsc(url)+'" target="_blank" rel="noopener">'+hpEsc(r.site_slug)+'</a>':'')+btn+'</div>'+hpSalesPanel(r)+'</article>';}
function hpBindPublish(root,after){root.addEventListener('click',async function(e){var b=e.target.closest('[data-hp-publish]');if(!b)return;b.disabled=true;try{if(await hpPublish(b.getAttribute('data-hp-publish'),b.getAttribute('data-hp-value')==='true'))await after();else b.disabled=false;}catch(err){b.disabled=false;alert('처리하지 못했습니다: '+err.message);}});}`;

const SHARED_ROW_CSS = `.hp-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid var(--line);border-left:4px solid var(--line);border-radius:12px;padding:10px 14px;background:var(--card);margin-bottom:8px}.hp-row.is-wait{border-left-color:#d99a2b}.hp-row.is-pub{border-left-color:#1f9d6b}.hp-row p{margin:.2rem 0 0}.hp-sales{grid-column:1/-1;border-top:1px solid var(--line);padding-top:10px}.hp-sales summary{cursor:pointer;font-weight:700;min-height:44px}.hp-sales button{min-height:44px;padding:8px 14px;font:inherit;cursor:pointer}.hp-sales textarea{display:block;width:100%;max-width:100%;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);padding:10px;font:inherit;font-size:14px;line-height:1.6}.hp-sales label{display:block;margin:10px 0}.hp-side{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.hp-side button,.mine-card button{min-height:40px;padding:6px 14px;border-radius:999px;font:inherit;font-weight:800;cursor:pointer}.primary{background:var(--accent);color:#fff;border:0}.ghost{background:transparent;color:var(--accent);border:2px solid var(--accent)}
@media(max-width:640px){.hp-row{grid-template-columns:1fr}.hp-side{justify-content:flex-start}}`;

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
      <ul class="feat status-list">${t.features.map((f) => { const k = featureStatus(f); return `<li><span class="st st-${k}">${FEATURE_STATUS[k].label}</span> ${esc(f)}</li>`; }).join('')}</ul>
      <p class="rec">추천 구성: <strong>${esc(est.lines.map((l) => l.label).join(' + '))}</strong>${t.preset.logo ? ' + 로고(1회)' : ''}${t.preset.nonprofit ? ' · 비영리 할인' : ''}<br>예상 월 구독료 <strong class="big">${won(est.monthly)}</strong> · 제작비 ${won(est.setup)}</p>
      <p class="note">유의: ${esc(t.caution)}</p>
      <button type="button" class="ghost" data-preset="${esc(JSON.stringify({ type: t.name, ...t.preset }))}">이 구성으로 계산·신청하기</button>
    </div>`;
  }).join('');
  const planOptions = plans.map((p) => `<option value="${p.id}">${esc(p.name)} (월 ${won(p.monthly)})</option>`).join('');
  const audienceCards = HOMEPAGE_AUDIENCES.map((a, i) => `<label class="audience-choice"><input type="radio" name="audience" value="${a.id}"${i === 0 ? ' checked' : ''}><span><strong>${esc(a.name)}</strong><small>${esc(a.examples)}</small></span></label>`).join('');
  const planFor = { S1: '개인·소개 한 페이지로 충분한 분', S2: '소식·사진을 꾸준히 올리고 검색에 노출하려는 곳', S3: '예약·견적을 받고 홍보까지 맡기려는 곳', S4: '온라인 주문·결제와 회원 관리가 필요한 곳' };
  const planCards = plans.map((p, i) => `<label class="plan-choice"><input type="radio" name="planChoice" value="${p.id}"${i === 0 ? ' checked' : ''}><span><strong>${esc(p.name)}</strong><b>월 ${won(p.monthly)}</b><small>${esc(planFor[p.id])}</small></span></label>`).join('');
  const planDetails = plans.map((p, i) => `<div class="plan-info" data-plan="${p.id}"${i === 0 ? '' : ' hidden'}><h4>${esc(p.name)} · 월 ${won(p.monthly)} <small>(제작비 ${won(p.setup)} · 부가세 포함)</small></h4><p>${esc(planFor[p.id])}에게 맞습니다.</p><ul class="feat status-list">${p.scope.split(/,\s*/).map((f) => { const k = featureStatus(f); return `<li><span class="st st-${k}">${FEATURE_STATUS[k].label}</span> ${esc(f)}</li>`; }).join('')}</ul></div>`).join('');
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
    .st{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:800;margin-right:4px;vertical-align:1px}.st-auto{background:#1f6b4f;color:#fff}.st-setup{background:#e7eefb;color:#21437a}.st-planned{background:#f6ecd9;color:#7a4b06}.status-list{columns:1;list-style:none;padding-left:0}.status-list li{margin:.25rem 0}.legend{line-height:2}
    ${SHARED_ROW_CSS}
    .mine-card{border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:12px;background:var(--card);display:grid;gap:8px}.mine-card h3{margin:0}.mine-card form{display:grid;gap:8px}.admin-box{border:2px dashed var(--accent);border-radius:14px;padding:12px 14px;margin-top:14px}.mgr-box summary{font-weight:800;cursor:pointer;min-height:40px;display:flex;align-items:center}.mgr h4{margin:.9rem 0 .3rem}.thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}.thumbs figure{margin:0;display:grid;gap:4px}.thumbs img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px}.thumbs button{min-height:32px;padding:2px 8px;font-size:12px}.file{display:inline-flex;gap:8px;align-items:center;font-weight:700;margin:.4rem 0}.file input{min-height:auto;border:0;padding:0}.mgr .item{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--line)}.mgr .item button{min-height:30px;padding:2px 10px;font-size:12px}.mgr form{display:grid;gap:6px;margin-bottom:8px}
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
    <a href="/homepage" aria-current="page">홈페이지 구독</a>
    <a href="#apply">구독 신청</a>
    <a href="#mine" data-goto="minePanel">내 홈페이지</a>
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
    <button type="button" role="tab" id="ptab-mine" aria-controls="minePanel" aria-selected="false" tabindex="-1">내 홈페이지</button>
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
        <p class="note legend">${Object.entries(FEATURE_STATUS).map(([k, v]) => `<span class="st st-${k}">${v.label}</span> ${esc(v.note)}`).join('<br>')}</p>
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
      <details class="step"><summary>내 유형에 맞는 이용 제안 미리 보기</summary><pre id="salesPreview" style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:14px"></pre></details>
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
      <p class="note">상담 신청: 담당자가 1영업일 이내 연락드립니다. 바로 구독 신청: 신청 즉시 홈페이지 주소(ekodi.kr/hp-…)가 자동으로 만들어지고, 첫 결제 안내를 이메일·문자로 보내드립니다. 첫 결제 확인 후 공개됩니다. 결제 전까지 요금은 청구되지 않습니다.</p>
      <div id="status" class="status" role="status" aria-live="polite"></div>
    </form>
    <div id="done" class="done" role="status"><strong id="doneTitle">신청이 정상 접수되었습니다.</strong><p id="doneText">담당자가 1영업일 이내 연락드리겠습니다.</p><details><summary>신청 구성 이용 제안</summary><pre id="doneProposal" style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit"></pre></details><p>기타 문의: 담당자 ${o.manager} · ${o.phone} · <a href="mailto:${o.email}">${o.email}</a></p></div>
  </section>

  <section id="plansPanel" class="page-panel" role="tabpanel" aria-labelledby="ptab-plans" hidden>
    <h2 id="plans">기본 요금제 <span class="note">(제작비 0원 · 월납 · 부가세 포함)</span></h2>
    <div class="table-wrap"><table><thead><tr><th>요금제</th><th>기능·개발 범위</th><th>제작비</th><th>월 구독료</th></tr></thead><tbody>${planRows}
      <tr><th scope="row">맞춤 개발</th><td data-label="기능·개발 범위">요금제 밖 전용 기능(외부 시스템 연동 등)</td><td class="num" data-label="제작비">견적</td><td class="num" data-label="월 구독료">기능별 유지비</td></tr></tbody></table></div>
    <p class="note legend">${Object.entries(FEATURE_STATUS).map(([k, v]) => `<span class="st st-${k}">${v.label}</span> ${esc(v.note)}`).join('<br>')}<br>기능별 제공 상태는 구독 신청 탭의 요금제 설명과 업종별 기능 탭에 표시됩니다.</p>
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

  <section id="minePanel" class="page-panel" role="tabpanel" aria-labelledby="ptab-mine" hidden>
    <h2 id="mine">내 홈페이지</h2>
    <p>신청할 때 쓴 이메일 계정으로 로그인하면 신청 상태를 보고, 홈페이지 내용(제목·소개·연락처·주소·시간·링크)을 직접 고칠 수 있습니다. 관리자 계정이면 공개 대기 목록도 함께 보입니다.</p>
    <div id="mineBody" aria-live="polite"><p class="note">이 탭을 열면 내 신청을 불러옵니다.</p></div>
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
  var salesBuild=${buildHomepageSalesPlan.toString()};
  function $(id){return document.getElementById(id);}
  function v(id){return ($(id).value||'').trim();}
  function won(n){return Number(n).toLocaleString('ko-KR')+'원';}
  function audience(){var selected=document.querySelector('[name=audience]:checked');return AUDIENCES.find(function(a){return a.id===(selected&&selected.value);})||AUDIENCES[0];}
  [].slice.call(document.querySelectorAll('[name=audience]')).forEach(function(input){input.addEventListener('change',function(){$('audienceGuide').textContent=audience().guide+' 모든 유형에서 기본형 월 9,900원으로 시작할 수 있습니다.';update();});});
  function tabset(list){list.forEach(function(t,i){t.addEventListener('click',function(){pick(list,t);});t.addEventListener('keydown',function(e){var k=e.key,j=k==='ArrowRight'?i+1:k==='ArrowLeft'?i-1:k==='Home'?0:k==='End'?list.length-1:null;if(j===null)return;e.preventDefault();var n=list[(j+list.length)%list.length];pick(list,n);n.focus();});});}
  function pick(list,t){list.forEach(function(x){var on=x===t;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;$(x.getAttribute('aria-controls')).hidden=!on;});}
  var pageTabs=[].slice.call(document.querySelectorAll('#pageTabs [role=tab]'));
  var typeTabs=[].slice.call(document.querySelectorAll('.type-tabs [role=tab]'));
  tabset(pageTabs);tabset(typeTabs);
  function openPage(panelId){var t=pageTabs.find(function(x){return x.getAttribute('aria-controls')===panelId;});if(t){pick(pageTabs,t);$('pageTabs').scrollIntoView({behavior:'smooth'});}}
  [].slice.call(document.querySelectorAll('[data-goto]')).forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();openPage(a.getAttribute('data-goto'));});});
  if(location.hash==='#plans')openPage('plansPanel');else if(location.hash==='#types')openPage('typesPanel');else if(location.hash==='#discount')openPage('rulesPanel');else if(location.hash==='#mine')openPage('minePanel');
  function setPlan(id){$('plan').value=id;[].slice.call(document.querySelectorAll('[name=planChoice]')).forEach(function(r){r.checked=r.value===id;});[].slice.call(document.querySelectorAll('.plan-info')).forEach(function(d){d.hidden=d.getAttribute('data-plan')!==id;});}
  [].slice.call(document.querySelectorAll('[name=planChoice]')).forEach(function(r){r.addEventListener('change',function(){setPlan(r.value);update();});});
  function sel(){return{plan:v('plan'),pages:v('pages'),social:v('social'),lang:v('lang'),booking:$('booking').checked,payment:$('payment').checked,logo:$('logo').checked,photo:$('photo').checked,member:v('member')==='y',nonprofit:$('nonprofit').checked,contract:v('contract')};}
  var last=null;
  function update(){var inc=PRICING.plans[v('plan')].includes;
    ['booking','payment'].forEach(function(k){var input=$(k);if(input.disabled&&!inc[k])input.checked=false;input.disabled=inc[k];if(inc[k])input.checked=true;});
    var e=estimate(PRICING,sel());last=e;
    $('salesPreview').textContent=salesBuild({display_name:v('business'),audience:audience().id,plan:e.plan,contract:e.contract,options:sel()},PRICING,AUDIENCES,estimate).draft;
    $('calcMonthlyLabel').textContent=e.contract==='annual'?'월 환산 약':'월 예상 구독료';
    $('calcMonthly').textContent=won(e.monthly);
    $('calcSub').textContent=PRICING.plans[e.plan].name+' · '+(e.contract==='annual'?'연납 '+won(e.yearly):'연간 '+won(e.yearly))+' · 제작비 '+won(e.setup)+' · 첫 결제 예상 '+won(e.firstPayment);
    $('calcLines').innerHTML=e.lines.map(function(l){return '<li>'+l.label+': 월 '+won(l.amount)+'</li>';}).join('');
    $('calcNote').textContent=(e.discountRate?'할인 '+Math.round(e.discountRate*100)+'% 적용 · ':'')+(e.contract==='annual'?'연납 12개월 선납 · 2개월 할인 · ':'월 단위 이용 · ')+'부가세 포함 · 할인 금액은 100원 단위 반올림 · 연납 월 환산은 1원 단위 반올림';
  }
  ['business','pages','social','lang','booking','payment','logo','photo','member','nonprofit','contract'].forEach(function(id){$(id).addEventListener('input',update);$(id).addEventListener('change',update);});
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
    var prov=null;
    try{var pr=await fetch('${EKODIBIZ_HOMEPAGE_SUPABASE_URL}/rest/v1/rpc/homepage_subscription_submit',{method:'POST',headers:{apikey:'${EKODIBIZ_HOMEPAGE_SUPABASE_KEY}','content-type':'application/json'},cache:'no-store',body:JSON.stringify({p:{mode:mode,audience:audience().id,plan:c.plan,contract:c.contract,monthly_estimate:c.monthly,display_name:v('business'),email:v('email'),phone:v('phone'),contact_name:v('name'),message:v('message'),consent:$('consent').checked,terms:$('terms').checked,website:v('website'),options:{pages:v('pages'),social:v('social'),lang:v('lang'),booking:$('booking').checked,payment:$('payment').checked,logo:$('logo').checked,photo:$('photo').checked,member:v('member'),nonprofit:$('nonprofit').checked,type:v('type'),current:v('current')}}})});
      prov=await pr.json().catch(function(){return null;});
    }catch(err){prov=null;}
    if(prov&&prov.ok===false){var em={rate_limited:'같은 이메일로 오늘 신청이 많습니다. 내일 다시 시도하거나 전화로 문의해 주세요.',busy:'신청이 많아 잠시 후 다시 시도해 주세요.',phone_required:'바로 구독 신청은 전화번호가 필요합니다.',terms_required:'요금제·이용 기준 확인에 체크해 주세요.',consent_required:'개인정보 수집·이용에 동의해 주세요.',invalid_email:'이메일 주소를 확인해 주세요.',invalid_phone:'연락처를 확인해 주세요.'};s.className='status error';s.textContent=em[prov.error]||'신청 처리에 실패했습니다. ${o.phone} 로 연락 주세요.';btns.forEach(function(x){x.disabled=false;});return;}
    if(prov&&prov.site_url)msg+='\\n-\\n자동 개설 주소(공개 승인 전): '+prov.site_url+'\\n요청 ID: '+prov.request_id;else if(prov&&prov.request_id)msg+='\\n-\\n요청 ID: '+prov.request_id;else msg+='\\n-\\n자동 접수 기록 실패: 수동 확인 필요';
    try{var r=await fetch('/mail/api/contact',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({name:v('name')||v('business'),email:v('email'),subject:(sub?'홈페이지 바로 구독 신청 · ':'홈페이지 구독 상담 신청 · ')+v('business')+' · 월 '+won(c.monthly),message:msg,website:v('website'),site:'ekodibiz',source:'${EKODIBIZ_HOMEPAGE_CONTACT_SOURCE}',sourceUrl:location.href,homepageSales:{display_name:v('business'),audience:audience().id,plan:c.plan,contract:c.contract,options:sel()}})});
      var data=await r.json().catch(function(){return{};});if(!r.ok)throw new Error(data.error||'신청서 전송에 실패했습니다.');
      $('doneProposal').textContent=$('salesPreview').textContent;
      $('doneTitle').textContent=sub?'구독 신청이 정상 접수되었습니다.':'신청이 정상 접수되었습니다.';
      $('doneText').textContent=sub?(prov&&prov.site_url?'홈페이지 주소가 자동으로 만들어졌습니다: '+prov.site_url+' — 첫 결제 확인 후 공개됩니다. ':'')+'선택하신 '+PRICING.plans[c.plan].name+' (월 '+won(c.monthly)+') 기준으로 1영업일 이내 첫 결제 안내를 이메일·문자로 보내드립니다.':'담당자가 1영업일 이내 연락드리겠습니다.';
      f.style.display='none';d.style.display='block';d.scrollIntoView({behavior:'smooth',block:'center'});
    }catch(err){if(prov&&prov.ok&&prov.request_id){$('doneTitle').textContent='신청이 저장되었습니다.';$('doneText').textContent='접수번호: '+prov.request_id+' · 담당자 알림 전달이 지연되고 있습니다. 관리자는 저장된 신청을 확인할 수 있습니다. 중복 신청 없이 기다려 주세요.';$('doneProposal').textContent=$('salesPreview').textContent;f.style.display='none';d.style.display='block';d.scrollIntoView({behavior:'smooth',block:'center'});}else{s.className='status error';s.textContent=(err&&err.message||'신청서 전송에 실패했습니다.')+' 계속 안 되면 ${o.phone} 로 연락 주세요.';btns.forEach(function(x){x.disabled=false;});}}
  });
})();</script>
<script>(function(){
  ${CLIENT_HELPERS}
  var box=document.getElementById('mineBody'),loaded=false;
  function linesToLinks(t){return String(t||'').split('\\n').map(function(l){var i=l.indexOf('|');return i<0?null:{label:l.slice(0,i).trim(),url:l.slice(i+1).trim()};}).filter(function(x){return x&&x.label&&x.url;});}
  function linksToLines(a){return (Array.isArray(a)?a:[]).map(function(x){return x.label+' | '+x.url;}).join('\\n');}
  function card(r){var h='<article class="mine-card"><h3>'+hpEsc(r.display_name)+'</h3><p class="note">'+(r.mode==='subscribe'?'바로 구독':'상담')+' · '+hpEsc(HP_STATUS[r.status]||r.status)+' · '+hpEsc(r.plan)+' · 월 '+hpWon(r.monthly_estimate)+'</p>';
    if(r.site_slug){h+='<p>홈페이지 주소: <a href="https://ekodi.kr/'+hpEsc(r.site_slug)+'" target="_blank" rel="noopener">ekodi.kr/'+hpEsc(r.site_slug)+'</a> '+(r.published?'(공개 중)':'(공개 대기 — 첫 결제 확인 후 공개)')+'</p>'+
      '<form data-slug="'+hpEsc(r.site_slug)+'"><label>제목 <input name="headline" maxlength="120" value="'+hpEsc(r.headline||'')+'"></label><label>소개 <textarea name="intro" maxlength="1200">'+hpEsc(r.intro||'')+'</textarea></label>'+
      '<div class="row"><label>전화 <input name="phone" maxlength="20" inputmode="tel" value="'+hpEsc(r.phone||'')+'"></label><label>주소·장소 <input name="address" maxlength="200" value="'+hpEsc(r.address||'')+'"></label></div>'+
      '<label>운영시간·일정 <input name="hours" maxlength="200" value="'+hpEsc(r.hours||'')+'"></label><label>링크 (한 줄에 하나: 이름 | https://주소) <textarea name="links" placeholder="인스타그램 | https://instagram.com/...">'+hpEsc(linksToLines(r.links))+'</textarea></label>'+
      '<button type="submit" class="primary">저장</button><span class="status" role="status"></span></form>'+
      '<details class="mgr-box" open><summary>사진 · 게시판 · 일정표</summary><div class="mgr" data-mgr="'+hpEsc(r.site_slug)+'"><p class="note">불러오는 중입니다.</p></div></details>';}
    else h+='<p class="note">상담 신청입니다. 담당자가 연락드린 뒤 바로 구독으로 전환하면 홈페이지 주소가 만들어집니다.</p>';
    return h+'</article>';}
  var MEDIA=SB+'/storage/v1/object/public/homepage-media/';
  function mediaUrl(p){return MEDIA+String(p).split('/').map(encodeURIComponent).join('/');}
  async function shrink(file){var img=await createImageBitmap(file);var k=Math.min(1,1600/Math.max(img.width,img.height));var c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return await new Promise(function(res){c.toBlob(res,'image/jpeg',0.85);});}
  async function storageCall(method,name,blob){var t=await hpToken();if(!t){var e=new Error('로그인이 필요합니다.');e.code='login_required';throw e;}
    var r=await fetch(SB+'/storage/v1/object/homepage-media/'+name,{method:method,headers:Object.assign({apikey:SBK,authorization:'Bearer '+t},blob?{'content-type':'image/jpeg','x-upsert':'false'}:{}),body:blob||undefined});
    if(!r.ok&&method!=='DELETE')throw new Error('사진 저장에 실패했습니다 ('+r.status+')');}
  var PLAN_NOTE='S2 이상 요금제에서 사용할 수 있습니다.';
  function renderMgr(el,d){var L=d.limits||{},media=d.media||[],hero=media.filter(function(m){return m.kind==='hero';})[0],gal=media.filter(function(m){return m.kind==='gallery';});
    var h='<h4>대표 이미지</h4>'+(hero?'<div class="thumbs"><figure><img src="'+hpEsc(mediaUrl(hero.path))+'" alt=""><button type="button" class="ghost" data-del-media="'+hpEsc(hero.id)+'">삭제</button></figure></div>':'<p class="note">아직 없습니다. 홈페이지 맨 위에 크게 보입니다.</p>')+
      '<label class="file">'+(hero?'대표 이미지 바꾸기':'대표 이미지 올리기')+' <input type="file" accept="image/*" data-up="hero"></label>';
    h+='<h4>갤러리 <span class="note">('+gal.length+' / '+(L.gallery||0)+'장)</span></h4><div class="thumbs">'+gal.map(function(m){return '<figure><img src="'+hpEsc(mediaUrl(m.path))+'" alt="" loading="lazy"><button type="button" class="ghost" data-del-media="'+hpEsc(m.id)+'">삭제</button></figure>';}).join('')+'</div>'+
      (gal.length<(L.gallery||0)?'<label class="file">사진 추가 (여러 장 가능) <input type="file" accept="image/*" multiple data-up="gallery"></label>':'<p class="note">현재 요금제의 갤러리 한도('+(L.gallery||0)+'장)를 모두 사용했습니다.</p>');
    h+='<h4>게시판(소식)</h4>'+(L.board?'<form data-post><input name="title" maxlength="120" placeholder="제목" required><textarea name="body" maxlength="5000" placeholder="내용"></textarea><button type="submit" class="primary">소식 올리기</button></form>'+(d.posts||[]).map(function(p){return '<div class="item"><b>'+hpEsc(p.title)+'</b> <span class="note">'+hpEsc(String(p.created_at||'').slice(0,10))+'</span> <button type="button" class="ghost" data-del-post="'+hpEsc(p.id)+'">삭제</button></div>';}).join(''):'<p class="note">'+PLAN_NOTE+'</p>');
    h+='<h4>일정표</h4>'+(L.schedule?'<form data-event><div class="row"><input name="event_date" type="date" required><input name="event_time" maxlength="40" placeholder="시간 (예: 오전 10시)"></div><input name="title" maxlength="120" placeholder="일정 이름" required><input name="place" maxlength="120" placeholder="장소"><button type="submit" class="primary">일정 추가</button></form>'+(d.events||[]).map(function(e){return '<div class="item"><b>'+hpEsc(e.event_date)+'</b> '+hpEsc(e.event_time||'')+' '+hpEsc(e.title)+(e.place?' · '+hpEsc(e.place):'')+' <button type="button" class="ghost" data-del-event="'+hpEsc(e.id)+'">삭제</button></div>';}).join(''):'<p class="note">'+PLAN_NOTE+'</p>');
    el.innerHTML=h+'<p class="status" role="status"></p>';}
  async function loadMgr(slug){var el=box.querySelector('[data-mgr="'+slug+'"]');if(!el)return;try{renderMgr(el,await hpRpc('homepage_site_manage',{p_slug:slug}));}catch(e){el.innerHTML='<p class="status error">'+hpEsc(e.message)+'</p>';}}
  function mgrOf(t){var el=t.closest('[data-mgr]');return el?{el:el,slug:el.getAttribute('data-mgr'),st:el.querySelector('.status')}:null;}
  function say(m,txt,ok){if(m&&m.st){m.st.className='status '+(ok?'ok':'error');m.st.textContent=txt;}}
  box.addEventListener('change',async function(e){var inp=e.target.closest('input[data-up]');if(!inp||!inp.files||!inp.files.length)return;var m=mgrOf(inp),kind=inp.getAttribute('data-up');inp.disabled=true;say(m,'사진을 올리는 중입니다.',true);
    try{for(var i=0;i<inp.files.length;i++){var name=m.slug+'/'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)+'.jpg';await storageCall('POST',name,await shrink(inp.files[i]));
        try{var r=await hpRpc('homepage_media_add',{p_slug:m.slug,p_kind:kind,p_path:name,p_caption:null});if(r.replaced_path)await storageCall('DELETE',r.replaced_path);}catch(err){await storageCall('DELETE',name);throw err;}}
      await loadMgr(m.slug);var nm=box.querySelector('[data-mgr="'+m.slug+'"]');if(nm)say({st:nm.querySelector('.status')},'저장했습니다.',true);}catch(err){say(m,err.message);inp.disabled=false;}});
  box.addEventListener('click',async function(e){var b=e.target.closest('[data-del-media],[data-del-post],[data-del-event]');if(!b)return;var m=mgrOf(b);if(!window.confirm('삭제할까요?'))return;b.disabled=true;
    try{if(b.hasAttribute('data-del-media')){var r=await hpRpc('homepage_media_delete',{p_id:b.getAttribute('data-del-media')});if(r.path)await storageCall('DELETE',r.path);}
      else if(b.hasAttribute('data-del-post'))await hpRpc('homepage_post_delete',{p_id:b.getAttribute('data-del-post')});
      else await hpRpc('homepage_event_delete',{p_id:b.getAttribute('data-del-event')});await loadMgr(m.slug);}catch(err){b.disabled=false;say(m,err.message);}});
  box.addEventListener('submit',async function(e){var f=e.target.closest('form[data-post],form[data-event]');if(!f)return;e.preventDefault();var m=mgrOf(f),btn=f.querySelector('button');btn.disabled=true;
    try{if(f.hasAttribute('data-post'))await hpRpc('homepage_post_save',{p_slug:m.slug,p_id:null,p_title:f.title.value,p_body:f.body.value});
      else await hpRpc('homepage_event_save',{p_slug:m.slug,p_id:null,p:{title:f.title.value,event_date:f.event_date.value,event_time:f.event_time.value,place:f.place.value}});await loadMgr(m.slug);}catch(err){btn.disabled=false;say(m,err.message);}});
  async function loadAdmin(){var w=document.getElementById('adminWaiting');try{var d=await hpRpc('homepage_subscription_admin_list',{p_limit:200});var rows=(d.requests||[]).filter(function(r){return r.site_slug&&!r.published;});w.innerHTML=rows.length?rows.map(hpAdminRow).join(''):'<p class="note">공개를 기다리는 홈페이지가 없습니다.</p>';}catch(e){w.innerHTML='<p class="status error">'+hpEsc(e.message)+'</p>';}}
  async function load(){box.innerHTML='<p class="note">불러오는 중입니다.</p>';
    try{var d=await hpRpc('homepage_my_requests',{});var h='<p class="note">로그인 계정: '+hpEsc(d.email)+'</p>';
      h+=(d.requests||[]).length?d.requests.map(card).join(''):'<p>이 계정으로 접수된 신청이 없습니다. 신청할 때 쓴 이메일 계정으로 로그인했는지 확인해 주세요.</p>';
      if(d.is_admin)h+='<section class="admin-box"><h3>관리자 · 공개 대기</h3><div id="adminWaiting"><p class="note">불러오는 중입니다.</p></div><p><a href="/homepage/admin">전체 신청 관리 →</a></p></section>';
      box.innerHTML=h;[].forEach.call(box.querySelectorAll('[data-mgr]'),function(el){loadMgr(el.getAttribute('data-mgr'));});if(d.is_admin){hpBindPublish(document.getElementById('adminWaiting'),loadAdmin);loadAdmin();}
    }catch(e){if(e.code==='login_required')box.innerHTML='<p>신청할 때 쓴 이메일 계정으로 로그인해 주세요.</p><a class="cta" href="'+hpLogin('https://ekodi.kr/homepage#mine')+'">로그인하고 내 홈페이지 관리</a>';else box.innerHTML='<p class="status error">불러오지 못했습니다: '+hpEsc(e.message)+'</p>';}}
  box.addEventListener('submit',async function(e){var f=e.target.closest('form[data-slug]');if(!f)return;e.preventDefault();var st=f.querySelector('.status'),b=f.querySelector('button');b.disabled=true;st.className='status';st.textContent='저장 중입니다.';
    try{await hpRpc('homepage_site_owner_update',{p_slug:f.getAttribute('data-slug'),p:{headline:f.headline.value,intro:f.intro.value,phone:f.phone.value,address:f.address.value,hours:f.hours.value,links:linesToLinks(f.links.value)}});st.className='status ok';st.textContent='저장했습니다. 공개 중인 홈페이지는 몇 분 안에 바뀝니다.';}
    catch(err){st.className='status error';st.textContent=err.message;}b.disabled=false;});
  function maybe(){if(!loaded&&!document.getElementById('minePanel').hidden){loaded=true;load();}}
  document.getElementById('ptab-mine').addEventListener('click',maybe);
  [].slice.call(document.querySelectorAll('[data-goto="minePanel"]')).forEach(function(a){a.addEventListener('click',function(){setTimeout(maybe,0);});});
  maybe();
})();</script>
</body>
</html>`;
}

export function ekodiBizHomepageAdminHtml() {
  const o = OPERATOR;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>홈페이지 구독 관리 | 에코디비즈</title>
  <meta name="robots" content="noindex,nofollow">
  <style>
    :root{color-scheme:light dark;--bg:#f7f7f3;--card:#fff;--text:#17211c;--muted:#59635d;--line:#dfe4df;--accent:#1f6b4f;--soft:#eef5f0}
    @media(prefers-color-scheme:dark){:root{--bg:#101512;--card:#18201b;--text:#edf4ef;--muted:#b0bbb4;--line:#344038;--accent:#8fd2ad;--soft:#202c25}}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;line-height:1.6}
    header,main,footer{width:min(1040px,calc(100% - 32px));margin:0 auto}header{display:flex;justify-content:space-between;align-items:center;min-height:60px;border-bottom:1px solid var(--line)}header a{color:var(--text);text-decoration:none;font-weight:800}
    main{padding:22px 0 60px}h1{margin:.2rem 0}.note{color:var(--muted);font-size:.9rem}a{color:var(--accent)}
    .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.cards div{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:10px 14px}.cards b{display:block;font-size:24px}
    .filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.filters button{min-height:38px;padding:4px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-weight:700;cursor:pointer}.filters button[aria-pressed=true]{background:var(--accent);color:#fff;border-color:var(--accent)}
    .status.error{color:#b3261e;font-weight:700}.cta{display:inline-flex;min-height:44px;align-items:center;padding:8px 18px;border-radius:999px;background:var(--accent);color:#fff;font-weight:800;text-decoration:none}
    ${SHARED_ROW_CSS}
    footer{padding:18px 0;border-top:1px solid var(--line);font-size:12px;color:var(--muted);text-align:center}
    @media(max-width:640px){.cards{grid-template-columns:1fr 1fr}}
  </style>
</head>
<body>
<header data-site-shell="header"><a href="/homepage">← 홈페이지 구독</a><span class="note">관리자</span></header>
<main data-ekodibiz-homepage-admin="${EKODIBIZ_HOMEPAGE_SERVICE_VERSION}">
  <h1>홈페이지 구독 관리</h1>
  <p class="note">일상적인 확인·내용 수정은 <a href="/homepage#mine">내 홈페이지</a> 탭에서 로그인 권한에 따라 처리합니다. 이 화면에서는 전체 신청과 자동 생성된 제안문·후속 업무를 확인하고 공개 여부를 관리합니다.</p>
  <div id="adminRoot" aria-live="polite"><p class="note">불러오는 중입니다.</p></div>
</main>
<footer data-site-shell="footer">EKODIBIZ · ${o.name} · 사업자등록번호 ${o.businessRegistrationNumber}</footer>
<script>(function(){
  ${CLIENT_HELPERS}
  var root=document.getElementById('adminRoot'),rows=[],filter='all';
  function render(){var w=rows.filter(function(r){return r.site_slug&&!r.published;}).length,p=rows.filter(function(r){return r.published;}).length,c=rows.filter(function(r){return r.mode==='consult';}).length;
    rows.sort(function(a,b){var x=hpSales(a),y=hpSales(b);return Number(y.needsResponse)-Number(x.needsResponse)||(Date.parse(x.dueAt)||Infinity)-(Date.parse(y.dueAt)||Infinity);});
    var shown=rows.filter(function(r){return (filter==='sales'&&hpSales(r).needsResponse)||filter==='all'||(filter==='waiting'&&r.site_slug&&!r.published)||(filter==='published'&&r.published)||(filter==='consult'&&r.mode==='consult');});
    root.innerHTML='<div class="cards"><div>전체<b>'+rows.length+'</b></div><div>공개 대기<b>'+w+'</b></div><div>공개 중<b>'+p+'</b></div><div>상담<b>'+c+'</b></div></div>'+
      '<div class="filters" role="group" aria-label="상태">'+[['sales','영업 대기'],['all','전체'],['waiting','공개 대기'],['published','공개 중'],['consult','상담']].map(function(f){return '<button type="button" data-f="'+f[0]+'" aria-pressed="'+(filter===f[0])+'">'+f[1]+'</button>';}).join('')+'</div>'+
      '<div id="adminList">'+(shown.length?shown.map(hpAdminRow).join(''):'<p class="note">해당하는 신청이 없습니다.</p>')+'</div>';}
  async function load(){try{var d=await hpRpc('homepage_subscription_admin_list',{p_limit:200});rows=d.requests||[];render();}
    catch(e){if(e.code==='login_required')root.innerHTML='<p>관리자 계정으로 로그인해 주세요.</p><a class="cta" href="'+hpLogin('https://ekodi.kr/homepage/admin')+'">로그인</a>';
      else if(e.code==='forbidden')root.innerHTML='<p class="status error">플랫폼 관리자 계정이 아닙니다.</p><p><a href="/homepage#mine">내 홈페이지로 이동</a></p>';
      else root.innerHTML='<p class="status error">불러오지 못했습니다: '+hpEsc(e.message)+'</p>';}}
  root.addEventListener('click',function(e){var b=e.target.closest('[data-f]');if(!b)return;filter=b.getAttribute('data-f');render();});
  hpBindPublish(root,load);hpBindSales(root);
  load();
})();</script>
</body>
</html>`;
}

export function ekodiBizHomepageAdminResponse({ head = false } = {}) {
  return new Response(head ? null : ekodiBizHomepageAdminHtml(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-robots-tag': 'noindex, nofollow',
      'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
      'x-ekodi-route': 'ekodibiz-homepage-admin',
    },
  });
}

export function ekodiBizHomepageServiceResponse({ head = false } = {}) {
  return new Response(head ? null : ekodiBizHomepageServiceHtml(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; img-src 'self' data: https:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
      'x-ekodi-route': 'ekodibiz-homepage-service',
    },
  });
}


