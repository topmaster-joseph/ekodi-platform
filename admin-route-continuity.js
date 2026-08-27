(() => {
  'use strict';

  const ROUTE_KEY = 'ekodi-admin-target-route';
  const TOKEN_KEY = 'ekodi-auth-token';
  const ROUTES = Object.freeze({
    operations:{section:'overview'}, campus:{section:'campus',demand:'campus'},
    'ai-ops':{section:'aiops',demand:'aiops'}, 'ai-module-spec':{section:'ai-module-spec',demand:'ai-module-spec'},
    'ai-membership':{section:'ai-membership',demand:'aimembers'}, health:{section:'health',demand:'health'},
    storage:{section:'storage',demand:'storage'}, security:{section:'security',demand:'security'},
    devices:{section:'devices',demand:'devices'}, work:{section:'work',demand:'work'},
    'marketing-ai':{section:'marketing-ai',demand:'marketing'}, deployments:{section:'deployments',demand:'deployments'},
    finance:{section:'finance'}, organization:{section:'organization'}, workspace:{section:'workspace'},
    architecture:{section:'architecture'}, policies:{section:'policies'}, clients:{section:'clients'},
    admins:{section:'admins'}, community:{section:'community'}, books:{section:'books'},
    social:{section:'social'}, affiliates:{section:'affiliates'},
  });
  let attempts = 0;
  let timer = 0;

  function pendingRoute() {
    try { return String(sessionStorage.getItem(ROUTE_KEY) || '').trim().toLowerCase(); } catch { return ''; }
  }
  function authenticated() {
    try { return Boolean(sessionStorage.getItem(TOKEN_KEY)); } catch { return false; }
  }
  function clearRoute() {
    try { sessionStorage.removeItem(ROUTE_KEY); } catch {}
  }
  function repairChrome() {
    const profile = document.querySelector('.profile.side-profile');
    if (!profile) return;
    profile.style.setProperty('display','flex','important');
    profile.style.setProperty('grid-template-columns','none','important');
    profile.style.setProperty('align-items','center','important');
    profile.style.setProperty('gap','8px','important');
    profile.style.setProperty('min-width','0','important');
    profile.style.setProperty('width','100%','important');
    const identity = profile.querySelector('div');
    const email = profile.querySelector('small');
    if (identity) identity.style.setProperty('min-width','0','important');
    if (email) {
      email.style.setProperty('display','block','important');
      email.style.setProperty('max-width','145px','important');
      email.style.setProperty('overflow','hidden','important');
      email.style.setProperty('text-overflow','ellipsis','important');
      email.style.setProperty('white-space','nowrap','important');
      email.style.setProperty('word-break','normal','important');
    }
  }
  function restore() {
    repairChrome();
    if (!authenticated()) return;
    const route = pendingRoute();
    const config = ROUTES[route];
    if (!route || !config) return clearRoute();
    if (location.hash !== `#${route}`) history.replaceState({},document.title,`#${route}`);

    if (config.demand && window.EKODIAdminDemand?.activate) {
      window.EKODIAdminDemand.activate(config.demand);
      clearRoute();
      return;
    }
    if (window.EKODIAdminPanels?.activate) {
      window.EKODIAdminPanels.activate(config.section);
      clearRoute();
      return;
    }
    const target = document.querySelector(`.sidebar [data-section="${config.section}"],.sidebar [data-lazy-section="${config.section}"]`);
    if (target) {
      target.click();
      clearRoute();
      return;
    }
    if (attempts++ < 8) {
      clearTimeout(timer);
      timer = setTimeout(restore,180);
    }
  }

  window.addEventListener('ekodi-nav-changed',restore);
  window.addEventListener('ekodi-feature-installed',restore);
  restore();
})();
