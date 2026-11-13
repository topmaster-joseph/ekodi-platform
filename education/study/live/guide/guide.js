// 강사용 세부 강의안 — mobile-first instructor view (no network calls, nothing sent anywhere).
// 차수 탭 → 차시별 진행표. Each demo/practice 차시 lets the instructor pick a demo (추천 + 전체 분야),
// shows the demo material, and the hand-over line that sends learners into focused individual practice.
import {FIELDS,FLOW,PROMPTS,FREE_PROMPT,SAFETY,SESSIONS,PREP,FOCUS_RULES,LEARNER_LABEL} from './data.js';
import {DEMOS,MISSIONS,SESSION_PICKS,FEATURE_STEPS,INPUT_LABEL,PPT_SETTINGS,CREDIT,CREDIT_OPENING,CREDIT_AS_OF,demoById,demoPrompt,featureInput} from './demos.js';

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fieldLabel=id=>id==='common'?'공통':(FIELDS.find(f=>f.id===id)?.label||id);
const store={get(k){try{return JSON.parse(localStorage.getItem('ekodi-guide:'+k)||'null')}catch{return null}},set(k,v){try{localStorage.setItem('ekodi-guide:'+k,JSON.stringify(v))}catch{}}};
const MISSION={hwp:'실습① HWP 문서',minutes:'실습② 회의록',ppt:'실습③ 발표자료'};
const COURSE='mnu-factchat-2026';

function kst(now=new Date()){const d=new Date(now.getTime()+9*3600000);return {date:d.toISOString().slice(0,10),min:d.getUTCHours()*60+d.getUTCMinutes(),sec:d.getUTCSeconds()};}
const toMin=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
const clock=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');

function defaultSession(){
  const k=kst();
  const today=SESSIONS.filter(s=>s.date===k.date);
  if(today.length){const live=today.find(s=>k.min<toMin(s.end));return (live||today[today.length-1]).no;}
  return (SESSIONS.find(s=>s.date>k.date)||SESSIONS[0]).no;
}
let current=Number(new URLSearchParams(location.search).get('s'))||defaultSession();
if(!SESSIONS.some(s=>s.no===current))current=1;
let field=store.get('field')||'admin';
// Chosen demo per 차수·차시 (remembered on this device only).
const picked=()=>store.get('picks')||{};
function pickFor(seg){const p=picked()[current+':'+seg];const rec=SESSION_PICKS[current]?.[seg]||[];return demoById(p)?p:rec[0]||'';}

