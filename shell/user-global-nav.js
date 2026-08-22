(()=>{
'use strict';
if(window.__EKODI_USER_GLOBAL_NAV_BOOTED)return;
window.__EKODI_USER_GLOBAL_NAV_BOOTED=true;

const ROOT_ATTR='data-ekodi-user-global-nav';
const STYLE_ID='ekodi-user-global-nav-style';
const USER_SURFACES=new Set(['public','workspace']);
const HOME='https://ekodi.kr/';
const SERVICES='https://ekodi.kr/#services';
const HISTORY='https://ekodi.kr/history';
const MY='https://my.ekodi.kr/';
const AUTH='https://auth.ekodi.kr/';
let root=null;
let panel=null;
let button=null;
let surface='';

function currentReturn(){
  const url=new URL(location.href);
  url.hash='';
  return url.href;
}
function authUrl(){
  const url=new URL(AUTH);
  const host=String(location.hostname||'').toLowerCase();
  const service=host.endsWith('.ekodi.kr')?host.slice(0,-9).split('.').pop():'';
  if(service&&service!=='www'&&service!=='shell')url.searchParams.set('site',service);
  url.searchParams.set('return_to',currentReturn());
  return url.href;
}
function serviceLabel(){
  const host=String(location.hostname||'').toLowerCase();
  if(host==='ekodi.kr'||host==='www.ekodi.kr')return'EKODI';
  const label=host.endsWith('.ekodi.kr')?host.slice(0,-9).split('.').pop():host.split('.')[0];
  return (label||'EKODI').replace(/-/g,' ').toUpperCase();
}
function shouldShow(){
  const html=document.documentElement;
  if(html.dataset.ekodiGlobalNav==='off')return false;
  surface=String(html.dataset.ekodiShellSurface||surface||'').toLowerCase();
  return USER_SURFACES.has(surface);
}
function close(){
  if(!panel||!button)return;
  panel.hidden=true;
  button.setAttribute('aria-expanded','false');
}
function toggle(){
  if(!panel||!button)return;
  const next=panel.hidden;
  panel.hidden=!next;
  button.setAttribute('aria-expanded',next?'true':'false');
}
function navItem(label,english,href,key){
  const a=document.createElement('a');
  a.href=href;
  a.dataset.ekodiGlobalLink=key;
  a.innerHTML=`<strong>${label}</strong><span>${english}</span>`;
  return a;
}
function install(){
  if(root||!shouldShow()||document.querySelector(`[${ROOT_ATTR}]`))return;
  const host=document.createElement('div');
  host.setAttribute(ROOT_ATTR,'v1');
  host.style.cssText='position:fixed;z-index:2147482900;right:max(12px,env(safe-area-inset-right));top:calc(max(12px,env(safe-area-inset-top)) + 60px);font-family:system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif;';
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    :host{color-scheme:dark}
    *{box-sizing:border-box}
    .wrap{position:relative;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
    button{min-height:40px;display:inline-flex;align-items:center;gap:9px;padding:0 12px;border:1px solid rgba(151,190,169,.26);border-radius:999px;background:rgba(7,21,18,.9);color:#eff7f2;box-shadow:0 12px 34px rgba(0,0,0,.28);backdrop-filter:blur(16px);font:700 11px/1.1 inherit;letter-spacing:.02em;cursor:pointer}
    button:hover,button:focus-visible{border-color:rgba(151,211,178,.56);outline:2px solid transparent;background:rgba(10,29,24,.96)}
    .mark{width:7px;height:7px;border-radius:50%;background:#8fc9a8;box-shadow:0 0 13px rgba(143,201,168,.62)}
    .current{color:#91a99d;font-size:9px;font-weight:750;letter-spacing:.08em}
    .chev{font-size:13px;color:#93b4a2;transition:transform .16s ease}
    button[aria-expanded="true"] .chev{transform:rotate(180deg)}
    nav{width:min(310px,calc(100vw - 24px));padding:10px;border:1px solid rgba(151,190,169,.2);border-radius:18px;background:rgba(6,18,15,.97);box-shadow:0 22px 64px rgba(0,0,0,.38);backdrop-filter:blur(20px)}
    nav[hidden]{display:none}
    .head{padding:6px 8px 10px;color:#6f8b7c;font-size:9px;font-weight:850;letter-spacing:.16em;text-transform:uppercase}
    .links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
    a{min-width:0;display:flex;flex-direction:column;gap:3px;padding:11px 12px;border:1px solid rgba(142,177,158,.11);border-radius:12px;background:rgba(14,33,28,.74);color:#e7f2eb;text-decoration:none}
    a:hover,a:focus-visible{border-color:rgba(145,202,171,.36);background:rgba(18,43,35,.94);outline:2px solid transparent}
    a strong{font-size:12px;line-height:1.15}
    a span{overflow:hidden;color:#718d7e;font-size:9px;white-space:nowrap;text-overflow:ellipsis}
    a[data-ekodi-global-link="account"]{grid-column:1/-1;background:linear-gradient(135deg,rgba(35,75,59,.82),rgba(17,40,33,.92))}
    @media(max-width:768px){
      :host{right:max(8px,env(safe-area-inset-right))!important;top:calc(max(8px,env(safe-area-inset-top)) + 58px)!important}
      button{min-height:38px;padding:0 11px;background:rgba(6,18,15,.94)}
      .current{display:none}
      nav{width:min(292px,calc(100vw - 16px));max-height:calc(100dvh - 116px);overflow:auto}
      .links{grid-template-columns:1fr}
      a[data-ekodi-global-link="account"]{grid-column:auto}
    }
    @media(prefers-reduced-motion:reduce){.chev{transition:none}}
  `;
  const wrap=document.createElement('div');
  wrap.className='wrap';
  button=document.createElement('button');
  button.type='button';
  button.setAttribute('aria-haspopup','menu');
  button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-label','EKODI 공통 메뉴 열기');
  button.innerHTML=`<i class="mark" aria-hidden="true"></i><span>EKODI 메뉴</span><small class="current">${serviceLabel()}</small><b class="chev" aria-hidden="true">⌄</b>`;
  panel=document.createElement('nav');
  panel.hidden=true;
  panel.setAttribute('aria-label','EKODI 사용자 공통 메뉴');
  const head=document.createElement('div');
  head.className='head';
  head.textContent='EKODI USER NAVIGATION';
  const links=document.createElement('div');
  links.className='links';
  links.append(
    navItem('홈','Home',HOME,'home'),
    navItem('서비스','Services',SERVICES,'services'),
    navItem('역사','History',HISTORY,'history'),
    navItem('마이 에코디','My EKODI',MY,'my'),
    navItem('로그인 · 계정','Sign in · Account',authUrl(),'account')
  );
  panel.append(head,links);
  wrap.append(button,panel);
  shadow.append(style,wrap);
  document.documentElement.append(host);
  root=host;
  button.addEventListener('click',toggle);
  shadow.addEventListener('keydown',event=>{if(event.key==='Escape'){close();button?.focus();}});
  document.addEventListener('pointerdown',event=>{if(root&&!event.composedPath().includes(root))close();},{passive:true});
  window.addEventListener('pagehide',close,{passive:true});
}
function reconcile(event){
  const detail=event?.detail;
  if(detail?.surface)surface=String(detail.surface).toLowerCase();
  if(shouldShow())install();
  else if(root){root.remove();root=null;panel=null;button=null;}
}

window.addEventListener('ekodi:shell-theme',reconcile);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(reconcile),{once:true});
else requestAnimationFrame(reconcile);
})();
