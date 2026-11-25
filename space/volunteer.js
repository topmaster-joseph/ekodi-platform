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
  partnerLabel:'Partner organizations:',
  partners:'Mokpo International Christian School · Jeonnam Christian Newspaper · EKODI Mission and local partners',
  bannerToForm:'Go to the volunteer and donation form'
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
 const originalPlaceholders=new Map(placeholders.map(node=>[node,node.getAttribute('placeholder')||'']));
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
 const status=admin.querySelector('[data-admin-status]'),login=admin.querySelector('[data-admin-login]'),wrap=admin.querySelector('[data-admin-table]'),rows=admin.querySelector('[data-pledge-rows]');
 const campaign='2026-coal-delivery';
 const accessToken=()=>{
   // Reuse the same first-party session candidates as the existing Mission shell.
   const fromMission=window.EKODIMissionAuth?.getToken?.()||window.EKODI_MY_AUTH?.getAccessToken?.()||'';
   if(fromMission)return fromMission;
   try{
     for(const store of [sessionStorage,localStorage]){
       const direct=store.getItem('ekodi-auth-token');if(direct)return direct;
       const current=store.getItem('sb-renzehysxirjilvdxacv-auth-token');
       if(current){const token=JSON.parse(current)?.access_token;if(token)return token;}
     }
   }catch{}
   return '';
 };
 async function call(action,extra={}){
  const token=accessToken();if(!token)throw new Error('관리자 로그인이 필요합니다.');
  const r=await fetch(api+'admin/pledges',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({action,campaign,...extra}),cache:'no-store'});
  const d=await getJson(r);if(!r.ok||!d.ok)throw new Error(r.status===403?'이 활동의 관리자 권한이 없습니다.':'관리자 정보를 확인할 수 없습니다.');
  return d;
 }
 const refresh=async()=>{
  wrap.hidden=true;status.textContent='후원 약정 내역을 확인하고 있습니다.';
  try{
    const data=await call('list'),pledges=Array.isArray(data.pledges)?data.pledges:[];
    rows.replaceChildren();
    for(const p of pledges){
      const tr=document.createElement('tr');
      for(const value of [p.name||'-',fmt(p.bricks)+'장',fmt(p.amount_krw)+'원',p.status||'대기']){
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }
      const td=document.createElement('td');
      if(p.status==='pending'){
        const button=document.createElement('button');button.type='button';button.className='outline';button.textContent='입금 확인';button.addEventListener('click',async()=>{
          if(!window.confirm('실제 입금 사실을 대조해 확인하셨습니까?'))return;
          button.disabled=true;
          try{await call('confirm',{pledgeId:p.id});await refresh()}catch(error){status.textContent=error.message;button.disabled=false}
        });td.append(button);
      }else td.textContent='—';
      tr.append(td);rows.append(tr);
    }
    if(!pledges.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=5;cell.textContent='등록된 후원 약정이 없습니다.';row.append(cell);rows.append(row);}
    wrap.hidden=false;login.hidden=true;status.textContent='후원 약정 '+pledges.length+'건 · 개인정보는 외부에 공유하지 마세요.';
  }catch(error){status.textContent=error.message;login.hidden=Boolean(accessToken());}
 };
 admin.querySelector('[data-admin-refresh]').addEventListener('click',refresh);
 window.addEventListener('focus',()=>{if(wrap.hidden)refresh()},{passive:true});
 refresh();
}
})();