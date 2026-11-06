// Browser UI for EKODI publishing workflow. Server remains the authorization authority.
const $=id=>document.getElementById(id);
const ORIGIN='https://ekodi.kr';
// Compose complete URLs so the apex router cannot prefix individual API suffixes.
const BASE=`${ORIGIN}/publishing/api/workflow`;
const AUTH_KEYS=['sb-renzehysxirjilvdxacv-auth-token','ekodi-books-buyer-session'];
// Public Supabase publishable key, shared with EKODI's existing central auth client.
const AUTH_SERVER='https://renzehysxirjilvdxacv.supabase.co/auth/v1/logout?scope=local';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const STAGES=[
  ['planning','기획'],['drafting','집필'],['in_review','검수'],
  ['ready_for_author','저자 승인'],['publisher_approved','발행 승인'],['scheduled','예약'],
];
const LABELS={planning:'기획',drafting:'집필 중',in_review:'편집 검수',changes_requested:'수정 요청',
  ready_for_author:'저자 승인 대기',author_approved:'저자 승인 완료',
  publisher_approved:'발행 승인 완료',scheduled:'출간 예약',
  handoff_ready:'판매 등록 인계 대기',released:'판매 활성화 확인'};
let projects=[],active=null,userRole='author',connected=false;
let requestVersion=0;
// 화면에 영문 코드 대신 우리말을 보인다(코드는 그대로 서버와 주고받는다).
const ROLE_KO={admin:'출판 관리자',editor:'편집자',author:'저자',reviewer:'검수자',publisher:'발행자'};
const BLOCKER_KO={PUBLISHING_RELEASE_NOT_CONFIGURED:'서점 판매 연결이 아직 설정되지 않았습니다(운영자 설정 필요)',
  SEPARATE_SIGNED_PUBLISHING_CONTRACT_REQUIRED:'서명된 출판 계약이 필요합니다',FREE_PREMIUM_AUDIOBOOK_QA_REQUIRED:'오디오북 검수가 먼저 필요합니다',
  NO_VERIFIED_PAID_MEMBERSHIP:'확인된 유료 회원 자격이 없습니다',MEMBERSHIP_READ_FAILED:'회원 자격을 확인하지 못했습니다(잠시 후 다시 시도)',
  MEMBERSHIP_READ_NOT_CONFIGURED:'회원 자격 확인이 아직 설정되지 않았습니다',PUBLISHER_DATABASE_UNAVAILABLE:'출판 기록 저장소에 연결하지 못했습니다(잠시 후 다시 시도)',
  VERIFICATION_UNAVAILABLE:'확인 서비스에 연결하지 못했습니다(잠시 후 다시 시도)',AUTHOR_ID_INVALID:'저자 정보가 올바르지 않습니다'};
