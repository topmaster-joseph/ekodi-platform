(()=>{
'use strict';
// 최고관리자 · 에코디 공통본문: 등록된 달의 날짜별 본문·제목·묵상자료 현황, 세 사이트 바로가기, 새 달 등록 요청.
const API='https://ekodi.kr/api/control/common-scripture';
const TOKEN_KEY='ekodi-auth-token';
const SITES=Object.freeze([
  ['말씀대화',date=>`/bible/devotion/${date}`],
  ['교회',date=>`/ekodichurch/devotion/?date=${date}`],
  ['선교회',date=>`/ekodimission/devotion?date=${date}`],
]);
const ACTIVITY_LABEL={curated:'묵상자료 준비','override-published':'편집본 공개','override-draft':'편집 초안',fallback:'기본 자료'};
// Loaded as a module by admin-menu-registry.js; carries its own stylesheet (not part of the first-path budget).
if(!document.querySelector('link[data-common-scripture-admin]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('common-scripture-admin.css',import.meta.url).href;link.dataset.commonScriptureAdmin='';document.head.append(link);}
const content=document.querySelector('.content');
const nav=document.querySelector('.sidebar nav');
if(!content||!nav)return;

let panel=document.querySelector('[data-panel~="common-scripture"]');
if(!panel){panel=document.createElement('section');panel.className='section common-scripture-panel hidden-panel';panel.hidden=true;panel.dataset.panel='common-scripture';content.append(panel);}
let button=nav.querySelector('[data-section="common-scripture"],[data-lazy-section="common-scripture"]');
if(!button){button=document.createElement('button');button.type='button';button.className='nav';button.dataset.section='common-scripture';button.innerHTML='<span>에코디 공통본문</span>';nav.append(button);}
if(!button.dataset.section)button.dataset.section='common-scripture';

const token=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}};
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const seoulToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const weekday=date=>['일','월','화','수','목','금','토'][new Date(date+'T12:00:00+09:00').getUTCDay()];
async function request(path='',options={}){
  const headers=new Headers(options.headers||{});headers.set('authorization',`Bearer ${token()}`);
  if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(`${API}${path}`,{...options,headers,cache:'no-store',signal:options.signal||AbortSignal.timeout(10000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(body.error||`HTTP ${response.status}`),{body});
  return body;
}

let state={months:[],drafts:[],role:''};
let selected='';
function monthHtml(view){
  const today=seoulToday();
  const rows=view.days.map(day=>{
    const links=SITES.map(([label,href])=>`<a href="${esc(href(day.date))}" target="_blank" rel="noopener">${label}</a>`).join(' · ');
    const activity=ACTIVITY_LABEL[day.activity]||day.activity;
    return `<tr class="${day.date===today?'is-today':''}${['토','일'].includes(weekday(day.date))?' is-weekend':''}"><td>${esc(day.date.slice(5).replace('-','/'))} (${weekday(day.date)})</td><td>${esc(day.passage)}</td><td>${esc(day.title)}</td><td><span class="cs-pill ${day.activity==='fallback'?'wait':'ready'}">${esc(activity)}</span></td><td class="cs-links">${links}</td></tr>`;
  }).join('');
  return `<div class="cs-summary">
      <div class="cs-card"><b>${esc(view.month.replace('-','년 '))}월</b><span>${esc(view.range)}</span></div>
      <div class="cs-card"><b>${view.status==='approved'?'승인':'검토'}</b><span>${esc(view.approvedBy||view.authority)}${view.approvedAt?` · ${esc(view.approvedAt)}`:''}</span></div>
      <div class="cs-card"><b>${view.coverage.curated+view.coverage.overrides}/${view.coverage.total}</b><span>묵상자료 준비 (편집본 ${view.coverage.overrides})</span></div>
      <div class="cs-card"><b>세 사이트</b><span>말씀대화 · 교회 · 선교회 공통 사용</span></div>
    </div>
    <div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>날짜</th><th>본문</th><th>제목</th><th>묵상자료</th><th>바로가기</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="cs-note">본문은 레지스트리 <code>${esc(view.id)}</code> 한 곳에서 읽어 모든 사이트에 같게 반영됩니다. 날짜별 묵상 시·노래·질문은 각 날짜 페이지 상단의 '이 날짜 묵상 편집'에서 고칠 수 있습니다.</p>`;
}
function draftHtml(){
  const drafts=state.drafts.map(draft=>`<li><b>${esc(draft.month)}</b> · ${esc(draft.status==='submitted'?'반영 대기':draft.status)} · ${esc(draft.payload?.days?.length||0)}일 · ${esc(draft.submitted_by)} · ${esc(String(draft.updated_at||'').slice(0,16).replace('T',' '))}</li>`).join('');
  const disabled=state.role==='super_admin'?'':'disabled';
  return `<details class="cs-draft"${state.drafts.length?'':' open'}><summary>새 달 공통본문 등록 요청</summary>
    <p class="cs-note">한 줄에 하루씩 <code>본문 | 제목</code> 형식으로 1일부터 마지막 날까지 적어 주세요. 예) <code>고린도전서 15:23-34 | 각각 자기 차례대로</code><br>요청은 에코디AI가 장절 연속성·요일을 검토해 공통본문 레지스트리에 반영하고 세 사이트에 배포합니다.</p>
    <form class="cs-form" data-cs-draft><label>등록할 달<input name="month" type="month" required ${disabled}></label>
    <label>날짜별 본문 | 제목<textarea name="days" rows="10" required ${disabled} placeholder="고린도전서 15:23-34 | 각각 자기 차례대로"></textarea></label>
    <label>메모<input name="note" maxlength="500" ${disabled} placeholder="승인자, 참고 사항"></label>
    <button class="cs-btn primary" type="submit" ${disabled}>등록 요청</button><p class="cs-feedback" role="status">${state.role==='super_admin'?'':'최고관리자만 등록을 요청할 수 있습니다.'}</p></form>
    ${drafts?`<ul class="cs-drafts">${drafts}</ul>`:''}</details>`;
}
function render(){
  if(!state.months.length){panel.innerHTML='<div class="cs-head"><div><h2>에코디 공통본문</h2><p>등록된 공통본문이 없습니다.</p></div></div>'+draftHtml();bind();return;}
  if(!state.months.some(view=>view.month===selected)){const current=seoulToday().slice(0,7);selected=(state.months.find(view=>view.month===current)||state.months.at(-1)).month;}
  const view=state.months.find(item=>item.month===selected);
  const tabs=state.months.map(item=>`<button type="button" class="cs-tab${item.month===selected?' active':''}" data-cs-month="${esc(item.month)}">${esc(item.month.replace('-','.'))}</button>`).join('');
  panel.innerHTML=`<div class="cs-head"><div><h2>에코디 공통본문</h2><p>매일묵상·주일모임·토요모임·카드뉴스가 함께 쓰는 날짜별 본문입니다.</p></div><div class="cs-actions"><button type="button" class="cs-btn" data-cs-refresh>새로고침</button><a class="cs-btn" href="/bible/devotion" target="_blank" rel="noopener">오늘의 매일묵상</a></div></div><div class="cs-tabs" role="tablist">${tabs}</div>${monthHtml(view)}${draftHtml()}`;
  bind();
}
function bind(){
  panel.querySelector('[data-cs-refresh]')?.addEventListener('click',load);
  panel.querySelectorAll('[data-cs-month]').forEach(tab=>tab.addEventListener('click',()=>{selected=tab.dataset.csMonth;render();}));
  panel.querySelector('[data-cs-draft]')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget,feedback=form.querySelector('.cs-feedback');
    const days=String(form.elements.days.value||'').split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const i=line.indexOf('|');return i<0?{passage:line,title:''}:{passage:line.slice(0,i).trim(),title:line.slice(i+1).trim()};});
    feedback.textContent='저장 중입니다.';
    try{await request('/drafts',{method:'POST',body:JSON.stringify({month:form.elements.month.value,days,note:form.elements.note.value})});feedback.textContent='등록 요청을 저장했습니다. 검토 후 반영됩니다.';await load();}
    catch(error){const b=error.body||{};feedback.textContent=b.error==='day_count_mismatch'?`날짜 수가 맞지 않습니다. ${b.expected}일이 필요하고 ${b.received}일이 입력되었습니다.`:b.error==='invalid_passage'?`본문 형식을 확인해 주세요: ${b.days.join(', ')}일`:b.error==='month_already_registered'?'이미 등록된 달입니다.':`저장 실패: ${error.message}`;}
  });
}
let loading=null;
async function load(){
  if(loading)return loading;
  loading=(async()=>{try{state=await request();render();}catch(error){panel.innerHTML=`<div class="cs-head"><div><h2>에코디 공통본문</h2><p class="cs-error">공통본문을 불러오지 못했습니다: ${esc(error.message)}</p></div></div>`;}finally{loading=null}})();
  return loading;
}
panel.innerHTML='<div class="cs-head"><div><h2>에코디 공통본문</h2><p>불러오는 중입니다.</p></div></div>';
button.addEventListener('click',()=>queueMicrotask(load));
window.addEventListener('ekodi-admin-section-changed',event=>{if(event.detail?.section==='common-scripture')load()});
if(location.hash==='#common-scripture')queueMicrotask(load);
window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{section:'common-scripture'}}));
})();
