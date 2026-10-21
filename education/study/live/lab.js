// EKODI Education Premium Studio — Learner Lab v2 (수강생 개인 실습실).
// Public, anonymous, local-only. Never loads instructor notes, never posts data, never stores personal identifiers.
// Guided practice: 준비 → FactChat 열기 → 프롬프트 ① → 프롬프트 ② → 결과 점검(규칙 기반, AI 아님) → 완료·적용.
import {courseEntry} from './courses/registry.js';
import {validateCourse,sessionByNo,parseLearnerParams,formatClock,missionMaterials,missionContext,KIND_LABELS,buildPrompts,trackById,levelById} from './engine/model.js';
import {esc,list,missionSections,readFeatureChecks,featureBadge,promptBlock,downloadText,copyText,safeStorage,multiline,bindChrome} from './engine/render.js';
import {checkOutput} from './engine/checker.js';
import {detectContentWarnings} from '../ai-bootcamp/material-source.js';
import {FACTCHAT_TOOL,featureById} from './tools/factchat.js';

const $=s=>document.querySelector(s);
const entry=courseEntry(new URLSearchParams(location.search).get('c'));
const storage=safeStorage(window);
const MAX_TEXT=4000,MAX_RESULT=12000;
const STEP_LABELS=['준비','FactChat 열기','프롬프트 ①','프롬프트 ②','결과 점검','완료·적용'];
const STEP_ACTIONS=['자료 확인 완료','FactChat 열기','프롬프트 ① 복사','프롬프트 ② 복사','결과 자동 점검','실습 완료'];
let course,rec,key,toastTimer=0,lastPhase='',relayout=()=>{};

const blank=()=>({v:1,session:1,track:'',level:'basic',tab:'agenda',checked:{},memo:{},self:{},quiz:{},hunts:{},plan:'',applied:'',timers:{},
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
    return '<article class="panel"><p class="eyebrow">'+m.start+'–'+m.end+'분 · '+esc(KIND_LABELS[m.kind])+(m.kind==='practice'&&rec.done[m.missionId]?' · 완료':'')+'</p><h3>'+esc(m.learner?.headline||title)+'</h3>'+(m.learner?'<p class="meta">'+esc(title)+'</p>':'')+tasks+'</article>';
  }).join('');
  return '<div class="panel"><p class="eyebrow">'+esc(course.subtitle)+' · '+session().no+'회차</p><h2>'+esc(session().title)+'</h2><p class="meta">'+esc(course.format)+'</p>'+
    '<div class="btn-row">'+factchatButtons()+'</div><p class="meta">공식 FactChat 사이트에서 본인 기관 계정으로 직접 로그인합니다. EKODI는 계정·비밀번호를 받지 않습니다.</p></div>'+rows;
}
function factchatButtons(){
  return (canSplit()?'<button type="button" class="btn btn-primary" data-split="1">FactChat 나란히 열기 ↗</button>':'')+
    '<a class="btn'+(canSplit()?'':' btn-primary')+'" href="'+esc(FACTCHAT_TOOL.entryUrl)+'" target="_blank" rel="noopener noreferrer" data-open-tool="factchat">FactChat '+(canSplit()?'새 탭':'열기')+' ↗</a>';
}

