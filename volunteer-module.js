// Shared EKODI Volunteer module. Campaigns may belong to distinct tenant workspaces.
const CAMPAIGNS=Object.freeze({
  '2026-coal-delivery':Object.freeze({
    slug:'2026-coal-delivery',workspace:'ekodimission',key:'261205-coal-delivery',
    title:'제12회 사랑의 연탄 배달',category:'연탄 나눔 · 지역 봉사',
    date:'2026년 12월 5일(토) 오전 10시',deadline:'2026년 11월 27일(금) 낮 12시',
    venue:'목포 서산초등학교 후문 버스 정류장',capacity:50,
    unitPrice:1300,bank:'농협 351-1185-2874-13',accountHolder:'토끼와거북',
    host:'목포국제기독학교, (사)Hearts&Hands, 에코디선교회, 믿음회, 목포크리스찬아카데미, 목포평강교회, 목포장로교회, 목포충현교회, 목포예찬교회',
    organizer:'토끼와거북',contact:'061-274-1007 / 010-6603-8877',
    summary:'이웃의 겨울을 따뜻하게 하는 연탄 배달에 함께해 주세요. 직접 봉사하거나 연탄을 후원할 수 있습니다.'
  })
});
export const volunteerCampaigns=CAMPAIGNS;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeJson=(respond,value,status=200)=>respond({ok:status<400,...value},status);
const page=(title,body,robots='index,follow')=>
'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="'+robots+'"><link rel="stylesheet" href="/volunteer/assets/volunteer.css"><title>'+escapeHtml(title)+' | 에코디 봉사</title><meta name="description" content="에코디 봉사 · 현장 참여와 나눔을 연결하는 온라인 봉사 신청"></head><body><a class="skip" href="#main" data-v-i18n="skip">본문으로 건너뛰기</a><header class="site-top"><a class="logo" href="/volunteer"><span class="symbol">E</span><span><strong data-v-i18n="brand">에코디 봉사</strong><small>EKODI VOLUNTEER</small></span></a><nav><a href="/volunteer" data-v-i18n="navActivities">활동 찾기</a><a href="/volunteer/admin" data-v-i18n="navAdmin">활동 관리</a><a href="/" data-v-i18n="navEkodi">에코디</a></nav></header><main id="main">'+body+'</main><footer class="site-bottom"><strong data-v-i18n="brand">에코디 봉사</strong><span data-v-i18n="footer">나눔을 약속으로 끝내지 않고, 이웃의 삶으로 연결합니다.</span><a href="/privacy" data-v-i18n="privacyLink">개인정보처리방침</a></footer><script src="/volunteer/assets/volunteer.js" defer></script></body></html>';
const VOLUNTEER_MAIN_IMAGE='https://d2ol7oe51mr4n9.cloudfront.net/user_3IgFYuI0BG12rOdEtYmFORAqXKR/1d0668d9-71d5-4fd7-8cbe-02a7e0a2e8a3.png';
const COAL_MAIN_IMAGE='https://d2ol7oe51mr4n9.cloudfront.net/user_3IgFYuI0BG12rOdEtYmFORAqXKR/b92a8103-0ca0-427e-aa18-c2ba667c711c.png';
const COAL_ORIGINAL_FLYER='https://d2ol7oe51mr4n9.cloudfront.net/user_3IgFYuI0BG12rOdEtYmFORAqXKR/0e814c8e-34ca-4768-b1c0-66c3f6a61a53.jpg';
/* Source copy transcribed from the original 2026-12-05 12th coal-delivery flyer.
   Keep its testimony, scripture references, history, supporters and application
   information intact; presentation can change without rewriting the source. */
