(() => {
  'use strict';
  const sidebar=document.querySelector('.sidebar'),nav=sidebar?.querySelector('nav'),content=document.querySelector('.content');
  if(!sidebar||!nav||!content)return;

  const MENU=Object.freeze({
    overview:['⌂','운영 현황','Operations'],campus:['▦','사이트 관리','Site Management'],aiops:['AI','운영 AI','AI Operations'],health:['♥','서비스 상태','Service Health'],security:['S','보안','Security'],
    'marketing-ai':['M','마케팅 AI','Marketing AI'],work:['W','업무','Work'],finance:['₩','결제 · 회계','Finance & Accounting'],communication:['✦','메일 · 라이브','Mail & Live'],workspace:['▣','클라우드 · 자료','Cloud & Files'],
    devices:['D','기기 · 장치','Devices'],organization:['◫','조직 · 사업','Organizations'],clients:['C','고객 사이트','Customer Sites'],admins:['♜','관리자 · 권한','Administrators & Access'],community:['◎','커뮤니티','Community'],
    books:['B','출판 · 도서','Books & Publishing'],social:['S','소셜','Social'],affiliates:['A','제휴','Affiliates'],architecture:['◇','아키텍처','Architecture'],services:['◉','서비스 · 통계','Services & Metrics',1],deployments:['↥','배포','Deployments',1],policies:['⚙','정책','Policies',1]
  });
  const VISIBLE_NAV_ORDER=Object.freeze(['overview', 'campus', 'aiops', 'health', 'security', 'marketing-ai', 'work', 'finance', 'communication', 'workspace', 'devices', 'organization', 'clients', 'admins', 'community', 'books', 'social', 'affiliates', 'architecture']);
  const RANK=new Map(VISIBLE_NAV_ORDER.map((v,i)=>[v,i+1]));
  const INTERNAL_ONLY_SECTIONS=new Set(['services', 'deployments', 'policies']);
  const INTERNAL_ONLY_HREFS=new Set(['/legacy#domains','/legacy#activity']);
  const HASH_SECTIONS=new Map([['#sites', 'sites'],['#ai-ops','aiops'],['#health', 'health'],['#security','security'],['#devices','devices'],['#campus','campus'],['#policies','policies'],['#operations','overview'],['#services','services'],['#deployments','deployments']]);
  const CANONICAL_HASH=new Map([['overview', '#operations'],['sites','#sites'],['aiops','#ai-ops'],['health','#health'],['security','#security'],['devices','#devices'],['campus','#campus']]);
  const LOCALE_KEY='ekodi-admin-locale',LOCALE_COOKIE='ekodi_admin_locale';
  let locale=readLocale(),requestedSection = '',sitesLoading=null;

  function norm(v){return String(v||'').toLowerCase().startsWith('en')?'en':'ko'}
  function readLocale(){try{const c=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${LOCALE_COOKIE}=`));return norm(c?decodeURIComponent(c.split('=').slice(1).join('=')):localStorage.getItem(LOCALE_KEY)||document.documentElement.lang||navigator.language)}catch{return'ko'}}
  function setLocale(v){locale=norm(v);try{localStorage.setItem(LOCALE_KEY,locale)}catch{}if(location.hostname==='ekodi.kr'||location.hostname.endsWith('.ekodi.kr'))document.cookie=`${LOCALE_COOKIE}=${locale}; Path=/; Domain=.ekodi.kr; Max-Age=31536000; SameSite=Lax; Secure`;document.documentElement.lang=locale;syncSidebar()}
  function labelFor(s){const d=MENU[s];return d?(locale==='en'?d[2]:d[1]):s}
  function sectionOf(el){if(el?.dataset?.deviceControlNav==='true')return'devices';const v=String(el?.dataset?.section||el?.dataset?.lazySection||'').trim();return v==='marketing'?'marketing-ai':v}
  function items(root=nav){return root.querySelectorAll('.nav[data-section],.nav[data-lazy-section],.nav[data-device-control-nav],a.nav[href]')}
  function isInternalSection(s){return INTERNAL_ONLY_SECTIONS.has(String(s||'').trim())}
  function isInternalNav(el){return isInternalSection(sectionOf(el))||INTERNAL_ONLY_HREFS.has(el?.getAttribute?.('href')||'')}
  function ensureLabel(el){let s=el.querySelector('span');if(!s){s=document.createElement('span');el.append(s)}return s}
  function syncSidebar(root=nav){let unknown=500;for(const el of items(root)){const s=sectionOf(el),d=MENU[s];if(!d)continue;const l=ensureLabel(el),text=labelFor(s);if(l.textContent!==text)l.textContent=text;const r=d[3]?9999:(RANK.get(s)??unknown++);if(el.style.order!==String(r))el.style.order=String(r);el.dataset.menuOrder=String(r)}nav.dataset.adminSidebarShared='true';nav.dataset.adminSidebarLocale=locale;const a=[...items(root)].find(el=>el.classList.contains('active')),s=sectionOf(a),t=document.querySelector('#pageTitle');if(t&&MENU[s])t.textContent=labelFor(s)}
  function renderSidebar(target,ids=VISIBLE_NAV_ORDER){if(!target)return[];const out=ids.map(s=>{const d=MENU[s];if(!d||d[3])return null;const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.section=s;b.append(document.createTextNode(`${d[0]} `));const l=document.createElement('span');l.textContent=labelFor(s);b.append(l);return b}).filter(Boolean);target.replaceChildren(...out);syncSidebar(target);return out}
  function scheduleSidebarSync(){queueMicrotask(syncSidebar);requestAnimationFrame(syncSidebar)}
  function panelTargets(p){return String(p?.dataset?.panel||'').split(/\s+/).filter(Boolean)}
  function hasPanel(s){return Boolean(s&&[...content.querySelectorAll('[data-panel]')].some(p=>panelTargets(p).includes(s)))}
  function navItemFor(s){return[...items()].find(el=>sectionOf(el)===s&&!isInternalNav(el))||null}
  function applyStableNavigationOrder(){syncSidebar()}
  function enforceInternalNavigationPolicy(){for(const el of items()){if(!isInternalNav(el))continue;el.hidden=true;el.dataset.aiInternal=sectionOf(el)||el.getAttribute('href')||'internal';el.setAttribute('aria-hidden','true');el.tabIndex=-1;el.classList.remove('active')}syncSidebar()}
  function syncTitle(s){const key=s==='sites'?'campus':s,t=document.querySelector('#pageTitle');if(t&&MENU[key])t.textContent=labelFor(key);window.dispatchEvent(new CustomEvent('ekodi-admin-section-changed',{detail:{section:s}}))}
  function activatePanel(s){if(!s||!hasPanel(s))return false;requestedSection=s;for(const p of content.querySelectorAll('[data-panel]')){const on=panelTargets(p).includes(s);p.classList.toggle('hidden-panel',!on);if(on)p.removeAttribute('hidden');else p.hidden=true}for(const el of items())el.classList.toggle('active',!isInternalNav(el)&&sectionOf(el)===s);syncTitle(s);const h=CANONICAL_HASH.get(s);if(h&&location.hash!==h)history.replaceState(null,'',h);sidebar.classList.remove('open');scheduleSidebarSync();return true}
  function installSitesEntry(){/* Do not create a second top-level Sites item. */}
  async function openSites(){requestedSection='sites';if(!sitesLoading)sitesLoading=import('./homepage-admin.js').then(m=>{m.mountHomepageAdmin();window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{section:'sites'}}));return m}).catch(e=>{sitesLoading=null;throw e});await sitesLoading;applyStableNavigationOrder();activatePanel('sites');navItemFor('campus')?.classList.add('active');syncTitle('campus')}
  function openDemand(s){const q=s==='aiops'?'[data-demand-feature="aiops"],[data-section="aiops"]':`[data-demand-feature="${s}"],[data-lazy-section="${s}"],[data-section="${s}"]`;nav.querySelector(q)?.click()}
  function routeInternalToAiOps(){requestedSection='aiops';if(location.hash!=='#ai-ops')history.replaceState(null,'','#ai-ops');openDemand('aiops')}
  function explicitHashSection(){return HASH_SECTIONS.get(location.hash)||''}
  function reconcileNavigation(){enforceInternalNavigationPolicy();if(!requestedSection)return;if(requestedSection==='sites'&&!hasPanel('sites'))openSites();else activatePanel(requestedSection);scheduleSidebarSync()}

  nav.addEventListener('click',e=>{const el=e.target.closest('.nav[data-section],.nav[data-lazy-section],.nav[data-device-control-nav],a.nav[href]');if(!el)return;scheduleSidebarSync();if(isInternalNav(el)){e.preventDefault();e.stopImmediatePropagation();routeInternalToAiOps();return}const s=sectionOf(el);if(!s)return;if(s==='sites'){e.preventDefault();e.stopImmediatePropagation();openSites();return}requestedSection=s;queueMicrotask(()=>activatePanel(s))},true);
  content.addEventListener('click',e=>{const c=e.target.closest('[data-campus-section]');if(!c||!isInternalSection(c.dataset.campusSection))return;e.preventDefault();e.stopImmediatePropagation();routeInternalToAiOps()},true);
  window.addEventListener('ekodi-nav-changed',reconcileNavigation);
  window.addEventListener('ekodi-feature-installed',reconcileNavigation);
  window.addEventListener('ekodi-admin-section-changed',scheduleSidebarSync);
  window.addEventListener('ekodi-admin-ready',()=>{enforceInternalNavigationPolicy();const x=explicitHashSection();if(x&&isInternalSection(x))routeInternalToAiOps();else if(x==='sites')openSites();else if(x)requestedSection=x;else{requestedSection='overview';activatePanel('overview')}});
  window.addEventListener('hashchange',()=>{const x=explicitHashSection();if(!x)return;if(isInternalSection(x))return routeInternalToAiOps();if(x==='sites')return openSites();requestedSection=x;if(!activatePanel(x))openDemand(x)});

  installSitesEntry();enforceInternalNavigationPolicy();const initialHash = explicitHashSection();
  if(initialHash&&isInternalSection(initialHash))routeInternalToAiOps();else if(initialHash==='sites')openSites();else if(initialHash) requestedSection = initialHash;else{requestedSection='overview';activatePanel('overview')}
  window.EKODIAdminSidebar=Object.freeze({sync:syncSidebar,render:renderSidebar,label:labelFor,order:()=>VISIBLE_NAV_ORDER,locale:()=>locale,setLocale,sectionOf});
  window.EKODIAdminPanels=Object.freeze({activate:s=>{if(isInternalSection(s))return routeInternalToAiOps();if(s==='sites')return openSites();requestedSection=s;if(!activatePanel(s))openDemand(s)},current:()=>requestedSection,internalSections:Object.freeze([...INTERNAL_ONLY_SECTIONS]),visibleMenuOrder:VISIBLE_NAV_ORDER});
  scheduleSidebarSync();
})();