function stepper(id){
  const cur=stepOf(id);
  return '<ol class="stepper" aria-label="실습 단계">'+STEP_LABELS.map((l,i)=>'<li class="'+(i<cur||rec.done[id]?'is-done':'')+(i===cur?' is-now':'')+'"><button type="button" data-step="'+i+'" aria-current="'+(i===cur?'step':'false')+'"><span class="bar"></span><span class="lbl">'+(i+1)+'. '+esc(l)+'</span></button></li>').join('')+'</ol>';
}
function stepCard(id){
  const m=course.missions[id],ctx=missionContext(course,id,rec.track),level=levelById(course,rec.level),s=stepOf(id);
  const prompts=buildPrompts(course,id,rec.track,rec.level);
  const head=(t,lead)=>'<p class="step-no">STEP '+(s+1)+' / '+STEP_LABELS.length+'</p><h2>'+esc(t)+'</h2>'+(lead?'<p class="lead">'+esc(lead)+'</p>':'');
  const narrow=isNarrow();
  if(s===0){
    const source=ctx.source||ctx.script||ctx.facts||'';
    const files=missionMaterials(course,id,rec.track);
    const pc=m.pcOnly?'<p class="notice'+(narrow?' pc-only':'')+'">'+(narrow?'<b>PC 전용 실습입니다.</b> 이 기기에서는 HWP 편집을 할 수 없습니다(FactChat 공식 안내). 아래 「결과 점검」 단계의 예시 결과로 연습하거나 PC에서 이 화면을 여세요.':'이 실습은 PC 전용입니다(FactChat 공식 안내).')+'</p>':'';
    const ideas=id==='free'&&ctx.ideas.length?'<h3>'+esc(ctx.label)+' 추천 과제</h3>'+list(ctx.ideas):'';
    return head('무엇을 만드나요?',m.problem)+pc+'<p class="meta"><b>결과물</b> '+esc(m.deliverable)+' · <b>이유</b> '+esc(m.why)+'</p>'+
      (source?'<div class="source"><p class="source-label">'+esc(ctx.label)+' · '+esc(ctx.doc||ctx.meeting||ctx.topic||'')+'</p><pre class="source-text">'+esc(source)+'</pre></div>':'')+ideas+
      (files.length?'<div class="downloads">'+files.map((f,i)=>'<button type="button" class="btn btn-small" data-download="'+i+'">⬇ '+esc(f.label)+'</button>').join('')+'</div>':'')+
      '<h3>준비물</h3>'+list(m.prepare);
  }
  if(s===1){
    const feats=m.features.map(fid=>{const f=featureById(fid);return f?'<li><b>'+esc(f.label)+'</b> — '+esc(f.where)+' '+featureBadge(readFeatureChecks(storage),fid)+'</li>':'';}).join('');
    return head('FactChat을 여세요','공식 사이트에서 본인 계정으로 로그인한 뒤, 이 화면과 FactChat을 오가며 진행합니다.')+
      '<ul class="feature-list">'+feats+'</ul><div class="big-action">'+factchatButtons()+'</div>'+
      (canSplit()?'<p class="split-hint">「나란히 열기」는 FactChat을 화면 오른쪽 절반에 띄웁니다. 이 실습실 창은 왼쪽 절반으로 옮기세요 (Windows: ⊞ + ←, Mac: 녹색 버튼 길게 누르기 → 화면 왼쪽에 배치).</p>':'<p class="split-hint">휴대폰에서는 FactChat 탭과 이 실습실 탭을 오가며 진행합니다. 체크·메모는 자동 저장됩니다.</p>')+
      '<h3>FactChat에서 할 일</h3>'+list(m.steps.slice(0,2),true);
  }
  if(s===2||s===3){
    const i=s-2,p=prompts[i];
    const todo=s===2?m.steps.slice(1,3):m.steps.slice(3);
    return head(p?p.label+' 실행':'프롬프트',s===2?'아래 프롬프트를 복사해 FactChat에 붙여 넣고 실행하세요.':'결과를 다듬는 두 번째 지시입니다. 같은 대화에서 이어서 실행하세요.')+
      '<p class="meta">'+esc(level.label)+' · '+esc(level.hint)+'</p>'+(p?promptBlock(p,'step-prompt'):'')+
      '<div class="big-action"><button type="button" class="btn btn-primary" data-copy="step-prompt">프롬프트 복사</button>'+(canSplit()?'<button type="button" class="btn" data-split="1">FactChat 창 보기 ↗</button>':'<a class="btn" href="'+esc(FACTCHAT_TOOL.entryUrl)+'" target="_blank" rel="noopener noreferrer" data-open-tool="factchat">FactChat으로 이동 ↗</a>')+'</div>'+
      '<h3>FactChat에서 할 일</h3>'+list(todo,true);
  }
  if(s===4){
    const res=rec.results[id]||'';
    const own=id==='free'?'<label class="field">내 원문 (선택 · 개인정보 제외)<textarea data-own-source="1" maxlength="'+MAX_RESULT+'" placeholder="AI에게 준 원문을 붙여 넣으면 그 원문과 대조합니다.">'+esc(rec.ownSource.free||'')+'</textarea></label>':'';
    const errs=m.errors.map((c,i)=>{const k=id+':err:'+i;return '<label class="check"><input type="checkbox" data-crit="'+esc(k)+'"'+(rec.checked[k]?' checked':'')+'> <span>'+esc(c)+'</span></label>';}).join('');
    return head('AI 결과를 원문과 점검하세요','FactChat 결과를 복사해 붙여 넣고 「결과 자동 점검」을 누르세요. 숫자·날짜·연락처·확정 표현을 원문과 대조합니다.')+own+
      '<label class="field">FactChat 결과 붙여넣기<textarea data-result="'+esc(id)+'" maxlength="'+MAX_RESULT+'" placeholder="여기에 AI 결과를 붙여 넣으세요. (이 기기에만 저장)">'+esc(res)+'</textarea></label>'+
      '<div class="big-action"><button type="button" class="btn btn-primary" data-run-check="'+esc(id)+'">결과 자동 점검</button>'+(m.fallback.sampleOutput?'<button type="button" class="btn" data-sample="'+esc(id)+'">예시 결과로 연습</button>':'')+'</div>'+
      '<p class="split-hint">규칙 기반 점검입니다(AI 아님). 사람·담당·결정 내용은 직접 원문과 대조하세요. 「예시 결과로 연습」은 FactChat을 쓸 수 없을 때의 대체 실습입니다.</p>'+
      '<div class="verify-out" id="verifyOut" aria-live="polite">'+findingsHtml(rec.checks[id])+'</div>'+
      '<h3>사람이 직접 확인할 항목</h3><div class="checks">'+errs+'</div>';
  }
  const crit=m.criteria[level.id].map((c,i)=>{const k=id+':'+level.id+':'+i;return '<label class="check"><input type="checkbox" data-crit="'+esc(k)+'"'+(rec.checked[k]?' checked':'')+'> <span>'+esc(c)+'</span></label>';}).join('');
  const self=rec.self[id]||{};
  const score=[1,2,3,4,5].map(n=>'<label class="check"><input type="radio" name="score-'+esc(id)+'" value="'+n+'" data-self="'+esc(id)+'"'+(Number(self.score)===n?' checked':'')+'> <span>'+n+'</span></label>').join('');
  return head('완료하고 내 업무에 적용하기',m.apply)+'<h3>달성 조건 · '+esc(level.label)+'</h3><div class="checks">'+crit+'</div>'+
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
  const m=course.missions[id];
  return '<div class="panel"><p class="eyebrow">'+m.minutes+'분 실습 · '+esc(trackById(course,rec.track).label)+' · '+esc(levelById(course,rec.level).label)+(rec.done[id]?' · 완료':'')+'</p><h2>'+esc(m.title)+'</h2>'+stepper(id)+'</div>'+
    '<section class="step-card" id="stepCard" tabindex="-1">'+stepCard(id)+'</section>'+
    '<details class="ref"><summary>전체 안내 보기 (10단계 구조 · 대체 실습 포함)</summary><div class="ref-body">'+
      missionSections(course,id,{trackId:rec.track,levelId:rec.level,checks:readFeatureChecks(storage),tool:FACTCHAT_TOOL,showFallback:m.pcOnly&&isNarrow(),checked:rec.checked,idPrefix:'ref-'})+
      '<div class="btn-row"><button type="button" class="btn btn-small" data-toggle-fallback="'+esc(id)+'">대체 실습 보기/숨기기</button></div></div></details>';
}
function viewActivity(){
  const s=session();
  const quizMod=s.modules.find(m=>m.learner?.quiz);
  const quiz=quizMod?'<div class="panel"><h3>OX 퀴즈</h3><div class="quiz">'+course.quiz.map((q,i)=>{
      const ans=rec.quiz[i];const answered=ans===true||ans===false;const ok=answered&&ans===q.a;
      return '<div class="quiz-q"><p>'+(i+1)+'. '+esc(q.q)+'</p><div class="btn-row"><button type="button" class="btn btn-small" data-quiz="'+i+'" data-ans="1" aria-pressed="'+(ans===true)+'">O</button><button type="button" class="btn btn-small" data-quiz="'+i+'" data-ans="0" aria-pressed="'+(ans===false)+'">X</button></div>'+
        (answered?'<p class="result '+(ok?'ok':'no')+'">'+(ok?'정답':'다시 생각해 보세요')+' — '+esc(q.why)+'</p>':'')+'</div>';}).join('')+'</div></div>':'';
  const hunts=s.modules.filter(m=>m.errorHunt).map(m=>course.errorHunts.find(h=>h.id===m.errorHunt)).filter(Boolean).map(h=>
    '<div class="panel"><h3>AI 오류 찾기 · '+esc(h.title)+'</h3><pre class="source-text">'+esc(h.text)+'</pre><p class="meta">힌트: '+esc(h.hint)+'</p><label class="field">찾은 오류와 바른 내용<textarea data-hunt="'+esc(h.id)+'" maxlength="'+MAX_TEXT+'">'+esc(rec.hunts[h.id]||'')+'</textarea></label><p class="meta">정답은 강사가 함께 확인합니다.</p></div>').join('');
  const plan=s.modules.some(m=>m.kind==='share')?planPanel():'';
  return (quiz+hunts+plan)||'<div class="panel"><p>이 회차에는 별도 활동이 없습니다.</p></div>';
}
function planPanel(){
  return '<div class="panel"><h3>30일 업무 적용 계획</h3><p class="meta">적용할 업무 · 사용할 기능 · 주기 · 측정 지표(소요 시간, 수정 횟수)를 적습니다.</p><textarea data-plan="1" maxlength="'+MAX_TEXT+'">'+esc(rec.plan||'')+'</textarea>'+
    '<label class="field">교육 후 적용 결과 (선택 · 나중에 기록)<textarea data-applied="1" maxlength="'+MAX_TEXT+'">'+esc(rec.applied||'')+'</textarea></label></div>';
}
function viewRecord(){
  const rows=Object.values(course.missions).sort((a,b)=>a.no-b.no).map(m=>{
    const level=levelById(course,rec.level);
    const crit=m.criteria[level.id];const done=crit.filter((_,i)=>rec.checked[m.id+':'+level.id+':'+i]).length;
    const errs=m.errors.filter((_,i)=>rec.checked[m.id+':err:'+i]).length;
    const chk=rec.checks[m.id]?.summary;
    return '<tr><td>'+esc(m.title)+(rec.done[m.id]?' · 완료':'')+'</td><td class="num">'+done+' / '+crit.length+'</td><td class="num">'+errs+' / '+m.errors.length+'</td><td class="num">'+(chk?'확인 '+chk.risk+' · 주의 '+chk.warn:'-')+'</td><td class="num">'+(rec.self[m.id]?.score?esc(rec.self[m.id].score)+'점':'-')+'</td></tr>';}).join('');
  return '<div class="panel"><h2>내 기록</h2><p class="meta">익명·로컬 모드입니다. 출결·공식 평가·수료와 연결되지 않습니다.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>실습</th><th>달성 조건</th><th>오류 검증</th><th>자동 점검</th><th>자기평가</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="btn-row"><button type="button" class="btn btn-primary" id="exportRec">내 기록 내려받기 (Markdown)</button></div><p class="meta">제출이 필요하면 기관이 안내한 공식 경로로 본인이 직접 제출합니다. EKODI 서버로 자동 제출하지 않습니다.</p></div>'+planPanel();
}

