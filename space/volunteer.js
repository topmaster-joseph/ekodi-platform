(()=>{
'use strict';
const form=document.querySelector('[data-volunteer-form]');
const getJson=async response=>response.json().catch(()=>({}));
const fmt=v=>new Intl.NumberFormat('ko-KR').format(Number(v)||0);
const api='/volunteer/api/';
if(form){
 const english=Object.freeze({
  skip:'Skip to main content',brand:'EKODI Volunteer',navActivities:'Activities',navAdmin:'Activity management',navEkodi:'EKODI',footer:'Turning goodwill into action for our neighbors.',privacyLink:'Privacy policy',
  back:'← All volunteer activities',adminLink:'Admin',eventTitle:'12th Love Briquette Delivery',
  checking:'Checking registration status',startApplication:'Apply now',formTitle:'Volunteer & Donation Application',
  guestNote:'No login required. Only essential information is collected.',
  name:'Name',namePlaceholder:'Enter your name',phone:'Phone number',affiliation:'Affiliation (optional)',
  affiliationPlaceholder:'Church, school, organization or individual',
  participationMode:'Participation type',volunteerOnly:'Volunteer',donationOnly:'Donate briquettes',both:'Volunteer and donate',
  partySize:'Number of volunteers (including you)',capacityNotice:'50 volunteer places. Extra applicants may be waitlisted.',
  bricks:'Briquettes to donate',perBriquette:'1 briquette = 1,300 KRW',
  donationPayment:'A pledge is not a completed payment. Please make a separate bank transfer to the account below.',
  privacyHeading:'I agree to the collection and use of personal information. *',
  privacyDetails:'Collected: name, phone number, optional affiliation, and application details. Purpose: to manage registration, event notices, donation pledges, and contact. Information is used only as needed for event operations and verification. Contact the event organizer to request deletion.',
  photoConsent:'I agree to photos/videos of this activity being taken and published. (Optional; not required to apply.)',
  note:'Message (optional)',notePlaceholder:'Accessibility needs or notes for the organizer',
  submit:'Submit application',completed:'Application received',
  activityInfo:'Event information',dateLabel:'Date & time',eventDate:'Saturday, December 5, 2026 at 10:00 AM',
  venueLabel:'Meeting point',venue:'Bus stop behind Seosan Elementary School, Mokpo',
  deadlineLabel:'Application deadline',deadline:'Friday, November 27, 2026 at 12:00 PM (KST)',
  capacityLabel:'Volunteer capacity',peopleUnit:' people',organizerLabel:'Organizer',organizer:'Rabbit and Tortoise (토끼와거북)',
  contactLabel:'Contact',donationInfo:'Briquette donation',priceEach:'1 briquette: 1,300 KRW',
  accountHolder:'Account holder: 토끼와거북 (Rabbit and Tortoise)',
  bankCaveat:'Bank transfers are separate. The organizer confirms payments manually.',
  mapLink:'View meeting point on map',safetyTitle:'Before you participate',
  safetyNote:'Follow the safety instructions on site and bring warm clothes and gloves. Meet at 10:00 AM. The end time will be announced by the organizer.',
  partnerLabel:'Hosting organizations:',
  partners:'Mokpo International Christian School, Hearts&Hands, EKODI Mission, Mideumhoe, Mokpo Christian Academy, Mokpo Pyeonggang Church, Mokpo Jangro Church, Mokpo Chunghyeon Church, and Mokpo Yechan Church',
  bannerToForm:'Go to the volunteer and donation form',
  storyEyebrow:'Love Briquette Delivery',
  storyHeading:'12th Love Briquette Delivery',
  sourceTiming:'Saturday, December 5, 2026 at 10:00 AM · Volunteer hours recognized',
  sourceRegistration:'First 50 applicants (apply by November 27 at 12:00 noon via form, telephone, text message, or Google Form)',
  sourceSupport:'Briquettes (KRW 1,300 each), boiler heating oil, KRW 500,000 (as stated in the original notice)',
  applyVolunteer:'Join as a volunteer',
  applyDonation:'Donate briquettes',
  storyLead:'Together with local churches, Mokpo International Christian School, Christian civic groups, and mission organizations, we are holding the 12th Love Briquette Delivery.',
  storyCommitment:'I donate briquettes and gladly volunteer with a joyful heart and willing hands.',
  storyExpand:'Read our faith, mission and previous year’s story',
  storyFaithTitle:'Sharing in obedience to the Word',
  storyFaith:'God sent His only Son Jesus, who was without sin, to this earth. Through His death on the cross in our place and His resurrection, He gave life and salvation to those who believe. “It is more blessed to give than to receive” (Acts 20:35); whoever has pity on the poor lends to the Lord, who will repay that good deed (Proverbs 19:17); and those who generously share with the poor have righteousness that endures forever (Psalm 112:9). A life of obedience to this Word is a blessed life.',
  storyHistoryTitle:'Last year’s giving and this year’s hope',
  storyHistory:'Last year, 55 elementary, middle and high school students, university students, parents, pastors and international students joined. They raised KRW 3.1 million for briquettes and supported home heating fuel, multicultural students, Ukrainian children and a brother with a disability. This year, following recommendations from the Yudal-dong Community Service Center, we look forward to sharing love through briquette delivery and heating fuel.',
  storyChildrenTitle:'Learning to care by doing',
  storyChildren:'Children gather savings from piggy banks and pocket money to buy briquettes, then deliver them even in cold weather, sweating as they work. As the saying goes, “Only what we teach through our lives remains,” this will be a living lesson and a beautiful memory of living together. Children who grow up with healthy, happy memories will become wonderful people who serve their neighbors. Join us.',
  storyOriginal:'View the original flyer and application',
  organizerFooter:'Organized by: 토끼와거북 (Rabbit and Tortoise)'
 });
 const messages={
  ko:{
   loading:'실시간 접수 확인 중',closed:'신청 기한이 종료되었습니다.',
   unavailable:'접수 상태를 확인할 수 없습니다. 잠시 후 다시 방문해 주세요.',
   stopped:'현재 접수 상태를 확인할 수 없어 신청이 잠시 중단되었습니다.',
   open:'접수 중 · 봉사 참여 {applied}명 / 정원 {capacity}명',
   waitlist:' · 대기 {count}명',
   saving:'신청 내용을 안전하게 저장하고 있습니다.',
   volunteerSuccess:'봉사 참여 신청이 접수됐습니다.',
   waitlistSuccess:'봉사 참여는 대기자로 접수됐습니다.',
   pledgeSuccess:'연탄 후원 약정이 접수됐습니다.',
   deposit:' 입금은 별도로 진행하고 담당자 확인을 받으세요.',
   receipt:' 접수번호: ',
   invalid_application:'필수 항목과 개인정보 동의를 확인해 주세요.',
   application_closed:'신청 기한이 종료되었습니다.',
   contact_conflict:'연락처 등록 정보를 확인해 주세요. 담당자에게 문의해 주세요.',
   application_unavailable:'신청 저장을 확인할 수 없습니다. 담당자에게 문의해 주세요.',
   persistence_unverified:'신청 저장을 확인하지 못했습니다.',
   genericError:'신청 처리에 문제가 생겼습니다.'
  },
  en:{
   loading:'Checking registration status',
   closed:'The application deadline has passed.',
   unavailable:'Registration status is unavailable. Please try again later.',
   stopped:'Registration is temporarily disabled because its status cannot be verified.',
   open:'Open · {applied} volunteers / {capacity} places',
   waitlist:' · {count} waitlisted',
   saving:'Saving your application securely.',
   volunteerSuccess:'Your volunteer application has been received.',
   waitlistSuccess:'You have been added to the volunteer waitlist.',
   pledgeSuccess:'Your briquette donation pledge has been received.',
   deposit:' Transfer the donation separately; the organizer will confirm payment.',
   receipt:' Receipt ID: ',
   invalid_application:'Please check the required fields and privacy consent.',
   application_closed:'The application deadline has passed.',
   contact_conflict:'Please verify your phone registration or contact the organizer.',
   application_unavailable:'We could not verify your application save. Please contact the organizer.',
   persistence_unverified:'We could not confirm that your application was saved.',
   genericError:'There was a problem processing your application.'
  }
 };
 const slug=form.dataset.campaign;
 const mode=form.elements.namedItem('mode'),party=form.elements.namedItem('partySize'),bricks=form.elements.namedItem('bricks');
 const partyBox=form.querySelector('[data-volunteer-party]'),pledgeBox=form.querySelector('[data-volunteer-pledge]'),amount=form.querySelector('[data-pledge-total]');
 const btn=form.querySelector('[type=submit]'),message=form.querySelector('[data-status]'),availability=document.querySelector('[data-registration-state]');
 const languageButtons=[...document.querySelectorAll('[data-v-lang]')];
 const translatable=[...document.querySelectorAll('[data-v-i18n]')];
 const placeholders=[...document.querySelectorAll('[data-v-placeholder]')];
 const arias=[...document.querySelectorAll('[data-v-aria]')];
 const originals=new Map(translatable.map(node=>[node,node.textContent]));
 const originalPlaceholders=new Map(placeholders.map(node=>[node,node.placeholder||'']));
 const originalArias=new Map(arias.map(node=>[node,node.getAttribute('aria-label')||'']));
 const originalTitle=document.title;
 const initialLanguage=new URL(location.href).searchParams.get('lang');
 let language=initialLanguage==='en'?'en':'ko';
 let open=false,saving=false,finished=false,knownStatus=null,hadStatusError=false,lastOutcome=null,lastError='';
 const translate=key=>messages[language][key]||messages[language].genericError;
 const formatted=(s,values)=>s.replace(/\{(\w+)\}/g,(_,key)=>String(values[key]??''));
 function sync(){
  const value=mode.value,doesVolunteer=value!=='pledge',doesPledge=value!=='volunteer';
  party.disabled=!doesVolunteer;party.required=doesVolunteer;partyBox.hidden=!doesVolunteer;
  bricks.disabled=!doesPledge;bricks.required=doesPledge;pledgeBox.hidden=!doesPledge;
  if(doesVolunteer&&Number(party.value)<1)party.value='1';
  if(!doesVolunteer)party.value='0';
  if(doesPledge&&Number(bricks.value)<1)bricks.value='10';
  if(!doesPledge)bricks.value='0';
  amount.textContent=fmt(Number(bricks.value)*1300)+(language==='en'?' KRW':'원');
  btn.disabled=!open||saving||finished;
  btn.textContent=finished?(language==='en'?english.completed:'접수 완료'):
    (language==='en'?english.submit:'신청 접수하기');
 }
 function renderStatus(){
  if(!availability)return;
  if(hadStatusError){availability.textContent=translate('unavailable');return}
  if(!knownStatus){availability.textContent=translate('loading');return}
  if(!knownStatus.ok){availability.textContent=translate('stopped');return}
  if(!open){availability.textContent=translate('closed');return}
  const data=knownStatus;
  availability.textContent=formatted(translate('open'),{applied:fmt(data.applied_count),capacity:fmt(data.capacity)})+
   (Number(data.waitlist_count)>0?formatted(translate('waitlist'),{count:fmt(data.waitlist_count)}):'');
 }
 function renderMessage(){
  message.textContent='';message.dataset.state='';
  if(saving){message.textContent=translate('saving');return}
  if(lastError){message.dataset.state='error';message.textContent=translate(lastError);return}
  if(lastOutcome){
   message.dataset.state='success';
   const label=lastOutcome.mode==='pledge'?'pledgeSuccess':
    lastOutcome.participationStatus==='waitlist'?'waitlistSuccess':'volunteerSuccess';
   message.textContent=translate(label)+(lastOutcome.mode!=='volunteer'?translate('deposit'):'')+
    translate('receipt')+lastOutcome.receiptId.slice(0,8);
  }
 }
 function setLanguage(next,{updateUrl=true}={}){
  language=next==='en'?'en':'ko';
  document.documentElement.lang=language;
  translatable.forEach(node=>{
   const key=node.dataset.vI18n;
   node.textContent=language==='en'?(english[key]??originals.get(node)):originals.get(node);
  });
  placeholders.forEach(node=>{node.placeholder=language==='en'?(english[node.dataset.vPlaceholder]??originalPlaceholders.get(node)):originalPlaceholders.get(node)});
  arias.forEach(node=>{node.setAttribute('aria-label',language==='en'?(english[node.dataset.vAria]??originalArias.get(node)):originalArias.get(node))});
  for(const item of languageButtons){const active=item.dataset.vLang===language;item.setAttribute('aria-pressed',active?'true':'false');}
  document.title=language==='en'?'12th Love Briquette Delivery | EKODI Volunteer':originalTitle;
  if(updateUrl){
   try{const url=new URL(location.href);if(language==='en')url.searchParams.set('lang','en');else url.searchParams.delete('lang');history.replaceState(history.state,'',url.toString())}catch{}
  }
  sync();renderStatus();renderMessage();
 }
 languageButtons.forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.vLang)));
 // The two visible paths use the existing privacy-checked form; no submission occurs on click.
 document.querySelectorAll('[data-v-apply-mode]').forEach(link=>link.addEventListener('click',()=>{
  const target=link.dataset.vApplyMode;
  if(target==='volunteer'||target==='pledge'){
   mode.value=target;
   sync();
  }
 }));
 mode.addEventListener('change',sync);bricks.addEventListener('input',sync);
 setLanguage(language,{updateUrl:false});
 fetch(api+'campaigns/'+encodeURIComponent(slug)+'/status',{cache:'no-store',headers:{accept:'application/json'}})
  .then(getJson).then(data=>{knownStatus=data;open=data.ok===true&&data.registration_open===true;hadStatusError=false;renderStatus();sync();})
  .catch(()=>{open=false;hadStatusError=true;renderStatus();sync();});
 form.addEventListener('submit',async event=>{
   event.preventDefault();lastError='';lastOutcome=null;renderMessage();
   if(!open||saving||finished)return;
   if(!form.reportValidity())return;
   const raw=new FormData(form),purpose=String(raw.get('mode')||'volunteer');
   const payload={name:String(raw.get('name')||'').trim(),phone:String(raw.get('phone')||'').trim(),affiliation:String(raw.get('affiliation')||'').trim(),
     mode:purpose,partySize:purpose==='pledge'?0:Number(raw.get('partySize')||0),bricks:purpose==='volunteer'?0:Number(raw.get('bricks')||0),
     note:String(raw.get('note')||'').trim(),privacyConsent:raw.get('privacyConsent')==='on',photoConsent:raw.get('photoConsent')==='on',website:String(raw.get('website')||'')};
   saving=true;sync();renderMessage();
   try{
     const response=await fetch(api+'campaigns/'+encodeURIComponent(slug)+'/apply',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),credentials:'same-origin'});
     const data=await getJson(response);
     if(!response.ok||!data.ok||!data.receiptId){
       const allowed=['invalid_application','application_closed','contact_conflict','application_unavailable','persistence_unverified'];
       lastError=allowed.includes(data.error)?data.error:'genericError';
     }else{
       finished=true;lastOutcome={mode:purpose,receiptId:String(data.receiptId),participationStatus:String(data.participationStatus||'')};
       message.focus?.();
       try{const bus=new BroadcastChannel('ekodi-volunteer-application');bus.postMessage({campaign:slug,at:Date.now()});bus.close()}catch{}
     }
   }catch{lastError='genericError'}
   finally{saving=false;sync();renderMessage()}
 });
}

