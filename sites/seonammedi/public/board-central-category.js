// Central category menu on standalone SeonamMedi boards; no credential handling.
// 소통채널 (and every other top menu) navigates to its home view, exactly like the
// home page. The old in-board overlay stacked a second "소통채널" block on top of
// the current board, so it stays hidden and is never opened here.
(() => {
  const panel=document.getElementById('central-category-panel');
  if(panel)panel.hidden=true;
  document.querySelectorAll('.site-header nav [data-category-menu]').forEach(a=>a.setAttribute('aria-expanded','false'));
})();

// Shared, image-free navigation layout for the public home and independent boards.
// This does not change authorization, persistence, existing menus or form handlers.
(() => {
  if (document.documentElement.dataset.seonamVisualInitialized === '1') return;
  const main = document.querySelector('body > main');
  const header = document.querySelector('body > header.site-header');
  if (!main || !header) return;
  document.documentElement.dataset.seonamVisualInitialized = '1';

  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  };
  // The original campaign poster is the only main image, on the home route.
  // Inner routes remain content-first; do not inject a shared stock photo.

  const right=el('aside','seonam-visual-right');
  right.setAttribute('aria-label','주요일정 및 날짜별 일정');
  const newsBox=el('section','seonam-visual-info-card');
  newsBox.append(el('h2','','주요일정'),el('p','seonam-calendar-status','일정을 불러오는 중입니다.'));
  const quick=el('section','seonam-visual-info-card');
  quick.append(el('h2','','선택 날짜 일정'));
  right.append(newsBox,quick);
  const calendarStyle=el('link');
  calendarStyle.rel='stylesheet';
  calendarStyle.href='/seonammedi/calendar-sidebar.css?v=20261020-event-open-1';
  document.head.append(calendarStyle);
  const calendarScript=el('script');
  calendarScript.src='/seonammedi/calendar-sidebar.js?v=20261020-event-open-1';
  calendarScript.addEventListener('load',()=>window.SeonamMediCalendar?.mount({newsBox,quick}));
  calendarScript.addEventListener('error',()=>{
    newsBox.querySelector('.seonam-calendar-status').textContent='일정표를 불러오지 못했습니다. 새로고침해 주세요.';
  });
  document.head.append(calendarScript);

  const content=el('div','seonam-visual-content');
  while(main.firstChild) content.append(main.firstChild);
  // Standalone boards render their category tabs next to the header; move that
  // existing node into the center column without recreating it or its listeners.
  const outsideCategory=document.querySelector('body > #central-category-panel');
  if(outsideCategory)content.prepend(outsideCategory);
  main.classList.add('seonam-visual-layout');
  main.append(content,right);
  // The original campaign image has a protected full-width, uncropped
  // presentation contract. Keep it below the overview rather than shrink
  // it into the center column or change its source bytes.
  const preservedCampaign=content.querySelector(':scope > .campaign-hero');
  if(preservedCampaign)header.insertAdjacentElement('afterend',preservedCampaign);
  document.body.classList.add('seonam-visual-ready');


})();
