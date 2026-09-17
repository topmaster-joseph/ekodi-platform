const APP_SELECTOR = '#app';

let installed = false;
let queued = false;
let observer = null;

function syncSidebar() {
  queued = false;
  window.EKODIAdminSidebar?.sync?.(document);
}

function scheduleSync() {
  if (queued) return;
  queued = true;
  queueMicrotask(syncSidebar);
}

export function installAdminContextShellRecovery(root = document) {
  if (installed) return observer;
  const app = root.querySelector?.(APP_SELECTOR);
  if (!app || typeof MutationObserver === 'undefined') return null;

  observer = new MutationObserver(mutations => {
    if (!mutations.some(mutation => mutation.type === 'childList')) return;
    scheduleSync();
  });
  observer.observe(app, { childList: true, subtree: false });
  installed = true;

  const teardown = () => {
    observer?.disconnect();
    observer = null;
    installed = false;
    queued = false;
  };
  window.addEventListener?.('pagehide', teardown, { once: true });
  return observer;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const install = () => installAdminContextShellRecovery(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}
