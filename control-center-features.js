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

  async function loadDomains() {
    await loadStyle('domains-hub.css');
    await loadModule('domains-hub.js');
  }

  async function loadSocial() {
    await loadStyle('social-admin.css');
    await loadModule('social-admin.js');
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
    domains: loadDomains,
    social: loadSocial,
    affiliates: loadAffiliates,
    books: loadBooks,
    finance: loadFinance,
  };

  function setShortLabel(section, label) {
    const button = nav?.querySelector(`[data-section="${section}"], [data-lazy-section="${section}"]`);
    const span = button?.querySelector('span');
    if (span) span.textContent = label;
  }

  function openLazySection(section) {
    const button = nav?.querySelector(`[data-section="${section}"], [data-lazy-section="${section}"]`);
    button?.click();
  }

  function normalizeShortLabels() {
    setShortLabel('admins', 'Admin');
    setShortLabel('domains', 'Domains');
    setShortLabel('social', 'Social');

    document.querySelectorAll('.campus-quick-actions [data-campus-section="admins"]').forEach(button => {
      button.textContent = 'Admin';
    });

    document.querySelectorAll('a[href="/legacy#domains"], a[href="#domains"]').forEach(link => {
      if (link.closest('.sidebar')) return;
      if (link.closest('.campus-quick-actions')) link.textContent = 'Domains';
      link.href = '#domains';
      if (link.dataset.domainsHubBound === 'true') return;
      link.dataset.domainsHubBound = 'true';
      link.addEventListener('click', event => {
        event.preventDefault();
        openLazySection('domains');
        if (location.hash !== '#domains') history.replaceState(null, '', '#domains');
      });
    });
  }

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
    normalizeShortLabels();
    queueMicrotask(normalizeShortLabels);
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
    const communication = nav.querySelector('[data-section="communication"]');
    const organization = nav.querySelector('[data-section="organization"]');
    const policies = nav.querySelector('[data-section="policies"]');
    const activityLink = nav.querySelector('a[href="/legacy#activity"]');
    const legacyDomainLink = nav.querySelector('a[href="/legacy#domains"]');

    const clients = placeholder('clients', '◎', 'Clients');
    if (clients) services?.insertAdjacentElement('afterend', clients);

    const admins = placeholder('admins', '◈', 'Admin');
    if (admins) (clients || nav.querySelector('[data-section="clients"]') || services)?.insertAdjacentElement('afterend', admins);

    const books = placeholder('books', '▤', 'Books');
    if (books) {
      if (finance) nav.insertBefore(books, finance);
      else nav.append(books);
    }

    const social = placeholder('social', '◉', 'Social');
    if (social) {
      if (communication) communication.insertAdjacentElement('afterend', social);
      else if (organization) nav.insertBefore(social, organization);
      else nav.append(social);
    }

    const domains = placeholder('domains', '◎', 'Domains');
    if (domains) {
      if (legacyDomainLink) nav.insertBefore(domains, legacyDomainLink);
      else if (activityLink) nav.insertBefore(domains, activityLink);
      else if (organization) organization.insertAdjacentElement('afterend', domains);
      else nav.append(domains);
    }
    legacyDomainLink?.remove();

    const affiliates = placeholder('affiliates', '↗', 'Affiliates');
    if (affiliates) {
      if (policies) nav.insertBefore(affiliates, policies);
      else if (activityLink) nav.insertBefore(affiliates, activityLink);
      else nav.append(affiliates);
    }

    normalizeShortLabels();
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

  window.addEventListener('ekodi-feature-installed', normalizeShortLabels);
  window.addEventListener('hashchange', activateHash);

  if (app && app.hidden) {
    const observer = new MutationObserver(() => {
      if (!app.hidden && token()) {
        observer.disconnect();
        normalizeShortLabels();
        activateHash();
      }
    });
    observer.observe(app, { attributes: true, attributeFilter: ['hidden'] });
  } else {
    normalizeShortLabels();
    activateHash();
  }
})();