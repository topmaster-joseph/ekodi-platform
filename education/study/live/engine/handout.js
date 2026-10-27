// EKODI Education Live — learner handout (강의자료) for printing.
// Lecture content only: cover, timetable, lecture/demo/review/share modules (summary, key points, learner
// tasks), the FactChat features shown in class and the OX quiz, with space for notes.
// Practice materials are deliberately excluded: no virtual source texts, prompts, practice steps, criteria,
// field tracks or AI error-hunt exercises. Instructor notes and answer keys are never read here.
import {KIND_LABELS} from './model.js';
import {featureById} from '../tools/factchat.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ul=items=>items?.length?'<ul>'+items.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul>':'';
const LECTURE_KINDS=new Set(['lecture','demo','review','share']);

function timetable(session){
  return '<table class="ho-table"><thead><tr><th scope="col">시간</th><th scope="col">구분</th><th scope="col">내용</th></tr></thead><tbody>'+
    session.modules.map(m=>'<tr><td>'+m.start+'–'+m.end+'분</td><td>'+esc(KIND_LABELS[m.kind]||m.kind)+'</td><td>'+esc(m.title)+
      (m.kind==='practice'?' <span class="ho-muted">— 실습실(QR)에서 진행 · 실습자료는 화면으로 제공</span>':'')+'</td></tr>').join('')+
    '</tbody></table>';
}
function featureBlock(ids){
  const rows=(ids||[]).map(featureById).filter(Boolean);
  if(!rows.length)return '';
  return '<div class="ho-features"><h4>오늘 보는 FactChat 기능</h4><dl>'+rows.map(f=>'<dt>'+esc(f.label)+(f.pcOnly?' <span class="ho-tag">PC 전용</span>':'')+'</dt><dd>'+esc(f.summary)+
    (f.where?'<br><span class="ho-muted">위치: '+esc(f.where)+'</span>':'')+'</dd>').join('')+'</dl></div>';
}
function quizBlock(course,withAnswers){
  if(!course.quiz?.length)return '';
  return '<div class="ho-quiz"><h4>OX 퀴즈</h4><ol>'+course.quiz.map(q=>'<li><span class="ho-ox" aria-hidden="true">O · X</span> '+esc(q.q)+
    (withAnswers?'<div class="ho-answer">정답 '+(q.a?'O':'X')+' — '+esc(q.why)+'</div>':'')+'</li>').join('')+'</ol></div>';
}
function moduleBlock(course,m,{withAnswers,notes}){
  const parts=['<p class="ho-kicker">'+m.start+'–'+m.end+'분 · '+esc(KIND_LABELS[m.kind]||'')+'</p><h3>'+esc(m.title)+'</h3>'];
  if(m.hook?.q)parts.push('<p class="ho-hook">「'+esc(m.hook.q)+'」</p>');
  if(m.summary)parts.push('<p>'+esc(m.summary)+'</p>');
  if(m.points?.length)parts.push('<h4>핵심 내용</h4>'+ul(m.points));
  parts.push(featureBlock(m.features));
  if(m.learner?.tasks?.length)parts.push('<h4>'+esc(m.learner.headline||'내가 할 일')+'</h4>'+ul(m.learner.tasks));
  if(m.learner?.quiz)parts.push(quizBlock(course,withAnswers));
  if(notes)parts.push('<div class="ho-notes" aria-label="메모"><span>메모</span></div>');
  return '<section class="ho-module">'+parts.join('')+'</section>';
}

