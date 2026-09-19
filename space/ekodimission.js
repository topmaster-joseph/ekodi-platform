(()=>{
  const eventSlug='260926-chuseok-open-table';
  const applicationRecordKey='260926-chuseok-open-table';
  const url=`https://ekodi.kr/ekodimission/activities/${eventSlug}`;
  const api=`/ekodimission/api/activities/${applicationRecordKey}/applications`;
  const invite=`이번 추석, 함께 밥 먹을 사람이 필요하다면 에코디 열린식탁으로 오세요. 국적과 나이, 신앙과 관계없이 누구나 환영합니다. 2026년 9월 26일 토요일 오후 3시, 목포대 후문에서 기다리겠습니다. ${url}`;
  const shareStatus=m=>document.querySelectorAll('[data-share-status]').forEach(el=>el.textContent=m);
  async function copy(v,m){try{await navigator.clipboard.writeText(v)}catch{const t=document.createElement('textarea');t.value=v;document.body.append(t);t.select();document.execCommand('copy');t.remove()}shareStatus(m)}
  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-share-event]')){if(navigator.share){try{await navigator.share({title:'2026 에코디 추석 열린식탁',text:'빈자리를 식탁으로, 낯선 이를 이웃으로.',url});shareStatus('공유 창을 열었습니다.')}catch(err){if(err?.name!=='AbortError')await copy(url,'행사 링크를 복사했습니다.')}}else await copy(url,'행사 링크를 복사했습니다.');return}
    if(e.target.closest('[data-copy-invite]'))await copy(invite,'초대문을 복사했습니다.');
  });
  const form=document.querySelector('[data-event-application]');if(!form)return;
  const status=form.querySelector('[data-application-status]');const submit=form.querySelector('button[type="submit"]');
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
