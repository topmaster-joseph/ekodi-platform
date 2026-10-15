import { COURSE } from './catalog.js';
import { PROGRAMS } from './programs/catalog.js';

const $ = selector => document.querySelector(selector);
const all = selector => Array.from(document.querySelectorAll(selector));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const menuLabels = Object.freeze({overview:'과정 안내',lecture:'회차별 강의안',practice:'실습·프롬프트',resources:'자료실·체크리스트',operations:'6세트 운영관리',instructor:'강사·운영 안내'});
const allowedViews = Object.keys(menuLabels);
let view = 'overview';
let lessonId = 1;
let batchId = 'A';
let slideIndex = 0;
let slides = [];
const lesson = () => COURSE.lessons.find(item=>item.id === lessonId);
const batch = () => COURSE.batches.find(item=>item.id === batchId);
const list = (items, ordered=false) => '<'+(ordered?'ol':'ul')+' class="stack-list">'+items.map(t=>'<li>'+esc(t)+'</li>').join('')+'</'+(ordered?'ol':'ul')+'>';
const card = (label,title,body) => '<article class="info-card"><p class="section-kicker">'+esc(label)+'</p><h3>'+esc(title)+'</h3>'+body+'</article>';
const head = label => '<div class="session-head"><span class="badge-soft">'+lessonId+'회차 · '+esc(batch().name)+'</span><h3>'+esc(lesson().title)+'</h3><p>'+esc(label)+'</p></div>';
const status = value => { const el=$('#actionStatus'); if(el) el.textContent=value; };

