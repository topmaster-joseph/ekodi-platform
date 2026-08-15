(() => {
  'use strict';

  const styles = [
    'ai-ops-admin.css',
    'release-control-admin.css',
    'work-admin.css',
    'marketing-ai-admin.css',
  ];
  const scripts = [
    'ai-ops-admin.js',
    'release-control-admin.js',
    'work-admin.js',
    'marketing-ai-admin.js',
  ];

  function loadStyle(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
    });
  }

  async function loadFeatures() {
    styles.forEach(loadStyle);
    for (const src of scripts) await loadScript(src);
    document.documentElement.dataset.ekodiAdminFeatures = 'ready';
  }

  function schedule() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => loadFeatures(), { timeout: 1800 });
    } else {
      window.setTimeout(loadFeatures, 250);
    }
  }

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();
