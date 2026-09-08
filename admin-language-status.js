(()=>{
'use strict';
const SECTION='language-status';
const PANEL_ID='languageStatusPanel';
const API='https://api.ekodi.kr/api/control/language-status';
const TOKEN_KEY='ekodi-auth-token';

function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
async function request(){
  const headers=new Headers({accept:'application/json'});
  if(token())headers.set('authorization',`Bearer ${token()}`);
  const response=await fetch(API,{headers,cache:'no-store',credentials:'omit'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'다국어 상태를 불러오지 못했습니다.');
  return data;
}
function stageClass(status){return `lang-stage lang-stage-${String(status||'queued').replace(/[^a-z-]/g,'')}`}
function summary(site){
  const published=site.languages.filter(item=>item.public).length;
  const working=site.languages.filter(item=>['queued','translating','validating','release-ready','stale'].includes(item.status)).length;
  return {published,working,total:site.languages.length};
}
function card(site){
  const totals=summary(site);
  const languages=site.languages.map(item=>`<span class="${stageClass(item.status)}" title="${esc(item.stageLabelKo)}"><b>${esc(item.label)}</b><small>${esc(item.stageLabelKo)}</small></span>`).join('');
  return `<article class="language-site-card" data-language-site="${esc(site.id)}">
    <div class="language-site-head">
      <div><strong>${esc(site.name)}</strong><a href="${esc(site.url)}" target="_blank" rel="noopener noreferrer">${esc(site.url)}</a></div>
      <div class="language-site-count"><b>${totals.published}</b><span>공개</span><b>${totals.working}</b><span>진행</span></div>
    </div>
    <div class="language-stage-grid">${languages}</div>
    <p class="language-auto-note">원문 변경 감지 → 자동 번역 → 자동 검증 → 게시준비 → 검증 통과 시 자동 공개</p>
  </article>`;
}
function ensureStyle(){
  if(document.getElementById('languageStatusStyle'))return;
  const style=document.createElement('style');
  style.id='languageStatusStyle';
  style.textContent='.language-status-panel{max-width:1280px}.language-status-intro{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}.language-status-summary{display:grid;grid-template-columns:repeat(3,minmax(120px,1fr));gap:10px;margin:18px 0}.language-status-summary article,.language-site-card{border:1px solid var(--ekodi-ui-border,#24425E);background:rgba(255,255,255,.04);border-radius:16px}.language-status-summary article{padding:14px}.language-status-summary b{display:block;font-size:24px}.language-status-summary span{color:var(--ekodi-ui-muted,#9FB1C3);font-size:12px}.language-site-card{padding:16px;margin:12px 0}.language-site-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.language-site-head strong{display:block;font-size:17px}.language-site-head a{display:block;margin-top:4px;color:var(--ekodi-ui-muted,#9FB1C3);font-size:11px}.language-site-count{display:grid;grid-template-columns:auto auto auto auto;gap:5px 7px;align-items:center}.language-site-count span{font-size:11px;color:var(--ekodi-ui-muted,#9FB1C3)}.language-stage-grid{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.lang-stage{display:inline-flex;gap:6px;align-items:center;padding:7px 9px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}.lang-stage small{font-size:10px;color:var(--ekodi-ui-muted,#9FB1C3)}.lang-stage-source,.lang-stage-published{border-color:rgba(93,211,158,.35);background:rgba(93,211,158,.10)}.lang-stage-validating,.lang-stage-release-ready{border-color:rgba(142,200,255,.35);background:rgba(142,200,255,.10)}.lang-stage-stale,.lang-stage-blocked{border-color:rgba(255,180,102,.38);background:rgba(255,180,102,.10)}.language-auto-note{margin:12px 0 0;color:var(--ekodi-ui-muted,#9FB1C3);font-size:11px}.language-status-state{margin:12px 0;color:var(--ekodi-ui-muted,#9FB1C3)}@media(max-width:720px){.language-status-summary{grid-template-columns:1fr}.language-site-head{display:block}.language-site-count{margin-top:10px;justify-content:start}}';
  document.head.append(style);
}
function ensurePanel(){
  let panel=document.getElementById(PANEL_ID);
  if(panel)return panel;
  const content=document.querySelector('#app .content')||document.querySelector('.content');
  if(!content)return null;
  panel=document.createElement('section');
  panel.id=PANEL_ID;
  panel.className='section language-status-panel';
  panel.dataset.panel=SECTION;
  panel.hidden=true;
  panel.innerHTML='<div class="language-status-intro"><div><p class="kicker">LANGUAGE READINESS</p><h2>다국어 지원 현황</h2><p class="muted">사이트별 번역·검증·공개 상태를 읽기 전용으로 보여줍니다. 공개 전환은 내부 자동화가 검증 기준을 통과했을 때만 수행합니다.</p></div><button type="button" class="btn" data-language-refresh>새로고침</button></div><div class="language-status-state" data-language-state></div><div class="language-status-summary" data-language-summary></div><div data-language-sites></div>';
  content.append(panel);
  panel.querySelector('[data-language-refresh]')?.addEventListener('click',load);
  return panel;
}
function render(data){
  const panel=ensurePanel();if(!panel)return;
  const sites=Array.isArray(data.sites)?data.sites:[];
  const languages=Array.isArray(data.languages)?data.languages:[];
  const multilingual=sites.filter(site=>site.multilingual).length;
  const publishedLocales=new Set(sites.flatMap(site=>site.publishedLocales||[]));
  panel.querySelector('[data-language-summary]').innerHTML=`<article><b>${sites.length}</b><span>사이트</span></article><article><b>${languages.length}</b><span>등록 언어</span></article><article><b>${multilingual}</b><span>다국어 공개 사이트</span></article>`;
  panel.querySelector('[data-language-sites]').innerHTML=sites.map(card).join('');
  panel.querySelector('[data-language-state]').textContent=`공개 언어 ${publishedLocales.size}개 · 사용자 화면에는 준비 완료 언어만 표시됩니다.`;
}
async function load(){
  const panel=ensurePanel();if(!panel)return;
  const state=panel.querySelector('[data-language-state]');
  state.textContent='다국어 상태를 확인하는 중입니다.';
  try{render(await request())}catch(error){state.textContent=error.message||'상태 확인에 실패했습니다.'}
}
function activate(){
  const panel=ensurePanel();if(!panel)return;
  document.querySelectorAll('#app .content > [data-panel],.content > [data-panel]').forEach(item=>{item.hidden=item!==panel});
  panel.hidden=false;
  document.querySelectorAll('.sidebar .nav').forEach(item=>item.classList.toggle('active',item.dataset.section===SECTION||item.dataset.adminLink===SECTION));
  const title=document.querySelector('#pageTitle');if(title)title.textContent='다국어 지원 현황';
  load();
}
function boot(){
  ensureStyle();
  ensurePanel();
  if(location.hash===`#${SECTION}`)activate();
}
window.EKODILanguageStatus=Object.freeze({activate,load});
window.addEventListener('hashchange',()=>{if(location.hash===`#${SECTION}`)activate()});
window.addEventListener('ekodi-admin-ready',boot);
if(document.documentElement.dataset.ekodiAdminReady==='true')boot();
})();
