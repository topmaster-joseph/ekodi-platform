(() => {
  const loadedModules = new Map();
  const loadedStyles = new Map();
  const placeholderButtons = new Map();
  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const app = document.querySelector('#app');
  const nav = document.querySelector('.sidebar nav');
  const financeButton = document.querySelector('button.nav[data-section="finance"]');
  const BOOKS_OPERATION_ORDER = ['publications', 'assets', 'governance', 'pipeline', 'distribution', 'finance', 'royalties', 'overview', 'inquiries', 'services', 'features'];

  function loadStyle(href) {
    if (loadedStyles.has(href)) return loadedStyles.get(href);
    const existing = document.querySelector(`link[data-ekodi-feature-style="${href}"]`) || document.querySelector(`link[href="${href}"]`);
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

  async function requestBooksOverview() {
    const headers = new Headers();
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    const response = await fetch('https://api.ekodi.kr/api/books/admin/overview', { headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `Books API 요청 실패 (${response.status})`);
    return data;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function selectBooksTab(name) {
    const section = document.querySelector('#booksAdminSection');
    if (!section) return;
    section.querySelectorAll('[data-books-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.booksTab === name));
    section.querySelectorAll('[data-books-pane]').forEach(pane => { pane.hidden = pane.dataset.booksPane !== name; });
  }

  function reorderBooksTabs() {
    const tabs = document.querySelector('#booksAdminSection .books-tabs');
    if (!tabs) return;
    for (const name of BOOKS_OPERATION_ORDER) {
      const tab = tabs.querySelector(`[data-books-tab="${name}"]`);
      if (tab) tabs.append(tab);
    }
  }

  function assetReadiness(book) {
    const formats = Array.isArray(book.format) ? book.format : [];
    const identifiers = book.identifiers || {};
    const checks = [
      ['Cover', Boolean(book.coverImage)],
      ['EPUB/PDF', formats.some(value => /EPUB|PDF/i.test(String(value)))],
      ['ISBN/ID', Boolean(identifiers.isbnEbook || identifiers.amazonAsin || identifiers.googleBooks)],
      ['Edition', Boolean(book.edition)],
    ];
    return { checks, ready: checks.every(([, ok]) => ok) };
  }

  function governanceReadiness(book) {
    const identifiers = book.identifiers || {};
    const checks = [
      ['Title', Boolean(book.title)],
      ['Author', Boolean(book.author)],
      ['Abstract', Boolean(book.abstract)],
      ['Citation', Boolean(book.citation)],
      ['Identifier', Boolean(identifiers.isbnEbook || identifiers.amazonAsin || identifiers.googleBooks)],
      ['Cover', Boolean(book.coverImage)],
      ['Release Stage', ['READY', 'PUBLISHED', 'ARCHIVED'].includes(String(book.stage || '').toUpperCase())],
    ];
    return { checks, ready: checks.every(([, ok]) => ok) };
  }

  async function renderAssetsShell() {
    const root = document.querySelector('#booksAssetsShell');
    if (!root || !token()) return;
    root.innerHTML = '<p class="books-empty">Asset readiness를 확인하는 중입니다.</p>';
    try {
      const state = await requestBooksOverview();
      const books = state.publications || [];
      root.innerHTML = books.length ? books.map(book => {
        const readiness = assetReadiness(book);
        const formats = Array.isArray(book.format) ? book.format.join(' · ') : '';
        return `<article class="books-row"><div class="books-row-main"><strong>${esc(book.title)}</strong><small>${esc(book.edition || 'Edition 미지정')} · ${esc(formats || 'Format 미지정')}</small><small>${readiness.checks.map(([label, ok]) => `${ok ? '✓' : '○'} ${label}`).join(' · ')}</small></div><span class="books-stage">${esc(book.stage || 'MANUSCRIPT')}</span><span class="books-status-chip">${readiness.ready ? 'READY' : 'CHECK'}</span></article>`;
      }).join('') : '<p class="books-empty">등록된 출판물이 없습니다.</p>';
    } catch (error) {
      root.innerHTML = `<p class="books-empty">${esc(error.message)}</p>`;
    }
  }

  async function renderGovernanceShell() {
    const root = document.querySelector('#booksGovernanceShell');
    if (!root || !token()) return;
    root.innerHTML = '<p class="books-empty">Public release readiness를 확인하는 중입니다.</p>';
    try {
      const state = await requestBooksOverview();
      const books = state.publications || [];
      root.innerHTML = books.length ? books.map(book => {
        const readiness = governanceReadiness(book);
        return `<article class="books-row"><div class="books-row-main"><strong>${esc(book.title)}</strong><small>${readiness.checks.map(([label, ok]) => `${ok ? '✓' : '○'} ${label}`).join(' · ')}</small></div><span class="books-stage">${esc(book.stage || 'MANUSCRIPT')}</span><span class="books-status-chip">${book.isPublic ? 'PUBLIC' : readiness.ready ? 'RELEASE READY' : 'BLOCKED'}</span></article>`;
      }).join('') : '<p class="books-empty">등록된 출판물이 없습니다.</p>';
    } catch (error) {
      root.innerHTML = `<p class="books-empty">${esc(error.message)}</p>`;
    }
  }

  function ensureBooksCoreTabs() {
    const section = document.querySelector('#booksAdminSection');
    const tabs = section?.querySelector('.books-tabs');
    if (!section || !tabs) return false;
    if (!tabs.querySelector('[data-books-tab="assets"]')) {
      const tab = document.createElement('button');
      tab.type = 'button'; tab.className = 'books-tab'; tab.dataset.booksTab = 'assets'; tab.textContent = 'Assets';
      tab.addEventListener('click', () => { selectBooksTab('assets'); renderAssetsShell(); }); tabs.append(tab);
      const pane = document.createElement('div');
      pane.className = 'books-pane'; pane.dataset.booksPane = 'assets'; pane.hidden = true;
      pane.innerHTML = '<div class="section-head"><div><p class="kicker">EDITION · FILE READINESS</p><h3>Assets</h3><p>표지, EPUB/PDF, 식별자와 Edition 메타데이터의 출간 준비상태를 확인합니다. 이 화면은 파일 업로드를 가장하지 않고 현재 등록된 서지·파일 메타데이터의 준비도를 보여줍니다.</p></div><button class="books-compact-button" type="button" data-books-assets-refresh>↻ Refresh</button></div><div class="books-list" id="booksAssetsShell"></div>';
      pane.querySelector('[data-books-assets-refresh]').addEventListener('click', renderAssetsShell); section.append(pane);
    }
    if (!tabs.querySelector('[data-books-tab="governance"]')) {
      const tab = document.createElement('button');
      tab.type = 'button'; tab.className = 'books-tab'; tab.dataset.booksTab = 'governance'; tab.textContent = 'Governance';
      tab.addEventListener('click', () => { selectBooksTab('governance'); renderGovernanceShell(); }); tabs.append(tab);
      const pane = document.createElement('div');
      pane.className = 'books-pane'; pane.dataset.booksPane = 'governance'; pane.hidden = true;
      pane.innerHTML = '<div class="section-head"><div><p class="kicker">PUBLIC RELEASE GATE</p><h3>Governance</h3><p>공개 전 제목, 저자, 초록, 인용정보, 식별자, 표지와 Release Stage를 점검합니다. 배포·매출·인세는 아래 운영 탭과 연결해 확인합니다.</p></div><button class="books-compact-button" type="button" data-books-governance-refresh>↻ Refresh</button></div><div class="books-list" id="booksGovernanceShell"></div>';
      pane.querySelector('[data-books-governance-refresh]').addEventListener('click', renderGovernanceShell); section.append(pane);
    }
    reorderBooksTabs(); return true;
  }

  function verifyBooksOperationTabs() {
    const tabs = document.querySelector('#booksAdminSection .books-tabs');
    if (!tabs) return;
    const required = ['publications', 'assets', 'governance', 'pipeline', 'distribution', 'finance', 'royalties'];
    const missing = required.filter(name => !tabs.querySelector(`[data-books-tab="${name}"]`));
    if (missing.length) console.warn('[EKODI Books] missing operation tabs:', missing.join(', '));
    reorderBooksTabs();
  }

  async function loadClients() { await Promise.all([loadStyle('client-access.css'), loadStyle('marketing-funnel-admin.css')]); await loadModule('client-access.js'); await loadModule('marketing-funnel-admin.js'); }
  async function loadAdmins() { await loadStyle('google-admin-auth.css'); await loadModule('google-admin-auth.js'); }
  async function loadDomains() { await loadStyle('domains-hub.css'); await loadModule('domains-hub.js'); }
  async function loadSocial() { await loadStyle('social-admin.css'); await loadModule('social-admin.js'); }
  async function loadAffiliates() { await loadStyle('marketing-funnel-admin.css'); await loadModule('marketing-funnel-admin.js'); }
  async function loadCommunity() { await loadStyle('community-reports-admin.css'); await loadModule('community-reports-admin.js'); }
  async function loadInsurance() { await loadStyle('insurance-admin.css'); await loadModule('insurance-admin.js'); }
  async function loadBooks() { await Promise.all([loadStyle('books-admin.css'), loadStyle('books-finance-admin.css')]); await loadModule('books-admin.js'); await loadModule('books-finance-admin.js'); ensureBooksCoreTabs(); verifyBooksOperationTabs(); }
  async function loadFinance() { await loadModule('finance-monitor.js'); }

  const loaders = { clients: loadClients, admins: loadAdmins, domains: loadDomains, social: loadSocial, affiliates: loadAffiliates, community: loadCommunity, insurance: loadInsurance, books: loadBooks, finance: loadFinance };

  function setShortLabel(section, label) { const button = nav?.querySelector(`[data-section="${section}"], [data-lazy-section="${section}"]`); const span = button?.querySelector('span'); if (span) span.textContent = label; }
  function openLazySection(section) { nav?.querySelector(`[data-section="${section}"], [data-lazy-section="${section}"]`)?.click(); }
  function normalizeShortLabels() {
    setShortLabel('admins', 'Admin'); setShortLabel('domains', 'Domains'); setShortLabel('social', 'Social'); setShortLabel('books', 'Books'); setShortLabel('insurance', 'Insurance');
    document.querySelectorAll('.campus-quick-actions [data-campus-section="admins"]').forEach(button => { button.textContent = 'Admin'; });
    document.querySelectorAll('a[href="/legacy#domains"], a[href="#domains"]').forEach(link => {
      if (link.closest('.sidebar')) return; if (link.closest('.campus-quick-actions')) link.textContent = 'Domains'; link.href = '#domains';
      if (link.dataset.domainsHubBound === 'true') return; link.dataset.domainsHubBound = 'true';
      link.addEventListener('click', event => { event.preventDefault(); openLazySection('domains'); if (location.hash !== '#domains') history.replaceState(null, '', '#domains'); });
    });
  }
  function removeResolvedPlaceholders() { if (!nav) return; for (const [section, button] of placeholderButtons) if (nav.querySelector(`[data-section="${section}"]`)) { button.remove(); placeholderButtons.delete(section); } }
  function notifyInstalled(section) { removeResolvedPlaceholders(); window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail: { section } })); normalizeShortLabels(); queueMicrotask(normalizeShortLabels); }
  async function activateLazy(section, button) {
    const loader = loaders[section]; if (!loader || !token()) return; button.disabled = true; button.setAttribute('aria-busy', 'true'); button.hidden = true;
    try { await loader(); notifyInstalled(section); const realButton = nav?.querySelector(`[data-section="${section}"]`); if (!realButton) throw new Error(`${section} 화면을 준비하지 못했습니다.`); queueMicrotask(() => realButton.click()); }
    catch (error) { console.warn('[EKODI lazy feature]', error); button.hidden = false; button.disabled = false; button.removeAttribute('aria-busy'); }
  }
  function placeholder(section, icon, label) {
    if (!nav || nav.querySelector(`[data-section="${section}"]`) || placeholderButtons.has(section)) return null;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'nav'; button.dataset.lazySection = section;
    button.append(document.createTextNode(`${icon} `)); const span = document.createElement('span'); span.textContent = label; button.append(span);
    button.addEventListener('click', () => activateLazy(section, button)); placeholderButtons.set(section, button); return button;
  }
  function installStaticBooksNavigation() {
    if (!nav) return null; let button = nav.querySelector('[data-section="books"]');
    if (!button) { button = document.createElement('button'); button.type = 'button'; button.className = 'nav'; button.dataset.section = 'books'; button.dataset.booksLoader = 'true'; button.append(document.createTextNode('▤ ')); const span = document.createElement('span'); span.textContent = 'Books'; button.append(span); const finance = nav.querySelector('[data-section="finance"]'); if (finance) nav.insertBefore(button, finance); else nav.append(button); }
    if (button.dataset.booksLazyBound !== 'true') {
      button.dataset.booksLazyBound = 'true';
      button.addEventListener('click', async event => {
        if (document.querySelector('#booksAdminSection') || !token()) return; event.preventDefault(); event.stopImmediatePropagation(); button.disabled = true; button.setAttribute('aria-busy', 'true');
        try { await loadBooks(); button.remove(); notifyInstalled('books'); const realButton = nav.querySelector('[data-section="books"]'); if (!realButton) throw new Error('Books 관리 화면을 준비하지 못했습니다.'); queueMicrotask(() => realButton.click()); }
        catch (error) { console.warn('[EKODI Books feature]', error); button.disabled = false; button.removeAttribute('aria-busy'); }
      }, true);
    }
    return button;
  }
  function installFeatureNavigation() {
    if (!nav) return;
    const services = nav.querySelector('[data-section="services"]'); const finance = nav.querySelector('[data-section="finance"]'); const communication = nav.querySelector('[data-section="communication"]'); const organization = nav.querySelector('[data-section="organization"]'); const policies = nav.querySelector('[data-section="policies"]');
    const activityLink = nav.querySelector('a[href="/legacy#activity"]'); const legacyDomainLink = nav.querySelector('a[href="/legacy#domains"]');
    const clients = placeholder('clients', '◎', 'Clients'); if (clients) services?.insertAdjacentElement('afterend', clients);
    const admins = placeholder('admins', '◈', 'Admin'); if (admins) (clients || nav.querySelector('[data-section="clients"]') || services)?.insertAdjacentElement('afterend', admins);
    const insurance = placeholder('insurance', '◇', 'Insurance'); if (insurance) (admins || nav.querySelector('[data-section="admins"]') || clients || services)?.insertAdjacentElement('afterend', insurance);
    const books = installStaticBooksNavigation();
    const community = placeholder('community', '◌', 'Community'); if (community) { if (books) nav.insertBefore(community, books); else if (finance) nav.insertBefore(community, finance); else nav.append(community); }
    const social = placeholder('social', '◉', 'Social'); if (social) { if (communication) communication.insertAdjacentElement('afterend', social); else if (organization) nav.insertBefore(social, organization); else nav.append(social); }
    const domains = placeholder('domains', '◎', 'Domains'); if (domains) { if (legacyDomainLink) nav.insertBefore(domains, legacyDomainLink); else if (activityLink) nav.insertBefore(domains, activityLink); else if (organization) organization.insertAdjacentElement('afterend', domains); else nav.append(domains); }
    legacyDomainLink?.remove();
    const affiliates = placeholder('affiliates', '↗', 'Affiliates'); if (affiliates) { if (policies) nav.insertBefore(affiliates, policies); else if (activityLink) nav.insertBefore(affiliates, activityLink); else nav.append(affiliates); }
    normalizeShortLabels();
  }
  function requestedSection() { const hash = location.hash.replace(/^#/, '').toLowerCase(); if (hash) return hash; return location.pathname.split('/').filter(Boolean)[0]?.toLowerCase() || ''; }
  function activateHash() { if (!token() || !app || app.hidden) return; const section = requestedSection(); if (!loaders[section]) return; nav?.querySelector(`[data-section="${section}"], [data-lazy-section="${section}"]`)?.click(); }

  installFeatureNavigation();
  financeButton?.addEventListener('click', () => { loadFinance().catch(error => console.warn('[EKODI finance feature]', error)); });
  window.addEventListener('ekodi-feature-installed', event => { normalizeShortLabels(); if (event.detail?.section === 'books') { ensureBooksCoreTabs(); verifyBooksOperationTabs(); } });
  window.addEventListener('hashchange', activateHash);
  if (app && app.hidden) { const observer = new MutationObserver(() => { if (!app.hidden && token()) { observer.disconnect(); normalizeShortLabels(); activateHash(); } }); observer.observe(app, { attributes: true, attributeFilter: ['hidden'] }); }
  else { normalizeShortLabels(); activateHash(); }
})();