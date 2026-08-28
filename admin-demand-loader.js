(() => {
  'use strict';
  const ASSET_VERSION = '__EKODI_ADMIN_ASSET_VERSION__';
  const TOKEN_KEY = 'ekodi-auth-token';
  const loadedScripts = new Map();
  const loadedStyles = new Map();
  const prefetchedAssets = new Set();
  const loadedChannels = new Set();
  const secondaryScheduled = new Set();

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function assetUrl(path) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}v=${encodeURIComponent(ASSET_VERSION)}`;
  }

  function loadStyle(href) {
    if (loadedStyles.has(href)) return loadedStyles.get(href);
    const existing = document.querySelector(`link[data-ekodi-demand-style="${href}"]`);
    if (existing) return Promise.resolve(existing);
    const promise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetUrl(href);
      link.dataset.ekodiDemandStyle = href;
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => resolve(link), { once: true });
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
      script.addEventListener('load', () => resolve(script), { once: true });
      script.addEventListener('error', () => reject(new Error(`${src} 로딩 실패`)), { once: true });
      document.body.appendChild(script);
    }).catch(error => {
      loadedScripts.delete(src);
      throw error;
    });
    loadedScripts.set(src, promise);
    return promise;
  }

  function canPrefetch() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return !connection?.saveData && !/^(slow-2g|2g)$/i.test(connection?.effectiveType || '');
  }

  function prefetchAsset(src) {
    if (!src || !canPrefetch() || prefetchedAssets.has(src)) return;
    prefetchedAssets.add(src);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = assetUrl(src);
    link.as = src.endsWith('.css') ? 'style' : 'script';
    document.head.appendChild(link);
  }

  function prefetchChannel(channel) {
    if (!channel) return;
    [...(channel.styles || []), ...(channel.scripts || [])].forEach(prefetchAsset);
  }
  function inputPending() {
    try { return Boolean(navigator.scheduling?.isInputPending?.()); } catch { return false; }
  }

  function onBackground(callback) {
    if (globalThis.scheduler?.postTask) {
      return globalThis.scheduler.postTask(() => callback({ didTimeout: false, timeRemaining: () => 50 }), { priority: 'background' });
    }
    if ('requestIdleCallback' in window) return window.requestIdleCallback(callback);
    return window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 20 }), 1200);
  }

  function scheduleSecondary(channel) {
    const key = channel?.id;
    if (!key || secondaryScheduled.has(key)) return;
    const styles = channel.secondaryStyles || [];
    const scripts = channel.secondaryScripts || [];
    if (!(styles.length || scripts.length)) return;
    secondaryScheduled.add(key);
    let index = 0;
    let stylesLoaded = false;

    const step = () => {
      if (!token() || index >= scripts.length) return;
      if (document.visibilityState === 'hidden') {
        document.addEventListener('visibilitychange', step, { once: true });
        return;
      }
      onBackground(async deadline => {
        if (!token()) return;
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
  async function loadChannel(channel) {
    if (!channel?.id) return;
    if (loadedChannels.has(channel.id)) return;
    try { performance.mark(`ekodi-channel-${channel.id}-start`); } catch {}
    const styles = Promise.all((channel.styles || []).map(loadStyle));
    const scripts = channel.serialScripts
      ? (async () => { for (const src of channel.scripts || []) await loadScript(src); })()
      : Promise.all((channel.scripts || []).map(loadScript));
    await Promise.all([styles, scripts]);
    loadedChannels.add(channel.id);
    scheduleSecondary(channel);
    try { performance.mark(`ekodi-channel-${channel.id}-ready`); } catch {}
  }

  const assets = Object.freeze({
    loadChannel,
    prefetchChannel,
    loadScript,
    loadStyle,
    isLoaded: id => loadedChannels.has(String(id || '')),
    version: ASSET_VERSION,
  });
  window.EKODIAdminAssets = assets;
  window.EKODIAdminDemand = Object.freeze({
    activate: key => window.EKODIAdminGateway?.open?.(key, { source: 'compat-demand' }),
    loadScript,
    loadStyle,
  });
})();