const blockerText=code=>BLOCKER_KO[code]||(code?'준비 조건 확인 필요':'준비 조건 확인 필요');
const fieldLabel=id=>{try{const o=[...document.querySelectorAll('select[name=fieldId] option')].find(x=>x.value===id);if(o)return o.textContent;}catch{}return id||'-';};
function getToken(){
  for(const key of AUTH_KEYS){
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
    const response=await fetch(`${BASE}/${path}`,{...options,
      headers:{authorization:'Bearer '+token,'content-type':'application/json',...(options.headers||{})},
      cache:'no-store',signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.code||'HTTP_'+response.status),{status:response.status,blockers:data.blockers});
    return data;
  }finally{clearTimeout(timer)}
}
function tell(text){$('result').textContent=text;}
function errorText(error){
  if(error.message==='JUBILEE_OWNER_NOT_CONFIGURED')return '희년신학 저자 계정이 출판 서버에 연결되지 않았습니다. 에코디 관리자에게 저자 신원 연결을 요청하세요. 공개·판매 기능은 비활성 상태입니다.';
  if(error.message==='JUBILEE_OWNER_ONLY')return '현재 로그인 계정은 희년신학 시리즈의 지정 저자 계정이 아닙니다. 올바른 계정으로 로그인해 주세요.';
  if(error.message==='JUBILEE_DRAFT_LOOKUP_FAILED')return '희년신학 도서의 비공개 등록 후 재조회에 실패했습니다. 새로고침하여 실제 등록 상태를 다시 확인해 주세요.';
  if(error.status===401)return '로그인이 필요합니다. 에코디 계정으로 로그인해 주세요.';
  if(error.status===403)return '현재 계정에는 출판 관리 권한이 없습니다. 다른 계정을 사용하려면 로그아웃해 주세요.';
  if(error.status===503)return '출판 업무 원장이 아직 연결되지 않았습니다. 운영 저장소 적용 전에는 기록을 변경할 수 없습니다.';
  if(error.code==='REVISION_CONFLICT')return '다른 작업자가 원고를 수정했습니다. 새로고침 후 다시 실행하세요.';
  return String(error.message||error)+(error.blockers?.length?'\n미완료: '+error.blockers.join(', '):'');
}
function loginLink(){
  const a=document.createElement('a');
  const u=new URL('https://ekodi.kr/auth/');u.searchParams.set('site','publishing');u.searchParams.set('return_to',location.href);a.href=u.href;
  a.textContent='에코디 계정 로그인';
  return a;
}
// Only a successful publishing API response proves the signed-in UI state.
function setAuthControls(state){
  $('authLogin').hidden=state==='authenticated';
  $('authLogout').hidden=state!=='authenticated';
}
function sessionTokens(){
  const tokens=new Set();
  for(const key of AUTH_KEYS){
    try{
      const x=JSON.parse(localStorage.getItem(key)||'null');
      const v=x?.currentSession||x?.session||x;
      const token=v?.access_token||v?.accessToken;
      if(token)tokens.add(token);
    }catch{}
  }
  return [...tokens];
}
async function signOut(){
  const control=$('authLogout');
  control.disabled=true;
  ++requestVersion;
  enableForms(false);
  // Revoke each distinct browser session via the established EKODI auth provider.
  const requests=sessionTokens().map(async token=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(AUTH_SERVER,{method:'POST',headers:{
        apikey:PUBLISHABLE_KEY,authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});
      return response.ok||response.status===401;
    }catch{return false;}
    finally{clearTimeout(timer);}
  });
  const outcomes=await Promise.all(requests);
  ++requestVersion; // Discard any in-flight authenticated project response.
  for(const key of AUTH_KEYS){try{localStorage.removeItem(key);}catch{}}
  projects=[];active=null;renderDetail();enableForms(false);
  setAuthControls('guest');
  try{
    await load();
    if(outcomes.some(ok=>!ok))$('connection').append(document.createTextNode(
      ' 브라우저에서는 로그아웃되었으나 서버 세션 종료 응답은 확인되지 않았습니다.'));
  }finally{control.disabled=false;}
}
function enableForms(enabled){
  connected=enabled;
  $('jubileeRegister').disabled=!enabled;
  for(const elm of $('createForm').querySelectorAll('button,input,select'))elm.disabled=!enabled;
}
async function load(){
  const version=++requestVersion;
  $('connection').textContent='출판 업무 원장 연결 확인 중…';
  $('authLogin').href=loginLink().href;
  try{
    const health=await fetch(`${BASE}/health`,{cache:'no-store'}).then(x=>x.json());
    if(version!==requestVersion)return;
    if(!health.dbConfigured){enableForms(false);throw Object.assign(new Error('PUBLISH_DB_NOT_CONFIGURED'),{status:503});}
    const data=await api('projects');
    if(version!==requestVersion)return;
    projects=data.projects||[];userRole=data.role||'author';enableForms(true);
    setAuthControls('authenticated');
    $('connection').textContent='출판 업무 원장 연결 · 권한: '+userRole+' · 예약 후에도 자동 판매되지 않습니다.';
    showList();
    if(active){
      active=projects.find(p=>p.id===active.id)||null;
      renderDetail();
    }
  }catch(e){
    if(version!==requestVersion)return;
    enableForms(false);
    setAuthControls(e.status===403?'authenticated':'guest');
    projects=[];active=null;renderDetail();
    $('counts').textContent=e.status===401?'로그인 필요':'자료 확인 불가';
    $('connection').textContent=errorText(e);
    $('rows').replaceChildren();const tr=$('rows').insertRow();const td=tr.insertCell();td.colSpan=7;
    td.textContent=e.status===401?'로그인 후 원고 프로젝트를 확인할 수 있습니다.':'자료를 불러오지 못했습니다.';
  }
}
function showList(){
  $('counts').textContent=projects.length+'개 프로젝트 · '+(ROLE_KO[userRole]||userRole);
  $('rows').replaceChildren();
  if(!projects.length){const row=$('rows').insertRow();const cell=row.insertCell();cell.colSpan=7;cell.textContent='등록된 프로젝트가 없습니다.';return;}
  projects.forEach((p,i)=>{
    const row=$('rows').insertRow();
    const values=[i+1,p.title,fieldLabel(p.fieldId),LABELS[p.stage]||p.stage,
      p.scheduledAt?new Date(p.scheduledAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미예약',p.revision];
    values.forEach((value,j)=>{const cell=row.insertCell();if(j===3){const t=document.createElement('span');t.className='tag';t.textContent=String(value);cell.append(t);}else cell.textContent=String(value);});
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='관리';
    button.addEventListener('click',()=>{active=p;renderDetail();$('selected').scrollIntoView({behavior:'smooth',block:'start'});});
    row.insertCell().append(button);
  });
}
function button(text,fn){
  const b=document.createElement('button');b.type='button';b.textContent=text;
  b.addEventListener('click',async()=>{
    b.disabled=true;try{const outcome=await fn();if(outcome===false)return;await load();tell(text+' 처리 완료');}
    catch(e){tell('처리 실패: '+errorText(e));}
    finally{b.disabled=false;}
  });
  $('actions').append(b);
}
async function transition(action,extra={}){
  if(!active) return;
  return api(`projects/${active.id}/transition`,{method:'POST',body:JSON.stringify({
    action,revision:active.revision,...extra})});
}
function askDigest(label,current){
  const digest=prompt(label,current||'');
  if(digest===null)return null;
  if(!/^[a-f0-9]{64}$/.test(digest.trim()))throw Error('SHA-256 지문은 64자리 소문자 16진수여야 합니다.');
  return digest.trim();
}

const DIGEST_FILE_LIMIT=100*1024*1024; // Mobile browsers should not hash huge files in memory.
let stagedManuscript=null,stagedRelease=null;
const hashGeneration={manuscript:0,release:0};
function resetFileSelection(){
  hashGeneration.manuscript++;
  hashGeneration.release++;
  stagedManuscript=null;stagedRelease=null;
  $('manuscriptFile').value='';
  $('releaseFile').value='';
  $('digestStatus').textContent='';
}
async function fileSha256(file){
  if(!file||typeof file.arrayBuffer!=='function')throw Error('해시를 계산할 원고 파일을 선택해 주세요.');
  if(file.size> DIGEST_FILE_LIMIT)throw Error('파일이 100MB를 초과합니다. 용량을 줄인 정본으로 다시 선택해 주세요.');
  if(!globalThis.crypto?.subtle)throw Error('보안 연결에서 SHA-256 계산을 사용할 수 없습니다.');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function hashSelectedFile(kind){
  const manuscript=kind==='manuscript';
  const input=$(manuscript?'manuscriptFile':'releaseFile');
  const digestInput=$(manuscript?'manuscriptDigest':'releaseDigest');
  const status=$('digestStatus');
  const file=input.files?.[0];
  const projectId=active?.id;
  const generation=++hashGeneration[kind];
  digestInput.value='';
  if(manuscript)stagedManuscript=null;else stagedRelease=null;
  if(!file){status.textContent='파일 선택이 취소됐습니다. 파일을 다시 선택해 주세요.';return;}
  if(!projectId){status.textContent='먼저 원고 프로젝트를 선택해 주세요.';return;}
  status.textContent='파일 지문을 계산하고 있습니다: '+file.name;
  try{
    const digest=await fileSha256(file);
    if(generation!==hashGeneration[kind]||active?.id!==projectId||input.files?.[0]!==file)return;
    const proof={projectId,digest,fileName:file.name};
    if(manuscript)stagedManuscript=proof;else stagedRelease=proof;
    digestInput.value=digest;
    status.textContent=file.name+' · SHA-256 계산 완료. 파일 자체는 업로드되지 않았습니다.';
  }catch(error){
    if(generation!==hashGeneration[kind]||active?.id!==projectId)return;
    status.textContent='계산 실패: '+error.message;
  }
}
function renderDetail(){
  const p=active;
  $('selected').hidden=!p;
  if(!p)return;
  $('detailTitle').textContent=p.title+' · '+(LABELS[p.stage]||p.stage);
  $('editionInfo').textContent='원고 '+p.revision+'판 · 출간 예약은 저자·발행자 승인 이후 가능';$('editionInfo').title='판본 번호 '+p.editionId;
  resetFileSelection();
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
    const info=await api(`projects/${p.id}/readiness`);
    tell(info.saleReadyForPublisherReview
      ? '비공개 자격·계약·오디오 검수 기록 확인됨. 실제 서점·몰 판매 및 구매자 제공은 별도 배포 승인 전입니다.'
      : '판매 불가: '+blockerText(info.blocker)+' · 원고 보관과 집필은 계속할 수 있습니다.');
    return false; // This is a read-only diagnostic, not a completed state transition.
  });
  if(['planning','drafting','changes_requested'].includes(p.stage)){
    button('원고 새 판본 기록',async()=>{
      if(!stagedManuscript||stagedManuscript.projectId!==p.id)
        throw Error('먼저 위의 원고 파일을 선택해 SHA-256 지문을 자동 계산해 주세요. 파일은 아직 업로드되지 않습니다.');
      if(stagedManuscript.digest===p.manuscriptDigest)
        throw Error('현재 버전과 동일한 파일입니다. 변경된 원고를 선택해 주세요.');
      await transition('revise',{manuscriptDigest:stagedManuscript.digest});
    });
    if(p.stage!=='planning')button('편집 검수 요청',()=>transition('submit'));
  }
  if(p.stage==='in_review'){
    button('수정 요청',async()=>{const notes=prompt('수정 요청 사유');if(!notes?.trim())return false;await transition('request_changes',{notes});});
    button('검수 통과',()=>transition('editor_pass',{checklist:{completed:true}}));
  }
  if(p.stage==='ready_for_author')button('저자 직접 승인',async()=>{
    if(!confirm('이 원고와 출간 파일 정본에 대한 저작권 및 출간 동의를 확인하시겠습니까?'))return false;
    const digest=askDigest('승인할 최종 출간 파일 지문을 확인하세요.',p.releaseDigest);
    if(!digest)return false;
    await transition('author_approve',{digest,rightsConsent:true});
  });
  if(p.stage==='author_approved')button('발행자 최종 승인',async()=>{
    const digest=askDigest('출판 QA와 권리 증빙 검토 후 승인할 정본 지문',p.releaseDigest);
    if(!digest)return false;
    await transition('publisher_approve',{digest});
  });
  if(p.stage==='publisher_approved')button('판매 예약 등록',async()=>{
    const korean=prompt('예약 출간일시 (한국시간 YYYY-MM-DD HH:MM)');
    if(!korean)return false;
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
    const data=await api(`projects/${id}/ai`);
    holder.textContent=(data.jobs||[]).slice(0,12).map(j=>j.kind+' · '+j.status+' · '+j.created_at).join('\n')||'요청된 AI 작업이 없습니다.';
  }catch(e){holder.textContent=errorText(e);}
}
$('jubileeRegister').addEventListener('click',async()=>{
  if(!connected)return;
  const control=$('jubileeRegister');
  control.disabled=true;
  $('jubileeStatus').textContent='Checking existing projects...';
  try{
    const response=await api('jubilee/register',{method:'POST',body:'{}'});
    await load();
    const names=(response.projects||[]).map(x=>x.project?.title).filter(Boolean);
    const newly=(response.projects||[]).filter(x=>x.created).length;
    $('jubileeStatus').textContent=names.join(' / ')+' — 신규 '+newly+'권, 기존 '+(names.length-newly)+'권. 원고 파일 입고 및 출판 승인은 별도입니다.';
  }catch(error){$('jubileeStatus').textContent='등록 실패: '+errorText(error);}
  finally{control.disabled=!connected;}
});
$('createForm').addEventListener('submit',async(e)=>{
  e.preventDefault();if(!connected)return;
  try {
    await api('projects',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});
    e.currentTarget.reset();await load();
  }catch(error){$('connection').textContent=errorText(error);}
});
$('aiForm').addEventListener('submit',async(e)=>{
  e.preventDefault();if(!active)return;
  const data=new FormData(e.currentTarget);
  try{
    await api(`projects/${active.id}/ai`,{method:'POST',
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
    await api(`projects/${active.id}/evidence`,{method:'POST',body:JSON.stringify({
      revision:active.revision,releaseDigest:digest,manuscriptDigest:active.manuscriptDigest,releaseCandidate})});
    tell('검수 증빙 저장 완료');await load();
  }catch(err){tell(errorText(err));}
});
$('manuscriptFile').addEventListener('change',()=>hashSelectedFile('manuscript'));
$('releaseFile').addEventListener('change',()=>hashSelectedFile('release'));
$('refresh').addEventListener('click',load);
$('authLogout').addEventListener('click',signOut);
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
  if(event.key!==null&&!AUTH_KEYS.includes(event.key))return;
  ++requestVersion;enableForms(false);
  projects=[];active=null;renderDetail();
  load();
});
enableForms(false);load();