// Pure: returns the handout body markup for the chosen sessions.
export function handoutHtml(course,{sessions=null,withAnswers=false,notes=true,date=''}={}){
  const list=(course.sessions||[]).filter(s=>!sessions||sessions.includes(s.no));
  const ins=course.instructor;
  const cover='<header class="ho-cover"><p class="ho-kicker">'+esc(course.org?.name||course.org||'')+' · 수강생 강의자료</p><h1>'+esc(course.title)+'</h1>'+
    '<p class="ho-sub">'+esc(course.subtitle||'')+(course.format?' · '+esc(course.format):'')+'</p>'+
    (ins?'<p class="ho-ins">강사 '+esc(ins.name)+(ins.headline?' — '+esc(ins.headline):'')+'</p>':'')+
    '<p class="ho-muted">이 자료에는 강의 내용만 담았습니다. 실습 원문·프롬프트는 수업 중 실습실 화면에서 제공합니다.'+(date?' · 인쇄 기준일 '+esc(date):'')+'</p></header>';
  const body=list.map(s=>'<article class="ho-session"><h2>'+s.no+'회차 · '+esc(s.title)+'</h2>'+
    (s.outcomes?.length?'<div class="ho-outcomes"><h4>이 회차가 끝나면 손에 남는 것</h4>'+ul(s.outcomes)+'</div>':'')+
    timetable(s)+
    s.modules.filter(m=>LECTURE_KINDS.has(m.kind)).map(m=>moduleBlock(course,m,{withAnswers,notes})).join('')+
    '</article>').join('');
  return cover+body+'<footer class="ho-foot">EKODI Education Premium Studio · '+esc(course.title)+'</footer>';
}

const PRINT_CSS='@page{size:A4;margin:16mm 15mm}body{font-family:Pretendard,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#14213d;line-height:1.55;font-size:10.5pt;margin:0 auto;max-width:180mm}'+
  'h1{font-size:22pt;margin:6pt 0}h2{font-size:15pt;border-bottom:2px solid #0f766e;padding-bottom:4pt;margin:18pt 0 8pt}h3{font-size:12.5pt;margin:4pt 0}h4{font-size:10pt;color:#0f766e;margin:8pt 0 3pt}'+
  'ul,ol{margin:2pt 0 4pt;padding-left:16pt}.ho-kicker{font-size:8.5pt;letter-spacing:.06em;color:#0f766e;font-weight:700;margin:0}.ho-muted{color:#5b6b82;font-size:8.5pt}'+
  '.ho-cover{border:1px solid #d5dde8;border-radius:6pt;padding:14pt 16pt;margin-bottom:10pt}.ho-session{break-before:page}.ho-session:first-of-type{break-before:auto}'+
  '.ho-table{width:100%;border-collapse:collapse;margin:6pt 0 10pt;font-size:9pt}.ho-table th,.ho-table td{border:1px solid #d5dde8;padding:3pt 5pt;text-align:left;vertical-align:top}.ho-table th{background:#eef3f8}'+
  '.ho-module{border-top:1px solid #d5dde8;padding:6pt 0}h2,h3,h4,.ho-kicker{break-after:avoid}li,.ho-notes,tr,.ho-cover{break-inside:avoid}.ho-hook{font-weight:700}.ho-features dt{font-weight:700;margin-top:3pt}.ho-features dd{margin:0 0 2pt 0}'+
  '.ho-tag{font-size:7.5pt;border:1px solid #c47f17;color:#8a5a0f;border-radius:3pt;padding:0 3pt}.ho-ox{display:inline-block;min-width:34pt;font-weight:700;color:#5b6b82}.ho-answer{font-size:8.5pt;color:#0f766e;margin-left:34pt}'+
  '.ho-notes{border:1px dashed #b7c3d3;border-radius:4pt;min-height:22mm;margin-top:6pt;padding:3pt 6pt;background:repeating-linear-gradient(#fff 0 7mm,#e7ecf3 7mm calc(7mm + 1px))}.ho-notes span{font-size:8pt;color:#5b6b82}'+
  '.ho-foot{margin-top:14pt;font-size:8pt;color:#5b6b82;border-top:1px solid #d5dde8;padding-top:4pt}';

// Standalone file for offline printing (the download): the same markup with its own print styles.
export function handoutDocument(course,opts={}){
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(course.title)+' · 수강생 강의자료</title><style>'+PRINT_CSS+'</style></head><body>'+handoutHtml(course,opts)+'</body></html>';
}
export const HANDOUT_PRINT_CSS=PRINT_CSS;
