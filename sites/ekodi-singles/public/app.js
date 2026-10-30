(() => {
'use strict';
const $=id=>document.getElementById(id);
const page=document.body.dataset.page||'';
const labels={'':'처음','/my':'내 프로필','/events':'공개 행사','/groups':'우리 모임','/discover':'동행 찾기','/messages':'메시지','/subscribe':'동행 안내·가입','/admin':'결제관리'};
const state={client:null,session:null,status:null,member:null,subscription:{active:false},pricing:null,paidModel:false,paid:false};
const loginUrl=()=>{const u=new URL('https://ekodi.kr/auth/');u.searchParams.set('site','singles');u.searchParams.set('select_account','1');u.searchParams.set('return_to','https://ekodi.kr/singles'+page+location.search);return u.toString()};
const text=(tag,body,css='')=>{const n=document.createElement(tag);n.textContent=String(body??'');if(css)n.className=css;return n};
const button=(label,handler,css='outline')=>{const n=document.createElement('button');n.type='button';n.textContent=label;n.className=css;n.addEventListener('click',handler);return n};
const holder=()=>{const h=$('memberContent');h.replaceChildren();h.hidden=false;$('publicPanel').hidden=true;return h};
const paragraph=(h,value)=>h.append(text('p',value,'muted'));
const notice=(h,value)=>h.append(text('p',value,'notice'));
function showGuest(){
 $('sectionTitle').textContent=labels[page]||'처음';
 $('serviceStage').textContent='소개 공개 · 회원서비스 준비';
 document.querySelectorAll('[data-guest-nav]').forEach(link=>{link.href=loginUrl();link.hidden=false});
 $('contentDescription').textContent=page===''?'서로를 존중하며 천천히 알아가는 동행입니다.':'로그인 후 이용 가능한 기능은 개통 상태에 따라 달라집니다.';
 if(page!==''){
   const h=$('publicPanel');if(!h.querySelector('[data-donghaeng-login]')){const c=button('EKODI Google로 시작',()=>location.assign(loginUrl()),'primary');c.dataset.donghaengLogin='1';h.append(c);}
 }
}
async function sessionToken(){
 if(!state.client)throw Error('service_not_configured');
 const {data}=await state.client.auth.getSession();
 if(!data?.session?.access_token)throw Error('login_required');
 return data.session.access_token;
}
// Self-hosted, version-pinned EKODI identity client (npm @supabase/supabase-js@2.117.3,
// dist/umd/supabase.js). The integrity hash must change together with the file.
const SUPABASE_JS=Object.freeze({src:'/singles/vendor/supabase-js-2.117.3.umd.js',integrity:'sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R'});
async function api(path,options={}){
 const access=await sessionToken();
 const method=options.method||'GET';
 const response=await fetch('/singles/api'+path,{
  method,headers:{authorization:'Bearer '+access,...(method==='GET'?{}:{'content-type':'application/json'})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),cache:'no-store',credentials:'omit'
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const e=new Error(data.error||'server_unavailable');e.status=response.status;if(data.fee_krw)e.fee_krw=data.fee_krw;throw e}
 return data;
}
function paywall(h,action){
 const box=text('section','','paywall');box.append(text('h3','동행 기본 구독'));
 paragraph(box,action+'에는 유효한 기본 구독이 필요합니다. 호감 수락·거절, 메시지 열람, 차단·신고는 무료입니다.');
 box.append(button('계좌이체 구독 안내',()=>location.assign('/singles/subscribe'),'primary'));h.append(box);
}
function errorText(error){
 if(error?.message==='monthly_pass_required')return '요청을 보내려면 월 이용권(30일 50,000원)이 필요합니다.';
 if(error?.message==='request_credit_required')return '적립금이 부족합니다. 요청은 상대가 수락할 때 1만원이 확정되며, 보낼 때는 1만원이 잠시 보류됩니다.';
 if(error?.message==='response_credit_required')return '수락에 필요한 적립금이 부족합니다. 수락하면 표시된 본인 요금이 확정 차감됩니다.';
 if(error?.message==='paid_membership_required')return '유료회원만 이용할 수 있습니다. 동행 안내·가입에서 유료회원 가입(가입비 500,000원 = 적립금 500,000원)을 진행해 주세요.';
 if(error?.message==='credit_required')return '적립금이 부족합니다'+(error.fee_krw?' (필요 금액 '+Number(error.fee_krw).toLocaleString('ko-KR')+'원)':'')+'. 적립금을 추가 충전해 주세요.';
 if(error?.message==='already_connected')return '이미 메시지를 주고받을 수 있게 연결된 회원입니다.';
 if(error?.message==='contact_already_shared')return '이미 연락처 교환이 수락된 회원입니다.';
 if(error?.message==='request_exists')return '같은 종류의 요청이 이미 대기 중입니다.';
 if(error?.message==='pilot_only')return '지금은 시범 운영 중이라 지정된 계정만 이용할 수 있습니다. 공개 개통 후 이용해 주세요.';
 if(error?.message==='join_order_already_open')return '이미 발급된 가입비 주문이 있습니다. 아래 입금·확인 내역을 확인해 주세요.';
 if(error?.message==='already_paid_member')return '이미 유료회원입니다.';
 if(error?.message==='verified_member_required')return '가입비 결제 전에 성인 본인확인이 필요합니다. 운영자 확인을 요청해 주세요.';
 if(error?.message==='faith_consent_required')return '신앙 항목은 신앙·신념 민감정보 처리에 별도로 동의한 뒤 입력할 수 있습니다.';
 if(error?.message==='invalid_region')return '지역은 목록에서 골라 주세요.';
 if(error?.message==='invalid_profile'||error?.message==='invalid_profile_details')return '별명(2~32자)과 각 항목의 글자 수를 확인해 주세요.';
 if(error?.message==='initial_credit_required')return '추가 충전 전에 기본 적립금 50만원 충전이 먼저 필요합니다.';
 if(error?.status===402)return '행사 참가·메시지 발송·답장 또는 별도 컨설팅 이용에 필요한 구독을 확인해 주세요.';
 if(error?.status===403)return '권한이나 성인확인·상호동의 조건을 확인해 주세요.';
 if(error?.message==='singles_enrollment_not_launched'||error?.message==='singles_social_not_launched')return '동행 회원 서비스는 아직 개통 전이라 저장되지 않습니다. 성인 본인확인 연동과 개인정보 안내 확정 후 열립니다.';
 if(error?.status===503)return '현재 안전한 서비스 개통을 준비 중입니다.';
 return '요청을 완료하지 못했습니다. 다시 확인해 주세요.';
}
async function readSubscription(){
 try{const d=await api('/subscription');state.subscription={active:d.active===true,community_active:d.community_active===true,consulting_active:d.consulting_active===true,expires_at:d.expires_at||null};}
 catch{state.subscription={active:false}}
}
// 프로필 항목(서버 social.ts PROFILE_FIELDS·REGIONS와 같은 키). sensitive=신앙 항목: 민감정보 동의 회원만, 요금 점수 제외.
const REGIONS=['서울','부산','대구','인천','대전','울산','세종','경기','강원','충북','충남','전북','전남광주','경북','경남','제주','해외'];
const PROFILE_FIELDS=[
 {key:'real_name',label:'공식 이름(실명)',max:32,detail:true},
 {key:'broad_region',label:'지역(시·도)',options:REGIONS},
 {key:'gender',label:'성별',options:['남성','여성'],detail:true},
 {key:'age_band',label:'나이대',options:['20대 초반','20대 중반','20대 후반','30대 초반','30대 중반','30대 후반','40대 초반','40대 중반','40대 후반','50대 이상'],detail:true},
 {key:'occupation',label:'직업 분야',max:40,detail:true},
 {key:'education',label:'최종 학력',options:['고등학교','전문대학','대학교','대학원 이상'],detail:true},
 {key:'hobbies',label:'취미·관심사',max:120,detail:true},
 {key:'intro',label:'나를 소개하는 한마디',max:400,multi:true},
 {key:'looking_for',label:'바라는 동행',max:200,multi:true,detail:true},
 {key:'church',label:'출석 교회·교단',max:60,detail:true,sensitive:true},
 {key:'faith_life',label:'신앙생활 소개',max:200,multi:true,detail:true,sensitive:true},
 {key:'public_link',label:'공유할 프로필 HTTPS 링크',max:300,optional:true}
];
const LEGACY_PUBLIC=['broad_region','intro','public_link'];
function profileForm(h){
 const box=text('section','','member-card');box.append(text('h3','나의 동행 프로필'));
 paragraph(box,'항목마다 입력하고, 공개할지 직접 고르세요. 별명은 항상 공개되고, 나머지는 “공개”를 고른 항목만 다른 회원에게 보입니다. 프로필은 성인 본인확인과 별도 공개 동의 후에만 동행 찾기에 나옵니다.');
 const price=text('div','','notice price-notice');
 price.append(text('strong','요금 안내 · 기본 요금 + 입력·공개 할인'),text('p','요청·수락 요금은 종류별 기본 요금에서 프로필 입력·공개 정도에 따라 할인됩니다. 많이 입력하고 공개할수록 할인이 커지며, 입력·공개는 언제나 선택입니다. 신앙 정보 같은 민감정보는 할인 계산에 쓰지 않습니다. 현재 요금표는 동행 안내·가입에서 확인할 수 있습니다.'));
 box.append(price);
 const meter=text('p','','profile-meter');box.append(meter);
 const form=document.createElement('form');form.className='profile-fields';
 const nickLabel=text('label','별명 (항상 공개 · 필수)','field'),nickname=document.createElement('input');
 nickname.type='text';nickname.name='display_name';nickname.maxLength=32;nickname.required=true;nickname.autocomplete='off';nickname.placeholder='다른 회원에게 보일 이름';
 nickLabel.append(nickname);form.append(nickLabel);
 const controls={},shows={};let faithAllowed=false;const faithRows=[];
 const faithNote=text('p','신앙 항목은 회원 참여에서 신앙·신념 민감정보 처리에 별도로 동의한 뒤 입력할 수 있습니다.','muted');
 for(const f of PROFILE_FIELDS){
  const row=document.createElement('div');row.className='profile-row';
  const label=text('label',f.label+(f.optional?' (선택)':''),'field');let el;
  if(f.options){el=document.createElement('select');el.append(new Option('선택 안 함',''));for(const o of f.options)el.append(new Option(o,o))}
  else{el=document.createElement(f.multi?'textarea':'input');if(!f.multi)el.type='text';el.maxLength=f.max;el.placeholder=f.label}
  el.name=f.key;el.autocomplete='off';label.append(el);
  const showLabel=text('label','공개','show-toggle'),show=document.createElement('input');show.type='checkbox';show.name='show_'+f.key;showLabel.prepend(show);
  row.append(label,showLabel);form.append(row);controls[f.key]=el;shows[f.key]=show;
  if(f.sensitive)faithRows.push(row);
  el.addEventListener('input',updateMeter);el.addEventListener('change',updateMeter);show.addEventListener('change',updateMeter);
 }
 form.append(faithNote);
 const setFaith=on=>{faithAllowed=on;for(const r of faithRows)r.hidden=!on;faithNote.hidden=on};setFaith(false);
 function updateMeter(){
  const scored=PROFILE_FIELDS.filter(f=>!f.sensitive&&!f.optional);
  const filled=scored.filter(f=>controls[f.key].value.trim());
  const pub=filled.filter(f=>shows[f.key].checked);
  meter.textContent='입력 '+filled.length+'/'+scored.length+' · 공개 '+pub.length+'/'+scored.length+' — 입력·공개가 많을수록 할인이 커집니다.';
 }
 form.append(text('p','Google 로그인은 계정 확인 수단입니다. 만 19세 이상 본인확인은 승인된 본인확인기관 연동이 완료된 뒤 별도로 진행합니다.','muted'));
 const discoverLabel=text('label','성인 본인확인 및 민감정보 동의 후 동행 찾기에 공개하고 싶습니다.','field'),discover=document.createElement('input');
 discover.type='checkbox';discover.name='discoverable';discoverLabel.prepend(discover);form.append(discoverLabel);
 form.append(text('p','공개를 체크하더라도 본인확인과 운영 검증 전에는 검색에 표시되지 않습니다.','muted'));
 const message=text('p','','status-text');form.append(button('프로필 저장',async()=>{
  const details={},visibility={};
  for(const f of PROFILE_FIELDS){
   if(f.sensitive&&!faithAllowed)continue;
   if(f.detail)details[f.key]=controls[f.key].value.trim();
   visibility[f.key]=shows[f.key].checked;
  }
  try{const result=await api('/profile',{method:'PUT',body:{display_name:nickname.value.trim(),broad_region:controls.broad_region.value,intro:controls.intro.value.trim(),
    public_link:controls.public_link.value.trim(),details,visibility,discoverable:discover.checked}});
   message.textContent=result.discoverable?'프로필이 저장되고 공개 설정이 적용됐습니다.':'프로필을 저장했습니다. 동행 찾기 공개는 본인확인 후 가능합니다.';
  }catch(e){message.textContent=errorText(e)}
 },'primary'));
 form.append(message);box.append(form);h.append(box);updateMeter();
 const suggested=state.session?.user?.user_metadata?.full_name||state.session?.user?.user_metadata?.name;
 if(typeof suggested==='string'&&suggested.trim())controls.real_name.value=suggested.trim().slice(0,32);
 api('/profile').then(d=>{
  setFaith(d.faith_fields_allowed===true);
  const p=d.profile;if(!p){updateMeter();return}
  nickname.value=p.display_name||'';
  for(const f of PROFILE_FIELDS){
   const v=f.detail?p.details?.[f.key]:p[f.key];if(typeof v==='string'&&(!f.options||f.options.includes(v)))controls[f.key].value=v;
   shows[f.key].checked=p.visibility?(p.visibility[f.key]===true):LEGACY_PUBLIC.includes(f.key);
  }
  discover.checked=p.discoverable===true;updateMeter();
 }).catch(()=>{});
}
function startConsent(h){
 const p=$('enrollmentPanel');p.hidden=false;p.querySelector('#loginButton').hidden=true;
 const form=$('consentForm');form.hidden=false;
 const panel=p.parentElement;panel.append(p);
 const status=$('accountStatus');status.textContent='EKODI로 로그인했습니다. 최초 가입 시 동의를 선택해 주세요.';
 const msg=$('enrollmentMessage');
 api('/me').then(d=>{
  const m=d.member||{};
  for(const [key,field] of [['adult','age_19_confirmed'],['base','base_consent'],['sensitive','religion_consent']])form.elements[key].checked=m[field]===true;
 }).catch(()=>{});
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const payload={age_19_confirmed:form.elements.adult.checked,base_consent:form.elements.base.checked,
   religion_consent:form.elements.sensitive.checked,marriage_opt_in:false}; // 교제·만남 플랫폼 운영: 결혼 목적 연결 미제공
  try{const r=await api('/me',{method:'PUT',body:payload});state.member=r.member;msg.textContent='참여 의사가 저장되었습니다. 성인 인증 전에는 상대에게 노출되지 않습니다.';}
  catch(e){msg.textContent=errorText(e)}
 });
 $('withdrawButton').addEventListener('click',async()=>{
  if(!confirm('참여를 중단하고 동의를 철회하시겠습니까?'))return;
  try{await api('/withdraw',{method:'DELETE'});form.reset();msg.textContent='동의 철회가 처리되었습니다. 프로필은 검색되지 않습니다.'}
  catch(e){msg.textContent=errorText(e)}
 });
 // 유료회원 모델: 무료회원은 프로필을 입력·공개하지 않는다(서비스 안내만).
 if(state.paidModel&&!state.paid){showGuide(h);return}
 profileForm(h);
}
function appendList(h,items,onItem){
 if(!items.length){h.append(text('p','아직 해당 목록에 등록된 내용이 없습니다.','empty'));return}
 const grid=text('div','','card-grid');for(const item of items){const card=text('article','','mini-card');onItem(card,item);grid.append(card)}h.append(grid);
}
async function showEvents(h){
 notice(h,'행사 내용은 로그인 후 무료로 볼 수 있습니다. 참가 신청에는 유효한 구독이 필요합니다.');
 try{const d=await api('/events');appendList(h,d.events||[],(card,event)=>{
  card.append(text('h3',event.title));card.append(text('p',event.summary||'', 'muted'));
  card.append(text('small',[event.starts_at?.slice(0,16),event.region].filter(Boolean).join(' · ')));
  card.append(text('p',event.fee_krw>0?'참가비 '+money(event.fee_krw)+' · 별도 입금 검증 후 신청 가능':'참가비 무료','muted'));
  const row=text('div','','action-row');
  row.append(button('행사 상세',async()=>{
   try{const detail=await api('/events/'+encodeURIComponent(event.id));
    const box=text('div','','member-card');box.append(text('h3',detail.event?.title||'행사 안내'));paragraph(box,detail.event?.description||'');paragraph(box,detail.event?.region||'');
    row.after(box);
   }catch(e){notice(card,errorText(e))}
  }));
  row.append(button('참가 신청',async()=>{
   if(event.fee_krw>0){notice(card,'유료 행사는 별도 입금 확인 절차 준비 후 신청할 수 있습니다.');return}
   if(!state.subscription.active){paywall(card,'행사 참가 신청');return}
   if(!confirm('이 행사에 참가 신청하시겠습니까?'))return;
   try{await api('/events/'+event.id+'/rsvp',{method:'POST',body:{}});notice(card,'참가 신청을 접수했습니다.')}
   catch(e){notice(card,errorText(e))}
  },'primary'));card.append(row);
 })}catch(e){notice(h,errorText(e))}
}
async function showDiscover(h){
 notice(h,state.paidModel?'서로 공개를 선택하고 본인확인을 마친 유료회원만 표시합니다. 요청 요금은 보낼 때 보류되고 상대가 수락할 때 확정됩니다.':'서로 공개를 선택하고 본인확인을 완료한 회원만 표시합니다. 호감 수락·거절은 언제나 무료입니다.');
 try{const d=await api('/discover');appendList(h,d.profiles||[],(card,p)=>{
  card.append(text('span',p.broad_region||'지역 비공개','pill'));card.append(text('h3',p.display_name||'동행 회원'));paragraph(card,p.intro||'');
  const shown=PROFILE_FIELDS.filter(f=>f.detail&&typeof p.details?.[f.key]==='string'&&p.details[f.key]);
  if(shown.length){const dl=document.createElement('dl');dl.className='profile-facts';for(const f of shown)dl.append(text('dt',f.label),text('dd',p.details[f.key]));card.append(dl)}
  if(typeof p.public_link==='string'&&p.public_link.startsWith('https://')){
   const link=text('a','회원이 공유한 명함·프로필 링크 (공식 인증 아님)','outline');
   link.href=p.public_link;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';card.append(link);
  }
  if(state.paidModel){
   const q=state.pricing?.quotes||{};
   for(const [kind,label] of [['message','메시지 교환 요청'],['contact','연락처 교환 요청']]){
    const fee=q[kind];
    card.append(button(label+(typeof fee==='number'?' · '+money(fee):''),async()=>{
     if(!confirm(label+'을 보낼까요? 요청 시 '+money(fee||0)+'이 보류되고, 상대가 수락하면 확정됩니다. 거절·14일 무응답이면 돌려드립니다.'))return;
     try{const r=await api('/interests/'+p.id,{method:'POST',body:{kind}});notice(card,label+'을 보냈습니다. 보류 '+money(r.billing?.reserved_krw||0)+' · 상대가 수락하면 확정됩니다.')}
     catch(e){notice(card,errorText(e))}
    },kind==='contact'?'outline':'primary'));
   }
  }else card.append(button('호감 보내기',async()=>{
   try{await api('/interests/'+p.id,{method:'POST',body:{}});notice(card,'호감을 전했습니다. 상대가 동의하면 대화를 열 수 있습니다.')}
   catch(e){notice(card,errorText(e))}
  },'outline'));
  card.append(button('차단',async()=>{
   if(!confirm('이 회원을 차단하시겠습니까?'))return;
   try{await api('/blocks/'+p.id,{method:'POST',body:{}});notice(card,'차단했습니다. 다시 추천에 표시되지 않습니다.')}
   catch(e){notice(card,errorText(e))}
  }));
  card.append(button('신고',async()=>{
   const details=prompt('신고 사유를 적어 주세요(최대 500자)');if(!details?.trim())return;
   try{await api('/reports/'+p.id,{method:'POST',body:{category:'safety',details:details.slice(0,500)}});notice(card,'신고가 접수되었습니다.')}
   catch(e){notice(card,errorText(e))}
  }));
 })}catch(e){notice(h,errorText(e))}
}
const KIND_LABEL={message:'메시지 교환',contact:'연락처 교환'};
const REQ_STATUS={pending:'대기',accepted:'수락',declined:'거절',expired:'만료(반환)',withdrawn:'탈퇴로 종료(반환)'};
function messageThread(card,id){
 return async()=>{try{const d=await api('/messages/'+id);const list=text('div','','member-card');
  list.append(text('h3','서로 나눈 메시지'));
  for(const m of (d.messages||[]))list.append(text('p',m.body,'muted'));
  if(!(d.messages||[]).length)paragraph(list,'아직 주고받은 메시지가 없습니다.');
  card.append(list);
 }catch(e){notice(card,errorText(e))}};
}
async function showPaidMessages(h){
 notice(h,'요청을 받은 사람은 수락할 때 자기 요금(기본 요금 + 입력·공개 할인)이 적립금에서 확정 차감됩니다. 거절은 무료입니다. 연락처 교환이 수락되기 전에는 메시지 속 전화번호·이메일·메신저 아이디가 자동으로 가려집니다.');
 let d;try{d=await api('/requests')}catch(e){notice(h,errorText(e));return}
 h.append(text('h3','받은·보낸 요청'));
 appendList(h,d.requests||[],(card,r)=>{
  card.append(text('span',KIND_LABEL[r.kind]||r.kind,'pill'));card.append(text('h3',r.display_name));
  paragraph(card,(r.incoming?'받은 요청':'보낸 요청')+' · '+(REQ_STATUS[r.status]||r.status)+(typeof r.my_fee_krw==='number'?' · 내 요금 '+money(r.my_fee_krw):''));
  if(r.status==='pending'&&r.incoming){
   card.append(button('수락 ('+money(r.my_fee_krw||0)+' 차감)',async()=>{
    if(!confirm(KIND_LABEL[r.kind]+' 요청을 수락할까요? 수락하는 순간 적립금에서 '+money(r.my_fee_krw||0)+'이 차감됩니다.'))return;
    try{const x=await api('/requests/'+r.id+'/respond',{method:'POST',body:{decision:'accepted'}});notice(card,'수락했습니다. '+money(x.billing?.charged_krw||0)+' 차감 · 이제 메시지를 주고받을 수 있습니다.')}
    catch(e){notice(card,errorText(e))}
   },'primary'));
   card.append(button('정중히 거절',async()=>{
    try{await api('/requests/'+r.id+'/respond',{method:'POST',body:{decision:'declined'}});notice(card,'거절했습니다. 요금은 없습니다.')}
    catch(e){notice(card,errorText(e))}
   }));
  }
  if(r.status==='pending'&&!r.incoming)paragraph(card,'상대의 답을 기다리는 중입니다. 보류된 금액은 거절·14일 무응답 시 돌려드립니다.');
 });
 h.append(text('h3','연결된 회원'));
 appendList(h,d.connections||[],(card,c)=>{
  card.append(text('h3',c.display_name));
  paragraph(card,c.contact_shared?'연락처 교환 수락됨 · 메시지 속 연락처가 그대로 보입니다.':'연락처 교환 전 · 메시지 속 연락처는 자동으로 가려집니다.');
  card.append(button('대화 내용 보기',messageThread(card,c.id)));
  card.append(button('메시지 보내기',async()=>{
   const body=prompt('상대에게 보낼 메시지 (최대 1000자)');if(!body?.trim())return;
   try{const x=await api('/messages/'+c.id,{method:'POST',body:{text:body.slice(0,1000)}});notice(card,x.masked?'메시지를 보냈습니다. 연락처로 보이는 부분은 가려졌습니다.':'메시지를 보냈습니다.')}
   catch(e){notice(card,errorText(e))}
  },'primary'));
 });
}
async function showMessages(h){
 if(state.paidModel){await showPaidMessages(h);return}
 notice(h,'관심 수락·거절과 상호 동의 후 메시지 열람은 무료입니다. 새 메시지와 답장을 보내려면 보내는 사람에게 유효한 기본 구독이 필요합니다. 차단·신고는 언제나 무료입니다.');
 try{const d=await api('/requests');appendList(h,d.requests||[],(card,r)=>{
  card.append(text('h3',r.display_name||'새로운 관심'));paragraph(card,r.status==='pending'?'상대의 관심이 도착했습니다.':'연결 상태: '+r.status);
  if(r.status==='pending'&&r.incoming===true){
   card.append(button('호감 수락',async()=>{
    try{await api('/requests/'+r.id+'/respond',{method:'POST',body:{decision:'accepted'}});notice(card,'연결에 동의했습니다. 메시지 전송은 구독 후 가능합니다.')}
    catch(e){notice(card,errorText(e))}
   }));card.append(button('정중히 거절',async()=>{
    try{await api('/requests/'+r.id+'/respond',{method:'POST',body:{decision:'declined'}});notice(card,'거절했습니다.')}
    catch(e){notice(card,errorText(e))}
   }))
  }
  if(r.status==='pending'&&r.incoming!==true){paragraph(card,'상대방의 답변을 기다리고 있습니다. 수락·거절은 요청을 받은 사람만 할 수 있습니다.');}
  if(r.status==='accepted'){
   card.append(button('대화 내용 보기',async()=>{
    try{const d=await api('/messages/'+r.id);const list=text('div','','member-card');
     list.append(text('h3','서로 나눈 메시지'));
     for(const m of (d.messages||[])){
      const p=text('p',m.body,'muted');list.append(p);
     }
     if(!(d.messages||[]).length)paragraph(list,'아직 주고받은 메시지가 없습니다.');
     card.append(list);
    }catch(e){notice(card,errorText(e))}
   }));
   card.append(button('메시지',async()=>{
    if(!state.subscription.active){paywall(card,'메시지 발송·답장');return}
    const body=prompt('상대에게 보낼 메시지 (최대 1000자)');
    if(!body?.trim())return;
    try{await api('/messages/'+r.id,{method:'POST',body:{text:body.slice(0,1000)}});notice(card,'메시지가 전송되었습니다.')}
    catch(e){notice(card,errorText(e))}
   },'primary'))
  }
 })}catch(e){notice(h,errorText(e))}
}
const money=value=>Number(value||0).toLocaleString('ko-KR')+'원';
const stateLabel={awaiting_transfer:'이체 대기',reported_paid:'회원 입금 신고',verified:'관리자 입금 확인',rejected:'확인 불가',cancelled:'취소'};
async function reloadBankOrders(h){
 let panel=$('bankOrders');
 if(!panel){panel=text('section','','member-card');panel.id='bankOrders';h.append(panel)}
 panel.replaceChildren();panel.append(text('h3','나의 입금·확인 내역'));
 try{
  const rows=(await api('/bank/orders')).orders||[];
  if(!rows.length){paragraph(panel,'아직 결제 내역이 없습니다.');return}
  for(const row of rows){
   const card=text('article','','mini-card');
   card.append(text('h4',({credit_initial:'유료회원 가입비(적립금 생성)',credit_topup:'적립금 추가 충전',consulting:'선택형 컨설팅'}[row.plan_code]||'행사 참가 구독')+' · '+money(row.amount_krw)));
   paragraph(card,'결제고유번호: '+row.reference);
   card.append(button('고유번호 복사',async()=>{
    try{await navigator.clipboard.writeText(row.reference);notice(card,'고유번호를 복사했습니다.');}
    catch{notice(card,'복사할 수 없습니다. 표시된 고유번호를 직접 사용해 주세요.')}
   }));
   paragraph(card,'상태: '+(stateLabel[row.status]||row.status));
   if(row.status==='awaiting_transfer'){
    paragraph(card,'계좌이체: '+[row.bank_name,row.account_number,row.account_holder].filter(Boolean).join(' · '));
    paragraph(card,'입금 시 결제고유번호를 받는 분 통장 표시란에 기재하세요. 불가능하면 운영자에게 고유번호를 알려주세요.');
    card.append(button('계좌이체 완료 신고',async()=>{
     if(!confirm('실제로 계좌이체를 완료했습니까? 입금 신고만으로 구독은 시작되지 않습니다.'))return;
     try{await api('/bank/orders/'+row.reference+'/report',{method:'POST',body:{}});await reloadBankOrders(h);}
     catch(e){notice(card,errorText(e))}
    },'primary'));
   }
   if(row.status==='reported_paid')paragraph(card,'관리자가 실제 은행 입금 내역과 대조하는 중입니다.');
   if(row.status==='verified'){
    paragraph(card,'관리자 확인: '+(row.verified_at?.slice(0,16).replace('T',' ')||'완료'));
    if(!row.member_acknowledged_at)card.append(button('관리자 확인 결과를 확인했습니다',async()=>{
     try{await api('/bank/orders/'+row.reference+'/acknowledge',{method:'POST',body:{}});await reloadBankOrders(h)}
     catch(e){notice(card,errorText(e))}
    },'outline'));
    else paragraph(card,'회원도 확인했습니다.');
   }
   if(row.status==='rejected')paragraph(card,'운영자 확인: '+(row.rejection_reason||'입금 내역 재확인 필요'));
   panel.append(card);
  }
 }catch(e){notice(panel,errorText(e))}
}
async function showWallet(h){
 try{
  const w=await api('/bank/wallet');
  if(!w.request_billing_enabled)return;
  const box=text('section','','member-card');box.append(text('h3','내 적립금'));
  paragraph(box,'사용 가능 '+(w.available_krw||0).toLocaleString('ko-KR')+'원 · 수락 대기로 보류 중 '+(w.reserved_krw||0).toLocaleString('ko-KR')+'원');
  paragraph(box,'요청 종류와 개인별 할인에 따라 표시된 요금이 보류됩니다. 상대가 수락하면 양측에 각각 표시된 본인 요금이 확정됩니다. 거절·탈퇴 시 보류액이 반환되며, 14일 무응답은 만료 정리 후 반환됩니다.');
  h.append(box);
 }catch(e){}
}
async function showSubscription(h){
 const box=text('section','','paywall');
 box.append(text('h3','EKODI 동행 · 계좌이체 구독'));
 paragraph(box,'무료: 소개, 프로필 등록, 동행 찾기, 호감 표현·수락, 상호 동의 후 받은 메시지 열람, 차단·신고.');
 paragraph(box,'기본 구독(community)은 행사 참가 신청 및 상호 동의한 사람에게 메시지·답장 보내기에 적용됩니다. 소통·공동체 참여 일반 컨설팅은 별도 선택 구독입니다. 특정 상대의 결혼 알선은 제공하지 않습니다.');
 paragraph(box,'결제수단: 온라인 계좌이체만 허용합니다. 카드·자동결제·가상 구독 활성화는 제공하지 않습니다.');
 box.append(text('p',state.subscription.community_active?'기본 구독(행사·메시지 발송): 활성':'기본 구독(행사·메시지 발송): 미활성','status-text'));
 box.append(text('p',state.subscription.consulting_active?'선택형 컨설팅: 활성':'선택형 컨설팅: 미활성','status-text'));
 h.append(box);
 try{
  const d=await api('/bank/plans');
  if(!d.available){notice(box,'입금 계좌·금액 및 운영 검증이 완료되면 신청할 수 있습니다. 현재는 결제를 받지 않습니다.')}
  else for(const plan of d.plans||[]){
   const part=text('article','','member-card');
   part.append(text('h4',plan.display_name+' · '+money(plan.amount_krw)+' / '+plan.duration_days+'일'));
   part.append(button('계좌이체 주문번호 발급',async()=>{
    try{const r=await api('/bank/orders',{method:'POST',body:{plan_code:plan.code}});
     notice(part,'결제고유번호 '+r.order.reference+'가 발급되었습니다.');
     await reloadBankOrders(h);
    }catch(e){notice(part,errorText(e))}
   },'primary'));
   box.append(part);
  }
 }catch(e){notice(box,errorText(e))}
 await reloadBankOrders(h);
 if(state.subscription.consulting_active){
  const box2=text('section','','member-card');box2.append(text('h3','선택형 컨설팅 신청'));
  paragraph(box2,'특정 상대 연결·결혼 알선이 아닌 일반 대화, 공동체 적응, 개인 성장 안내만 제공합니다.');
  const topics=[['communication','대화·소통'],['community_participation','공동체 참여'],['personal_growth','개인 성장']];
  const select=document.createElement('select');
  for(const [key,label] of topics){const option=document.createElement('option');option.value=key;option.textContent=label;select.append(option)}
  box2.append(select,button('컨설팅 상담 신청',async()=>{
   try{await api('/bank/consulting/requests',{method:'POST',body:{topic:select.value}});notice(box2,'상담 신청이 접수되었습니다.')}
   catch(e){notice(box2,errorText(e))}
  },'primary'));
  h.append(box2);
 }
 const adminLink=text('a','운영자 입금내역 관리 →','outline');adminLink.href='/singles/admin';h.append(adminLink);
}
// ── 유료회원 모델(2026-10-28) ──────────────────────────────
async function loadPricing(){
 try{state.pricing=await api('/pricing');state.paidModel=state.pricing.paid_model===true;state.paid=state.pricing.paid_member===true}
 catch{state.pricing=null;state.paidModel=false;state.paid=false}
}
function priceTable(box){
 const rules=state.pricing?.rules||[];if(!rules.length)return;
 const table=document.createElement('table');table.className='price-table';
 const head=document.createElement('tr');for(const t of ['요청 종류','기본 요금','입력·공개 할인','최저 요금'])head.append(text('th',t));table.append(head);
 for(const r of rules.sort((a,b)=>a.standard_krw-b.standard_krw)){
  const row=document.createElement('tr');
  const effectiveFloor=Math.max(Number(r.floor_krw)||0,Math.floor(Number(r.standard_krw)*(1-Number(r.max_discount_pct)/100)/1000)*1000);
  row.append(text('td',r.display_name),text('td',money(r.standard_krw)),text('td',r.max_discount_pct>0?'최대 '+r.max_discount_pct+'%':'없음'),text('td',money(effectiveFloor)));
  table.append(row);
 }
 box.append(table);
}
function showGuide(h){
 const box=text('section','','member-card guide');
 box.append(text('h3','에코디 동행 이용 안내'));
 paragraph(box,'에코디 동행은 결혼 전 성인이 서로를 존중하며 알아가는 교제·만남 공동체입니다. 운영자가 상대를 골라 소개하지 않고, 회원이 스스로 찾아 요청하며 상대가 수락할 때만 연결됩니다.');
 const ul=document.createElement('ul');
 for(const line of [
  '무료회원: 서비스 안내만 볼 수 있습니다. 프로필 입력·공개, 요청·수락은 할 수 없습니다.',
  '유료회원: 가입비 500,000원을 계좌이체하면 같은 금액(500,000원)이 적립금으로 생깁니다.',
  '요청 요금은 "기본 요금 + 입력·공개 할인"입니다. 프로필을 많이 입력·공개할수록 할인이 커집니다. 민감정보(신앙)는 할인 계산에 쓰지 않습니다.',
  '요청한 사람: 보낼 때 자기 요금이 보류되고, 수락하면 확정됩니다. 거절·탈퇴 시 반환되며, 14일 무응답은 만료 처리 후 반환됩니다.',
  '요청받은 사람: 수락하는 순간 자기 요금이 적립금에서 확정 차감됩니다. 거절은 무료입니다.',
  '메시지 교환으로 연결된 사이에서도 연락처 교환이 수락되기 전에는 메시지 속 연락처가 자동으로 가려집니다.',
  '기간제 메시지 이용권(1일·10일·20일·1달)을 적립금으로 사면, 그 기간 동안 메시지 교환 요청·수락 요금이 면제됩니다(연락처 교환은 별도).',
  '미사용 적립금 환불 기준과 신청 절차는 현재 법률 검토·운영 준비 중입니다. 환불 가능 범위를 확정하기 전에는 유료 이용 조건을 확인하세요.'
 ])ul.append(text('li',line));
 box.append(ul);
 priceTable(box);
 const passes=state.pricing?.passes||[];
 if(passes.length)paragraph(box,'기간제 메시지 이용권: '+passes.map(x=>x.display_name+' '+money(x.price_krw)).join(' · '));
 const steps=document.createElement('ol');steps.className='join-steps';
 for(const t of ['로그인 후 참여 동의','성인 본인인증(휴대폰 본인인증 또는 운영자 확인)','가입비 500,000원 계좌이체 주문·입금','운영자 입금 확인 → 유료회원 전환·적립금 500,000원'])steps.append(text('li',t));
 box.append(text('h4','유료회원 가입 순서'),steps);
 h.append(box);
}
async function showJoin(h){
 const box=text('section','','paywall');box.append(text('h3','유료회원 가입 · 가입비 500,000원 (적립금 500,000원 생성)'));
 paragraph(box,'결제수단은 계좌이체입니다. 주문번호를 발급받아 입금하고 "입금 완료 신고"를 누르면 운영자가 은행 내역과 대조해 확인합니다. 확인되면 유료회원이 되고 같은 금액의 적립금이 생깁니다.');
 let member=null;try{member=(await api('/me')).member}catch{}
 if(!member){paragraph(box,'먼저 "내 정보"에서 참여 동의를 저장해 주세요.');box.append(button('참여 동의하러 가기',()=>location.assign('/singles/my'),'primary'));h.append(box);return}
 if(!member.adult_verified){
  if(state.status?.identity_verification){notice(box,'가입비 결제 전에 성인 본인인증이 필요합니다. 휴대폰 본인인증으로 1분 안에 끝납니다.');box.append(button('휴대폰 본인인증 하기',()=>location.assign('/singles/verify'),'primary'));}
  else notice(box,'가입비 결제 전에 성인 본인확인이 필요합니다. 운영자(joseph@ekodi.kr)에게 신분증 확인을 요청해 주세요.');
 }
 box.append(button('가입비 주문번호 발급',async()=>{
  try{const r=await api('/bank/orders',{method:'POST',body:{plan_code:'credit_initial'}});notice(box,'주문번호 '+r.order.reference+'가 발급되었습니다. 아래 계좌로 입금해 주세요.');await reloadBankOrders(h)}
  catch(e){notice(box,errorText(e))}
 },'primary'));
 h.append(box);
 await reloadBankOrders(h);
}
async function showPaidWallet(h){
 const box=text('section','','member-card');box.append(text('h3','내 적립금'));
 try{
  const w=await api('/bank/wallet');
  box.append(text('p','사용 가능 '+money(w.balance_krw)+' · 수락 대기로 보류 중 '+money(w.reserved_krw),'wallet-balance'));
  const q=state.pricing?.quotes||{};
  paragraph(box,'지금 내 요금(기본 요금 + 입력·공개 할인): 메시지 교환 '+money(q.message)+' · 연락처 교환 '+money(q.contact)+(state.pricing?.pass_expires_at?' · 메시지 이용권 '+state.pricing.pass_expires_at.slice(0,10)+'까지':''));
  priceTable(box);
  if((w.ledger||[]).length){
   const LBL={join_fee:'가입비 적립',topup:'추가 충전',request_reserved:'요청 보류',request_released:'보류 반환',request_charged:'요청 확정',accept_charged:'수락 차감',pass_purchase:'이용권 구매',refund:'환불',adjustment:'조정'};
   const ul=document.createElement('ul');ul.className='ledger';
   for(const l of w.ledger)ul.append(text('li',l.created_at.slice(0,16).replace('T',' ')+' · '+(LBL[l.reason]||l.reason)+' · '+(l.delta_krw?(l.delta_krw>0?'+':'')+money(l.delta_krw):'보류 '+money(l.reserved_delta_krw))));
   box.append(text('h4','최근 내역'),ul);
  }
 }catch(e){notice(box,errorText(e))}
 h.append(box);
 const passBox=text('section','','member-card');passBox.append(text('h3','기간제 메시지 이용권'));
 paragraph(passBox,'적립금에서 결제합니다. 기간 동안 메시지 교환 요청·수락 요금이 면제되고, 연락처 교환은 별도 요금입니다.');
 for(const pass of state.pricing?.passes||[]){
  passBox.append(button(pass.display_name+' · '+money(pass.price_krw),async()=>{
   if(!confirm(pass.display_name+'을 적립금 '+money(pass.price_krw)+'으로 구매할까요?'))return;
   try{const r=await api('/passes/'+pass.code,{method:'POST',body:{}});notice(passBox,'구매했습니다. '+String(r.pass_expires_at).slice(0,10)+'까지 이용할 수 있습니다.');await loadPricing()}
   catch(e){notice(passBox,errorText(e))}
  }));
 }
 h.append(passBox);
 const top=text('section','','member-card');top.append(text('h3','적립금 추가 충전 · 100,000원'));
 top.append(button('충전 주문번호 발급',async()=>{
  try{const r=await api('/bank/orders',{method:'POST',body:{plan_code:'credit_topup'}});notice(top,'주문번호 '+r.order.reference+'가 발급되었습니다.');await reloadBankOrders(h)}
  catch(e){notice(top,errorText(e))}
 },'primary'));
 h.append(top);
 await reloadBankOrders(h);
}
async function showMembersAdmin(h){
 const box=text('section','','member-card');box.append(text('h3','회원·가입 기록 · 운영자 전용'));
 paragraph(box,'가입 시도(시간·Google 계정)와 회원 상태입니다. 성인 확인은 신분증을 직접(대면·영상) 확인한 경우에만 처리하세요. 본인 계정은 처리할 수 없습니다.');
 try{
  const d=await api('/bank/admin/members');
  for(const m of d.members||[]){
   const card=text('article','','mini-card');
   card.append(text('h4',(m.email||m.user_id)+' · '+(m.status==='active'?'참여 중':m.status)));
   paragraph(card,'성인 확인: '+(m.adult_verified_at?m.adult_verified_at.slice(0,16).replace('T',' '):'미확인')+' · 유료회원: '+(m.paid_member_since?m.paid_member_since.slice(0,10):'아님'));
   if(!m.adult_verified_at&&m.status==='active'){
    const sel=document.createElement('select');
    for(const [v,l] of [['id_document_in_person','신분증 대면 확인'],['id_document_video','신분증 영상 확인'],['certified_provider','인증기관 결과 확인']])sel.append(new Option(l,v));
    card.append(sel,button('성인 확인 처리',async()=>{
     const note=prompt('확인 메모(선택, 200자)')||'';
     try{await api('/bank/admin/members/'+m.user_id+'/adult-verify',{method:'POST',body:{method:sel.value,note:note.slice(0,200)}});notice(card,'성인 확인을 기록했습니다.')}
     catch(e){notice(card,e.message==='operator_self_verification_forbidden'?'본인 계정은 처리할 수 없습니다.':errorText(e))}
    },'primary'));
   }
   box.append(card);
  }
  if(!(d.members||[]).length)paragraph(box,'아직 참여한 회원이 없습니다.');
  const log=document.createElement('details');log.append(Object.assign(document.createElement('summary'),{textContent:'최근 가입 시도 기록 '+(d.attempts||[]).length+'건'}));
  const LBL={enroll:'참여 동의 저장',enroll_failed:'참여 동의 실패',join_order:'가입비 주문',withdraw:'탈퇴'};
  for(const a of d.attempts||[])log.append(text('p',a.created_at.slice(0,19).replace('T',' ')+' · '+(a.email||'-')+' · '+(LBL[a.action]||a.action)+(a.detail?' · '+a.detail:''),'muted'));
  box.append(log);
 }catch(e){notice(box,e.status===403?'운영자 권한이 필요합니다.':errorText(e))}
 h.append(box);
}
async function showBankAdmin(h){
 const p=text('section','','member-card');p.append(text('h3','입금 확인 · 운영자 전용'));
 paragraph(p,'EKODI가 부여한 결제 운영 권한이 있어야 실제 내역을 볼 수 있습니다. 회원 입금 신고와 은행 명세를 직접 대조하세요.');
 h.append(p);
 try{
  const config=await api('/bank/admin/config');
  const detail=document.createElement('details');detail.className='member-card';
  const summary=document.createElement('summary');summary.textContent='입금 계좌·상품 금액 설정';
  detail.append(summary);
  paragraph(detail,'은행 계좌와 금액을 저장하면 결제 접수는 다시 비활성으로 돌아갑니다. 별도 운영 승인이 있어야 공개됩니다.');
  const bank=config.bank||{};
  const prices=new Map((config.plans||[]).map(x=>[x.code,x.amount_krw]));
  if(config.can_configure){
   const form=document.createElement('form');
   const field=(label,value='',type='text')=>{
    const wrapper=text('label',label,'field'),input=document.createElement('input');
    input.type=type;input.value=value===null||value===undefined?'':String(value);
    input.required=true;wrapper.append(input);form.append(wrapper);return input;
   };
   const bankName=field('은행명',bank.bank_name),number=field('계좌번호',bank.account_number),
    holder=field('예금주',bank.account_holder),
    community=field('행사 참여 구독 금액(원)',prices.get('community'),'number'),
    consulting=field('선택형 컨설팅 구독 금액(원)',prices.get('consulting'),'number');
   const tier90=field('동행 90일 구독 금액(원)',prices.get('community_90'),'number');
   const tier365=field('동행 연간 구독 금액(원)',prices.get('community_365'),'number');
   const msg=text('p','','status-text');
   form.append(button('설정 저장(결제접수 비활성)',async()=>{
    const amount=input=>input.value.trim()===''?null:Number(input.value);
    const request={
      bank_name:bankName.value.trim(),account_number:number.value.trim(),account_holder:holder.value.trim(),
      community_amount_krw:amount(community),consulting_amount_krw:amount(consulting),
      tier_prices:{community_90:amount(tier90),community_365:amount(tier365)}
    };
    if(!confirm('은행 계좌·요금 설정을 저장합니까? 결제 접수는 별도 승인이 있을 때까지 비활성 상태로 유지됩니다.'))return;
    try{await api('/bank/admin/config',{method:'PUT',body:request});
     msg.textContent='저장됐습니다. 실제 결제 접수는 별도 승인 전까지 비활성입니다.';
    }catch(e){msg.textContent=errorText(e)}
   },'primary'),msg);detail.append(form);
  }else{
   paragraph(detail,'은행 계좌와 요금의 수정 권한은 최고관리자가 별도로 부여합니다.');
   paragraph(detail,[bank.bank_name,bank.account_number,bank.account_holder].filter(Boolean).join(' · ')||'은행 계좌 미설정');
  }
  p.append(detail);
  if(config.can_verify!==true)paragraph(p,'조회 권한은 있으나 입금 승인 권한은 없습니다.');
  const findBox=text('section','','member-card');
  findBox.append(text('h4','결제고유번호로 입금 내역 조회'));
  const lookup=document.createElement('input');lookup.type='text';
  lookup.maxLength=36;lookup.placeholder='EDH-...';lookup.setAttribute('aria-label','결제고유번호');
  const lookupResult=text('div','','');
  findBox.append(lookup,button('고유번호 조회',async()=>{
   lookupResult.replaceChildren();
   const reference=lookup.value.trim().toUpperCase();
   if(!/^EDH-[A-F0-9]{32}$/.test(reference)){notice(lookupResult,'정확한 결제고유번호를 입력하세요.');return}
   try{
    const r=await api('/bank/admin/orders/'+reference);
    const row=r.order;
    lookupResult.append(text('h4',row.reference),text('p',
      '상품: '+(row.plan_code==='consulting'?'컨설팅':'행사 참여')+
      ' · '+money(row.amount_krw)+' · '+(stateLabel[row.status]||row.status)));
    paragraph(lookupResult,'회원 신고: '+(row.reported_paid_at||'없음')+
      ' / 관리자 확인: '+(row.verified_at||'미확인')+
      ' / 회원 확인: '+(row.member_acknowledged_at||'미확인'));
    if(row.status==='reported_paid'&&config.can_verify===true){
     const trace=document.createElement('input');trace.maxLength=100;trace.placeholder='은행 명세 거래번호';
     trace.setAttribute('aria-label','은행 명세 거래번호');
     lookupResult.append(trace,button('조회한 고유번호의 입금 승인',async()=>{
      if(trace.value.trim().length<4){notice(lookupResult,'은행 명세 거래번호를 입력하세요.');return}
      if(!confirm('이 고유번호의 입금과 금액을 은행 거래내역으로 확인했습니까?'))return;
      try{await api('/bank/admin/orders/'+reference+'/review',{
        method:'POST',body:{decision:'verified',bank_trace:trace.value.trim()}});
       location.reload();
      }catch(e){notice(lookupResult,errorText(e))}
     },'primary'));
    }
   }catch(e){notice(lookupResult,errorText(e))}
  }),lookupResult);
  p.append(findBox);
  const data=await api('/bank/admin/orders');
  if(!(data.orders||[]).length){paragraph(p,'확인할 주문이 없습니다.');return}
  for(const row of data.orders){
   const card=text('article','','mini-card');
   card.append(text('h4','결제고유번호 '+row.reference));
   paragraph(card,'상품: '+({credit_initial:'유료회원 가입비',credit_topup:'적립금 추가 충전',consulting:'컨설팅'}[row.plan_code]||'행사 참여')+' / '+money(row.amount_krw)+(row.email?' · '+row.email:''));
   paragraph(card,'상태: '+(stateLabel[row.status]||row.status));
   paragraph(card,'회원 입금 신고: '+(row.reported_paid_at||'없음'));
   paragraph(card,'관리자 확인: '+(row.verified_at||'미확인')+' / 회원 재확인: '+(row.member_acknowledged_at||'미확인'));
   if(row.status==='reported_paid'){
    const trace=document.createElement('input');trace.type='text';trace.maxLength=100;trace.placeholder='실제 은행 명세 거래번호';trace.setAttribute('aria-label','은행 명세 거래번호');
    const reason=document.createElement('input');reason.type='text';reason.maxLength=200;reason.placeholder='반려 사유';reason.setAttribute('aria-label','반려 사유');
    card.append(trace,button('실제 입금 확인·구독 승인',async()=>{
     if(trace.value.trim().length<4){notice(card,'은행 명세 거래번호를 입력하세요.');return}
     if(!confirm('실제 은행 거래내역과 금액을 확인했습니까? 승인 후 구독 권한이 부여됩니다.'))return;
     try{await api('/bank/admin/orders/'+row.reference+'/review',{method:'POST',body:{decision:'verified',bank_trace:trace.value.trim()}});
      location.reload()}
     catch(e){notice(card,errorText(e))}
    },'primary'),reason,button('입금 내역 반려',async()=>{
     if(!confirm('입금 신고를 반려하시겠습니까?'))return;
     try{await api('/bank/admin/orders/'+row.reference+'/review',{method:'POST',body:{decision:'rejected',reason:reason.value.trim()}});
      location.reload()}
     catch(e){notice(card,errorText(e))}
    }));
   }
   p.append(card);
  }
 }catch(e){notice(p,e?.status===403?'운영 권한이 없습니다.':errorText(e))}
}
const REPORT_STATUS={open:'접수',under_review:'검토 중',resolved:'조치 완료',dismissed:'기각'};
const REPORT_CATEGORY={harassment:'괴롭힘',fake_profile:'허위 프로필',spam:'스팸',safety:'안전 위협',other:'기타'};
async function showReportModeration(h){
 const panel=text('section','','member-card');panel.append(text('h3','신고 처리'));
 paragraph(panel,'본인이 신고했거나 신고 대상인 건은 처리할 수 없습니다. 조치 완료·기각에는 처리 사유가 필요하며 모든 처리는 감사 기록에 남습니다.');
 const tabs=text('div','','actions'),list=text('div','');
 panel.append(tabs,list);
 let loaded=false;
 async function load(status){
  list.replaceChildren(text('p','불러오는 중…','status-text'));
  try{
   const data=await api('/admin/reports/'+status);loaded=true;
   list.replaceChildren();
   if(!(data.reports||[]).length){paragraph(list,REPORT_STATUS[status]+' 상태의 신고가 없습니다.');return}
   for(const r of data.reports){
    const card=text('article','','mini-card');
    card.append(text('h4',(REPORT_CATEGORY[r.category]||r.category)+' · '+REPORT_STATUS[r.status]));
    card.append(text('p','신고자: '+r.reporter.name+' ('+r.reporter.ref+') → 대상: '+r.target.name+' ('+r.target.ref+')','muted'));
    card.append(text('p','접수: '+new Date(r.created_at).toLocaleString('ko-KR'),'muted'));
    if(r.details)card.append(text('p',r.details));
    if(r.resolution_note)card.append(text('p','처리 사유: '+r.resolution_note,'muted'));
    const feedback=text('p','','status-text');
    if(r.reporter.self||r.target.self){card.append(text('p','본인 관련 신고라 처리할 수 없습니다.','status-text'));list.append(card);continue}
    if(r.status==='open'||r.status==='under_review'){
     const label=text('label','처리 사유(조치 완료·기각 시 필수, 500자 이내)','field'),note=document.createElement('textarea');
     note.maxLength=500;note.rows=2;label.append(note);card.append(label);
     const act=async(next)=>{
      if(next!=='under_review'&&note.value.trim().length<2){feedback.textContent='처리 사유를 입력하세요.';return}
      if(!confirm('이 신고를 「'+REPORT_STATUS[next]+'」로 처리합니까?'))return;
      try{await api('/admin/reports/'+r.id+'/review',{method:'POST',body:{status:next,...(note.value.trim()?{note:note.value.trim()}:{})}});
       feedback.textContent='처리했습니다.';await load(status)}
      catch(e){feedback.textContent=e?.status===409?'이미 다른 운영자가 처리한 신고입니다.':errorText(e)}
     };
     const row=text('div','','actions');
     if(r.status==='open')row.append(button('검토 시작',()=>act('under_review'),'outline'));
     row.append(button('조치 완료',()=>act('resolved'),'primary'),button('기각',()=>act('dismissed'),'outline'));
     card.append(row);
    }
    card.append(feedback);list.append(card);
   }
  }catch(e){
   if((e?.status===403||e?.status===503)&&!loaded){panel.remove();return}
   list.replaceChildren(text('p',errorText(e),'status-text'));
  }
 }
 for(const status of Object.keys(REPORT_STATUS))tabs.append(button(REPORT_STATUS[status],()=>load(status),'outline'));
 h.append(panel);await load('open');
}
async function showEventPricing(h){
 try{
  const result=await api('/admin/events');
  const panel=text('section','','member-card');panel.append(text('h3','행사별 참가비 정책'));
  paragraph(panel,'행사 참가비는 무료 또는 개별 금액으로 설정할 수 있습니다. 유료 참가비 입금 검증 기능을 개통하기 전까지 유료 신청은 차단됩니다.');
  if(!(result.events||[]).length)paragraph(panel,'가격을 설정할 등록 행사가 없습니다.');
  for(const event of result.events||[]){
   const row=text('article','','mini-card');row.append(text('h4',event.title));
   const label=text('label','참가비(원)','field'),input=document.createElement('input');
   input.type='number';input.min='0';input.max='1000000';input.step='100';input.value=String(event.fee_krw||0);label.append(input);
   const noticeText=text('p','','status-text');
   row.append(label,button('참가비 저장',async()=>{
    const price=Number(input.value);
    if(!Number.isInteger(price)||price<0||price>1000000){noticeText.textContent='0원부터 100만원까지 입력하세요.';return}
    if(!confirm('해당 행사의 참가비를 변경합니까? 기존 참가 신청자가 있으면 변경되지 않습니다.'))return;
    try{await api('/admin/events/'+event.id+'/fee',{method:'PUT',body:{fee_krw:price}});noticeText.textContent='행사 참가비를 저장했습니다.'}
    catch(e){noticeText.textContent=errorText(e)}
   },'outline'),noticeText);panel.append(row);
  }
  h.append(panel);
 }catch(e){if(e?.status!==403)notice(h,'행사 참가비 관리 연결을 확인해 주세요.')}
}
async function showAllPricing(h){
 try{
  const data=await api('/bank/admin/catalog');const box=text('section','','member-card');
  box.append(text('h3','가격정책 · 메시지권·기간권·컨설팅'));
  paragraph(box,'가격 변경 즉시 판매는 중단되며 법률 검토와 정식 개통 전에는 결제할 수 없습니다.');
  for(const plan of data.products||[]){
   const field=text('label',plan.title,'field'),value=document.createElement('input');
   value.type='number';value.min='4900';value.max='200000';value.step='100';value.value=String(plan.amount_krw);
   const msg=text('p','','status-text');field.append(value);
   field.append(button('가격 저장',async()=>{
    try{await api('/bank/admin/catalog/'+plan.code,{method:'PUT',body:{amount_krw:Number(value.value)}});msg.textContent='저장 완료 · 판매 중지'}catch(e){msg.textContent=errorText(e)}
   }),msg);box.append(field);
  }
  h.append(box);
 }catch(e){if(e?.status===403)notice(h,'가격관리 역할이 발급되지 않았습니다.');else notice(h,'가격관리 설정을 불러오지 못했습니다.')}
}
async function showBrokerageReadiness(h){
 try{
  const data=await api('/bank/admin/brokerage-readiness');
  const panel=text('section','','member-card');
  panel.append(text('h3','국내·국제결혼중개업 신고·등록 준비'));
  paragraph(panel,'현재 결혼중개 영업은 비활성입니다. 진행 상태 저장은 행정기관 신고 수리 또는 등록을 의미하지 않습니다.');
  const official=text('a','정부24 공식 민원 안내 · 국내 신고 / 국제 등록 ↗','outline');
  official.href='https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13510000012';
  official.target='_blank';official.rel='noopener noreferrer';panel.append(official);
  for(const regime of ['domestic','international']){
   const group=text('section','','member-card');
   group.append(text('h4',regime==='domestic'?'국내결혼중개업 신고':'국제결혼중개업 등록'));
   for(const item of data.items||[]){
    if(item.regime!==regime)continue;
    const field=text('div','','field');field.append(text('label',item.requirement));
    const progress=document.createElement('select');
    for(const [value,label] of [['not_started','준비 전'],['collecting','자료 수집'],['ready_for_review','검토 준비'],['submitted','관할기관 제출']]){
     const opt=document.createElement('option');opt.value=value;opt.textContent=label;progress.append(opt);
    }
    progress.value=item.progress;
    const evidence=document.createElement('input');evidence.type='text';evidence.maxLength=240;
    evidence.placeholder='내부 증빙 문서번호(주민등록번호 입력 금지)';evidence.value=item.evidence_ref||'';
    const feedback=text('p','','status-text');
    field.append(progress,evidence,button('진행상태 저장',async()=>{
     try{await api('/bank/admin/brokerage-readiness',{method:'PUT',body:{regime,code:item.code,progress:progress.value,evidence_ref:evidence.value.trim()}});feedback.textContent='저장됨 · 인허가 완료를 의미하지 않음'}
     catch(e){feedback.textContent=errorText(e)}
    }),feedback);group.append(field);
   }
   panel.append(group);
  }
  h.append(panel);
 }catch(e){if(e?.status===403)notice(h,'인허가 관리 권한이 없습니다. 검증된 EKODI 계정에 운영자 역할이 필요합니다.');else notice(h,'인허가 준비자료를 조회하지 못했습니다.')}
}
// AUTH-RETURN-CONTINUITY-001 v1.27.4: after login the page must visibly confirm who is signed in,
// and a prelaunch gate must never read like a login failure.
function accountLabel(){const u=state.session?.user||{};const name=u.user_metadata?.full_name||u.user_metadata?.name;return String((typeof name==='string'&&name.trim())?name.trim():(u.email||'EKODI 회원')).slice(0,60)}
function showSignedInAccount(){
 document.querySelectorAll('[data-guest-nav]').forEach(link=>{link.hidden=false;link.textContent=accountLabel()+' 님';link.href='/singles/my';link.dataset.signedIn='1';link.setAttribute('aria-label','로그인됨 · '+accountLabel())});
}
function accountCard(h){
 const box=text('section','','member-card');box.dataset.signedInAccount='1';
 box.append(text('h3','로그인 완료'));
 const email=state.session?.user?.email;
 paragraph(box,accountLabel()+(email&&email!==accountLabel()?' ('+email+')':'')+' 계정으로 로그인되어 있습니다.');
 box.append(button('로그아웃',async()=>{try{await state.client?.auth?.signOut({scope:'local'})}catch{}location.replace(location.pathname+location.search)},'outline'));
 h.append(box);
}
async function signedIn(status){
 showSignedInAccount();
 if(!status?.onboarding_enabled){
  $('serviceStage').textContent='로그인 완료 · 회원서비스 개통 준비 중';
  const h=holder();accountCard(h);
  notice(h,'로그인은 정상적으로 완료되었습니다. 동행 회원서비스(회원가입·프로필·행사·메시지·결제)는 운영 개통 전이라 아직 열리지 않았습니다. 개통되면 이 화면에서 바로 이어서 이용할 수 있습니다.');
  return;
 }
 document.querySelectorAll('[data-guest-nav]').forEach(link=>{link.hidden=true});
 $('serviceStage').textContent='로그인 완료';
 await readSubscription();
 if(status.social_enabled)await loadPricing();
 // 유료회원 모델: 유료회원 전용 메뉴(동행 찾기·메시지·내 프로필)는 유료회원에게만 보인다.
 const paidOnlyHidden=state.paidModel&&!state.paid;
 document.querySelectorAll('[data-member-nav]').forEach(link=>{link.hidden=link.hasAttribute('data-paid-nav')&&paidOnlyHidden});
 const subLink=document.querySelector('a[href="/singles/subscribe"]');
 if(subLink&&state.paidModel)subLink.textContent=state.paid?'적립금·이용권':'동행 안내·가입';
 if(state.paidModel){
  $('serviceStage').textContent=state.paid?'유료회원':'무료회원 · 서비스 안내';
  if(page==='/subscribe')$('sectionTitle').textContent=state.paid?'적립금·이용권':'동행 안내·가입';
  const acct=document.querySelector('a.account[data-member-nav]');if(acct&&!state.paid)acct.textContent='내 정보';
 }
 const h=holder();accountCard(h);
 if(!status.social_enabled&&page!=='/my')notice(h,'기능 구현을 검증하는 중입니다. 별도 권한 및 안전 검사가 완료되면 열립니다.');
 if(page==='/my')startConsent(h);
 else if(page==='/events')await showEvents(h);
 else if(paidOnlyHidden&&['/discover','/messages'].includes(page)){notice(h,'유료회원 전용 메뉴입니다.');showGuide(h);await showJoin(h);}
 else if(page==='/discover')await showDiscover(h);
 else if(page==='/messages')await showMessages(h);
 else if(page==='/subscribe'&&state.paidModel){if(state.paid)await showPaidWallet(h);else{showGuide(h);await showJoin(h);}}
 else if(page==='/subscribe'){await showWallet(h);await showSubscription(h);}
 else if(page==='/admin'){await showMembersAdmin(h);await showBankAdmin(h);await showEventPricing(h);await showReportModeration(h);await showAllPricing(h);await showBrokerageReadiness(h);}
 else if(page==='/groups')paragraph(h,'지역 공동체·소그룹 기능을 준비하고 있습니다. 행사 목록을 먼저 확인해 주세요.');
 else {paragraph(h,'반갑습니다. 나의 프로필, 공개 행사, 동행 찾기를 살펴보세요.');const row=text('div','','actions');for(const [name,href] of [['프로필 등록','/singles/my'],['공개 행사','/singles/events'],['동행 찾기','/singles/discover']]){const a=text('a',name,'outline');a.href=href;row.append(a)}h.append(row)}
}
// AUTH-RETURN-CONTINUITY-001 v1.27.5: a signed-in person is never shown a login entry or sent to login again.
// A stored EKODI session is detected synchronously so no login button flashes before the session check.
function storedSession(){
 try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)||'';if(!/^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(key))continue;let v=null;try{v=JSON.parse(localStorage.getItem(key)||'null')}catch{continue}const s=v?.currentSession||v?.session||v;if(s?.user?.id&&(s?.refresh_token||Number(s?.expires_at||0)*1000>Date.now()))return true}}catch{}
 return false;
}
function hideLoginEntries(){document.querySelectorAll('[data-guest-nav]').forEach(link=>{if(!link.dataset.signedIn)link.hidden=true});document.querySelectorAll('[data-donghaeng-login]').forEach(b=>b.remove())}
async function main(){
 // Clear one-time credentials before any async work or feature flag checks.
 // The token remains only in memory for the current authentication attempt.
 const fragment=new URLSearchParams(location.hash.slice(1));
 const tokenHash=fragment.get('ekodi_token');
 const tokenType=fragment.get('ekodi_type')||'email';
 if(tokenHash)history.replaceState(null,'',location.pathname+location.search);
 const resuming=Boolean(tokenHash)||storedSession();
 if(resuming){hideLoginEntries();$('serviceStage').textContent='로그인 확인 중';}
 else showGuest();
 let status;
 try{status=await fetch('/singles/api/status',{cache:'no-store'}).then(r=>r.json())}
 catch{if(resuming)$('serviceStage').textContent='연결 점검 중';return}
 state.status=status;
 const prelaunchAdmin=page==='/admin'&&status?.admin_preparation_enabled===true&&status?.onboarding_enabled===false;
 // Public first-party EKODI identity settings are the same as the canonical auth hub.
 // Only the publishable browser key is used; membership and payment remain server-gated.
 const identityUrl=status?.auth?.supabase_url||'https://renzehysxirjilvdxacv.supabase.co';
 const identityKey=status?.auth?.publishable_key||'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
 if(!identityUrl||!identityKey)return;
 if(typeof window.supabase?.createClient!=='function'){
  const ready=await new Promise(resolve=>{
   const script=document.createElement('script');script.src=SUPABASE_JS.src;script.integrity=SUPABASE_JS.integrity;script.crossOrigin='anonymous';
   script.async=true;script.addEventListener('load',()=>resolve(typeof window.supabase?.createClient==='function'),{once:true});
   script.addEventListener('error',()=>resolve(false),{once:true});document.head.append(script);
  });
  if(!ready){$('serviceStage').textContent='로그인 모듈 점검 중';return}
 }
 state.client=window.supabase.createClient(identityUrl,identityKey,
 {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 // Existing EKODI community bridge uses a short-lived OTP hash in the fragment.
 if(tokenHash){
  try{await state.client.auth.verifyOtp({token_hash:tokenHash,type:tokenType});}catch{}
 }
 const {data}=await state.client.auth.getSession();
 state.session=data?.session;
 if(!state.session){if(resuming)showGuest();return}
 if(prelaunchAdmin){
  showSignedInAccount();
  $('serviceStage').textContent='로그인 완료 · 운영 준비';
  const h=holder();accountCard(h);
  notice(h,'회원가입·메시지·결제는 아직 중단돼 있습니다. 별도 권한이 확인된 관리자만 가격 및 인허가 준비 상태를 수정할 수 있습니다.');
  await showBrokerageReadiness(h);
  await showAllPricing(h);
  return;
 }
 await signedIn(status);
}
main().catch(()=>{$('serviceStage').textContent='연결 점검 중'});
})();
