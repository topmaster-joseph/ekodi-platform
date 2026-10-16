import {AUDIENCES,FORMATS,CONSULTING,audienceFor,buildPlan,planMarkdown,consultationDraft} from './catalog.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const FORM_IDS=['audience','title','program','host','topic','delivery','sessions','minutes','practicePercent','start','end'];
let plan=null,slideIndex=0,consultText='';
const lesson=()=>plan?.lessons[Number($('sessionPicker').value)||0];
function settings(){const result={};for(const id of FORM_IDS)result[id]=$(id).value;return result;}
function notice(id,text){$(id).textContent=text;}
function download(name,mime,text){
 const blob=new Blob([text],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function copy(value,id){try{if(!navigator.clipboard?.writeText)throw Error('unavailable');await navigator.clipboard.writeText(value);notice(id,'클립보드에 복사했습니다.');}catch{notice(id,'브라우저 복사가 차단되었습니다. 내용을 직접 선택해 복사해 주세요.');}}
function renderAudience(){
 $('audienceGrid').innerHTML=AUDIENCES.map(a=>'<button type="button" class="audience-tile" data-audience="'+esc(a.id)+'" aria-pressed="'+(a.id===$('audience').value)+'"><strong>'+esc(a.name)+'</strong><span>'+esc(a.sub)+'</span></button>').join('');
 document.querySelectorAll('[data-audience]').forEach(button=>button.addEventListener('click',()=>{
  setAudience(button.dataset.audience);
  $('builder').scrollIntoView({behavior:'smooth',block:'start'});
 }));
}
function setAudience(id,keepTitle=false){
 const audience=audienceFor(id);
 $('audience').value=audience.id;
 if(!keepTitle)$('title').value=audience.name+'를 위한 AI 실습교육';
 if(!$('topic').value||!keepTitle)$('topic').value=audience.sub;
 renderAudience();renderPlan();
}
function renderPlan(){
 const oldIndex=Number($('sessionPicker').value)||0;
 plan=buildPlan(settings());
 $('planSummary').innerHTML=[
  [plan.audience,'교육 대상'],
  [plan.sessions+'회','총 운영 회차'],
  [plan.totalMinutes+'분','총 강의 시간'],
  [plan.practicePercent+'%','실습 비중']
 ].map(([value,label])=>'<article><b>'+esc(value)+'</b><small>'+esc(label)+'</small></article>').join('');
 $('sessionPicker').innerHTML=plan.lessons.map((item,i)=>'<option value="'+i+'">'+item.number+'회차 · '+esc(item.title)+'</option>').join('');
 $('sessionPicker').selectedIndex=Math.min(oldIndex,plan.lessons.length-1);
 renderLesson();
 notice('builderStatus','가상 실습 중심 '+plan.sessions+'회차 교육안을 구성했습니다. 실제 일정과 사업 요건은 담당 기관 확인이 필요합니다.');
 return plan;
}
function renderLesson(){
 const item=lesson();if(!item)return;
 $('lessonView').innerHTML='<article class="lesson-display"><p class="eyebrow">'+esc(plan.audience)+' · '+item.number+'회차</p><h3>'+esc(item.title)+'</h3>'+
 '<div class="lesson-meta"><span>회당 '+plan.minutes+'분</span><span>실습 '+item.practiceMinutes+'분</span><span>'+esc(plan.delivery)+'</span></div>'+
 '<p><strong>실습 상황</strong> · '+esc(item.scenario)+'</p><p><strong>결과물</strong> · '+esc(item.artifact)+'</p>'+
 '<p><strong>검증 기준</strong> · '+esc(item.checkpoint)+'</p><p><strong>복사 가능한 실습 지시문</strong></p>'+
 '<div class="prompt-example">'+esc('대상: '+plan.audience+'\n맞춤 주제: '+plan.topic+'\n실습 상황: '+item.scenario+'\n지시: '+item.prompt+'\n최종 결과물: '+item.artifact+'\n결과는 제공된 가상자료로만 작성하고 사실·출처를 직접 확인하세요.')+'</div></article>';
 notice('practiceStatus','실습 기록은 회차를 바꾸거나 화면을 닫으면 사라질 수 있습니다. 필요한 결과물은 파일로 저장하세요.');
 $('practiceInput').value='';$('practiceOutput').value='';
}
function promptText(){const item=lesson();return item?'대상: '+plan.audience+'\n주제: '+plan.topic+'\n상황: '+item.scenario+'\n'+item.prompt+'\n산출물: '+item.artifact+'\n검증: '+item.checkpoint:'';}
function slides(){const item=lesson();return item?[
 {title:item.number+'회차 · '+item.title,body:'대상: '+plan.audience+'\n핵심 주제: '+plan.topic+'\n형식: '+plan.delivery+'\n총 '+plan.minutes+'분 / 실습 '+item.practiceMinutes+'분'},
 {title:'오늘 해결할 문제',body:item.scenario+'\n\n최종 결과물: '+item.artifact},
 {title:'직접 해보는 실습',body:item.prompt},
 {title:'검증하고 개선하기',body:'체크: '+item.checkpoint+'\n원본과 숫자·출처 대조, 개인정보 미입력, 최종 담당자 확인\n\n완성 결과: '+item.artifact}
 ]:[];}
function showSlide(){
 const items=slides(),current=items[slideIndex];if(!current)return;
 $('presentationTitle').textContent=plan.title;
 $('presentationCount').textContent=(slideIndex+1)+' / '+items.length+' · '+lesson().number+'회차';
 $('presentationHeading').textContent=current.title;
 $('presentationBody').textContent=current.body;
 $('previousSlide').disabled=slideIndex===0;$('nextSlide').disabled=slideIndex===items.length-1;
}
function renderConsulting(){
 $('consultTypes').innerHTML=CONSULTING.map(row=>'<article class="consult-card"><h3>'+esc(row.name)+'</h3><strong>'+esc(row.duration)+'</strong><p>'+esc(row.description)+'</p></article>').join('');
 $('consultType').innerHTML=CONSULTING.map(row=>'<option value="'+esc(row.id)+'">'+esc(row.name)+'</option>').join('');
}
function formConsultation(){
 consultText=consultationDraft({type:$('consultType').value,audience:$('audience').value,delivery:$('consultDelivery').value,program:$('program').value,question:$('consultQuestion').value});
 $('consultDraft').textContent=consultText;
}
function init(){
 $('audience').innerHTML=AUDIENCES.map(row=>'<option value="'+esc(row.id)+'">'+esc(row.name)+'</option>').join('');
 renderConsulting();
 const requested=new URLSearchParams(location.search).get('audience');
 setAudience(audienceFor(requested).id);
 $('builderForm').addEventListener('submit',event=>{event.preventDefault();renderPlan();});
 $('audience').addEventListener('change',()=>setAudience($('audience').value));
 $('sessionPicker').addEventListener('change',renderLesson);
 $('promptCopy').addEventListener('click',()=>copy(promptText(),'practiceStatus'));
 $('checkPractice').addEventListener('click',()=>{
  const a=$('practiceInput').value.trim(),b=$('practiceOutput').value.trim();
  notice('practiceStatus',a.length>=15&&b.length>=15?'실습 메모와 결과를 확인했습니다. '+lesson().checkpoint+' 기준으로 직접 검증하세요. 실제 평가·제출·수료 처리되지 않습니다.':'실습 내용과 결과를 각각 15자 이상 작성해야 자체 점검할 수 있습니다.');
 });
 $('exportPractice').addEventListener('click',()=>{
  const item=lesson(),md=['# '+plan.title+' · '+item.number+'회차 실습 기록','','- 실습 과제: '+item.scenario,'- 검증: '+item.checkpoint,'','## 실습 메모',$('practiceInput').value,'','## 결과·수정',$('practiceOutput').value,'','※ 브라우저에서 저장한 개인 파일이며 서버 제출이 아닙니다.'].join('\n');
  download('ekodi-practice-'+item.number+'.md','text/markdown;charset=utf-8',md);
 });
 $('exportMarkdown').addEventListener('click',()=>download('ekodi-education-plan.md','text/markdown;charset=utf-8',planMarkdown(plan)));
 $('exportJson').addEventListener('click',()=>download('ekodi-education-plan.json','application/json;charset=utf-8',JSON.stringify({schema:'ekodi-academy-v1',settings:settings()},null,2)));
 $('importJson').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
   if(file.size>65536)throw Error('파일 용량은 64KB 이하로 제한됩니다.');
   const imported=JSON.parse(await file.text());
   if(imported?.schema!=='ekodi-academy-v1'||!imported.settings||typeof imported.settings!=='object'||Array.isArray(imported.settings))throw Error('지원하지 않는 설정 형식입니다.');
   const values=imported.settings;
   if(!AUDIENCES.some(a=>a.id===values.audience))throw Error('알 수 없는 교육 대상입니다.');
   if(!FORMATS.some(f=>f.id===values.delivery))throw Error('알 수 없는 강의 방식입니다.');
   for(const id of FORM_IDS)if(typeof values[id]==='string')$(id).value=values[id].slice(0,180);
   renderAudience();renderPlan();
   notice('builderStatus','교육 설정 JSON을 불러왔습니다. 내용과 기간을 다시 검토하세요.');
  }catch(e){notice('builderStatus','불러오기 실패: '+e.message);}finally{event.target.value='';}
 });
 const dialog=$('presentationDialog');
 $('presentationButton').addEventListener('click',()=>{slideIndex=0;showSlide();if(!dialog.open)dialog.showModal();});
 $('closePresentation').addEventListener('click',()=>dialog.close());
 $('previousSlide').addEventListener('click',()=>{slideIndex=Math.max(0,slideIndex-1);showSlide();});
 $('nextSlide').addEventListener('click',()=>{slideIndex=Math.min(slides().length-1,slideIndex+1);showSlide();});
 dialog.addEventListener('keydown',event=>{
  if(event.key==='ArrowRight'){event.preventDefault();slideIndex=Math.min(slides().length-1,slideIndex+1);showSlide();}
  if(event.key==='ArrowLeft'){event.preventDefault();slideIndex=Math.max(0,slideIndex-1);showSlide();}
 });
 $('consultForm').addEventListener('submit',event=>{event.preventDefault();formConsultation();});
 $('copyConsulting').addEventListener('click',()=>{if(!consultText)formConsultation();copy(consultText,'builderStatus');});
}
init();
