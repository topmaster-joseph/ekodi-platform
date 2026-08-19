(() => {
  'use strict';

  const TOKEN_KEY = 'ekodi-auth-token';
  const app = document.querySelector('#app');
  const nav = document.querySelector('.sidebar nav');
  const loadedScripts = new Map();
  const loadedStyles = new Map();
  const pending = new Map();
  const secondaryScheduled = new Set();

  const FEATURES = {
    campus: {
      label: 'Campus', icon: '⌂',
      styles: ['campus-actions.css'],
      scripts: ['campus-actions.js'],
      real: '[data-section="campus"]',
      hashes: ['#campus'],
      insert: 'first',
    },
    aiops: {
      label: 'AI Ops', icon: '✦',
      styles: ['ai-ops-admin.css'],
      scripts: ['ai-ops-admin.js'],
      secondaryStyles: ['mission-control-admin.css', 'release-control-admin.css', 'system-health-admin.css'],
      secondaryScripts: ['mission-control-admin.js', 'release-control-admin.js', 'admin-lazy-features.js', 'system-health-admin.js'],
      real: '[data-section="aiops"]',
      hashes: ['#ai-ops', '#aiops', '#deployments', '#release'],
      insert: 'after-campus',
    },
    work: {
      label: 'WORK', icon: 'W',
      styles: ['work-admin.css'],
      scripts: ['work-admin.js'],
      real: '[data-section="work"]',
      hashes: ['#work'],
      paths: ['/work', '/work/'],
      insert: 'after-services',
    },
    marketing: {
      label: 'MarketingAI', icon: 'AI',
      styles: ['marketing-ai-admin.css'],
      scripts: ['marketing-ai-admin.js'],
      real: '[data-section="marketing-ai"]',
      hashes: ['#marketing-ai'],
      insert: 'after-work',
    },
    devices: {
      label: 'Devices', icon: '⌁',
      styles: ['device-control-admin.css'],
      scripts: ['device-control-admin.js'],
      real: '[data-device-control-nav]',
      hashes: ['#devices'],
      insert: 'after-workspace',
    },
  };

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function authenticated() {
    return Boolean(token() && app && !app.hidden);
  }

  function loadStyle(href) {
    if (loadedStyles.has(href)) return loadedStyles.get(href);
    const existing = document.querySelector(`link[href="${href}"],link[href="/${href}"]`);
    if (existing) return Promise.resolve(existing);
    const promise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.ekodiDemandStyle = href;
      link.addEventListener('load', () => resolve(link), { once:true });
      link.addEventListener('error', () => resolve(link), { once:true });
      document.head.appendChild(link);
    });
    loadedStyles.set(href, promise);
    return promise;
  }

  function loadScript(src) {
    if (loadedScripts.has(src)) return loadedScripts.get(src);
    const existing = document.querySelector(`script[src="${src}"],script[src="/${src}"]`);
    if (existing) return Promise.resolve(existing);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.dataset.ekodiDemandScript = src;
      script.addEventListener('load', () => resolve(script), { once:true });
      script.addEventListener('error', () => reject(new Error(`${src} 로딩 실패`)), { once:true });
      document.body.append(script);
    }).catch(error => {
      loadedScripts.delete(src);
      throw error;
    });
    loadedScripts.set(src, promise);
    return promise;
  }

  function waitFor(selector, timeout = 4500) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (node, error) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        if (error) reject(error); else resolve(node);
      };
      const observer = new MutationObserver(() => {
        const node = document.querySelector(selector);
        if (node) finish(node);
      });
      if (nav) observer.observe(nav, { childList:true, subtree:true });
      const timer = window.setTimeout(() => finish(null, new Error('관리 메뉴 준비 시간이 초과되었습니다.')), timeout);
    });
  }

  function insertPlaceholder(button, feature) {
    if (!nav) return;
    if (feature.insert === 'first') return nav.prepend(button);
    if (feature.insert === 'after-campus') {
      const anchor = nav.querySelector('[data-demand-feature="campus"], [data-section="campus"]');
      if (anchor) return anchor.insertAdjacentElement('afterend', button);
    }
    if (feature.insert === 'after-services') {
      const anchor = nav.querySelector('[data-section="services"]');
      if (anchor) return anchor.insertAdjacentElement('afterend', button);
    }
    if (feature.insert === 'after-work') {
      const anchor = nav.querySelector('[data-demand-feature="work"], [data-section="work"]');
      if (anchor) return anchor.insertAdjacentElement('afterend', button);
    }
    if (feature.insert === 'after-workspace') {
      const anchor = nav.querySelector('[data-section="workspace"]');
      if (anchor) return anchor.insertAdjacentElement('afterend', button);
    }
    nav.append(button);
  }

  function onIdle(callback, timeout = 1200) {
    if ('requestIdleCallback' in window) return window.requestIdleCallback(callback, { timeout });
    return window.setTimeout(() => callback({ didTimeout:true, timeRemaining:() => 0 }), 180);
  }

  function scheduleSecondary(key, feature) {
    if (secondaryScheduled.has(key)) return;
    const styles = feature.secondaryStyles || [];
    const scripts = feature.secondaryScripts || [];
    if (!(styles.length || scripts.length)) return;
    secondaryScheduled.add(key);

    const begin = async () => {
      if (!authenticated()) return;
      if (document.visibilityState === 'hidden') {
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleStep(0); }, { once:true });
        return;
      }
      await Promise.all(styles.map(loadStyle));
      scheduleStep(0);
    };
    const scheduleStep = index => {
      if (index >= scripts.length || !authenticated()) return;
      onIdle(async () => {
        try { await loadScript(scripts[index]); }
        catch (error) { console.warn(`[EKODI Admin] ${key} secondary load failed`, error); }
        scheduleStep(index + 1);
      }, 1800);
    };
    onIdle(begin, 1500);
  }

  async function activateFeature(key, placeholder, auto = false) {
    const feature = FEATURES[key];
    if (!feature || !authenticated()) return;
    if (pending.has(key)) return pending.get(key);

    const task = (async () => {
      if (placeholder) {
        placeholder.disabled = true;
        placeholder.setAttribute('aria-busy', 'true');
        placeholder.classList.add('is-loading');
      }
      try {
        await Promise.all((feature.styles || []).map(loadStyle));
        for (const src of feature.scripts || []) await loadScript(src);
        const real = await waitFor(feature.real);
        if (placeholder?.isConnected) placeholder.remove();
        window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail:{ feature:key } }));
        if (!auto || feature.hashes?.includes(location.hash) || feature.paths?.includes(location.pathname)) {
          queueMicrotask(() => real.click());
        }
        scheduleSecondary(key, feature);
      } catch (error) {
        console.warn(`[EKODI Admin] ${key} demand load failed`, error);
        if (placeholder?.isConnected) {
          placeholder.disabled = false;
          placeholder.removeAttribute('aria-busy');
          placeholder.classList.remove('is-loading');
          placeholder.title = '다시 눌러 로드';
        }
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, task);
    return task;
  }

  function placeholder(key, feature) {
    if (!nav || nav.querySelector(feature.real) || nav.querySelector(`[data-demand-feature="${key}"]`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav';
    button.dataset.demandFeature = key;
    button.dataset.lazySection = key === 'marketing' ? 'marketing-ai' : key;
    button.append(document.createTextNode(`${feature.icon} `));
    const label = document.createElement('span');
    label.textContent = feature.label;
    button.append(label);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      activateFeature(key, button, false);
    }, true);
    insertPlaceholder(button, feature);
  }

  function bindBaseEnhancements() {
    const finance = nav?.querySelector('[data-section="finance"]');
    if (!finance || finance.dataset.financeDemandBound === 'true') return;
    finance.dataset.financeDemandBound = 'true';
    finance.addEventListener('click', () => {
      if (finance.dataset.financeAssetsRequested === 'true') return;
      finance.dataset.financeAssetsRequested = 'true';
      Promise.all([
        loadStyle('control-center-finance.css'),
        loadStyle('author-billing-admin.css'),
      ]).then(async () => {
        await loadScript('finance-monitor.js');
        await loadScript('author-billing-admin.js');
      }).catch(error => {
        finance.dataset.financeAssetsRequested = 'false';
        console.warn('[EKODI Admin] Finance lazy load failed', error);
      });
    }, true);
  }

  function requestedFeature() {
    const hash = location.hash.toLowerCase();
    const path = location.pathname.toLowerCase();
    return Object.entries(FEATURES).find(([, feature]) => feature.hashes?.includes(hash) || feature.paths?.includes(path))?.[0] || '';
  }

  function install() {
    if (!authenticated() || !nav) return;
    Object.entries(FEATURES).forEach(([key, feature]) => placeholder(key, feature));
    bindBaseEnhancements();
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail:{ feature:'placeholders' } }));
    const requested = requestedFeature();
    if (requested) {
      const button = nav.querySelector(`[data-demand-feature="${requested}"]`);
      activateFeature(requested, button, true);
    }
  }

  onAuthState();
  function onAuthState() { if (authenticated()) install(); }
  window.addEventListener('ekodi-admin-ready', install);
  window.addEventListener('ekodi-authenticated', onAuthState);
  window.addEventListener('hashchange', () => {
    const requested = requestedFeature();
    if (!requested || !authenticated()) return;
    const button = nav?.querySelector(`[data-demand-feature="${requested}"]`);
    if (button) activateFeature(requested, button, true);
  });

  window.EKODIAdminDemand = Object.freeze({
    activate: key => activateFeature(key, nav?.querySelector(`[data-demand-feature="${key}"]`), false),
    loadScript,
    loadStyle,
  });
})();
