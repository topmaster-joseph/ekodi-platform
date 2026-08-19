(() => {
  'use strict';

  const TOKEN_KEY = 'ekodi-auth-token';
  const app = document.querySelector('#app');
  const nav = document.querySelector('.sidebar nav');
  const loadedScripts = new Map();
  const loadedStyles = new Map();
  const pending = new Map();
  const secondaryScheduled = new Set();
  let advancedBootstrap = null;

  const FEATURES = {
    campus: { label:'Campus', icon:'⌂', styles:['campus-actions.css'], scripts:['campus-actions.js'], real:'[data-section="campus"]', hashes:['#campus'], insert:'first' },
    aiops: {
      label:'AI Ops', icon:'✦', styles:['ai-ops-admin.css'], scripts:['ai-ops-admin.js'],
      secondaryStyles:['mission-control-admin.css','release-control-admin.css','system-health-admin.css'],
      secondaryScripts:['mission-control-admin.js','release-control-admin.js','admin-lazy-features.js','system-health-admin.js'],
      real:'[data-section="aiops"]', hashes:['#ai-ops','#aiops','#deployments','#release'], insert:'after-campus',
    },
    work: { label:'WORK', icon:'W', styles:['work-admin.css'], scripts:['work-admin.js'], real:'[data-section="work"]', hashes:['#work'], paths:['/work','/work/'], insert:'after-services' },
    marketing: { label:'MarketingAI', icon:'AI', styles:['marketing-ai-admin.css'], scripts:['marketing-ai-admin.js'], real:'[data-section="marketing-ai"]', hashes:['#marketing-ai'], insert:'after-work' },
    devices: { label:'Devices', icon:'⌁', styles:['device-control-admin.css'], scripts:['device-control-admin.js'], real:'[data-device-control-nav]', hashes:['#devices'], insert:'after-workspace' },
  };

  const ADVANCED = Object.freeze({
    clients:['◎','Clients'], admins:['◈','Admin'], community:['◌','Community'],
    books:['▤','Books'], social:['◉','Social'], affiliates:['↗','Affiliates'],
  });

  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function authenticated() { return Boolean(token() && app && !app.hidden); }

  function loadStyle(href) {
    if (loadedStyles.has(href)) return loadedStyles.get(href);
    const existing = document.querySelector(`link[href="${href}"],link[href="/${href}"]`);
    if (existing) return Promise.resolve(existing);
    const promise = new Promise(resolve => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; link.dataset.ekodiDemandStyle = href;
      link.addEventListener('load', () => resolve(link), { once:true });
      link.addEventListener('error', () => resolve(link), { once:true });
      document.head.appendChild(link);
    });
    loadedStyles.set(href, promise); return promise;
  }

  function loadScript(src) {
    if (loadedScripts.has(src)) return loadedScripts.get(src);
    const existing = document.querySelector(`script[src="${src}"],script[src="/${src}"]`);
    if (existing) return Promise.resolve(existing);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src; script.dataset.ekodiDemandScript = src;
      script.addEventListener('load', () => resolve(script), { once:true });
      script.addEventListener('error', () => reject(new Error(`${src} 로딩 실패`)), { once:true });
      document.body.appendChild(script);
    }).catch(error => { loadedScripts.delete(src); throw error; });
    loadedScripts.set(src, promise); return promise;
  }

  function waitFor(selector, timeout = 4500) {
    const existing = document.querySelector(selector); if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (node, error) => { if (settled) return; settled = true; observer.disconnect(); clearTimeout(timer); error ? reject(error) : resolve(node); };
      const observer = new MutationObserver(() => { const node = document.querySelector(selector); if (node) finish(node); });
      if (nav) observer.observe(nav, { childList:true, subtree:true });
      const timer = window.setTimeout(() => finish(null, new Error('관리 메뉴 준비 시간이 초과되었습니다.')), timeout);
    });
  }

  function insertPlaceholder(button, feature) {
    if (!nav) return;
    if (feature.insert === 'first') return nav.prepend(button);
    const selectors = {
      'after-campus':'[data-demand-feature="campus"], [data-section="campus"]',
      'after-services':'[data-section="services"]',
      'after-work':'[data-demand-feature="work"], [data-section="work"]',
      'after-workspace':'[data-section="workspace"]',
    };
    const anchor = nav.querySelector(selectors[feature.insert] || '');
    if (anchor) return anchor.insertAdjacentElement('afterend', button);
    nav.append(button);
  }

  function onIdle(callback, timeout = 1200) {
    if ('requestIdleCallback' in window) return window.requestIdleCallback(callback, { timeout });
    return window.setTimeout(() => callback({ didTimeout:true, timeRemaining:() => 0 }), 180);
  }

  function scheduleSecondary(key, feature) {
    if (secondaryScheduled.has(key)) return;
    const styles = feature.secondaryStyles || [], scripts = feature.secondaryScripts || [];
    if (!(styles.length || scripts.length)) return;
    secondaryScheduled.add(key);
    const scheduleStep = index => {
      if (index >= scripts.length || !authenticated()) return;
      onIdle(async () => { try { await loadScript(scripts[index]); } catch (error) { console.warn(`[EKODI Admin] ${key} secondary load failed`, error); } scheduleStep(index + 1); }, 1800);
    };
    onIdle(async () => {
      if (!authenticated()) return;
      if (document.visibilityState === 'hidden') {
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleStep(0); }, { once:true });
        return;
      }
      await Promise.all(styles.map(loadStyle)); scheduleStep(0);
    }, 1500);
  }

  async function activateFeature(key, button, auto = false) {
    const feature = FEATURES[key]; if (!feature || !authenticated()) return;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      if (button) { button.disabled = true; button.setAttribute('aria-busy','true'); button.classList.add('is-loading'); }
      try {
        await Promise.all((feature.styles || []).map(loadStyle));
        for (const src of feature.scripts || []) await loadScript(src);
        const real = await waitFor(feature.real);
        if (button?.isConnected) button.remove();
        window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail:{ feature:key } }));
        if (!auto || feature.hashes?.includes(location.hash) || feature.paths?.includes(location.pathname)) queueMicrotask(() => real.click());
        scheduleSecondary(key, feature);
      } catch (error) {
        console.warn(`[EKODI Admin] ${key} demand load failed`, error);
        if (button?.isConnected) { button.disabled=false; button.removeAttribute('aria-busy'); button.classList.remove('is-loading'); button.title='다시 눌러 로드'; }
      } finally { pending.delete(key); }
    })();
    pending.set(key, task); return task;
  }

  function placeholder(key, feature) {
    if (!nav || nav.querySelector(feature.real) || nav.querySelector(`[data-demand-feature="${key}"]`)) return;
    const button=document.createElement('button'); button.type='button'; button.className='nav'; button.dataset.demandFeature=key; button.dataset.lazySection=key==='marketing'?'marketing-ai':key;
    button.append(document.createTextNode(`${feature.icon} `)); const label=document.createElement('span'); label.textContent=feature.label; button.append(label);
    button.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); activateFeature(key, button, false); }, true);
    insertPlaceholder(button, feature);
  }

  function removeAdvancedPlaceholders() { nav?.querySelectorAll('[data-demand-advanced]').forEach(button => button.remove()); }
  function installAdvancedPlaceholders() {
    if (!nav || document.querySelector('script[src="control-center-features.js"],script[src="/control-center-features.js"]')) return;
    for (const [section, [icon, labelText]] of Object.entries(ADVANCED)) {
      if (nav.querySelector(`[data-section="${section}"], [data-lazy-section="${section}"]`)) continue;
      const button=document.createElement('button'); button.type='button'; button.className='nav'; button.dataset.demandAdvanced=section; button.dataset.lazySection=section;
      button.append(document.createTextNode(`${icon} `)); const label=document.createElement('span'); label.textContent=labelText; button.append(label);
      button.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); activateAdvanced(section); }, true);
      nav.append(button);
    }
  }

  async function activateAdvanced(section) {
    if (!authenticated() || !ADVANCED[section]) return;
    try {
      removeAdvancedPlaceholders();
      advancedBootstrap ||= loadScript('control-center-features.js');
      await advancedBootstrap;
      window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail:{ feature:'advanced-catalog' } }));
      const real = await waitFor(`[data-section="${section}"], [data-lazy-section="${section}"]`);
      queueMicrotask(() => real.click());
    } catch (error) {
      console.warn('[EKODI Admin] advanced feature catalog load failed', error);
      advancedBootstrap = null; installAdvancedPlaceholders();
    }
  }

  function bindBaseEnhancements() {
    const finance = nav?.querySelector('[data-section="finance"]');
    if (!finance || finance.dataset.financeDemandBound === 'true') return;
    finance.dataset.financeDemandBound = 'true';
    finance.addEventListener('click', () => {
      if (finance.dataset.financeAssetsRequested === 'true') return;
      finance.dataset.financeAssetsRequested = 'true';
      Promise.all([loadStyle('control-center-finance.css'), loadStyle('author-billing-admin.css')]).then(async () => {
        await loadScript('author-billing-admin.js');
        await loadScript('finance-monitor.js');
      }).catch(error => { finance.dataset.financeAssetsRequested='false'; console.warn('[EKODI Admin] Finance lazy load failed', error); });
    }, true);
  }

  function requestedFeature() {
    const hash=location.hash.toLowerCase(), path=location.pathname.toLowerCase();
    return Object.entries(FEATURES).find(([, feature]) => feature.hashes?.includes(hash) || feature.paths?.includes(path))?.[0] || '';
  }
  function requestedAdvanced() { const key=location.hash.replace(/^#/,'').toLowerCase(); return ADVANCED[key] ? key : ''; }

  function install() {
    if (!authenticated() || !nav) return;
    Object.entries(FEATURES).forEach(([key, feature]) => placeholder(key, feature));
    installAdvancedPlaceholders(); bindBaseEnhancements();
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail:{ feature:'placeholders' } }));
    const requested=requestedFeature();
    if (requested) activateFeature(requested, nav.querySelector(`[data-demand-feature="${requested}"]`), true);
    else { const advanced=requestedAdvanced(); if (advanced) activateAdvanced(advanced); }
  }

  function onAuthState() { if (authenticated()) install(); }
  onAuthState();
  window.addEventListener('ekodi-admin-ready', install);
  window.addEventListener('ekodi-authenticated', onAuthState);
  window.addEventListener('hashchange', () => {
    if (!authenticated()) return;
    const requested=requestedFeature();
    if (requested) { const button=nav?.querySelector(`[data-demand-feature="${requested}"]`); if (button) activateFeature(requested, button, true); return; }
    const advanced=requestedAdvanced(); if (advanced) activateAdvanced(advanced);
  });

  window.EKODIAdminDemand = Object.freeze({
    activate:key => FEATURES[key] ? activateFeature(key, nav?.querySelector(`[data-demand-feature="${key}"]`), false) : activateAdvanced(key),
    loadScript, loadStyle,
  });
})();
