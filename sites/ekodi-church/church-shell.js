// EKODI Church shared shell.
// 1) Sub-pages always show the same header menu and footer as the church
//    homepage: they are copied from the live homepage at load time, so a menu
//    or footer change on the homepage reaches every page without edits.
// 2) The header stays fixed at the top while scrolling on every church page.
(() => {
  'use strict';
  const HOME = '/ekodichurch/';
  const header = document.querySelector('header.site-header');
  const isHome = location.pathname === HOME || location.pathname === '/ekodichurch' || location.pathname === '/ekodichurch/index.html';

  function pinHeader() {
    if (!header) return;
    const position = getComputedStyle(header).position;
    // sticky is unreliable here (ancestor overflow rules), so pin with fixed and
    // keep the page's layout with a spacer when the header used to take space.
    if (position !== 'absolute' && position !== 'fixed') {
      const spacer = document.createElement('div');
      spacer.className = 'church-shell-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      const size = () => { spacer.style.height = header.offsetHeight + 'px'; };
      header.after(spacer);
      size();
      window.addEventListener('resize', size, { passive: true });
    }
    // Page stylesheets use !important on the header, so pin with priority too.
    for (const [key, value] of [['position', 'fixed'], ['top', '0'], ['left', '0'], ['right', '0'], ['z-index', '60']]) header.style.setProperty(key, value, 'important');
    // Pick a backdrop that keeps the header's own text readable.
    const ink = (getComputedStyle(header.querySelector('.brand strong') || header).color.match(/\d+/g) || [255, 255, 255]).slice(0, 3).map(Number);
    const lightInk = (0.2126 * ink[0] + 0.7152 * ink[1] + 0.0722 * ink[2]) / 255 > 0.5;
    header.classList.add(lightInk ? 'church-shell-ink-light' : 'church-shell-ink-dark');
    const solid = () => header.classList.toggle('church-shell-solid', window.scrollY > 24);
    solid();
    window.addEventListener('scroll', solid, { passive: true });
  }

  const style = document.createElement('style');
  style.textContent = '.site-header.church-shell-solid{backdrop-filter:saturate(140%) blur(10px);-webkit-backdrop-filter:saturate(140%) blur(10px);box-shadow:0 6px 24px #0000001f}.site-header.church-shell-solid.church-shell-ink-light{background:rgba(18,49,43,.96)!important}.site-header.church-shell-solid.church-shell-ink-dark{background:rgba(250,249,245,.97)!important}';
  document.head.appendChild(style);
  pinHeader();

  // This Church Pages source still owns the public Church UI. Reuse the EKODI
  // read-only footer and the separate privacy-aware native visit adapter, not a
  // second legal footer or a privileged admin shell.
  function mountVisitSummary() {
    const path = location.pathname;
    if (!/^\/ekodichurch(?:\/|$)/.test(path) ||
        /^\/ekodichurch\/(?:admin|my)(?:\/|$)/.test(path)) return;
    if (!document.querySelector('footer[data-ekodi-service-footer]')) return;
    document.documentElement.dataset.ekodiShellSurface = 'public';
    if (window.__EKODI_USER_UI_FOOTER_BOOTED || document.querySelector('script[data-church-native-footer]')) return;
    const beacon = document.createElement('script');
    beacon.src = 'https://ekodi.kr/shell/native-visit-beacon.js';
    beacon.async = false;
    beacon.dataset.churchNativeBeacon = 'shared';
    document.head.append(beacon);
    const footer = document.createElement('script');
    footer.src = 'https://ekodi.kr/shell/user-ui-footer.js';
    footer.async = false;
    footer.dataset.churchNativeFooter = 'shared';
    document.head.append(footer);
  }
  mountVisitSummary();
  if (isHome) return;

  const absolutize = root => root.querySelectorAll('a[href^="#"]').forEach(a => {
    const hash = a.getAttribute('href');
    a.setAttribute('href', hash === '#top' ? '#top' : HOME + hash);
  });

  async function syncFromHome() {
    const response = await fetch(HOME, { credentials: 'same-origin' });
    if (!response.ok) return;
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const homeNav = doc.querySelector('header.site-header #main-nav');
    const nav = document.querySelector('header.site-header #main-nav');
    if (homeNav && nav) {
      nav.innerHTML = homeNav.innerHTML;
      absolutize(nav);
      const here = location.pathname.replace(/index\.html$/, '');
      nav.querySelectorAll('a').forEach(a => {
        const path = new URL(a.href, location.href).pathname;
        if (path !== HOME && here.startsWith(path)) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    }
    const homeFooter = doc.querySelector('footer[data-ekodi-service-footer]');
    const footer = document.querySelector('footer[data-ekodi-service-footer]');
    if (homeFooter && footer) {
      footer.innerHTML = homeFooter.innerHTML;
      absolutize(footer);
    }
  }
  syncFromHome().catch(() => { /* keep the page's own header/footer on failure */ });
})();
