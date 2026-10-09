(() => {
'use strict';
const $=id=>document.getElementById(id);
const page=document.body.dataset.page||'';
const labels={'':'처음','/my':'내 프로필','/events':'공개 행사','/groups':'우리 모임','/discover':'동행 찾기','/messages':'메시지','/subscribe':'구독'};
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
 const box=text('section','','paywall');box.append(text('h3','함께하는 더 깊은 연결'));
 paragraph(box,action+'은 구독 회원 기능입니다. 상대방의 수락·거절, 차단·신고는 무료로 이용할 수 있습니다.');
 box.append(button('구독 안내 보기',()=>location.assign('/singles/subscribe'),'primary'));h.append(box);
}
function errorText(error){
 if(error?.status===402)return '이 기능은 유료 구독 확인 후 이용할 수 있습니다.';
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
 notice(h,'상대의 관심을 수락하거나 거절하는 것은 무료입니다. 서로 수락한 이후 양측 모두 구독 중일 때 메시지를 보낼 수 있습니다.');
 try{const d=await api('/requests');appendList(h,d.requests||[],(card,r)=>{
  card.append(text('h3',r.display_name||'새로운 관심'));paragraph(card,r.status==='pending'?'상대의 관심이 도착했습니다.':'연결 상태: '+r.status);
  if(r.status==='pending'){
   card.append(button('호감 수락',async()=>{
    try{await api('/requests/'+r.id+'/respond',{method:'POST',body:{decision:'accepted'}});notice(card,'연결에 동의했습니다. 메시지 전송은 구독 후 가능합니다.')}
    catch(e){notice(card,errorText(e))}
   }));card.append(button('정중히 거절',async()=>{
    try{await api('/requests/'+r.id+'/respond',{method:'POST',body:{decision:'declined'}});notice(card,'거절했습니다.')}
    catch(e){notice(card,errorText(e))}
   }))
  }
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
    if(!state.subscription.active){paywall(card,'메시지 발송');return}
    const body=prompt('상대에게 보낼 메시지 (최대 1000자)');
    if(!body?.trim())return;
    try{await api('/messages/'+r.id,{method:'POST',body:{text:body.slice(0,1000)}});notice(card,'메시지가 전송되었습니다.')}
    catch(e){notice(card,errorText(e))}
   },'primary'))
  }
 })}catch(e){notice(h,errorText(e))}
}
function showSubscription(h){
 const box=text('div','','paywall');box.append(text('h3','EKODI 동행 Plus'));
 paragraph(box,'무료회원은 소개·프로필·공개행사·동행 탐색·호감 표시·수락을 이용합니다. 행사 참가 신청과 상호 동의 후 메시지 보내기·답장에는 각각 유료 구독 자격이 필요합니다.');
 box.append(text('p',state.subscription.active?'서버에서 활성 구독을 확인했습니다.':'유료 결제는 운영·법적 검증 후 개통합니다. 아직 실제 결제나 자동 갱신을 받지 않습니다.','status-text'));
 h.append(box);
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
 else if(page==='/subscribe')showSubscription(h);
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
