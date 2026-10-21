// EKODI Education Premium Studio — Instructor Studio (강사 운영실).
import {COURSES,courseEntry} from './courses/registry.js';
import {validateCourse,sessionByNo,sessionSlides,practiceMinutes,practiceModules,totalMinutes,learnerUrl,formatClock,courseMarkdown,KIND_LABELS,missionMaterials,liveBase} from './engine/model.js';
import {createLiveStore,lectureElapsedMs,timerRemainingMs,timerPhase,CHANNEL_NAME} from './engine/live-state.js';
import {qrSvg} from './engine/qr.js';
import {esc,list,missionSections,featureCard,readFeatureChecks,writeFeatureCheck,allFeatureIds,moduleLabel,downloadText,copyText,safeStorage,safeChannel,multiline} from './engine/render.js';
import {FACTCHAT_TOOL} from './tools/factchat.js';

const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const params=new URLSearchParams(location.search);
const entry=courseEntry(params.get('c'));
const storage=safeStorage(window);
const channel=safeChannel(window,CHANNEL_NAME);
const PREF_KEY='ekodi_edu_studio_prefs_v1';
let course,notes={},store,slides=[];
let view='module';
let prefs={track:'planning',level:'basic',showFallback:false};
let lastPhase='';
let toastTimer=0;

