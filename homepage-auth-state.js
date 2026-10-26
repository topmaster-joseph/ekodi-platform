// EKODI homepage authentication state (AUTH-RETURN-CONTINUITY-001, v1.27.3).
// Login from the homepage returns to the homepage itself (the exact pre-login page).
// This script only (1) erases a one-time handoff fragment the static homepage does not consume
// and (2) shows the signed-in state by turning the login button into a My EKODI link.
// It never navigates on its own, so the user stays on the page where login started.
(() => {
  'use strict';
  const SESSION_KEY = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i;
  function eraseHandoffFragment() {
    try {
      const hash = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : '');
      if (hash.has('ekodi_token')) history.replaceState(null, '', location.pathname + location.search);
    } catch {}
  }
  function signedIn() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        if (!SESSION_KEY.test(key)) continue;
        let parsed = null;
        try { parsed = JSON.parse(localStorage.getItem(key) || 'null'); } catch { continue; }
        const session = parsed?.currentSession || parsed?.session || parsed;
        const expires = Number(session?.expires_at || 0);
        if (session?.access_token && session?.user?.id && (!expires || expires * 1000 > Date.now())) return true;
      }
    } catch {}
    return false;
  }
  function render() {
    const login = document.querySelector('[data-ekodi-home-login]');
    if (!login || !signedIn()) return;
    login.href = 'https://ekodi.kr/my/';
    login.setAttribute('aria-label', 'My EKODI');
    const label = login.lastChild;
    const svg = login.querySelector('svg');
    login.replaceChildren(...(svg ? [svg] : []), document.createTextNode('My EKODI'));
    if (label && label.nodeType === 1 && label.tagName === 'SPAN') login.append(' ', Object.assign(document.createElement('span'), { textContent: 'Signed in' }));
    login.dataset.ekodiHomeLogin = 'signed-in';
  }
  eraseHandoffFragment();
  render();
  window.addEventListener('storage', render);
})();