function list(items,cls=''){return items?.length?'<ul class="g-list '+cls+'">'+items.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>':'';}
function mixBar(s){
  return '<div class="g-mix" role="img" aria-label="분야 구성">'+Object.entries(s.mix).map(([id,n])=>'<span class="g-mix-seg g-f-'+id+'" data-w="'+(n/s.count*100).toFixed(1)+'"></span>').join('')+'</div>'+
    '<ul class="g-legend">'+Object.entries(s.mix).sort((a,b)=>b[1]-a[1]).map(([id,n])=>'<li><i class="g-dot g-f-'+id+'"></i>'+esc(fieldLabel(id))+' <b>'+n+'</b></li>').join('')+'</ul>';
}

function demoPicker(seg){
  const rec=SESSION_PICKS[current]?.[seg]||[];const cur=pickFor(seg);const d=demoById(cur);
  const chips=rec.map(id=>{const x=demoById(id);return '<button type="button" class="g-chip-btn g-f-'+x.field+'" aria-pressed="'+(id===cur)+'" data-pick="'+seg+'" data-id="'+id+'">'+esc(fieldLabel(x.field))+' · '+esc(x.title)+'</button>';}).join('');
  const groups=[...new Set(DEMOS.map(x=>x.field))].map(f=>'<optgroup label="'+esc(fieldLabel(f))+'">'+DEMOS.filter(x=>x.field===f).map(x=>'<option value="'+x.id+'"'+(x.id===cur?' selected':'')+'>'+esc(MISSIONS[x.mission]+' · '+x.title)+'</option>').join('')+'</optgroup>').join('');
  return '<div class="g-demo"><p class="g-sub">강사 시연 고르기 <small>이 차수 추천</small></p><div class="g-chips">'+chips+'</div>'+
    '<label class="g-select-label">다른 분야 시연<select class="g-select" data-pick-select="'+seg+'">'+groups+'</select></label>'+(d?demoCard(d):'')+'</div>';
}
function demoCard(d){
  const present='../present/?c='+COURSE+'&g='+current+'&demo='+encodeURIComponent(d.id);
  const m=d.mission,isMin=m==='minutes',hasSample=d.sample&&!/^\(/.test(d.sample);
  const sampleLabel=m==='hwp'?'문서 본문에 붙여 넣을 자료(가상)':isMin?'':'시연 자료(가상)';
  return '<article class="g-demo-card"><p class="g-kind">'+esc(fieldLabel(d.field))+' · FactChat '+esc(MISSIONS[m])+'</p><h4>'+esc(d.title)+'</h4>'+
    '<p class="g-sub">화면 조작 순서</p><ol class="g-list g-steps">'+(FEATURE_STEPS[m]||[]).map(t=>'<li>'+esc(t)+'</li>').join('')+'</ol>'+
    (hasSample&&!isMin?'<p class="g-sub">'+sampleLabel+'</p><p class="g-pre">'+esc(d.sample)+'</p>':'')+
    '<p class="g-sub">'+esc(INPUT_LABEL[m]||'입력')+'</p><p class="g-pre">'+esc(featureInput(d))+'</p>'+
    (m==='ppt'?'<p class="g-setting">화면 설정: '+esc(PPT_SETTINGS)+'</p>':'')+
    (isMin?'<details class="g-prompt"><summary>녹음이 안 될 때 · 채팅 대체 프롬프트</summary><p class="g-pre">'+esc(demoPrompt(d))+'</p></details>':'')+
    '<div class="g-two"><div><p class="g-sub">보여줄 포인트</p>'+list(d.points)+'</div><div><p class="g-sub">나올 수 있는 오류</p>'+list(d.pitfalls,'g-warn')+'</div></div>'+
    (CREDIT[m]?'<p class="g-credit-line">크레딧: '+esc(CREDIT[m].rule)+' · 예상 '+esc(CREDIT[m].estimate)+'</p>':'')+
    '<p class="g-handoff"><b>넘김 멘트</b> '+esc(d.handoff)+'</p>'+
    '<div class="g-actions"><button type="button" class="btn btn-small btn-primary" data-copy-input="'+d.id+'">'+(isMin?'대본 복사':'입력 글 복사')+'</button>'+
    (hasSample&&m==='hwp'?'<button type="button" class="btn btn-small" data-copy-sample="'+d.id+'">자료 복사</button>':'')+
    '<a class="btn btn-small" href="'+present+'">발표 화면에 불러오기</a></div>'+
    '<p class="meta">발표 화면의 AI 시연은 채팅으로 실행됩니다. HWP·회의록·프레젠테이션 기능은 「FactChat 화면」 버튼으로 실제 화면을 띄워 시연하세요.</p></article>';
}
function creditBox(m){
  const c=CREDIT[m];if(!c)return '';
  return '<div class="g-credit"><p class="g-credit-title">크레딧 · 각자 기관 계정에서 차감</p><p>'+esc(c.rule)+'</p><p>1인 예상: <b>'+esc(c.estimate)+'</b></p><p class="g-say"><b>공지 멘트</b> 「'+esc(c.say)+'」</p></div>';
}
function phaseBar(f){
  if(!f.phases)return '';
  const total=f.phases.reduce((a,p)=>a+p[1],0);
  return '<div class="g-phases">'+f.phases.map((p,i)=>'<span class="g-phase g-ph-'+i+'" data-w="'+(p[1]/total*100).toFixed(1)+'">'+esc(p[0])+' '+p[1]+'분</span>').join('')+'</div>';
}
function learnerPrompt(f){
  if(f.mission==='free')return '<details class="g-prompt"><summary>수강생 실습 프롬프트 · 재사용 템플릿</summary><p class="g-pre">'+esc(FREE_PROMPT)+'</p><button type="button" class="btn btn-small" data-copy="free">복사</button></details>';
  if(!f.mission||!PROMPTS[field]?.[f.mission])return '';
  return '<details class="g-prompt"><summary>수강생 실습 · '+esc(fieldLabel(field))+' · '+esc(LEARNER_LABEL[f.mission]||MISSION[f.mission])+'</summary><ol class="g-list g-steps">'+(FEATURE_STEPS[f.mission]||[]).map(t=>'<li>'+esc(t)+'</li>').join('')+'</ol><p class="g-pre">'+esc(PROMPTS[field][f.mission])+'</p>'+(f.mission==='ppt'?'<p class="g-setting">화면 설정: '+esc(PPT_SETTINGS)+'</p>':'')+'<button type="button" class="btn btn-small" data-copy="'+f.mission+'">복사</button></details>';
}

function renderTabs(){
  $('#gTabs').innerHTML=SESSIONS.map(s=>'<button type="button" class="g-tab" role="tab" aria-selected="'+(s.no===current)+'" data-s="'+s.no+'"><b>'+s.no+'차</b><small>'+s.date.slice(5).replace('-','.')+'('+s.day+') '+s.slot+'</small></button>').join('');
}
function renderSession(){
  const s=SESSIONS.find(x=>x.no===current)||SESSIONS[0];
  const base=toMin(s.start);
  $('#gSession').innerHTML='<section class="g-card g-head"><p class="g-eyebrow">'+s.no+'차 · '+esc(s.date)+'('+s.day+') '+s.start+'~'+s.end+' · '+s.count+'명</p>'+
    '<p class="g-profile">'+esc(s.profile)+'</p>'+mixBar(s)+
    '<p class="g-lead">메인 분야: '+s.lead.map(id=>'<span class="g-chip g-f-'+id+'">'+esc(fieldLabel(id))+'</span>').join(' ')+'</p></section>'+
    '<section class="g-card"><h2>이 차수 맞춤 운영</h2>'+list(s.focus)+(s.watch?.length?'<h3>주의</h3>'+list(s.watch,'g-warn'):'')+'</section>'+
    '<section class="g-card"><h2>차시별 강의안 <small>'+s.start+' 시작</small></h2><ol class="g-flow">'+FLOW.map(f=>{
      const extra=s.notes?.[f.id];
      const picker=SESSION_PICKS[current]?.[f.id]?demoPicker(f.id):'';
      return '<li class="g-step g-k-'+esc(f.kind)+'" data-a="'+(base+f.start)+'" data-b="'+(base+f.end)+'"><div class="g-time"><b>'+clock(base+f.start)+'</b><small>'+(f.end-f.start)+'분</small></div><div class="g-body">'+
        '<p class="g-kind">'+esc(f.kind)+'</p><h3>'+esc(f.title)+'</h3>'+phaseBar(f)+
        (f.id==='intro'?'<div class="g-credit"><p class="g-credit-title">크레딧 공지 (시작할 때 읽기)</p><p class="g-say">「'+esc(CREDIT_OPENING)+'」</p></div>':'')+
        (f.id==='demo'?'<div class="g-credit"><p class="g-credit-title">크레딧</p><p>강사 시연은 강사 계정 크레딧을 씁니다. 회의록 30초·발표자료 5장 기준 약 260크레딧 + 채팅·HWP 요청분.</p></div>':'')+
        (f.mission?creditBox(f.mission):'')+
        (extra?.length?'<div class="g-session-note"><p class="g-sub">'+s.no+'차 강의자료</p>'+list(extra)+'</div>':'')+
        list(f.talk,'g-talk')+(f.demo?.length?'<p class="g-sub">기본 시연 순서</p>'+list(f.demo):'')+
        picker+learnerPrompt(f)+(f.cues?.length?'<p class="g-sub">운영 신호</p>'+list(f.cues,'g-cue'):'')+'</div></li>';
    }).join('')+'</ol></section>';
  for(const el of document.querySelectorAll('[data-w]'))el.style.width=el.dataset.w+'%'; // CSP: no inline style attributes
  tick();
}
function renderField(){
  $('#gFields').innerHTML=FIELDS.map(f=>'<button type="button" class="g-fbtn g-f-'+f.id+'" aria-pressed="'+(f.id===field)+'" data-f="'+f.id+'">'+esc(f.label)+'</button>').join('');
  const f=FIELDS.find(x=>x.id===field);
  $('#gFieldInfo').textContent=f?'해당 부서: '+f.depts:'';
}
function renderCredit(){
  const names={hwp:'HWP 편집기',minutes:'회의록',ppt:'프레젠테이션',chat:'채팅',research:'Deep Research'};
  $('#gCredit').innerHTML='<p class="g-say">「'+esc(CREDIT_OPENING)+'」</p><table class="g-table"><thead><tr><th>기능</th><th>차감 기준</th><th>1인 예상</th></tr></thead><tbody>'+
    Object.entries(names).map(([k,n])=>'<tr><th>'+n+'</th><td>'+esc(CREDIT[k].rule)+'</td><td>'+esc(CREDIT[k].estimate)+'</td></tr>').join('')+'</tbody></table>'+
    '<p class="meta">출처: Mindlogic BAZE(FactChat) 공식 문서, '+CREDIT_AS_OF+' 확인. 기관별 한도·잔여 크레딧 확인 위치는 확인필요.</p>';
}
function renderStatic(){
  renderCredit();
  $('#gFocus').innerHTML=list(FOCUS_RULES);
  $('#gSafety').innerHTML=list(SAFETY);
  const done=store.get('prep')||{};
  $('#gPrep').innerHTML='<ul class="g-checks">'+PREP.map((t,i)=>'<li><label><input type="checkbox" data-prep="'+i+'"'+(done[i]?' checked':'')+'> '+esc(t)+'</label></li>').join('')+'</ul>';
}

function tick(){
  const s=SESSIONS.find(x=>x.no===current);if(!s)return;
  const k=kst(),live=s.date===k.date;let label='';
  for(const el of document.querySelectorAll('.g-step')){
    const a=+el.dataset.a,b=+el.dataset.b,on=live&&k.min>=a&&k.min<b;
    el.classList.toggle('is-now',on);el.classList.toggle('is-done',live&&k.min>=b);
    if(on)label='지금: '+el.querySelector('h3').textContent+' · 남은 '+(b-k.min)+'분';
  }
  if(!label){const a=toMin(s.start);label=!live?s.date.slice(5).replace('-','.')+'('+s.day+') '+s.start+' 시작':k.min<a?'시작까지 '+(a-k.min)+'분':'이 차수 종료';}
  $('#gNow').textContent=label;
  $('#gClock').textContent=clock(k.min)+':'+String(k.sec).padStart(2,'0');
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{t.hidden=true},1600);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('복사했습니다');}catch{toast('복사하지 못했습니다 — 길게 눌러 선택하세요');}}
function setPick(seg,id){const p=picked();p[current+':'+seg]=id;store.set('picks',p);renderSession();}

