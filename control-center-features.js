(() => {
  const loadedModules = new Map();
  const loadedStyles = new Map();
  const placeholderButtons = new Map();
  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const app = document.querySelector('#app');
  const nav = document.querySelector('.sidebar nav');
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

  function loadModule(src) {
    if (loadedModules.has(src)) return loadedModules.get(src);
    const promise = import(`./${src}`).catch(error => {
      loadedModules.delete(src);
      throw error;
    });
    loadedModules.set(src, promise);
    return promise;
  }

  async function loadClients() {
    await Promise.all([
      loadStyle('client-access.css'),
      loadStyle('marketing-funnel-admin.css'),
    ]);
    await loadModule('client-access.js');
    await loadModule('marketing-funnel-admin.js');
  }

  async function loadAdmins() {
    await loadStyle('google-admin-auth.css');
    await loadModule('google-admin-auth.js');
  }

  async function loadAffiliates() {
    await loadStyle('marketing-funnel-admin.css');
    await loadModule('marketing-funnel-admin.js');
  }

  async function loadBooks() {
    await Promise.all([
      loadStyle('books-admin.css'),
      loadStyle('books-finance-admin.css'),
    ]);
    await loadModule('books-admin.js');
    await loadModule('books-finance-admin.js');
  }

  async function loadFinance() {
    await loadModule('finance-monitor.js');
  }

  const loaders = {
    clients: loadClients,
    admins: loadAdmins,
    affiliates: loadAffiliates,
    books: loadBooks,
    finance: loadFinance,
  };

  function removeResolvedPlaceholders() {
    if (!nav) return;
    for (const [section, button] of placeholderButtons) {
      if (nav.querySelector(`[data-section="${section}"]`)) {
        button.remove();
        placeholderButtons.delete(section);
      }
    }
  }

  function notifyInstalled(section) {
    removeResolvedPlaceholders();
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail: { section } }));
  }

  async function activateLazy(section, button) {
    const loader = loaders[section];
    if (!loader || !token()) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      await loader();
      notifyInstalled(section);
      const realButton = nav?.querySelector(`[data-section="${section}"]`);
      if (!realButton) throw new Error(`${section} 화면을 준비하지 못했습니다.`);
      queueMicrotask(() => realButton.click());
    } catch (error) {
      console.warn('[EKODI lazy feature]', error);
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  function placeholder(section, icon, label) {
    if (!nav || nav.querySelector(`[data-section="${section}"]`) || placeholderButtons.has(section)) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav';
    button.dataset.lazySection = section;
    button.append(document.createTextNode(`${icon} `));
    const span = document.createElement('span');
    span.textContent = label;
    button.append(span);
    button.addEventListener('click', () => activateLazy(section, button));
    placeholderButtons.set(section, button);
    return button;
  }

  function installFeatureNavigation() {
    if (!nav) return;
    const services = nav.querySelector('[data-section="services"]');
    const finance = nav.querySelector('[data-section="finance"]');
    const policies = nav.querySelector('[data-section="policies"]');
    const domainLink = nav.querySelector('a[href="/legacy#domains"]');

    const clients = placeholder('clients', '◎', 'Clients');
    if (clients) services?.insertAdjacentElement('afterend', clients);

    const admins = placeholder('admins', '◈', 'Admin Accounts');
    if (admins) (clients || nav.querySelector('[data-section="clients"]') || services)?.insertAdjacentElement('afterend', admins);

    const books = placeholder('books', '▤', 'Books');
    if (books) {
      if (finance) nav.insertBefore(books, finance);
      else nav.append(books);
    }

    const affiliates = placeholder('affiliates', '↗', 'Affiliates');
    if (affiliates) {
      if (policies) nav.insertBefore(affiliates, policies);
      else if (domainLink) nav.insertBefore(affiliates, domainLink);
      else nav.append(affiliates);
    }
  }

  function activateHash() {
    if (!token() || !app || app.hidden) return;
    const section = location.hash.replace(/^#/, '').toLowerCase();
    if (!loaders[section]) return;
    const button = nav?.querySelector(`[data-section="${section}"], [data-lazy-section="${section}"]`);
    button?.click();
  }

  installFeatureNavigation();

  financeButton?.addEventListener('click', () => {
    loadFinance().catch(error => console.warn('[EKODI finance feature]', error));
  });

  if (app && app.hidden) {
    const observer = new MutationObserver(() => {
      if (!app.hidden && token()) {
        observer.disconnect();
        activateHash();
      }
    });
    observer.observe(app, { attributes: true, attributeFilter: ['hidden'] });
  } else {
    activateHash();
  }
})();