function renderDock(){
  const id=activeMission();
  const prev=$('#dockPrev'),next=$('#dockNext'),act=$('#dockAction');
  if(id){
    const s=stepOf(id),m=course.missions[id];
    $('#dockLabel').innerHTML='<b>'+(s+1)+' / '+STEP_LABELS.length+' · '+esc(STEP_LABELS[s])+'</b><span>'+esc(m.title.replace('개인 실습 ',''))+timerSuffix(id)+'</span>';
    prev.hidden=false;next.hidden=false;prev.disabled=s===0;next.disabled=s===STEP_LABELS.length-1;
    act.textContent=s===STEP_LABELS.length-1&&rec.done[id]?'다음 실습':STEP_ACTIONS[s];
    act.dataset.mode='step';
  }else{
    const pending=sessionMissions().find(m=>!rec.done[m])||sessionMissions()[0];
    prev.hidden=true;next.hidden=true;
    $('#dockLabel').innerHTML='<b>'+(pending?esc(course.missions[pending].title.replace('개인 실습 ','')):'오늘 순서')+'</b><span>'+session().no+'회차 · '+(pending&&rec.done[pending]?'모든 실습 완료':'다음 실습')+'</span>';
    act.textContent=pending?'실습 열기':'오늘 순서';act.dataset.mode='open';act.dataset.target=pending||'';
  }
}
function timerSuffix(id){const end=Number(rec.timers[id])||0;return end?' · 남은 시간 '+formatClock(Math.max(0,end-Date.now())):'';}
function render(){
  tabs();
  const id=activeMission();
  let html;
  if(id)html=viewMission(id);
  else if(rec.tab==='activity')html=viewActivity();
  else if(rec.tab==='record')html=viewRecord();
  else html=viewAgenda();
  $('#labView').innerHTML=html;
  $('#labSession').value=String(rec.session);$('#labTrack').value=rec.track;$('#labLevel').value=rec.level;
  $('#topSub').textContent=session().no+'회차 · '+(id?course.missions[id].title.replace('개인 실습 ',''):'수강생 실습실');
  renderDock();tick();relayout();
}
function setStep(id,s){rec.step[id]=Math.max(0,Math.min(STEP_LABELS.length-1,s));save();render();const card=$('#stepCard');if(card){card.focus({preventScroll:true});card.scrollIntoView({block:'start',behavior:'smooth'});}}
function tick(){
  const id=activeMission()||sessionMissions().find(m=>rec.timers[m]>Date.now())||'';
  const end=id?Number(rec.timers[id])||0:0;
  const left=end?end-Date.now():0;
  const el=$('#labTimer'),pill=$('#topTimer');
  if(!id||!end){el.textContent=id?formatClock(course.missions[id].minutes*60000):'--:--';el.className='lab-timer';$('#labTimerLabel').textContent=id?'실습 타이머 · 대기':'실습 타이머';$('#labTimerBtn').textContent='타이머 시작';$('#labTimerBtn').disabled=!id;pill.hidden=true;return;}
  const phase=left<=0?'done':left<=60000?'final':left<=300000?'warn':'';
  el.textContent=formatClock(Math.max(0,left));el.className='lab-timer '+phase;
  pill.hidden=false;pill.textContent='⏱ '+formatClock(Math.max(0,left));pill.className='timer-pill '+phase;pill.setAttribute('aria-label','남은 실습 시간 '+formatClock(Math.max(0,left)));
  $('#labTimerLabel').textContent=course.missions[id].title.replace('개인 실습 ','')+(phase==='done'?' · 종료':' · 남은 시간');
  $('#labTimerBtn').textContent='타이머 초기화';$('#labTimerBtn').disabled=false;
  if(activeMission()){const span=$('#dockLabel span');if(span)span.textContent=course.missions[id].title.replace('개인 실습 ','')+timerSuffix(id);}
  if(phase!==lastPhase){if(phase==='warn')toast('실습 종료 5분 전 — 결과를 점검하고 저장하세요.');if(phase==='done')toast('실습 시간이 끝났습니다.');lastPhase=phase;}
}
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
  if(act.dataset.mode==='open'){if(act.dataset.target){rec.tab='m:'+act.dataset.target;save();render();window.scrollTo({top:0});}else{rec.tab='agenda';save();render();}return;}
  const id=activeMission();const s=stepOf(id);
  if(s===0)return setStep(id,1);
  if(s===1)return openFactchat(canSplit());
  if(s===2||s===3){const el=document.getElementById('step-prompt');const r=await copyText(window,el?.textContent||'',el);toast(r==='copied'?'프롬프트를 복사했습니다. FactChat에 붙여 넣으세요.':r==='selected'?'텍스트를 선택했습니다. 길게 눌러 복사하세요.':'복사하지 못했습니다.');if(r==='copied')setTimeout(()=>setStep(id,s+1),700);return;}
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
  const lines=['# 내 실습 기록 — '+course.subtitle,'','- 과정: '+course.title,'- 직무 사례: '+trackById(course,rec.track).label,'- 난이도: '+levelById(course,rec.level).label,'- 내려받은 시각: '+new Date().toLocaleString('ko-KR'),'- 이 파일은 개인 기기에서 만들어졌으며 서버에 저장되지 않았습니다.',''];
  for(const m of Object.values(course.missions).sort((a,b)=>a.no-b.no)){
    lines.push('## '+m.title+(rec.done[m.id]?' ✓ 완료':''),'');
    const level=levelById(course,rec.level);
    m.criteria[level.id].forEach((c,i)=>lines.push('- ['+(rec.checked[m.id+':'+level.id+':'+i]?'x':' ')+'] '+c));
    m.errors.forEach((c,i)=>lines.push('- ['+(rec.checked[m.id+':err:'+i]?'x':' ')+'] 검증: '+c));
    lines.push('','사용한 프롬프트:','');
    buildPrompts(course,m.id,rec.track,rec.level).forEach(p=>lines.push('```','# '+p.label,p.text,'```',''));
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
  document.addEventListener('click',async e=>{
    const t=e.target.closest('button,a');if(!t)return;const d=t.dataset;
    if(d.tab){rec.tab=d.tab;save();render();$('#labMain').focus({preventScroll:true});window.scrollTo({top:0});return;}
    if(d.step!==undefined){setStep(activeMission(),Number(d.step));return;}
    if(d.split){openFactchat(true);return;}
    if(d.openTool==='factchat'){const id=activeMission();if(id&&stepOf(id)===1)setTimeout(()=>setStep(id,2),300);return;}
    if(d.copy){const el=document.getElementById(d.copy);const r=await copyText(window,el?.textContent||'',el);toast(r==='copied'?'프롬프트를 복사했습니다. FactChat에 붙여 넣으세요.':r==='selected'?'텍스트를 선택했습니다. 길게 눌러 복사하세요.':'복사하지 못했습니다.');return;}
    if(d.download!==undefined){const f=missionMaterials(course,activeMission(),rec.track)[Number(d.download)];if(f){downloadText(document,f.name,f.text);toast(f.label+' 내려받기');}return;}
    if(d.runCheck){runCheck(d.runCheck);return;}
    if(d.sample){const m=course.missions[d.sample];const area=document.querySelector('[data-result="'+d.sample+'"]');if(area){area.value=m.fallback.sampleOutput;}rec.results[d.sample]=m.fallback.sampleOutput;save();runCheck(d.sample);return;}
    if(d.finish){finish(d.finish);return;}
    if(d.toggleFallback){document.querySelector('.fallback')?.classList.toggle('is-open');return;}
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
  $('#labSession').addEventListener('change',e=>{rec.session=Number(e.target.value);rec.tab='agenda';save();render();});
  $('#labTrack').addEventListener('change',e=>{rec.track=e.target.value;save();render();toast(trackById(course,rec.track).label+' 사례로 바꿨습니다.');});
  $('#labLevel').addEventListener('change',e=>{rec.level=e.target.value;save();render();});
  $('#labTimerBtn').addEventListener('click',()=>{
    const id=activeMission();if(!id)return;
    if(rec.timers[id]){delete rec.timers[id];lastPhase='';}else rec.timers[id]=Date.now()+course.missions[id].minutes*60000;
    save();tick();
  });
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
  const data=await entry.load();
  course=data.COURSE;validateCourse(course);
  key='ekodi_edu_lab_v1:'+course.id;
  rec=load();
  if(!course.tracks.some(t=>t.id===rec.track))rec.track='';
  const p=parseLearnerParams(location.search,course);
  if(new URLSearchParams(location.search).has('s'))rec.session=p.s;
  if(!sessionByNo(course,rec.session))rec.session=1;
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
  $('#labSub').textContent=course.title+' · '+course.format;
  $('#labSafety').textContent=course.safety;
  $('#topFactchat').href=FACTCHAT_TOOL.entryUrl;
  $('#labSession').innerHTML=course.sessions.map(s=>'<option value="'+s.no+'">'+s.no+'회차</option>').join('');
  $('#labTrack').innerHTML='<option value="" disabled>직무 선택</option>'+course.tracks.map(t=>'<option value="'+t.id+'">'+esc(t.label)+'</option>').join('');
  $('#labLevel').innerHTML=course.levels.map(l=>'<option value="'+l.id+'">'+esc(l.label)+'</option>').join('');
  const needTrack=!rec.track;
  if(needTrack)rec.track=course.tracks[0].id;
  relayout=bindChrome(document,{top:$('#labTop'),dock:$('#labDock')});
  save();bind();render();
  if(needTrack)toast('「내 직무」를 고르면 내 업무에 맞는 실습 원문과 프롬프트가 나옵니다.');
  setInterval(tick,1000);
  document.body.dataset.ready='true';
}
init().catch(error=>{console.error('lab init',error);$('#labView').innerHTML='<div class="panel"><h2>실습실을 불러오지 못했습니다</h2><p class="meta">'+multiline(error?.message||error)+'</p></div>';});
