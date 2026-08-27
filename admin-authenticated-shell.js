(() => {
'use strict';
const TOKEN_KEY='ekodi-auth-token';
const ROUTE_KEY='ekodi-admin-target-route';
const ASSET_VERSION='__EKODI_ADMIN_ASSET_VERSION__';
const app=document.querySelector('#app');
const loginScreen=document.querySelector('#loginScreen');
const loginLink=document.querySelector('#centralAdminLogin');
const postAuthStyles = ['compact-control-center.css'];
const criticalPostAuthScripts = ['ekodi-message-ui.js','compact-control-center.js','admin-menu-layout.js','admin-demand-loader.js'];
const routeDemand={campus:'campus','ai-ops':'aiops','ai-module-spec':'ai-module-spec','ai-membership':'aimembers',health:'health',storage:'storage',security:'security',devices:'devices',work:'work','marketing-ai':'marketing',deployments:'deployments'};
const routeSection={operations:'overview','ai-ops':'aiops','ai-module-spec':'ai-module-spec','ai-membership':'ai-membership','marketing-ai':'marketing-ai'};
let started=false,routeAttempts=0;
function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
function authenticated(){return Boolean(token() && app && !app.hidden)}
function assetUrl(path){return`${path}${path.includes('?')?'&':'?'}v=${encodeURIComponent(ASSET_VERSION)}`}
function s(node,styles,priority=''){if(node)for(const[name,value]of Object.entries(styles))node.style.setProperty(name,value,priority)}
function applyOfficialAdminSurface() {
const root=document.documentElement;
root.dataset.ekodiShellSurface = 'admin';
root.dataset.ekodiAdminUi = 'official';
const tokens={
'--ekodi-ui-bg': '#071522','--ekodi-ui-surface': '#0B1D2E','--ekodi-ui-surface-raised':'#10263A',
'--ekodi-ui-border': '#24425E','--ekodi-ui-text': '#F4F7FB','--ekodi-ui-muted':'#9FB1C3',
'--ekodi-ui-accent': '#8EC8FF','--ekodi-ui-radius':'16px'};
for(const[name,value]of Object.entries(tokens))if(!root.style.getPropertyValue(name))root.style.setProperty(name,value)
}
function keepLoginInteractive(){
if(!loginScreen||authenticated())return;
loginScreen.style.position='relative';
loginScreen.style.zIndex = '1000';
loginScreen.style.pointerEvents = 'auto';
if(loginLink){loginLink.style.position='relative';loginLink.style.zIndex='1';loginLink.style.pointerEvents = 'auto'}
}
function loadStyle(href){
if(document.querySelector(`link[data-ekodi-postauth-style="${href}"]`))return;
const link=document.createElement('link');link.rel='stylesheet';link.href=assetUrl(href);link.dataset.ekodiPostauthStyle=href;document.head.appendChild(link)
}
function loadScript(src){return new Promise(resolve=>{
if(document.querySelector(`script[data-ekodi-postauth-script="${src}"]`))return resolve();
const script=document.createElement('script');script.src=assetUrl(src);script.dataset.ekodiPostauthScript=src;
script.addEventListener('load',resolve,{once:true});
script.addEventListener('error',()=>{console.warn(`[EKODI Admin] optional post-auth asset failed: ${src}`);resolve()},{once:true});document.body.appendChild(script)
})}
function installSharedAdminLayout(){
const sidebar=document.querySelector('.sidebar'),nav=sidebar?.querySelector('nav'),main=app?.querySelector('main'),content=main?.querySelector('.content'),topbar=main?.querySelector('.topbar'),profile=document.querySelector('.profile'),sideBottom=sidebar?.querySelector('.side-bottom'),logoutButton=document.querySelector('#logoutButton'),pageTitle=document.querySelector('#pageTitle'),adminTools=document.querySelector('.hero[data-panel~="overview"] .hero-actions .secondary');
if(!app||!sidebar||!nav||!main||!content||!sideBottom)return;
document.body.classList.add('ekodi-admin-shell-v2');app.dataset.ekodiAdminShell='shared-v2';sidebar.dataset.ekodiAdminRegion='navigation';main.dataset.ekodiAdminRegion='workspace';nav.dataset.ekodiIndependentScroll = 'true';content.dataset.ekodiIndependentScroll = 'workspace';
if(adminTools)adminTools.href='#ai-ops';
if(profile&&!sideBottom.contains(profile)){profile.classList.add('side-profile');sideBottom.insertBefore(profile, logoutButton || null)}
if(profile){s(profile,{display:'flex','grid-template-columns':'none','align-items':'center',gap:'8px','min-width':'0',width:'100%'},'important');const identity=profile.querySelector('div'),email=profile.querySelector('small');s(identity,{'min-width':'0'},'important');s(email,{display:'block','max-width':'145px',overflow:'hidden','text-overflow':'ellipsis','white-space':'nowrap','word-break':'normal'},'important')}
if(pageTitle?.parentElement&&topbar?.contains(pageTitle.parentElement))pageTitle.parentElement.hidden = true;
s(document.body,{height:'100dvh',overflow:'hidden'});s(app,{height:'100dvh',overflow:'hidden'});s(sidebar,{height:'100dvh',overflow:'hidden'},'important');sideBottom.style.setProperty('position', 'static', 'important');s(sideBottom,{flex:'0 0 auto'},'important');nav.style.setProperty('flex', '1 1 auto', 'important');nav.style.setProperty('overflow-y', 'auto', 'important');s(nav,{'min-height':'0','overflow-x':'hidden','max-height':'none','overscroll-behavior':'contain'},'important');main.style.setProperty('overflow-y', 'auto');s(main,{height:'100dvh','min-height':'0','overflow-x':'hidden','overscroll-behavior':'contain'});
if(topbar)topbar.style.setProperty('display',matchMedia('(max-width:760px)').matches ? 'flex' : 'none','important')
}
function restoreRoute(){
let route='';try{route=sessionStorage.getItem(ROUTE_KEY)||''}catch{}if(!route||!authenticated())return;
const demand=routeDemand[route];if(demand&&window.EKODIAdminDemand?.activate){window.EKODIAdminDemand.activate(demand);try{sessionStorage.removeItem(ROUTE_KEY)}catch{}return}
const section=routeSection[route]||route;if(window.EKODIAdminPanels?.activate){window.EKODIAdminPanels.activate(section);try{sessionStorage.removeItem(ROUTE_KEY)}catch{}return}
const target=document.querySelector(`.sidebar [data-section="${section}"],.sidebar [data-lazy-section="${section}"]`);if(target){target.click();try{sessionStorage.removeItem(ROUTE_KEY)}catch{}return}if(routeAttempts++<8)setTimeout(restoreRoute,180)
}
function deactivateMallFreeOps() {
const panel=document.querySelector('#mallFreeOpsPanel');if(!panel)return;
const button=document.querySelector('.sidebar [data-admin-link="mall-free-ops"]'),frame=panel.querySelector('[data-mall-free-ops-frame]');panel.hidden=true;panel.classList.add('hidden-panel');button?.classList.remove('active');if(frame?.getAttribute('src'))frame.removeAttribute('src')
}
function installMallFreeOpsIsolation() {
const nav=document.querySelector('.sidebar nav');if(!nav||nav.dataset.mallFreeOpsIsolationBound)return;nav.dataset.mallFreeOpsIsolationBound='true';
nav.addEventListener('click',event=>{const item=event.target?.closest?.('.nav');if(!item)return;if(item.dataset.adminLink==='mall-free-ops'||item.dataset.section==='mall-free-ops'){const panel=document.querySelector('#mallFreeOpsPanel');if(panel?.hidden)panel.hidden=false}else deactivateMallFreeOps()},true);
window.addEventListener('hashchange',()=>{if(location.hash!=='#mall-free-ops')deactivateMallFreeOps()});if(location.hash!=='#mall-free-ops')deactivateMallFreeOps()
}
function announceReady(){document.documentElement.dataset.ekodiAdminReady='true';try{performance.mark('ekodi-admin-ready')}catch{}window.dispatchEvent(new CustomEvent('ekodi-admin-ready'))}
async function startAuthenticatedShell(){
if (started || !authenticated()) return;started=true;applyOfficialAdminSurface();document.documentElement.dataset.ekodiAdminReady='loading';
if(location.pathname.startsWith('/legacy')){loadStyle('control-center-ops.css');loadStyle('control-center-finance.css');await loadScript('control-center.js');announceReady();return}
for(const href of postAuthStyles)loadStyle(href);await Promise.all(criticalPostAuthScripts.map(loadScript));installSharedAdminLayout();installMallFreeOpsIsolation();announceReady();restoreRoute()
}
function onStateChange(){if(authenticated())return startAuthenticatedShell();keepLoginInteractive();if(!started&&['#campus','#operations','#policies','#ai-ops','#devices','#work','#marketing-ai','#deployments','#storage'].includes(location.hash))document.documentElement.dataset.ekodiAdminPendingHash=location.hash.slice(1)}
keepLoginInteractive();onStateChange();
window.addEventListener('ekodi-authenticated', onStateChange);window.addEventListener('ekodi-admin-route-pending',restoreRoute);
window.addEventListener('ekodi-nav-changed',()=>{installSharedAdminLayout();restoreRoute()});window.addEventListener('ekodi-feature-installed',()=>{installSharedAdminLayout();restoreRoute()});matchMedia('(max-width:760px)').addEventListener?.('change',installSharedAdminLayout)
})();
