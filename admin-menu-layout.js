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
const DEMAND_KEYS=new Map([
  ['campus','campus'],['public-site-controls','public-site-controls'],['aiops','aiops'],['devotional','devotional'],['ai-module-spec','ai-module-spec'],['ai-membership','aimembers'],
  ['health','health'],['api-cost','api-cost'],['storage','storage'],['security','security'],['work','work'],
  ['clients','clients'],['community','community'],['books','books'],['social','social'],['affiliates','affiliates'],
  ['marketing-ai','marketing'],['devices','devices'],['life-ai','life-ai'],['personal-finance','personal-finance']
]);
const pairMap=value=>new Map(value.split(' ').map(pair=>pair.split(':')));
const HASH=pairMap('#sites:sites #common-services:common-services #capabilities:capabilities #capability-center:capabilities #ai-ops:aiops #aiops:aiops #devotional:devotional #ai-module-spec:ai-module-spec #ai-membership:ai-membership #personal-finance:personal-finance #health:health #api-cost:api-cost #storage:storage #storige:storage #security:security #architecture:architecture #devices:devices #campus:campus #public-site-controls:public-site-controls #work:work #communication:communication #marketing-ai:marketing-ai #finance:finance #organization:organization #workspace:workspace #clients:clients #admins:admins #community:community #cheonggye-members:cheonggye-members #books:books #social:social #mall-ai-sales:affiliates #affiliates:affiliates #policies:policies #services:services #deployments:deployments #release:deployments');
const CANON=pairMap('sites:#sites common-services:#common-services capabilities:#capabilities aiops:#ai-ops devotional:#devotional ai-module-spec:#ai-module-spec ai-membership:#ai-membership personal-finance:#personal-finance health:#health api-cost:#api-cost storage:#storage security:#security architecture:#architecture devices:#devices campus:#campus public-site-controls:#public-site-controls work:#work communication:#communication marketing-ai:#marketing-ai finance:#finance organization:#organization workspace:#workspace clients:#clients admins:#admins community:#community cheonggye-members:#cheonggye-members books:#books social:#social affiliates:#mall-ai-sales');
let requestedSection = '';
let sitesLoading,cheonggyeLoading,last='',queued=false,running=false,again=false,dc=false;
const demandLoading=new Map();
function installCompactStyle(){
  if(document.querySelector('#ekodi-admin-menu-density'))return;
  const style=document.createElement('style');
  style.id='ekodi-admin-menu-density';
  style.textContent='body.admin-compact .side-caption{margin-bottom:10px!important}body.admin-compact .sidebar nav{display:flex!important;flex-direction:column!important;gap:0!important;row-gap:0!important;overflow:visible!important;max-height:none!important;padding-right:0!important;flex:0 0 auto!important}body.admin-compact .sidebar nav>.nav{min-height:30px!important;padding:4px 9px!important;margin:0!important;border-radius:8px!important;line-height:1.1!important;gap:9px!important}body.admin-compact .sidebar nav>.nav span{font-size:12px!important;line-height:1.1!important}body.admin-compact .side-bottom{padding-top:8px!important}';
  document.head.append(style);
}
function ensureFeatureStyle(href){
  if(document.querySelector(`link[data-ekodi-feature-style="${href}"]`))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.ekodiFeatureStyle=href;document.head.append(link);
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
  if(last===section)return;
  last=section;
  window.dispatchEvent(new CustomEvent('ekodi-admin-section-changed',{detail:{section}}));
}
function activatePanel(section){
  if(!section||!hasPanel(section))return false;
  requestedSection=section;
  for(const panel of content.querySelectorAll('[data-panel]')){
    const visible=panelTargets(panel).includes(section);
    panel.classList.toggle('hidden-panel',!visible);
    if(visible)panel.removeAttribute('hidden');else panel.hidden=true;
  }
  for(const item of allNav())item.classList.toggle('active',!isInternalNav(item)&&sectionOf(item)===section);
  syncTitle(section);
  const hash=CANON.get(section);
  if(hash&&location.hash!==hash)history.replaceState(null,'',hash);
  if(section === 'architecture'&&!window.EKODISystemMap)import('./system-health-admin.js').catch(console.error);
  sidebar.classList.remove('open');
  return true;
}
async function openSites(){
  dc=false;requestedSection='sites';
  if(!sitesLoading)sitesLoading=import('./homepage-admin.js').then(module=>{
    module.mountHomepageAdmin();
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{section:'sites'}}));
    return module;
  }).catch(error=>{sitesLoading=null;console.error(error);throw error;});
  await sitesLoading;if(requestedSection!=='sites')return;applyOrder();activatePanel('sites');
  navItemFor('campus')?.classList.add('active');syncTitle('campus');
}
async function openCheonggyeMembers(){
  dc=false;requestedSection='cheonggye-members';
  ensureFeatureStyle('cheonggye-members-admin.css');
  if(!cheonggyeLoading)cheonggyeLoading=import('./cheonggye-members-admin.js').then(module=>{
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{section:'cheonggye-members'}}));
    return module;
  }).catch(error=>{cheonggyeLoading=null;console.error(error);throw error;});
  await cheonggyeLoading;if(requestedSection!=='cheonggye-members')return;applyOrder();activatePanel('cheonggye-members');syncTitle('cheonggye-members');
}
function fallbackDemand(section){
  const selector=section==='aiops'?'[data-demand-feature="aiops"],[data-section="aiops"]':`[data-demand-feature="${section}"],[data-lazy-section="${section}"],[data-section="${section}"]`;
  nav.querySelector(selector)?.click();
}
function requestAdminAccess(){
  if(demandLoading.has('admins'))return demandLoading.get('admins');
  const task=import('./admin-menu-runtime.js').then(async()=>{
    const panel=await window.EKODIAdminMenu?.ensureAdminAccess?.();
    if(!panel)throw new Error('administrator access panel unavailable');
    if(requestedSection!=='admins')return;applyOrder();activatePanel('admins');syncTitle('admins');
  }).catch(error=>console.error('[EKODI Admin] admins runtime activation failed',error)).finally(()=>demandLoading.delete('admins'));
  demandLoading.set('admins',task);return task;
}
function requestCommonServices(){
  if(demandLoading.has('common-services'))return demandLoading.get('common-services');
  const task=import('./common-services-admin.js').then(()=>{
    if(requestedSection!=='common-services')return;
    applyOrder();
    if(activatePanel('common-services'))window.EKODICommonServicesAdmin?.activate?.();
  }).catch(error=>console.error('[EKODI Admin] common services runtime activation failed',error)).finally(()=>demandLoading.delete('common-services'));
  demandLoading.set('common-services',task);return task;
}
function requestDemand(section){
  for(const item of allNav())item.classList.toggle('active',!isInternalNav(item)&&sectionOf(item)===section);
  if(section==='cheonggye-members')return openCheonggyeMembers();
  if(section==='common-services')return requestCommonServices();
  if(section==='communication')return import('./communication-admin.js').then(()=>{if(requestedSection!==section)return;applyOrder();activatePanel(section);syncTitle(section);});
  if(section==='capabilities')return import('./capability-center-admin.js').then(()=>{if(requestedSection!==section)return;applyOrder();activatePanel(section);syncTitle(section);});
  if(section==='admins')return requestAdminAccess();
  const demandKey=DEMAND_KEYS.get(section);
  if(!demandKey||!window.EKODIAdminDemand?.activate){fallbackDemand(section);return null;}
  if(demandLoading.has(section))return demandLoading.get(section);
  const task=Promise.resolve(window.EKODIAdminDemand.activate(demandKey)).then(()=>{
    if(requestedSection!==section)return;
    applyOrder();
    const real=navItemFor(section);
    if(real&&!real.dataset.demandFeature)real.click();
    queueMicrotask(()=>{if(requestedSection===section)activatePanel(section);});
  }).catch(error=>{
    console.error(`[EKODI Admin] ${section} demand activation failed`,error);
    if(requestedSection===section)fallbackDemand(section);
  }).finally(()=>demandLoading.delete(section));
  demandLoading.set(section,task);return task;
}
function routeInternal(){dc=false;requestedSection='aiops';if(location.hash!=='#ai-ops')history.replaceState(null,'','#ai-ops');requestDemand('aiops');}
const explicitHashSection=()=>HASH.get(location.hash.toLowerCase())||'';
function reconcileNavigation(){
  if(running){again=true;return;}
  running=true;
  try{
    enforcePolicy();
    if(!requestedSection||dc)return;
    if(requestedSection==='sites'&&!hasPanel('sites'))openSites();
    else if(requestedSection==='cheonggye-members'&&!hasPanel('cheonggye-members'))openCheonggyeMembers();
    else if(!activatePanel(requestedSection))requestDemand(requestedSection);
  }finally{running=false;if(again){again=false;scheduleNav();}}
}
function scheduleNav(){if(queued)return;queued=true;window.setTimeout(()=>{queued=false;reconcileNavigation();},0);}
function afterAuth(){if(!dc||requestedSection!=='campus')return;dc=false;window.setTimeout(()=>{if(!activatePanel('campus'))requestDemand('campus');},0);}
nav.addEventListener('click',event=>{
  const item=event.target.closest('.nav[data-section],.nav[data-lazy-section],.nav[data-device-control-nav],a.nav[href]');
  if(!item)return;
  if(isInternalNav(item)){event.preventDefault();event.stopImmediatePropagation();return routeInternal();}
  const section=sectionOf(item);if(!section)return;dc=false;
  if(section==='sites'){event.preventDefault();event.stopImmediatePropagation();return openSites();}
  if(section==='cheonggye-members'){event.preventDefault();event.stopImmediatePropagation();return openCheonggyeMembers();}
  requestedSection=section;window.setTimeout(()=>{if(!activatePanel(section))requestDemand(section);},0);
},true);
content.addEventListener('click',event=>{
  const control=event.target.closest('[data-campus-section]');
  if(!control||!isInternal(control.dataset.campusSection))return;
  event.preventDefault();event.stopImmediatePropagation();routeInternal();
},true);
window.addEventListener('ekodi-nav-changed',scheduleNav);
window.addEventListener('ekodi-feature-installed',scheduleNav);
window.addEventListener('ekodi-session-validated',afterAuth,{once:true});
window.addEventListener('ekodi-admin-ready',()=>{
  enforcePolicy();const section=explicitHashSection();
  if(section&&isInternal(section))return routeInternal();
  if(section==='sites')return openSites();
  if(section==='cheonggye-members')return openCheonggyeMembers();
  if(section){dc=false;requestedSection=section;if(!activatePanel(section))requestDemand(section);}
  else{requestedSection='campus';dc=true;}
});
window.addEventListener('hashchange',()=>{
  const section=explicitHashSection();if(!section)return;dc=false;
  if(isInternal(section))return routeInternal();
  if(section==='sites')return openSites();
  if(section==='cheonggye-members')return openCheonggyeMembers();
  requestedSection=section;if(!activatePanel(section))requestDemand(section);
});
installCompactStyle();mountAdminSidebar(document);enforcePolicy();
const initialHash = explicitHashSection();
if(initialHash&&isInternal(initialHash))routeInternal();
else if(initialHash==='sites')openSites();
else if(initialHash==='cheonggye-members')openCheonggyeMembers();
else if (initialHash) requestedSection = initialHash;
else{requestedSection = 'campus';dc=true;requestDemand('campus');}
window.EKODIAdminPanels=Object.freeze({
  activate:section=>{
    dc=false;
    if(isInternal(section))return routeInternal();
    if(section==='sites')return openSites();
    if(section==='cheonggye-members')return openCheonggyeMembers();
    requestedSection=section;return activatePanel(section)||requestDemand(section);
  },
  current:()=>requestedSection,
  internalSections:Object.freeze([...INTERNAL]),
  visibleMenuOrder:ORDER
});
import('./admin-menu-runtime.js').catch(console.error);
})();