function loadPrefs(){try{const p=JSON.parse(storage?.getItem(PREF_KEY)||'{}');if(p&&typeof p==='object')prefs={...prefs,...p};}catch{}}
function savePrefs(){try{storage?.setItem(PREF_KEY,JSON.stringify(prefs));}catch{}}
function toast(text){const el=$('#toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},3200);}
const S=()=>store.state;
const session=()=>sessionByNo(course,S().session)||course.sessions[0];
const mod=()=>session().modules[Math.min(S().moduleIndex,session().modules.length-1)];
const firstSlideOf=moduleId=>Math.max(0,slides.findIndex(s=>s.moduleId===moduleId));
const sessionHref=path=>{const base=liveBase(location.pathname);return base+'/study/live/'+path;};

function currentJoinMission(){
  const shared=S().shared.missionId;
  if(shared&&course.missions[shared])return shared;
  const m=mod();return m.kind==='practice'?m.missionId:'';
}
function joinLink(){
  const t=S().timer;
  return learnerUrl(location.origin,location.pathname,{c:course.id,s:S().session,m:currentJoinMission(),lv:S().shared.level||'basic',e:t.status==='running'?t.endsAt:0});
}

function renderTop(){
  const st=S();
  const label={idle:'준비',running:'강의 중',paused:'일시정지',ended:'종료'}[st.lecture.status];
  $('#lectureState').innerHTML='<span class="dot'+(st.lecture.status==='running'?' live':st.lecture.status==='paused'?' warn':'')+'" aria-hidden="true"></span><span>'+esc(label)+'</span>';
  $('#lectureToggle').textContent=st.lecture.status==='running'?'일시정지':st.lecture.status==='paused'?'강의 재개':st.lecture.status==='ended'?'다시 시작':'강의 시작';
  $('#sessionPicker').value=String(st.session);
  $('#lectureEnd').disabled=st.lecture.status==='idle'||st.lecture.status==='ended';
}
function renderNav(){
  const st=S();
  $('#moduleNav').innerHTML=session().modules.map((m,i)=>'<button type="button" class="nav-item'+(view==='module'&&i===st.moduleIndex?' is-current':'')+(st.lecture.status==='running'&&i===st.moduleIndex?' is-live':'')+'" data-module="'+i+'" aria-current="'+(view==='module'&&i===st.moduleIndex?'step':'false')+'"><span class="t">'+m.start+'–'+m.end+'</span><span>'+esc(m.kind==='practice'?course.missions[m.missionId].title:m.title)+'</span></button>').join('');
  $$('[data-view]').forEach(b=>{const on=b.dataset.view===view;b.classList.toggle('is-current',on);b.setAttribute('aria-current',on?'page':'false');});
}
function trackLevelControls(){
  return '<div class="btn-row"><label class="field">직무 실습 사례<select id="trackPicker">'+course.tracks.map(t=>'<option value="'+t.id+'"'+(t.id===prefs.track?' selected':'')+'>'+esc(t.label)+'</option>').join('')+'</select></label>'+
    '<label class="field">난이도<select id="levelPicker">'+course.levels.map(l=>'<option value="'+l.id+'"'+(l.id===prefs.level?' selected':'')+'>'+esc(l.label)+'</option>').join('')+'</select></label>'+
    '<label class="field">대체 실습<select id="fallbackPicker"><option value="0"'+(prefs.showFallback?'':' selected')+'>숨김</option><option value="1"'+(prefs.showFallback?' selected':'')+'>표시</option></select></label></div>';
}
function notesBlock(id){
  const n=notes[id];if(!n)return '';
  const parts=[];
  if(n.talk?.length)parts.push('<h4>진행 멘트</h4>'+list(n.talk));
  if(n.demo?.length)parts.push('<h4>시연 순서</h4>'+list(n.demo,true));
  if(n.cues?.length)parts.push('<h4>시간 신호</h4>'+list(n.cues));
  if(n.answer)parts.push('<h4>정답·해설</h4><p>'+esc(n.answer)+'</p>');
  return '<aside class="notes" aria-label="강사 전용 노트">'+parts.join('')+'<p class="meta">강사 화면·발표자 화면에만 표시됩니다(수강생 실습실에는 불러오지 않음).</p></aside>';
}
function viewModule(){
  const s=session(),m=mod(),st=S();
  const idx=s.modules.indexOf(m);
  const header='<div class="panel"><p class="eyebrow">'+esc(s.no+'회차 · '+moduleLabel(m))+'</p><h2>'+esc(m.kind==='practice'?course.missions[m.missionId].title:m.title)+'</h2>'+
    (m.summary?'<p class="meta">'+esc(m.summary)+'</p>':'')+
    '<div class="btn-row"><button type="button" class="btn" data-present-module="'+idx+'">이 단계 발표로 보내기</button>'+
    (m.kind==='practice'?'<button type="button" class="btn btn-primary" data-start-practice="'+esc(m.missionId)+'">실습 시작 ('+course.missions[m.missionId].minutes+'분)</button>':'')+
    (m.kind==='break'?'<button type="button" class="btn" data-start-break="'+((m.end-m.start)*60000)+'">휴식 타이머 '+(m.end-m.start)+'분</button>':'')+
    (idx<s.modules.length-1?'<button type="button" class="btn btn-ghost" data-module="'+(idx+1)+'">다음 단계 →</button>':'')+'</div></div>';
  let body='';
  if(m.kind==='practice'){
    body='<div class="panel"><div class="grid-2"><div>'+trackLevelControls()+'</div><div class="notice">수강생은 자기 직무를 직접 고릅니다. 여기서 고른 직무는 강사 미리보기용입니다. 같은 미션 엔진에서 원문·프롬프트·완료 기준만 바뀝니다.</div></div></div>'+
      '<div class="panel">'+missionSections(course,m.missionId,{trackId:prefs.track,levelId:prefs.level,checks:readFeatureChecks(storage),tool:FACTCHAT_TOOL,showFallback:prefs.showFallback})+'</div>';
  }else{
    const learner=m.learner?'<div class="panel"><h3>수강생 화면 안내 · '+esc(m.learner.headline)+'</h3>'+list(m.learner.tasks,true)+'</div>':'';
    const feats=m.features?.length?'<div class="panel"><h3>시연·설명 기능</h3><div class="features">'+m.features.map(id=>featureCard(readFeatureChecks(storage),id,{controls:true})).join('')+'</div></div>':'';
    const hunt=m.errorHunt?course.errorHunts.find(h=>h.id===m.errorHunt):null;
    body=(m.points?.length?'<div class="panel"><h3>강의 내용</h3>'+list(m.points,false,'points')+'</div>':'')+feats+
      (hunt?'<div class="panel"><h3>AI 오류 찾기 · '+esc(hunt.title)+'</h3><pre class="source-text">'+esc(hunt.text)+'</pre><p class="meta">힌트: '+esc(hunt.hint)+'</p></div>':'')+
      (m.learner?.quiz?'<div class="panel"><h3>OX 퀴즈 (수강생 실습실에서 응답 · 개인 기기에만 저장)</h3><ol class="points">'+course.quiz.map(q=>'<li>'+esc(q.q)+' <b>'+(q.a?'O':'X')+'</b> — <span class="meta">'+esc(q.why)+'</span></li>').join('')+'</ol></div>':'')+learner;
  }
  return header+'<div class="panel">'+(notesBlock(m.id)||'<p class="meta">이 단계의 강사 노트가 없습니다.</p>')+'</div>'+body;
}
function timelineBar(s){
  return '<div class="timeline" aria-hidden="true">'+s.modules.map(m=>'<span class="tl-'+m.kind+' tl-w'+(m.end-m.start)+'" title="'+esc(m.title||'')+'"></span>').join('')+'</div>'+
    '<div class="legend">'+['lecture','demo','practice','break','review','share'].filter(k=>s.modules.some(m=>m.kind===k)).map(k=>'<span><i class="tl-'+k+'"></i>'+esc(KIND_LABELS[k])+'</span>').join('')+'</div>';
}
function viewDashboard(){
  const st=S(),s=session(),now=Date.now();
  const elapsedMin=lectureElapsedMs(st,now)/60000;
  const m=mod();
  const drift=st.lecture.status==='idle'?null:Math.round(elapsedMin-m.start);
  const rows=s.modules.map((x,i)=>'<tr class="'+(i===st.moduleIndex?'is-current':'')+'"><td>'+x.start+'~'+x.end+'분</td><td>'+esc(KIND_LABELS[x.kind])+'</td><td>'+esc(x.kind==='practice'?course.missions[x.missionId].title:x.title)+'</td><td>'+(x.end-x.start)+'</td></tr>').join('');
  const pm=practiceModules(course);
  return '<div class="panel"><p class="eyebrow">LIVE DASHBOARD</p><h2>'+esc(course.subtitle)+' · '+s.no+'회차</h2><p class="meta">'+esc(s.title)+'</p>'+timelineBar(s)+
    '<dl class="kv"><dt>현재 단계</dt><dd>'+esc(moduleLabel(m)+' '+(m.kind==='practice'?course.missions[m.missionId].title:m.title))+'</dd>'+
    '<dt>강의 경과</dt><dd>'+formatClock(lectureElapsedMs(st,now))+'</dd>'+
    '<dt>계획 대비</dt><dd>'+(drift===null?'강의 시작 전':drift===0?'계획대로':(drift>0?drift+'분 늦음':(-drift)+'분 빠름'))+'</dd>'+
    '<dt>실습 타이머</dt><dd>'+(st.timer.status==='idle'?'대기':formatClock(timerRemainingMs(st,now))+' 남음')+'</dd></dl></div>'+
    '<div class="panel"><h3>'+s.no+'회차 진행표 (총 '+s.minutes+'분)</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>시간</th><th>구분</th><th>주제</th><th>분</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
    '<div class="panel"><h3>과정 구성 검증</h3><dl class="kv"><dt>총 교육 시간</dt><dd>'+totalMinutes(course)+'분 ('+course.sessions.length+'회 × 120분)</dd><dt>개인 집중 실습</dt><dd>'+practiceMinutes(course)+'분 = '+pm.map(x=>x.end-x.start).join(' + ')+'</dd><dt>직무별 사례</dt><dd>'+course.tracks.length+'개 · 난이도 '+course.levels.map(l=>l.label).join('/')+'</dd></dl></div>'+
    '<div class="panel"><h3>참여·완료 현황</h3><p class="notice">참여자 수와 완료율은 서버에 연결되어 있지 않아 표시하지 않습니다(가상 수치 표시 금지). 수강생 체크는 각자의 기기에만 저장됩니다. 현장에서는 손들기·구두 확인을 사용하세요. 동의 기반 서버 집계는 기관 권한·보유기간·삭제 정책 확정 후 활성화합니다(P1 · 미구현).</p></div>';
}
function viewCourses(){
  const cards=COURSES.map(c=>'<article class="course-card'+(c.id===course.id?' is-current':'')+'"><p class="eyebrow">'+esc(c.org)+'</p><h3>'+esc(c.subtitle)+'</h3><p>'+esc(c.title)+'</p><p class="meta">'+esc(c.format)+' · '+esc(c.state)+'</p>'+
    (c.engine==='live'?'<div class="btn-row"><a class="btn btn-small" href="'+esc(sessionHref('?c='+c.id))+'">운영실 열기</a></div>':'<div class="btn-row"><a class="btn btn-small" href="'+esc(liveBase(location.pathname)+'/'+c.href)+'">기존 강의실 열기 ↗</a></div><p class="meta">기존 과정 데이터는 그대로 보존되며 이 운영실에서 수정하지 않습니다.</p>')+'</article>').join('');
  return '<div class="panel"><p class="eyebrow">COURSES</p><h2>교육과정 관리</h2><p class="meta">과정 데이터는 Course → Session → Module → Activity → Practice → Assessment → Artifact 구조로 분리되어 새 교육에도 코드 복제 없이 재사용합니다.</p></div><div class="grid-2">'+cards+'</div>'+
    '<div class="panel"><h3>현재 과정 정보</h3><dl class="kv"><dt>과정</dt><dd>'+esc(course.title)+'</dd><dt>기관</dt><dd>'+esc(course.org.name)+'</dd><dt>대상</dt><dd>'+esc(course.audience)+'</dd><dt>구성</dt><dd>'+esc(course.format)+'</dd><dt>상태</dt><dd>'+esc(course.status)+'</dd><dt>실습 도구</dt><dd>'+esc(FACTCHAT_TOOL.name)+' (공식 사이트 링크 · 연동 없음)</dd></dl></div>';
}
function viewMissions(){
  const items=Object.values(course.missions).sort((a,b)=>a.no-b.no).map(m=>{const where=course.sessions.find(s=>s.modules.some(x=>x.missionId===m.id));const idx=where.modules.findIndex(x=>x.missionId===m.id);
    return '<article class="course-card"><p class="eyebrow">'+where.no+'회차 · '+m.minutes+'분'+(m.pcOnly?' · PC 전용':'')+'</p><h3>'+esc(m.title)+'</h3><p>'+esc(m.problem)+'</p><p class="meta">결과물: '+esc(m.deliverable)+'</p><div class="btn-row"><button type="button" class="btn btn-small" data-goto-session="'+where.no+'" data-goto-module="'+idx+'">미리보기·운영</button></div></article>';}).join('');
  return '<div class="panel"><p class="eyebrow">PRACTICE SCENARIOS</p><h2>실습 시나리오</h2><p class="meta">모든 실습은 10단계 구조(해결 과제 → 필요성 → 기능 → 준비 → 따라 하기 → 프롬프트 → 예상 결과 → 오류 검증 → 결과물 → 업무 적용)와 초급·중급·심화 달성 조건을 갖습니다. 평가는 문자열 일치가 아니라 사실 정확성·업무 적합성·출처 검증·보안 기준입니다.</p></div><div class="grid-2">'+items+'</div>'+
    '<div class="panel"><h3>평가 루브릭</h3>'+list(course.rubric.map(r=>r.label+' — '+r.desc))+'</div>';
}
function viewFeatures(){
  const checks=readFeatureChecks(storage);
  return '<div class="panel"><p class="eyebrow">FACTCHAT READINESS</p><h2>FactChat 기능 점검</h2><p class="meta">EKODI는 FactChat 기능을 다시 만들지 않고, 공식 사이트('+esc(new URL(FACTCHAT_TOOL.entryUrl).host)+')로 연결합니다. 아래 내용은 공식 문서('+esc(FACTCHAT_TOOL.docsAsOf)+' 기준)이며, 기관 계정의 메뉴·권한·크레딧은 EKODI가 검증하지 않았습니다. 수업 전 강사 계정으로 직접 확인한 뒤 표시하세요(이 기기에만 저장).</p>'+
    '<div class="btn-row"><a class="btn btn-primary" href="'+esc(FACTCHAT_TOOL.entryUrl)+'" target="_blank" rel="noopener noreferrer">FactChat 열기 ↗</a><a class="btn" href="'+esc(FACTCHAT_TOOL.docsUrl)+'" target="_blank" rel="noopener noreferrer">공식 기능 가이드 ↗</a></div></div>'+
    '<div class="features">'+allFeatureIds().map(id=>featureCard(checks,id,{controls:true})).join('')+'</div>'+
    '<div class="panel"><h3>직접 연동(API·SSO) 상태</h3><p class="notice notice-warn">FactChat API·SSO 연동은 공식 계약·인증 방식이 확인되지 않아 구현하지 않았습니다. 기관 계정 쿠키 복사나 브라우저 보안 우회는 하지 않습니다. 이슈 #5533(EKODI 자체 브라우저 인증 세션)은 운영 검증 전이므로 이 운영실은 그 기능에 의존하지 않습니다.</p></div>';
}
function viewMaterials(){
  const blocks=Object.values(course.missions).sort((a,b)=>a.no-b.no).map(m=>{
    const files=missionMaterials(course,m.id,prefs.track);
    return '<div class="panel"><h3>'+esc(m.title)+'</h3>'+(files.length?'<div class="downloads">'+files.map((f,i)=>'<button type="button" class="btn btn-small" data-mat="'+esc(m.id)+':'+i+'">⬇ '+esc(f.label)+'</button>').join('')+'</div>':'<p class="meta">내려받을 원문 없이 수강생 자신의 공개 가능한 업무 자료로 진행합니다.</p>')+'</div>';}).join('');
  return '<div class="panel"><p class="eyebrow">MATERIALS</p><h2>자료·내보내기</h2><p class="meta">모든 원문은 가상(허구) 실습자료입니다. 아래 직무 선택에 따라 내려받는 원문이 바뀝니다.</p>'+trackLevelControls()+
    '<div class="btn-row"><button type="button" class="btn" id="mdExport">전체 강의안 Markdown (강사 노트 포함)</button><button type="button" class="btn" id="mdExportPublic">수강생 배포용 Markdown</button><button type="button" class="btn" id="deckPrint">발표 슬라이드 PDF로 인쇄</button></div>'+
    '<p class="meta">PDF: 인쇄 대화상자에서 「PDF로 저장」을 선택하세요. PPTX 원본 변환은 제공하지 않습니다(발표는 웹 발표 모드 사용).</p></div>'+blocks;
}
function viewResults(){
  return '<div class="panel"><p class="eyebrow">RESULTS & FEEDBACK</p><h2>실습 성과·피드백</h2>'+
    '<p>수강생은 실습실에서 체크리스트·자기평가·어려웠던 점·업무 적용 계획을 <b>자기 기기에만</b> 저장하고, 「내 기록 내려받기」로 Markdown 파일을 받습니다. 제출이 필요하면 기관이 정한 공식 경로로 본인이 직접 제출합니다.</p></div>'+
    '<div class="panel"><h3>현재 운영 상태</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>구분</th><th>상태</th><th>비고</th></tr></thead><tbody>'+
    [['익명·로컬 기록(수강생 기기)','사용 가능','브라우저 저장소 · 「내 기록 삭제」 제공'],['개인 기록 Markdown 내보내기','사용 가능','개인정보 입력 금지 안내'],['동의 기반 서버 제출','미구현 (P1)','기관 권한·보유기간·삭제·감사 정책 확정 필요'],['강사 결과 조회·피드백 저장','미구현 (P1)','동의한 자료만 조회하도록 설계 예정'],['참여 수·완료율 집계','미표시','서버 미연결 상태에서 가상 수치 표시 금지'],['출결·공식 평가·수료증','비활성','기관 권한·수료 기준 확인 후에만']].map(r=>'<tr><td>'+esc(r[0])+'</td><td>'+esc(r[1])+'</td><td>'+esc(r[2])+'</td></tr>').join('')+
    '</tbody></table></div></div><div class="panel"><h3>현장 피드백 진행 방법</h3>'+list(['검증·공유 단계에서 지원자 화면만 프로젝터로 공유(개인정보 확인 후)','우수 사례: 프롬프트 → 결과물 → 검증 방법 순 30초 발표','어려웠던 점은 손들기로 확인하고 다음 회차 도입에서 다룸'],true)+'</div>';
}
function viewEditor(){
  return '<div class="panel"><p class="eyebrow">AUTHORING</p><h2>강의안 편집</h2><p>이 과정의 강의 내용·실습 프롬프트는 저장소의 과정 데이터 파일에서 관리되며, 변경은 검토·승인 배포를 거칩니다. 브라우저에서 파일(DOCX·PPTX·HWPX 등)의 텍스트를 추출해 초안을 만드는 기존 <b>교안 편집 스튜디오</b>를 계속 사용할 수 있습니다.</p>'+
    '<div class="btn-row"><a class="btn" href="'+esc(liveBase(location.pathname)+'/study/ai-bootcamp/studio/')+'">교안 편집 스튜디오 열기 ↗</a><a class="btn" href="'+esc(liveBase(location.pathname)+'/study/academy/')+'">맞춤형 강의 구성(규칙 기반) ↗</a></div></div>'+
    '<div class="panel"><h3>상태</h3>'+list(['AI 자동 생성: 승인된 AI 작성 기능이 연결되지 않아 제공하지 않음 (규칙 기반 템플릿만 사용)','서버 저장·버전 비교·복원·기관별 템플릿: 미구현 (P1/P2) — 강사 권한·감사로그·삭제 정책 설계 후 진행','이미지·표·서식: 파일 텍스트 추출 시 보존되지 않음(기존 스튜디오에서 명시)'])+'</div>';
}
const VIEWS={module:viewModule,dashboard:viewDashboard,courses:viewCourses,missions:viewMissions,features:viewFeatures,materials:viewMaterials,results:viewResults,editor:viewEditor};

function renderView(){
  $('#view').innerHTML=VIEWS[view]();
  renderNav();
}
function renderTimerMissions(){
  const sel=$('#timerMission');const cur=sel.value;
  sel.innerHTML=session().modules.filter(m=>m.kind==='practice').map(m=>'<option value="'+esc(m.missionId)+'">'+esc(course.missions[m.missionId].title)+' · '+course.missions[m.missionId].minutes+'분</option>').join('');
  const m=mod();
  sel.value=m.kind==='practice'?m.missionId:(S().timer.missionId&&course.missions[S().timer.missionId]&&sel.querySelector('option[value="'+S().timer.missionId+'"]')?S().timer.missionId:(cur&&sel.querySelector('option[value="'+cur+'"]')?cur:sel.options[0]?.value||''));
}
function renderJoin(){
  const url=joinLink();
  $('#joinQr').innerHTML=qrSvg(url,{label:'수강생 실습실 접속 QR'});
  $('#joinUrl').textContent=url;
  $('#openLearner').href=url;
  $('#shareLevel').value=S().shared.level||'basic';
}
function renderSlideInfo(){
  const st=S(),slide=slides[st.slideIndex];
  $('#slideNow').textContent=slide?(st.slideIndex+1)+' / '+slides.length+' · '+slide.t:'-';
  $('#slidePrev').disabled=st.slideIndex<=0;$('#slideNext').disabled=st.slideIndex>=slides.length-1;
  $('#blackout').setAttribute('aria-pressed',String(st.blackout));$('#blackout').textContent=st.blackout?'화면 다시 표시':'화면 가리기';
  $('#syncInfo').textContent=(channel?'같은 컴퓨터의 발표 창과 실시간 동기화':'이 브라우저는 창 간 실시간 동기화를 지원하지 않습니다 — 「수동 동기화」 사용')+' · '+(store.persisted||storage?'새로고침 후 상태 복구됨':'저장소 차단: 새로고침 시 초기화');
}
function tick(){
  const st=S(),now=Date.now();
  $('#lectureClock').textContent=formatClock(lectureElapsedMs(st,now));
  const phase=timerPhase(st,now);
  const clock=$('#timerClock');
  clock.textContent=formatClock(st.timer.status==='idle'?(course.missions[$('#timerMission').value]?.minutes||30)*60000:timerRemainingMs(st,now));
  clock.className='big-clock '+(['warn','final','done'].includes(phase)?phase:'');
  const mission=course.missions[st.timer.missionId];
  $('#timerInfo').textContent={idle:'대기 중',running:'진행 중',paused:'일시정지',warn:'종료 5분 전',final:'종료 1분 전',done:'실습 시간 종료'}[phase]+(mission&&phase!=='idle'?' · '+mission.title:(st.timer.status!=='idle'&&!mission?' · 휴식':''));
  $('#timerPause').textContent=st.timer.status==='paused'?'재개':'일시정지';
  $('#timerPause').disabled=st.timer.status==='idle';
  if(phase!==lastPhase){
    if(phase==='warn')toast('실습 종료 5분 전입니다. 결과 저장·검증을 안내하세요.');
    if(phase==='final')toast('실습 종료 1분 전입니다.');
    if(phase==='done')toast('실습 시간이 끝났습니다. 검증·공유로 넘어가세요.');
    document.title=(phase==='warn'||phase==='final'||phase==='done'?'⏱ ':'')+'강사 운영실 · EKODI Education Premium Studio';
    lastPhase=phase;
  }
  if(view==='dashboard'&&Math.floor(now/1000)%15===0)renderView();
}
function renderAll(){renderTop();renderTimerMissions();renderView();renderJoin();renderSlideInfo();tick();}

function gotoModule(i,{present=false}={}){
  const s=session();const index=Math.max(0,Math.min(s.modules.length-1,Number(i)));
  view='module';
  store.dispatch({type:'module/set',index,slideIndex:present?firstSlideOf(s.modules[index].id):S().slideIndex});
  $('#studioMain').focus({preventScroll:true});
}
function setSlide(i){
  const index=Math.max(0,Math.min(slides.length-1,i));
  const target=slides[index];
  const moduleIndex=session().modules.findIndex(m=>m.id===target.moduleId);
  store.dispatch({type:'slide/set',index,moduleIndex:moduleIndex<0?S().moduleIndex:moduleIndex});
}
function startPractice(missionId){
  const m=course.missions[missionId];if(!m)return;
  store.dispatch({type:'timer/start',missionId,durationMs:m.minutes*60000});
  if(S().lecture.status!=='running')store.dispatch({type:'lecture/start'});
  toast(m.title+' 시작 · '+m.minutes+'분');
}
function openPresenter(audience=false){
  const url=sessionHref('present/?c='+encodeURIComponent(course.id)+(audience?'&view=audience':''));
  const win=window.open(url,audience?'ekodi-edu-audience':'ekodi-edu-presenter','noopener');
  if(!win&&!audience)location.href=url;
  else if(!win)toast('팝업이 차단되었습니다. 주소창의 팝업 허용 후 다시 누르세요.');
}

function bind(){
  document.addEventListener('click',async event=>{
    const t=event.target.closest('button,a');if(!t)return;
    const d=t.dataset;
    if(d.view){view=d.view;renderView();$('#studioMain').focus({preventScroll:true});return;}
    if(d.module!==undefined){gotoModule(d.module);return;}
    if(d.gotoSession){if(Number(d.gotoSession)!==S().session)store.dispatch({type:'session/set',session:Number(d.gotoSession)});gotoModule(d.gotoModule);return;}
    if(d.presentModule!==undefined){const m=session().modules[Number(d.presentModule)];setSlide(firstSlideOf(m.id));toast('발표 화면을 「'+(m.kind==='practice'?course.missions[m.missionId].title:m.title)+'」로 전환했습니다.');return;}
    if(d.startPractice){startPractice(d.startPractice);return;}
    if(d.startBreak){store.dispatch({type:'timer/start',missionId:'',durationMs:Number(d.startBreak)});toast('휴식 타이머 시작');return;}
    if(d.timerAdd){store.dispatch({type:'timer/add',ms:Number(d.timerAdd)});return;}
    if(d.featureCheck){writeFeatureCheck(storage,d.featureCheck,d.status);renderView();toast('기능 상태를 이 기기에 기록했습니다.');return;}
    if(d.copy){const el=document.getElementById(d.copy);const r=await copyText(window,el?.textContent||'',el);toast(r==='copied'?'프롬프트를 복사했습니다.':r==='selected'?'텍스트를 선택했습니다. Ctrl+C로 복사하세요.':'복사하지 못했습니다.');return;}
    if(d.download!==undefined){const m=mod();const files=missionMaterials(course,m.missionId,prefs.track);const f=files[Number(d.download)];if(f)downloadText(document,f.name,f.text);return;}
    if(d.mat){const [mid,i]=d.mat.split(':');const f=missionMaterials(course,mid,prefs.track)[Number(i)];if(f){downloadText(document,f.name,f.text);toast(f.label+' 내려받기');}return;}
    if(t.id==='mdExport'){downloadText(document,course.id+'_lesson-plan_instructor.md',courseMarkdown(course,{notes,tool:FACTCHAT_TOOL}),'text/markdown;charset=utf-8');return;}
    if(t.id==='mdExportPublic'){downloadText(document,course.id+'_lesson-plan_learner.md',courseMarkdown(course,{tool:FACTCHAT_TOOL}),'text/markdown;charset=utf-8');return;}
    if(t.id==='deckPrint'){openPresenter();toast('발표 창에서 「인쇄·PDF」를 누르면 슬라이드 전체를 PDF로 저장합니다.');return;}
  });
  document.addEventListener('change',event=>{
    const t=event.target;
    if(t.id==='trackPicker'){prefs.track=t.value;savePrefs();renderView();}
    else if(t.id==='levelPicker'){prefs.level=t.value;savePrefs();renderView();}
    else if(t.id==='fallbackPicker'){prefs.showFallback=t.value==='1';savePrefs();renderView();}
  });
  $('#sessionPicker').addEventListener('change',e=>{
    const st=S();
    if(st.lecture.status==='running'&&!confirm('강의가 진행 중입니다. 회차를 바꾸면 진행 시간과 타이머가 초기화됩니다. 계속할까요?')){e.target.value=String(st.session);return;}
    store.dispatch({type:'session/set',session:Number(e.target.value)});view='module';
  });
  $('#lectureToggle').addEventListener('click',()=>{
    const s=S().lecture.status;
    store.dispatch({type:s==='running'?'lecture/pause':'lecture/start'});
  });
  $('#lectureEnd').addEventListener('click',()=>{if(S().lecture.status==='idle')return;if(confirm('강의를 종료할까요? 진행 시간이 기록된 채 멈춥니다.'))store.dispatch({type:'lecture/end'});});
  $('#openPresenter').addEventListener('click',()=>openPresenter());
  $('#openAudience').addEventListener('click',()=>openPresenter(true));
  $('#timerStart').addEventListener('click',()=>startPractice($('#timerMission').value));
  $('#timerPause').addEventListener('click',()=>store.dispatch({type:S().timer.status==='paused'?'timer/resume':'timer/pause'}));
  $('#timerReset').addEventListener('click',()=>{if(S().timer.status==='idle'||confirm('실습 타이머를 초기화할까요?'))store.dispatch({type:'timer/reset'});});
  $('#timerMission').addEventListener('change',()=>tick());
  $('#shareLevel').addEventListener('change',e=>store.dispatch({type:'share/level',level:e.target.value}));
  $('#copyJoin').addEventListener('click',async()=>{const r=await copyText(window,joinLink(),$('#joinUrl'));toast(r==='copied'?'접속 링크를 복사했습니다.':'링크를 선택했습니다. Ctrl+C로 복사하세요.');});
  $('#slidePrev').addEventListener('click',()=>setSlide(S().slideIndex-1));
  $('#slideNext').addEventListener('click',()=>setSlide(S().slideIndex+1));
  $('#blackout').addEventListener('click',()=>store.dispatch({type:'blackout/toggle'}));
  $('#resync').addEventListener('click',()=>{store.resync();renderAll();toast('저장된 최신 상태로 동기화했습니다.');});
  $('#previewModule').addEventListener('click',()=>window.open(joinLink(),'_blank','noopener'));
  $('#exportPlan').addEventListener('click',()=>downloadText(document,course.id+'_lesson-plan_instructor.md',courseMarkdown(course,{notes,tool:FACTCHAT_TOOL}),'text/markdown;charset=utf-8'));
  $('#printPlan').addEventListener('click',()=>window.print());
  $('#bottomPractice').addEventListener('click',()=>{const m=mod();if(m.kind==='practice')startPractice(m.missionId);else{const next=session().modules.find((x,i)=>i>S().moduleIndex&&x.kind==='practice');if(next){gotoModule(session().modules.indexOf(next));toast('다음 실습 단계로 이동했습니다. 다시 누르면 시작합니다.');}else toast('이 회차에 남은 실습이 없습니다.');}});
  window.addEventListener('storage',e=>store.onStorage(e));
  document.addEventListener('keydown',e=>{
    if(e.target.closest('input,select,textarea'))return;
    if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();setSlide(S().slideIndex+1);}
    if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();setSlide(S().slideIndex-1);}
  });
}

