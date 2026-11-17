/* Unified Education UI. Course content is canonical in /courses/catalog.json. */
(()=>{
'use strict';
const base=location.pathname.startsWith('/edu/')?'/edu':'';
const path=location.pathname.replace(/^\/edu(?=\/|$)/,'').split('/').filter(Boolean);
const section=path[0]||'courses',slug=path[1]||'';
const main=document.getElementById('hubContents');
const heading=document.getElementById('hubHeading');
const filters=document.getElementById('hubFilters');
const notice=document.getElementById('hubNotice');
const safe=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const route=p=>base+p;
function safeLink(value){
 const v=String(value||'');
 if(v.startsWith('/')&&!v.startsWith('//'))return route(v);
 if(/^https:\/\/(?:docs\.google\.com|drive\.google\.com)\//.test(v))return v;
 return '';
}
const link=(href,label,cls='',external=false)=>href?'<a class="'+cls+'" href="'+safe(href)+'"'+(external?' target="_blank" rel="noopener noreferrer"':'')+'>'+safe(label)+'</a>':'';
const status=t=>{notice.textContent=String(t||'');};
function labels(rows,ids){return (ids||[]).map(id=>rows.find(x=>x.id===id)?.label).filter(Boolean);}
function tags(course,catalog){return '<div class="hub-tags">'+[...labels(catalog.fields,course.fields),...labels(catalog.audiences,course.audiences)].map(x=>'<span>'+safe(x)+'</span>').join('')+'</div>';}
function courseUrl(id,type='courses'){return route('/'+type+'/'+encodeURIComponent(id)+'/');}
function setHeading(title,desc,eyebrow='COURSE DIRECTORY'){
 heading.innerHTML='<p class="hub-eyebrow">'+safe(eyebrow)+'</p><h1>'+safe(title)+'</h1><p>'+safe(desc)+'</p>';
 document.title=title+' | 에코디교육';
 for(const a of document.querySelectorAll('.hub-main-nav a')){
  const label=a.textContent.trim();
  a.removeAttribute('aria-current');
  if((section==='teach'&&label==='강사용')||(section==='learn'&&label==='학생용')||(!['teach','learn'].includes(section)&&label==='통합안내'))a.setAttribute('aria-current','page');
 }
}
function card(course,catalog,mode='courses'){
 const target=mode==='teach'?'teach':mode==='learn'?'learn':'courses';
 return '<article class="hub-course-card">'+tags(course,catalog)+
  '<h3>'+safe(course.title)+'</h3><p>'+safe(course.summary||'강의 정보 보기')+'</p>'+
  '<div class="hub-actions">'+link(courseUrl(course.id,target),mode==='teach'?'강사 운영':mode==='learn'?'학생용 입장':'과정 상세','primary')+
  (mode==='courses'?link(courseUrl(course.id,'learn'),'학생용'):'')+'</div></article>';
}
function filtersHtml(catalog,activeField,activeAudience){
 const fieldLinks=[{id:'',label:'전체 분야'},...catalog.fields];
 const audienceLinks=[{id:'',label:'전체 대상'},...catalog.audiences];
 const field=fieldLinks.map(x=>link(route(x.id?'/fields/'+x.id+'/':'/courses/'),x.label,'hub-chip'+(x.id===activeField?' active':''))).join('');
 const audience=audienceLinks.map(x=>link(route(x.id?'/audiences/'+x.id+'/':'/courses/'),x.label,'hub-chip'+(x.id===activeAudience?' active':''))).join('');
 filters.hidden=false;filters.className='hub-filters';
 filters.innerHTML='<div class="filter-row"><strong class="filter-label">교육분야</strong>'+field+'</div><div class="filter-row"><strong class="filter-label">교육대상</strong>'+audience+'</div>';
}
function renderDirectory(catalog,mode='courses'){
 const field=section==='fields'?catalog.fields.find(x=>x.id===slug):null;
 const audience=section==='audiences'?catalog.audiences.find(x=>x.id===slug):null;
 if(['fields','audiences'].includes(section)&&!(field||audience)){notFound();return;}
 const title=mode==='teach'?'강사 운영실':mode==='learn'?'학생용 강의실':field?field.label+' 교육':audience?audience.label+' 교육':'교육과정 통합안내';
 const description=mode==='teach'?'교육과정의 운영·발표·공유 단계·자료·학생 참여 경로를 관리합니다.':'교육분야와 교육대상에 따라 한 강의 원본을 연결합니다. 같은 과정을 중복 등록하지 않습니다.';
 setHeading(title,description,mode==='teach'?'INSTRUCTOR CONTROL':mode==='learn'?'LEARNER CLASSROOM':'FIELD · AUDIENCE · COURSE');
 if(mode==='courses')filtersHtml(catalog,field?.id||'',audience?.id||'');
 const courses=catalog.courses.filter(c=>(!field||c.fields.includes(field.id))&&(!audience||c.audiences.includes(audience.id)));
 main.innerHTML='<section class="hub-section"><div class="hub-section-head"><h2>등록된 강의 '+courses.length+'개</h2><p>교육자료는 강의별 원본 한 곳에서 관리합니다.</p></div><div class="hub-course-grid">'+courses.map(c=>card(c,catalog,mode)).join('')+'</div></section>';
}
function notFound(){setHeading('강의를 찾을 수 없습니다.','존재하는 과정 주소를 확인해 주세요.');filters.hidden=true;main.innerHTML=link(route('/courses/'),'교육과정 전체 보기','hub-button primary');}
function curriculum(course){return '<ol>'+(course.syllabus||[]).map(x=>'<li>'+safe(x)+'</li>').join('')+'</ol>';}
function publicResources(course){
 const list=[...(course.resources||[])];
 if(course.learnerTool)list.unshift({label:'기존 실습 강의실 열기',url:course.learnerTool});
 if(!list.length)return '<p class="muted">별도의 학생 다운로드 자료는 등록되지 않았습니다. 강사의 웹 발표 단계를 이용하세요.</p>';
 return '<div class="hub-resource-list">'+list.map(item=>link(safeLink(item.url),item.label)).join('')+'</div>';
}
function renderOverview(course,catalog){
 setHeading(course.title,course.summary,'COURSE · ONE SOURCE');
 filters.hidden=true;
 main.innerHTML='<section class="hub-split hub-section"><article class="hub-panel"><p class="hub-eyebrow">CURRICULUM</p>'+tags(course,catalog)+'<h2>교육내용</h2>'+curriculum(course)+
  '<div class="hub-actions">'+link(courseUrl(course.id,'learn'),'학생용 강의실','primary')+link(courseUrl(course.id,'teach'),'강사 운영실')+'</div></article>'+
  '<article class="hub-panel"><h2>안내 및 학습자료</h2><p>같은 강의 원본을 안내·강사·학생이 역할에 맞게 사용합니다. 교육생의 개인정보나 평가 기록은 자동 수집하지 않습니다.</p>'+
  link(safeLink(course.studyUrl),'기존 과정 안내·학습 페이지','hub-button')+
  '<p class="muted">강의 편집과 발표 운영은 등록된 강사만 가능합니다. 원본 자료 접근은 별도의 제공기관 권한에 따릅니다.</p></article></section>';
}
function stepText(course,n){return course.syllabus[Math.min(Math.max(Number(n)||0,0),course.syllabus.length-1)]||course.title;}
function liveStage(course,state){
 const step=Number.isInteger(state.step)?Math.min(Math.max(state.step,0),(course.syllabus||[]).length-1):0;
 return '<div class="hub-stage" aria-live="polite"><small id="hubSlideCount">'+(step+1)+' / '+course.syllabus.length+' · '+(state.live?'강사가 공유 중':'학습 대기')+'</small><h2 id="hubSlideTitle">'+safe(stepText(course,step))+'</h2><p id="hubSlideNote">'+safe(state.notice||'강사가 선택한 강의 단계가 여기에 표시됩니다.')+'</p></div>';
}
async function liveState(courseId){
 const response=await fetch(route('/courses/live-state?id='+encodeURIComponent(courseId)),{cache:'no-store'});
 if(!response.ok)throw Error('강의 상태를 불러오지 못했습니다.');
 const d=await response.json();
 return d.state;
}
function applyStage(course,state){
 const count=document.getElementById('hubSlideCount'),title=document.getElementById('hubSlideTitle'),note=document.getElementById('hubSlideNote');
 if(!count||!title||!note)return;
 const step=Math.min(Math.max(Number(state.step)||0,0),course.syllabus.length-1);
 count.textContent=(step+1)+' / '+course.syllabus.length+' · '+(state.live?'강사가 공유 중':'학습 대기');
 title.textContent=stepText(course,step);
 note.textContent=state.notice||'강사가 선택한 강의 단계가 여기에 표시됩니다.';
 const time=document.getElementById('hubLastUpdate');if(time)time.textContent=state.updatedAt?'마지막 공유: '+new Date(state.updatedAt).toLocaleString('ko-KR'):'공유 기록 없음';
}
function progress(course){
 const key='ekodi-edu-progress-v1:'+course.id;
 let stored=[];try{stored=JSON.parse(localStorage.getItem(key)||'[]')}catch{}
 const yes=new Set(Array.isArray(stored)?stored:[]);
 const mount=document.getElementById('hubProgress');
 if(!mount)return;
 mount.innerHTML=course.syllabus.map((step,i)=>'<label class="hub-check"><input type="checkbox" data-step="'+i+'" '+(yes.has(i)?'checked':'')+'><span>'+safe(step)+'</span></label>').join('')+
 '<button type="button" class="hub-button" id="hubClearProgress">내 진도 삭제</button>';
 mount.addEventListener('change',()=>{const completed=[...mount.querySelectorAll('input[data-step]:checked')].map(el=>Number(el.dataset.step));try{localStorage.setItem(key,JSON.stringify(completed))}catch{status('브라우저 저장이 제한되어 진도를 보관하지 못했습니다.');}});
 mount.querySelector('#hubClearProgress').addEventListener('click',()=>{try{localStorage.removeItem(key)}catch{}mount.querySelectorAll('input:checked').forEach(el=>el.checked=false);status('이 기기의 진도 기록을 삭제했습니다.');});
}
async function renderLearner(course,catalog){
 setHeading(course.title+' · 학생용','강사가 공유하는 단계와 안내를 확인하고, 실습자료와 개인 진도표를 이용합니다.','LEARNER WEB PRESENTATION');
 filters.hidden=true;
 main.innerHTML='<section class="hub-split hub-section"><div class="hub-panel"><h2>오늘의 웹 발표</h2>'+liveStage(course,{step:0,live:false})+
 '<div class="hub-actions"><button class="hub-button" id="hubRefresh">최신 화면 확인</button>'+link(courseUrl(course.id),'과정 안내')+'</div><p id="hubLastUpdate" class="muted">공유 상태 확인 중</p>'+
 '<p class="muted">학생용 발표는 강사가 공유한 강의 단계이며, 별도 Google 프레젠테이션의 슬라이드를 원격 조작하지 않습니다.</p></div>'+
 '<aside class="hub-panel"><h2>수업·실습자료</h2>'+tags(course,catalog)+publicResources(course)+
 '<h3 style="margin-top:20px">나의 진도 (기기 내 저장)</h3><div class="hub-progress" id="hubProgress"></div>'+
 '<p class="muted">체크한 진도는 이 브라우저에만 저장됩니다. 학생의 실명·성적·출결은 서버로 보내지 않습니다.</p></aside></section>';
 progress(course);
 const update=async()=>{try{const state=await liveState(course.id);applyStage(course,state);status('강의 화면을 확인했습니다.')}catch{status('강의 공유 상태를 확인하지 못했습니다. 기존 실습 링크를 이용할 수 있습니다.')}};
 document.getElementById('hubRefresh').addEventListener('click',update);
 await update();
 window.setInterval(()=>{if(document.visibilityState==='visible')update();},12000);
}
function teacherMaterials(course){
 const list=[];
 if(course.teacherTool)list.push({label:'기존 강사 진행 도구',url:course.teacherTool});
 if(course.presentationUrl)list.push({label:'PPT 전체화면 발표',url:course.presentationUrl});
 if(course.editUrl)list.push({label:'PPT 원본 편집',url:course.editUrl});
 if(course.sourceUrl)list.push({label:'원본 PPTX 관리',url:course.sourceUrl});
 if(course.ownerFolderUrl)list.push({label:'강의 보관함',url:course.ownerFolderUrl});
 if(course.studyUrl)list.push({label:'기존 교육내용 확인',url:course.studyUrl});
 return '<div class="hub-resource-list">'+list.map(item=>{
  const href=safeLink(item.url);return link(href,item.label,'',href.startsWith('https://'));
 }).join('')+'</div>';
}
async function renderTeacher(course,catalog){
 setHeading(course.title+' · 강사 운영','강의자료·발표 단계·공유 안내·학생용 화면을 하나의 과정에서 관리합니다.','AUTHORIZED INSTRUCTOR');
 filters.hidden=true;
 const page=courseUrl(course.id,'learn');
 main.innerHTML='<section class="hub-split hub-section"><div class="hub-panel"><h2>학생용 웹 발표 운영</h2>'+
 '<p class="muted">강의 단계는 등록된 교육과정 한 곳에서 불러옵니다. 공개 버튼을 눌러 학생 화면에 반영합니다.</p>'+
 '<label>현재 공유 단계<select id="teacherStep">'+course.syllabus.map((s,i)=>'<option value="'+i+'">'+(i+1)+' · '+safe(s)+'</option>').join('')+'</select></label>'+
 '<label>학생 공지 (최대 240자)<textarea id="teacherNotice" maxlength="240" placeholder="오늘의 진행 안내 또는 실습 유의사항"></textarea></label>'+
 '<label><input id="teacherLive" type="checkbox">강의 진행 중 표시</label>'+
 '<div class="hub-actions"><button id="teacherPrevious" class="hub-button" type="button">이전 단계</button><button id="teacherNext" class="hub-button" type="button">다음 단계</button><button id="teacherPublish" class="hub-button primary" type="button">학생 화면에 공유</button></div>'+
 '<div id="teacherFeedback" class="hub-notice" role="status"></div>'+
 '<div class="hub-alert hub-good">Google Slides 자체 페이지 넘김과는 별도입니다. 웹 공유 단계·공지·진행 상태만 학생 화면에 반영됩니다.</div>'+
 '<div class="hub-actions">'+link(page,'학생 화면 미리보기','primary')+'<button id="teacherCopyLink" type="button" class="hub-button">학생 주소 복사</button></div>'+
 '<p class="muted">'+safe(new URL(page,location.origin).href)+'</p></div>'+
 '<div class="hub-panel"><h2>강의 자료 및 운영 도구</h2>'+tags(course,catalog)+teacherMaterials(course)+
 '<h3 style="margin-top:20px">강의 구성</h3>'+curriculum(course)+
 (course.reviewFlags?.length?'<div class="hub-alert"><strong>원문 검수 필요</strong><ul>'+course.reviewFlags.map(x=>'<li>'+safe(String(x.slide)+'장: '+x.note)+'</li>').join('')+'</ul></div>':'')+
 '<p class="muted">기존 프로그램의 실습·타이머·QR·피드백은 위 원본 강사 도구를 그대로 사용합니다. 원본에 없는 기능을 가동 중이라고 표시하지 않습니다.</p></div></section>';
 const stepEl=document.getElementById('teacherStep'),noticeEl=document.getElementById('teacherNotice'),liveEl=document.getElementById('teacherLive'),feedback=document.getElementById('teacherFeedback');
 document.getElementById('teacherPrevious').addEventListener('click',()=>{stepEl.value=String(Math.max(0,Number(stepEl.value)-1));});
 document.getElementById('teacherNext').addEventListener('click',()=>{stepEl.value=String(Math.min(course.syllabus.length-1,Number(stepEl.value)+1));});
 document.getElementById('teacherCopyLink').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(new URL(page,location.origin).href);feedback.textContent='학생 주소를 복사했습니다.';}catch{feedback.textContent='주소 복사가 제한되었습니다. 위 주소를 직접 복사해 주세요.';}});
 try{const s=await liveState(course.id);stepEl.value=String(Math.max(0,Math.min(course.syllabus.length-1,s.step||0)));noticeEl.value=s.notice||'';liveEl.checked=s.live===true;}
 catch{feedback.textContent='기존 발표 설정을 불러오지 못했습니다. 저장 상태를 확인해 주세요.';}
 document.getElementById('teacherPublish').addEventListener('click',async()=>{
  const b=document.getElementById('teacherPublish');b.disabled=true;feedback.textContent='공유 상태를 저장하고 있습니다.';
  try{
   const r=await fetch(route('/teach/live-state'),{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({courseId:course.id,step:Number(stepEl.value),live:liveEl.checked,notice:noticeEl.value})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok||!data.ok)throw Error(data.code||'unknown');
   feedback.textContent='공유 완료 · '+new Date(data.state.updatedAt).toLocaleString('ko-KR')+' · 학생 화면을 새로 고치면 반영됩니다.';
  }catch(e){feedback.textContent='공유되지 않았습니다. 강사 권한 또는 교육자료 저장소를 확인해 주세요. ('+String(e.message).slice(0,70)+')';}
  b.disabled=false;
 });
}
function adminToken(){try{return sessionStorage.getItem('ekodi-auth-token')||'';}catch{return '';}}
function adminLoginLink(){const u=new URL('https://ekodi.kr/auth/');u.searchParams.set('site','admin');u.searchParams.set('direct','1');u.searchParams.set('return_to',location.href.split('#')[0]);return u.href;}
async function showAdminRegistry(){
 const resp=await fetch(route('/teach/status'),{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()).catch(()=>({}));
 if(resp.role!=='super_admin')return;
 const wrap=document.createElement('section');
 wrap.className='hub-panel hub-section';wrap.innerHTML='<h2>강사 이메일 권한 등록 · 최고관리자 전용</h2>'+
 '<p>이메일을 사전 등록한 뒤, 사용자가 본인 에코디 계정으로 로그인하면 강사 권한을 부여합니다. 강사 비밀번호 공유는 사용하지 않습니다.</p>'+
 '<div id="teacherRegistryStatus" class="hub-notice" role="status"></div>'+
 '<form id="teacherEmailForm"><label>강사 이메일<input name="email" type="email" maxlength="254" required placeholder="teacher@example.org"></label>'+
 '<div class="hub-actions"><button type="submit" class="hub-button primary">강사 등록</button>'+link(adminLoginLink(),'최고관리자 재인증')+'</div></form>'+
 '<ul id="teacherEmailList" class="hub-email-list"></ul>';
 main.append(wrap);
 const message=wrap.querySelector('#teacherRegistryStatus'),list=wrap.querySelector('#teacherEmailList');
 const token=adminToken();
 if(!token){message.textContent='강사 등록을 관리하려면 현재 탭에서 최고관리자로 다시 로그인해야 합니다.';wrap.querySelector('button[type="submit"]').disabled=true;return;}
 async function request(action,email){
  const r=await fetch(route('/teach/instructors'),{method:action?'POST':'GET',credentials:'same-origin',headers:{authorization:'Bearer '+token,...(action?{'content-type':'application/json'}:{})},...(action?{body:JSON.stringify({action,email})}:{})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.code||'권한 확인 실패');
  return data;
 }
 async function refresh(){
  try{
   const d=await request();
   message.textContent='현재 추가 등록된 강사 '+d.emails.length+'명 · 시스템 기본 권한 '+d.fixed.length+'개';
   list.replaceChildren();
   d.emails.forEach(email=>{
    const li=document.createElement('li'),span=document.createElement('span'),btn=document.createElement('button');
    span.textContent=email;btn.type='button';btn.className='hub-button';btn.textContent='권한 회수';
    btn.addEventListener('click',async()=>{btn.disabled=true;try{await request('remove',email);await refresh();}catch(e){message.textContent='권한 회수 실패: '+e.message;btn.disabled=false;}});
    li.append(span,btn);list.append(li);
   });
  }catch(e){message.textContent='등록 현황을 확인하지 못했습니다. ('+e.message+')';}
 }
 wrap.querySelector('#teacherEmailForm').addEventListener('submit',async e=>{
  e.preventDefault();const input=e.currentTarget.elements.email;const btn=e.currentTarget.querySelector('button');btn.disabled=true;
  try{await request('add',input.value.trim());input.value='';await refresh();}catch(err){message.textContent='등록 실패: '+err.message;}
  btn.disabled=false;
 });
 await refresh();
}
async function run(){
 try{
  const r=await fetch(route('/courses/catalog.json'),{cache:'no-store'});
  if(!r.ok)throw Error('course catalog '+r.status);
  const data=await r.json();
  if(!Array.isArray(data.courses)||!Array.isArray(data.fields)||!Array.isArray(data.audiences))throw Error('invalid course catalog');
  if(new Set(data.courses.map(c=>c.id)).size!==data.courses.length)throw Error('duplicate course ids');
  if(section==='courses'&&!slug||section==='fields'||section==='audiences'){renderDirectory(data);return;}
  if(section==='teach'&&!slug){renderDirectory(data,'teach');await showAdminRegistry();return;}
  if(section==='learn'&&!slug){renderDirectory(data,'learn');return;}
  const course=data.courses.find(c=>c.id===slug);
  if(!course){notFound();return;}
  if(section==='courses'){renderOverview(course,data);return;}
  if(section==='learn'){await renderLearner(course,data);return;}
  if(section==='teach'){await renderTeacher(course,data);return;}
  notFound();
 }catch(e){setHeading('강의 정보를 불러오지 못했습니다.','문제가 지속되면 교육 관리자에게 문의해 주세요.');main.innerHTML='<p class="hub-alert">기존 강의 자료는 학습 강의실에서 계속 이용할 수 있습니다. '+link(route('/study/'),'기존 강의실 열기')+'</p>';status(String(e.message).slice(0,100));}
}
run();
})();