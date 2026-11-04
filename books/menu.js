// BOOKS-PUBLISHING-CHROME-001 — scripts/site-chrome.mjs가 생성합니다. 출판·에코디서점 공용 머리말 동작(모바일 메뉴, 현재 위치 표시).
(() => {
  'use strict';
  // AUTH-HANDOFF-FRAGMENT-ERASE-001: 출판·서점 화면은 로그인 인계 조각(#ekodi_token)을 쓰지 않으므로 주소창·기록에서 즉시 지운다.
  try {
    const frag = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : '');
    if (frag.has('ekodi_token')) history.replaceState(history.state, '', location.pathname + location.search);
  } catch {}
  const button = document.querySelector('.menu-button');
  const nav = document.getElementById('site-nav');
  if (nav) {
    const here = location.pathname.replace(/index\.html$/, '');
    nav.querySelectorAll('a').forEach(a => { let u = null; try { u = new URL(a.href); } catch {} if (!u || u.hash) return; const p = u.pathname.replace(/^\/(?:books|publishing)(?=\/)/, ''); if (p.length > 1 && here.endsWith(p)) a.setAttribute('aria-current', 'page'); });
  }
  if (!button || !nav || button.dataset.menuBound) return;
  button.dataset.menuBound = '1';
  const close = () => { if (!nav.classList.contains('open')) return; nav.classList.remove('open'); button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', () => { const open = nav.classList.toggle('open'); button.setAttribute('aria-expanded', String(open)); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); button.focus(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.ekc-header')) close(); });
})();
