(()=>{
'use strict';
if(window.__EKODI_USER_AI_ENTRY__)return;
window.__EKODI_USER_AI_ENTRY__=true;
const AI_URL='https://ekodi.kr/ai/';
const blocked=new Set(['admin','form','document','data']);
const clean=v=>String(v||'').trim();
function context(){
  const html=document.documentElement;
  const service=clean(html.dataset.ekodiService||document.currentScript?.dataset?.ekodiService).toLowerCase();
  const surface=clean(html.dataset.ekodiUserSurface||document.currentScript?.dataset?.ekodiSurface).toLowerCase();
  return {service:service||'ekodi',surface:surface||'public'};
}
function eligible(){
  const {service,surface}=context();
  if(blocked.has(surface)||location.pathname.startsWith('/ai'))return false;
  return Boolean(service)&&['public','workspace'].includes(surface);
}
function style(){
  if(document.querySelector('[data-ekodi-user-ai-entry-style]'))return;
  const el=document.createElement('style');el.dataset.ekodiUserAiEntryStyle='v1';
  el.textContent='.ekodi-user-ai-entry{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147482000;font:inherit}.ekodi-user-ai-entry__open{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:999px;padding:11px 16px;background:Canvas;color:CanvasText;box-shadow:0 8px 30px rgb(0 0 0/.14);font-weight:800;cursor:pointer}.ekodi-user-ai-entry__panel{display:none;width:min(390px,calc(100vw - 28px));margin-bottom:8px;padding:14px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:16px;background:Canvas;color:CanvasText;box-shadow:0 14px 44px rgb(0 0 0/.18)}.ekodi-user-ai-entry[data-open="1"] .ekodi-user-ai-entry__panel{display:block}.ekodi-user-ai-entry__panel strong{display:block;margin:0 0 8px}.ekodi-user-ai-entry__form{display:flex;gap:7px}.ekodi-user-ai-entry__form input{min-width:0;flex:1;padding:10px 11px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:10px;background:Canvas;color:CanvasText;font:inherit}.ekodi-user-ai-entry__form button{border:0;border-radius:10px;padding:9px 12px;background:CanvasText;color:Canvas;font:inherit;font-weight:800;cursor:pointer}@media(max-width:560px){.ekodi-user-ai-entry{left:12px;right:12px}.ekodi-user-ai-entry__panel{width:100%}.ekodi-user-ai-entry__open{float:right}}';
  document.head.append(el);
}
function mount(){
  if(!eligible()||document.querySelector('[data-ekodi-user-ai-entry]'))return;
  style();const {service}=context();
  const root=document.createElement('aside');root.className='ekodi-user-ai-entry';root.dataset.ekodiUserAiEntry='v1';
  root.innerHTML='<div class="ekodi-user-ai-entry__panel"><strong>무엇을 원하세요?</strong><form class="ekodi-user-ai-entry__form"><input name="request" maxlength="600" placeholder="예: 홍보 게시물 만들어줘" autocomplete="off"><button type="submit">해줘</button></form></div><button type="button" class="ekodi-user-ai-entry__open" aria-expanded="false">AI로 하기</button>';
  const open=root.querySelector('.ekodi-user-ai-entry__open');const form=root.querySelector('form');const input=root.querySelector('input');
  open.addEventListener('click',()=>{const next=root.dataset.open==='1'?'0':'1';root.dataset.open=next;open.setAttribute('aria-expanded',String(next==='1'));if(next==='1')input.focus();});
  form.addEventListener('submit',event=>{event.preventDefault();const request=clean(input.value);if(!request)return;
    const target=new URL(AI_URL);target.searchParams.set('q',request);target.searchParams.set('source',service);target.searchParams.set('from',location.pathname.slice(0,240));target.searchParams.set('auto','1');location.assign(target.toString());
  });
  document.body.append(root);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
