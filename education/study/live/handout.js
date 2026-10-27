// EKODI Education Premium Studio — learner handout page (print / PDF / offline file). Public, read-only:
// course data only (never instructor notes), nothing stored or sent.
import {courseEntry} from './courses/registry.js';
import {validateCourse} from './engine/model.js';
import {handoutHtml,handoutDocument} from './engine/handout.js';
import {downloadText,bindChrome,esc} from './engine/render.js';

const $=s=>document.querySelector(s);
const params=new URLSearchParams(location.search);
const entry=courseEntry(params.get('c'));
let course;
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function options(){
  const v=$('#hoSession').value;
  return {sessions:v==='all'?null:[Number(v)],withAnswers:$('#hoAnswers').checked,notes:$('#hoNotes').checked,date:today()};
}
function render(){$('#handout').innerHTML=handoutHtml(course,options());}
async function init(){
  const data=await entry.load();
  course=data.COURSE;validateCourse(course);
  $('#hoSession').insertAdjacentHTML('beforeend',course.sessions.map(s=>'<option value="'+s.no+'">'+s.no+'회차</option>').join(''));
  const s=params.get('s');
  if(s&&course.sessions.some(x=>String(x.no)===s))$('#hoSession').value=s;
  $('#hoBack').href='../?c='+encodeURIComponent(course.id);
  document.title=course.title+' · 수강생 강의자료';
  ['#hoSession','#hoAnswers','#hoNotes'].forEach(id=>$(id).addEventListener('change',render));
  $('#hoPrint').addEventListener('click',()=>window.print());
  $('#hoDownload').addEventListener('click',()=>{
    const v=$('#hoSession').value;
    // ASCII file name: some browsers drop non-ASCII download names and save as 「download」.
    downloadText(document,course.id+'_handout_'+(v==='all'?'all':'session'+v)+'.html',handoutDocument(course,options()),'text/html;charset=utf-8');
  });
  render();
  bindChrome(document,{top:$('#hoTop')});
  document.body.dataset.ready='true';
}
init().catch(error=>{console.error('handout init',error);$('#handout').innerHTML='<p class="notice">강의자료를 불러오지 못했습니다: '+esc(error?.message||error)+'</p>';});
