// EKODI Education Premium Studio — Learner Lab (수강생 개인 실습실).
// Public, anonymous, local-only. Never loads instructor notes, never posts data, never stores personal identifiers.
import {courseEntry} from './courses/registry.js';
import {validateCourse,sessionByNo,parseLearnerParams,formatClock,missionMaterials,KIND_LABELS,buildPrompts,trackById,levelById} from './engine/model.js';
import {esc,list,missionSections,readFeatureChecks,downloadText,copyText,safeStorage,multiline} from './engine/render.js';
import {FACTCHAT_TOOL} from './tools/factchat.js';

const $=s=>document.querySelector(s);
const entry=courseEntry(new URLSearchParams(location.search).get('c'));
const storage=safeStorage(window);
const MAX_TEXT=4000;
let course,rec,key,toastTimer=0,lastPhase='';

const blank=()=>({v:1,session:1,track:'',level:'basic',tab:'agenda',checked:{},memo:{},self:{},quiz:{},hunts:{},plan:'',applied:'',timers:{},updatedAt:0});
function load(){
  try{const raw=JSON.parse(storage?.getItem(key)||'null');if(raw&&raw.v===1)return {...blank(),...raw};}catch{}
  return blank();
}
function save(){
  rec.updatedAt=Date.now();
  try{storage?.setItem(key,JSON.stringify(rec));}catch{toast('이 브라우저는 저장을 막고 있습니다. 「내 기록 내려받기」로 보관하세요.');}
}
function toast(text){const el=$('#toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},2800);}
const session=()=>sessionByNo(course,rec.session)||course.sessions[0];
const sessionMissions=()=>session().modules.filter(m=>m.kind==='practice').map(m=>m.missionId);
const isNarrow=()=>window.matchMedia('(max-width: 899px)').matches||window.matchMedia('(pointer: coarse)').matches;
function activeMission(){const t=rec.tab;return t.startsWith('m:')&&course.missions[t.slice(2)]?t.slice(2):'';}
const clean=v=>String(v||'').replace(/\u0000/g,'').slice(0,MAX_TEXT);

function tabs(){
  const items=[['agenda','오늘 순서']].concat(sessionMissions().map(id=>['m:'+id,course.missions[id].title.replace('개인 실습 ','')]));
  items.push(['activity',session().no===1?'퀴즈·오류 찾기':'오류 찾기·적용 계획'],['record','내 기록']);
  $('#labTabs').innerHTML=items.map(([id,label])=>'<button type="button" class="tab'+(rec.tab===id?' is-on':'')+'" data-tab="'+esc(id)+'" aria-pressed="'+(rec.tab===id)+'">'+esc(label)+'</button>').join('');
}
function viewAgenda(){
  const rows=session().modules.map(m=>{
    const title=m.kind==='practice'?course.missions[m.missionId].title:m.title;
    const tasks=m.learner?.tasks?list(m.learner.tasks,true):m.kind==='practice'?'<p><button type="button" class="btn btn-small btn-primary" data-tab="m:'+esc(m.missionId)+'">실습 열기 →</button></p>':m.summary?'<p class="meta">'+esc(m.summary)+'</p>':'';
    return '<article class="panel"><p class="eyebrow">'+m.start+'–'+m.end+'분 · '+esc(KIND_LABELS[m.kind])+'</p><h3>'+esc(m.learner?.headline||title)+'</h3>'+(m.learner?'<p class="meta">'+esc(title)+'</p>':'')+tasks+'</article>';
  }).join('');
  return '<div class="panel"><p class="eyebrow">'+esc(course.subtitle)+' · '+session().no+'회차</p><h2>'+esc(session().title)+'</h2><p class="meta">'+esc(course.format)+'</p>'+
    '<div class="btn-row"><a class="btn btn-primary" href="'+esc(FACTCHAT_TOOL.entryUrl)+'" target="_blank" rel="noopener noreferrer" data-open-tool="factchat">FactChat 열기 ↗</a></div><p class="meta">공식 FactChat 사이트에서 본인 기관 계정으로 직접 로그인합니다. EKODI는 계정·비밀번호를 받지 않습니다.</p></div>'+rows;
}
function viewMission(id){
  const m=course.missions[id];
  const narrow=isNarrow();
  const pcBanner=m.pcOnly?'<p class="notice'+(narrow?' pc-only':'')+'">'+(narrow?'<b>PC 전용 실습입니다.</b> 이 기기에서는 HWP 편집을 할 수 없습니다(FactChat 공식 안내). 아래 대체 실습으로 참여하거나 PC에서 이 화면을 여세요.':'이 실습은 PC 전용입니다(FactChat 공식 안내).')+'</p>':'';
  const self=rec.self[id]||{};
  const score=[1,2,3,4,5].map(n=>'<label class="check"><input type="radio" name="score-'+esc(id)+'" value="'+n+'" data-self="'+esc(id)+'"'+(Number(self.score)===n?' checked':'')+'> <span>'+n+'</span></label>').join('');
  return '<div class="panel"><p class="eyebrow">'+m.minutes+'분 실습 · '+esc(trackById(course,rec.track).label)+' · '+esc(levelById(course,rec.level).label)+'</p><h2>'+esc(m.title)+'</h2>'+pcBanner+'</div>'+
    '<div class="panel">'+missionSections(course,id,{trackId:rec.track,levelId:rec.level,checks:readFeatureChecks(storage),tool:FACTCHAT_TOOL,showFallback:m.pcOnly&&narrow,checked:rec.checked})+
    '<div class="btn-row"><button type="button" class="btn btn-small" data-toggle-fallback="'+esc(id)+'">대체 실습 보기/숨기기</button></div></div>'+
    '<div class="panel"><h3>실습 메모 · 결과 요약</h3><p class="meta">개인정보·비공개 업무 내용은 적지 마세요. 이 기기에만 저장됩니다.</p><textarea data-memo="'+esc(id)+'" aria-label="실습 메모" maxlength="'+MAX_TEXT+'">'+esc(rec.memo[id]||'')+'</textarea>'+
    '<h3>자기평가 (1 어려움 · 5 자신 있음)</h3><div class="stars" role="radiogroup" aria-label="자기평가">'+score+'</div>'+
    '<label class="field">어려웠던 부분<textarea data-hard="'+esc(id)+'" maxlength="'+MAX_TEXT+'">'+esc(self.hard||'')+'</textarea></label></div>';
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
  return quiz+hunts+plan||'<div class="panel"><p>이 회차에는 별도 활동이 없습니다.</p></div>';
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
    return '<tr><td>'+esc(m.title)+'</td><td>'+done+' / '+crit.length+'</td><td>'+errs+' / '+m.errors.length+'</td><td>'+(rec.self[m.id]?.score?esc(rec.self[m.id].score)+'점':'-')+'</td></tr>';}).join('');
  return '<div class="panel"><h2>내 기록</h2><p class="meta">익명·로컬 모드입니다. 출결·공식 평가·수료와 연결되지 않습니다.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>실습</th><th>달성 조건</th><th>오류 검증</th><th>자기평가</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="btn-row"><button type="button" class="btn btn-primary" id="exportRec">내 기록 내려받기 (Markdown)</button></div><p class="meta">제출이 필요하면 기관이 안내한 공식 경로로 본인이 직접 제출합니다. EKODI 서버로 자동 제출하지 않습니다.</p></div>'+planPanel();
}
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
  tick();
}
function tick(){
  const id=activeMission()||sessionMissions().find(m=>rec.timers[m]>Date.now())||'';
  const end=id?Number(rec.timers[id])||0:0;
  const left=end?end-Date.now():0;
  const el=$('#labTimer');
  if(!id||!end){el.textContent=id?formatClock(course.missions[id].minutes*60000):'--:--';el.className='lab-timer';$('#labTimerLabel').textContent=id?'실습 타이머 · 대기':'실습 타이머';$('#labTimerBtn').textContent='타이머 시작';$('#labTimerBtn').disabled=!id;return;}
  const phase=left<=0?'done':left<=60000?'final':left<=300000?'warn':'';
  el.textContent=formatClock(Math.max(0,left));el.className='lab-timer '+phase;
  $('#labTimerLabel').textContent=course.missions[id].title.replace('개인 실습 ','')+(phase==='done'?' · 종료':' · 남은 시간');
  $('#labTimerBtn').textContent='타이머 초기화';$('#labTimerBtn').disabled=false;
  if(phase!==lastPhase){if(phase==='warn')toast('실습 종료 5분 전 — 결과를 저장하고 검증하세요.');if(phase==='done')toast('실습 시간이 끝났습니다.');lastPhase=phase;}
}
function exportMarkdown(){
  const lines=['# 내 실습 기록 — '+course.subtitle,'','- 과정: '+course.title,'- 직무 사례: '+trackById(course,rec.track).label,'- 난이도: '+levelById(course,rec.level).label,'- 내려받은 시각: '+new Date().toLocaleString('ko-KR'),'- 이 파일은 개인 기기에서 만들어졌으며 서버에 저장되지 않았습니다.',''];
  for(const m of Object.values(course.missions).sort((a,b)=>a.no-b.no)){
    lines.push('## '+m.title,'');
    const level=levelById(course,rec.level);
    m.criteria[level.id].forEach((c,i)=>lines.push('- ['+(rec.checked[m.id+':'+level.id+':'+i]?'x':' ')+'] '+c));
    m.errors.forEach((c,i)=>lines.push('- ['+(rec.checked[m.id+':err:'+i]?'x':' ')+'] 검증: '+c));
    lines.push('','사용한 프롬프트:','');
    buildPrompts(course,m.id,rec.track,rec.level).forEach(p=>lines.push('```','# '+p.label,p.text,'```',''));
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
    if(d.copy){const el=document.getElementById(d.copy);const r=await copyText(window,el?.textContent||'',el);toast(r==='copied'?'프롬프트를 복사했습니다. FactChat에 붙여 넣으세요.':r==='selected'?'텍스트를 선택했습니다. 길게 눌러 복사하세요.':'복사하지 못했습니다.');return;}
    if(d.download!==undefined){const f=missionMaterials(course,activeMission(),rec.track)[Number(d.download)];if(f){downloadText(document,f.name,f.text);toast(f.label+' 내려받기');}return;}
    if(d.toggleFallback){document.querySelector('.fallback')?.classList.toggle('is-open');return;}
    if(d.quiz!==undefined){rec.quiz[Number(d.quiz)]=d.ans==='1';save();render();return;}
    if(t.id==='exportRec'){exportMarkdown();return;}
  });
  document.addEventListener('change',e=>{
    const t=e.target;
    if(t.matches('[data-crit]')){rec.checked[t.dataset.crit]=t.checked;save();return;}
    if(t.matches('[data-self]')){const id=t.dataset.self;rec.self[id]={...(rec.self[id]||{}),score:Number(t.value)};save();return;}
  });
  document.addEventListener('input',e=>{
    const t=e.target;
    if(t.matches('[data-memo]')){rec.memo[t.dataset.memo]=clean(t.value);save();}
    else if(t.matches('[data-hard]')){const id=t.dataset.hard;rec.self[id]={...(rec.self[id]||{}),hard:clean(t.value)};save();}
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
  $('#labClear').addEventListener('click',()=>{
    if(!confirm('이 기기에 저장된 실습 체크·메모·계획을 모두 삭제할까요? 되돌릴 수 없습니다.'))return;
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
  $('#labSession').innerHTML=course.sessions.map(s=>'<option value="'+s.no+'">'+s.no+'회차</option>').join('');
  $('#labTrack').innerHTML='<option value="" disabled>직무 선택</option>'+course.tracks.map(t=>'<option value="'+t.id+'">'+esc(t.label)+'</option>').join('');
  $('#labLevel').innerHTML=course.levels.map(l=>'<option value="'+l.id+'">'+esc(l.label)+'</option>').join('');
  const needTrack=!rec.track;
  if(needTrack)rec.track=course.tracks[0].id;
  save();bind();render();
  if(needTrack)toast('「내 직무」를 고르면 내 업무에 맞는 실습 원문과 프롬프트가 나옵니다.');
  setInterval(tick,1000);
  document.body.dataset.ready='true';
}
init().catch(error=>{console.error('lab init',error);$('#labView').innerHTML='<div class="panel"><h2>실습실을 불러오지 못했습니다</h2><p class="meta">'+multiline(error?.message||error)+'</p></div>';});
