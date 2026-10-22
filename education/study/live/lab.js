// EKODI Education Premium Studio — Learner Lab v2 (수강생 개인 실습실).
// Public, anonymous, local-only. Never loads instructor notes, never posts data, never stores personal identifiers.
// Guided practice: 준비 → FactChat 열기 → 프롬프트 ① → 프롬프트 ② → 결과 점검(규칙 기반, AI 아님) → 완료·적용.
import {courseEntry} from './courses/registry.js';
import {livePath,validateCourse,sessionByNo,parseLearnerParams,formatClock,missionMaterials,missionContext,KIND_LABELS,buildPrompts,trackById,levelById,criteriaFor,roleById} from './engine/model.js';
import {esc,list,readFeatureChecks,featureBadge,downloadText,copyText,safeStorage,multiline,bindChrome,instructorCard} from './engine/render.js';
import {checkOutput} from './engine/checker.js';
import {detectContentWarnings} from '../ai-bootcamp/material-source.js';
import {FACTCHAT_TOOL,featureById} from './tools/factchat.js';

const $=s=>document.querySelector(s);
const entry=courseEntry(new URLSearchParams(location.search).get('c'));
const storage=safeStorage(window);
const MAX_TEXT=4000,MAX_RESULT=12000;
const STEP_LABELS=['준비','FactChat 열기','프롬프트 ①','프롬프트 ②','결과 점검','완료·적용'];
const STEP_ACTIONS=['자료 확인 완료','FactChat 열기','프롬프트 ① 복사','프롬프트 ② 복사','결과 자동 점검','실습 완료'];
const STEP_ACTIONS_MOBILE={2:'① 복사·FactChat',3:'② 복사·FactChat'};
let course,rec,key,toastTimer=0,lastPhase='',relayout=()=>{},spy=null,spyLock=0,sheetText='',sheetName='';

const blank=()=>({v:1,session:1,unlocked:false,track:'',role:'',timerMin:{},trackChosen:false,bigText:false,level:'basic',tab:'agenda',checked:{},memo:{},self:{},quiz:{},hunts:{},plan:'',applied:'',timers:{},
  step:{},done:{},results:{},ownSource:{},checks:{},updatedAt:0});
