(async()=>{
'use strict';
const [{adminMenuOrder},{mountAdminSidebar,renderAdminSidebar}]=await Promise.all([
  import('./admin-menu-registry.js'),import('./admin-sidebar.js')
]);
const sidebar=document.querySelector('.sidebar');
const nav=sidebar?.querySelector('nav');
const content=document.querySelector('.content');
if(!sidebar||!nav||!content)return;
renderAdminSidebar(nav);

const INTERNAL=new Set(['services','deployments','policies']);
const ORDER=Object.freeze(adminMenuOrder());
const RANK=new Map(ORDER.map((section,index)=>[section,index+1]));
const DEMAND={
  campus:'campus',aiops:'aiops','ai-module-spec':'ai-module-spec','ai-membership':'aimembers',
  health:'health','api-cost':'api-cost',storage:'storage',security:'security',work:'work',
  clients:'clients',community:'community',books:'books',social:'social',affiliates:'affiliates',
  'marketing-ai':'marketing',devices:'devices','life-ai':'life-ai'
};
const pairMap=value=>new Map(value.split(' ').map(pair=>pair.split(':')));
const HASH=pairMap('#sites:sites #ai-ops:aiops #aiops:aiops #ai-module-spec:ai-module-spec #ai-membership:ai-membership #health:health #api-cost:api-cost #storage:storage #storige:storage #security:security #architecture:architecture #devices:devices #campus:campus #work:work #marketing-ai:marketing-ai #finance:finance #organization:organization #workspace:workspace #clients:clients #admins:admins #community:community #books:books #social:social #affiliates:affiliates #policies:policies #services:services #deployments:deployments #release:deployments');
const CANON=pairMap('sites:#sites aiops:#ai-ops ai-module-spec:#ai-module-spec ai-membership:#ai-membership health:#health api-cost:#api-cost storage:#storage security:#security architecture:#architecture devices:#devices campus:#campus work:#work marketing-ai:#marketing-ai finance:#finance organization:#organization workspace:#workspace clients:#clients admins:#admins community:#community books:#books social:#social affiliates:#affiliates');
let requested='';
let sitesLoading;
const demandLoading=new Map();

function installCompactStyle(){
  if(document.querySelector('#ekodi-admin-menu-density'))return;
  const style=document.createElement('style');
  style.id='ekodi-admin-menu-density';
  style.textContent='body.admin-compact .side-caption{margin-bottom:10px!important}body.admin-compact .sidebar nav{display:flex!important;flex-direction:column!important;gap:0!important;row-gap:0!important;overflow:visible!important;max-height:none!important;padding-right:0!important;flex:0 0 auto!important}body.admin-compact .sidebar nav>.nav{min-height:30px!important;padding:4px 9px!important;margin:0!important;border-radius:8px!important;line-height:1.1!important;gap:9px!important}body.admin-compact .sidebar nav>.nav span{font-size:12px!important;line-height:1.1!important}body.admin-compact .side-bottom{padding-top:8px!important}';
  document.head.append(style);
}
function sectionOf(item){
  if(window.EKODIAdminSidebar?.sectionOf)return window.EKODIAdminSidebar.sectionOf(item);
  if(item?.dataset?.deviceControlNav==='true')return'devices';
  const raw=String(item?.dataset?.section||item?.dataset?.lazySection||'').trim();
  return raw==='marketing'?'marketing-ai':raw;
}
const panelTargets=panel=>String(panel?.dataset?.panel||'').split(/\s+/).filter(Boolean);
const allNav=()=>nav.querySelectorAll('.nav[data-section],.nav[data-lazy-section],.nav[data-device-control-nav],a.nav[href]');
const isInternal=section=>INTERNAL.has(String(section||'').trim());
const isInternalNav=item=>isInternal(sectionOf(item));
const hasPanel=section=>Boolean(section&&[...content.querySelectorAll('[data-panel]')].some(panel=>panelTargets(panel).includes(section)));

function applyOrder(){
  if(window.EKODIAdminSidebar?.sync)return window.EKODIAdminSidebar.sync(document);
  let unknown=500;
  for(const item of allNav()){
    if(isInternalNav(item)){item.style.order='9999';continue;}
    const rank=RANK.get(sectionOf(item))??unknown++;
    if(item.style.order!==String(rank))item.style.order=String(rank);
    if(item.dataset.menuOrder!==String(rank))item.dataset.menuOrder=String(rank);
  }
  nav.dataset.stableMenuOrder='true';
}
function enforcePolicy(){
  for(const item of allNav()){
    if(!isInternalNav(item))continue;
    item.hidden=true;
    item.dataset.aiInternal=sectionOf(item)||item.getAttribute('href')||'internal';
    item.setAttribute('aria-hidden','true');
    item.tabIndex=-1;
    item.classList.remove('active');
  }
  applyOrder();
}
const navItemFor=section=>[...allNav()].find(item=>sectionOf(item)===section&&!isInternalNav(item))||null;
function syncTitle(section){
  const title=document.querySelector('#pageTitle');
  const item=navItemFor(section);
  const label=item?.querySelector('span')?.textContent?.trim()||item?.textContent?.trim();
  if(title&&label&&title.textContent!==label)title.textContent=label;
  window.dispatchEvent(new CustomEvent('ekodi-admin-section-changed',{detail:{section}}));
}
function activatePanel(section){
  if(!section||!hasPanel(section))return false;
  requested=section;
  for(const panel of content.querySelectorAll('[data-panel]')){
    const visible=panelTargets(panel).includes(section);
    panel.classList.toggle('hidden-panel',!visible);
    if(visible)panel.removeAttribute('hidden');else panel.hidden=true;
  }
  for(const item of allNav())item.classList.toggle('active',!isInternalNav(item)&&sectionOf(item)===section);
  syncTitle(section);
  const hash=CANON.get(section);
  if(hash&&location.hash!==hash)history.replaceState(null,'',hash);
  if(section==='architecture'&&!window.EKODISystemMap)import('./system-health-admin.js').catch(console.error);
  sidebar.classList.remove('open');
  return true;
}
async function openSites(){
  requested='sites';
  if(!sitesLoading)sitesLoading=import('./homepage-admin.js').then(module=>{
    module.mountHomepageAdmin();
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{section:'sites'}}));
    return module;
  }).catch(error=>{sitesLoading=null;console.error(error);throw error;});
  await sitesLoading;
  applyOrder();
  activatePanel('sites');
  navItemFor('campus')?.classList.add('active');
  syncTitle('campus');
}
function fallbackDemand(section){
  const selector=section==='aiops'
    ?'[data-demand-feature="aiops"],[data-section="aiops"]'
    :`[data-demand-feature="${section}"],[data-lazy-section="${section}"],[data-section="${section}"]`;
  nav.querySelector(selector)?.click();
}
function requestDemand(section){
  const key=DEMAND[section];
  if(!key||!window.EKODIAdminDemand?.activate){fallbackDemand(section);return null;}
  if(demandLoading.has(section))return demandLoading.get(section);
  const task=Promise.resolve(window.EKODIAdminDemand.activate(key)).then(()=>{
    applyOrder();
    if(!activatePanel(section)){
      const real=navItemFor(section);
      if(real&&!real.dataset.demandFeature)real.click();
      queueMicrotask(()=>activatePanel(section));
    }
  }).catch(error=>{
    console.error(`[EKODI Admin] ${section} demand activation failed`,error);
    fallbackDemand(section);
  }).finally(()=>demandLoading.delete(section));
  demandLoading.set(section,task);
  return task;
}
function routeInternal(){
  requested='aiops';
  if(location.hash!=='#ai-ops')history.replaceState(null,'','#ai-ops');
  requestDemand('aiops');
}
const explicitHash=()=>HASH.get(location.hash.toLowerCase())||'';
function reconcile(){
  enforcePolicy();
  if(!requested)return;
  if(requested==='sites'&&!hasPanel('sites'))openSites();
  else if(!activatePanel(requested))requestDemand(requested);
}

