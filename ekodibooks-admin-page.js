const ADMIN_BASE='/ekodibooks/admin';

const MENU=Object.freeze([
  ['overview','운영 홈','운영'],
  ['pipeline','출판 파이프라인','출판'],
  ['publications','출판물 관리','출판'],
  ['finance','매출 · 비용','정산'],
  ['royalties','인세 · 지급','정산'],
  ['distribution','배포 · 채널','배포'],
  ['inquiries','출판 상담','고객'],
  ['services','요금 · 서비스','설정'],
  ['features','기능 설정','설정'],
]);

export function isEkodiBooksAdminPath(pathname=''){
  return /^\/ekodibooks\/admin(?:\/|$)/i.test(String(pathname||''));
}

function menuHtml(){
  let group='';
  return MENU.map(([id,label,nextGroup])=>{
    const heading=nextGroup!==group?(group=nextGroup,`<span class="books-site-group">${nextGroup}</span>`):'';
    return `${heading}<a href="${ADMIN_BASE}/${id}" data-books-route="${id}">${label}</a>`;
  }).join('');
}

export function ekodiBooksAdminPage(){
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>에코디서점 관리자 | EKODI</title>
<link rel="stylesheet" href="/books-admin.css"><link rel="stylesheet" href="/books-finance-admin.css">
<style>
:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#172033;background:#f6f8fb}*{box-sizing:border-box}body{margin:0;background:#f6f8fb;color:#172033}.books-site-app{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100dvh}.sidebar{position:sticky;top:0;height:100dvh;display:flex;flex-direction:column;padding:18px 14px;background:#fff;border-right:1px solid #e3e8ef;overflow:hidden}.books-site-brand{padding:7px 10px 16px;border-bottom:1px solid #edf0f4}.books-site-brand small{display:block;color:#7c8798;font-size:11px;letter-spacing:.08em}.books-site-brand strong{display:block;margin-top:5px;font-size:18px}.sidebar nav{display:flex;flex-direction:column;gap:3px;padding-top:12px;overflow:auto}.books-site-group{padding:12px 10px 4px;color:#8a94a6;font-size:10px;font-weight:800;letter-spacing:.08em}.sidebar nav a{display:flex;align-items:center;min-height:42px;padding:9px 11px;border-radius:9px;color:#4b5563;text-decoration:none;font-size:13px;font-weight:700}.sidebar nav a:hover,.sidebar nav a.active{background:#edf4ff;color:#174f86}.books-runtime-trigger{display:none!important}.books-site-footer{margin-top:auto;padding:12px 10px 0;border-top:1px solid #edf0f4;display:grid;gap:8px}.books-site-footer a{color:#526274;text-decoration:none;font-size:12px}.books-site-main{min-width:0}.books-site-topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;min-height:58px;padding:9px 24px;background:rgba(255,255,255,.98);border-bottom:1px solid #e3e8ef}.books-site-topbar strong{font-size:14px}.books-site-topbar span{color:#7b8796;font-size:12px}.books-site-topbar a{margin-left:auto;padding:8px 11px;border:1px solid #dbe3ec;border-radius:9px;color:#334155;text-decoration:none;font-size:12px;font-weight:700}.content{padding:24px 28px 44px;max-width:1680px;margin:0 auto}.books-tabs{display:none!important}.books-admin{display:block!important}.books-admin.hidden-panel{display:block!important}.books-head{margin-bottom:12px}.books-pane{min-width:0}.books-site-route-note{margin:0 0 12px;color:#7b8796;font-size:12px}
@media(max-width:860px){.books-site-app{grid-template-columns:1fr}.sidebar{position:sticky;top:0;z-index:40;height:auto;padding:8px 10px;border-right:0;border-bottom:1px solid #e3e8ef}.books-site-brand,.books-site-footer,.books-site-group{display:none}.sidebar nav{flex-direction:row;overflow-x:auto;padding:0;gap:4px}.sidebar nav a{flex:0 0 auto;min-height:44px;white-space:nowrap}.books-site-topbar{top:60px;padding:8px 12px}.content{padding:12px 10px 28px}}
</style></head><body data-ekodibooks-admin="v1">
<div class="books-site-app">
<aside class="sidebar"><div class="books-site-brand"><small>EKODI BOOKS</small><strong>에코디서점 관리</strong></div><nav aria-label="에코디서점 전용 메뉴"><button type="button" class="books-runtime-trigger" data-section="books" aria-hidden="true" tabindex="-1"></button>${menuHtml()}</nav><div class="books-site-footer"><a href="/books">에코디서점 보기 ↗</a><a href="/admin/">최고관리자 돌아가기</a></div></aside>
<div class="books-site-main"><header class="books-site-topbar"><strong>에코디서점</strong><span>출판 · 배포 · 매출 · 인세 통합관리</span><a href="/books">서점 보기 ↗</a></header><main class="content"><p class="books-site-route-note">에코디서점 업무만 표시하는 전용 관리자 메뉴입니다.</p></main></div>
</div>
<script src="/books-admin.js" defer></script><script src="/books-finance-admin.js" defer></script><script src="/ekodibooks/admin/_shell.js" defer></script>
</body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':'ekodibooks-admin'}});
}

export function ekodiBooksAdminShellScript(){
  const js=`(()=>{'use strict';
const BASE='/ekodibooks/admin';
const VALID=new Set(['overview','pipeline','publications','finance','royalties','distribution','inquiries','services','features']);
const route=()=>{const clean=location.pathname.replace(/\\/+$/,'');const value=clean.slice(BASE.length).replace(/^\\//,'').split('/')[0]||'overview';return VALID.has(value)?value:'overview'};
const links=()=>[...document.querySelectorAll('[data-books-route]')];
function syncNav(id){for(const a of links()){const on=a.dataset.booksRoute===id;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}}
function activate(id,{push=false}={}){if(!VALID.has(id))id='overview';syncNav(id);const trigger=document.querySelector('[data-section="books"]');if(trigger&&!document.querySelector('#booksAdminSection'))trigger.click();let tries=0;const open=()=>{const tab=document.querySelector('[data-books-tab="'+id+'"]');if(tab){tab.click();if(push&&location.pathname!==BASE+'/'+id)history.pushState({books:id},'',BASE+'/'+id);if(location.hash)history.replaceState(history.state,'',location.pathname+location.search);return}if(tries++<40)setTimeout(open,50)};open()}
function boot(){const trigger=document.querySelector('[data-section="books"]');trigger?.click();for(const a of links())a.addEventListener('click',e=>{e.preventDefault();activate(a.dataset.booksRoute,{push:true})});activate(route());addEventListener('popstate',()=>activate(route()))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();`;
  return new Response(js,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
