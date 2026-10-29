(()=>{
  'use strict';
  const root=document.querySelector('[data-mission-saturday]');
  if(!root)return;
  const endpoint='/ekodimission/board/api/saturday';
  const form=root.querySelector('[data-mission-saturday-form]');
  const status=root.querySelector('[data-mission-saturday-status]');
  const replies=root.querySelector('[data-mission-saturday-replies]');
  const dateText=root.querySelector('[data-mission-saturday-date]');
  const count=root.querySelector('[data-mission-saturday-count]');
  const login=root.querySelector('[data-mission-saturday-login]');
  const submit=form?.querySelector('button[type="submit"]');
  const label=Object.freeze({join:'참여하겠습니다',question:'문의합니다',cancel:'참여를 취소합니다'});
  let meetingDate='',loading=0,editing=false;
  const token=()=>window.EKODIMissionAuth?.getToken?.()||'';
  const say=(message,state='')=>{
    if(!status)return;
    status.dataset.state=state;
    status.textContent=message;
  };
  function renderReplies(items){
    replies.replaceChildren();
    if(!items.length){
      const empty=document.createElement('li');
      empty.textContent='이번 주 첫 참여 답글을 남겨 주세요.';
      replies.append(empty);
      return;
    }
    for(const reply of items){
      const item=document.createElement('li');
      const name=document.createElement('strong');
      name.textContent=String(reply.displayName||'참여자');
      const attendance=document.createElement('span');
      attendance.textContent=' · '+(label[reply.attendance]||'답글');
      const message=document.createElement('p');
      message.textContent=String(reply.body||'');
      const date=document.createElement('small');
      if(reply.createdAt){
        const formatted=new Date(reply.createdAt);
        if(!Number.isNaN(formatted.getTime())){
          date.textContent=formatted.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
        }
      }
      item.append(name,attendance,message,date);
      if(reply.own)item.dataset.own='true';
      replies.append(item);
    }
  }
  function render(data){
    if(!data?.ok||!data.meeting?.date||!Array.isArray(data.replies))throw new Error('모임 안내를 확인하지 못했습니다.');
    meetingDate=data.meeting.date;
    const day=new Date(meetingDate+'T00:00:00Z');
    if(!Number.isNaN(day.getTime()))dateText.textContent=day.toLocaleDateString('ko-KR',{timeZone:'UTC',month:'long',day:'numeric',weekday:'short'});
    const attendees=data.replies.filter(item=>item.attendance==='join').length;
    count.textContent='참여 의사 '+attendees+'명 · 답글 '+data.replies.length+'개';
    renderReplies(data.replies);
    const authenticated=data.me?.authenticated===true;
    if(login)login.hidden=authenticated;
    if(submit)submit.textContent=authenticated?'참여 답글 등록·수정':'로그인 후 참여';
    if(data.meeting.status!=='scheduled'){
      if(submit)submit.disabled=true;
      say('이번 주 모임은 일정이 변경되어 신청을 받지 않습니다.','error');
    }else if(submit)submit.disabled=false;
    const own=data.replies.find(item=>item.own);
    if(own&&!editing&&form){
      form.elements.displayName.value=own.displayName||'';
      form.elements.attendance.value=own.attendance||'join';
      form.elements.body.value=own.body||'';
      form.elements.publicConsent.checked=true;
      editing=true;
    }
  }
  async function load(){
    const current=++loading;
    const bearer=token();
    const headers={accept:'application/json'};
    if(bearer)headers.authorization='Bearer '+bearer;
    try{
      const response=await fetch(endpoint,{headers,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(9000)});
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw new Error('참여 답글을 불러올 수 없습니다.');
      if(current===loading)render(data);
    }catch(error){
      if(current!==loading)return;
      if(count)count.textContent='일정 확인 불가';
      if(replies){replies.replaceChildren();const item=document.createElement('li');item.textContent='현재 답글을 불러올 수 없습니다. 잠시 후 새로고침해 주세요.';replies.append(item);}
      say(error.message||'답글 확인 중 오류가 발생했습니다.','error');
    }
  }
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.reportValidity()||!meetingDate)return;
    const bearer=token();
    if(!bearer){
      if(login)login.hidden=false;
      say('참여 답글은 로그인 후 등록할 수 있습니다. 오른쪽의 로그인 버튼을 선택해 주세요.','error');
      return;
    }
    const data=new FormData(form);
    const body={
      meetingDate,
      displayName:String(data.get('displayName')||'').trim(),
      attendance:String(data.get('attendance')||'join'),
      body:String(data.get('body')||'').trim(),
      publicConsent:data.get('publicConsent')==='on'
    };
    submit.disabled=true;say('참여 답글을 저장하고 있습니다.');
    try{
      const response=await fetch(endpoint,{method:'POST',
        headers:{'content-type':'application/json',accept:'application/json',authorization:'Bearer '+bearer},
        credentials:'same-origin',body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
      const saved=await response.json().catch(()=>null);
      if(!response.ok||!saved?.ok)throw new Error(saved?.error==='meeting_date_changed'?'모임 날짜가 바뀌었습니다. 새 날짜를 확인해 주세요.':saved?.error==='private_information_in_public_reply'?'공개 답글에 이메일이나 전화번호를 적지 말아 주세요.':saved?.error==='public_consent_required'?'공개 동의를 확인해 주세요.':'저장이 확인되지 않았습니다. 다시 시도해 주세요.');
      render(saved);
      say('이번 주 참여 답글이 저장되었습니다. 수정하려면 내용을 바꾸고 다시 등록해 주세요.','success');
    }catch(error){
      say(error.message||'저장이 완료되지 않았습니다.','error');
    }finally{submit.disabled=false}
  });
  window.addEventListener('ekodi:mission-auth-changed',()=>{void load()});
  window.addEventListener('ekodi:auth-logout',()=>{editing=false;if(form){form.reset()}void load()});
  // Current Saturday remains visible through Saturday 23:59:59 in Seoul.
  // On Sunday the RSVP window rolls to the following Saturday.
  const kstDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let observedDay=kstDay();
  const refreshAfterDayChange=()=>{
    const nowDay=kstDay();
    if(nowDay===observedDay)return;
    observedDay=nowDay;editing=false;
    form?.reset();
    if(count)count.textContent='다음 모임 확인 중';
    void load();
  };
  const rolloverTimer=setInterval(refreshAfterDayChange,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAfterDayChange()});
  window.addEventListener('focus',refreshAfterDayChange);
  window.addEventListener('pagehide',()=>clearInterval(rolloverTimer),{once:true});
  void load();
})();