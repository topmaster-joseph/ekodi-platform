// 청계면상인회 모터페스티벌 2026 참여 신청 — same-origin client for the Control API.
// The browser holds no keys. The server validates, encrypts and stores; a receipt is shown only
// when the server returns one after a confirmed write.
const API='/api/merchant-events/motor-festival-2026/applications';
const CLOSES_AT=Date.parse('2026-10-25T08:00:00+09:00');
const form=document.querySelector('#apply');
const button=document.querySelector('#submit');
const status=document.querySelector('#status');
const newKey=()=>'mf26-'+(crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''));
let submissionKey=newKey();

const MESSAGES={
  REGISTRATION_CLOSED:'신청이 마감되었습니다. (2026년 10월 25일 오전 8시 마감)',
  CONSENT_REQUIRED:'개인정보 수집·이용에 동의해야 신청할 수 있습니다.',
  PHONE_INVALID:'연락처 형식을 확인해 주세요. (예: 010-1234-5678)',
  DUPLICATE_LIMIT:'같은 연락처로 이미 여러 번 신청되었습니다. 수정이 필요하면 상인회로 연락해 주세요.',
  TOO_MANY_REQUESTS:'요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  IDEMPOTENCY_CONFLICT:'페이지를 새로고침한 뒤 다시 신청해 주세요.',
};
function show(kind,parts){
  status.className='msg '+kind;
  status.replaceChildren(...parts.map(part=>{
    if(typeof part==='string')return document.createTextNode(part);
    const el=document.createElement(part.tag||'span');el.textContent=part.text;if(part.className)el.className=part.className;return el;
  }));
}
function collect(){
  const data={activity:[],support:[]};
  for(const [key,value] of new FormData(form)){
    if(key==='activity'||key==='support')data[key].push(String(value));
    else data[key]=String(value);
  }
  data.consent=form.elements.consent.checked?'on':'';
  return data;
}
if(Date.now()>=CLOSES_AT){
  button.disabled=true;
  show('err',[MESSAGES.REGISTRATION_CLOSED]);
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  button.disabled=true;
  show('',['접수 중입니다…']);
  try{
    const response=await fetch(API,{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'content-type':'application/json','x-ekodi-intake-request':'1','idempotency-key':submissionKey},
      body:JSON.stringify(collect()),
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.receipt_id){
      const message=MESSAGES[result.code]||result.error||('서버 접수 실패 ('+response.status+')');
      show('err',['접수가 완료되지 않았습니다. ',message]);
      return;
    }
    show('ok',['신청이 접수되었습니다. 접수번호 ',{tag:'span',className:'receipt',text:result.receipt_id},
      result.reused?' (이미 접수된 신청입니다)':'',' — 이 번호를 보관해 주세요.']);
    form.reset();
    submissionKey=newKey();
  }catch{
    show('err',['네트워크 오류로 접수를 확인하지 못했습니다. 잠시 후 같은 화면에서 다시 제출하면 중복 없이 처리됩니다.']);
  }finally{
    if(Date.now()<CLOSES_AT)button.disabled=false;
  }
});
