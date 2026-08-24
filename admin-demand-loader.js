(() => {
  'use strict';

  const TOKEN_KEY = 'ekodi-auth-token';
  const ASSET_VERSION = '__EKODI_ADMIN_ASSET_VERSION__';
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
      secondaryScripts: ['admin-lazy-features.js'],
      real: '[data-section="aiops"]',
      hashes: ['#ai-ops', '#aiops'],
      insert: 'after-campus',
    },
    aimembers: {
      label: 'AI 회원운영', icon: '◈',
      styles: ['ai-ops-admin.css'],
      scripts: ['ai-ops-admin.js'],
      real: '[data-section="ai-membership"]',
      hashes: ['#ai-membership'],
      insert: 'after-health',
    },
    health: {
      label: 'Health', icon: '◉',
      styles: ['system-health-admin.css'],
      scripts: ['system-health-admin.js'],
      real: '[data-section="health"]',
      hashes: ['#health'],
      insert: 'after-aiops',
    },
    security: {
      label: 'Security', icon: '◆',
      styles: ['admin-secret-generator.css'],
      scripts: ['admin-secret-generator.js'],
      real: '[data-section="security"]',
      hashes: ['#security'],
      insert: 'after-aimembers',
    },
    deployments: {
      label: 'Deployments', icon: '↑',
      styles: ['release-control-admin.css'],
      scripts: ['release-control-admin.js'],
      real: '[data-section="deployments"]',
      hashes: ['#deployments', '#release'],
      insert: 'after-security',
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

  function assetUrl(path) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}v=${encodeURIComponent(ASSET_VERSION)}`;
  }

  function mark(name) { try { performance.mark(name); } catch {} }

  function loadStyle(href) {
    if (loadedStyles.has(href)) return loadedStyles.get(href);
    const existing = document.querySelector(`link[data-ekodi-demand-style="${href}"]`);
    if (existing) return Promise.resolve(existing);
    const promise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetUrl(href);
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
    const existing = document.querySelector(`script[data-ekodi-demand-script="${src}"]`);
    if (existing) return Promise.resolve(existing);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = assetUrl(src);
      script.dataset.ekodiDemandScript = src;
      script.addEventListener('load', () => resolve(script), { once:true });
      script.addEventListener('error', () => reject(new Error(`${src} 로딩 실패`)), { once:true });
      document.body.appendChild(script);
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
    if (feature.insert === 'after-aiops') {
      const anchor = nav.querySelector('[data-demand-feature="aiops"], [data-section="aiops"]');
      if (anchor) return anchor.insertAdjacentElement('afterend', button);
    }
    if (feature.insert === 'after-aimembers') {
      const anchor = nav.querySelector('[data-demand-feature="aimembers"], [data-section="ai-membership"]');
      if (anchor) return anchor.insertAdjacentElement('afterend', button);
    }
    if (feature.insert === 'after-health') {
      const anchor = nav.querySelector('[data-demand-feature="health"], [data-section="health"]');
      if (anchor) return anchor.insertAdjacentElement('afterend', button);
    }
    if (feature.insert === 'after-security') {
      const anchor = nav.querySelector('[data-demand-feature="security"], [data-section="security"]');
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

  function inputPending() {
    try { return Boolean(navigator.scheduling?.isInputPending?.()); } catch { return false; }
  }

  function onBackground(callback) {
    if (globalThis.scheduler?.postTask) {
      return globalThis.scheduler.postTask(() => callback({ didTimeout:false, timeRemaining:() => 50 }), { priority:'background' });
    }
    if ('requestIdleCallback' in window) return window.requestIdleCallback(callback);
    return window.setTimeout(() => callback({ didTimeout:false, timeRemaining:() => 20 }), 1200);
  }

  function scheduleSecondary(key, feature) {
    if (secondaryScheduled.has(key)) return;
    const styles = feature.secondaryStyles || [];
    const scripts = feature.secondaryScripts || [];
    if (!(styles.length || scripts.length)) return;
    secondaryScheduled.add(key);

    let index = 0;
    let stylesLoaded = false;
    const step = () => {
      if (!authenticated() || index >= scripts.length) return;
      if (document.visibilityState === 'hidden') {
        document.addEventListener('visibilitychange', step, { once:true });
        return;
      }
      onBackground(async deadline => {
        if (!authenticated()) return;
        if (inputPending() || (deadline?.timeRemaining && deadline.timeRemaining() < 6)) {
          window.setTimeout(step, 500);
          return;
        }
        try {
          if (!stylesLoaded) {
            stylesLoaded = true;
            await Promise.all(styles.map(loadStyle));
          }
          if (scripts[index]) await loadScript(scripts[index]);
        } catch (error) {
          console.warn(`[EKODI Admin] ${key} secondary load failed`, error);
        }
        index += 1;
        step();
      });
    };
    step();
  }

  async function activateFeature(key, placeholder, auto = false) {
    const feature = FEATURES[key];
    if (!feature || !authenticated()) return;
    if (pending.has(key)) return pending.get(key);

    const task = (async () => {
      mark(`ekodi-feature-${key}-start`);
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
        mark(`ekodi-feature-${key}-ready`);
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
    button.dataset.lazySection = key === 'marketing' ? 'marketing-ai' : key === 'aimembers' ? 'ai-membership' : key;
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
        await loadScript('author-billing-admin.js');
        await loadScript('finance-monitor.js');
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