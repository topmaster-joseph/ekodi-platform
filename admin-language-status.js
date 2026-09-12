(()=>{
'use strict';
const SECTION='language-status';
const PANEL_ID='languageStatusPanel';
const API='https://api.ekodi.kr/api/control/language-status';
const TOKEN_KEY='ekodi-auth-token';
const READY_STAGES=new Set(['source','published']);
function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
async function request(path='',options={}){
  const headers=new Headers({accept:'application/json',...(options.headers||{})});
  if(token())headers.set('authorization',`Bearer ${token()}`);
  if(options.body)headers.set('content-type','application/json');
  const response=await fetch(API+path,{...options,headers,cache:'no-store',credentials:'omit'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'다국어 설정을 처리하지 못했습니다.');
  return data;
}
function stageClass(status){return `lang-stage lang-stage-${String(status||'queued').replace(/[^a-z-]/g,'')}`}
function summary(site){
  const published=site.languages.filter(item=>item.public).length;
  const ready=site.languages.filter(item=>READY_STAGES.has(item.status)).length;
  const working=site.languages.filter(item=>['queued','translating','validating','release-ready','stale'].includes(item.status)).length;
  return {published,ready,working,total:site.languages.length};
}
function languageRow(site,item){
  const ready=READY_STAGES.has(item.status);
  const published=item.public===true;
  const source=item.locale==='ko-KR'||item.status==='source';
  const next=published?'hidden':'published';
  const actionLabel=source?'기본 공개':published?'게시 중지':ready?'게시':'번역 준비 후 게시';
  const disabled=source||!ready;
  return `<div class="language-row" data-language-locale="${esc(item.locale)}">
    <div class="language-row-copy"><b>${esc(item.label)}</b><small>${esc(item.locale)}</small></div>
    <span class="${stageClass(item.status)}"><small>${esc(item.stageLabelKo)}</small></span>
    <span class="language-publication ${published?'is-published':'is-hidden'}">${published?'게시':'비게시'}</span>
    <button type="button" class="btn language-toggle" data-language-action data-site="${esc(site.id)}" data-locale="${esc(item.locale)}" data-next="${next}" ${disabled?'disabled':''}>${actionLabel}</button>
  </div>`;
}
function card(site){
  const totals=summary(site);
  return `<article class="language-site-card" data-language-site="${esc(site.id)}">
    <div class="language-site-head"><div><strong>${esc(site.name)}</strong><a href="${esc(site.url)}" target="_blank" rel="noopener noreferrer">${esc(site.url)}</a></div>
    <div class="language-site-count"><b>${totals.published}</b><span>게시</span><b>${totals.ready}</b><span>번역완료</span><b>${totals.working}</b><span>진행</span></div></div>
    <div class="language-row-head"><span>언어</span><span>번역 상태</span><span>게시 여부</span><span>관리</span></div>
    <div class="language-rows">${site.languages.map(item=>languageRow(site,item)).join('')}</div>
    <p class="language-auto-note">원문 변경 감지 → 자동 번역 → 자동 검증 → 번역완료. 실제 공개 여부는 사이트 관리자와 최고관리자가 같은 원장에서 관리합니다.</p>
  </article>`;
}
function ensureStyle(){
  if(document.getElementById('languageStatusStyle'))return;
  const style=document.createElement('style');style.id='languageStatusStyle';
  style.textContent='.language-status-panel{max-width:1280px}.language-status-intro{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}.language-status-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:18px 0}.language-status-summary article,.language-site-card{border:1px solid var(--ekodi-ui-border,#24425E);background:rgba(255,255,255,.04);border-radius:16px}.language-status-summary article{padding:14px}.language-status-summary b{display:block;font-size:24px}.language-status-summary span{color:var(--ekodi-ui-muted,#9FB1C3);font-size:12px}.language-site-card{padding:16px;margin:12px 0}.language-site-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.language-site-head strong{display:block;font-size:17px}.language-site-head a{display:block;margin-top:4px;color:var(--ekodi-ui-muted,#9FB1C3);font-size:11px}.language-site-count{display:grid;grid-template-columns:auto auto auto auto auto auto;gap:5px 7px;align-items:center}.language-site-count span{font-size:11px;color:var(--ekodi-ui-muted,#9FB1C3)}.language-row-head,.language-row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(105px,.7fr) minmax(90px,.55fr) minmax(110px,.55fr);gap:8px;align-items:center}.language-row-head{margin-top:14px;padding:0 9px 6px;color:var(--ekodi-ui-muted,#9FB1C3);font-size:10px}.language-row{padding:9px;border-top:1px solid rgba(255,255,255,.08)}.language-row-copy b,.language-row-copy small{display:block}.language-row-copy small{color:var(--ekodi-ui-muted,#9FB1C3);font-size:10px}.lang-stage,.language-publication{display:inline-flex;width:max-content;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.06);font-size:10px}.language-publication.is-published{border:1px solid rgba(93,211,158,.35);background:rgba(93,211,158,.10)}.language-publication.is-hidden{border:1px solid rgba(255,180,102,.30);background:rgba(255,180,102,.08)}.language-auto-note,.language-status-state{color:var(--ekodi-ui-muted,#9FB1C3);font-size:11px}.language-toggle:disabled{opacity:.55;cursor:not-allowed}@media(max-width:720px){.language-status-summary{grid-template-columns:1fr 1fr}.language-row-head{display:none}.language-row{grid-template-columns:1fr auto}.language-row .language-publication,.language-row .language-toggle{justify-self:end}.language-site-count{margin-top:10px}}';
  document.head.append(style);
}
function ensurePanel(){
  let panel=document.getElementById(PANEL_ID);if(panel)return panel;
  const content=document.querySelector('#app .content')||document.querySelector('.content');if(!content)return null;
  panel=document.createElement('section');panel.id=PANEL_ID;panel.className='section language-status-panel';panel.dataset.panel=SECTION;panel.hidden=true;
  panel.innerHTML='<div class="language-status-intro"><div><p class="kicker">LANGUAGE CONTROL</p><h2>다국어 번역·게시 관리</h2><p class="muted">모든 사이트의 번역 진행 상태와 실제 게시 여부를 하나의 중앙 원장에서 관리합니다. 각 사이트 관리자의 변경도 즉시 같은 상태로 연동됩니다.</p></div><button type="button" class="btn" data-language-refresh>새로고침</button></div><div class="language-status-state" data-language-state></div><div class="language-status-summary" data-language-summary></div><div data-language-sites></div>';
  content.append(panel);panel.querySelector('[data-language-refresh]')?.addEventListener('click',load);return panel;
}
async function changePublication(button){
  if(button.disabled)return;const site=button.dataset.site,locale=button.dataset.locale,next=button.dataset.next;button.disabled=true;
  const state=ensurePanel()?.querySelector('[data-language-state]');if(state)state.textContent=`${site} · ${locale} 게시 상태를 변경하는 중입니다.`;
  try{await request(`/${encodeURIComponent(site)}/${encodeURIComponent(locale)}`,{method:'PUT',body:JSON.stringify({publicationStatus:next})});await load()}
  catch(error){if(state)state.textContent=error.message||'게시 상태 변경에 실패했습니다.';button.disabled=false}
}
function render(data){
  const panel=ensurePanel();if(!panel)return;const sites=Array.isArray(data.sites)?data.sites:[];const languages=Array.isArray(data.languages)?data.languages:[];
  const publishedCount=sites.reduce((n,site)=>n+(site.languages||[]).filter(item=>item.public).length,0);
  const readyCount=sites.reduce((n,site)=>n+(site.languages||[]).filter(item=>READY_STAGES.has(item.status)).length,0);
  const multilingual=sites.filter(site=>site.multilingual).length;
  panel.querySelector('[data-language-summary]').innerHTML=`<article><b>${sites.length}</b><span>관리 사이트</span></article><article><b>${languages.length}</b><span>등록 언어</span></article><article><b>${publishedCount}</b><span>게시 언어 조합</span></article><article><b>${multilingual}</b><span>다국어 공개 사이트</span></article>`;
  panel.querySelector('[data-language-sites]').innerHTML=sites.map(card).join('');
  panel.querySelector('[data-language-state]').textContent=`중앙 원장 ${data.registryVersion||data.schemaVersion||2}세대 · 번역 상태와 게시 여부를 분리 관리합니다.`;
  panel.querySelectorAll('[data-language-action]').forEach(button=>button.addEventListener('click',()=>changePublication(button)));
}
async function load(){
  const panel=ensurePanel();if(!panel)return;const state=panel.querySelector('[data-language-state]');state.textContent='다국어 상태를 확인하는 중입니다.';
  try{render(await request())}catch(error){state.textContent=error.message||'상태 확인에 실패했습니다.'}
}
function activate(){
  const panel=ensurePanel();if(!panel)return;
  document.querySelectorAll('#app .content > [data-panel],.content > [data-panel]').forEach(item=>{item.hidden=item!==panel});panel.hidden=false;
  document.querySelectorAll('.sidebar .nav').forEach(item=>item.classList.toggle('active',item.dataset.section===SECTION||item.dataset.adminLink===SECTION));
  const title=document.querySelector('#pageTitle');if(title)title.textContent='다국어 번역·게시 관리';load();
}
function boot(){ensureStyle();ensurePanel();if(location.hash===`#${SECTION}`)activate()}
window.EKODILanguageStatus=Object.freeze({activate,load});
window.addEventListener('hashchange',()=>{if(location.hash===`#${SECTION}`)activate()});
window.addEventListener('ekodi-admin-ready',boot);if(document.documentElement.dataset.ekodiAdminReady==='true')boot();
})();