document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-s]');if(tab){current=+tab.dataset.s;try{history.replaceState(null,'','?s='+current)}catch{}renderTabs();renderSession();return;}
  const fb=e.target.closest('[data-f]');if(fb){field=fb.dataset.f;store.set('field',field);renderField();renderSession();return;}
  const pk=e.target.closest('[data-pick]');if(pk){setPick(pk.dataset.pick,pk.dataset.id);return;}
  const ci=e.target.closest('[data-copy-input]');if(ci){copy(featureInput(demoById(ci.dataset.copyInput)));return;}
  const cs=e.target.closest('[data-copy-sample]');if(cs){copy(demoById(cs.dataset.copySample)?.sample||'');return;}
  const cp=e.target.closest('[data-copy]');if(cp){const k=cp.dataset.copy;copy(k==='free'?FREE_PROMPT:PROMPTS[field][k]);return;}
  if(e.target.closest('#gJump'))document.querySelector('.g-step.is-now')?.scrollIntoView({behavior:'smooth',block:'start'});
});
document.addEventListener('change',e=>{
  const sel=e.target.closest('[data-pick-select]');if(sel){setPick(sel.dataset.pickSelect,sel.value);return;}
  const c=e.target.closest('[data-prep]');if(!c)return;const d=store.get('prep')||{};d[c.dataset.prep]=c.checked;store.set('prep',d);
});

renderTabs();renderField();renderSession();renderStatic();
setInterval(tick,1000);
