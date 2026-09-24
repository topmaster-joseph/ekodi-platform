(()=>{
'use strict';

const VERSION=3;
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
const HEADING_SELECTORS=['[data-ekodi-admin-page-heading]','.heading','.hero','.intro','.oa-head'];
const SUBNAV_SELECTORS=['[data-ekodi-admin-subnav]','.admin-subnav','.section-nav','.subnav','.tabs'];
const LANGUAGE_CONTROL_SELECTORS=['[data-ekodi-language-control]','[data-language-selector]','[data-language-switcher]','[data-admin-locale-caption]','.language-selector','.language-switcher','.lang-selector','.lang-switcher','#ekodiAdminLocaleWrap','#ekodiAdminLocale','#google_translate_element','.goog-te-gadget'];

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
    html[data-ekodi-shell-surface="admin"] :is([data-ekodi-language-control],[data-language-selector],[data-language-switcher],[data-admin-locale-caption],.language-selector,.language-switcher,.lang-selector,.lang-switcher,#ekodiAdminLocaleWrap,#ekodiAdminLocale,#google_translate_element,.goog-te-gadget){display:none!important}
    html[data-ekodi-shell-surface="admin"]{color-scheme:light;--ekodi-admin-bg:#f4f7fb;--ekodi-admin-panel:#fff;--ekodi-admin-text:#172033;--ekodi-admin-muted:#65788d;--ekodi-admin-line:#d9e3ec;--ekodi-admin-sidebar:#0b1f36;--ekodi-admin-sidebar-line:#173653;--ekodi-admin-active:#174b7b;--ekodi-admin-radius:12px;--ekodi-admin-content-max:1480px}
    html[data-ekodi-shell-surface="admin"] body{background:var(--ekodi-admin-bg)!important;color:var(--ekodi-admin-text)!important;overflow-x:hidden!important}
    html[data-ekodi-shell-surface="admin"] :is(button,a,input,select,textarea):focus-visible{outline:3px solid #8fc0ea!important;outline-offset:2px!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main>*{max-width:var(--ekodi-admin-content-max);margin-left:auto;margin-right:auto}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-heading{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:18px!important;min-width:0!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-heading :is(h1,[data-ekodi-page-title],#pageTitle){font-size:clamp(24px,2.2vw,32px)!important;line-height:1.22!important;letter-spacing:-.035em!important;color:var(--ekodi-admin-text)!important;word-break:keep-all!important;overflow-wrap:normal!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-heading :is(p,.muted,.eyebrow){line-height:1.6!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-subnav{display:flex;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;overscroll-behavior-x:contain}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-subnav :is(a,button){flex:0 0 auto;min-height:38px;white-space:nowrap}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main :is(.panel,.card,.status,.module,[data-ekodi-admin-card]){border-radius:var(--ekodi-admin-radius)!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main :is(.panel,.module,[data-ekodi-admin-card]){min-width:0}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main :is(.service-list,.accounts,.list,[data-ekodi-admin-list-layout="single"]){min-width:0}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main [data-ekodi-admin-list-layout="single"]{display:grid!important;grid-template-columns:1fr!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main :is(.table-wrap,.oa-table){max-width:100%;overflow:auto;overscroll-behavior:contain}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main table{width:100%;border-collapse:collapse}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main th{position:sticky;top:0;z-index:1}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main :is(button,.button,.mini,.oa-button,[role="button"]){min-height:38px}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main :is(.empty,.note,.panel-lead,.muted){font-size:max(12px,0.78rem)!important;line-height:1.6!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar{display:flex!important;flex-direction:column!important;height:100dvh!important;min-height:0!important;overflow:hidden!important;box-sizing:border-box!important;padding-top:max(8px,env(safe-area-inset-top,0px))!important;background:var(--ekodi-admin-sidebar)!important;color:#e9f2fb!important;border-color:var(--ekodi-admin-sidebar-line)!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar :is(.nav,[data-ekodi-admin-nav] a,[data-ekodi-admin-nav] button){color:#dbe8f6!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar :is(.nav,[data-ekodi-admin-nav] a,[data-ekodi-admin-nav] button):hover{background:#102c49!important;color:#fff!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar :is(.nav.active,[aria-current="page"]){background:var(--ekodi-admin-active)!important;color:#fff!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main{background:var(--ekodi-admin-bg)!important;color:var(--ekodi-admin-text)!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main :is(input:not([type="checkbox"]):not([type="radio"]),select,textarea){min-height:42px;border:1px solid #bccbd9;border-radius:10px;background:#fff;color:#203247;padding:9px 11px;font:inherit}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main :is(input,select,textarea):focus{outline:none;border-color:#4d8fc7;box-shadow:0 0 0 3px #dceeff}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main table{color:#2d4157;background:#fff}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main th{background:#f4f7fa;color:#43566a}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main :is(.section,.module,.card,[data-ekodi-admin-card]){border-color:var(--ekodi-admin-line)}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar{display:flex!important;flex-direction:column!important;height:100dvh!important;min-height:0!important;overflow:hidden!important;box-sizing:border-box!important;padding-top:max(8px,env(safe-area-inset-top,0px))!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-nav{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-nav[data-ekodi-admin-nav-mode="primary"]{flex:0 0 auto!important;overflow:hidden!important;overscroll-behavior:auto!important;scrollbar-gutter:auto!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-nav[data-ekodi-admin-nav-overflow="true"]{flex:1 1 auto!important;overflow-y:auto!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-nav :is(a,button){min-height:40px!important;line-height:1.35!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-nav .admin-nav-group-label{font-size:11px!important;line-height:1.4!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main{height:100dvh!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-sidebar-footer{margin-top:auto!important;flex:0 0 auto!important;position:static!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-module-health-link{display:flex!important;align-items:center!important;gap:8px!important;min-height:40px!important;margin:4px 8px 8px!important;padding:8px 10px!important;border:1px solid #294b6b!important;border-radius:9px!important;background:#102c49!important;color:#e6f2ff!important;text-decoration:none!important;font-size:13px!important;font-weight:800!important;line-height:1.3!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-module-health-link:hover{background:#174b7b!important;color:#fff!important}
    html[data-ekodi-shell-surface="admin"] .ekodi-admin-header-account-hidden{display:none!important}
    @media(min-width:761px){html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-topbar{display:none!important}}
    @media(max-width:760px){
      html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-topbar{position:sticky!important;top:0!important;left:auto!important;right:auto!important;width:auto!important;min-height:56px!important;z-index:1200!important;box-sizing:border-box!important;padding:max(8px,env(safe-area-inset-top,0px)) 12px 8px!important;background:#fff!important;color:var(--ekodi-admin-text)!important;border-bottom:1px solid var(--ekodi-admin-line)!important;box-shadow:none!important}
      html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-topbar .menu{color:var(--ekodi-admin-text)!important;background:#fff!important;border:1px solid var(--ekodi-admin-line)!important;border-radius:12px!important;width:42px!important;height:42px!important}
      html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-topbar #pageTitle{display:block!important;color:var(--ekodi-admin-text)!important;font-size:16px!important;line-height:1.3!important;margin:0!important}
      html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main{height:auto!important;min-height:calc(100dvh - 56px)!important;overflow:visible!important}
      html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main>*{max-width:100%!important}
      html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-heading{flex-direction:column!important;gap:10px!important}
      html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main :is(button,.button,.mini,.oa-button,[role="button"]){min-height:44px}
    }
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
function findHeading(main){return first(main,HEADING_SELECTORS);}
function findSubnav(main){return first(main,SUBNAV_SELECTORS);}
function visibleNavItems(nav){return [...(nav?.querySelectorAll?.(':scope > a,:scope > button,:scope > [data-admin-section],:scope > [data-section]')||[])].filter(node=>!node.hidden&&node.getAttribute('aria-hidden')!=='true');}
function normalizeMainRegions(main){
  if(!main)return;
  main.setAttribute('data-ekodi-admin-main','');
  const heading=findHeading(main);
  if(heading){heading.classList.add('ekodi-admin-shell-heading');heading.setAttribute('data-ekodi-admin-page-heading','');}
  const subnav=findSubnav(main);
  if(subnav){subnav.classList.add('ekodi-admin-shell-subnav');subnav.setAttribute('data-ekodi-admin-subnav','');if(!subnav.getAttribute('aria-label'))subnav.setAttribute('aria-label','세부 관리 메뉴');}
}

function removeAdminLanguageControls(){
  let removed=0;
  for(const selector of LANGUAGE_CONTROL_SELECTORS){
    for(const node of [...document.querySelectorAll(selector)]){
      node.remove();
      removed+=1;
    }
  }
  document.documentElement.dataset.ekodiAdminLanguageControl='disabled';
  return removed;
}

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

function ensureModuleHealthEntry(footer){
  const host=String(location.hostname||'').toLowerCase();
  const central=host==='ekodi.kr'&&location.pathname.startsWith('/admin');
  if(!central)return null;
  let link=footer.querySelector('[data-ekodi-service-module-health]');
  if(!link){
    link=document.createElement('a');
    link.className='ekodi-admin-module-health-link';
    link.dataset.ekodiServiceModuleHealth='true';
    link.href='https://ekodi.kr/admin/services/service-modules';
    link.textContent='공통·전문 모듈 점검';
    link.setAttribute('aria-label','공통·전문 서비스 모듈 활성화 및 정상 여부 점검');
    footer.prepend(link);
  }
  return link;
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
  ensureModuleHealthEntry(footer);
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
  topbar.setAttribute('data-ekodi-admin-topbar','');
  for(const selector of ACCOUNT_SELECTORS){
    for(const node of topbar.querySelectorAll(selector))node.classList.add('ekodi-admin-header-account-hidden');
  }
  for(const selector of TITLE_SELECTORS){
    for(const node of topbar.querySelectorAll(selector)){
      node.classList.remove('ekodi-admin-header-title-hidden');
      if(node.parentElement?.hidden)node.parentElement.hidden=false;
    }
  }
}

function normalize(){
  scheduled=false;
  if(String(document.documentElement.dataset.ekodiShellSurface||'').toLowerCase()!==SURFACE)return;
  installStyle();
  removeAdminLanguageControls();
  document.body?.classList.add('ekodi-admin-shell-ui');
  document.documentElement.dataset.ekodiAdminShell='v3';
  document.documentElement.dataset.ekodiAdminSurfaceContract='readable-direct-v1';

  const sidebar=findSidebar();
  if(sidebar){
    sidebar.classList.add('ekodi-admin-shell-sidebar');
    sidebar.dataset.ekodiAdminRegion='navigation';
    removeSidebarBrand(sidebar);
    const nav=findNav(sidebar);
    if(nav){
      const primaryOnly=nav.dataset.ekodiAdminNavMode==='primary';
      nav.classList.add('ekodi-admin-shell-nav');
      nav.setAttribute('data-ekodi-admin-nav','');
      if(!nav.getAttribute('aria-label'))nav.setAttribute('aria-label','관리자 메뉴');
      const itemCount=visibleNavItems(nav).length;
      const overflowRisk=primaryOnly&&itemCount>8;
      nav.dataset.ekodiIndependentScroll=primaryOnly&&!overflowRisk?'false':'true';
      nav.dataset.ekodiAdminNavContract=overflowRisk?'primary-scroll-fallback':primaryOnly?'primary-fixed':'legacy-scroll';
      if(overflowRisk)nav.dataset.ekodiAdminNavOverflow='true';else delete nav.dataset.ekodiAdminNavOverflow;
    }
    ensureFooter(sidebar);
  }

  const main=findMain();
  if(main){
    main.classList.add('ekodi-admin-shell-main');
    main.dataset.ekodiAdminRegion='workspace';
    normalizeMainRegions(main);
    hideDuplicateHeaderRegions(findTopbar(main));
  }

  window.dispatchEvent(new CustomEvent('ekodi:admin-shell-ready',{detail:{version:VERSION,brandHeaderRemoved:Boolean(sidebar?.dataset.ekodiAdminBrandRemoved==='true')}}));
}

function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(normalize);
}

function auditState(){
  const sidebar=document.querySelector('.ekodi-admin-shell-sidebar');
  const nav=sidebar?.querySelector('.ekodi-admin-shell-nav')||null;
  const main=document.querySelector('.ekodi-admin-shell-main');
  const heading=main?.querySelector('.ekodi-admin-shell-heading')||null;
  const subnav=main?.querySelector('.ekodi-admin-shell-subnav')||null;
  const footer=sidebar?.querySelector('.ekodi-admin-sidebar-footer')||null;
  const itemCount=visibleNavItems(nav).length;
  return Object.freeze({
    enabled:String(document.documentElement.dataset.ekodiShellSurface||'').toLowerCase()===SURFACE,
    sidebar:Boolean(sidebar),
    main:Boolean(main),
    heading:Boolean(heading),
    subnav:Boolean(subnav),
    footer:Boolean(footer),
    navItemCount:itemCount,
    navOverflowFallback:nav?.dataset.ekodiAdminNavOverflow==='true',
    brandHeaderRemoved:Boolean(sidebar?.dataset.ekodiAdminBrandRemoved==='true'),
    languageControlDisabled:document.documentElement.dataset.ekodiAdminLanguageControl==='disabled',
    surfaceContract:document.documentElement.dataset.ekodiAdminSurfaceContract||''
  });
}
window.EKODIAdminUIShell=Object.freeze({
  version:VERSION,
  refresh:schedule,
  audit:auditState,
  getState:auditState
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.addEventListener('ekodi-nav-changed',schedule);
window.addEventListener('ekodi-feature-installed',schedule);
window.addEventListener('resize',schedule,{passive:true});
observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ekodi-shell-surface']});
})();
