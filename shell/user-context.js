(()=>{
'use strict';
if(window.__EKODI_USER_CONTEXT_BOOTED)return;
window.__EKODI_USER_CONTEXT_BOOTED=true;
const USER_SURFACES=new Set(['public','workspace']);
const MY='https://my.ekodi.kr/';
let surface='';
let context={name:'',workspace:'',workspaceId:'',role:'',signedIn:false};
let boundShadow=null;

function allowed(){
 const d=document.documentElement.dataset;
 if(d.ekodiUserContext==='off')return false;
 surface=String(d.ekodiShellSurface||surface||'').toLowerCase();
 return USER_SURFACES.has(surface);
}
function serviceId(){return String(document.documentElement.dataset.ekodiService||'').trim().toLowerCase();}
function contextualMyUrl(){
 const u=new URL(MY);
 const service=serviceId();
 if(service&&service!=='my')u.searchParams.set('from',service);
 if(service!=='my')u.searchParams.set('return_to',location.href);
 return u;
}
function decorateMyLinks(){
 const service=serviceId();
 if(service==='my')return;
 const target=contextualMyUrl().href;
 for(const link of document.querySelectorAll('a[href]')){
  try{const href=new URL(link.href,location.href);if(href.origin===new URL(MY).origin)link.href=target;}catch{}
 }
}
function switchUrl(){
 const u=contextualMyUrl();
 u.hash='workspaces';
 return u.href;
}
function shellShadow(){return document.querySelector('[data-ekodi-shell-root]')?.shadowRoot||null;}
function apply(){
 if(!allowed())return;
 decorateMyLinks();
 const shadow=shellShadow();
 if(!shadow)return;
 const space=shadow.querySelector('[data-space]');
 const person=shadow.querySelector('[data-person]');
 const role=shadow.querySelector('[data-role]');
 if(context.signedIn||context.workspace){
  if(space&&context.workspace)space.textContent=context.workspace;
  if(person){person.textContent=context.name||'';person.hidden=!context.name;}
  if(role&&context.role){role.textContent=context.role;role.hidden=false;}
 }
 bindSwitcher(shadow);
}
function bindSwitcher(shadow){
 if(boundShadow===shadow)return;
 boundShadow=shadow;
 shadow.addEventListener('click',event=>{
  const button=event.target?.closest?.('.action');
  if(!button||!String(button.textContent||'').includes('공간 전환'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  location.assign(switchUrl());
 },{capture:true});
}
function merge(next={}){
 context={...context,...next};
 document.documentElement.dataset.ekodiSignedIn=context.signedIn?'true':'false';
 if(context.workspace)document.documentElement.dataset.ekodiWorkspaceName=context.workspace;
 if(context.workspaceId)document.documentElement.dataset.ekodiWorkspaceId=context.workspaceId;
 if(context.role)document.documentElement.dataset.ekodiUserRole=context.role;
 if(context.name)document.documentElement.dataset.ekodiUserName=context.name;
 requestAnimationFrame(apply);
}
function reconcile(event){if(event?.detail?.surface)surface=String(event.detail.surface).toLowerCase();requestAnimationFrame(apply);}
window.addEventListener('ekodi:shell-theme',reconcile);
window.addEventListener('ekodi:shell-context',event=>merge({
 name:event.detail?.personName||'',
 workspace:event.detail?.workspaceName||'',
 workspaceId:event.detail?.workspaceKey||'',
 role:event.detail?.role||'',
 signedIn:Boolean(event.detail?.personName||event.detail?.workspaceKey)
}));
window.addEventListener('ekodi:user-context',event=>{if(event.detail)merge(event.detail);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(apply),{once:true});else requestAnimationFrame(apply);
})();
