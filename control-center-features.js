(() => {
  const loadedScripts = new Map();
  const loadedStyles = new Map();
  let started = false;

  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const app = document.querySelector('#app');
  const financeButton = document.querySelector('button.nav[data-section="finance"]');

  function loadStyle(href) {
    if (loadedStyles.has(href)) return loadedStyles.get(href);
    const existing = document.querySelector(`link[data-ekodi-feature-style="${href}"]`);
    if (existing) return Promise.resolve(existing);
    const promise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.ekodiFeatureStyle = href;
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => resolve(link), { once: true });
      document.head.append(link);
    });
    loadedStyles.set(href, promise);
    return promise;
  }

  function loadScript(src) {
    if (loadedScripts.has(src)) return loadedScripts.get(src);
    const existing = document.querySelector(`script[data-ekodi-feature-script="${src}"]`);
    if (existing) return Promise.resolve(existing);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.ekodiFeatureScript = src;
      script.addEventListener('load', () => resolve(script), { once: true });
      script.addEventListener('error', () => reject(new Error(`${src} 로드 실패`)), { once: true });
      document.body.append(script);
    });
    loadedScripts.set(src, promise);
    return promise;
  }

  async function loadClients() {
    await loadStyle('client-access.css');
    await loadScript('client-access.js');
  }

  async function loadAdmins() {
    await loadStyle('google-admin-auth.css');
    await loadScript('google-admin-auth.js');
  }

  async function loadMarketing() {
    await loadStyle('marketing-funnel-admin.css');
    await loadScript('marketing-funnel-admin.js');
  }

  async function loadBooks() {
    await Promise.all([
      loadStyle('books-admin.css'),
      loadStyle('books-finance-admin.css'),
    ]);
    await loadScript('books-admin.js');
    await loadScript('books-finance-admin.js');
  }

  async function loadFinance() {
    await loadScript('finance-monitor.js');
  }

  function idle(callback) {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(callback, { timeout: 1200 });
    } else {
      setTimeout(callback, 180);
    }
  }

  function loadIdleQueue(queue, index = 0) {
    if (index >= queue.length || !token()) return;
    idle(async () => {
      try { await queue[index](); } catch (error) { console.warn('[EKODI feature]', error); }
      loadIdleQueue(queue, index + 1);
    });
  }

  async function prioritizeCurrentView() {
    const hash = location.hash.toLowerCase();
    if (hash === '#finance') {
      await loadFinance();
      financeButton?.click();
      return 'finance';
    }
    if (hash === '#books') {
      await loadBooks();
      return 'books';
    }
    if (hash === '#affiliates') {
      await loadClients();
      await loadMarketing();
      return 'marketing';
    }
    if (hash === '#clients') {
      await loadClients();
      document.querySelector('[data-section="clients"]')?.click();
      return 'clients';
    }
    if (hash === '#admins') {
      await loadAdmins();
      document.querySelector('[data-section="admins"]')?.click();
      return 'admins';
    }
    return '';
  }

  async function start() {
    if (started || !token() || !app || app.hidden) return;
    started = true;
    let priority = '';
    try { priority = await prioritizeCurrentView(); } catch (error) { console.warn('[EKODI priority feature]', error); }

    const queue = [];
    if (priority !== 'clients') queue.push(loadClients);
    if (priority !== 'admins') queue.push(loadAdmins);
    if (priority !== 'marketing') queue.push(loadMarketing);
    if (priority !== 'books') queue.push(loadBooks);
    loadIdleQueue(queue);
  }

  financeButton?.addEventListener('click', () => {
    loadFinance().catch(error => console.warn('[EKODI finance feature]', error));
  });

  if (app) {
    const observer = new MutationObserver(() => {
      if (!app.hidden && token()) {
        observer.disconnect();
        start();
      }
    });
    observer.observe(app, { attributes: true, attributeFilter: ['hidden'] });
  }

  start();
})();