nav.addEventListener('click',event=>{
  const item=event.target.closest('.nav[data-section],.nav[data-lazy-section],.nav[data-device-control-nav],a.nav[href]');
  if(!item)return;
  if(isInternalNav(item)){event.preventDefault();event.stopImmediatePropagation();return routeInternal();}
  const section=sectionOf(item);
  if(!section)return;
  if(section==='sites'){event.preventDefault();event.stopImmediatePropagation();return openSites();}
  requested=section;
  queueMicrotask(()=>{if(!activatePanel(section))requestDemand(section);});
},true);

content.addEventListener('click',event=>{
  const control=event.target.closest('[data-campus-section]');
  if(!control||!isInternal(control.dataset.campusSection))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  routeInternal();
},true);

window.addEventListener('ekodi-nav-changed',reconcile);
window.addEventListener('ekodi-feature-installed',reconcile);
window.addEventListener('ekodi-admin-ready',()=>{
  enforcePolicy();
  const section=explicitHash();
  if(section&&isInternal(section))return routeInternal();
  if(section==='sites')return openSites();
  requested=section||'campus';
  if(!activatePanel(requested))requestDemand(requested);
});
window.addEventListener('hashchange',()=>{
  const section=explicitHash();
  if(!section)return;
  if(isInternal(section))return routeInternal();
  if(section==='sites')return openSites();
  requested=section;
  if(!activatePanel(section))requestDemand(section);
});

installCompactStyle();
mountAdminSidebar(document);
enforcePolicy();
const initial=explicitHash();
if(initial&&isInternal(initial))routeInternal();
else if(initial==='sites')openSites();
else requested=initial||'campus';

window.EKODIAdminPanels=Object.freeze({
  activate:section=>{
    if(isInternal(section))return routeInternal();
    if(section==='sites')return openSites();
    requested=section;
    return activatePanel(section)||requestDemand(section);
  },
  current:()=>requested,
  internalSections:Object.freeze([...INTERNAL]),
  visibleMenuOrder:ORDER
});
import('./admin-menu-runtime.js').catch(console.error);
})();