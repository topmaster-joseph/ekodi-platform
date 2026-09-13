const API='https://api.ekodi.kr/api/i18n/v1/admin';
const SERVICE='local-commerce';
const tab=document.getElementById('languageAdminTab');
const panel=document.getElementById('languageAdminPanel');
const list=document.getElementById('languageAdminList');
const summary=document.getElementById('languageAdminSummary');
const status=document.getElementById('languageAdminStatus');
const refresh=document.getElementById('languageAdminRefresh');
let authorized=false;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const stageLabel=s=>({source:'원문',queued:'대기',translating:'번역중',validating:'검증중','release-ready':'게시준비',published:'번역완료',stale:'원문변경',blocked:'보류'})[s]||s||'확인 필요';
function setStatus(text,error=false){if(!status)return;status.textContent=text;status.dataset.state=error?'error':'ready'}
function reveal(){tab?.classList.remove('hidden');panel?.classList.remove('hidden');authorized=true}
function conceal(){tab?.classList.add('hidden');panel?.classList.add('hidden');authorized=false}
async function languageApi(path='',options={}){
  const join=path.includes('?')?'&':'?';
  const response=await window.EKODILocalCommerceFetch(`${API}${path}${join}service=${encodeURIComponent(SERVICE)}`,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||`language_${response.status}`),{status:response.status});
  return data;
}
function render(data){
  const site=data.site||{},items=Array.isArray(site.languages)?site.languages:[];
  const published=items.filter(item=>item.public).length;
  const ready=items.filter(item=>['source','published'].includes(item.status)).length;
  if(summary)summary.innerHTML=`<article class="card"><small>게시 언어</small><div class="balance">${published}</div></article><article class="card"><small>번역완료</small><div class="balance">${ready}</div></article><article class="card"><small>중앙 연동</small><div class="balance">ON</div></article>`;
  if(list)list.innerHTML=items.map(item=>{const source=item.locale==='ko-KR'||item.status==='source',ready=['source','published'].includes(item.status),next=item.public?'hidden':'published';return `<div class="list-row" data-language-locale="${esc(item.locale)}"><div><strong>${esc(item.label||item.nativeName||item.locale)} · ${esc(item.locale)}</strong><div>번역 ${esc(stageLabel(item.status))} · 게시 ${item.public?'ON':'OFF'}</div></div><button type="button" data-language-toggle data-next="${next}" ${source||!ready?'disabled':''}>${source?'기본 공개':item.public?'게시 중지':ready?'게시':'번역 준비 중'}</button></div>`}).join('');
  list?.querySelectorAll('[data-language-toggle]').forEach(button=>button.addEventListener('click',()=>toggle(button)));
  setStatus(`EKODI 중앙 원장과 동기화됨 · 게시 ${published}개 · 번역완료 ${ready}개`);
}
async function load({activate=false}={}){
  setStatus('다국어 상태를 확인하는 중입니다.');
  try{const data=await languageApi('/status');reveal();render(data);if(activate&&new URL(location.href).searchParams.get('mode')==='admin')tab?.click();return data}
  catch(error){if(error.status===401||error.status===403){conceal();return null}console.error('local commerce language admin',error);setStatus('다국어 상태를 불러오지 못했습니다.',true);return null}
}
async function toggle(button){
  const row=button.closest('[data-language-locale]');if(!row)return;button.disabled=true;setStatus('게시 상태를 변경하고 있습니다.');
  try{await languageApi('/publication',{method:'PUT',body:JSON.stringify({locale:row.dataset.languageLocale,publicationStatus:button.dataset.next})});await load()}
  catch(error){setStatus(error.message==='translation_not_ready'?'번역 검증이 끝난 언어만 게시할 수 있습니다.':'게시 상태를 변경하지 못했습니다.',true);button.disabled=false}
}
window.addEventListener('ekodi:local-commerce-account',event=>{
  if(!event.detail?.signedIn){conceal();return}
  load({activate:true});
});
refresh?.addEventListener('click',()=>load());
if(window.EKODILocalCommerceSession?.())load({activate:true});
window.EKODILocalCommerceLanguageAdmin=Object.freeze({load,get authorized(){return authorized}});