function overview(){
  const programCards=PROGRAMS.map(p=>'<article class="program-brief-card"><p class="section-kicker">PROGRAM '+String(p.number).padStart(2,'0')+' · '+esc(p.audience)+'</p><h4>'+esc(p.title)+'</h4><p>원문 4차시 · 대상별 별도 교육과정</p><a href="./programs/?program='+encodeURIComponent(p.id)+'&session=1">차시별 안내 보기 →</a></article>').join('');
  const items=COURSE.lessons.map(item=>'<article class="lesson-card"><p class="section-kicker">SESSION 0'+item.id+' · 120 MIN</p><h3>'+esc(item.title)+'</h3><p>'+esc(item.sub)+'</p><p><strong>산출물</strong> · '+esc(item.outcome)+'</p><button type="button" class="chip" data-lesson="'+item.id+'" data-view-target="lecture">강의안 열기 →</button></article>').join('');
  return card('NEW PROGRAM COLLECTION','첨부 교육프로그램 안내자료 · 6개 과정 / 24차시',
    '<p>초등 AI 윤리·AIoT 가로등, 드로잉 로봇, 가위바위보 로봇, 중고등 스마트팜, 청년 바이브코딩 스마트팜. 제공된 HWPX 원문 내용만 정리한 별도의 교육과정이며, 아래 교직원 교육 제안과 혼동하지 않습니다.</p><div class="program-brief-grid">'+programCards+'</div><div class="btnline"><a href="./programs/">6개 교육프로그램 전체 보기 →</a></div>')+
    card('COURSE MAP','4회차 × 6세트 = 24회 · 48시간','<p>동일한 4회 기본과정을 여섯 집단에 반복하는 운영 제안입니다. 세트별로 직무 사례를 바꿉니다. 실제 일정과 참가자 배정은 사업단 협의 이후 확정합니다.</p>')+
    '<div class="course-cards">'+items+'</div>'+
    card('LEARNING METHOD','강의 30% · 시연 20% · 실습 40% · 공유 10%','<p>단순히 AI의 기능을 소개하는 과정이 아니라, 가상 사례로 직접 만들어 보고 확인할 수 있는 결과물을 남기는 과정입니다. 모든 실습은 공개형 AI에 개인정보를 입력하지 않는 것을 전제로 합니다.</p>')+
    card('BEFORE CLASS','강의 시작 전 준비','<p>사업단 승인 AI 계정·인터넷·화면 공유·가상 데이터 배포를 확인합니다. 접속에 문제가 생기면 동일 학습목표의 오프라인 오류 점검 활동으로 전환합니다.</p>');
}
function lecture(){
  const l=lesson();
  return head(l.question)+
    '<div class="two-col">'+card('학습목표','오늘 가능한 일',list(l.objectives))+
    card('완성할 결과물',l.outcome,'<p>'+esc(l.practice)+'</p><div class="btnline"><button type="button" data-view-target="practice">실습 열기 →</button></div>')+'</div>'+
    card('TIMELINE','120분 표준 진행표','<div class="wide-scroll"><table class="class-table"><thead><tr><th>시간</th><th>활동</th><th>분</th></tr></thead><tbody>'+COURSE.schedule.map(s=>'<tr><td>'+esc(s.range)+'</td><td>'+esc(s.title)+'</td><td>'+s.minutes+'</td></tr>').join('')+'</tbody></table></div>')+
    card('KEY IDEAS','핵심 개념',list(l.concepts))+
    card('LIVE DEMO','강사 시연 시나리오',list(l.demo,true))+
    card('FACILITATOR GUIDE','교수자 발문','<p>원본 자료에 없는 사실은 어디인가? 날짜와 수치를 다른 근거로 확인할 수 있는가? 최종 승인자가 반드시 확인할 항목은 무엇인가?</p>')+
    '<div class="btnline"><button data-present="true" type="button">현재 회차 발표 시작</button><button data-view-target="practice" type="button" class="neutral">현재 회차 실습으로</button></div>';
}
function practice(){
  const l=lesson();
  return head(l.practice)+
    card('STEP 1 · INPUT','가상 실습 원문','<div class="prompt-box">'+esc(l.sample)+'</div>')+
    card('STEP 2 · PROMPT','복사 가능한 실습 프롬프트','<div class="prompt-box" id="currentPrompt">'+esc(l.prompt)+'</div><div class="btnline"><button type="button" data-copy-prompt="true">프롬프트 복사</button></div><p>복사한 뒤 개인 정보가 아닌 가상 데이터로만 연습하고, 대학이 허용한 AI 서비스에서 실행합니다.</p>')+
    card('STEP 3 · HANDS-ON','실습 진행',list(l.steps,true))+
    card('STEP 4 · VERIFY','결과 검증 체크리스트',l.verify.map(item=>'<label class="verify-row"><input type="checkbox" class="verify-check" aria-label="'+esc(item)+'"> '+esc(item)+'</label>').join('')+'<p>체크 상태는 서버에 저장되지 않습니다. 이 화면에서는 수료처리나 자동 평가가 이루어지지 않습니다.</p>')+
    card('STEP 5 · REFLECT','개인 현업 적용 질문','<p>'+esc(l.reflection)+'</p>')+
    card('OFFLINE FALLBACK','AI 접속 불가 시 대체 실습','<p>'+esc(l.offline)+'</p>');
}
function resources(){
  return card('CLASS MATERIALS','웹 강의자료 및 실습 데이터','<p>강의안·시연·실습은 이 강의실에서 바로 열 수 있고 발표·인쇄가 가능합니다. 원본 Word·PowerPoint·강사 이력서는 개인정보 및 배포권한 때문에 이 공개 화면에서 직접 제공하지 않습니다.</p><div class="btnline"><button type="button" data-view-target="lecture">강의안 열기</button><button type="button" data-view-target="practice">실습 워크북 보기</button><a href="./data/sample.csv" download="MNU_AI_Bootcamp_synthetic_data.csv">가상 데이터 CSV 내려받기</a></div>')+
    card('COURSE MATERIAL INDEX','세부 자료 분류',
    '<div class="wide-scroll"><table class="class-table"><thead><tr><th>분류</th><th>구성</th><th>즉시 이용</th></tr></thead><tbody>'+
    '<tr><td>강의</td><td>4회차 핵심 개념·시연·진행표</td><td>발표 모드 / 인쇄</td></tr>'+
    '<tr><td>실습</td><td>4회차 가상 사례·프롬프트·단계</td><td>복사 / 인쇄</td></tr>'+
    '<tr><td>데이터</td><td>A~F 가상 운영실적</td><td>CSV 다운로드</td></tr>'+
    '<tr><td>운영</td><td>6세트×4회 운영표·평가 준거</td><td>CSV 다운로드 / 인쇄</td></tr>'+
    '<tr><td>제출</td><td>강사 이력서·제안서·원본 PPTX·DOCX</td><td>별도 승인된 비공개 저장소에서 관리</td></tr>'+
    '</tbody></table></div>')+
    card('AI OUTPUT QUALITY','검증 4대 원칙',list(['원자료와 사실·날짜·수치를 직접 대조한다','논문·학칙·정책 등은 공식 출처를 다시 연다','학생·교직원 개인 식별자료와 비공개 기록은 업로드하지 않는다','메일 발송·게시·수정·삭제 등은 담당자의 승인을 받는다']))+
    card('RUBRIC','실습 성취기준 (제안)', '<p>문제 정의 0–2점 · 프롬프트 구조 0–2점 · 사실·수치 검증 0–2점 · 개인정보·승인 경계 0–2점. 총 8점 기준으로 6점 이상을 교육 내부 목표로 제안하며, 공식 수료요건은 아닙니다.</p>');
}
function operations(){
  const b=batch();
  const rows=COURSE.batches.flatMap(item=>COURSE.lessons.map(l=>'<tr><td>'+esc(item.id)+'</td><td>'+esc(item.name)+'</td><td>'+l.id+'회</td><td>'+esc(l.title)+'</td><td>120</td><td>미확정</td></tr>')).join('');
  return card('CLASS GROUP','선택된 세트 '+b.id+' · '+b.name,'<p><strong>실습 초점:</strong> '+esc(b.examples)+'</p><p>기본 강의는 동일하게 유지하면서 학습자의 직무에 맞는 가상 사례만 바꿔 운영합니다.</p>')+
    card('SESSION ALLOCATION','24회 운영표 · 총 48시간','<p>교육 일정·강의실·참가자 수는 입력되지 않았습니다. 표에는 실제 교육 일시를 만들어 넣지 않았습니다.</p><div class="wide-scroll"><table class="class-table"><thead><tr><th>세트</th><th>교육집단(예시)</th><th>회차</th><th>강의</th><th>분</th><th>일정</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="btnline"><button type="button" data-export="schedule">운영표 CSV 내려받기</button></div>')+
    card('DELIVERY','강사·사업단 운영분장',list(['사전: 참가자 직무·사용경험 조사, 승인 AI 도구·네트워크·프로젝터 확인','각 회차: 출석·실습 준비·실습물 검증 및 승인 여부 체크','종료: 가상 자료 기준 결과물, 사전·사후 자기평가, 만족도 취합','교육 후: 30일 적용계획은 선택적으로 추적하며 동의 없는 개인정보 수집 금지']))+
    card('MEASUREMENT','실습 성과 지표(제안)','<p>실습 결과물 제출률 · 검증 체크리스트 완료율 · 개인 30일 개선안 작성률 · 만족도 · 교육 전후 자기평가 변화를 측정합니다. 예시 CSV의 인원·점수는 실제 운영 실적이 아닙니다.</p>');
}
function instructor(){
  return card('INSTRUCTOR PROFILE','정찬균 · 교육 강사 제안','<p>경영정보시스템·기술수용 연구와 소상공인 디지털전환·AI 서비스 기획 활동을 연결하여 대학 교직원 실무교육을 설계했습니다. 국립목포대학교 경영학 석사 및 모바일 인스턴트 메시징 기술수용 국제학술지 공동연구 이력을 바탕으로, 설명–시연–실습–검증 방식의 교육을 지향합니다.</p><p>학위·자격·공식 경력의 제출 표기는 증명서와 최종 대조 후 확정합니다.</p>')+
    card('SAFE DOCUMENT FLOW','강사 제출서류는 별도 비공개 관리','<p>개인 연락처·주소·학력 증명서·서명·계좌정보 등이 포함될 수 있는 이력서와 제출서류는 공개 웹 자산에 넣지 않습니다. 원본 이력서·제안서·발표자료는 승인된 운영자 보관소에서 별도 관리하고 필요한 담당자에게만 제출합니다.</p>')+
    card('LOCAL MATERIAL STUDIO','강의안·실습자료 편집 스튜디오','<p>추후 전달받는 강의안과 실습자료에서 텍스트를 추출하고, 회차별 내용·실습 프롬프트를 기기 내에서 수정·미리보기·검증할 수 있습니다. 공개 게시·서버 저장은 제공하지 않으며, 검토용 JSON 초안으로 전달한 뒤 보호된 승인 배포를 거칩니다.</p><div class="btnline"><a href="./studio/">교안 편집 스튜디오 열기 →</a></div>')+
    card('FACILITATION','강의 전날 점검',list(['회차와 세트 선택·프로젝터·오디오·Wi-Fi 확인','대학의 승인 AI 도구 사용정책 확인','가상 CSV 다운로드 및 인쇄 대체자료 준비','AI가 틀렸을 때 검증을 시연하는 예제 준비','대외전송과 개인정보를 배제한 안전한 실습 진행']))+
    card('OPERATING BOUNDARY','상태 안내','<p>여기는 외부 학사 시스템, 성적 시스템, 메일 서비스와 연동되지 않은 교육 콘텐츠 화면입니다. 강의 실습·발표·비민감 가상 자료를 즉시 제공하되, 출석·성적·수료증 발급은 사업단 승인 절차를 거쳐 별도 관리합니다.</p>');
}
const renderers={overview,lecture,practice,resources,operations,instructor};
function render(){
  all('[data-view]').forEach(btn=>{ const active=btn.dataset.view===view;btn.classList.toggle('is-current',active);btn.setAttribute('aria-pressed',String(active));});
  $('#currentView').textContent=menuLabels[view];
  $('#classroomContent').innerHTML=renderers[view]();
  status('');
}
function setView(next){if(!allowedViews.includes(next))return;view=next;render();$('#currentView')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
function setLesson(next){const value=Number(next);if(!COURSE.lessons.some(x=>x.id===value))return;lessonId=value;$('#lessonPicker').value=String(value);render();}
function setBatch(next){if(!COURSE.batches.some(x=>x.id===next))return;batchId=next;$('#batchPicker').value=next;render();}
async function copyPrompt(){
  const value=lesson().prompt;
  try{ if(!navigator.clipboard || !window.isSecureContext)throw new Error('clipboard unavailable');await navigator.clipboard.writeText(value);status('실습 프롬프트를 복사했습니다.');}
  catch{status('브라우저 복사가 차단되었습니다. 아래 입력창에서 복사하세요.');const prompt=window.prompt('실습 프롬프트를 복사하세요',value);void prompt;}
}
function exportCsv(){
  const header=['세트','교육집단_예시','회차','교육제목','분','일정_미확정'];
  const cell=value=>'"'+String(value).replace(/"/g,'""')+'"';
  const rows=COURSE.batches.flatMap(b=>COURSE.lessons.map(l=>[b.id,b.name,l.id,l.title,120,'미확정']));
  const csv='\ufeff'+[header,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='EKODI_MNU_AI_Bootcamp_24_sessions.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('24회 운영표를 내려받았습니다.');
}
function makeSlides(l){
  return [
    {k:'OPENING',t:l.title,p:l.sub,bullets:['핵심 질문: '+l.question,'120분 · 실습 중심 · 가상 자료만 사용','세트 '+batch().id+' · '+batch().name]},
    {k:'LEARNING OBJECTIVES',t:'이번 회차의 목표',bullets:l.objectives},
    {k:'KEY IDEAS',t:'핵심 개념',bullets:l.concepts},
    {k:'DEMONSTRATION',t:'강사가 먼저 보여줍니다',bullets:l.demo},
    {k:'CASE STUDY · FICTIONAL',t:'가상 실습 자료',p:l.sample},
    {k:'PROMPT',t:'함께 작성하는 지시문',p:l.prompt},
    {k:'HANDS-ON',t:'직접 실행해 봅시다',bullets:l.steps},
    {k:'VALIDATION',t:'AI 결과는 반드시 검증합니다',bullets:l.verify},
    {k:'WRAP UP',t:'오늘의 결과물',p:l.outcome,bullets:[l.reflection,'개인정보 금지 · 출처 검증 · 사람의 최종 승인']}
  ];
}
function drawSlide(){
  const item=slides[slideIndex];if(!item)return;
  $('#slideCounter').textContent=(slideIndex+1)+' / '+slides.length;
  $('#slideLessonName').textContent=lessonId+'회차 · '+lesson().title;
  $('#slideContent').innerHTML='<p class="slide-eyebrow">'+esc(item.k)+'</p><h2>'+esc(item.t)+'</h2>'+(item.p?'<p>'+esc(item.p)+'</p>':'')+(item.bullets?list(item.bullets):'');
  $('#prevSlideButton').disabled=slideIndex===0;$('#nextSlideButton').disabled=slideIndex===slides.length-1;
}
function present(){const dialog=$('#presentDialog');if(!dialog || typeof dialog.showModal!=='function'){status('현재 브라우저에서 발표 기능을 지원하지 않습니다. 인쇄 모드를 사용하세요.');return}slides=makeSlides(lesson());slideIndex=0;dialog.showModal();drawSlide();}
function closePresentation(){const dialog=$('#presentDialog');if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});if(dialog.open)dialog.close();}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.view) setView(button.dataset.view);
  else if(button.dataset.lesson){setLesson(button.dataset.lesson);if(button.dataset.viewTarget)setView(button.dataset.viewTarget);}
  else if(button.dataset.viewTarget)setView(button.dataset.viewTarget);
  else if(button.dataset.copyPrompt)copyPrompt();
  else if(button.dataset.export==='schedule')exportCsv();
  else if(button.dataset.present)present();
});
$('#lessonPicker').addEventListener('change',event=>setLesson(event.target.value));
$('#batchPicker').addEventListener('change',event=>setBatch(event.target.value));
$('#presentButton').addEventListener('click',present);
$('#printButton').addEventListener('click',()=>window.print());
$('#closeSlideButton').addEventListener('click',closePresentation);
$('#prevSlideButton').addEventListener('click',()=>{if(slideIndex>0){slideIndex--;drawSlide();}});
$('#nextSlideButton').addEventListener('click',()=>{if(slideIndex<slides.length-1){slideIndex++;drawSlide();}});
$('#fullButton').addEventListener('click',()=>{$('#presentDialog').requestFullscreen?.().catch(()=>status('전체화면을 사용할 수 없습니다.'));});
document.addEventListener('keydown',event=>{
  if(!$('#presentDialog').open)return;
  if(event.key==='ArrowRight'||event.key==='PageDown'){event.preventDefault();if(slideIndex<slides.length-1){slideIndex++;drawSlide();}}
  if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();if(slideIndex>0){slideIndex--;drawSlide();}}
  if(event.key==='Escape'&&document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
});
render();
