// Shared EKODI Volunteer module. Campaigns may belong to distinct tenant workspaces.
const CAMPAIGNS=Object.freeze({
  '2026-coal-delivery':Object.freeze({
    slug:'2026-coal-delivery',workspace:'ekodimission',key:'261205-coal-delivery',
    title:'제12회 사랑의 연탄 배달',category:'연탄 나눔 · 지역 봉사',
    date:'2026년 12월 5일(토) 오전 10시',deadline:'2026년 11월 27일(금) 낮 12시',
    venue:'목포 서산초등학교 후문 버스 정류장',capacity:50,
    unitPrice:1300,bank:'농협 351-1185-2874-13',accountHolder:'토끼와거북',
    host:'목포국제기독학교 · 전남기독신문사 · 에코디선교회 등 지역 협력단체',
    organizer:'토끼와거북',contact:'061-274-1007 / 010-6603-8877',
    summary:'이웃의 겨울을 따뜻하게 하는 연탄 배달에 함께해 주세요. 직접 봉사하거나 연탄을 후원할 수 있습니다.'
  })
});
export const volunteerCampaigns=CAMPAIGNS;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeJson=(respond,value,status=200)=>respond({ok:status<400,...value},status);
const page=(title,body,robots='index,follow')=>
'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="'+robots+'"><link rel="stylesheet" href="/volunteer/assets/volunteer.css"><title>'+escapeHtml(title)+' | 에코디 봉사</title><meta name="description" content="에코디 봉사 · 현장 참여와 나눔을 연결하는 온라인 봉사 신청"></head><body><a class="skip" href="#main">본문으로 건너뛰기</a><header class="site-top"><a class="logo" href="/volunteer"><span class="symbol">E</span><span><strong>에코디 봉사</strong><small>EKODI VOLUNTEER</small></span></a><nav><a href="/volunteer">활동 찾기</a><a href="/volunteer/admin">활동 관리</a><a href="/">에코디</a></nav></header><main id="main">'+body+'</main><footer class="site-bottom"><strong>에코디 봉사</strong><span>나눔을 약속으로 끝내지 않고, 이웃의 삶으로 연결합니다.</span><a href="/privacy">개인정보처리방침</a></footer><script src="/volunteer/assets/volunteer.js" defer></script></body></html>';
const VOLUNTEER_MAIN_IMAGE='https://d2ol7oe51mr4n9.cloudfront.net/user_3IgFYuI0BG12rOdEtYmFORAqXKR/1d0668d9-71d5-4fd7-8cbe-02a7e0a2e8a3.png';
const COAL_MAIN_IMAGE='https://d2ol7oe51mr4n9.cloudfront.net/user_3IgFYuI0BG12rOdEtYmFORAqXKR/b92a8103-0ca0-427e-aa18-c2ba667c711c.png';
const COAL_ORIGINAL_FLYER='https://d2ol7oe51mr4n9.cloudfront.net/user_3IgFYuI0BG12rOdEtYmFORAqXKR/0e814c8e-34ca-4768-b1c0-66c3f6a61a53.jpg';
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
 const info='<aside class="sidecard"><p class="eyebrow">EVENT INFORMATION</p><h2 data-v-i18n="activityInfo">활동 안내</h2><dl><div><dt data-v-i18n="dateLabel">일시</dt><dd data-v-i18n="eventDate">'+escapeHtml(c.date)+'</dd></div><div><dt data-v-i18n="venueLabel">모임 장소</dt><dd data-v-i18n="venue">'+escapeHtml(c.venue)+'</dd></div><div><dt data-v-i18n="deadlineLabel">신청 마감</dt><dd data-v-i18n="deadline">'+escapeHtml(c.deadline)+'</dd></div><div><dt data-v-i18n="capacityLabel">참가 정원</dt><dd>'+c.capacity+'<span data-v-i18n="peopleUnit">명</span></dd></div><div><dt data-v-i18n="organizerLabel">주관</dt><dd data-v-i18n="organizer">'+escapeHtml(c.organizer)+'</dd></div><div><dt data-v-i18n="contactLabel">연락처</dt><dd>'+escapeHtml(c.contact)+'</dd></div></dl><hr><h3 data-v-i18n="donationInfo">연탄 후원 안내</h3><p data-v-i18n="priceEach">연탄 1장 '+c.unitPrice.toLocaleString('ko-KR')+'원</p><p class="bank">'+escapeHtml(c.bank)+'</p><p data-v-i18n="accountHolder">예금주: '+escapeHtml(c.accountHolder)+'</p><p class="subtle" data-v-i18n="bankCaveat">은행 이체는 별도로 진행합니다. 입금 여부는 담당자가 확인합니다.</p><a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(c.venue)+'" target="_blank" rel="noopener noreferrer" data-v-i18n="mapLink">모임 장소 지도 보기</a></aside>';
 const hero='<section class="wrap volunteer-event-head"><div class="volunteer-detail-toolbar"><a class="back" href="/volunteer" data-v-i18n="back">← 봉사활동 목록</a><div class="volunteer-language" role="group" aria-label="Language / 언어"><button type="button" data-v-lang="ko" aria-pressed="true">한국어</button><button type="button" data-v-lang="en" aria-pressed="false">English</button></div><a class="outline volunteer-admin-link" href="/volunteer/admin" data-v-i18n="adminLink">관리자 페이지</a></div><h1 class="visually-hidden" data-v-i18n="eventTitle">'+escapeHtml(c.title)+'</h1><a class="volunteer-coal-banner" href="#volunteer-form" data-v-aria="bannerToForm" aria-label="봉사·후원 신청서로 이동"><img src="'+COAL_MAIN_IMAGE+'" width="1672" height="448" alt="'+escapeHtml(c.title)+' - '+escapeHtml(c.date)+'" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer"></a><div class="volunteer-event-bar"><span data-registration-state data-v-i18n="checking">실시간 접수 확인 중</span><a class="cta" href="#volunteer-form" data-v-i18n="startApplication">신청서 작성하기</a></div></section>';
 return page(c.title,hero+'<section class="wrap two-col"><div>'+form+'</div>'+info+'</section><section class="wrap caveat"><h2 data-v-i18n="safetyTitle">참여 전 확인사항</h2><p data-v-i18n="safetyNote">행사 당일 안전 안내에 따라 이동하고, 추운 날씨에 대비해 따뜻한 옷과 장갑을 준비해 주세요. 행사 시간은 오전 10시 모임 기준이며 종료 시각은 현장 안내를 따릅니다.</p><p>'+t('partnerLabel','공동 주최:')+' <span data-v-i18n="partners">'+escapeHtml(c.host)+'</span></p></section>');
}
function adminPage(){
 const body='<section class="hero hero-inner"><a class="back" href="/volunteer">← 봉사활동</a><p class="eyebrow">OPERATOR</p><h1>봉사 후원 관리</h1><p>해당 활동의 권한을 부여받은 관리자만 후원 약정과 입금 확인 현황을 열람할 수 있습니다.</p></section><section class="wrap" data-volunteer-admin><p role="status" aria-live="polite" data-admin-status>관리자 인증을 확인하고 있습니다.</p><a data-admin-login class="cta" href="/auth/?site=space&return_to=https%3A%2F%2Fekodi.kr%2Fvolunteer%2Fadmin" hidden>관리자 로그인</a><div data-admin-table hidden><button type="button" class="outline" data-admin-refresh>현황 새로고침</button><div class="table-scroll"><table><thead><tr><th>이름</th><th>후원 장수</th><th>약정액</th><th>상태</th><th>입금 확인</th></tr></thead><tbody data-pledge-rows></tbody></table></div></div></section>';
 return page('후원 관리',body,'noindex,nofollow,noarchive');
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
 if(p==='/volunteer/api/admin/pledges'){
  if(request.method!=='POST')return send({error:'method_not_allowed'},405);
  const origin=request.headers.get('origin')||'';
  if(origin&&origin!=='https://ekodi.kr')return send({error:'origin_not_allowed'},403);
  const token=String(request.headers.get('authorization')||'');
  if(!/^Bearer \S{20,}$/i.test(token))return send({error:'authentication_required'},401);
  const data=await request.json().catch(()=>null);
  const c=CAMPAIGNS[String(data?.campaign||'')];
  if(!c)return send({error:'not_found'},404);
  const action=String(data?.action||'');
  const result=action==='list'
   ?await rpc(env,'volunteer_pledge_admin_snapshot',{p_workspace_slug:c.workspace,p_activity_key:c.key},token)
   :action==='confirm'&&/^[0-9a-f-]{36}$/i.test(String(data?.pledgeId||''))
    ?await rpc(env,'volunteer_pledge_admin_confirm',{p_pledge_id:String(data.pledgeId)},token)
    :null;
  if(!result)return send({error:'invalid_action'},400);
  if(!result.ok)return send({error:result.status===403?'forbidden':'admin_unavailable'},result.status===401?401:result.status===403?403:503);
  return send(result.data&&typeof result.data==='object'?result.data:{result:result.data});
 }
 return withHeaders(env,new Response('Not Found',{status:404}),'volunteer-not-found');
}
