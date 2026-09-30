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
  const url=String(meta?.dataset.eventUrl||defaultEvent.url);
  const title=String(meta?.dataset.eventTitle||defaultEvent.title);
  const shareText=String(meta?.dataset.eventText||defaultEvent.text);
  const invite=String(meta?.dataset.eventInvite||defaultEvent.invite)+' '+url;
  const api=`/ekodimission/api/activities/${encodeURIComponent(applicationRecordKey)}/applications`;\n  const registrationApi=`/ekodimission/api/activities/${encodeURIComponent(applicationRecordKey)}/registration`;
  const shareStatus=m=>document.querySelectorAll('[data-share-status]').forEach(el=>el.textContent=m);
  async function copy(v,m){try{await navigator.clipboard.writeText(v)}catch{const t=document.createElement('textarea');t.value=v;document.body.append(t);t.select();document.execCommand('copy');t.remove()}shareStatus(m)}
  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-share-event]')){if(navigator.share){try{await navigator.share({title,text:shareText,url});shareStatus('공유 창을 열었습니다.')}catch(err){if(err?.name!=='AbortError')await copy(url,'행사 링크를 복사했습니다.')}}else await copy(url,'행사 링크를 복사했습니다.');return}
    if(e.target.closest('[data-copy-invite]'))await copy(invite,'초대문을 복사했습니다.');
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
  form.addEventListener('submit',async e=>{
    e.preventDefault();status.textContent='';status.dataset.state='';
    if(!form.reportValidity())return;
    const data=new FormData(form);
    const payload={name:String(data.get('name')||'').trim(),phone:String(data.get('phone')||'').trim(),email:String(data.get('email')||'').trim(),partySize:Number(data.get('partySize')||1),language:String(data.get('language')||'ko'),dietary:String(data.get('dietary')||'').trim(),note:String(data.get('note')||'').trim(),photoConsent:data.get('photoConsent')==='on',privacyConsent:data.get('privacyConsent')==='on',website:String(data.get('website')||'')};
    submit.disabled=true;submit.textContent='신청 중…';status.textContent='신청을 저장하고 있습니다.';
    try{
      const response=await fetch(api,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),credentials:'same-origin'});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error(result.message||'신청을 저장하지 못했습니다.');
      status.dataset.state='success';status.textContent='신청이 완료되었습니다. 같은 연락처로 다시 신청하면 내용이 업데이트됩니다.';
      submit.textContent='신청 완료';
    }catch(error){status.dataset.state='error';status.textContent=error?.message||'신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';submit.disabled=false;submit.textContent='다시 신청하기';}
  });
})();
