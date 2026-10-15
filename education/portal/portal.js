import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {COURSE} from '../study/ai-bootcamp/catalog.js';

const cfg=window.EKODI_EDU_CONFIG||{};
const databaseReady=cfg.lmsEnabled===true&&cfg.dataEnabled===true&&!!cfg.supabaseUrl&&!!cfg.supabasePublishableKey;
const sb=cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey?
  createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}}):null;
const $=id=>document.getElementById(id);
const node=(tag,content,cls)=>{
  const el=document.createElement(tag);
  if(content!==undefined&&content!==null)el.textContent=String(content);
  if(cls)el.className=cls;
  return el;
};
const course='ai-bootcamp';
const roles=['admin','instructor'];
let session=null,role='learner',posts=[],enrollments=[],currentEnrollment=null,progress={},progressServer=false;
let showing='dashboard';
const STORE='ekodi_education_learning_progress_v1';
const allowedPanels=new Set(['dashboard','enroll','materials','practice','manage']);
const restrict=value=>String(value??'').trim();
const errorMessage=error=>String(error?.message||'요청을 처리할 수 없습니다.').slice(0,280);
const status=(id,message,bad=false)=>{
  const el=$(id);if(!el)return;el.textContent=message;el.dataset.error=String(bad);
};
const localProgress=()=>{
  try{
    const data=JSON.parse(localStorage.getItem(STORE)||'{}');
    return data&&typeof data==='object'?data:{};
  }catch{return{}}
};
function saveLocal(){
  try{localStorage.setItem(STORE,JSON.stringify(progress))}catch{
    status('authNotice','브라우저 저장공간 사용이 제한되어 학습 진행 상태를 저장하지 못했습니다.',true);
  }
}
function renderIdentity(){
  const button=$('portalAuthButton'),name=$('identityLabel');
  if(!sb){button.disabled=true;button.textContent='인증 준비 중';name.textContent='공개 강의';return}
  button.disabled=false;
  if(session){
    const meta=session.user?.user_metadata||{};
    name.textContent=String(meta.full_name||meta.name||session.user?.email?.split('@')[0]||'로그인 회원').slice(0,40);
    button.textContent='로그아웃';
  }else{name.textContent='로그인 전';button.textContent='Google 로그인'}
  $('enrollSubmit').disabled=!session||!databaseReady;
}
function loginUrl(){
  const address=new URL(cfg.authUrl||'https://ekodi.kr/auth/?site=edu');
  if(address.origin!=='https://ekodi.kr'&&address.origin!=='https://auth.ekodi.kr')throw new Error('등록되지 않은 인증 경로');
  address.searchParams.set('site','edu');
  // The identity provider performs identity verification only. Return to the
  // exact learner/manager route and preserve the intended tab and query.
  address.searchParams.set('return_to',location.href);
  return address.href;
}
$('portalAuthButton').addEventListener('click',async()=>{
  if(!sb)return;
  if(session){
    await sb.auth.signOut();session=null;role='learner';currentEnrollment=null;
    progress=localProgress();renderIdentity();await showPanel('dashboard');
    status('authNotice','로그아웃했습니다. 기기에 저장한 임시 학습 상태만 표시됩니다.');
    return;
  }
  sessionStorage.setItem('ekodi-education-return-panel',showing);
  location.assign(loginUrl());
});
async function handoff(){
  if(!sb||!location.hash.includes('ekodi_token='))return;
  const params=new URLSearchParams(location.hash.slice(1)),token=params.get('ekodi_token');
  if(!token)return;
  const {error}=await sb.auth.verifyOtp({token_hash:token,type:params.get('ekodi_type')||'email'});
  if(error)throw error;
  history.replaceState({},document.title,location.pathname+location.search+
    '#'+(sessionStorage.getItem('ekodi-education-return-panel')||'dashboard'));
}
function setPanel(name){
  const panel=allowedPanels.has(name)?name:'dashboard';
  if(panel==='manage'&&!roles.includes(role))return setPanel('dashboard');
  showing=panel;
  document.querySelectorAll('.workspace-panel').forEach(el=>{el.hidden=el.id!=='panel-'+panel});
  document.querySelectorAll('[data-panel]').forEach(el=>{
    const active=el.dataset.panel===panel;
    el.classList.toggle('current',active);
    if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
}
async function showPanel(panel){
  setPanel(panel);
  if(panel==='materials')await loadPosts();
  if(panel==='manage'&&roles.includes(role)){await loadPosts();await loadEnrollments();}
}
document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>{
  const tab=button.dataset.panel;history.replaceState(null,'','#'+tab);showPanel(tab);
}));
addEventListener('hashchange',()=>showPanel(location.hash.slice(1)));
function renderLessons(){
  const host=$('lessonList');host.replaceChildren();
  $('totalLessons').textContent=String(COURSE.lessons.length);
  $('completedLessons').textContent=String(COURSE.lessons.filter(x=>progress[String(x.id)]===true).length);
  for(const lesson of COURSE.lessons){
    const row=node('article',null,'lesson-entry');
    row.append(node('div',String(lesson.id).padStart(2,'0'),'lesson-number'));
    const summary=node('div',null,'lesson-body');
    summary.append(node('h2',lesson.title),node('p',lesson.sub),node('small',lesson.outcome));
    const tools=node('div',null,'lesson-buttons');
    const courseLink=node('a','강의·실습 →');courseLink.href='../study/ai-bootcamp/';
    const done=node('button',progress[String(lesson.id)]?'학습 완료':'학습 체크');
    done.type='button';done.setAttribute('aria-pressed',String(!!progress[String(lesson.id)]));
    done.addEventListener('click',()=>markLesson(lesson.id,!progress[String(lesson.id)]));
    tools.append(courseLink,done);row.append(summary,tools);host.append(row);
  }
}
async function markLesson(id,completed){
  if(!COURSE.lessons.some(row=>row.id===id))return;
  const key=String(id),previous=!!progress[key];progress[key]=completed;
  saveLocal();renderLessons();
  if(!session||!databaseReady){
    status('authNotice','이 학습 체크는 현재 기기에만 저장됩니다. 실제 출석·성적·수료 기록이 아닙니다.');
    return;
  }
  const {error}=await sb.from('education_learning_progress').upsert({
    user_id:session.user.id,course_key:course,lesson_id:id,completed
  },{onConflict:'user_id,course_key,lesson_id'});
  if(error){
    progress[key]=previous;saveLocal();renderLessons();
    status('authNotice','서버 진도 저장 실패: '+errorMessage(error)+' · 기존 상태를 복원했습니다.',true);
  }else{
    progressServer=true;status('authNotice','이 계정의 학습 체크 상태가 서버에 저장됐습니다. 출석·성적·수료 인정과는 별개입니다.');
  }
}
async function loadProgress(){
  progress=localProgress();progressServer=false;
  if(session&&databaseReady){
    const {data,error}=await sb.from('education_learning_progress')
      .select('lesson_id,completed').eq('user_id',session.user.id).eq('course_key',course);
    if(!error&&Array.isArray(data)){
      progress={};for(const item of data)if(COURSE.lessons.some(x=>x.id===item.lesson_id))
        progress[String(item.lesson_id)]=item.completed===true;
      progressServer=true;
    }else status('authNotice','학습 서버 연결이 확인되지 않았습니다. 이 기기의 임시 상태만 표시합니다.');
  }
  renderLessons();
}
function renderEnrollment(){
  const label=currentEnrollment?
    ({requested:'신청 접수',approved:'승인',rejected:'반려'}[currentEnrollment.state]||'상태 확인'): '미신청';
  $('batchSummary').textContent=label;
  status('enrollStatus',!databaseReady?
    '수강신청 서버가 아직 활성화되지 않았습니다. 관리자 개설·검증 후 신청할 수 있습니다.':
    !session?'신청하려면 Google 로그인이 필요합니다.':
    currentEnrollment?'선택 그룹 '+currentEnrollment.batch_id+' · '+label+' (결제·수료 확정 아님)':
    '교육 안내를 확인하고 신청할 수 있습니다.');
  $('enrollSubmit').disabled=!databaseReady||!session||!!currentEnrollment;
}
async function loadEnrollment(){
  currentEnrollment=null;
  if(session&&databaseReady){
    const {data,error}=await sb.from('education_enrollments').select('id,batch_id,state,created_at')
      .eq('user_id',session.user.id).eq('course_key',course).maybeSingle();
    if(!error)currentEnrollment=data;
    else status('enrollStatus','수강신청 상태 조회 실패: '+errorMessage(error),true);
  }
  renderEnrollment();
}
$('enrollForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!session){status('enrollStatus','로그인 후 원래 이 수강신청 화면으로 돌아와 신청하세요.',true);return}
  if(!databaseReady){status('enrollStatus','수강 서버가 활성화되지 않아 실제 신청을 저장하지 않았습니다.',true);return}
  const batch=$('enrollBatch').value;
  if(!/^[A-F]$/.test(batch)||!$('enrollConfirm').checked){status('enrollStatus','학습 그룹과 안내 확인이 필요합니다.',true);return}
  $('enrollSubmit').disabled=true;
  const {error}=await sb.from('education_enrollments').insert({
    user_id:session.user.id,course_key:course,batch_id:batch,state:'requested'
  });
  if(error)status('enrollStatus','신청 저장 실패: '+errorMessage(error),true);
  await loadEnrollment();
});
function renderPractice(){
  const selector=$('practiceLesson');
  selector.replaceChildren();
  for(const item of COURSE.lessons){const option=node('option',item.id+'회차 · '+item.title);option.value=String(item.id);selector.append(option)}
  selector.addEventListener('change',showPractice);
  showPractice();
}
function showPractice(){
  const id=Number($('practiceLesson').value)||1;
  const lesson=COURSE.lessons.find(x=>x.id===id)||COURSE.lessons[0];
  $('practiceHeading').textContent=lesson.practice;
  $('practiceQuestion').textContent=lesson.question;
  const host=$('practiceChecks');host.replaceChildren();
  for(const [index,text] of lesson.verify.entries()){
    const label=node('label'),box=node('input');box.type='checkbox';
    box.dataset.check=String(index);
    label.append(box,node('span',text));host.append(label);
  }
  $('practiceCopy').onclick=async()=>{
    try{await navigator.clipboard.writeText(lesson.prompt);
      status('authNotice',lesson.id+'회차 가상 실습 프롬프트를 복사했습니다. 비공개 자료는 입력하지 마세요.');
    }catch{status('authNotice','클립보드 사용이 차단됐습니다. 강의실의 실습 화면에서 확인하세요.',true)}
  };
}
function renderPostList(){
  for(const [kind,hostId] of [['notice','noticeList'],['resource','resourceList']]){
    const host=$(hostId);
    if(kind==='notice')host.replaceChildren();
    else{host.replaceChildren();
      for(const [label,href] of [
        ['4회차 AI 강의실 열기','../study/ai-bootcamp/'],
        ['가상 실습자료 CSV 받기','../study/ai-bootcamp/data/sample.csv'],
        ['강의자료 편집 스튜디오','../study/ai-bootcamp/studio/']
      ]){const a=node('a',label+' →');a.href=href;host.append(a)}
    }
    const entries=posts.filter(x=>x.kind===kind&&x.status==='published');
    if(kind==='notice'&&!entries.length)host.append(node('p','등록된 공식 공지사항이 없습니다.'));
    for(const item of entries){
      const row=node('article',null,'library-row');
      row.append(node('strong',item.title),node('p',item.body),node('small',item.published_at?item.published_at.slice(0,10):'공식 게시'));
      if(item.url&&/^https:\/\//i.test(item.url)){
        const link=node('a','공식 자료 열기 ↗');link.href=item.url;link.rel='noopener noreferrer';link.target='_blank';row.append(link);
      }
      host.append(row);
    }
  }
}
function postValues(){
  const f=new FormData($('postForm'));
  const kind=restrict(f.get('kind')),title=restrict(f.get('title')),body=restrict(f.get('body'));
  const url=restrict(f.get('url')),state=restrict(f.get('status'));
  if(!['notice','resource','lesson','exercise'].includes(kind))throw Error('자료 분류가 올바르지 않습니다.');
  if(title.length<2||title.length>160||body.length<2||body.length>6000)throw Error('제목·내용 길이를 확인하세요.');
  if(url&&(!/^https:\/\//i.test(url)||url.length>700))throw Error('공식 URL에는 HTTPS만 허용됩니다.');
  if(!['draft','published'].includes(state))throw Error('허용되지 않은 게시 상태입니다.');
  if(role!=='admin'&&state!=='draft')throw Error('최종 게시 승인 권한이 없습니다.');
  return {kind,title,body,url:url||null,status:state,
    published_at:state==='published'?new Date().toISOString():null};
}
function renderOperatorPosts(){
  const host=$('operatorPosts');host.replaceChildren();
  for(const row of posts){
    const holder=node('article',null,'operator-row'),details=node('div');
    details.append(node('strong',row.title),node('small',row.kind+' · '+row.status));
    const tools=node('div');
    const edit=node('button','수정');edit.type='button';
    edit.addEventListener('click',()=>{
      $('postId').value=row.id;$('postKind').value=row.kind;
      $('postTitle').value=row.title;$('postBody').value=row.body||'';
      $('postUrl').value=row.url||'';$('postStatus').value=row.status;
      if(role!=='admin'&&row.status==='published'){$('postStatus').value='draft';status('postMessage','강사는 게시된 자료를 수정할 수 없습니다.',true);return}
      $('postTitle').focus();
    });
    tools.append(edit);
    if(role==='admin'){
      const del=node('button','삭제');del.type='button';
      del.addEventListener('click',async()=>{
        if(!confirm('이 교육 운영 자료를 삭제할까요? 이 작업은 되돌릴 수 없습니다.'))return;
        const {error}=await sb.from('education_course_posts').delete().eq('id',row.id);
        status('postMessage',error?'삭제 실패: '+errorMessage(error):'서버에서 삭제했습니다.',!!error);
        await loadPosts();
      });
      tools.append(del);
    }
    holder.append(details,tools);host.append(holder);
  }
}
async function loadPosts(){
  if(!databaseReady){renderPostList();return}
  const q=sb.from('education_course_posts').select('id,kind,title,body,url,status,published_at,updated_at');
  const query=roles.includes(role)?q.order('updated_at',{ascending:false}).limit(80):
    q.eq('status','published').order('published_at',{ascending:false}).limit(60);
  const {data,error}=await query;
  if(error){status('authNotice','공지·자료 조회에 실패했습니다. 기존 공개 강의는 이용할 수 있습니다.',true);return}
  posts=Array.isArray(data)?data:[];renderPostList();
  if(roles.includes(role))renderOperatorPosts();
}
$('postForm').addEventListener('reset',()=>{status('postMessage','새 자료 작성');$('postId').value=''});
$('postForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!session||!databaseReady||!roles.includes(role)){status('postMessage','서버에서 검증된 강사·관리자 권한이 필요합니다.',true);return}
  let post;try{post=postValues()}catch(error){status('postMessage',errorMessage(error),true);return}
  const id=$('postId').value;
  const request=id?sb.from('education_course_posts').update(post).eq('id',id):
    sb.from('education_course_posts').insert(post);
  const {error}=await request;
  status('postMessage',error?'서버 저장 실패: '+errorMessage(error):
    '서버에 저장했습니다. '+(post.status==='published'?'공식 게시됨':'비공개 초안'),!!error);
  if(!error){$('postForm').reset();await loadPosts()}
});
function renderEnrollments(){
  const host=$('operatorEnrollments');host.replaceChildren();
  if(!enrollments.length){host.append(node('p','수강신청 요청이 없습니다.'));return}
  for(const item of enrollments){
    const row=node('article',null,'operator-row');
    const detail=node('div');
    detail.append(node('strong','신청 식별자 '+item.user_id.slice(0,8)+'…'),
      node('small','그룹 '+item.batch_id+' · '+item.state));
    row.append(detail);
    if(role==='admin'){
      const controls=node('div');
      for(const [name,value] of [['승인','approved'],['반려','rejected']]){
        const button=node('button',name);button.type='button';
        button.disabled=item.state===value;
        button.addEventListener('click',async()=>{
          if(!confirm('해당 신청을 '+name+' 처리할까요?'))return;
          const {error}=await sb.from('education_enrollments').update({state:value}).eq('id',item.id);
          if(error)status('authNotice','신청 상태 갱신 실패: '+errorMessage(error),true);
          await loadEnrollments();
        });
        controls.append(button);
      }
      row.append(controls);
    }
    host.append(row);
  }
}
async function loadEnrollments(){
  if(!databaseReady||role!=='admin'){enrollments=[];renderEnrollments();return}
  const {data,error}=await sb.from('education_enrollments')
    .select('id,user_id,batch_id,state,created_at').eq('course_key',course)
    .order('created_at',{ascending:false}).limit(100);
  if(error)status('authNotice','수강신청 관리 데이터를 불러오지 못했습니다.',true);
  enrollments=error?[]:data||[];renderEnrollments();
}
async function resolveRole(){
  role='learner';
  if(session&&databaseReady){
    const {data,error}=await sb.rpc('education_actor_role');
    if(!error&&roles.includes(data))role=data;
  }
  $('manageNav').hidden=!roles.includes(role);
  $('manageUnavailable').hidden=roles.includes(role);
  $('manageContent').hidden=!roles.includes(role);
  $('enrollManageCard').hidden=role!=='admin';
  const published=$('postStatus').querySelector('option[value="published"]');
  if(published)published.disabled=role!=='admin';
}
async function connect(){
  if(sb){
    try{
      await handoff();
      const {data,error}=await sb.auth.getSession();
      session=error?null:data.session;
    }catch(error){status('authNotice','로그인 확인 실패: '+errorMessage(error),true)}
    sb.auth.onAuthStateChange((_type,next)=>{
      const previous=session?.user?.id;
      session=next;
      renderIdentity();
      if(previous!==session?.user?.id)void refresh();
    });
  }
  progress=localProgress();renderLessons();renderPractice();renderIdentity();
  await refresh();
  const restore=sessionStorage.getItem('ekodi-education-return-panel');
  if(restore)sessionStorage.removeItem('ekodi-education-return-panel');
  await showPanel(location.hash.slice(1)||restore||'dashboard');
}
async function refresh(){
  await resolveRole();
  await Promise.all([loadProgress(),loadEnrollment(),loadPosts()]);
  if(roles.includes(role))await loadEnrollments();
  renderIdentity();
  if(!databaseReady)status('authNotice','기존 강의·실습은 이용할 수 있습니다. 서버 기반 수강신청·진도 동기화·관리자 게시 기능은 RLS 데이터베이스 활성화 후 제공됩니다.');
  else status('authNotice',session?'로그인 계정으로 수강·진도·게시 권한을 확인했습니다.':'공개 강의는 로그인 없이 이용할 수 있습니다. 수강신청 및 진도 동기화에는 로그인이 필요합니다.');
}
void connect();
