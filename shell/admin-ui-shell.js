(()=>{
'use strict';

const VERSION=1;
const STYLE_ID='ekodi-admin-ui-shell-style';
const SURFACE='admin';
const SIDEBAR_SELECTORS=['[data-ekodi-admin-sidebar]','[data-ekodi-sidebar]','#sidebar','.admin-sidebar','.sidebar'];
const BRAND_SELECTORS=['[data-ekodi-admin-sidebar-header]','[data-ekodi-admin-brand]','.side-brand','.sidebar-brand','.admin-sidebar-brand'];
const NAV_SELECTORS=['[data-ekodi-admin-nav]','nav','.side-nav','.sidebar-nav'];
const MAIN_SELECTORS=['[data-ekodi-admin-main]','main','.admin-main','.main'];
const TOPBAR_SELECTORS=['[data-ekodi-admin-topbar]','.topbar','.admin-topbar','.app-header'];
const ACCOUNT_SELECTORS=['[data-ekodi-account]','[data-ekodi-profile]','.profile','.profile-card','.account-card','.user-profile','.user-card','.sidebar-profile'];
const LOGOUT_SELECTORS=['[data-ekodi-logout]','#logoutButton','[data-action="logout"]','a[href*="logout"]','button[name="logout"]'];
const TITLE_SELECTORS=['[data-ekodi-page-title]','[data-ekodi-header-title]','#pageTitle','.page-title','.topbar-title','.header-title'];

if(window.__EKODI_ADMIN_UI_SHELL_BOOTED)return;
if(String(document.documentElement.dataset.ekodiShellSurface||'').toLowerCase()!==SURFACE)return;
window.__EKODI_ADMIN_UI_SHELL_BOOTED=true;

let observer=null;
let scheduled=false;

function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    html[data-ekodi-shell-surface="admin"] :is([data-ekodi-admin-sidebar-header],[data-ekodi-admin-brand],.side-brand,.sidebar-brand,.admin-sidebar-brand){display:none!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar{display:flex!important;flex-direction:column!important;height:100dvh!important;min-height:0!important;overflow:hidden!important;box-sizing:border-box!important;padding-top:max(8px,env(safe-area-inset-top,0px))!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-nav{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main{height:100dvh!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-sidebar-footer{margin-top:auto!important;flex:0 0 auto!important;position:static!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-header-account-hidden,
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-header-title-hidden{display:none!important}
    @media(min-width:761px){html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-topbar{display:none!important}}
    @media(max-width:760px){html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-topbar{position:fixed!important;top:0!important;left:0!important;right:0!important;width:100%!important;z-index:2147481900!important;box-sizing:border-box!important;padding-top:env(safe-area-inset-top,0px)!important}}
  `;
  (document.head||document.documentElement).append(style);
}

function first(root,selectors){
  if(!root)return null;
  for(const selector of selectors){
    const node=root.querySelector(selector);
    if(node&&!node.closest('[data-ekodi-shell-root]'))return node;
  }
  return null;
}

function findSidebar(){return first(document,SIDEBAR_SELECTORS);}
function findNav(sidebar){return first(sidebar,NAV_SELECTORS);}
function findMain(){return first(document,MAIN_SELECTORS);}
function findTopbar(main){return first(main,TOPBAR_SELECTORS)||first(document,TOPBAR_SELECTORS);}

function removeSidebarBrand(sidebar){
  let removed=0;
  for(const selector of BRAND_SELECTORS){
    for(const node of [...sidebar.querySelectorAll(selector)]){
      if(node.dataset.ekodiAdminKeep==='true')continue;
      node.remove();
      removed+=1;
    }
  }
  if(removed>0||sidebar.dataset.ekodiAdminBrandRemoved==='true')sidebar.dataset.ekodiAdminBrandRemoved='true';
  return removed;
}

function logoutControl(sidebar){
  for(const selector of LOGOUT_SELECTORS){
    const node=sidebar.querySelector(selector)||document.querySelector(selector);
    if(node)return node;
  }
  for(const node of sidebar.querySelectorAll('a,button')){
    const text=String(node.textContent||'').trim().toLowerCase().replace(/\s+/g,' ');
    if(/^(로그아웃|log out|logout|sign out|signout)$/.test(text))return node;
  }
  return null;
}

function accountControl(sidebar){
  for(const selector of ACCOUNT_SELECTORS){
    const local=sidebar.querySelector(selector);
    if(local)return local;
    const node=document.querySelector(selector);
    if(node&&!node.closest('header,.topbar,.app-header'))return node;
  }
  return null;
}

function ensureFooter(sidebar){
  let footer=sidebar.querySelector('[data-ekodi-admin-sidebar-footer],.ekodi-admin-sidebar-footer,.side-bottom,.side-footer');
  if(!footer){
    footer=document.createElement('div');
    footer.className='ekodi-admin-sidebar-footer';
    footer.dataset.ekodiAdminSidebarFooter='true';
    sidebar.append(footer);
  }
  footer.classList.add('ekodi-admin-sidebar-footer');
  const logout=logoutControl(sidebar);
  const account=accountControl(sidebar);
  if(account&&!footer.contains(account))footer.insertBefore(account,logout&&footer.contains(logout)?logout:null);
  if(logout&&!footer.contains(logout))footer.append(logout);
  if(account)account.dataset.ekodiAdminAccountPosition='sidebar-bottom';
  if(logout)logout.dataset.ekodiAdminLogoutPosition='sidebar-bottom';
  return footer;
}

function hideDuplicateHeaderRegions(topbar){
  if(!topbar)return;
  topbar.classList.add('ekodi-admin-shell-topbar');
  for(const selector of ACCOUNT_SELECTORS){
    for(const node of topbar.querySelectorAll(selector))node.classList.add('ekodi-admin-header-account-hidden');
  }
  for(const selector of TITLE_SELECTORS){
    for(const node of topbar.querySelectorAll(selector))node.classList.add('ekodi-admin-header-title-hidden');
  }
}

function normalize(){
  scheduled=false;
  if(String(document.documentElement.dataset.ekodiShellSurface||'').toLowerCase()!==SURFACE)return;
  installStyle();
  document.body?.classList.add('ekodi-admin-shell-ui');
  document.documentElement.dataset.ekodiAdminShell='v1';

  const sidebar=findSidebar();
  if(sidebar){
    sidebar.classList.add('ekodi-admin-shell-sidebar');
    sidebar.dataset.ekodiAdminRegion='navigation';
    removeSidebarBrand(sidebar);
    const nav=findNav(sidebar);
    if(nav){nav.classList.add('ekodi-admin-shell-nav');nav.dataset.ekodiIndependentScroll='true';}
    ensureFooter(sidebar);
  }

  const main=findMain();
  if(main){
    main.classList.add('ekodi-admin-shell-main');
    main.dataset.ekodiAdminRegion='workspace';
    hideDuplicateHeaderRegions(findTopbar(main));
  }

  window.dispatchEvent(new CustomEvent('ekodi:admin-shell-ready',{detail:{version:VERSION,brandHeaderRemoved:Boolean(sidebar?.dataset.ekodiAdminBrandRemoved==='true')}}));
}

function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(normalize);
}

window.EKODIAdminUIShell=Object.freeze({
  version:VERSION,
  refresh:schedule,
  getState:()=>({
    enabled:String(document.documentElement.dataset.ekodiShellSurface||'').toLowerCase()===SURFACE,
    sidebar:Boolean(document.querySelector('.ekodi-admin-shell-sidebar')),
    brandHeaderRemoved:Boolean(document.querySelector('.ekodi-admin-shell-sidebar')?.dataset.ekodiAdminBrandRemoved==='true')
  })
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.addEventListener('ekodi-nav-changed',schedule);
window.addEventListener('ekodi-feature-installed',schedule);
window.addEventListener('resize',schedule,{passive:true});
observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ekodi-shell-surface']});
})();
