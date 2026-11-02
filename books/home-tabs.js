// BOOKS-UX-TABS-20261102 — lightweight tabs, preserving native sections/SEO and all existing links.
(() => {
  'use strict';
  const main = document.querySelector('main#main');
  if (!main || !document.querySelector('.hero') || !document.querySelector('#catalog')) return;
  const sections = {
    featured: [main.querySelector('.hero'), main.querySelector('.press-ribbon')],
    catalog: [main.querySelector('#catalog')],
    series: [],
    fields: [main.querySelector('#fields')],
    about: [main.querySelector('#method'), main.querySelector('#publishing-service-callout'), main.querySelector('#about')],
  };
  const tabs = [
    ['featured', '추천·첫 화면'], ['catalog', '출판목록'], ['series', '시리즈'],
    ['fields', '연구영역'], ['about', '소개·출판'],
  ];
  const bar = document.createElement('nav');
  bar.className = 'book-home-tabs';
  bar.setAttribute('aria-label', '에코디서점 주요 내용');
  bar.setAttribute('role', 'tablist');
  const panels = {};
  const buttons = {};
  for (const [key, label] of tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'bookHomeTab-' + key;
    button.className = 'book-home-tab';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'bookHomePanel-' + key);
    button.textContent = label;
    bar.append(button);
    buttons[key] = button;
    const panel = document.createElement('div');
    panel.id = 'bookHomePanel-' + key;
    panel.className = 'book-home-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.setAttribute('tabindex', '0');
    for (const section of sections[key]) if (section) panel.append(section);
    panels[key] = panel;
  }
  const series = document.createElement('section');
  series.className = 'book-series-landing shell';
  const kicker = document.createElement('p');
  kicker.className = 'kicker';
  kicker.textContent = 'EKODI SERIES';
  const title = document.createElement('h2');
  title.textContent = '에코디의 책을 시리즈로 만나다';
  const copy = document.createElement('p');
  copy.textContent = '연속되는 이야기와 연구 주제를 한곳에서 살펴보세요.';
  const links = document.createElement('div');
  links.className = 'book-series-actions';
  for (const [name, url] of [['전체 시리즈 보기','https://ekodi.kr/books/series/'],['에코디언 시리즈','https://ekodi.kr/books/ekodian/']]) {
    const a = document.createElement('a');a.href = url;a.textContent = name;links.append(a);
  }
  series.append(kicker, title, copy, links);
  panels.series.append(series);
  main.prepend(bar);
  for (const [key] of tabs) main.append(panels[key]);

  const keys = tabs.map(([key]) => key);
  const fromHash = () => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (['catalog'].includes(hash)) return 'catalog';
    if (['fields'].includes(hash)) return 'fields';
    if (['about','method','publishing-service-callout'].includes(hash)) return 'about';
    if (['series','series-tab'].includes(hash)) return 'series';
    return 'featured';
  };
  function select(key, updateHash = false, focus = false) {
    if (!panels[key]) return;
    for (const name of keys) {
      const selected = name === key;
      buttons[name].setAttribute('aria-selected', String(selected));
      buttons[name].tabIndex = selected ? 0 : -1;
      panels[name].hidden = !selected;
    }
    if (updateHash) history.replaceState(null, '', key === 'featured' ? '#featured' : key === 'about' ? '#about' : key === 'fields' ? '#fields' : key === 'series' ? '#series-tab' : '#catalog');
    if (focus) buttons[key].focus();
  }
  for (const [key] of tabs) {
    buttons[key].addEventListener('click', () => select(key, true));
    buttons[key].addEventListener('keydown', event => {
      let next = keys.indexOf(key);
      if (event.key === 'ArrowRight') next = (next + 1) % keys.length;
      else if (event.key === 'ArrowLeft') next = (next + keys.length - 1) % keys.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = keys.length - 1;
      else return;
      event.preventDefault();
      select(keys[next], true, true);
    });
  }
  addEventListener('hashchange', () => select(fromHash()));
  // Restore the correct panel when arriving from catalog/home links or the browser Back button.
  select(fromHash());
  if (location.hash && location.hash !== '#featured') bar.scrollIntoView({ block: 'start' });
})();
