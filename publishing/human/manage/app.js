// Browser UI for EKODI publishing workflow. Server remains the authorization authority.
const $=id=>document.getElementById(id);
const BASE='/publishing/api/workflow';
const STAGES=[
  ['planning','기획'],['drafting','집필'],['in_review','검수'],
  ['ready_for_author','저자 승인'],['publisher_approved','발행 승인'],['scheduled','예약'],
];
const LABELS={planning:'기획',drafting:'집필 중',in_review:'편집 검수',changes_requested:'수정 요청',
  ready_for_author:'저자 승인 대기',author_approved:'저자 승인 완료',
  publisher_approved:'발행 승인 완료',scheduled:'출간 예약',
  handoff_ready:'판매 등록 인계 대기',released:'판매 활성화 확인'};
let projects=[],active=null,userRole='author',connected=false;
function getToken(){
  for(const key of ['sb-renzehysxirjilvdxacv-auth-token','ekodi-books-buyer-session']){
    try{
      const x=JSON.parse(localStorage.getItem(key)||'null');
      const v=x?.currentSession||x?.session||x;
      if(v?.access_token)return v.access_token;
      if(v?.accessToken)return v.accessToken;
    }catch{}
  }return '';
}
async function api(path,options={}){
  const token=getToken();
  if(!token)throw Object.assign(new Error('LOGIN_REQUIRED'),{status:401});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(BASE+path,{...options,
      headers:{authorization:'Bearer '+token,'content-type':'application/json',...(options.headers||{})},
      cache:'no-store',signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.code||'HTTP_'+response.status),{status:response.status,blockers:data.blockers});
    return data;
  }finally{clearTimeout(timer)}
}
function tell(text){$('result').textContent=text;}
function errorText(error){
  if(error.status===401)return '로그인이 필요합니다. 에코디 계정으로 로그인해 주세요.';
  if(error.status===503)return '출판 업무 원장이 아직 연결되지 않았습니다. 운영 저장소 적용 전에는 기록을 변경할 수 없습니다.';
  if(error.code==='REVISION_CONFLICT')return '다른 작업자가 원고를 수정했습니다. 새로고침 후 다시 실행하세요.';
  return String(error.message||error)+(error.blockers?.length?'\n미완료: '+error.blockers.join(', '):'');
}
function loginLink(){
  const a=document.createElement('a');
  const u=new URL('https://ekodi.kr/auth/');u.searchParams.set('return_to',location.href);a.href=u.href;
  a.textContent='에코디 계정 로그인';
  return a;
}
function enableForms(enabled){
  connected=enabled;
  for(const elm of $('createForm').querySelectorAll('button,input,select'))elm.disabled=!enabled;
}
async function load(){
  $('connection').textContent='출판 업무 원장 연결 확인 중…';
  try{
    const health=await fetch(BASE+'/health',{cache:'no-store'}).then(x=>x.json());
    if(!health.dbConfigured){enableForms(false);throw Object.assign(new Error('PUBLISH_DB_NOT_CONFIGURED'),{status:503});}
    const data=await api('/projects');
    projects=data.projects||[];userRole=data.role||'author';enableForms(true);
    $('connection').textContent='출판 업무 원장 연결 · 권한: '+userRole+' · 예약 후에도 자동 판매되지 않습니다.';
    showList();
    if(active){
      active=projects.find(p=>p.id===active.id)||null;
      renderDetail();
    }
  }catch(e){
    enableForms(false);
    $('connection').textContent=errorText(e);
    if(e.status===401)$('connection').append(document.createTextNode(' '),loginLink());
    $('rows').replaceChildren();const tr=$('rows').insertRow();const td=tr.insertCell();td.colSpan=7;td.textContent='자료를 불러오지 못했습니다.';
  }
}
function showList(){
  $('counts').textContent=projects.length+'개 프로젝트 · '+userRole;
  $('rows').replaceChildren();
  if(!projects.length){const row=$('rows').insertRow();const cell=row.insertCell();cell.colSpan=7;cell.textContent='등록된 프로젝트가 없습니다.';return;}
  projects.forEach((p,i)=>{
    const row=$('rows').insertRow();
    const values=[i+1,p.title,p.fieldId,LABELS[p.stage]||p.stage,
      p.scheduledAt?new Date(p.scheduledAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미예약',p.revision];
    values.forEach((value,j)=>{const cell=row.insertCell();cell.textContent=String(value);if(j===3)cell.className='tag';});
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='관리';
    button.addEventListener('click',()=>{active=p;renderDetail();$('selected').scrollIntoView({behavior:'smooth',block:'start'});});
    row.insertCell().append(button);
  });
}
function button(text,fn){
  const b=document.createElement('button');b.type='button';b.textContent=text;
  b.addEventListener('click',async()=>{
    b.disabled=true;try{await fn();await load();tell(text+' 처리 완료');}
    catch(e){tell('처리 실패: '+errorText(e));}
    finally{b.disabled=false;}
  });
  $('actions').append(b);
}
async function transition(action,extra={}){
  if(!active) return;
  return api('/projects/'+active.id+'/transition',{method:'POST',body:JSON.stringify({
    action,revision:active.revision,...extra})});
}
function askDigest(label,current){
  const digest=prompt(label,current||'');
  if(digest===null)return null;
  if(!/^[a-f0-9]{64}$/.test(digest.trim()))throw Error('SHA-256 지문은 64자리 소문자 16진수여야 합니다.');
  return digest.trim();
}
function renderDetail(){
  const p=active;
  $('selected').hidden=!p;
  if(!p)return;
  $('detailTitle').textContent=p.title+' · '+(LABELS[p.stage]||p.stage);
  $('editionInfo').textContent='원고 버전 '+p.editionId+' · 개정 '+p.revision+' · 출간 예약은 저자·발행자 승인 이후 가능';
  $('manuscriptDigest').value=p.manuscriptDigest||'';
  $('releaseDigest').value=p.releaseDigest||'';
  const order=STAGES.map(([id,label])=>id==='ready_for_author'?['author_approved',label]:[id,label]);
  let idx=order.findIndex(([s])=>s===p.stage);
  if(p.stage==='changes_requested')idx=1;
  if(p.stage==='ready_for_author')idx=3;
  if(p.stage==='handoff_ready'||p.stage==='released')idx=5;
  $('stageStrip').replaceChildren();
  order.forEach(([id,label],i)=>{
    const e=document.createElement('span');e.className='stage '+(i===idx?'active':i>idx?'pending':'');
    e.textContent=(i+1)+'. '+label;$('stageStrip').append(e);
  });
  $('actions').replaceChildren();tell('');
  button('판매 준비조건 확인',async()=>{
    const info=await api('/projects/'+p.id+'/readiness');
    tell(info.saleReadyForPublisherReview
      ? '비공개 자격·계약·오디오 검수 기록 확인됨. 실제 서점·몰 판매 및 구매자 제공은 별도 배포 승인 전입니다.'
      : '판매 불가: '+(info.blocker||'준비 조건 확인 필요')+' · 개인 원고 보관 및 집필은 계속 가능합니다.');
  });
  if(['planning','drafting','changes_requested'].includes(p.stage)){
    button('원고 새 판본 기록',async()=>{
      const digest=askDigest('실제 원고 파일의 SHA-256 지문을 입력하세요.',$('manuscriptDigest').value);
      if(digest)await transition('revise',{manuscriptDigest:digest,changedMetadata:true});
    });
    if(p.stage!=='planning')button('편집 검수 요청',()=>transition('submit'));
  }
  if(p.stage==='in_review'){
    button('수정 요청',async()=>{const notes=prompt('수정 요청 사유');if(notes?.trim())await transition('request_changes',{notes});});
    button('검수 통과',()=>transition('editor_pass',{checklist:{completed:true}}));
  }
  if(p.stage==='ready_for_author')button('저자 직접 승인',async()=>{
    if(!confirm('이 원고와 출간 파일 정본에 대한 저작권 및 출간 동의를 확인하시겠습니까?'))return;
    const digest=askDigest('승인할 최종 출간 파일 지문을 확인하세요.',p.releaseDigest);
    if(digest)await transition('author_approve',{digest,rightsConsent:true});
  });
  if(p.stage==='author_approved')button('발행자 최종 승인',async()=>{
    const digest=askDigest('출판 QA와 권리 증빙 검토 후 승인할 정본 지문',p.releaseDigest);
    if(digest)await transition('publisher_approve',{digest});
  });
  if(p.stage==='publisher_approved')button('판매 예약 등록',async()=>{
    const korean=prompt('예약 출간일시 (한국시간 YYYY-MM-DD HH:MM)');
    if(!korean)return;
    const m=/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)$/.exec(korean.trim());
    if(!m)throw Error('날짜는 YYYY-MM-DD HH:MM 형식으로 입력하세요.');
    const local=new Date(korean.replace(' ','T')+':00+09:00');
    if(!Number.isFinite(local.getTime()))throw Error('예약일을 확인하세요.');
    await transition('schedule',{digest:p.releaseDigest,scheduledAt:local.toISOString(),channels:['books','ekodimall']});
  });
  if(p.stage==='scheduled')button('예약 도래·인계 심사',()=>transition('prepare_handoff'));
  if(p.stage==='handoff_ready')tell('최종 승인 정본을 서점·몰에 서명 전달하고 양 채널 등록 증거를 확인하기 전에는 공개 판매하지 않습니다.');
  loadJobs().catch(()=>{});
}
async function loadJobs(){
  if(!active)return;
  const id=active.id,holder=$('aiJobs');holder.textContent='';
  try{
    const data=await api('/projects/'+id+'/ai');
    holder.textContent=(data.jobs||[]).slice(0,12).map(j=>j.kind+' · '+j.status+' · '+j.created_at).join('\n')||'요청된 AI 작업이 없습니다.';
  }catch(e){holder.textContent=errorText(e);}
}
$('createForm').addEventListener('submit',async(e)=>{
  e.preventDefault();if(!connected)return;
  try {
    await api('/projects',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});
    e.currentTarget.reset();await load();
  }catch(error){$('connection').textContent=errorText(error);}
});
$('aiForm').addEventListener('submit',async(e)=>{
  e.preventDefault();if(!active)return;
  const data=new FormData(e.currentTarget);
  try{
    await api('/projects/'+active.id+'/ai',{method:'POST',
      body:JSON.stringify({kind:data.get('kind'),provider:'core',spendKrw:0,ownerConsent:data.get('consent')==='on'})});
    tell('AI 집필 요청을 대기열에 등록했습니다. 실행·완료를 뜻하지 않습니다.');
    await loadJobs();
  }catch(err){tell(errorText(err));}
});
$('saveEvidence').addEventListener('click',async()=>{
  if(!active)return;
  try{
    const releaseCandidate=JSON.parse($('releaseEvidence').value);
    const digest=askDigest('검증을 마친 EPUB·출간파일 SHA-256', $('releaseDigest').value);
    if(!digest)return;
    await api('/projects/'+active.id+'/evidence',{method:'POST',body:JSON.stringify({
      revision:active.revision,releaseDigest:digest,manuscriptDigest:active.manuscriptDigest,releaseCandidate})});
    tell('검수 증빙 저장 완료');await load();
  }catch(err){tell(errorText(err));}
});
$('refresh').addEventListener('click',load);
enableForms(false);load();
