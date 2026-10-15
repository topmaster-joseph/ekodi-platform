import {PROGRAMS,PROGRAM_SOURCE} from './catalog.js';

const $=selector=>document.querySelector(selector);
const byId=new Map(PROGRAMS.map(p=>[p.id,p]));
let selected=PROGRAMS[0],session=1,presenting=false;
const add=(parent,tag,value,className)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(value!==undefined&&value!==null)node.textContent=String(value);
  parent.append(node);
  return node;
};
const details=(items,parent,showMarkers=true)=>{
  parent.replaceChildren();
  for(const value of items){
    const practice=value.startsWith('[실습]'),sub=value.startsWith('- ');
    const li=add(parent,'li',null,practice?'source-practice':sub?'source-subpoint':'');
    if(practice){
      if(showMarkers)add(li,'span','실습','practice-label');
      add(li,'span',value.slice(4).trim());
    }else add(li,'span',value.replace(/^- /,''));
  }
};
function chooseFromAddress(){
  const url=new URL(window.location.href);
  const id=url.searchParams.get('program');
  selected=byId.get(id)||PROGRAMS[0];
  const num=Number(url.searchParams.get('session')||1);
  session=Number.isInteger(num)&&num>=1&&num<=4?num:1;
}
function syncAddress(){
  const url=new URL(window.location.href);
  url.searchParams.set('program',selected.id);
  url.searchParams.set('session',String(session));
  // The deep link is same-origin and contains public program IDs only.
  window.history.replaceState(null,'',url.pathname+url.search+url.hash);
}
function renderProgramOptions(){
  const el=$('#programOptions');el.replaceChildren();
  for(const program of PROGRAMS){
    const button=add(el,'button',null);
    button.type='button';button.dataset.program=program.id;
    button.setAttribute('aria-pressed',String(program.id===selected.id));
    add(button,'span','PROGRAM '+String(program.number).padStart(2,'0'),'program-choice-code');
    add(button,'span',program.title,'program-choice-name');
    add(button,'span',program.audience,'program-choice-audience');
  }
}
function renderSessionOptions(){
  const el=$('#sessionOptions');el.replaceChildren();
  for(const item of selected.sessions){
    const button=add(el,'button',null);button.type='button';
    button.dataset.session=String(item.number);
    button.setAttribute('aria-pressed',String(session===item.number));
    add(button,'small',String(item.number).padStart(2,'0')+' / 04');
    add(button,'span',item.title||'원문 주제 미기재');
  }
}
function printAll(){
  const p=$('#programPrintAll');p.replaceChildren();
  add(p,'h2',selected.title+' · '+selected.audience);
  add(p,'p','자료 출처: '+PROGRAM_SOURCE.sourceFile+' · 원문 4차시, 일정·시수·교구 제공 조건 미기재');
  for(const item of selected.sessions){
    const section=add(p,'section');
    add(section,'h3',item.number+'차시 · '+(item.title||'원문 주제 미기재'));
    const ul=add(section,'ul');
    for(const line of item.details)add(ul,'li',line);
  }
}
function renderLesson(){
  const item=selected.sessions[session-1];
  $('#programAudience').textContent='PROGRAM '+String(selected.number).padStart(2,'0')+' · '+selected.audience;
  $('#selectedTitle').textContent=selected.title;
  $('#selectedSummary').textContent='첨부 교육프로그램 원문의 4차시 내용을 차시별로 열람합니다.';
  $('#lessonIndex').textContent='SESSION '+String(session).padStart(2,'0')+' / 04';
  $('#lessonTitle').textContent=item.title||'4차시 · 원문 주제 미기재';
  $('#lessonTitleNote').hidden=!!item.title;
  $('#lessonTitleNote').textContent=item.title?'':'첨부 문서의 이 차시에는 주제 제목이 별도로 기재되지 않았습니다. 아래 활동은 원문 그대로 제공합니다.';
  details(item.details,$('#lessonDetails'));
  $('#prevSession').disabled=session===1;
  $('#nextSession').disabled=session===4;
  renderProgramOptions();renderSessionOptions();printAll();syncAddress();
}
function chooseProgram(id){
  if(!byId.has(id))return;
  selected=byId.get(id);session=1;renderLesson();
}
function chooseSession(num){
  if(!Number.isInteger(num)||num<1||num>4)return;
  session=num;renderLesson();
}
function renderPresentation(){
  if(!presenting)return;
  const item=selected.sessions[session-1];
  $('#presentCourseName').textContent=selected.title;
  $('#presentCounter').textContent=session+' / 4';
  $('#presentAudience').textContent='EKODI EDUCATION · '+selected.audience;
  $('#presentTitle').textContent=item.title||'원문 주제 미기재';
  details(item.details,$('#presentDetails'),false);
  $('#presentPrev').disabled=session===1;
  $('#presentNext').disabled=session===4;
}
function openPresentation(){
  const dialog=$('#programPresentation');
  if(typeof dialog.showModal!=='function')return;
  presenting=true;dialog.showModal();renderPresentation();
}
function closePresentation(){
  presenting=false;
  if($('#programPresentation').open)$('#programPresentation').close();
}
$('#programOptions').addEventListener('click',event=>{
  const button=event.target.closest('button[data-program]');
  if(button)chooseProgram(button.dataset.program);
});
$('#sessionOptions').addEventListener('click',event=>{
  const button=event.target.closest('button[data-session]');
  if(button)chooseSession(Number(button.dataset.session));
});
$('#prevSession').addEventListener('click',()=>chooseSession(session-1));
$('#nextSession').addEventListener('click',()=>chooseSession(session+1));
$('#programPrint').addEventListener('click',()=>window.print());
$('#programPresent').addEventListener('click',openPresentation);
$('#closePresentation').addEventListener('click',closePresentation);
$('#programPresentation').addEventListener('close',()=>{presenting=false});
$('#presentPrev').addEventListener('click',()=>{chooseSession(session-1);renderPresentation()});
$('#presentNext').addEventListener('click',()=>{chooseSession(session+1);renderPresentation()});
document.addEventListener('keydown',event=>{
  if(!presenting)return;
  if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();chooseSession(session-1);renderPresentation()}
  if(event.key==='ArrowRight'||event.key==='PageDown'){event.preventDefault();chooseSession(session+1);renderPresentation()}
});
window.addEventListener('popstate',()=>{chooseFromAddress();renderLesson();renderPresentation()});
chooseFromAddress();renderLesson();
