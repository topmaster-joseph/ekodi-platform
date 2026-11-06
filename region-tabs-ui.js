/**
 * Shared, dependency-free progressive tab enhancement for regional public surfaces.
 * The first panel remains usable without JavaScript; no authentication or API calls.
 */
export function renderRegionTabsScript(){
  return `<script>
  (() => {
    for (const tablist of document.querySelectorAll('[data-region-tablist]')) {
      const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
      if (!tabs.length) continue;
      const activate = (active, focus = false, remember = false) => {
        for (const tab of tabs) {
          const selected = tab === active;
          tab.setAttribute('aria-selected', String(selected));
          tab.tabIndex = selected ? 0 : -1;
          const panel = document.getElementById(tab.getAttribute('aria-controls'));
          if (panel) panel.hidden = !selected;
        }
        if (focus) active.focus();
        if (remember && window.history?.replaceState) {
          window.history.replaceState(null, '', '#' + active.id);
        }
      };
      for (const [index, tab] of tabs.entries()) {
        tab.addEventListener('click', () => activate(tab, false, true));
        tab.addEventListener('keydown', event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
            : event.key === 'Home' ? 0
            : event.key === 'End' ? tabs.length - 1
            : -1;
          if (next === -1) return;
          event.preventDefault();
          activate(tabs[next], true, true);
        });
      }
      const hash = decodeURIComponent(window.location.hash.slice(1));
      activate(tabs.find(tab => tab.id === hash) || tabs[0]);
      window.addEventListener('hashchange', () => {
        const target = tabs.find(tab => tab.id === decodeURIComponent(window.location.hash.slice(1)));
        if (target) activate(target);
      });
    }
  })();
  </script>`;
}
