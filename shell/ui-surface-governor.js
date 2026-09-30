(()=>{
'use strict';
const VERSION=1;
const ADMIN_SURFACES=new Set(['tenant-admin','platform-admin','service-admin']);
const SIDEBAR=['[data-ekodi-admin-sidebar]','.ekodi-admin-shell-sidebar','.sidebar','.admin-sidebar'];
const MAIN=['[data-ekodi-admin-main]','.ekodi-admin-shell-main','main','.admin-main'];
const TOPBAR=['[data-ekodi-admin-topbar]','.ekodi-admin-shell-topbar','.topbar','.admin-topbar','.app-header'];
const first=selectors=>selectors.map(selector=>document.querySelector(selector)).find(Boolean)||null;
function uiSurface(){const root=document.documentElement;const explicit=String(root.dataset.ekodiUiSurface||'').trim().toLowerCase();if(explicit)return explicit;if(String(root.dataset.ekodiShellSurface||'').trim().toLowerCase()!=='admin')return '';const authority=String(root.dataset.ekodiAuthorityScope||'').trim().toLowerCase();if(authority==='tenant')return 'tenant-admin';if(authority==='service')return 'service-admin';return 'platform-admin';}
function set(node,name,value,priority='important'){if(node)node.style.setProperty(name,value,priority);}
function visibleTopOffset(){const topbar=first(TOPBAR);if(!topbar)return 0;const style=getComputedStyle(topbar);if(style.display==='none'||style.visibility==='hidden')return 0;return Math.max(0,Math.round(topbar.getBoundingClientRect().height));}
function mark(surface,sidebar,main,nav){document.documentElement.dataset.ekodiUiGovernor=`v${VERSION}`;document.documentElement.dataset.ekodiUiSurface=surface;if(sidebar)sidebar.dataset.ekodiUiRegion='primary-navigation';if(main){main.dataset.ekodiUiRegion='workspace';main.dataset.ekodiScrollOwner='workspace';}if(nav)nav.dataset.ekodiIndependentScroll='false';}
function applyAdminContract(){const surface=uiSurface();if(!ADMIN_SURFACES.has(surface))return;const sidebar=first(SIDEBAR);const main=first(MAIN);const nav=sidebar?.querySelector('[data-ekodi-admin-nav],nav,.side-nav,.sidebar-nav')||null;mark(surface,sidebar,main,nav);if(matchMedia('(max-width:760px)').matches)return;const topOffset=visibleTopOffset();const frame=sidebar?.parentElement||main?.parentElement||null;set(document.body,'height','100dvh');set(document.body,'overflow','hidden');if(frame){set(frame,'height',`calc(100dvh - ${topOffset}px)`);set(frame,'min-height','0');set(frame,'overflow','hidden');}if(sidebar){set(sidebar,'position','sticky');set(sidebar,'top','0');set(sidebar,'align-self','stretch');set(sidebar,'height','100%');set(sidebar,'max-height','100%');set(sidebar,'overflow','hidden');}if(nav){set(nav,'overflow-y','hidden');set(nav,'overscroll-behavior','none');}if(main){set(main,'height','100%');set(main,'min-height','0');set(main,'overflow-y','auto');set(main,'overflow-x','hidden');set(main,'overscroll-behavior','contain');}}
let queued=false;
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;applyAdminContract();});}
window.EKODIUISurfaceGovernor=Object.freeze({version:VERSION,apply:schedule,getSurface:uiSurface});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
for(const event of ['ekodi:admin-shell-ready','ekodi-admin-ready','ekodi-nav-changed','ekodi-feature-installed'])window.addEventListener(event,schedule);
window.addEventListener('resize',schedule,{passive:true});
new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-ekodi-ui-surface','data-ekodi-shell-surface'],childList:true,subtree:true});
})();