async function init(){
  loadPrefs();
  const [data,noteMod]=await Promise.all([entry.load(),entry.loadNotes?entry.loadNotes():Promise.resolve({NOTES:{}})]);
  course=data.COURSE;validateCourse(course);notes=noteMod.NOTES||{};
  if(!course.tracks.some(t=>t.id===prefs.track))prefs.track=course.tracks[0].id;
  $('#sessionPicker').innerHTML=course.sessions.map(s=>'<option value="'+s.no+'">'+s.no+'회차 · '+esc(s.title)+'</option>').join('');
  $('#shareLevel').innerHTML=course.levels.map(l=>'<option value="'+l.id+'">'+esc(l.label)+'</option>').join('');
  store=createLiveStore({courseId:course.id,storage,channel,onChange:(state,source)=>{
    slides=sessionSlides(course,state.session);
    renderAll();
  }});
  slides=sessionSlides(course,S().session);
  const qs=Number(params.get('s'));
  if(sessionByNo(course,qs)&&qs!==S().session)store.dispatch({type:'session/set',session:qs});
  bind();renderAll();
  setInterval(tick,500);
  document.body.dataset.ready='true';
}
init().catch(error=>{console.error('studio init',error);$('#view').innerHTML='<div class="panel"><h2>운영실을 불러오지 못했습니다</h2><p class="meta">'+multiline(error?.message||error)+'</p></div>';});
