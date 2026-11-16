// 강의 피드백: 차수별 QR(투사용) + 응답 요약 (instructor-only; summary API needs the instructor session).
import {qrSvg} from '../engine/qr.js';
import {SESSIONS} from './data.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SCORE={overall:'전반 만족도',practice:'실습 업무 도움',clarity:'설명·시연 이해',apply:'업무 활용 의향'};
const FIELD={planning:'기획·평가',academic:'학사·교무',student:'학생지원·취업',research:'연구·산학협력',admin:'총무·회계',outreach:'홍보·국제·입학',facility:'시설·도서관·전산',other:'선택 안 함'};
const USEFUL={hwp:'HWP 편집기',minutes:'회의록',ppt:'프레젠테이션',chat:'채팅',research:'Deep Research',screen:'실습 화면 공유'};
const ORIGIN='https://ekodi.kr';
let current=Number(new URLSearchParams(location.search).get('s'))||1;
const surveyUrl=n=>ORIGIN+'/edu/study/live/feedback/?s='+n;
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{t.hidden=true},1600);}
function tabs(){$('#fTabs').innerHTML=SESSIONS.map(s=>'<button type="button" class="g-tab" role="tab" aria-selected="'+(s.no===current)+'" data-s="'+s.no+'"><b>'+s.no+'차</b><small>'+s.date.slice(5).replace('-','.')+'('+s.day+') '+s.slot+'</small></button>').join('');}
function qr(){
  const s=SESSIONS.find(x=>x.no===current);const url=surveyUrl(current);
  $('#fQr').innerHTML=qrSvg(url,{label:current+'차 강의 피드백 설문 QR'});
  $('#fQrTitle').textContent=current+'차 · '+s.date.slice(5).replace('-','.')+'('+s.day+') '+s.slot+' 강의 피드백';
  $('#fQrUrl').textContent=url;
}
function bar(label,value,max,suffix=''){const w=max?Math.round(value/max*100):0;return '<div class="f-bar"><span class="f-label">'+esc(label)+'</span><span class="f-track"><span class="f-fill" data-w="'+w+'"></span></span><b>'+esc(value+suffix)+'</b></div>';}
async function load(){
  const all=$('#fAll').checked;$('#fResult').innerHTML='<p class="meta">불러오는 중…</p>';
  try{
    const r=await fetch('../feedback/api/summary?c=mnu-factchat-2026&s='+(all?'all':current),{credentials:'same-origin',cache:'no-store'});
    const d=await r.json();
    if(r.status===401){$('#fResult').innerHTML='<p class="notice">강사 로그인이 필요합니다. 강의안 잠금 화면에서 다시 열어 주세요.</p>';return;}
    if(!d.ok)throw Error(d.code);
    $('#fCount').textContent=(all?'전체':current+'차')+' 응답 '+d.count+'명';
    if(!d.count){$('#fResult').innerHTML='<p class="meta">아직 응답이 없습니다.</p>';return;}
    let h='<h3>평균 점수 (5점 만점)</h3>'+Object.entries(SCORE).map(([k,l])=>bar(l,d.avg[k]??0,5,'점')).join('');
    if(all)h+='<h3>차수별 응답 수</h3>'+SESSIONS.map(s=>bar(s.no+'차',d.bySession[s.no]||0,Math.max(...Object.values(d.bySession),1),'명')).join('');
    const fmax=Math.max(...Object.values(d.fields),1);h+='<h3>응답자 업무 분야</h3>'+Object.entries(d.fields).sort((a,b)=>b[1]-a[1]).map(([k,v])=>bar(FIELD[k]||k,v,fmax,'명')).join('');
    const umax=Math.max(...Object.values(d.useful),1);h+='<h3>가장 유용했던 기능</h3>'+(Object.keys(d.useful).length?Object.entries(d.useful).sort((a,b)=>b[1]-a[1]).map(([k,v])=>bar(USEFUL[k]||k,v,umax,'명')).join(''):'<p class="meta">선택 없음</p>');
    for(const [k,l] of [['good','좋았던 점'],['improve','아쉬운 점·개선'],['next','더 배우고 싶은 주제']])h+='<h3>'+l+' <small>'+d.comments[k].length+'건</small></h3>'+(d.comments[k].length?'<ul class="g-list">'+d.comments[k].map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>':'<p class="meta">없음</p>');
    $('#fResult').innerHTML=h;
    for(const el of document.querySelectorAll('[data-w]'))el.style.width=el.dataset.w+'%';
  }catch{$('#fResult').innerHTML='<p class="notice">결과를 불러오지 못했습니다. 새로고침을 눌러 주세요.</p>';}
}
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-s]');if(t){current=+t.dataset.s;try{history.replaceState(null,'','?s='+current)}catch{}tabs();qr();load();return;}
  if(e.target.closest('#fRefresh'))load();
  if(e.target.closest('#fCopy'))navigator.clipboard?.writeText(surveyUrl(current)).then(()=>toast('주소를 복사했습니다')).catch(()=>toast('주소를 길게 눌러 복사하세요'));
  if(e.target.closest('#fFull'))$('.f-qr-card').requestFullscreen?.().catch(()=>{});
});
$('#fAll').addEventListener('change',load);
tabs();qr();load();
