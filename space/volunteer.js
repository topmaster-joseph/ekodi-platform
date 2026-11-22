(()=>{
'use strict';
const form=document.querySelector('[data-volunteer-form]');
const getJson=async response=>response.json().catch(()=>({}));
const fmt=v=>new Intl.NumberFormat('ko-KR').format(Number(v)||0);
const api='/volunteer/api/';
if(form){
 const slug=form.dataset.campaign;
 const mode=form.elements.namedItem('mode'),party=form.elements.namedItem('partySize'),bricks=form.elements.namedItem('bricks');
 const partyBox=form.querySelector('[data-volunteer-party]'),pledgeBox=form.querySelector('[data-volunteer-pledge]'),amount=form.querySelector('[data-pledge-total]');
 const btn=form.querySelector('[type=submit]'),message=form.querySelector('[data-status]'),availability=document.querySelector('[data-registration-state]');
 let open=false,saving=false;
 function sync(){
   const value=mode.value,doesVolunteer=value!=='pledge',doesPledge=value!=='volunteer';
   party.disabled=!doesVolunteer;party.required=doesVolunteer;partyBox.hidden=!doesVolunteer;
   bricks.disabled=!doesPledge;bricks.required=doesPledge;pledgeBox.hidden=!doesPledge;
   if(doesVolunteer&&Number(party.value)<1)party.value='1';
   if(!doesVolunteer)party.value='0';
   if(doesPledge&&Number(bricks.value)<1)bricks.value='10';
   if(!doesPledge)bricks.value='0';
   amount.textContent=fmt(Number(bricks.value)*1300)+'원';
   btn.disabled=!open||saving;
 }
 mode.addEventListener('change',sync);bricks.addEventListener('input',sync);
 sync();
 fetch(api+'campaigns/'+encodeURIComponent(slug)+'/status',{cache:'no-store',headers:{accept:'application/json'}})
  .then(getJson).then(data=>{
    open=data.ok===true&&data.registration_open===true;
    if(availability){
      availability.textContent=!data.ok?'현재 접수 상태를 확인할 수 없어 신청이 잠시 중단되었습니다.':
        !open?'신청 기한이 종료되었습니다.':
        '접수 중 · 봉사 참여 '+fmt(data.applied_count)+'명 / 정원 '+fmt(data.capacity)+'명'+(Number(data.waitlist_count)>0?' · 대기 '+fmt(data.waitlist_count)+'명':'');
    }
    sync();
  }).catch(()=>{open=false;if(availability)availability.textContent='접수 상태를 확인할 수 없습니다. 잠시 후 다시 방문해 주세요.';sync()});
 form.addEventListener('submit',async event=>{
   event.preventDefault();message.textContent='';message.dataset.state='';
   if(!open||saving)return;
   if(!form.reportValidity())return;
   const raw=new FormData(form),purpose=String(raw.get('mode')||'volunteer');
   const payload={name:String(raw.get('name')||'').trim(),phone:String(raw.get('phone')||'').trim(),affiliation:String(raw.get('affiliation')||'').trim(),
     mode:purpose,partySize:purpose==='pledge'?0:Number(raw.get('partySize')||0),bricks:purpose==='volunteer'?0:Number(raw.get('bricks')||0),
     note:String(raw.get('note')||'').trim(),privacyConsent:raw.get('privacyConsent')==='on',photoConsent:raw.get('photoConsent')==='on',website:String(raw.get('website')||'')};
   saving=true;sync();message.textContent='신청 내용을 안전하게 저장하고 있습니다.';
   try{
     const response=await fetch(api+'campaigns/'+encodeURIComponent(slug)+'/apply',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),credentials:'same-origin'});
     const data=await getJson(response);
     if(!response.ok||!data.ok||!data.receiptId)throw new Error(data.message||'접수 저장을 확인하지 못했습니다.');
     message.dataset.state='success';
     const label=data.participationStatus==='waitlist'?'봉사 참여는 대기자로 접수됐습니다.':'봉사 참여 신청이 접수됐습니다.';
     message.textContent=(purpose==='pledge'?'연탄 후원 약정이 접수됐습니다.':label)+(purpose!=='volunteer'?' 입금은 별도로 진행하고 담당자 확인을 받으세요.':'')+' 접수번호: '+String(data.receiptId).slice(0,8);
     open=false;btn.textContent='접수 완료';sync();message.focus?.();
     try{const bus=new BroadcastChannel('ekodi-volunteer-application');bus.postMessage({campaign:slug,at:Date.now()});bus.close()}catch{}
   }catch(err){message.dataset.state='error';message.textContent=err.message||'신청 처리에 문제가 생겼습니다.';}
   finally{saving=false;sync();}
 });
}
const admin=document.querySelector('[data-volunteer-admin]');
if(admin){
 const status=admin.querySelector('[data-admin-status]'),login=admin.querySelector('[data-admin-login]'),wrap=admin.querySelector('[data-admin-table]'),rows=admin.querySelector('[data-pledge-rows]');
 const campaign='2026-coal-delivery';
 const accessToken=()=>window.EKODIMissionAuth?.getToken?.()||sessionStorage.getItem('ekodi-auth-token')||'';
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