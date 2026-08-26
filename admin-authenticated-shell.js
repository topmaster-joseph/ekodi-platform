(() => {
  'use strict';

  const TOKEN_KEY = 'ekodi-auth-token';
  const ASSET_VERSION = '__EKODI_ADMIN_ASSET_VERSION__';
  const app = document.querySelector('#app');
  const loginScreen = document.querySelector('#loginScreen');
  const loginLink = document.querySelector('#centralAdminLogin');
  const postAuthStyles = ['compact-control-center.css'];
  const criticalPostAuthScripts = ['ekodi-message-ui.js','compact-control-center.js','admin-menu-layout.js','admin-demand-loader.js'];
  let started = false;

  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function authenticated() { return Boolean(token() && app && !app.hidden); }
  function assetUrl(path) { return `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(ASSET_VERSION)}`; }
  function setStyles(node, styles, priority = '') {
    if (!node) return;
    for (const [name, value] of Object.entries(styles)) node.style.setProperty(name, value, priority);
  }

  function applyOfficialAdminSurface() {
    const root = document.documentElement;
    root.dataset.ekodiShellSurface = 'admin';
    root.dataset.ekodiAdminUi = 'official';
    const tokens = {'--ekodi-ui-bg':'#071522','--ekodi-ui-surface':'#0B1D2E','--ekodi-ui-surface-raised':'#10263A','--ekodi-ui-border':'#24425E','--ekodi-ui-text':'#F4F7FB','--ekodi-ui-muted':'#9FB1C3','--ekodi-ui-accent':'#8EC8FF','--ekodi-ui-radius':'16px'};
    for (const [name, value] of Object.entries(tokens)) if (!root.style.getPropertyValue(name)) root.style.setProperty(name, value);
  }

  function keepLoginInteractive() {
    if (!loginScreen || authenticated()) return;
    setStyles(loginScreen,{position:'relative','z-index':'1000','pointer-events':'auto'});
    setStyles(loginLink,{position:'relative','z-index':'1','pointer-events':'auto'});
  }

  function loadStyle(href) {
    if (document.querySelector(`link[data-ekodi-postauth-style="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = assetUrl(href); link.dataset.ekodiPostauthStyle = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[data-ekodi-postauth-script="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = assetUrl(src); script.dataset.ekodiPostauthScript = src;
      script.addEventListener('load', resolve, { once:true });
      script.addEventListener('error', () => { console.warn(`[EKODI Admin] optional post-auth asset failed: ${src}`); resolve(); }, { once:true });
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
    if (profile && !sideBottom.contains(profile)) { profile.classList.add('side-profile'); sideBottom.insertBefore(profile, logoutButton || null); }
    if (pageTitle?.parentElement && topbar?.contains(pageTitle.parentElement)) pageTitle.parentElement.hidden = true;

    setStyles(document.body,{height:'100dvh',overflow:'hidden'});
    setStyles(app,{height:'100dvh',overflow:'hidden'});
    setStyles(sidebar,{height:'100dvh',overflow:'hidden'},'important');
    setStyles(sideBottom,{position:'static',flex:'0 0 auto'},'important');
    setStyles(nav,{flex:'1 1 auto','min-height':'0','overflow-y':'auto','overflow-x':'hidden','max-height':'none','overscroll-behavior':'contain'},'important');
    setStyles(main,{height:'100dvh','min-height':'0','overflow-y':'auto','overflow-x':'hidden','overscroll-behavior':'contain'});
    if (topbar) topbar.style.setProperty('display', matchMedia('(max-width:760px)').matches ? 'flex' : 'none', 'important');
  }

  function deactivateMallFreeOps() {
    const panel = document.querySelector('#mallFreeOpsPanel');
    if (!panel) return;
    const button = document.querySelector('.sidebar [data-admin-link="mall-free-ops"]');
    const frame = panel.querySelector('[data-mall-free-ops-frame]');
    panel.hidden = true;
    panel.classList.add('hidden-panel');
    button?.classList.remove('active');
    if (frame?.getAttribute('src')) frame.removeAttribute('src');
  }

  function installMallFreeOpsIsolation() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav || nav.dataset.mallFreeOpsIsolationBound) return;
    nav.dataset.mallFreeOpsIsolationBound = 'true';
    nav.addEventListener('click', event => {
      const item = event.target?.closest?.('.nav');
      if (!item) return;
      if (item.dataset.adminLink === 'mall-free-ops' || item.dataset.section === 'mall-free-ops') {
        const panel = document.querySelector('#mallFreeOpsPanel');
        if (panel?.hidden) panel.hidden = false;
      } else deactivateMallFreeOps();
    }, true);
    window.addEventListener('hashchange', () => { if (location.hash !== '#mall-free-ops') deactivateMallFreeOps(); });
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
      loadStyle('control-center-ops.css'); loadStyle('control-center-finance.css');
      await loadScript('control-center.js'); announceReady(); return;
    }
    for (const href of postAuthStyles) loadStyle(href);
    await Promise.all(criticalPostAuthScripts.map(loadScript));
    installSharedAdminLayout(); installMallFreeOpsIsolation(); announceReady();
  }

  function onStateChange() {
    if (authenticated()) return startAuthenticatedShell();
    keepLoginInteractive();
    if (!started && ['#campus','#operations','#policies','#ai-ops','#devices','#work','#marketing-ai','#deployments'].includes(location.hash)) document.documentElement.dataset.ekodiAdminPendingHash = location.hash.slice(1);
  }

  keepLoginInteractive(); onStateChange();
  window.addEventListener('ekodi-authenticated', onStateChange);
  window.addEventListener('ekodi-nav-changed', installSharedAdminLayout);
  window.addEventListener('ekodi-feature-installed', installSharedAdminLayout);
  matchMedia('(max-width:760px)').addEventListener?.('change', installSharedAdminLayout);
})();
