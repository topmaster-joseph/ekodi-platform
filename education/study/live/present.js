// EKODI Education Premium Studio — Live Presentation (presenter + audience views).
import {courseEntry} from './courses/registry.js';
import {validateCourse,sessionByNo,sessionSlides,learnerUrl,formatClock,livePath} from './engine/model.js';
import {createLiveStore,lectureElapsedMs,timerRemainingMs,timerPhase,CHANNEL_NAME} from './engine/live-state.js';
import {qrSvg} from './engine/qr.js';
import {esc,list,slideHtml,safeStorage,safeChannel,bindChrome} from './engine/render.js';

const $=s=>document.querySelector(s);
const params=new URLSearchParams(location.search);
const audience=params.get('view')==='audience';
const entry=courseEntry(params.get('c'));
const storage=safeStorage(window);
const channel=safeChannel(window,CHANNEL_NAME);
let course,notes={},store,slides=[],showNotes=true,toastTimer=0,lastKey='';

const S=()=>store.state;
const session=()=>sessionByNo(course,S().session)||course.sessions[0];
function toast(text){const el=$('#toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},2600);}
function currentSlide(){return slides[Math.min(S().slideIndex,slides.length-1)];}
function moduleOf(slide){return session().modules.find(m=>m.id===slide?.moduleId)||session().modules[0];}
function joinLink(slide){
  const st=S(),m=moduleOf(slide);
  const missionId=slide?.missionId||(st.shared.missionId&&course.missions[st.shared.missionId]?st.shared.missionId:(m.kind==='practice'?m.missionId:''));
  return learnerUrl(location.origin,location.pathname,{c:course.id,s:st.session,m:missionId,lv:st.shared.level||'basic',e:st.timer.status==='running'?st.timer.endsAt:0});
}
function slideMarkup(slide,{forPrint=false}={}){
  const st=S();
  const url=joinLink(slide);
  const timer=st.timer.status==='idle'?formatClock(((moduleOf(slide)?.end||10)-(moduleOf(slide)?.start||0))*60000):formatClock(timerRemainingMs(st,Date.now()));
  return slideHtml(slide,{joinSvg:slide?.special==='join'?qrSvg(url,{label:'수강생 실습실 접속 QR'}):'',joinUrl:url,timerText:forPrint?'':timer,sessionLabel:course.subtitle+' · '+st.session+'회차',instructor:course.instructor,assetBase:livePath(location.pathname,'')});
}
function render(){
  const st=S(),slide=currentSlide();
  const key=st.session+':'+st.slideIndex+':'+st.timer.status+':'+st.timer.endsAt+':'+st.shared.missionId+':'+st.shared.level;
  const stage=$('#stage');
  stage.classList.toggle('is-black',st.blackout);
  if(key!==lastKey){stage.innerHTML=slideMarkup(slide);lastKey=key;}
  if(audience)return;
  $('#presSession').textContent=course.subtitle+' · '+st.session+'회차';
  $('#presCounter').textContent=(st.slideIndex+1)+' / '+slides.length;
  $('#pPrev').disabled=st.slideIndex<=0;$('#pNext').disabled=st.slideIndex>=slides.length-1;
  $('#pBlack').setAttribute('aria-pressed',String(st.blackout));$('#pBlack').textContent=st.blackout?'다시 표시':'가리기';
  const m=moduleOf(slide);
  const n=notes[m.id];
  $('#presNotes').innerHTML=n?'<div class="notes">'+(n.talk?.length?'<h4>진행 멘트</h4>'+list(n.talk):'')+(n.demo?.length?'<h4>시연 순서</h4>'+list(n.demo,true):'')+(n.cues?.length?'<h4>시간 신호</h4>'+list(n.cues):'')+(n.answer?'<h4>정답</h4><p>'+esc(n.answer)+'</p>':'')+'</div>':'<p class="kbd">노트 없음</p>';
  const next=slides[st.slideIndex+1];
  $('#nextSlide').innerHTML=next?'<div class="stage-frame">'+slideMarkup(next)+'</div>':'<p class="kbd">마지막 슬라이드</p>';
  const practice=m.kind==='practice'?course.missions[m.missionId]:null;
  const running=st.timer.status!=='idle'&&st.timer.missionId&&(!practice||st.timer.missionId===practice.id);
  $('#pPractice').textContent=practice?(running?'실습 종료':'실습 시작 '+practice.minutes+'분'):'실습 단계 아님';
  $('#pPractice').disabled=!practice;
  $('#presSync').textContent=channel?'강사 운영실·청중 창과 실시간 동기화 중':'창 간 실시간 동기화 미지원 — 수동 동기화 사용';
  tick();
}
function tick(){
  const st=S(),now=Date.now();
  if(!audience){
    $('#presLecture').textContent=formatClock(lectureElapsedMs(st,now));
    const phase=timerPhase(st,now);
    const text=st.timer.status==='idle'?'--:--':formatClock(timerRemainingMs(st,now));
    $('#presTimer').textContent=text;$('#presTimerTop').textContent=text;
    $('#presTimer').className='big-clock '+(['warn','final','done'].includes(phase)?phase:'');
    $('#presTimerInfo').textContent={idle:'대기 중',running:'진행 중',paused:'일시정지',warn:'종료 5분 전',final:'종료 1분 전',done:'종료'}[phase];
    $('#pPause').textContent=st.timer.status==='paused'?'재개':'일시정지';$('#pPause').disabled=st.timer.status==='idle';
  }
  const timerEl=document.querySelector('[data-slide-timer]');
  if(timerEl&&st.timer.status!=='idle')timerEl.textContent=formatClock(timerRemainingMs(st,now));
}
function setSlide(i){
  const index=Math.max(0,Math.min(slides.length-1,i));
  const target=slides[index];
  const moduleIndex=session().modules.findIndex(m=>m.id===target.moduleId);
  store.dispatch({type:'slide/set',index,moduleIndex:moduleIndex<0?S().moduleIndex:moduleIndex});
}
function togglePractice(){
  const m=moduleOf(currentSlide());if(m.kind!=='practice')return;
  const mission=course.missions[m.missionId];const st=S();
  if(st.timer.status!=='idle'&&st.timer.missionId===mission.id){store.dispatch({type:'timer/reset'});toast('실습을 종료했습니다.');return;}
  store.dispatch({type:'timer/start',missionId:mission.id,durationMs:mission.minutes*60000});
  if(st.lecture.status!=='running')store.dispatch({type:'lecture/start'});
  const joinIdx=slides.findIndex(s=>s.moduleId===m.id&&s.special==='join');
  if(joinIdx>=0)setSlide(joinIdx);
  toast(mission.title+' 시작');
}
function fullscreen(){
  const el=audience?document.documentElement:$('#stage');
  if(document.fullscreenElement){document.exitFullscreen?.().catch(()=>{});return;}
  (el.requestFullscreen?el.requestFullscreen():Promise.reject()).catch(()=>toast('이 브라우저에서는 전체화면을 사용할 수 없습니다.'));
}
function printDeck(){
  const deck=$('#printDeck');
  deck.innerHTML=slides.map(s=>'<div class="stage-frame">'+slideMarkup(s,{forPrint:true})+'</div>').join('');
  document.body.classList.add('printing-deck');
  const done=()=>{document.body.classList.remove('printing-deck');deck.innerHTML='';window.removeEventListener('afterprint',done);};
  window.addEventListener('afterprint',done);
  window.print();
  setTimeout(()=>{if(document.body.classList.contains('printing-deck')&&!matchMedia('print').matches)done();},60000);
}
function bind(){
  document.addEventListener('keydown',e=>{
    if(e.target.closest('input,select,textarea'))return;
    const k=e.key;
    if(k==='ArrowRight'||k==='PageDown'||k===' '){e.preventDefault();setSlide(S().slideIndex+1);}
    else if(k==='ArrowLeft'||k==='PageUp'){e.preventDefault();setSlide(S().slideIndex-1);}
    else if(k==='Home'){e.preventDefault();setSlide(0);}
    else if(k==='End'){e.preventDefault();setSlide(slides.length-1);}
    else if(k==='b'||k==='B'||k==='.'){e.preventDefault();store.dispatch({type:'blackout/toggle'});}
    else if(k==='f'||k==='F'){e.preventDefault();fullscreen();}
    else if((k==='n'||k==='N')&&!audience){e.preventDefault();toggleNotes();}
  });
  window.addEventListener('storage',e=>store.onStorage(e));
  if(audience)return;
  $('#pPrev').addEventListener('click',()=>setSlide(S().slideIndex-1));
  $('#pNext').addEventListener('click',()=>setSlide(S().slideIndex+1));
  $('#pBlack').addEventListener('click',()=>store.dispatch({type:'blackout/toggle'}));
  $('#pFull').addEventListener('click',fullscreen);
  $('#pPractice').addEventListener('click',togglePractice);
  $('#pPause').addEventListener('click',()=>store.dispatch({type:S().timer.status==='paused'?'timer/resume':'timer/pause'}));
  $('#pStop').addEventListener('click',()=>{store.dispatch({type:'timer/reset'});toast('실습 타이머를 종료했습니다.');});
  document.querySelector('[data-add]').addEventListener('click',e=>store.dispatch({type:'timer/add',ms:Number(e.currentTarget.dataset.add)}));
  $('#pAudience').addEventListener('click',()=>{const w=window.open(location.pathname+'?c='+encodeURIComponent(course.id)+'&view=audience','ekodi-edu-audience','noopener');if(!w)toast('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 누르세요.');else toast('청중 화면 창을 프로젝터로 옮긴 뒤 F 키로 전체화면을 켜세요.');});
  $('#pNotes').addEventListener('click',toggleNotes);
  $('#pPrint').addEventListener('click',printDeck);
  $('#pSync').addEventListener('click',()=>{store.resync();lastKey='';render();toast('최신 상태로 동기화했습니다.');});
  $('#backStudio').href=livePath(location.pathname,'?c='+encodeURIComponent(course.id));
}
function toggleNotes(){
  showNotes=!showNotes;
  $('#presSide').hidden=!showNotes;
  $('#presMain').classList.toggle('single',!showNotes);
  $('#pNotes').setAttribute('aria-pressed',String(showNotes));$('#pNotes').textContent=showNotes?'노트 숨기기':'노트 보이기';
  if(!showNotes)toast('단일 화면 모드: N 키로 노트를 다시 엽니다.');
}
async function init(){
  const [data,noteMod]=await Promise.all([entry.load(),audience?Promise.resolve({NOTES:{}}):(entry.loadNotes?entry.loadNotes():Promise.resolve({NOTES:{}}))]);
  course=data.COURSE;validateCourse(course);notes=noteMod.NOTES||{};
  if(audience){
    document.body.classList.remove('pres-body');document.body.classList.add('audience-body');document.body.dataset.liveSurface='audience';
    // Projector output: no shared header, spacer or footer on top of the slides.
    document.body.dataset.ekodiUserHeader='immersive';
    $('#presTop').hidden=true;$('#presSide').remove();
    const main=$('#presMain');main.className='audience';main.querySelector('.stage').className='';
    document.title='청중 화면 · EKODI Education';
  }
  store=createLiveStore({courseId:course.id,storage,channel,onChange:state=>{slides=sessionSlides(course,state.session);render();}});
  slides=sessionSlides(course,S().session);
  const qs=Number(params.get('s'));
  if(!audience&&sessionByNo(course,qs)&&qs!==S().session)store.dispatch({type:'session/set',session:qs});
  bind();render();
  if(!audience)bindChrome(document,{top:$('#presTop')});
  setInterval(tick,500);
  document.body.dataset.ready='true';
}
init().catch(error=>{console.error('presenter init',error);$('#stage').innerHTML='<div class="slide"><h2 class="slide-title">발표 화면을 불러오지 못했습니다</h2><p class="slide-lead">'+esc(error?.message||error)+'</p></div>';});
