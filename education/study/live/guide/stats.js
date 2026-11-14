// Projection-friendly AI usage trend screen (instructor-only, strict gate). No network calls.
import {TRENDS,TREND_FACTS,TREND_MESSAGE,TRENDS_AS_OF} from './trends.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,u)=>(Number.isInteger(n)?n:n.toFixed(1))+u;
document.getElementById('tCharts').innerHTML=TRENDS.map(t=>'<section class="t-card"><h2>'+esc(t.title)+'</h2><ol class="t-bars">'+
  t.points.map(([label,v],i)=>'<li><span class="t-label">'+esc(label)+'</span><span class="t-track"><span class="t-bar'+(i===t.points.length-1?' is-last':'')+'" data-w="'+(v/t.max*100).toFixed(1)+'"></span></span><b class="t-val">'+esc(fmt(v,t.unit))+'</b></li>').join('')+
  '</ol><p class="t-note">'+esc(t.note)+'</p><p class="t-src">출처: '+esc(t.source)+'</p></section>').join('');
document.getElementById('tFacts').innerHTML=TREND_FACTS.map(f=>'<div class="t-fact"><b>'+esc(f.k)+'</b><span>'+esc(f.v)+'</span><small>출처: '+esc(f.source)+'</small></div>').join('');
document.getElementById('tMessage').textContent=TREND_MESSAGE;
document.getElementById('tAsOf').textContent='자료 확인일 '+TRENDS_AS_OF+' · 수치는 각 기관 발표·조사 보고서 기준';
for(const el of document.querySelectorAll('[data-w]'))el.style.width=el.dataset.w+'%'; // CSP: no inline style attributes