const COAL_SOURCE=Object.freeze({
 title:'12회 사랑의 연탄 배달',
 timing:'2026년12월5일(토) 오전 10시, 봉사시간 인정',
 lead:'지역교회와 목포국제기독학교, 기독시민단체, 선교단체와 함께 12회 사랑의 연탄배달을 합니다.',
 faith:'하나님께서는 죄 없는 유일한 아들 예수님을 이 땅에 보내시고 우리의 죄를 대신하여 십자가 죽으심과 부활을 믿는 우리에게 죽음과 사망에서 구원하여 생명을 주셨습니다. 주는 것이 받는 것보다 복이 있다(행20:35), 가난한 자를 불쌍히 여기는 것은 여호와께 꾸어 드리는 것이니 그의 선행을 그에게 갚아 주시리라(잠19:17) 자기의 재물을 가난한 사람들에게 아낌없이 나누어 주었으니, 그의 의로움은 영원히 남을 것이며(시112:9) 라는 말씀대로 순종하는 삶이 복된 인생입니다.',
 history:'작년에 55명의 초중고, 대학청년, 학부모, 목회자, 외국인 유학생들이 참석한 가운데 310만원 연탄 기부금을 모아 연탄, 난방 보일러기름, 다문화 유학생, 우크라이나 아동, 장애형제를 지원하였습니다. 금년에도 유달동 주민센터의 추천을 받아 사랑의 연탄배달과 난방 보일러 등 사랑의 나눔을 하게 되어 기쁘고 기대 됩니다.',
 children:'연탄 한 장 친구들이 돼지 저금통과 용돈을 모아 연탄을 구입하고 추운 날씨에도 이마에 땀방울을 흘리면서 참여하는데 “삶으로 가르치는 것만이 남는다”는 말처럼 자녀들에게 살아있는 교육과 더불어 살아가는 아름다운 추억을 만들 것입니다. 건강하고 좋은 추억을 먹고 자란 우리 자녀가 건강하게 자라나며 이웃을 섬기는 멋진 친구들이 됩니다. 함께해요.',
 registration:'선착순 50명(11월27일 낮 12시까지 신청서, 전화, 문자, 구글폼으로 신청)',
 support:'연탄(1장 1,300원), 보일러등유 오십만원',
 commitment:'연탄 기부도 하고 기쁜 마음과 몸으로 사랑의 봉사를 신청합니다.'
});
function homePage(){
  const c=CAMPAIGNS['2026-coal-delivery'],route='/volunteer/activities/'+encodeURIComponent(c.slug);
  const other=Object.values(CAMPAIGNS).filter(item=>item.slug!==c.slug);
  const more=other.length?'<section class="wrap volunteer-other"><h2>다른 봉사활동</h2><div class="campaign-grid">'+other.map(a=>'<article class="campaign"><h3>'+escapeHtml(a.title)+'</h3><p>'+escapeHtml(a.date)+'</p><a class="cta" href="/volunteer/activities/'+encodeURIComponent(a.slug)+'">신청하기</a></article>').join('')+'</div></section>':'';
  const brand='<a class="volunteer-brand-banner" href="#volunteer-activities" aria-label="에코디 봉사활동 보기"><img src="'+VOLUNTEER_MAIN_IMAGE+'" width="1672" height="481" alt="에코디 봉사 - 함께하는 봉사, 더 따뜻한 지역사회" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer"></a>';
  const event='<a class="volunteer-coal-banner" href="'+route+'" aria-label="제12회 사랑의 연탄 배달 신청서 열기"><img src="'+COAL_MAIN_IMAGE+'" width="1672" height="448" alt="제12회 사랑의 연탄 배달 - 2026년 12월 5일 오전 10시" loading="eager" decoding="async" referrerpolicy="no-referrer"></a>';
  const action='<div class="volunteer-brief"><span>'+escapeHtml(c.date)+' · '+escapeHtml(c.deadline)+' 마감</span><a class="cta volunteer-primary" href="'+route+'">봉사·후원 신청하기</a></div>';
  const original='<details class="volunteer-original"><summary>신청 안내문 원본 보기</summary><a href="'+COAL_ORIGINAL_FLYER+'" target="_blank" rel="noopener noreferrer" aria-label="연탄 봉사 신청 안내문 원본 크게 보기"><img src="'+COAL_ORIGINAL_FLYER+'" width="992" height="1403" alt="제12회 사랑의 연탄 배달 원본 행사 안내문과 신청서" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a></details>';
  return page('봉사활동','<section class="wrap volunteer-main"><h1 class="visually-hidden">에코디 봉사</h1>'+brand+'<div id="volunteer-activities" class="volunteer-activity-feature">'+event+action+original+'</div></section>'+more);
}
function detailPage(c){
 const t=(key,korean)=>'<span data-v-i18n="'+key+'">'+korean+'</span>';
 const fields='<div class="field-grid"><label>'+t('name','이름')+' <span class="required">*</span><input name="name" maxlength="80" autocomplete="name" required data-v-placeholder="namePlaceholder" placeholder="이름을 입력하세요"></label><label>'+t('phone','연락처')+' <span class="required">*</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40" required placeholder="010-0000-0000"></label><label>'+t('affiliation','소속(선택)')+'<input name="affiliation" maxlength="120" data-v-placeholder="affiliationPlaceholder" placeholder="교회·학교·단체 또는 개인"></label><label>'+t('participationMode','참여 형태')+' <span class="required">*</span><select name="mode" required><option value="volunteer" data-v-i18n="volunteerOnly">직접 봉사</option><option value="pledge" data-v-i18n="donationOnly">연탄 후원</option><option value="both" data-v-i18n="both">봉사와 후원 모두</option></select></label></div>';
 const volunteer='<div class="choice" data-volunteer-party><label>'+t('partySize','봉사 참여 인원 (본인 포함)')+'<input name="partySize" type="number" min="1" max="20" step="1" value="1" required></label><p data-v-i18n="capacityNotice">참여 정원 50명입니다. 초과 접수 시 대기자로 등록될 수 있습니다.</p></div>';
 const pledge='<div class="choice" data-volunteer-pledge hidden><label>'+t('bricks','후원할 연탄 수량 (장)')+'<input name="bricks" type="number" min="1" max="10000" step="1" value="10" disabled></label><p><strong data-pledge-total>13,000원</strong> · '+t('perBriquette','연탄 1장 1,300원')+'</p><p data-v-i18n="donationPayment">후원 신청만으로 입금이 완료되지는 않습니다. 아래 계좌로 별도 이체해 주세요.</p></div>';
 const consent='<label class="check"><input name="privacyConsent" type="checkbox" required><span><strong data-v-i18n="privacyHeading">개인정보 수집·이용에 동의합니다. *</strong> <span data-v-i18n="privacyDetails">수집 항목: 이름·연락처·선택한 소속·신청 내용. 목적: 행사 신청 확인, 현장 안내, 후원 약정 및 연락. 행사 운영과 확인에 필요한 기간만 이용하며, 삭제 등 문의는 행사 연락처로 요청할 수 있습니다.</span></span></label><label class="check"><input name="photoConsent" type="checkbox"><span data-v-i18n="photoConsent">활동 사진·영상 촬영 및 게시에 동의합니다. (선택, 거부해도 신청 가능)</span></label>';
 const form='<form id="volunteer-form" data-volunteer-form data-campaign="'+escapeHtml(c.slug)+'" novalidate><h2 data-v-i18n="formTitle">온라인 신청서</h2><p class="subtle" data-v-i18n="guestNote">로그인하지 않아도 신청할 수 있습니다. 필수 정보만 입력해 주세요.</p><div class="honeypot" aria-hidden="true"><label>홈페이지<input name="website" tabindex="-1" autocomplete="off"></label></div>'+fields+volunteer+pledge+'<label class="note-label">'+t('note','전달할 말씀 (선택)')+'<textarea name="note" maxlength="500" rows="3" data-v-placeholder="notePlaceholder" placeholder="현장 도움이 필요하거나 주최 측에 알릴 사항"></textarea></label>'+consent+'<button class="cta apply" type="submit" data-v-i18n="submit">신청 접수하기</button><p role="status" aria-live="polite" class="form-status" data-status tabindex="-1"></p></form>';
 const info='<aside class="sidecard"><p class="eyebrow">EVENT INFORMATION</p><h2 data-v-i18n="activityInfo">활동 안내</h2><dl><div><dt data-v-i18n="dateLabel">일시</dt><dd data-v-i18n="eventDate">'+escapeHtml(c.date)+'</dd></div><div><dt data-v-i18n="venueLabel">모임 장소</dt><dd data-v-i18n="venue">'+escapeHtml(c.venue)+'</dd></div><div><dt data-v-i18n="deadlineLabel">신청 마감</dt><dd data-v-i18n="deadline">'+escapeHtml(c.deadline)+'</dd></div><div><dt data-v-i18n="capacityLabel">참가 정원</dt><dd>'+c.capacity+'<span data-v-i18n="peopleUnit">명</span></dd></div><div><dt data-v-i18n="organizerLabel">주관</dt><dd data-v-i18n="organizer">'+escapeHtml(c.organizer)+'</dd></div><div><dt data-v-i18n="contactLabel">연락처</dt><dd>'+escapeHtml(c.contact)+'</dd></div></dl><p class="volunteer-side-footnote" data-v-i18n="sourceRegistration">'+escapeHtml(COAL_SOURCE.registration)+'</p><hr><h3 data-v-i18n="donationInfo">연탄 후원 안내</h3><p class="volunteer-source-support" data-v-i18n="sourceSupport">'+escapeHtml(COAL_SOURCE.support)+'</p><p data-v-i18n="priceEach">연탄 1장 '+c.unitPrice.toLocaleString('ko-KR')+'원</p><p class="bank">'+escapeHtml(c.bank)+'</p><p data-v-i18n="accountHolder">예금주: '+escapeHtml(c.accountHolder)+'</p><p class="subtle" data-v-i18n="bankCaveat">은행 이체는 별도로 진행합니다. 입금 여부는 담당자가 확인합니다.</p><a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(c.venue)+'" target="_blank" rel="noopener noreferrer" data-v-i18n="mapLink">모임 장소 지도 보기</a></aside>';
 const storyline='<section class="wrap volunteer-story" aria-labelledby="volunteer-story-heading">'+
  '<div class="volunteer-story-lead"><p class="eyebrow" data-v-i18n="storyEyebrow">사랑의 연탄배달</p><h2 id="volunteer-story-heading" data-v-i18n="storyHeading">'+escapeHtml(COAL_SOURCE.title)+'</h2>'+
  '<p class="volunteer-story-first" data-v-i18n="storyLead">'+escapeHtml(COAL_SOURCE.lead)+'</p>'+
  '<p class="volunteer-story-commitment" data-v-i18n="storyCommitment">'+escapeHtml(COAL_SOURCE.commitment)+'</p></div>'+
  '<details class="volunteer-story-detail"><summary data-v-i18n="storyExpand">함께 나누는 믿음과 지난해의 이야기 읽기</summary>'+
  '<div class="volunteer-story-copy"><h3 data-v-i18n="storyFaithTitle">말씀을 따라 나누는 삶</h3>'+
  '<p data-v-i18n="storyFaith">'+escapeHtml(COAL_SOURCE.faith)+'</p>'+
  '<h3 data-v-i18n="storyHistoryTitle">지난해의 나눔과 올해의 소망</h3>'+
  '<p data-v-i18n="storyHistory">'+escapeHtml(COAL_SOURCE.history)+'</p>'+
  '<h3 data-v-i18n="storyChildrenTitle">아이들과 함께하는 살아 있는 교육</h3>'+
  '<p data-v-i18n="storyChildren">'+escapeHtml(COAL_SOURCE.children)+'</p></div></details>'+
  '<details class="volunteer-story-detail volunteer-source-original"><summary data-v-i18n="storyOriginal">원본 안내문과 신청서 보기</summary>'+
  '<a href="'+COAL_ORIGINAL_FLYER+'" rel="noopener noreferrer" target="_blank" aria-label="원본 안내문 확대 보기">'+
  '<img src="'+COAL_ORIGINAL_FLYER+'" width="992" height="1403" loading="lazy" decoding="async" alt="12회 사랑의 연탄 배달: 원본 행사 사진, 안내문, 신청서"></a></details>'+
  '</section>';
 const quick='<div class="volunteer-event-quick"><p class="volunteer-service" data-v-i18n="sourceTiming">'+escapeHtml(COAL_SOURCE.timing)+'</p>'+
  '<p class="volunteer-application-deadline" data-v-i18n="sourceRegistration">'+escapeHtml(COAL_SOURCE.registration)+'</p>'+
  '<div class="volunteer-event-actions"><a class="cta" data-v-apply-mode="volunteer" data-v-i18n="applyVolunteer" href="#volunteer-form">봉사 참여 신청</a>'+
  '<a class="outline" data-v-apply-mode="pledge" data-v-i18n="applyDonation" href="#volunteer-form">연탄 후원 신청</a></div></div>';
 const hero='<section class="wrap volunteer-event-head"><div class="volunteer-detail-toolbar"><a class="back" href="/volunteer" data-v-i18n="back">← 봉사활동 목록</a><div class="volunteer-language" role="group" aria-label="Language / 언어"><button type="button" data-v-lang="ko" aria-pressed="true">한국어</button><button type="button" data-v-lang="en" aria-pressed="false">English</button></div><a class="outline volunteer-admin-link" href="/volunteer/admin" data-v-i18n="adminLink">관리자 페이지</a></div><h1 class="visually-hidden" data-v-i18n="eventTitle">'+escapeHtml(c.title)+'</h1><a class="volunteer-coal-banner" href="#volunteer-form" data-v-aria="bannerToForm" aria-label="봉사·후원 신청서로 이동"><img src="'+COAL_MAIN_IMAGE+'" width="1672" height="448" alt="'+escapeHtml(c.title)+' - '+escapeHtml(c.date)+'" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer"></a>'+quick+'<div class="volunteer-event-bar"><span data-registration-state data-v-i18n="checking">실시간 접수 확인 중</span><a class="cta" data-v-i18n="startApplication" href="#volunteer-form">신청서 작성하기</a></div></section>';
 return page(c.title,hero+storyline+'<section class="wrap two-col"><div>'+form+'</div>'+info+'</section><section class="wrap caveat"><h2 data-v-i18n="safetyTitle">참여 전 확인사항</h2><p data-v-i18n="safetyNote">행사 당일 안전 안내에 따라 이동하고, 추운 날씨에 대비해 따뜻한 옷과 장갑을 준비해 주세요. 행사 시간은 오전 10시 모임 기준이며 종료 시각은 현장 안내를 따릅니다.</p><p>'+t('partnerLabel','주최:')+' <span data-v-i18n="partners">'+escapeHtml(c.host)+'</span></p><p data-v-i18n="organizerFooter">주관: 토끼와거북</p></section>');
}
function adminPage(){
 const header='<section class="wrap volunteer-admin-head"><div class="volunteer-admin-heading"><a class="back" href="/volunteer/activities/2026-coal-delivery">← 연탄봉사 신청페이지</a><span class="eyebrow">OPERATOR</span></div><h1>연탄봉사 신청·후원 관리</h1><p>봉사 신청자와 연탄 후원 약정은 별도로 접수·관리됩니다. 개인정보는 권한 있는 운영진만 확인할 수 있습니다.</p></section>';
 const summary='<div class="volunteer-admin-summary" aria-label="활동 신청 현황"><div><small>봉사 신청</small><strong data-volunteer-count>—</strong><span>건</span></div><div><small>참여 인원</small><strong data-people-count>—</strong><span>명</span></div><div><small>후원 약정</small><strong data-pledge-count>—</strong><span>건</span></div></div>';
 const applicants='<section class="volunteer-admin-section" data-applicant-section><div class="volunteer-admin-section-title"><h2>봉사 신청자 명단</h2><span data-volunteer-subcount></span></div><div class="table-scroll"><table><thead><tr><th>신청자</th><th>연락처</th><th>인원</th><th>상태</th><th>신청 일시</th></tr></thead><tbody data-volunteer-rows></tbody></table></div></section>';
 const donors='<section class="volunteer-admin-section" data-pledge-section><div class="volunteer-admin-section-title"><h2>연탄 후원 약정</h2><span data-pledge-subcount></span></div><div class="table-scroll"><table><thead><tr><th>이름</th><th>후원 장수</th><th>약정액</th><th>상태</th><th>입금 확인</th></tr></thead><tbody data-pledge-rows></tbody></table></div></section>';
 const body=header+'<section class="wrap volunteer-admin-body" data-volunteer-admin><p role="status" aria-live="polite" data-admin-status>관리자 인증을 확인하고 있습니다.</p><a data-admin-login class="cta" href="/auth/?site=space&return_to=https%3A%2F%2Fekodi.kr%2Fvolunteer%2Fadmin" hidden>관리자 로그인</a><div data-admin-table hidden>'+summary+'<button type="button" class="outline" data-admin-refresh>명단 새로고침</button>'+applicants+donors+'<p class="subtle">이름·전화번호 등 개인정보는 외부에 공유하거나 공개 게시하지 마세요.</p></div></section>';
 return page('봉사 신청·후원 관리',body,'noindex,nofollow,noarchive');
}
function isAvailable(c){return c&&typeof c==='object';}
async function rpc(env,name,args,token=''){
 if(env.DATA_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return {ok:false,status:503};
 try{
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json','cache-control':'no-store'};
  if(token)headers.authorization=token;
  const r=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/'+encodeURIComponent(name),{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
  const data=await r.json().catch(()=>null);
  return {ok:r.ok,status:r.status,data};
 }catch{return {ok:false,status:503}}
}
export async function routeVolunteer(request,env,{json,withHeaders}){
 const u=new URL(request.url),p=u.pathname.replace(/\/+$/,'')||'/';
 const send=(obj,status=200)=>safeJson((data,code)=>json(env,data,code),obj,status);
 if(p==='/volunteer/assets/volunteer.css'||p==='/volunteer/assets/volunteer.js'){
  if(!['GET','HEAD'].includes(request.method))return send({error:'method_not_allowed'},405);
  const target=new URL(request.url);target.pathname=p.endsWith('.css')?'/volunteer.css':'/volunteer.js';target.search='';
  const response=await env.ASSETS.fetch(new Request(target.toString(),request));
  return withHeaders(env,response,'volunteer-asset');
 }
 const match=p.match(/^\/volunteer\/activities\/([a-z0-9-]{3,80})$/);
 if(['GET','HEAD'].includes(request.method)&&(p==='/volunteer'||p==='/volunteer/admin'||match)){
  const content=p==='/volunteer'?homePage():p==='/volunteer/admin'?adminPage():isAvailable(CAMPAIGNS[match[1]])?detailPage(CAMPAIGNS[match[1]]):null;
  if(!content)return withHeaders(env,new Response('Not Found',{status:404}),'volunteer-not-found');
  const response=withHeaders(env,new Response(request.method==='HEAD'?null:content,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}),'volunteer-public');
  if(p==='/volunteer/admin')response.headers.set('x-robots-tag','noindex, nofollow, noarchive');
  return response;
 }
 const api=p.match(/^\/volunteer\/api\/campaigns\/([a-z0-9-]{3,80})\/(status|apply)$/);
 if(api){
  const c=CAMPAIGNS[api[1]];
  if(!c)return send({error:'not_found'},404);
  if(api[2]==='status'){
   if(request.method!=='GET')return send({error:'method_not_allowed'},405);
   const result=await rpc(env,'volunteer_campaign_public_status',{p_workspace_slug:c.workspace,p_activity_key:c.key});
   if(!result.ok||!result.data?.ok)return send({error:'status_unavailable',message:'접수 상태를 확인할 수 없습니다.'},503);
   return send({campaign:c.slug,...result.data});
  }
  if(request.method!=='POST')return send({error:'method_not_allowed'},405);
  const origin=request.headers.get('origin')||'';
  if(origin&&origin!=='https://ekodi.kr')return send({error:'origin_not_allowed'},403);
  if(Number(request.headers.get('content-length')||0)>10000)return send({error:'payload_too_large'},413);
  const data=await request.json().catch(()=>null);
  if(!data||typeof data!=='object')return send({error:'invalid_json'},400);
  if(String(data.website||'').trim())return send({error:'submission_rejected'},400);
  const mode=String(data.mode||'');
  const name=String(data.name||'').trim(),phone=String(data.phone||'').trim();
  const affiliation=String(data.affiliation||'').trim(),note=String(data.note||'').trim();
  const partySize=Number(data.partySize||0),bricks=Number(data.bricks||0);
  if(!['volunteer','pledge','both'].includes(mode)||!name||name.length>80||!/^(\+?[0-9][0-9\- ]{7,39})$/.test(phone)||affiliation.length>120||note.length>500||!Number.isInteger(partySize)||!Number.isInteger(bricks)||bricks<0||bricks>10000||(mode!=='pledge'&&(partySize<1||partySize>20))||(mode==='pledge'&&partySize!==0)||(mode==='volunteer'&&bricks!==0)||(mode!=='volunteer'&&bricks<1)||data.privacyConsent!==true)return send({error:'invalid_application',message:'필수 항목과 개인정보 동의를 확인해 주세요.'},400);
  const saved=await rpc(env,'volunteer_submit_application',{p_workspace_slug:c.workspace,p_activity_key:c.key,p_mode:mode,p_name:name,p_phone:phone,p_party_size:partySize,p_bricks:bricks,p_affiliation:affiliation,p_privacy_consent:true,p_photo_consent:data.photoConsent===true,p_note:note});
  if(!saved.ok){
   const detail=String(saved.data?.message||'');
   if(/APPLICATION_CLOSED|VOLUNTEER_DEADLINE_PASSED/.test(detail))return send({error:'application_closed',message:'신청 기한이 종료되었습니다.'},409);
   if(/CONTACT_IDENTITY_CONFLICT/.test(detail))return send({error:'contact_conflict',message:'연락처 등록 정보를 확인해 주세요. 담당자에게 문의해 주세요.'},409);
   return send({error:'application_unavailable',message:'신청 저장을 확인할 수 없습니다. 담당자에게 문의해 주세요.'},503);
  }
  if(!saved.data?.ok||!saved.data?.receipt_id)return send({error:'persistence_unverified',message:'신청 저장을 확인하지 못했습니다.'},503);
  return send({receiptId:saved.data.receipt_id,participationStatus:saved.data.participation_status||'',pledgeStatus:saved.data.pledge_status||'',message:'신청이 접수되었습니다.'});
 }
 if(p==='/volunteer/api/admin/pledges'||p==='/volunteer/api/admin/registrations'){
  if(request.method!=='POST')return send({error:'method_not_allowed'},405);
  const origin=request.headers.get('origin')||'';
  if(origin&&origin!=='https://ekodi.kr')return send({error:'origin_not_allowed'},403);
  const token=String(request.headers.get('authorization')||'');
  if(!/^Bearer \S{20,}$/i.test(token))return send({error:'authentication_required'},401);
  const data=await request.json().catch(()=>null);
  const c=CAMPAIGNS[String(data?.campaign||'')];
  if(!c)return send({error:'not_found'},404);
  const action=String(data?.action||'');
  const roster=p==='/volunteer/api/admin/registrations';
  const result=roster&&action==='list'
   ?await rpc(env,'volunteer_admin_registration_snapshot',{p_workspace_slug:c.workspace,p_activity_key:c.key},token)
   :!roster&&action==='list'
    ?await rpc(env,'volunteer_pledge_admin_snapshot',{p_workspace_slug:c.workspace,p_activity_key:c.key},token)
    :!roster&&action==='confirm'&&/^[0-9a-f-]{36}$/i.test(String(data?.pledgeId||''))
     ?await rpc(env,'volunteer_pledge_admin_confirm',{p_pledge_id:String(data.pledgeId)},token)
     :null;
  if(!result)return send({error:'invalid_action'},400);
  if(!result.ok)return send({error:result.status===403?'forbidden':'admin_unavailable'},result.status===401?401:result.status===403?403:503);
  return send(result.data&&typeof result.data==='object'?result.data:{result:result.data});
 }
 return withHeaders(env,new Response('Not Found',{status:404}),'volunteer-not-found');
}
