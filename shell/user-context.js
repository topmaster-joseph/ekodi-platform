(()=>{
'use strict';
if(window.__EKODI_USER_CONTEXT_BOOTED)return;
window.__EKODI_USER_CONTEXT_BOOTED=true;
const USER_SURFACES=new Set(['public','workspace']);
const MY='https://my.ekodi.kr/';
let root=null,surface='';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readContext(){
 const html=document.documentElement,d=html.dataset;
 const detail=window.__EKODI_USER_CONTEXT__||{};
 return {
  name:detail.name||d.ekodiUserName||'',
  workspace:detail.workspace||d.ekodiWorkspaceName||'',
  workspaceId:detail.workspaceId||d.ekodiWorkspaceId||'',
  role:detail.role||d.ekodiUserRole||'',
  signedIn:Boolean(detail.signedIn||d.ekodiSignedIn==='true')
 };
}
function allowed(){
 const d=document.documentElement.dataset;
 if(d.ekodiUserContext==='off')return false;
 surface=String(d.ekodiShellSurface||surface||'').toLowerCase();
 return USER_SURFACES.has(surface);
}
function switchUrl(){
 const u=new URL(MY);u.pathname='/workspaces';u.searchParams.set('return_to',location.href);return u.href;
}
function render(){
 if(!allowed()){root?.remove();root=null;return;}
 const c=readContext();
 if(!c.signedIn&&!c.workspace){root?.remove();root=null;return;}
 if(!root){root=document.createElement('div');root.setAttribute('data-ekodi-user-context','v1');document.documentElement.append(root);}
 const shadow=root.shadowRoot||root.attachShadow({mode:'open'});
 shadow.innerHTML=`<style>
 :host{position:fixed;z-index:2147482899;right:max(12px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top));font-family:system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif;color-scheme:dark}
 *{box-sizing:border-box}.bar{display:flex;align-items:center;gap:8px;max-width:min(520px,calc(100vw - 24px));padding:7px 8px 7px 11px;border:1px solid rgba(151,190,169,.2);border-radius:999px;background:rgba(7,21,18,.9);box-shadow:0 10px 28px rgba(0,0,0,.24);backdrop-filter:blur(16px);color:#eaf4ee}
 .who{min-width:0;display:flex;align-items:center;gap:7px;font-size:11px}.name{font-weight:800}.sep{color:#47675a}.space{overflow:hidden;max-width:180px;color:#a9c5b5;font-weight:700;white-space:nowrap;text-overflow:ellipsis}.role{padding:3px 6px;border-radius:999px;background:rgba(112,160,135,.13);color:#8fb5a0;font-size:9px;font-weight:800}
 a{flex:none;padding:7px 10px;border:1px solid rgba(151,190,169,.18);border-radius:999px;background:rgba(19,43,35,.9);color:#dff0e6;text-decoration:none;font-size:10px;font-weight:800}a:hover,a:focus-visible{border-color:rgba(151,211,178,.5);outline:2px solid transparent}
 @media(max-width:768px){:host{right:max(8px,env(safe-area-inset-right));top:max(8px,env(safe-area-inset-top))}.bar{max-width:calc(100vw - 16px);padding-left:9px}.name{display:none}.space{max-width:128px}.role{display:none}a{padding:7px 9px}}
 </style><div class="bar" role="region" aria-label="현재 EKODI 사용자 공간"><div class="who">${c.name?`<span class="name">${esc(c.name)}</span><span class="sep">·</span>`:''}<span class="space">${esc(c.workspace||'개인 공간')}</span>${c.role?`<span class="role">${esc(c.role)}</span>`:''}</div><a href="${esc(switchUrl())}">공간 전환</a></div>`;
}
function reconcile(e){if(e?.detail?.surface)surface=String(e.detail.surface).toLowerCase();render();}
window.addEventListener('ekodi:shell-theme',reconcile);
window.addEventListener('ekodi:user-context',e=>{if(e.detail)window.__EKODI_USER_CONTEXT__={...(window.__EKODI_USER_CONTEXT__||{}),...e.detail};render();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(render),{once:true});else requestAnimationFrame(render);
})();