function load(){
  try{const raw=JSON.parse(storage?.getItem(key)||'null');if(raw&&raw.v===1)return {...blank(),...raw};}catch{}
  return blank();
}
function save(){
  rec.updatedAt=Date.now();
  try{storage?.setItem(key,JSON.stringify(rec));}catch{toast('이 브라우저는 저장을 막고 있습니다. 「내 기록 내려받기」로 보관하세요.');}
}
function toast(text){const el=$('#toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},3000);}
const session=()=>sessionByNo(course,rec.session)||course.sessions[0];
const sessionMissions=()=>session().modules.filter(m=>m.kind==='practice').map(m=>m.missionId);
const isNarrow=()=>window.matchMedia('(max-width: 899px)').matches||window.matchMedia('(pointer: coarse)').matches;
const canSplit=()=>!isNarrow()&&(window.screen?.availWidth||0)>=1100;
// Session 2+ stays closed until every session-1 practice is complete on this device, or the learner came in
// through the instructor's link/QR for that session (open=1). Course flow guidance, not access control.
const firstSessionMissions=()=>course.sessions[0].modules.filter(m=>m.kind==='practice').map(m=>m.missionId);
const firstSessionDone=()=>firstSessionMissions().every(id=>rec.done[id]);
const sessionLocked=no=>no>1&&!rec.unlocked&&!firstSessionDone();
function activeMission(){const t=rec.tab;return t.startsWith('m:')&&course.missions[t.slice(2)]?t.slice(2):'';}
const clean=(v,max=MAX_TEXT)=>String(v||'').replace(/\u0000/g,'').slice(0,max);
const stepOf=id=>Math.max(0,Math.min(STEP_LABELS.length-1,Number(rec.step[id])||0));
function sourceFor(id){const ctx=missionContext(course,id,rec.track);return id==='free'?(rec.ownSource.free||''):(ctx.source||ctx.script||ctx.facts||'');}

function tabs(){
  const items=[['agenda','오늘 순서']].concat(sessionMissions().map(id=>['m:'+id,course.missions[id].title.replace('개인 실습 ',''),rec.done[id]]));
  items.push(['activity',session().no===1?'퀴즈·오류 찾기':'오류 찾기·적용 계획'],['record','내 기록']);
  $('#labTabs').innerHTML=items.map(([id,label,done])=>'<button type="button" class="tab'+(rec.tab===id?' is-on':'')+'" data-tab="'+esc(id)+'" aria-pressed="'+(rec.tab===id)+'">'+esc(label)+(done?'<span class="tick">완료</span>':'')+'</button>').join('');
}
function viewAgenda(){
  const rows=session().modules.map(m=>{
    const title=m.kind==='practice'?course.missions[m.missionId].title:m.title;
    const tasks=m.learner?.tasks?list(m.learner.tasks,true):m.kind==='practice'?'<div class="btn-row"><button type="button" class="btn btn-small btn-primary" data-tab="m:'+esc(m.missionId)+'">'+(rec.done[m.missionId]?'다시 보기':'실습 시작')+' →</button></div>':m.summary?'<p class="meta">'+esc(m.summary)+'</p>':'';
    return '<article class="panel" data-sec id="sec-mod-'+esc(m.id)+'"><p class="eyebrow">'+m.start+'–'+m.end+'분 · '+esc(KIND_LABELS[m.kind])+(m.kind==='practice'&&rec.done[m.missionId]?' · 완료':'')+'</p><h3>'+esc(m.learner?.headline||title)+'</h3>'+tasks+'</article>';
  }).join('');
  const s=session();
  const pick=rec.trackChosen?'':trackPicker('실습 준비','어떤 일을 하시나요?','고르면 내 업무 원문으로 실습합니다.');
  const missions=sessionMissions();
  const stamps='<div class="stamps" aria-label="오늘의 스탬프">'+missions.map(id=>'<span class="stamp'+(rec.done[id]?' is-on':'')+'" title="'+esc(course.missions[id].title)+'"><i aria-hidden="true">'+(rec.done[id]?'완료':course.missions[id].no)+'</i><b>'+esc(course.missions[id].title.replace('개인 실습 ',''))+'</b></span>').join('')+'</div>';
  const outcomes='<section class="panel goal"><p class="eyebrow">'+s.no+'회차 · 오늘 손에 쥐고 나갈 것</p><h2>'+esc(s.title)+'</h2>'+(s.outcomes?.length?'<ol class="goal-list">'+s.outcomes.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ol>':'')+
    stamps+
    '<div class="btn-row">'+factchatButtons()+'</div><p class="meta">본인 기관 계정으로 로그인합니다.</p></section>';
  const hook=s.modules.find(m=>m.hook)?.hook;
  const hookCard=hook?'<section class="panel hook-card"><p class="eyebrow">오늘의 질문</p><p class="hook-q">'+esc(hook.q)+'</p></section>':'';
  return '<div data-sec id="sec-intro">'+pick+instructorCard(course.instructor,livePath(location.pathname,''),{compact:true})+hookCard+outcomes+'</div>'+rows;
}
// Practice runs for everyone at the same time, each in their own field: the picker appears on the agenda
// and again at the start of a practice if no field was chosen yet.
function trackPicker(eyebrow,title,lead){
  return '<section class="panel pick" aria-labelledby="pickTitle"><p class="eyebrow">'+esc(eyebrow)+'</p><h2 id="pickTitle">'+esc(title)+'</h2><p class="meta">'+esc(lead)+'</p>'+
    '<div class="pick-grid">'+course.tracks.map(t=>'<button type="button" class="pick-tile" data-pick-track="'+esc(t.id)+'"><b>'+esc(t.label)+'</b><span>'+esc(t.examples)+'</span></button>').join('')+'</div></section>';
}
function factchatButtons(){
  return (canSplit()?'<button type="button" class="btn btn-primary" data-split="1">FactChat 나란히 열기 ↗</button>':'')+
    '<a class="btn'+(canSplit()?'':' btn-primary')+'" href="'+esc(FACTCHAT_TOOL.entryUrl)+'" target="_blank" rel="noopener noreferrer" data-open-tool="factchat">FactChat '+(canSplit()?'새 탭':'열기')+' ↗</a>';
}

function stepCard(id,s){
  const m=course.missions[id],ctx=missionContext(course,id,rec.track),level=levelById(course,rec.level);
  const prompts=buildPrompts(course,id,rec.track,rec.level,rec.role);
  const head=(t,lead)=>'<p class="step-no">STEP '+(s+1)+'</p><h2>'+esc(t)+'</h2>'+(lead?'<p class="lead">'+esc(lead)+'</p>':'');
  const narrow=isNarrow();
  if(s===0){
    const files=missionMaterials(course,id,rec.track);
    const pc=m.pcOnly?'<p class="notice'+(narrow?' pc-only':'')+'">'+(narrow?'<b>HWP 편집은 PC 전용입니다.</b> 휴대폰에서는 「대체 실습 자료」로 오류 찾기를 하세요.':'HWP 편집은 PC 전용입니다.')+'</p>':'';
    const ideas=id==='free'&&ctx.ideas.length?'<h3>'+esc(ctx.label)+' 추천 과제</h3>'+list(ctx.ideas):'';
    const mats=files.map((f,i)=>'<div class="mat"><p class="mat-label">'+esc(f.label)+(i===0&&(ctx.doc||ctx.meeting||ctx.topic)?' · '+esc(ctx.doc||ctx.meeting||ctx.topic):'')+'</p><p class="mat-preview">'+esc(f.text.replace(/\s+/g,' ').slice(0,110))+'…</p>'+
      '<div class="btn-row"><button type="button" class="btn btn-small btn-primary" data-view-material="'+i+'">원문 보기·복사</button><button type="button" class="btn btn-small" data-copy-material="'+i+'">바로 복사</button></div></div>').join('');
    return head('무엇을 만드나요?',m.problem)+pc+'<p class="meta"><b>결과물</b> '+esc(m.deliverable)+'</p>'+(mats?'<div class="mats">'+mats+'</div>':'')+ideas+'<h3>준비물</h3>'+list(m.prepare);
  }
  if(s===1){
    const feats=m.features.map(fid=>{const f=featureById(fid);return f?'<li><b>'+esc(f.label)+'</b> — '+esc(f.where)+' '+featureBadge(readFeatureChecks(storage),fid)+'</li>':'';}).join('');
    return head('FactChat 열기','본인 기관 계정으로 로그인합니다.')+
      '<ul class="feature-list">'+feats+'</ul><div class="big-action">'+factchatButtons()+'</div>'+
      (canSplit()?'<p class="split-hint">「나란히 열기」는 FactChat을 화면 오른쪽 절반에 띄웁니다.</p>':'<p class="split-hint">로그인 후 이 탭으로 돌아와 다음 단계를 진행하세요.</p>')+
      '<h3>FactChat에서 할 일</h3>'+list(m.steps.slice(0,2),true);
  }
  if(s===2||s===3){
    const i=s-2,p=prompts[i],pid='step-prompt-'+s;
    const todo=s===2?m.steps.slice(1,3):m.steps.slice(3);
    const copyOpen='<button type="button" class="btn'+(canSplit()?'':' btn-primary')+'" data-copy-open="'+pid+'">복사하고 FactChat 열기 ↗</button>';
    const copyOnly='<button type="button" class="btn'+(canSplit()?' btn-primary':'')+'" data-copy="'+pid+'">프롬프트 복사</button>';
    return head(p?p.label:'프롬프트',s===2?'복사 → FactChat 입력창에 붙여넣기 → 실행':'같은 대화에서 이어서 실행합니다.')+(p?'<pre class="prompt-text" id="'+pid+'" tabindex="0">'+esc(p.text)+'</pre>':'')+
      '<div class="big-action">'+(canSplit()?copyOnly+'<button type="button" class="btn" data-split="1">FactChat 창 보기 ↗</button>':copyOpen+copyOnly)+'</div>'+
      '<h3>FactChat에서 할 일</h3>'+list(todo,true);
  }
  if(s===4){
    const res=rec.results[id]||'';
    const own=id==='free'?'<label class="field">내 원문 (선택 · 개인정보 제외)<textarea data-own-source="1" maxlength="'+MAX_RESULT+'" placeholder="AI에게 준 원문을 붙여 넣으면 그 원문과 대조합니다.">'+esc(rec.ownSource.free||'')+'</textarea></label>':'';
    const errs=m.errors.map((c,i)=>{const k=id+':err:'+i;return '<label class="check"><input type="checkbox" data-crit="'+esc(k)+'"'+(rec.checked[k]?' checked':'')+'> <span>'+esc(c)+'</span></label>';}).join('');
    return head('결과 점검','FactChat 결과를 붙여 넣으면 숫자·날짜·연락처·확정 표현을 원문과 대조합니다.')+own+
      '<label class="field">FactChat 결과 붙여넣기<textarea data-result="'+esc(id)+'" maxlength="'+MAX_RESULT+'" placeholder="여기에 AI 결과를 붙여 넣으세요. (이 기기에만 저장)">'+esc(res)+'</textarea></label>'+
      '<div class="big-action"><button type="button" class="btn btn-primary" data-run-check="'+esc(id)+'">결과 자동 점검</button>'+(m.fallback.sampleOutput?'<button type="button" class="btn" data-sample="'+esc(id)+'">예시 결과로 연습</button>':'')+'</div>'+
      '<p class="split-hint">규칙 기반 점검(AI 아님) · 사람·담당·결정은 직접 대조하세요.</p>'+
      '<div class="verify-out" id="verifyOut" aria-live="polite">'+findingsHtml(rec.checks[id])+'</div>'+
      '<h3>사람이 직접 확인할 항목</h3><div class="checks">'+errs+'</div>';
  }
  const crit=criteriaFor(m,level).map((c,i)=>{const k=id+':'+level.id+':'+i;return '<label class="check"><input type="checkbox" data-crit="'+esc(k)+'"'+(rec.checked[k]?' checked':'')+'> <span>'+esc(c)+'</span></label>';}).join('');
  const self=rec.self[id]||{};
  const score=[1,2,3,4,5].map(n=>'<label class="check"><input type="radio" name="score-'+esc(id)+'" value="'+n+'" data-self="'+esc(id)+'"'+(Number(self.score)===n?' checked':'')+'> <span>'+n+'</span></label>').join('');
  return head('완료·적용',m.apply)+'<h3>달성 조건 · '+esc(level.label)+'</h3><div class="checks">'+crit+'</div>'+
    '<h3>자기평가 (1 어려움 · 5 자신 있음)</h3><div class="stars" role="radiogroup" aria-label="자기평가">'+score+'</div>'+
    '<label class="field">실습 메모 · 결과 요약 (개인정보 제외)<textarea data-memo="'+esc(id)+'" aria-label="실습 메모" maxlength="'+MAX_TEXT+'">'+esc(rec.memo[id]||'')+'</textarea></label>'+
    '<label class="field">어려웠던 부분<textarea data-hard="'+esc(id)+'" maxlength="'+MAX_TEXT+'">'+esc(self.hard||'')+'</textarea></label>'+
    '<div class="big-action"><button type="button" class="btn btn-primary" data-finish="'+esc(id)+'">'+(rec.done[id]?'완료됨 · 다음 실습으로':'실습 완료')+'</button></div>';
}
function findingsHtml(result){
  if(!result)return '';
  const s=result.summary||{};
  return '<p class="verify-sum"><span class="badge badge-live">확인 필요 '+(s.risk||0)+'</span><span class="badge badge-warn">주의 '+(s.warn||0)+'</span><span class="badge">참고 '+(s.info||0)+'</span></p>'+
    (result.privacy?.length?'<div class="finding risk"><b>개인정보로 보이는 내용</b><p>'+esc(result.privacy.join(', '))+' — 실습 결과에 개인정보를 넣지 마세요.</p></div>':'')+
    (result.findings||[]).map(f=>'<div class="finding '+esc(f.level)+'"><b>'+esc(f.title)+'</b><p>'+esc(f.detail)+'</p></div>').join('');
}
function viewMission(id){
  if(!rec.trackChosen)return trackPicker('분야별 실습','내 업무 분야를 고르세요','고르면 바로 시작합니다.');
  return STEP_LABELS.map((_,s)=>'<section class="step-card" data-sec id="sec-step-'+s+'" data-step-sec="'+s+'" tabindex="-1">'+stepCard(id,s)+'</section>').join('');
}
function viewActivity(){
  const s=session();
  const quizMod=s.modules.find(m=>m.learner?.quiz);
  const quiz=quizMod?'<div class="panel" data-sec id="sec-quiz"><h3>OX 퀴즈</h3><div class="quiz">'+course.quiz.map((q,i)=>{
      const ans=rec.quiz[i];const answered=ans===true||ans===false;const ok=answered&&ans===q.a;
      return '<div class="quiz-q"><p>'+(i+1)+'. '+esc(q.q)+'</p><div class="btn-row"><button type="button" class="btn btn-small" data-quiz="'+i+'" data-ans="1" aria-pressed="'+(ans===true)+'">O</button><button type="button" class="btn btn-small" data-quiz="'+i+'" data-ans="0" aria-pressed="'+(ans===false)+'">X</button></div>'+
        (answered?'<p class="result '+(ok?'ok':'no')+'">'+(ok?'정답':'다시 생각해 보세요')+' — '+esc(q.why)+'</p>':'')+'</div>';}).join('')+'</div></div>':'';
  const hunts=s.modules.filter(m=>m.errorHunt).map(m=>course.errorHunts.find(h=>h.id===m.errorHunt)).filter(Boolean).map(h=>
    '<div class="panel" data-sec id="sec-hunt-'+esc(h.id)+'"><h3>AI 오류 찾기 · '+esc(h.title)+'</h3><pre class="source-text">'+esc(h.text)+'</pre><p class="meta">힌트: '+esc(h.hint)+'</p><label class="field">찾은 오류와 바른 내용<textarea data-hunt="'+esc(h.id)+'" maxlength="'+MAX_TEXT+'">'+esc(rec.hunts[h.id]||'')+'</textarea></label><p class="meta">정답은 강사가 함께 확인합니다.</p></div>').join('');
  const plan=s.modules.some(m=>m.kind==='share')?planPanel():'';
  return (quiz+hunts+plan)||'<div class="panel"><p>이 회차에는 별도 활동이 없습니다.</p></div>';
}
function planPanel(){
  return '<div class="panel" data-sec id="sec-plan"><h3>30일 업무 적용 계획</h3><p class="meta">적용할 업무 · 사용할 기능 · 주기 · 측정 지표(소요 시간, 수정 횟수)를 적습니다.</p><textarea data-plan="1" maxlength="'+MAX_TEXT+'">'+esc(rec.plan||'')+'</textarea>'+
    '<label class="field">교육 후 적용 결과 (선택 · 나중에 기록)<textarea data-applied="1" maxlength="'+MAX_TEXT+'">'+esc(rec.applied||'')+'</textarea></label></div>';
}
function viewRecord(){
  const rows=Object.values(course.missions).sort((a,b)=>a.no-b.no).map(m=>{
    const level=levelById(course,rec.level);
    const crit=criteriaFor(m,level);const done=crit.filter((_,i)=>rec.checked[m.id+':'+level.id+':'+i]).length;
    const errs=m.errors.filter((_,i)=>rec.checked[m.id+':err:'+i]).length;
    const chk=rec.checks[m.id]?.summary;
    return '<tr><td>'+esc(m.title)+(rec.done[m.id]?' · 완료':'')+'</td><td class="num">'+done+' / '+crit.length+'</td><td class="num">'+errs+' / '+m.errors.length+'</td><td class="num">'+(chk?'확인 '+chk.risk+' · 주의 '+chk.warn:'-')+'</td><td class="num">'+(rec.self[m.id]?.score?esc(rec.self[m.id].score)+'점':'-')+'</td></tr>';}).join('');
  return '<div class="panel"><h2>내 기록</h2><p class="meta">익명·로컬 모드입니다. 출결·공식 평가·수료와 연결되지 않습니다.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>실습</th><th>달성 조건</th><th>오류 검증</th><th>자동 점검</th><th>자기평가</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="btn-row"><button type="button" class="btn btn-primary" id="exportRec">내 기록 내려받기 (Markdown)</button></div><p class="meta">제출이 필요하면 기관이 안내한 공식 경로로 본인이 직접 제출합니다. EKODI 서버로 자동 제출하지 않습니다.</p></div>'+planPanel();
}

function renderDock(){
  const id=activeMission();
  const prev=$('#dockPrev'),next=$('#dockNext'),act=$('#dockAction');
  act.disabled=false;
  if(id&&!rec.trackChosen){
    prev.hidden=true;next.hidden=true;
    $('#dockLabel').innerHTML='<b>먼저 내 분야 선택</b><span>'+esc(course.missions[id].title.replace('개인 실습 ',''))+'</span>';
    act.textContent='위에서 분야 고르기';act.dataset.mode='pick';act.disabled=true;
  }else if(id){
    const s=stepOf(id),m=course.missions[id];
    $('#dockLabel').innerHTML='<b>'+(s+1)+' / '+STEP_LABELS.length+' · '+esc(STEP_LABELS[s])+'</b><span>'+esc(m.title.replace('개인 실습 ',''))+'</span>';
    prev.hidden=false;next.hidden=false;prev.disabled=s===0;next.disabled=s===STEP_LABELS.length-1;
    act.textContent=s===STEP_LABELS.length-1&&rec.done[id]?'다음 실습':(!canSplit()&&STEP_ACTIONS_MOBILE[s])||STEP_ACTIONS[s];
    act.dataset.mode='step';
  }else{
    const pending=sessionMissions().find(m=>!rec.done[m])||sessionMissions()[0];
    prev.hidden=true;next.hidden=true;
    $('#dockLabel').innerHTML='<b>'+(pending?esc(course.missions[pending].title.replace('개인 실습 ','')):'오늘 순서')+'</b><span>'+session().no+'회차 · '+(pending&&rec.done[pending]?'모든 실습 완료':'다음 실습')+'</span>';
    act.textContent=pending?'실습 열기':'오늘 순서';act.dataset.mode='open';act.dataset.target=pending||'';
  }
}
function render(){
  if(sessionLocked(rec.session))return renderLocked();
  $('#labTabsWrap').hidden=false;
  tabs();
  $('#labSub').textContent=session().no+'회차 · '+session().title;
  const id=activeMission();
  let html;
  if(id)html=viewMission(id);
  else if(rec.tab==='activity')html=viewActivity();
  else if(rec.tab==='record')html=viewRecord();
  else html=viewAgenda();
  $('#labView').innerHTML=html;
  sessionOptions();$('#labTrack').value=rec.track;$('#labLevel').value=rec.level;
  fillRoles();renderSummary();
  $('#topSub').textContent=session().no+'회차 · '+(id?course.missions[id].title.replace('개인 실습 ',''):'수강생 실습실');
  renderSubnav();renderDock();tick();relayout();measureTabs();setupSpy();
}
function renderLocked(){
  const ids=firstSessionMissions();
  $('#labTabsWrap').hidden=true;$('#labSubnav').hidden=true;
  $('#labSub').textContent=rec.session+'회차 · 1회차 실습 후 열립니다';
  $('#labView').innerHTML='<section class="panel lock-panel"><p class="eyebrow">'+rec.session+'회차 실습실</p><h2>1회차 실습을 마치면 열립니다</h2>'+
    '<div class="stamps">'+ids.map(id=>'<span class="stamp'+(rec.done[id]?' is-on':'')+'"><i aria-hidden="true">'+(rec.done[id]?'완료':course.missions[id].no)+'</i><b>'+esc(course.missions[id].title.replace('개인 실습 ',''))+'</b></span>').join('')+'</div>'+
    '<p class="meta">'+rec.session+'회차 수업에서는 강사 화면의 QR로 들어오면 바로 열립니다.</p>'+
    '<div class="btn-row"><button type="button" class="btn btn-primary" data-goto-session="1">1회차 실습실로</button></div></section>';
  sessionOptions();fillRoles();renderSummary();
  $('#topSub').textContent=rec.session+'회차 · 잠김';
  const prev=$('#dockPrev'),next=$('#dockNext'),act=$('#dockAction');
  prev.hidden=true;next.hidden=true;act.disabled=false;act.textContent='1회차로';act.dataset.mode='goto1';
  $('#dockLabel').innerHTML='<b>'+rec.session+'회차 잠김</b><span>1회차 실습 완료 후 열림</span>';
  spy?.disconnect();tick();relayout();
}
function sessionOptions(){
  $('#labSession').innerHTML=course.sessions.map(x=>'<option value="'+x.no+'">'+x.no+'회차'+(sessionLocked(x.no)?' (1회차 후)':'')+'</option>').join('');
  $('#labSession').value=String(rec.session);
}
function fillRoles(){
  const roles=trackById(course,rec.track).roles||[];
  if(rec.role&&!roles.some(r=>r.id===rec.role))rec.role='';
  $('#labRole').innerHTML='<option value="">전체</option>'+roles.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.label)+'</option>').join('');
  $('#labRole').value=rec.role;
}
function renderSummary(){
  const role=roleById(course,rec.track,rec.role);
  $('#setSummary').textContent=session().no+'회차 · '+trackById(course,rec.track).label+(role?' · '+role.label:'')+' · '+levelById(course,rec.level).label;
}
// Sticky sub-navigation under the menu: the detailed order of the current menu. Scrolling selects the
// section in view; tapping a title scrolls to it.
function subnavItems(){
  const id=activeMission();
  if(id)return rec.trackChosen?STEP_LABELS.map((l,i)=>({sec:'sec-step-'+i,label:(i+1)+' '+l,done:i<stepOf(id)||rec.done[id]})):[];
  if(rec.tab==='activity')return Array.from(document.querySelectorAll('#labView [data-sec]')).map(el=>({sec:el.id,label:el.querySelector('h3')?.textContent.replace('AI 오류 찾기 · ','오류 찾기 ')||''}));
  if(rec.tab==='record')return [];
  return [{sec:'sec-intro',label:'시작'}].concat(session().modules.map(m=>({sec:'sec-mod-'+m.id,label:m.start+'′ '+(m.kind==='practice'?course.missions[m.missionId].title.replace('개인 실습 ',''):(m.learner?.headline||m.title)),done:m.kind==='practice'&&rec.done[m.missionId]})));
}
function renderSubnav(){
  const items=subnavItems(),nav=$('#labSubnav');
  nav.hidden=!items.length;
  const id=activeMission();
  const current=id?'sec-step-'+stepOf(id):(items[0]?.sec||'');
  nav.innerHTML=items.map(it=>'<button type="button" class="sub'+(it.done?' is-done':'')+'" data-sec-go="'+esc(it.sec)+'" aria-current="'+(it.sec===current)+'">'+esc(it.label)+'</button>').join('');
}
function markSub(secId){
  const nav=$('#labSubnav');let on=null;
  nav.querySelectorAll('[data-sec-go]').forEach(b=>{const hit=b.dataset.secGo===secId;b.setAttribute('aria-current',String(hit));if(hit)on=b;});
  if(on){const r=on.getBoundingClientRect(),n=nav.getBoundingClientRect();if(r.left<n.left||r.right>n.right)nav.scrollTo({left:on.offsetLeft-16,behavior:'smooth'});}
}
function onSection(secId){
  markSub(secId);
  const id=activeMission(),m=/^sec-step-(\d)$/.exec(secId);
  if(id&&m&&stepOf(id)!==Number(m[1])){rec.step[id]=Number(m[1]);save();renderDock();}
}
function setupSpy(){
  spy?.disconnect();
  const secs=Array.from(document.querySelectorAll('#labView [data-sec]'));
  if(!secs.length||!('IntersectionObserver' in window))return;
  const visible=new Map();
  spy=new IntersectionObserver(entries=>{
    for(const e of entries){if(e.isIntersecting)visible.set(e.target.id,e.target);else visible.delete(e.target.id);}
    if(Date.now()<spyLock)return;
    const first=secs.find(el=>visible.has(el.id));
    if(first)onSection(first.id);
  },{rootMargin:'-'+(sectionOffset()+4)+'px 0px -55% 0px'});
  secs.forEach(el=>spy.observe(el));
}
function sectionOffset(){return ($('#labTop')?.getBoundingClientRect().height||60)+($('#labTabsWrap')?.getBoundingClientRect().height||48);}
function measureTabs(){document.documentElement.style.setProperty('--lv-tabs-h',Math.round($('#labTabsWrap')?.getBoundingClientRect().height||48)+'px');}
function goSec(secId,{smooth=true}={}){
  const el=document.getElementById(secId);if(!el)return;
  spyLock=Date.now()+900;
  el.scrollIntoView({block:'start',behavior:smooth?'smooth':'auto'});
  onSection(secId);
}
function applyTextSize(){document.documentElement.classList.toggle('lv-big-text',!!rec.bigText);const b=$('#textSize');if(b){b.setAttribute('aria-pressed',String(!!rec.bigText));b.textContent=rec.bigText?'가 −':'가 +';}}
function setStep(id,s){if(!id)return;rec.step[id]=Math.max(0,Math.min(STEP_LABELS.length-1,s));save();renderDock();goSec('sec-step-'+rec.step[id]);}
// Learner timer: planned minutes are adjustable before starting (−1/+1분); while running the same buttons
// move the end time. The instructor's QR end time (e=) still seeds it.
const plannedMin=id=>Math.max(1,Math.min(180,Number(rec.timerMin[id])||course.missions[id].minutes));
function timerTarget(){return activeMission()||sessionMissions().find(m=>rec.timers[m]>Date.now())||'';}
function adjustTimer(ms){
  const id=timerTarget();if(!id)return;
  const end=Number(rec.timers[id])||0;
  if(end)rec.timers[id]=Math.max(Date.now()+1000,end+ms);
  else rec.timerMin[id]=Math.max(1,Math.min(180,plannedMin(id)+Math.round(ms/60000)));
  save();tick();
}
function tick(){
  const id=timerTarget();
  const end=id?Number(rec.timers[id])||0:0;
  const left=end?end-Date.now():0;
  const el=$('#labTimer'),pill=$('#topTimer');
  document.querySelectorAll('[data-timer-add]').forEach(b=>{b.disabled=!id;});
  if(!id||!end){
    el.textContent=id?formatClock(plannedMin(id)*60000):'--:--';el.className='lab-timer';
    $('#labTimerLabel').textContent=id?course.missions[id].title.replace('개인 실습 ','')+' · 대기':'실습 타이머';
    $('#labTimerBtn').textContent='시작';$('#labTimerBtn').disabled=!id;pill.hidden=true;lastPhase='';return;
  }
  const phase=left<=0?'done':left<=60000?'final':left<=300000?'warn':'';
  el.textContent=formatClock(Math.max(0,left));el.className='lab-timer '+phase;
  pill.hidden=false;pill.textContent='⏱ '+formatClock(Math.max(0,left));pill.className='timer-pill '+phase;pill.setAttribute('aria-label','남은 실습 시간 '+formatClock(Math.max(0,left)));
  $('#labTimerLabel').textContent=course.missions[id].title.replace('개인 실습 ','')+(phase==='done'?' · 종료':' · 남은 시간');
  $('#labTimerBtn').textContent='초기화';$('#labTimerBtn').disabled=false;
  if(phase!==lastPhase){if(phase==='warn')toast('종료 5분 전 — 결과를 점검하고 저장하세요.');if(phase==='done')toast('실습 시간이 끝났습니다.');lastPhase=phase;}
}
// Mobile: copy then open FactChat in the same tap. The copy runs synchronously (execCommand) so it
// survives the tab switch; the async Clipboard API is tried as well.
function copyNow(text){
  let ok=false;
  try{const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.top='-1000px';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,text.length);ok=document.execCommand('copy');ta.remove();}catch{ok=false;}
  try{navigator.clipboard?.writeText(text).catch(()=>{});}catch{}
  return ok||!!navigator.clipboard;
}
function copyAndOpen(text){
  const ok=copyNow(text);
  window.open(FACTCHAT_TOOL.entryUrl,'_blank','noopener,noreferrer');
  toast(ok?'복사했습니다. FactChat에 로그인한 뒤 입력창을 길게 눌러 붙여넣기 하세요.':'복사가 막혔습니다. 원문을 길게 눌러 직접 복사하세요.');
  const id=activeMission();if(id&&stepOf(id)<2)setStep(id,2);
}
function openSheet(file){
  sheetText=file.text;sheetName=file.name;
  $('#matTitle').textContent=file.label;$('#matText').textContent=file.text;
  const sh=$('#matSheet');sh.hidden=false;document.documentElement.classList.add('sheet-open');$('#matText').focus({preventScroll:true});
}
function closeSheet(){$('#matSheet').hidden=true;document.documentElement.classList.remove('sheet-open');}
function openFactchat(split){
  if(split&&canSplit()){
    const sw=window.screen.availWidth,sh=window.screen.availHeight,half=Math.floor(sw/2);
    const left=(window.screen.availLeft||0)+half,top=window.screen.availTop||0;
    const w=window.open(FACTCHAT_TOOL.entryUrl,'ekodi-factchat','popup=yes,width='+half+',height='+sh+',left='+left+',top='+top+',noopener,noreferrer');
    void w;
    toast('FactChat을 화면 오른쪽에 열었습니다. 이 창은 왼쪽 절반으로 옮기세요.');
  }else window.open(FACTCHAT_TOOL.entryUrl,'_blank','noopener,noreferrer');
  const id=activeMission();if(id&&stepOf(id)===1)setStep(id,2);
}
function runCheck(id){
  const area=document.querySelector('[data-result="'+id+'"]');
  const out=clean(area?.value,MAX_RESULT);rec.results[id]=out;
  const source=sourceFor(id);
  const result=source?checkOutput(source,out):{findings:[{level:'info',type:'no-source',title:'대조할 원문이 없습니다',detail:'위 「내 원문」에 AI에게 준 원문을 붙여 넣으면 숫자·날짜·연락처를 대조합니다.'}],summary:{risk:0,warn:0,info:1}};
  result.privacy=detectContentWarnings(out);
  rec.checks[id]={summary:result.summary,findings:result.findings,privacy:result.privacy,at:Date.now()};
  save();
  const box=$('#verifyOut');if(box)box.innerHTML=findingsHtml(rec.checks[id]);
  toast(result.summary.risk?'확인이 필요한 항목 '+result.summary.risk+'건을 찾았습니다.':'점검을 마쳤습니다.');
  box?.scrollIntoView({block:'nearest',behavior:'smooth'});
}
async function dockAction(){
  const act=$('#dockAction');
  if(act.dataset.mode==='goto1'){rec.session=1;rec.tab='agenda';save();render();window.scrollTo({top:0});return;}
  if(act.dataset.mode==='open'){if(act.dataset.target){rec.tab='m:'+act.dataset.target;save();render();window.scrollTo({top:0});}else{rec.tab='agenda';save();render();}return;}
  const id=activeMission();const s=stepOf(id);
  if(s===0)return setStep(id,1);
  if(s===1)return openFactchat(canSplit());
  if((s===2||s===3)&&!canSplit()){copyAndOpen(document.getElementById('step-prompt-'+s)?.textContent||'');return;}
  if(s===2||s===3){const el=document.getElementById('step-prompt-'+s);const r=await copyText(window,el?.textContent||'',el);toast(r==='copied'?'프롬프트를 복사했습니다. FactChat에 붙여 넣으세요.':r==='selected'?'텍스트를 선택했습니다. 길게 눌러 복사하세요.':'복사하지 못했습니다.');if(r==='copied')setTimeout(()=>setStep(id,s+1),700);return;}
  if(s===4)return runCheck(id);
  finish(id);
}
function finish(id){
  const already=rec.done[id];
  rec.done[id]=true;save();
  const list=sessionMissions(),next=list[list.indexOf(id)+1];
  if(already||!next){if(next){rec.tab='m:'+next;}else rec.tab='activity';save();render();window.scrollTo({top:0});return;}
  toast('실습 완료! 다음 실습: '+course.missions[next].title.replace('개인 실습 ',''));render();
}
function exportMarkdown(){
  const lines=['# 내 실습 기록 — '+course.subtitle,'','- 과정: '+course.title,'- 직무 사례: '+trackById(course,rec.track).label+(roleById(course,rec.track,rec.role)?' · '+roleById(course,rec.track,rec.role).label:''),'- 난이도: '+levelById(course,rec.level).label,'- 내려받은 시각: '+new Date().toLocaleString('ko-KR'),'- 이 파일은 개인 기기에서 만들어졌으며 서버에 저장되지 않았습니다.',''];
  for(const m of Object.values(course.missions).sort((a,b)=>a.no-b.no)){
    lines.push('## '+m.title+(rec.done[m.id]?' ✓ 완료':''),'');
    const level=levelById(course,rec.level);
    criteriaFor(m,level).forEach((c,i)=>lines.push('- ['+(rec.checked[m.id+':'+level.id+':'+i]?'x':' ')+'] '+c));
    m.errors.forEach((c,i)=>lines.push('- ['+(rec.checked[m.id+':err:'+i]?'x':' ')+'] 검증: '+c));
    lines.push('','사용한 프롬프트:','');
    buildPrompts(course,m.id,rec.track,rec.level,rec.role).forEach(p=>lines.push('```','# '+p.label,p.text,'```',''));
    const chk=rec.checks[m.id];
    if(chk)lines.push('자동 점검(규칙 기반): 확인 필요 '+chk.summary.risk+' · 주의 '+chk.summary.warn+' · 참고 '+chk.summary.info,...chk.findings.map(f=>'  - '+f.title+': '+f.detail),'');
    if(rec.memo[m.id])lines.push('메모:','',rec.memo[m.id],'');
    const self=rec.self[m.id];if(self?.score||self?.hard)lines.push('자기평가: '+(self.score||'-')+'점'+(self.hard?' · 어려웠던 부분: '+self.hard:''),'');
  }
  if(Object.keys(rec.hunts).length){lines.push('## AI 오류 찾기','');for(const [id,t] of Object.entries(rec.hunts))if(t)lines.push('- '+id+': '+t);lines.push('');}
  lines.push('## 30일 업무 적용 계획','',rec.plan||'(미작성)','','## 교육 후 적용 결과','',rec.applied||'(미작성)','');
  downloadText(document,course.id+'_my-practice-record.md',lines.join('\n'),'text/markdown;charset=utf-8');
}
function bind(){
  // Another window of this lab (e.g. the presenter's demo and the projector) changed the record: follow it.
  window.addEventListener('storage',e=>{if(e.key===key&&e.newValue){rec=load();applyTextSize();render();}});
  document.addEventListener('click',async e=>{
    const t=e.target.closest('button,a');if(!t)return;const d=t.dataset;
    if(d.pickTrack){rec.track=d.pickTrack;rec.role='';rec.trackChosen=true;save();render();toast(trackById(course,rec.track).label+(activeMission()?' 원문으로 실습을 시작합니다.':' 사례로 준비했습니다. 실습 시간에 바로 시작하세요.'));return;}
    if(t.id==='textSize'){rec.bigText=!rec.bigText;applyTextSize();save();relayout();return;}
    if(d.tab){rec.tab=d.tab;save();render();$('#labMain').focus({preventScroll:true});window.scrollTo({top:0});return;}
    if(d.secGo){goSec(d.secGo);return;}
    if(d.gotoSession){rec.session=Number(d.gotoSession);rec.tab='agenda';save();render();window.scrollTo({top:0});return;}
    if(d.viewMaterial!==undefined){const f=missionMaterials(course,activeMission(),rec.track)[Number(d.viewMaterial)];if(f)openSheet(f);return;}
    if(d.copyMaterial!==undefined){const f=missionMaterials(course,activeMission(),rec.track)[Number(d.copyMaterial)];if(f)toast(copyNow(f.text)?f.label+' 복사 완료 · FactChat에 붙여 넣으세요.':'「원문 보기·복사」에서 길게 눌러 복사하세요.');return;}
    if(d.copyOpen){copyAndOpen(document.getElementById(d.copyOpen)?.textContent||'');return;}
    if(d.sheetClose){closeSheet();return;}
    if(d.sheetCopyOpen){copyAndOpen(sheetText);closeSheet();return;}
    if(d.sheetCopy){const r=await copyText(window,sheetText,$('#matText'));toast(r==='copied'?'복사했습니다. FactChat 입력창에 붙여 넣으세요.':'원문을 선택했습니다. 길게 눌러 복사하세요.');return;}
    if(d.sheetSave){downloadText(document,sheetName,sheetText);return;}
    if(d.timerAdd){adjustTimer(Number(d.timerAdd));return;}
    if(d.split){openFactchat(true);return;}
    if(d.openTool==='factchat'){const id=activeMission();if(id&&stepOf(id)===1)setTimeout(()=>setStep(id,2),300);return;}
    if(d.copy){const el=document.getElementById(d.copy);const r=await copyText(window,el?.textContent||'',el);toast(r==='copied'?'프롬프트를 복사했습니다. FactChat에 붙여 넣으세요.':r==='selected'?'텍스트를 선택했습니다. 길게 눌러 복사하세요.':'복사하지 못했습니다.');return;}
    if(d.runCheck){runCheck(d.runCheck);return;}
    if(d.sample){const m=course.missions[d.sample];const area=document.querySelector('[data-result="'+d.sample+'"]');if(area){area.value=m.fallback.sampleOutput;}rec.results[d.sample]=m.fallback.sampleOutput;save();runCheck(d.sample);return;}
    if(d.finish){finish(d.finish);return;}
    if(d.quiz!==undefined){rec.quiz[Number(d.quiz)]=d.ans==='1';save();render();return;}
    if(t.id==='exportRec'){exportMarkdown();return;}
  });
  document.addEventListener('change',e=>{
    const t=e.target;
    if(t.matches('[data-crit]')){rec.checked[t.dataset.crit]=t.checked;document.querySelectorAll('[data-crit="'+CSS.escape(t.dataset.crit)+'"]').forEach(x=>{x.checked=t.checked;});save();return;}
    if(t.matches('[data-self]')){const id=t.dataset.self;rec.self[id]={...(rec.self[id]||{}),score:Number(t.value)};save();return;}
  });
  document.addEventListener('input',e=>{
    const t=e.target;
    if(t.matches('[data-memo]')){rec.memo[t.dataset.memo]=clean(t.value);save();}
    else if(t.matches('[data-hard]')){const id=t.dataset.hard;rec.self[id]={...(rec.self[id]||{}),hard:clean(t.value)};save();}
    else if(t.matches('[data-result]')){rec.results[t.dataset.result]=clean(t.value,MAX_RESULT);save();}
    else if(t.matches('[data-own-source]')){rec.ownSource.free=clean(t.value,MAX_RESULT);save();}
    else if(t.matches('[data-hunt]')){rec.hunts[t.dataset.hunt]=clean(t.value);save();}
    else if(t.matches('[data-plan]')){rec.plan=clean(t.value);save();}
    else if(t.matches('[data-applied]')){rec.applied=clean(t.value);save();}
  });
  $('#labSession').addEventListener('change',e=>{rec.session=Number(e.target.value);rec.tab='agenda';save();render();if(sessionLocked(rec.session))toast('1회차 실습을 마치면 '+rec.session+'회차가 열립니다.');});
  $('#labTrack').addEventListener('change',e=>{rec.track=e.target.value;rec.role='';rec.trackChosen=true;save();render();toast(trackById(course,rec.track).label+' 사례로 바꿨습니다.');});
  $('#labRole').addEventListener('change',e=>{rec.role=e.target.value;save();render();});
  $('#labLevel').addEventListener('change',e=>{rec.level=e.target.value;save();render();});
  $('#labTimerBtn').addEventListener('click',()=>{
    const id=timerTarget();if(!id)return;
    if(rec.timers[id]){delete rec.timers[id];lastPhase='';}else rec.timers[id]=Date.now()+plannedMin(id)*60000;
    save();tick();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#matSheet').hidden)closeSheet();});
  $('#matSheet').addEventListener('click',e=>{if(e.target.id==='matSheet')closeSheet();});
  window.addEventListener('resize',()=>{measureTabs();setupSpy();});
  $('#dockAction').addEventListener('click',dockAction);
  $('#dockPrev').addEventListener('click',()=>{const id=activeMission();if(id)setStep(id,stepOf(id)-1);});
  $('#dockNext').addEventListener('click',()=>{const id=activeMission();if(id)setStep(id,stepOf(id)+1);});
  $('#labClear').addEventListener('click',()=>{
    if(!confirm('이 기기에 저장된 실습 체크·메모·결과·계획을 모두 삭제할까요? 되돌릴 수 없습니다.'))return;
    try{storage?.removeItem(key);}catch{}
    rec=blank();rec.track=course.tracks[0].id;render();toast('내 기록을 삭제했습니다.');
  });
  window.addEventListener('storage',e=>{if(e.key===key){rec=load();render();}});
}
async function init(){
  // Shown inside the presenter stage for a live demo: no shared EKODI header over the embedded lab.
  if(new URLSearchParams(location.search).get('embed')==='1'){document.body.dataset.ekodiUserHeader='immersive';document.documentElement.classList.add('lab-embed');}
  const data=await entry.load();
  course=data.COURSE;validateCourse(course);
  key='ekodi_edu_lab_v1:'+course.id;
  rec=load();
  if(!course.tracks.some(t=>t.id===rec.track))rec.track='';
  const p=parseLearnerParams(location.search,course);
  if(p.open){rec.unlocked=true;}
  if(new URLSearchParams(location.search).has('s'))rec.session=p.s;
  if(!sessionByNo(course,rec.session))rec.session=1;
  // A practice tab from another session must not survive a session change (e.g. ?s=2 after a 1회차 mission).
  if(rec.tab.startsWith('m:')&&!sessionMissions().includes(rec.tab.slice(2)))rec.tab='agenda';
  if(p.lv)rec.level=p.lv;
  if(p.m){
    const where=course.sessions.find(s=>s.modules.some(m=>m.missionId===p.m));
    if(where)rec.session=where.no;
    rec.tab='m:'+p.m;
    const now=Date.now();
    if(p.e&&p.e>now&&p.e-now<=4*3600*1000)rec.timers[p.m]=p.e;
  }
  $('#labOrg').textContent=course.org.name+' · LEARNER LAB';
  $('#labTitle').textContent=course.subtitle;
  $('#labSafety').textContent=course.safety;
  $('#topFactchat').href=FACTCHAT_TOOL.entryUrl;
  sessionOptions();
  $('#labTrack').innerHTML='<option value="" disabled>분야 선택</option>'+course.tracks.map(t=>'<option value="'+t.id+'">'+esc(t.label)+'</option>').join('');
  $('#labLevel').innerHTML=course.levels.map(l=>'<option value="'+l.id+'">'+esc(l.label)+'</option>').join('');
  const needTrack=!rec.track;
  if(needTrack)rec.track=course.tracks[0].id;
  applyTextSize();
  relayout=bindChrome(document,{top:$('#labTop'),dock:$('#labDock')});
  if(!rec.timerMin||typeof rec.timerMin!=='object')rec.timerMin={};
  save();bind();render();
  // Resume where the learner was: the saved step of an open practice.
  const open=activeMission();if(open&&rec.trackChosen&&stepOf(open)>0)requestAnimationFrame(()=>goSec('sec-step-'+stepOf(open),{smooth:false}));
  setInterval(tick,1000);
  document.body.dataset.ready='true';
}
init().catch(error=>{console.error('lab init',error);$('#labView').innerHTML='<div class="panel"><h2>실습실을 불러오지 못했습니다</h2><p class="meta">'+multiline(error?.message||error)+'</p></div>';});
