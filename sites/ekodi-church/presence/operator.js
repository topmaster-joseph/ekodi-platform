// Reusable operator UI. Mount inside the authenticated church/mission workspace:
// mountPresenceOperator(container,{tenant,getToken,apiUrl});
const encode=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const uuid=()=>crypto.randomUUID();
export function mountPresenceOperator(host,{tenant,getToken,apiUrl}){
  if(!host||!['ekodi-church','ekodimission'].includes(tenant)||typeof getToken!=='function'||!/^https:\/\//.test(apiUrl))throw new Error('INVALID_PRESENCE_CONFIG');
  host.innerHTML=`<section class="ekodi-presence"><h2>현장 출결 관리</h2><p>현장 카메라 인원 추정과 개인 출결은 따로 집계됩니다.</p>
  <div class="presence-status" role="status" aria-live="polite">확인 중</div>
  <div class="presence-toolbar"><select aria-label="모임 선택" data-sessions></select><button data-refresh>새로고침</button></div>
  <form data-new-session><strong>모임 개설</strong><input name="title" maxlength="160" required placeholder="모임 제목"><input name="starts_at" type="datetime-local" required><button>모임 생성</button></form>
  <div class="presence-summary" data-summary></div>
  <div class="presence-forms">
  <form data-observe><strong>미확인 참석 기록</strong><input name="label" maxlength="100" placeholder="현장 확인 메모 (선택)"><button>미확인 참석 등록</button></form>
  <form data-headcount><strong>현장 인원 추정</strong><input type="number" name="count" min="0" max="100000" required placeholder="현장 전체 인원"><button>추정 기록</button></form>
  <form data-person><strong>확인된 참석자 등록</strong><input name="display_name" maxlength="120" required placeholder="본인 확인된 이름"><label><input type="checkbox" name="verified" required> 당사자 확인 후 등록</label><button>인물 등록</button></form>
  <form data-checkin><strong>인물 출석 체크</strong><select name="person_id" required data-people></select><button>현장 출석</button></form></div>
  <h3>신원 확인 대기</h3><div data-pending></div>
  <form data-resolve-form hidden class="presence-action-box">
    <strong>확인된 참석자 지정</strong>
    <p data-observation-label></p>
    <select data-resolution-person required aria-label="확인한 참석자 선택"></select>
    <input name="reason" required minlength="5" maxlength="240" placeholder="확인 근거 (예: 예배 후 본인 확인)">
    <div class="presence-actions"><button type="submit">신원 지정 확정</button><button type="button" data-cancel-resolve>취소</button></div>
  </form>
  <h3>확인된 참석자 연결 기록</h3><div data-linked></div>
  <h3>출석 현황</h3><div data-attendees></div>
  </section>`;
  const q=s=>host.querySelector(s);
  const status=q('.presence-status'),sessionSelect=q('[data-sessions]');
  let selected='',snapshot=null,locked=false,resolvingId='';
  function setStatus(s){status.textContent=s;}
  async function call(method,body,query=''){
    const token=await getToken();if(!token)throw new Error('로그인이 필요합니다.');
    const endpoint=`${apiUrl}?tenant=${encodeURIComponent(tenant)}${query}`;
    const response=await fetch(endpoint,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const data=await response.json().catch(()=>({error:'INVALID_RESPONSE'}));
    if(!response.ok)throw new Error(data.error||`HTTP_${response.status}`);
    return data;
  }
  async function mutate(action,data){
    if(locked)return;
    locked=true;
    try{await call('POST',{action,data,request_id:uuid()});await refresh();setStatus('기록했습니다.');}
    catch(e){setStatus(`저장 실패: ${e.message}`);}finally{locked=false;}
  }
  async function refresh(){
    const query=selected?`&session_id=${encodeURIComponent(selected)}`:'';
    snapshot=await call('GET',null,query);
    const sessions=Array.isArray(snapshot.sessions)?snapshot.sessions:[];
    if(!sessions.some(s=>s.id===selected))selected=sessions[0]?.id||'';
    // Re-fetch when selected session differs from the first unscoped snapshot.
    if(selected&&!query)snapshot=await call('GET',null,`&session_id=${encodeURIComponent(selected)}`);
    sessionSelect.innerHTML=sessions.map(s=>`<option value="${encode(s.id)}">${encode(s.title)} (${encode(new Date(s.starts_at).toLocaleDateString('ko-KR'))})</option>`).join('');
    sessionSelect.value=selected;
    const people=Array.isArray(snapshot.people)?snapshot.people:[];
    q('[data-people]').innerHTML=`<option value="">인물 선택</option>`+people.map(p=>`<option value="${encode(p.id)}">${encode(p.name)}</option>`).join('');
    const attendees=(snapshot.attendees||[]).filter(a=>a.status!=='retracted');
    const pending=snapshot.pending||[];
    q('[data-summary]').textContent=`출석 ${new Set(attendees.map(a=>a.person_id)).size}명 · 미확인 기록 ${pending.length}건 · 현장 추정 ${snapshot.headcount?.estimate??'미집계'}명 (합산하지 않음)`;
    q('[data-attendees]').innerHTML=attendees.length?`<ul>${attendees.map(a=>`<li>${encode(a.name)} · ${a.channel==='onsite'?'현장':'온라인'} · ${encode(a.status)}</li>`).join('')}</ul>`:'<p>출석 기록 없음</p>';
    q('[data-pending]').innerHTML=pending.length?pending.map(p=>`<div class="presence-pending"><span>${encode(p.label||'미확인 참석자')} (${encode(p.id.slice(0,8))})</span><button type="button" data-resolve="${encode(p.id)}">신원 지정</button></div>`).join(''):'<p>확인 대기 기록 없음</p>';
    const linked=Array.isArray(snapshot.linked)?snapshot.linked:[];
    q('[data-linked]').innerHTML=linked.length?linked.map(p=>`<div class="presence-pending"><span>${encode(p.label||'현장 기록')} → ${encode(p.name||'확인된 참석자')}</span><button type="button" data-unlink="${encode(p.id)}">연결 취소</button></div>`).join(''):'<p>연결된 미확인 기록 없음</p>';
    const selector=q('[data-resolution-person]');
    selector.innerHTML='<option value="">확인된 인물 선택</option>'+people.map(p=>`<option value="${encode(p.id)}">${encode(p.name)}</option>`).join('');
    if(resolvingId&&!pending.some(p=>p.id===resolvingId)){resolvingId='';q('[data-resolve-form]').hidden=true;}
    for(const el of [q('[data-observe]'),q('[data-headcount]'),q('[data-checkin]')])el.querySelector('button').disabled=!selected;
    setStatus('최신 현황');
  }
  sessionSelect.addEventListener('change',()=>{selected=sessionSelect.value;refresh().catch(e=>setStatus(e.message));});
  q('[data-refresh]').addEventListener('click',()=>refresh().catch(e=>setStatus(e.message)));
  const bind=(selector,action,mapper)=>q(selector).addEventListener('submit',e=>{
    e.preventDefault();const f=e.currentTarget;const data=mapper(new FormData(f));mutate(action,data);f.reset();
  });
  bind('[data-new-session]','open_session',f=>({title:String(f.get('title')),starts_at:new Date(String(f.get('starts_at'))).toISOString()}));
  bind('[data-observe]','observe',f=>({session_id:selected,label:String(f.get('label')||'')}));
  bind('[data-headcount]','record_headcount',f=>({session_id:selected,count:Number(f.get('count')),method:'manual'}));
  bind('[data-person]','register_person',f=>({display_name:String(f.get('display_name')),verified:f.get('verified')==='on'}));
  bind('[data-checkin]','check_in',f=>({session_id:selected,person_id:String(f.get('person_id')),channel:'onsite',verification_method:'staff_verified'}));
  q('[data-pending]').addEventListener('click',e=>{
    const id=e.target.closest('[data-resolve]')?.dataset.resolve;if(!id)return;
    resolvingId=id;
    q('[data-observation-label]').textContent=`선택한 미확인 기록: ${snapshot.pending.find(p=>p.id===id)?.label||id.slice(0,8)}`;
    q('[data-resolve-form]').hidden=false;
    q('[data-resolution-person]').focus();
  });
  q('[data-resolve-form]').addEventListener('submit',e=>{
    e.preventDefault();if(!resolvingId||!selected)return;
    const f=new FormData(e.currentTarget);
    const personId=q('[data-resolution-person]').value;
    if(!personId)return;
    const reason=String(f.get('reason')||'').trim();
    if(reason.length<5){setStatus('확인 근거를 5자 이상 입력하세요.');return;}
    const observationId=resolvingId;
    resolvingId='';q('[data-resolve-form]').hidden=true;
    mutate('resolve',{session_id:selected,observation_id:observationId,person_id:personId,verification_reason:reason});
    e.currentTarget.reset();
  });
  q('[data-cancel-resolve]').addEventListener('click',()=>{resolvingId='';q('[data-resolve-form]').hidden=true;});
  q('[data-linked]').addEventListener('click',e=>{
    const id=e.target.closest('[data-unlink]')?.dataset.unlink;if(!id)return;
    const reason=prompt('연결 취소 사유를 5자 이상 입력하세요. 기존 기록은 감사 내역에 보존됩니다.');
    if(!reason||reason.trim().length<5)return;
    mutate('unlink',{session_id:selected,observation_id:id,reason:reason.trim()});
  });
  refresh().catch(e=>setStatus(`조회 실패: ${e.message}`));
  return {refresh,destroy:()=>{host.replaceChildren();}};
}