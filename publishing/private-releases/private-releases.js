const API='/api/private-releases';
const $=id=>document.getElementById(id);
const msg=(message,error=false)=>{const el=$('status');el.textContent=message;el.dataset.error=String(error);};
let records=[],selected=null,csrf=null;
const KST=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
  hour12:false});
const dt=iso=>{if(!iso)return '미지정';try{return KST.format(new Date(iso));}catch{return '확인 필요';}};
const states={private_registered:'비공개 등록',scheduled:'예약 완료',
  preparing:'공개 준비',prepared:'두 채널 준비',activating:'동시 활성화 검증',
  ready_to_release:'최종 공개 확인',released:'공개됨',cancelled:'취소됨',blocked:'검수 보류'};
async function api(path='',method='GET',payload){
  const headers={accept:'application/json'};
  if(method!=='GET'){
    if(!csrf)await loadCsrf();
    headers['content-type']='application/json';headers['x-ekodi-csrf']=csrf;
  }
  const response=await fetch(API+path,{method,credentials:'same-origin',cache:'no-store',
    headers,body:payload===undefined?undefined:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({error:'unexpected-response'}));
  if(!response.ok)throw new Error(data.error||'HTTP '+response.status);
  return data;
}
async function loadCsrf(){
  const res=await fetch(API+'/csrf',{credentials:'same-origin',cache:'no-store'});
  const data=await res.json().catch(()=>({}));
  if(!res.ok||typeof data.csrfToken!=='string')throw new Error('CSRF 토큰 또는 출판 권한 확인 실패');
  csrf=data.csrfToken;
}
function node(tag,text){const el=document.createElement(tag);el.textContent=text||'';return el;}
function renderDetail(){
  const record=records.find(x=>x.editionId===selected);
  $('detailSection').hidden=!record;
  if(!record)return;
  const dl=$('detail');dl.replaceChildren();
  for(const [label,value] of [
    ['판본',record.editionId],['공개 상태',states[record.state]||record.state],
    ['작품',record.publicationId],['정본 해시',record.releaseDigest],
    ['공개 예정',dt(record.publishAt)],['서점 준비',record.channels?.books?.prepared?'확인':'대기'],
    ['몰 준비',record.channels?.ekodimall?.prepared?'확인':'대기'],
    ['공개 승인','저자·출판사 서명과 정본 파일을 서버에서 확인'],
  ]){dl.append(node('dt',label),node('dd',value||''));}
  const editable=['private_registered','scheduled'].includes(record.state);
  $('scheduleBtn').disabled=!editable;
  $('cancelBtn').disabled=record.state==='released'||record.state==='cancelled';
}
function render(){
  const tbody=$('rows');tbody.replaceChildren();
  if(!records.length){const tr=node('tr');const td=node('td','비공개 등록 도서가 없습니다.');td.colSpan=5;tr.append(td);tbody.append(tr);}
  records.forEach((record,i)=>{
    const tr=node('tr');tr.append(node('td',String(i+1)),node('td',record.title||record.editionId),
      node('td',states[record.state]||record.state),node('td',dt(record.publishAt)));
    const td=node('td'),button=node('button','관리');
    button.type='button';button.setAttribute('aria-pressed',String(selected===record.editionId));
    button.addEventListener('click',()=>{selected=record.editionId;render();});
    td.append(button);tr.append(td);tbody.append(tr);
  });
  renderDetail();
}
async function reload(){
  try{const result=await api('?limit=100');records=result.records||[];if(selected&&!records.some(x=>x.editionId===selected))selected=null;render();msg('비공개 도서 목록을 확인했습니다.');}
  catch(e){records=[];selected=null;render();msg('출판 권한 또는 서비스 연결을 확인할 수 없습니다: '+e.message,true);}
}
$('reload').addEventListener('click',reload);
$('registerForm').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const editionId=$('editionId').value.trim();
  if(!editionId)return;
  try{const r=await api('/register','POST',{editionId});
    selected=r.record.editionId;$('editionId').value='';await reload();msg('정본 검증을 통과하여 비공개 등록했습니다.');}
  catch(e){msg('등록 실패: '+e.message,true);}
});
$('scheduleForm').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const record=records.find(x=>x.editionId===selected);
  if(!record)return;
  const local=$('releaseTime').value;
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local)){msg('유효한 한국시간 공개일시를 선택해 주세요.',true);return;}
  const publishAt=local+':00+09:00';
  try{await api('/'+encodeURIComponent(record.editionId)+'/schedule','POST',
    {revision:record.revision,publishAt});
    await reload();msg('승인된 판본의 공개 예약을 저장했습니다.');}
  catch(e){msg('예약 실패: '+e.message,true);}
});
$('cancelBtn').addEventListener('click',async()=>{
  const record=records.find(x=>x.editionId===selected);
  if(!record)return;
  if(!confirm('이 판본의 예약을 취소하시겠습니까?'))return;
  try{await api('/'+encodeURIComponent(record.editionId)+'/cancel','POST',
    {revision:record.revision,reason:'publisher-admin-cancelled'});
    await reload();msg('공개 예약을 취소했습니다.');}
  catch(e){msg('취소 실패: '+e.message,true);}
});
reload();
