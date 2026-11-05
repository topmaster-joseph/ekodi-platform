(()=>{
  'use strict';
  const root=document.querySelector('[data-mission-participation]');
  if(!root)return;
  const endpoint='/ekodimission/board/api/saturday/participation';
  const controls=root.querySelector('[data-mission-participation-controls]');
  const login=root.querySelector('[data-mission-participation-login]');
  const status=root.querySelector('[data-mission-participation-status]');
  const recurring=root.querySelector('[data-mission-recurring]');
  const buttons=[...root.querySelectorAll('[data-mission-rsvp]')];
  const manager=root.querySelector('[data-mission-private-manager]');
  const plannedCount=root.querySelector('[data-mission-planned-count]');
  const token=()=>window.EKODIMissionAuth?.getToken?.()||'';
  let current=null,sequence=0,busy=false;
  const message=(value,error=false)=>{status.textContent=value;status.dataset.state=error?'error':'ok'};
  const label=Object.freeze({join:'참석 예정',cancel:'이번 주 불참',maybe:'미정',unavailable:'신청 마감'});
  function paint(data){
    current=data;
    controls.hidden=false;login.hidden=true;
    recurring.checked=data.recurring===true;
    recurring.disabled=busy;
    const count=data?.managerSummary?.privatePlannedJoin;
    const canView=typeof count==='number'&&Number.isSafeInteger(count)&&count>=0;
    manager.hidden=!canView;
    if(canView)plannedCount.textContent=String(count);
    buttons.forEach(button=>{
      const choice=button.dataset.missionRsvp;
      button.disabled=busy||data.planned==='unavailable';
      button.setAttribute('aria-pressed',String(choice==='default'?data.override===null:choice===data.override));
    });
    message('이번 주: '+(label[data.planned]||'확인 필요')+' · 실제 출석은 현장에서 확인합니다.');
  }
  function unauthenticated(){
    current=null;controls.hidden=true;login.hidden=false;manager.hidden=true;
    message('로그인하면 한 번의 동의로 정기참여를 설정할 수 있습니다.');
  }
  async function load(){
    const id=++sequence,bearer=token();
    manager.hidden=true;
    if(!bearer){unauthenticated();return;}
    try{
      const response=await fetch(endpoint,{headers:{accept:'application/json',authorization:'Bearer '+bearer},
        cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(9000)});
      const body=await response.json().catch(()=>null);
      if(id!==sequence)return;
      if(response.status===401){unauthenticated();return;}
      if(!response.ok||!body?.ok)throw new Error('참여 설정을 불러오지 못했습니다.');
      paint(body);
    }catch(error){
      if(id!==sequence)return;
      controls.hidden=true;login.hidden=false;
      message(error.message||'참여 설정 확인에 실패했습니다.',true);
    }
  }
  async function save(change){
    if(busy||!current)return;
    const bearer=token();
    if(!bearer){unauthenticated();return;}
    busy=true;paint(current);message('참여 설정을 저장하는 중입니다.');
    try{
      const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',
        headers:{accept:'application/json','content-type':'application/json',authorization:'Bearer '+bearer},
        body:JSON.stringify(change),signal:AbortSignal.timeout(10000)});
      const data=await response.json().catch(()=>null);
      if(response.status===401){unauthenticated();return;}
      if(!response.ok||!data?.ok)throw new Error(data?.error==='meeting_date_changed'?'모임 날짜가 변경되었습니다. 다시 확인해 주세요.':data?.error==='meeting_not_open'?'이번 모임 신청이 마감되었습니다.':'참여 설정이 저장되지 않았습니다.');
      current=data;
      message('참여 설정이 저장되었습니다.');
      window.dispatchEvent?.(new Event('ekodi:mission-participation-changed'));
    }catch(error){
      message(error.message||'저장에 실패했습니다.',true);
      // Restore the prior server-confirmed state; never claim a failed change was saved.
    }finally{
      const failure=status.dataset.state==='error'?status.textContent:'';
      busy=false;
      if(current)paint(current);
      if(failure)message(failure,true);
    }
  }
  recurring.addEventListener('change',()=>{void save({kind:'recurring',enabled:recurring.checked})});
  buttons.forEach(button=>button.addEventListener('click',()=>{void save({
    kind:'meeting',meetingDate:current?.meeting?.date,attendance:button.dataset.missionRsvp
  })}));
  window.addEventListener('ekodi:mission-auth-changed',()=>{void load()});
  window.addEventListener('ekodi:auth-logout',()=>{sequence++;unauthenticated()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});
  void load();
})();