const admin=document.querySelector('[data-volunteer-admin]');
if(admin){
 const status=admin.querySelector('[data-admin-status]');
 const login=admin.querySelector('[data-admin-login]');
 const wrap=admin.querySelector('[data-admin-table]');
 const applicantRows=admin.querySelector('[data-volunteer-rows]');
 const pledgeRows=admin.querySelector('[data-pledge-rows]');
 const campaign='2026-coal-delivery';
 const count=admin.querySelector('[data-volunteer-count]');
 const peopleCount=admin.querySelector('[data-people-count]');
 const pledgeCount=admin.querySelector('[data-pledge-count]');
 const applicantLabel=admin.querySelector('[data-volunteer-subcount]');
 const pledgeLabel=admin.querySelector('[data-pledge-subcount]');
 const accessToken=()=>{
  const fromMission=window.EKODIMissionAuth?.getToken?.()||window.EKODI_MY_AUTH?.getAccessToken?.()||'';
  if(fromMission)return fromMission;
  try{
   for(const store of [sessionStorage,localStorage]){
    const direct=store.getItem('ekodi-auth-token');if(direct)return direct;
    const current=store.getItem('sb-renzehysxirjilvdxacv-auth-token');
    if(current){const token=JSON.parse(current)?.access_token;if(token)return token}
   }
  }catch{}
  return '';
 };
 async function call(endpoint,action,extra={}){
  const token=accessToken();
  if(!token)throw Object.assign(new Error('관리자 로그인이 필요합니다.'),{code:'login_required'});
  const response=await fetch(api+'admin/'+endpoint,{
   method:'POST',
   headers:{'content-type':'application/json','authorization':'Bearer '+token},
   body:JSON.stringify({action,campaign,...extra}),
   cache:'no-store',
   credentials:'same-origin'
  });
  const data=await getJson(response);
  if(!response.ok||!data.ok){
   const code=response.status===401?'login_required':response.status===403?'forbidden':'unavailable';
   const msg=code==='login_required'?'관리자 로그인이 필요합니다.':
    code==='forbidden'?'이 활동의 관리자 권한이 없습니다.':'관리자 정보를 확인할 수 없습니다.';
   throw Object.assign(new Error(msg),{code});
  }
  return data;
 }
 const cell=(tr,value)=>{
  const td=document.createElement('td');
  td.textContent=String(value??'—');
  tr.append(td);
 };
 const empty=(target,message,colspan)=>{
  const row=document.createElement('tr'),td=document.createElement('td');
  td.colSpan=colspan;td.textContent=message;row.append(td);target.append(row);
 };
 const shortDate=value=>{
  const d=Date.parse(value||'');
  if(!Number.isFinite(d))return '—';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
 };
 const statusLabel=value=>({
  applied:'신청 완료',confirmed:'참여 확정',attended:'참여 완료',waitlist:'대기',cancelled:'취소',
  no_show:'불참',pending:'입금 대기'
 })[String(value||'')]||String(value||'—');
 let refreshing=false;
 const refresh=async()=>{
  if(refreshing)return;
  refreshing=true;
  wrap.hidden=true;login.hidden=true;
  status.textContent='봉사 신청자와 후원 현황을 확인하고 있습니다.';
  try{
   // Fetch the canonical Activity/Person registration ledger and the independent pledge ledger.
   // Both RPCs validate the same tenant-local operator role on the server.
   const [registration,donation]=await Promise.all([
    call('registrations','list'),
    call('pledges','list')
   ]);
   const applicants=Array.isArray(registration.participants)?registration.participants:[];
   const pledges=Array.isArray(donation.pledges)?donation.pledges:[];
   applicantRows.replaceChildren();pledgeRows.replaceChildren();
   for(const a of applicants){
    const tr=document.createElement('tr');
    cell(tr,a.name||'—');
    cell(tr,a.phone||'—');
    cell(tr,fmt(a.party_size||0)+'명');
    cell(tr,statusLabel(a.status));
    cell(tr,shortDate(a.submitted_at));
    applicantRows.append(tr);
   }
   if(!applicants.length)empty(applicantRows,'등록된 봉사 신청자가 없습니다.',5);
   for(const p of pledges){
    const tr=document.createElement('tr');
    cell(tr,p.name||'—');
    cell(tr,fmt(p.bricks)+'장');
    cell(tr,fmt(p.amount_krw)+'원');
    cell(tr,statusLabel(p.status));
    const td=document.createElement('td');
    if(p.status==='pending'){
     const button=document.createElement('button');
     button.type='button';button.className='outline';button.textContent='입금 확인';
     button.addEventListener('click',async()=>{
      if(!window.confirm('실제 입금 사실을 대조해 확인하셨습니까?'))return;
      button.disabled=true;
      try{await call('pledges','confirm',{pledgeId:p.id});await refresh()}
      catch(error){status.textContent=error.message;button.disabled=false}
     });
     td.append(button);
    }else td.textContent='—';
    tr.append(td);pledgeRows.append(tr);
   }
   if(!pledges.length)empty(pledgeRows,'등록된 연탄 후원 약정이 없습니다.',5);
   const active=applicants.filter(a=>!['cancelled','no_show'].includes(a.status));
   count.textContent=fmt(active.length);
   peopleCount.textContent=fmt(active.reduce((n,a)=>n+(Number(a.party_size)||0),0));
   pledgeCount.textContent=fmt(pledges.length);
   applicantLabel.textContent=fmt(applicants.length)+'건';
   pledgeLabel.textContent=fmt(pledges.length)+'건';
   status.textContent='봉사 신청자 '+fmt(applicants.length)+'건 · 후원 약정 '+fmt(pledges.length)+'건';
   login.hidden=true;wrap.hidden=false;
  }catch(error){
   wrap.hidden=true;
   login.hidden=!(error.code==='login_required');
   status.textContent=error.message||'관리자 정보를 확인할 수 없습니다.';
  }finally{refreshing=false}
 };
 admin.querySelector('[data-admin-refresh]').addEventListener('click',refresh);
 window.addEventListener('focus',()=>{if(wrap.hidden)refresh()},{passive:true});
 refresh();
}
})();