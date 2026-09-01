(() => {
  'use strict';
  if (globalThis.EKODIAgenticBootstrap) return;
  const start = () => import('./agentic-control-runtime.js')
    .then(() => import('./agentic-admin-shell.js'))
    .catch(error => console.warn('[EKODI Agentic Admin] deferred bootstrap failed', error));
  globalThis.EKODIAgenticBootstrap = Object.freeze({ start });
  if (document.documentElement.dataset.ekodiAdminReady === 'true') void start();
  else window.addEventListener('ekodi-admin-ready', () => void start(), { once: true });
})();
