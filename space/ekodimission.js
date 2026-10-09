(()=>{
  const defaultEvent=Object.freeze({
    eventSlug:'260926-chuseok-open-table',
    applicationRecordKey:'260926-chuseok-open-table',
    url:'https://ekodi.kr/ekodimission/apply/260926-open-table',
    title:'2026 에코디 추석 열린식탁',
    text:'빈자리를 식탁으로, 낯선 이를 이웃으로.',
    invite:'이번 추석, 함께 밥 먹을 사람이 필요하다면 에코디 열린식탁으로 오세요. 국적과 나이, 신앙과 관계없이 누구나 환영합니다. 2026년 9월 26일 토요일 오후 4시, 자담치킨에서 기다리겠습니다.'
  });
  const form=document.querySelector('[data-event-application]');
  const meta=document.querySelector('[data-event-meta]');
  const applicationRecordKey=String(form?.querySelector('[name="eventKey"]')?.value||defaultEvent.applicationRecordKey);
  const missionHome=Boolean(document.querySelector('.hero-split'))&&!form;
  const url=missionHome?'https://ekodi.kr/ekodimission':String(meta?.dataset.eventUrl||defaultEvent.url);
  const title=missionHome?'에코디선교회 · EKODI MISSION':String(meta?.dataset.eventTitle||defaultEvent.title);
  const shareText=missionHome?'생명을 살리는 공동체, 말씀대로 살아내고 살려내는 공동체. 대학가의 청년·유학생·이웃과 말씀과 식탁으로 만납니다.':String(meta?.dataset.eventText||defaultEvent.text);
  const invite=(missionHome?'에코디선교회의 말씀·식탁·장학·지역 봉사 사역을 함께 살펴보세요.':String(meta?.dataset.eventInvite||defaultEvent.invite))+' '+url;
  const api=`/ekodimission/api/activities/${encodeURIComponent(applicationRecordKey)}/applications`;
  const registrationApi=`/ekodimission/api/activities/${encodeURIComponent(applicationRecordKey)}/registration`;
  // Keep the landing page focused on not-yet-ended events in Korea time.
  // Event records remain accessible in the activity archive after the end date.
  const homeEventCards=[...document.querySelectorAll('[data-mission-home-event]')];
  if(homeEventCards.length){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const kstPart=key=>parts.find(part=>part.type===key)?.value||'';
    const todayKst=[kstPart('year'),kstPart('month'),kstPart('day')].join('-');
    let current=0;
    for(const card of homeEventCards){
      const lastDay=String(card.dataset.eventLastDay||'');
      const visible=/^\\d{4}-\\d{2}-\\d{2}$/.test(lastDay)&&lastDay>=todayKst;
      card.hidden=!visible;
      if(visible)current++;
    }
    const empty=document.querySelector('[data-mission-home-empty]');
    if(empty)empty.hidden=current!==0;
  }
  const shareStatus=m=>document.querySelectorAll('[data-share-status]').forEach(el=>el.textContent=m);
  async function copy(v,m){try{await navigator.clipboard.writeText(v)}catch{const t=document.createElement('textarea');t.value=v;document.body.append(t);t.select();document.execCommand('copy');t.remove()}shareStatus(m)}
  const paymentSheet=document.querySelector('[data-mission-pay-sheet]');
  const paymentStatus=()=>paymentSheet?.querySelector('[data-mission-pay-status]');
  const paymentAmount=()=>String(document.querySelector('[data-trip-fee]')?.textContent||'50,000원').trim();
  const paymentAccount=()=>String(document.querySelector('[data-mission-pay-account]')?.textContent||'100-033-234271').trim();
  const showPayment=()=>{
    if(!paymentSheet)return;
    paymentSheet.hidden=false;
    document.body.classList.add('mission-pay-open');
    paymentSheet.querySelector('[data-mission-pay-amount]').textContent=paymentAmount();
    paymentSheet.querySelector('[data-mission-pay-account]').textContent=paymentAccount();
    setTimeout(()=>paymentSheet.querySelector('[data-mission-copy-account]')?.focus(),0);
  };
  const hidePayment=()=>{if(!paymentSheet)return;paymentSheet.hidden=true;document.body.classList.remove('mission-pay-open')};
  const copyPayment=async(value,message)=>{await copy(value,message);const el=paymentStatus();if(el)el.textContent=message};
  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-share-event]')){if(navigator.share){try{await navigator.share({title,text:shareText,url});shareStatus('공유 창을 열었습니다.')}catch(err){if(err?.name!=='AbortError')await copy(url,'행사 링크를 복사했습니다.')}}else await copy(url,'행사 링크를 복사했습니다.');return}
    if(e.target.closest('[data-copy-invite]')){await copy(invite,'초대문을 복사했습니다.');return}
    if(e.target.closest('[data-mission-pay-open]')){showPayment();return}
    if(e.target.closest('[data-mission-pay-close]')){hidePayment();return}
    if(e.target.closest('[data-mission-copy-account]')){await copyPayment(paymentAccount().replace(/-/g,''),'계좌번호를 복사했습니다.');return}
    if(e.target.closest('[data-mission-copy-payment]')){await copyPayment('참가비 '+paymentAmount()+' · 신한은행 '+paymentAccount(),'납부 금액과 계좌를 복사했습니다.');return}
  });
  const tripNodes=document.querySelectorAll('[data-trip-content]');
  if(tripNodes.length){
    fetch('/ekodimission/api/activities/261003-autumn-community-trip/content',{headers:{accept:'application/json'},credentials:'same-origin'})
      .then(r=>r.ok?r.json():null).then(data=>{const c=data?.content;if(!c)return;
        const set=(sel,val)=>document.querySelectorAll(sel).forEach(el=>{if(val!==undefined&&val!==null)el.textContent=String(val)});
        set('[data-trip-title]',c.title);set('[data-trip-theme]',c.theme);set('[data-trip-summary]',c.summary);
        set('[data-trip-capacity]',c.capacity);set('[data-trip-fee]',Number(c.fee_krw||0).toLocaleString('ko-KR')+'원');set('[data-trip-fee-note]',c.fee_note);
        set('[data-trip-departure]',c.departure);set('[data-trip-return]',c.return);set('[data-trip-notice]',c.notice);
        const schedule=Array.isArray(c.schedule)?c.schedule:[];set('[data-trip-schedule-1]',schedule[0]?.text);set('[data-trip-schedule-2]',schedule[1]?.text);
        const lodging=Array.isArray(c.lodging)?c.lodging:[];for(let i=0;i<2;i++){const l=lodging[i]||{};set(`[data-trip-lodging-${i+1}-name]`,l.name);set(`[data-trip-lodging-${i+1}-detail]`,[l.room,l.capacity,l.note].filter(Boolean).join(' · '))}
      }).catch(()=>{});
  }
  const activityItems=[...document.querySelectorAll('[data-activity-item]')];
  const activityYear=document.querySelector('[data-activity-year]');
  const activityMonth=document.querySelector('[data-activity-month]');
  if(activityItems.length&&activityYear&&activityMonth){
    const years=[...new Set(activityItems.map(item=>item.dataset.year).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
    const months=[...new Set(activityItems.map(item=>item.dataset.month).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
    for(const year of years){const option=document.createElement('option');option.value=year;option.textContent=year+'년';activityYear.append(option)}
    for(const month of months){const option=document.createElement('option');option.value=month;option.textContent=Number(month)+'월';activityMonth.append(option)}
    const applyActivityFilters=()=>{
      const year=activityYear.value,month=activityMonth.value;
      let visible=0;
      for(const item of activityItems){
        const show=(year==='all'||item.dataset.year===year)&&(month==='all'||item.dataset.month===month);
        item.hidden=!show;if(show)visible++;
      }
      const empty=document.querySelector('[data-activity-empty]');
      if(empty)empty.hidden=visible>0;
    };
    activityYear.addEventListener('change',applyActivityFilters);
    activityMonth.addEventListener('change',applyActivityFilters);
  }
  function missionAdminToken(){
    try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return''}
  }
  async function initMissionPublicAdmin(){
    const shared=window.EKODIPublicSurfaceAdmin;
    if(!shared?.create||Number(shared.version||0)<2||!missionAdminToken())return;
    const admin=shared.create({
      serviceId:'mission',
      adminPath:'/ekodimission/admin/activities',
      authEndpoint:'/ekodimission/api/admin/me',
      tokenProvider:missionAdminToken
    });
    try{
      const me=await admin.authorize();
      if(!me?.ok||!admin.has('activities'))return;
      const listHead=document.querySelector('.mission-activity-index-head');
      admin.attach(listHead,{label:'활동 · 참가자 관리',panel:'activities',permission:'activities',presentation:'window'});
      for(const item of activityItems){
        const activityKey=String(item.dataset.activityKey||'').trim();
        if(!activityKey)continue;
        const target=item.querySelector('.mission-activity-row-actions')||item;
        admin.attach(target,{label:'참가자 관리',panel:'activities',permission:'activities',presentation:'window',params:{activity:activityKey}});
      }
      if(form){
        const target=document.querySelector('.open-table-actions');
        admin.attach(target,{label:'신청자 관리',panel:'activities',permission:'activities',presentation:'window',params:{activity:applicationRecordKey}});
      }
    }catch{}
  }
  initMissionPublicAdmin();
  if(!form)return;
  const status=form.querySelector('[data-application-status]');const submit=form.querySelector('button[type="submit"]');
  const closeApplication=(data={})=>{
    for(const el of form.querySelectorAll('input,textarea,select,button[type="submit"]'))el.disabled=true;
    if(submit){submit.textContent='신청 마감';submit.setAttribute('aria-disabled','true')}
    status.dataset.state='closed';status.textContent='일정이 종료되어 신청이 마감되었습니다.';
    if(data.archive_url){
      let link=form.querySelector('[data-event-archive-link]');
      if(!link){link=document.createElement('a');link.dataset.eventArchiveLink='';link.className='button secondary';link.style.marginTop='10px';status.insertAdjacentElement('afterend',link)}
      link.href=data.archive_url;link.textContent='사진·영상 결과 보기';
    }
    document.querySelectorAll('a[href="#apply"]').forEach(link=>{link.href=data.archive_url||'#apply';link.textContent=data.archive_url?'사진·영상 결과':'신청 마감';});
  };
  fetch(registrationApi,{headers:{accept:'application/json'},credentials:'same-origin'})
    .then(r=>r.ok?r.json():null)
    .then(data=>{if(data?.ok&&!data.registration_open)closeApplication(data)})
    .catch(()=>{});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!paymentSheet?.hidden)hidePayment()});
  form.addEventListener('submit',async e=>{
    e.preventDefault();status.textContent='';status.dataset.state='';
    if(!form.reportValidity())return;
    const data=new FormData(form);
    const payload={name:String(data.get('name')||'').trim(),phone:String(data.get('phone')||'').trim(),email:String(data.get('email')||'').trim(),partySize:Number(data.get('partySize')||1),language:String(data.get('language')||'ko'),dietary:String(data.get('dietary')||'').trim(),note:String(data.get('note')||'').trim(),photoConsent:data.get('photoConsent')==='on',privacyConsent:data.get('privacyConsent')==='on',website:''};
    submit.disabled=true;submit.textContent='신청 중…';status.textContent='신청을 저장하고 있습니다.';
    try{
      const response=await fetch(api,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),credentials:'same-origin'});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok||!result.applicationId)throw new Error(result.message||'신청 저장을 확인하지 못했습니다. 다시 신청해 주세요.');
      status.dataset.state='success';status.textContent='신청이 완료되었습니다. 아직 참가비를 납부하지 않았다면 바로 납부해 주세요.';
      try{const bus=new BroadcastChannel('ekodi-mission-applications-v1');bus.postMessage({activityKey:applicationRecordKey,applicationId:result.applicationId,at:Date.now()});bus.close()}catch{}
      submit.textContent='신청 완료';
      const after=document.createElement('button');after.type='button';after.className='apply-submit mission-pay-after';after.dataset.missionPayOpen='';after.textContent='참가비 바로 납부하기';status.insertAdjacentElement('afterend',after);
      setTimeout(()=>after.focus(),0);
    }catch(error){status.dataset.state='error';status.textContent=error?.message||'신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';submit.disabled=false;submit.textContent='다시 신청하기';}
  });
})();
