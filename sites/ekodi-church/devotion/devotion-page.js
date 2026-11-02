// 에코디교회 오늘의 매일묵상: church header menu toggle for the standalone devotion page.
(() => {
  const button = document.querySelector('.church-devotion-header .menu-button');
  const nav = document.querySelector('#main-nav');
  if (!button || !nav) return;
  const setOpen = open => {
    nav.classList.toggle('open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  };
  button.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
})();
