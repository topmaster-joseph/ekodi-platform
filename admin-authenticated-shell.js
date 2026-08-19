(() => {
  'use strict';

  const TOKEN_KEY = 'ekodi-auth-token';
  const app = document.querySelector('#app');
  const loginScreen = document.querySelector('#loginScreen');
  const loginLink = document.querySelector('#centralAdminLogin');
  const postAuthStyles = ['compact-control-center.css'];
  const criticalPostAuthScripts = [
    'compact-control-center.js',
    'admin-menu-layout.js',
    'admin-demand-loader.js',
  ];
  let started = false;

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function authenticated() {
    return Boolean(token() && app && !app.hidden);
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
    if (document.querySelector(`link[data-ekodi-postauth-style="${href}"],link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.ekodiPostauthStyle = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[data-ekodi-postauth-script="${src}"],script[src="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
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

  async function startAuthenticatedShell() {
    if (started || !authenticated()) return;
    started = true;
    document.documentElement.dataset.ekodiAdminReady = 'loading';
    for (const href of postAuthStyles) loadStyle(href);

    // First login starts only the visual shell, stable navigation and the demand loader.
    // Campus, Device Control, AI Ops and other operational modules stay completely asleep
    // until the administrator explicitly opens them.
    await Promise.all(criticalPostAuthScripts.map(loadScript));

    installMallFreeOpsIsolation();
    document.documentElement.dataset.ekodiAdminReady = 'true';
    window.dispatchEvent(new CustomEvent('ekodi-admin-ready'));
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

  if (app) {
    const observer = new MutationObserver(onStateChange);
    observer.observe(app, { attributes:true, attributeFilter:['hidden'] });
  }
})();
