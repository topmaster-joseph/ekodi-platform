(() => {
  'use strict';

  const TOKEN_KEY = 'ekodi-auth-token';
  const ASSET_VERSION = '__EKODI_ADMIN_ASSET_VERSION__';
  const app = document.querySelector('#app');
  const loginScreen = document.querySelector('#loginScreen');
  const loginLink = document.querySelector('#centralAdminLogin');
  const postAuthStyles = ['compact-control-center.css'];
  const criticalPostAuthScripts = [
    'ekodi-message-ui.js',
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

  function installSharedAdminLayout() {
    const sidebar = document.querySelector('.sidebar');
    const nav = sidebar?.querySelector('nav');
    const main = app?.querySelector('main');
    const content = main?.querySelector('.content');
    const topbar = main?.querySelector('.topbar');
    const profile = document.querySelector('.profile');
    const sideBottom = sidebar?.querySelector('.side-bottom');
    const logoutButton = document.querySelector('#logoutButton');
    const pageTitle = document.querySelector('#pageTitle');
    if (!app || !sidebar || !nav || !main || !content || !sideBottom) return;

    document.body.classList.add('ekodi-admin-shell-v2');
    app.dataset.ekodiAdminShell = 'shared-v2';
    sidebar.dataset.ekodiAdminRegion = 'navigation';
    main.dataset.ekodiAdminRegion = 'workspace';
    nav.dataset.ekodiIndependentScroll = 'true';
    content.dataset.ekodiIndependentScroll = 'workspace';

    if (profile && !sideBottom.contains(profile)) {
      profile.classList.add('side-profile');
      sideBottom.insertBefore(profile, logoutButton || null);
    }

    if (pageTitle?.parentElement && topbar?.contains(pageTitle.parentElement)) {
      pageTitle.parentElement.classList.add('admin-shell-title-group');
    }

    // admin-menu-layout installs compact navigation rules after its stylesheet.
    // Inline important values keep the navigation pane independently scrollable.
    nav.style.setProperty('flex', '1 1 auto', 'important');
    nav.style.setProperty('min-height', '0', 'important');
    nav.style.setProperty('overflow-y', 'auto', 'important');
    nav.style.setProperty('overflow-x', 'hidden', 'important');
    nav.style.setProperty('max-height', 'none', 'important');
    nav.style.setProperty('overscroll-behavior', 'contain', 'important');
    nav.style.setProperty('scrollbar-gutter', 'stable', 'important');

    if (!document.querySelector('#ekodi-admin-shell-v2-style')) {
      const style = document.createElement('style');
      style.id = 'ekodi-admin-shell-v2-style';
      style.textContent = `
        body.ekodi-admin-shell-v2.compact-control-center{height:100dvh;overflow:hidden}
        body.ekodi-admin-shell-v2.compact-control-center .app{height:100dvh;min-height:0;overflow:hidden}
        body.ekodi-admin-shell-v2.compact-control-center .sidebar{height:100dvh;min-height:0;overflow:hidden!important;display:flex!important;flex-direction:column!important}
        body.ekodi-admin-shell-v2.compact-control-center .side-brand,
        body.ekodi-admin-shell-v2.compact-control-center .side-caption{flex:0 0 auto}
        body.ekodi-admin-shell-v2.compact-control-center .sidebar nav{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important;padding-right:4px!important}
        body.ekodi-admin-shell-v2.compact-control-center .sidebar nav::-webkit-scrollbar{width:6px}
        body.ekodi-admin-shell-v2.compact-control-center .sidebar nav::-webkit-scrollbar-thumb{background:#29435d;border-radius:999px}
        body.ekodi-admin-shell-v2.compact-control-center .side-bottom{position:static!important;left:auto!important;right:auto!important;bottom:auto!important;flex:0 0 auto;margin-top:8px!important;padding-top:10px!important;background:#07101d}
        body.ekodi-admin-shell-v2.compact-control-center .side-bottom .profile.side-profile{display:grid!important;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;margin-top:9px;padding:9px 8px;border-top:1px solid #1b304a;border-bottom:1px solid #1b304a}
        body.ekodi-admin-shell-v2.compact-control-center .side-bottom .profile.side-profile>span{min-width:34px;padding:5px 7px;text-align:center}
        body.ekodi-admin-shell-v2.compact-control-center .side-bottom .profile.side-profile>div{display:flex!important;min-width:0;flex-direction:column}
        body.ekodi-admin-shell-v2.compact-control-center .side-bottom .profile.side-profile strong,
        body.ekodi-admin-shell-v2.compact-control-center .side-bottom .profile.side-profile small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        body.ekodi-admin-shell-v2.compact-control-center .side-bottom .profile.side-profile strong{font-size:11px}
        body.ekodi-admin-shell-v2.compact-control-center .side-bottom .profile.side-profile small{margin-top:2px;color:#7186a0;font-size:9px}
        body.ekodi-admin-shell-v2.compact-control-center .side-bottom .ghost{margin-top:8px!important}
        body.ekodi-admin-shell-v2.compact-control-center .topbar{display:none!important}
        body.ekodi-admin-shell-v2.compact-control-center .app>main{grid-column:2;min-width:0;height:100dvh;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;padding-top:0!important}
        body.ekodi-admin-shell-v2.compact-control-center .content{max-width:none;margin:0;padding-top:18px}
        @media(max-width:760px){
          body.ekodi-admin-shell-v2.compact-control-center .app{display:block!important}
          body.ekodi-admin-shell-v2.compact-control-center .app>main{grid-column:auto;height:100dvh;padding-top:56px!important}
          body.ekodi-admin-shell-v2.compact-control-center .topbar{display:flex!important;position:fixed!important;inset:0 0 auto 0!important;width:100%!important;height:56px!important;padding:0 12px!important;align-items:center!important;justify-content:flex-start!important;border-bottom:1px solid #182c45;background:#091321e8;backdrop-filter:blur(14px);z-index:1200!important;box-sizing:border-box!important}
          body.ekodi-admin-shell-v2.compact-control-center .topbar>div,
          body.ekodi-admin-shell-v2.compact-control-center .topbar .profile{display:none!important}
          body.ekodi-admin-shell-v2.compact-control-center .topbar .menu{display:grid!important;place-items:center;width:40px;height:40px;padding:0;border:1px solid #29415d;border-radius:10px;background:#0b1a2b;color:#f4f7fb}
          body.ekodi-admin-shell-v2.compact-control-center .sidebar{width:230px!important;inset:0 auto 0 -240px!important;transition:left .2s ease!important;z-index:1300!important}
          body.ekodi-admin-shell-v2.compact-control-center .sidebar.open{left:0!important;box-shadow:20px 0 60px #0008}
          body.ekodi-admin-shell-v2.compact-control-center .content{padding:14px 12px 28px}
        }
      `;
      document.head.appendChild(style);
    }
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
    installSharedAdminLayout();
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
  window.addEventListener('ekodi-nav-changed', installSharedAdminLayout);
  window.addEventListener('ekodi-feature-installed', installSharedAdminLayout);
})();