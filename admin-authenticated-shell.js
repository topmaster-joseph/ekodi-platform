(() => {
  'use strict';

  const TOKEN_KEY = 'ekodi-auth-token';
  const ASSET_VERSION = '__EKODI_ADMIN_ASSET_VERSION__';
  const app = document.querySelector('#app');
  const loginScreen = document.querySelector('#loginScreen');
  const loginLink = document.querySelector('#centralAdminLogin');
  const postAuthStyles = ['compact-control-center.css'];
  const criticalPostAuthScripts = [
    'compact-control-center.js',
    'admin-menu-layout.js',
    'admin-demand-loader.js',
    'user-ai-tier-panel.js',
  ];
  let started = false;

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

  function applyOfficialAdminSurface() {
    const root = document.documentElement;
    root.dataset.ekodiShellSurface = 'admin';
    root.dataset.ekodiAdminUi = 'official';
    const tokens = {
      '--ekodi-ui-bg': '#071522',
      '--ekodi-ui-surface': '#0B1D2E',
      '--ekodi-ui-surface-raised': '#10263A',
      '--ekodi-ui-border': '#24425E',
      '--ekodi-ui-text': '#F4F7FB',
      '--ekodi-ui-muted': '#9FB1C3',
      '--ekodi-ui-accent': '#8EC8FF',
      '--ekodi-ui-radius': '16px',
    };
    for (const [name, value] of Object.entries(tokens)) {
      if (!root.style.getPropertyValue(name)) root.style.setProperty(name, value);
    }
  }

  function keepLoginInteractive() {
    if (!loginScreen || authenticated()) return;
    loginScreen.style.position = 'relative';
    loginScreen.style.zIndex = '1000';
    loginScreen.style.pointerEvents = 'auto';
    if (loginLink) {
      loginLink.style.position = 'relative';
      loginLink.style.zIndex = '1';
      loginLink.style.pointerEvents = 'auto';
    }
  }

  function loadStyle(href) {
    if (document.querySelector(`link[data-ekodi-postauth-style="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = assetUrl(href);
    link.dataset.ekodiPostauthStyle = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[data-ekodi-postauth-script="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = assetUrl(src);
      script.dataset.ekodiPostauthScript = src;
      script.addEventListener('load', resolve, { once:true });
      script.addEventListener('error', () => {
        console.warn(`[EKODI Admin] optional post-auth asset failed: ${src}`);
        resolve();
      }, { once:true });
      document.body.appendChild(script);
    });
  }

  function deactivateMallFreeOps() {
    const panel = document.querySelector('#mallFreeOpsPanel');
    if (!panel) return;
    const button = document.querySelector('.sidebar [data-admin-link="mall-free-ops"]');
    const frame = panel.querySelector('[data-mall-free-ops-frame]');
    if (!panel.hidden) panel.hidden = true;
    if (!panel.classList.contains('hidden-panel')) panel.classList.add('hidden-panel');
    if (button?.classList.contains('active')) button.classList.remove('active');
    if (frame?.getAttribute('src')) frame.removeAttribute('src');
  }

  function installMallFreeOpsIsolation() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav || nav.dataset.mallFreeOpsIsolationBound) return;
    nav.dataset.mallFreeOpsIsolationBound = 'true';
    nav.addEventListener('click', event => {
      const item = event.target?.closest?.('.nav');
      if (!item) return;
      const mallFreeOps = item.dataset.adminLink === 'mall-free-ops' || item.dataset.section === 'mall-free-ops';
      if (mallFreeOps) {
        const panel = document.querySelector('#mallFreeOpsPanel');
        if (panel?.hidden) panel.hidden = false;
        return;
      }
      deactivateMallFreeOps();
    }, true);
    window.addEventListener('hashchange', () => {
      if (location.hash !== '#mall-free-ops') deactivateMallFreeOps();
    });
    if (location.hash !== '#mall-free-ops') deactivateMallFreeOps();
  }

  function announceReady() {
    document.documentElement.dataset.ekodiAdminReady = 'true';
    try { performance.mark('ekodi-admin-ready'); } catch {}
    window.dispatchEvent(new CustomEvent('ekodi-admin-ready'));
  }

  async function startAuthenticatedShell() {
    if (started || !authenticated()) return;
    started = true;
    applyOfficialAdminSurface();
    document.documentElement.dataset.ekodiAdminReady = 'loading';

    if (location.pathname.startsWith('/legacy')) {
      loadStyle('control-center-ops.css');
      loadStyle('control-center-finance.css');
      await loadScript('control-center.js');
      announceReady();
      return;
    }

    for (const href of postAuthStyles) loadStyle(href);
    await Promise.all(criticalPostAuthScripts.map(loadScript));
    installMallFreeOpsIsolation();
    announceReady();
  }

  function onStateChange() {
    if (authenticated()) {
      startAuthenticatedShell();
      return;
    }
    keepLoginInteractive();
    if (!started && ['#campus', '#operations', '#policies', '#ai-ops', '#devices', '#work', '#marketing-ai', '#deployments'].includes(location.hash)) {
      document.documentElement.dataset.ekodiAdminPendingHash = location.hash.slice(1);
    }
  }

  keepLoginInteractive();
  onStateChange();
  window.addEventListener('ekodi-authenticated', onStateChange);
})();