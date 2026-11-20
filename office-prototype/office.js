'use strict';
// The prototype intentionally reads no credentials, files or tenant data.
(function () {
  const tabs = Array.from(document.querySelectorAll('[role="tab"][data-tab]'));
  const allowed = new Set(['personal', 'team', 'desktop']);
  function select(name, focus) {
    if (!allowed.has(name)) return;
    for (const tab of tabs) {
      const active = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById('panel-' + tab.dataset.tab);
      if (panel) panel.hidden = !active;
      if (active && focus) tab.focus();
    }
  }
  function navigate(name) {
    select(name, true);
    window.history.replaceState(null, '', '#'+name);
  }
  for (const tab of tabs) {
    tab.addEventListener('click', function () { navigate(tab.dataset.tab); });
    tab.addEventListener('keydown', function (event) {
      const index = tabs.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      event.preventDefault();
      navigate(next.dataset.tab);
    });
  }
  window.addEventListener('hashchange', function () {
    const name = window.location.hash.slice(1);
    if (allowed.has(name)) select(name, false);
  });
  const initial = window.location.hash.slice(1);
  if (allowed.has(initial)) select(initial, false);
}());