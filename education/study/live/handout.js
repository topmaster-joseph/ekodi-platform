// EKODI Education Premium Studio — learner materials page: lecture slides (A4 landscape), lecture summary
// (A4 portrait) and the optional practice materials. Public and read-only for anyone with the link:
// course data only (never instructor notes or answer keys), nothing stored or sent.
import {courseEntry} from './courses/registry.js';
import {validateCourse,learnerUrl,livePath} from './engine/model.js';
import {handoutHtml,handoutDocument,deckSlides,practiceHtml,practiceDocument} from './engine/handout.js';
import {downloadText,bindChrome,esc,slideHtml} from './engine/render.js';
import {qrSvg} from './engine/qr.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const params=new URLSearchParams(location.search);
const entry=courseEntry(params.get('c'));
const MODES=['slides','summary','practice'];
let course,mode=MODES.includes(params.get('mode'))?params.get('mode'):'slides';
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const sessionsSel=()=>{const v=$('#hoSession').value;return v==='all'?null:[Number(v)];};
const HINTS={
  slides:'강의 화면과 같은 가로형 슬라이드입니다. 「인쇄 · PDF 저장」에서 가로 방향 A4로 인쇄되며, 프린터 대신 「PDF로 저장」을 고르면 파일로 받습니다.',
  summary:'강의 내용만 요약한 세로형 A4 자료입니다(실습자료 제외).',
  practice:'내 분야·난이도에 맞춘 가상 실습 원문과 프롬프트입니다. 모든 자료는 가상이며, 실제 개인정보는 넣지 마세요.'
};

function slidesMarkup(){
  const assetBase=livePath(location.pathname,'');
  return deckSlides(course,{sessions:sessionsSel()}).map(s=>{
    const url=learnerUrl(location.origin,location.pathname,{c:course.id,s:s.sessionNo,m:s.missionId||'',lv:'basic'});
    const html=slideHtml(s,{joinSvg:s.special==='join'?qrSvg(url,{label:'수강생 실습실 접속 QR'}):'',joinUrl:url,timerText:'',
      sessionLabel:course.subtitle+' · '+s.sessionNo+'회차',instructor:course.instructor,assetBase});
    return '<div class="stage-frame ho-slide">'+html+'</div>';
  }).join('');
}
function options(){
  return {sessions:sessionsSel(),withAnswers:$('#hoAnswers').checked,notes:$('#hoNotes').checked,
    trackId:$('#hoTrack').value,levelId:$('#hoLevel').value,date:today()};
}
function render(){
  document.body.dataset.hoMode=mode;
  $$('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on));});
  $$('[data-for]').forEach(el=>{el.hidden=el.dataset.for!==mode;});
  $('#hoHint').textContent=HINTS[mode];
  const box=$('#handout');
  box.className=mode==='slides'?'ho-deck':'ho-page';
  box.innerHTML=mode==='slides'?slidesMarkup():mode==='practice'?practiceHtml(course,options()):handoutHtml(course,options());
  $('#hoDownload').textContent=mode==='slides'?'PDF로 저장':'파일 내려받기';
}
function download(){
  if(mode==='slides'){window.print();return;}
  const v=$('#hoSession').value,tag=v==='all'?'all':'session'+v;
  // ASCII file names: some browsers drop non-ASCII download names and save as 「download」.
  if(mode==='practice')downloadText(document,course.id+'_practice_'+$('#hoTrack').value+'_'+tag+'.html',practiceDocument(course,options()),'text/html;charset=utf-8');
  else downloadText(document,course.id+'_handout_'+tag+'.html',handoutDocument(course,options()),'text/html;charset=utf-8');
}
async function init(){
  const data=await entry.load();
  course=data.COURSE;validateCourse(course);
  $('#hoSession').insertAdjacentHTML('beforeend',course.sessions.map(s=>'<option value="'+s.no+'">'+s.no+'회차</option>').join(''));
  $('#hoTrack').innerHTML=course.tracks.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.label)+'</option>').join('');
  $('#hoLevel').innerHTML=course.levels.map(l=>'<option value="'+esc(l.id)+'"'+(l.id==='basic'?' selected':'')+'>'+esc(l.label)+'</option>').join('');
  const s=params.get('s');
  if(s&&course.sessions.some(x=>String(x.no)===s))$('#hoSession').value=s;
  const t=params.get('t');if(t&&course.tracks.some(x=>x.id===t))$('#hoTrack').value=t;
  $('#hoBack').href=livePath(location.pathname,'lab'+String.fromCharCode(47))+'?c='+encodeURIComponent(course.id)+(s?'&s='+encodeURIComponent(s):'');
  document.title=course.title+' · 강의자료';
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render();}));
  ['#hoSession','#hoAnswers','#hoNotes','#hoTrack','#hoLevel'].forEach(id=>$(id).addEventListener('change',render));
  $('#hoPrint').addEventListener('click',()=>window.print());
  $('#hoDownload').addEventListener('click',download);
  render();
  bindChrome(document,{top:$('#hoTop')});
  document.body.dataset.ready='true';
}
init().catch(error=>{console.error('handout init',error);$('#handout').innerHTML='<p class="notice">강의자료를 불러오지 못했습니다: '+esc(error?.message||error)+'</p>';});
