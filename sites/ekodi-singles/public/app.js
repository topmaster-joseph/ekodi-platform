(() => {
'use strict';
const $=id=>document.getElementById(id);
const page=document.body.dataset.page||'';
const labels={'':'처음','/my':'내 프로필','/events':'공개 행사','/groups':'우리 모임','/discover':'동행 찾기','/messages':'메시지','/subscribe':'구독·입금','/admin':'결제관리'};
const state={client:null,session:null,status:null,member:null,subscription:{active:false}};
const loginUrl=()=>{const u=new URL('https://ekodi.kr/auth/');u.searchParams.set('site','singles');u.searchParams.set('return_to','https://ekodi.kr/singles'+(page||'/my'));return u.toString()};
const text=(tag,body,css='')=>{const n=document.createElement(tag);n.textContent=String(body??'');if(css)n.className=css;return n};
const button=(label,handler,css='outline')=>{const n=document.createElement('button');n.type='button';n.textContent=label;n.className=css;n.addEventListener('click',handler);return n};
const holder=()=>{const h=$('memberContent');h.replaceChildren();h.hidden=false;$('publicPanel').hidden=true;return h};
const paragraph=(h,value)=>h.append(text('p',value,'muted'));
const notice=(h,value)=>h.append(text('p',value,'notice'));
function showGuest(){
 $('sectionTitle').textContent=labels[page]||'처음';
 $('serviceStage').textContent='소개 공개 · 회원서비스 준비';
 $('contentDescription').textContent=page===''?'로그인 전에는 누구나 EKODI 동행의 소개와 이용 원칙을 볼 수 있습니다.':'공개 소개는 누구나 볼 수 있습니다. 행사 목록, 프로필 및 동행 찾기는 로그인 후 제공됩니다.';
 if(page!==''){
   const h=$('publicPanel');h.append(button('EKODI Google로 시작',()=>location.assign(loginUrl()),'primary'));
 }
}
async function sessionToken(){
 if(!state.client)throw Error('service_not_configured');
 const {data}=await state.client.auth.getSession();
 if(!data?.session?.access_token)throw Error('login_required');
 return data.session.access_token;
}
async function api(path,options={}){
 const access=await sessionToken();
 const method=options.method||'GET';
 const response=await fetch('/singles/api'+path,{
  method,headers:{authorization:'Bearer '+access,...(method==='GET'?{}:{'content-type':'application/json'})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),cache:'no-store',credentials:'omit'
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const e=new Error(data.error||'server_unavailable');e.status=response.status;throw e}
 return data;
}
function paywall(h,action){
 const box=text('section','','paywall');box.append(text('h3','공동체 행사 참가 구독'));
 paragraph(box,action+'은 행사 참여 구독 혜택입니다. 상호 동의한 메시지·답장, 차단·신고는 무료입니다.');
 box.append(button('계좌이체 구독 안내',()=>location.assign('/singles/subscribe'),'primary'));h.append(box);
}
function errorText(error){
 if(error?.status===402)return '해당 행사·선택형 컨설팅의 구독 확인이 필요합니다. 메시지는 무료입니다.';
 if(error?.status===403)return '권한이나 성인확인·상호동의 조건을 확인해 주세요.';
 if(error?.status===503)return '현재 안전한 서비스 개통을 준비 중입니다.';
 return '요청을 완료하지 못했습니다. 다시 확인해 주세요.';
}
async function readSubscription(){
 try{const d=await api('/subscription');state.subscription={active:d.active===true,expires_at:d.expires_at||null};}
 catch{state.subscription={active:false}}
}
function profileForm(h){
 const box=text('section','','member-card');box.append(text('h3','나의 동행 프로필'));paragraph(box,'내가 직접 작성한 정보만 저장합니다. 프로필은 성인 본인확인과 별도 공개 동의 후에만 동행 찾기에 나옵니다.');
 const form=document.createElement('form');
 const input=(caption,key,max=150,multi=false)=>{
  const label=text('label',caption,'field'),el=document.createElement(multi?'textarea':'input');
  if(!multi)el.type='text';el.name=key;el.maxLength=max;el.autocomplete='off';el.placeholder=caption;label.append(el);form.append(label);return el;
 };
 const nickname=input('표시 이름','display_name',32),region=input('지역(광역 단위)','broad_region',40),intro=input('나를 소개하는 한마디','intro',400,true);
 const discoverLabel=text('label','성인 본인확인 및 민감정보 동의 후 공개하고 싶습니다.','field'),discover=document.createElement('input');
 discover.type='checkbox';discover.name='discoverable';discoverLabel.prepend(discover);form.append(discoverLabel);
 form.append(text('p','공개를 체크하더라도 본인확인과 운영 검증 전에는 검색에 표시되지 않습니다.','muted'));
 const message=text('p','','status-text');form.append(button('프로필 저장',async()=>{
  try{const result=await api('/profile',{method:'PUT',body:{display_name:nickname.value.trim(),broad_region:region.value.trim(),intro:intro.value.trim(),discoverable:discover.checked}});
   message.textContent=result.discoverable?'프로필이 저장되고 공개 설정이 적용됐습니다.':'프로필 초안을 저장했습니다. 공개는 본인확인 후 가능합니다.';
  }catch(e){message.textContent=errorText(e)}
 },'primary'));
 form.append(message);box.append(form);h.append(box);
 api('/profile').then(d=>{if(d.profile){nickname.value=d.profile.display_name||'';region.value=d.profile.broad_region||'';intro.value=d.profile.intro||'';discover.checked=d.profile.discoverable===true}}).catch(()=>{});
}
function startConsent(h){
 const p=$('enrollmentPanel');p.hidden=false;p.querySelector('#loginButton').hidden=true;
 const form=$('consentForm');form.hidden=false;
 const panel=p.parentElement;panel.append(p);
 const status=$('accountStatus');status.textContent='EKODI로 로그인했습니다. 최초 가입 시 동의를 선택해 주세요.';
 const msg=$('enrollmentMessage');
 api('/me').then(d=>{
  const m=d.member||{};
  for(const [key,field] of [['adult','age_19_confirmed'],['base','base_consent'],['sensitive','religion_consent'],['marriage','marriage_opt_in']])form.elements[key].checked=m[field]===true;
 }).catch(()=>{});
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const payload={age_19_confirmed:form.elements.adult.checked,base_consent:form.elements.base.checked,
   religion_consent:form.elements.sensitive.checked,marriage_opt_in:form.elements.marriage.checked};
  try{const r=await api('/me',{method:'PUT',body:payload});state.member=r.member;msg.textContent='참여 의사가 저장되었습니다. 성인 인증 전에는 상대에게 노출되지 않습니다.';}
  catch(e){msg.textContent=errorText(e)}
 });
 $('withdrawButton').addEventListener('click',async()=>{
  if(!confirm('참여를 중단하고 동의를 철회하시겠습니까?'))return;
  try{await api('/withdraw',{method:'DELETE'});form.reset();msg.textContent='동의 철회가 처리되었습니다. 프로필은 검색되지 않습니다.'}
  catch(e){msg.textContent=errorText(e)}
 });
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
  const row=text('div','','action-row');
  row.append(button('행사 상세',async()=>{
   try{const detail=await api('/events/'+encodeURIComponent(event.id));
    const box=text('div','','member-card');box.append(text('h3',detail.event?.title||'행사 안내'));paragraph(box,detail.event?.description||'');paragraph(box,detail.event?.region||'');
    row.after(box);
   }catch(e){notice(card,errorText(e))}
  }));
  row.append(button('참가 신청',async()=>{
   if(!state.subscription.active){paywall(card,'행사 참가 신청');return}
   if(!confirm('이 행사에 참가 신청하시겠습니까?'))return;
   try{await api('/events/'+event.id+'/rsvp',{method:'POST',body:{}});notice(card,'참가 신청을 접수했습니다.')}
   catch(e){notice(card,errorText(e))}
  },'primary'));card.append(row);
 })}catch(e){notice(h,errorText(e))}
}
async function showDiscover(h){
 notice(h,'서로 공개를 선택하고 본인확인을 완료한 회원만 표시합니다. 호감 수락·거절은 언제나 무료입니다.');
 try{const d=await api('/discover');appendList(h,d.profiles||[],(card,p)=>{
  card.append(text('span',p.broad_region||'지역 비공개','pill'));card.append(text('h3',p.display_name||'동행 회원'));paragraph(card,p.intro||'');
  card.append(button('호감 보내기',async()=>{
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
async function showMessages(h){
 notice(h,'상대의 관심 수락·거절과 상호 동의 후 메시지·답장은 무료입니다. 거절·차단·신고도 무료로 이용할 수 있습니다.');
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
   card.append(text('h4',(row.plan_code==='consulting'?'선택형 컨설팅':'행사 참가 구독')+' · '+money(row.amount_krw)));
   paragraph(card,'결제고유번호: '+row.reference);
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
async function showSubscription(h){
 const box=text('section','','paywall');
 box.append(text('h3','EKODI 동행 · 계좌이체 구독'));
 paragraph(box,'무료: 소개, 프로필 등록, 동행 찾기, 호감 표현·수락, 상호 동의 후 메시지와 답장.');
 paragraph(box,'행사 참가 신청은 공동체 구독 혜택입니다. 소통·공동체 참여를 위한 일반 컨설팅은 필요한 경우에만 별도로 선택합니다. 특정 상대의 결혼 알선은 제공하지 않습니다.');
 paragraph(box,'결제수단: 온라인 계좌이체만 허용합니다. 카드·자동결제·가상 구독 활성화는 제공하지 않습니다.');
 box.append(text('p',state.subscription.community_active?'행사 참여 구독: 활성':'행사 참여 구독: 미활성','status-text'));
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
async function showBankAdmin(h){
 const p=text('section','','member-card');p.append(text('h3','입금 확인 · 운영자 전용'));
 paragraph(p,'EKODI가 부여한 결제 운영 권한이 있어야 실제 내역을 볼 수 있습니다. 회원 입금 신고와 은행 명세를 직접 대조하세요.');
 h.append(p);
 try{
  const data=await api('/bank/admin/orders');
  if(!(data.orders||[]).length){paragraph(p,'확인할 주문이 없습니다.');return}
  for(const row of data.orders){
   const card=text('article','','mini-card');
   card.append(text('h4','결제고유번호 '+row.reference));
   paragraph(card,'상품: '+(row.plan_code==='consulting'?'컨설팅':'행사 참여')+' / '+money(row.amount_krw));
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
      p.replaceChildren();await showBankAdmin(h)}
     catch(e){notice(card,errorText(e))}
    },'primary'),reason,button('입금 내역 반려',async()=>{
     if(!confirm('입금 신고를 반려하시겠습니까?'))return;
     try{await api('/bank/admin/orders/'+row.reference+'/review',{method:'POST',body:{decision:'rejected',reason:reason.value.trim()}});
      p.replaceChildren();await showBankAdmin(h)}
     catch(e){notice(card,errorText(e))}
    }));
   }
   p.append(card);
  }
 }catch(e){notice(p,e?.status===403?'운영 권한이 없습니다.':errorText(e))}
}
async function signedIn(status){
 $('serviceStage').textContent='로그인 완료';
 await readSubscription();
 const h=holder();
 if(!status.social_enabled&&page!=='/my')notice(h,'기능 구현을 검증하는 중입니다. 별도 권한 및 안전 검사가 완료되면 열립니다.');
 if(page==='/my')startConsent(h);
 else if(page==='/events')await showEvents(h);
 else if(page==='/discover')await showDiscover(h);
 else if(page==='/messages')await showMessages(h);
 else if(page==='/subscribe')await showSubscription(h);
 else if(page==='/admin')await showBankAdmin(h);
 else if(page==='/groups')paragraph(h,'지역 공동체·소그룹 기능을 준비하고 있습니다. 행사 목록을 먼저 확인해 주세요.');
 else {paragraph(h,'반갑습니다. 나의 프로필, 공개 행사, 동행 찾기를 살펴보세요.');const row=text('div','','actions');for(const [name,href] of [['프로필 등록','/singles/my'],['공개 행사','/singles/events'],['동행 찾기','/singles/discover']]){const a=text('a',name,'outline');a.href=href;row.append(a)}h.append(row)}
}
async function main(){
 showGuest();
 let status;
 try{status=await fetch('/singles/api/status',{cache:'no-store'}).then(r=>r.json())}
 catch{return}
 state.status=status;
 if(!status?.onboarding_enabled||!status?.auth?.supabase_url||!status?.auth?.publishable_key)return;
 if(typeof window.supabase?.createClient!=='function'){
  const ready=await new Promise(resolve=>{
   const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
   script.async=true;script.addEventListener('load',()=>resolve(typeof window.supabase?.createClient==='function'),{once:true});
   script.addEventListener('error',()=>resolve(false),{once:true});document.head.append(script);
  });
  if(!ready){$('serviceStage').textContent='로그인 모듈 점검 중';return}
 }
 state.client=window.supabase.createClient(status.auth.supabase_url,status.auth.publishable_key,
 {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 // Existing EKODI community bridge uses a short-lived OTP hash in the fragment.
 const fragment=new URLSearchParams(location.hash.slice(1));
 const tokenHash=fragment.get('ekodi_token');
 if(tokenHash){
  try{await state.client.auth.verifyOtp({token_hash:tokenHash,type:fragment.get('ekodi_type')||'email'});}catch{}
  history.replaceState(null,'',location.pathname+location.search);
 }
 const {data}=await state.client.auth.getSession();
 state.session=data?.session;
 if(!state.session){showGuest();return}
 await signedIn(status);
}
main().catch(()=>{$('serviceStage').textContent='연결 점검 중'});
})();
