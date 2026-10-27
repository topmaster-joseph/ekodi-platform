// BOOKS-MENU-001: 서점 하위 화면(구매·내 서재·시리즈 등) 공용 모바일 메뉴. 첫 화면은 app.js가 같은 일을 하므로 중복 연결하지 않는다.
(() => {
  'use strict';
  const button = document.querySelector('.menu-button');
  const nav = document.getElementById('site-nav');
  if (!button || !nav || button.dataset.menuBound) return;
  button.dataset.menuBound = '1';
  const close = () => { if (!nav.classList.contains('open')) return; nav.classList.remove('open'); button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', () => { const open = nav.classList.toggle('open'); button.setAttribute('aria-expanded', String(open)); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); button.focus(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.masthead')) close(); });
})();
