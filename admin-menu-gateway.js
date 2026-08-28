import {
  ADMIN_MENU_CHANNELS,
  adminMenuOrder,
  canonicalAdminHash,
  getAdminMenuChannel,
  getAdminMenuItem,
  normalizeAdminSection,
  resolveAdminMenuLocation,
} from './admin-menu-registry.js';
import { createAdminSidebarItem, syncAdminSidebar } from './admin-sidebar.js';

const mounted = new WeakMap();
const TOKEN_KEY = 'ekodi-auth-token';

function token() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function sectionOf(item) {
  if (item?.dataset?.adminGatewaySection) return normalizeAdminSection(item.dataset.adminGatewaySection);
  if (item?.dataset?.deviceControlNav === 'true') return 'devices';
  return normalizeAdminSection(item?.dataset?.section || item?.dataset?.lazySection || '');
}

function panelSections(panel) {
  return String(panel?.dataset?.panel || '').split(/\s+/).map(normalizeAdminSection).filter(Boolean);
}

function directClick(node) {
  if (!node) return;
  try { node.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: false, view: window })); }
  catch { try { node.click(); } catch {} }
}
function waitForChannel(channel, timeout = 5000) {
  const locate = () => {
    const panel = channel.panel ? document.querySelector(channel.panel) : null;
    const real = channel.real ? document.querySelector(channel.real) : null;
    return { panel, real, ready: Boolean(panel || real || channel.preserveExistingNav) };
  };
  const initial = locate();
  if (initial.ready) return Promise.resolve(initial);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const observer = new MutationObserver(() => {
      const value = locate();
      if (value.ready) finish(value);
    });
    const content = document.querySelector('.content');
    const nav = document.querySelector('.sidebar nav');
    if (content) observer.observe(content, { childList: true, subtree: true });
    if (nav) observer.observe(nav, { childList: true, subtree: true });
    const timer = setTimeout(() => finish(null, new Error(`${channel.id} 진입 채널 준비 시간이 초과되었습니다.`)), timeout);
  });
}

function subserviceValue(control) {
  if (!control?.dataset) return '';
  if (control.dataset.adminSubservice) return control.dataset.adminSubservice;
  if (control.dataset.openTab) return control.dataset.openTab;
  for (const [key, value] of Object.entries(control.dataset)) {
    if (key.endsWith('Tab') && value) return value;
  }
  return '';
}
export function mountAdminMenuGateway(root = document, options = {}) {
  const nav = root.querySelector?.('.sidebar nav');
  const content = root.querySelector?.('.content');
  if (!nav || !content) return null;
  const existing = mounted.get(nav);
  if (existing) return existing;

  const placeholders = new Map();
  const activators = new Map();
  let role = '';
  let requestId = 0;
  let currentSection = '';
  let currentSubservice = '';
  let sectionController = null;
  let subserviceController = null;

  function allowed(section) {
    const definition = getAdminMenuItem(section);
    const channel = getAdminMenuChannel(section);
    return !(definition?.superAdminOnly || channel?.superAdminOnly) || role === 'super_admin';
  }

  function channelNeedsAssets(channel) {
    return Boolean(channel && ((channel.styles?.length || 0) + (channel.scripts?.length || 0)));
  }

  function canonicalButton(section) {
    return nav.querySelector(`[data-admin-gateway-section="${section}"], [data-section="${section}"]`);
  }

  function createPlaceholder(section) {
    const channel = getAdminMenuChannel(section);
    if (!channel || channel.preserveExistingNav || !allowed(section)) return null;
    const current = canonicalButton(section);
    if (current) return current;
    const button = createAdminSidebarItem(section);
    if (!button) return null;
    delete button.dataset.section;
    button.dataset.lazySection = section;
    button.dataset.adminGatewaySection = section;
    button.dataset.adminGatewayState = 'idle';
    placeholders.set(section, button);
    nav.append(button);
    return button;
  }
  function reconcileNavigation() {
    for (const section of adminMenuOrder()) {
      const channel = getAdminMenuChannel(section);
      if (!channel || channel.preserveExistingNav) continue;
      const current = canonicalButton(section);
      if (!allowed(section)) {
        current?.remove();
        placeholders.delete(section);
        continue;
      }
      if (!current) createPlaceholder(section);
    }
    syncAdminSidebar(root);
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail: { feature: 'gateway' } }));
  }

  function showLoading(section) {
    const channel = getAdminMenuChannel(section);
    if (!channelNeedsAssets(channel) || window.EKODIAdminAssets?.isLoaded?.(section)) return;
    let panel = content.querySelector('#ekodiGatewayLoading');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'ekodiGatewayLoading';
      panel.className = 'section';
      panel.dataset.panel = '__gateway_loading';
      panel.innerHTML = '<div class="operations-loading" role="status" aria-live="polite"><strong data-gateway-loading-title>관리 기능 준비 중</strong><p data-gateway-loading-copy>필요한 화면만 안전하게 불러오고 있습니다.</p></div>';
      content.prepend(panel);
    }
    for (const item of content.querySelectorAll('[data-panel]')) item.classList.toggle('hidden-panel', item !== panel);
    panel.hidden = false;
    panel.querySelector('[data-gateway-loading-title]').textContent = `${getAdminMenuItem(section)?.labels?.ko || section} 준비 중`;
    document.documentElement.dataset.ekodiLoadingSection = section;
  }

  function hideLoading(message = '') {
    delete document.documentElement.dataset.ekodiLoadingSection;
    const panel = content.querySelector('#ekodiGatewayLoading');
    if (!panel) return;
    const copy = panel.querySelector('[data-gateway-loading-copy]');
    if (message && copy) copy.textContent = message;
    if (!message) {
      panel.hidden = true;
      panel.classList.add('hidden-panel');
    }
  }
  function promotePlaceholder(section, real = null) {
    const placeholder = placeholders.get(section) || nav.querySelector(`[data-admin-gateway-section="${section}"]`);
    if (!placeholder) return real;
    if (real && real !== placeholder) {
      activators.set(section, real);
      real.remove();
    }
    delete placeholder.dataset.lazySection;
    placeholder.dataset.section = section;
    placeholder.dataset.adminGatewaySection = section;
    placeholder.dataset.adminGatewayState = 'ready';
    placeholder.disabled = false;
    placeholder.removeAttribute('aria-busy');
    placeholders.set(section, placeholder);
    return placeholder;
  }

  function canonicalizeInstalledChannels() {
    for (const channel of Object.values(ADMIN_MENU_CHANNELS)) {
      if (channel.preserveExistingNav || !allowed(channel.id)) continue;
      const placeholder = placeholders.get(channel.id) || nav.querySelector(`[data-admin-gateway-section="${channel.id}"]`);
      if (!placeholder) continue;
      const real = channel.real ? document.querySelector(channel.real) : null;
      const panel = channel.panel ? document.querySelector(channel.panel) : null;
      if (real && real !== placeholder) promotePlaceholder(channel.id, real);
      else if (panel) promotePlaceholder(channel.id);
    }
    syncAdminSidebar(root);
  }

  async function prepareChannel(section, channel) {
    if (!channel || !channelNeedsAssets(channel)) return { panel: null, real: null };
    const button = placeholders.get(section) || canonicalButton(section);
    if (button) {
      button.dataset.adminGatewayState = 'loading';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }
    await window.EKODIAdminAssets?.loadChannel?.(channel);
    const located = await waitForChannel(channel);
    if (channel.preserveExistingNav) {
      const existing = nav.querySelector(`[data-section="${section}"]`);
      if (existing) activators.set(section, existing);
    } else {
      promotePlaceholder(section, located.real);
    }
    canonicalizeInstalledChannels();
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail: { section, gateway: true } }));
    return located;
  }
  function setSubservice(section, subservice, source = 'ui') {
    const next = String(subservice || '').trim();
    if (!next || section !== currentSection) return;
    const previous = currentSubservice;
    if (previous === next && subserviceController && !subserviceController.signal.aborted) return;
    subserviceController?.abort('subservice-change');
    subserviceController = new AbortController();
    currentSubservice = next;
    try {
      history.replaceState({ ...(history.state || {}), ekodiAdmin: { section, subservice: next } }, '', location.href);
    } catch {}
    window.dispatchEvent(new CustomEvent('ekodi-admin-subservice-changed', {
      detail: { section, subservice: next, previous, source, signal: subserviceController.signal }
    }));
  }

  async function open(rawSection, settings = {}) {
    const raw = String(rawSection || '').trim().toLowerCase();
    const section = normalizeAdminSection(raw);
    const subservice = settings.subservice || (raw === 'sites' ? 'sites' : '');
    if (!section || !getAdminMenuItem(section) || !token()) return false;
    if (!allowed(section)) {
      window.dispatchEvent(new CustomEvent('ekodi-admin-gateway-denied', { detail: { section, reason: 'role' } }));
      return false;
    }

    const id = ++requestId;
    const previous = currentSection;
    if (previous !== section) {
      sectionController?.abort('section-change');
      subserviceController?.abort('section-change');
      sectionController = new AbortController();
      subserviceController = null;
      currentSubservice = '';
    } else if (!sectionController || sectionController.signal.aborted) {
      sectionController = new AbortController();
    }
    currentSection = section;
    const channel = getAdminMenuChannel(section);
    const requestedHash = section === 'campus' && subservice === 'sites' ? '#sites' : canonicalAdminHash(section);
    if (settings.updateHistory !== false && location.hash !== requestedHash) history.replaceState(null, '', requestedHash);

    window.dispatchEvent(new CustomEvent('ekodi-admin-gateway-will-open', {
      detail: { section, subservice, previous, source: settings.source || 'api', signal: sectionController.signal }
    }));
    showLoading(section);
    try {
      if (channel && channelNeedsAssets(channel) && !window.EKODIAdminAssets?.isLoaded?.(section)) {
        await prepareChannel(section, channel);
      } else {
        canonicalizeInstalledChannels();
      }
      if (id !== requestId) return false;

      const activator = activators.get(section);
      if (activator) directClick(activator);
      const activated = await options.activate?.(section, {
        channel,
        subservice,
        source: settings.source || 'api',
        signal: sectionController.signal,
      });
      if (id !== requestId) return false;

      hideLoading();
      if (subservice) {
        setSubservice(section, subservice, settings.source || 'route');
        const candidates = content.querySelectorAll('button, a, [role="tab"]');
        const control = [...candidates].find(node => subserviceValue(node) === subservice);
        if (control) control.click();
      }
      window.dispatchEvent(new CustomEvent('ekodi-admin-gateway-opened', {
        detail: { section, subservice: currentSubservice, previous, activated: activated !== false, signal: sectionController.signal }
      }));
      return activated !== false;
    } catch (error) {
      console.warn(`[EKODI Admin Gateway] ${section} open failed`, error);
      hideLoading('화면을 불러오지 못했습니다. 메뉴를 다시 누르면 재시도합니다.');
      const button = placeholders.get(section) || canonicalButton(section);
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.dataset.adminGatewayState = 'error';
      }
      return false;
    }
  }

  function prefetchFromItem(item) {
    const section = sectionOf(item);
    const channel = getAdminMenuChannel(section);
    if (!channel || !allowed(section)) return;
    window.EKODIAdminAssets?.prefetchChannel?.(channel);
  }
  function handleSubserviceClick(event) {
    const control = event.target?.closest?.('button, a, [role="tab"]');
    const subservice = subserviceValue(control);
    if (!control || !subservice) return;
    const panel = control.closest('[data-panel]');
    const fromPanel = panelSections(panel).find(id => getAdminMenuItem(id));
    const section = fromPanel || currentSection;
    if (section) queueMicrotask(() => setSubservice(section, subservice, 'control'));
  }

  function onRole(event) {
    role = String(event?.detail?.role || document.documentElement.dataset.ekodiAdminRole || '');
    reconcileNavigation();
  }

  function onHashChange() {
    const route = resolveAdminMenuLocation(location);
    if (!route.section || route.section === currentSection && (!route.subservice || route.subservice === currentSubservice)) return;
    open(route.section, { subservice: route.subservice, source: 'hash', updateHistory: false });
  }

  role = String(document.documentElement.dataset.ekodiAdminRole || '');
  nav.addEventListener('pointerover', event => prefetchFromItem(event.target?.closest?.('.nav')), { passive: true });
  nav.addEventListener('focusin', event => prefetchFromItem(event.target?.closest?.('.nav')));
  content.addEventListener('click', handleSubserviceClick);
  window.addEventListener('ekodi-session-validated', onRole);
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('ekodi-feature-installed', canonicalizeInstalledChannels);
  reconcileNavigation();

  const api = Object.freeze({
    open,
    prefetch: section => window.EKODIAdminAssets?.prefetchChannel?.(getAdminMenuChannel(section)),
    reconcile: reconcileNavigation,
    current: () => Object.freeze({ section: currentSection, subservice: currentSubservice, role }),
    sectionSignal: () => sectionController?.signal || null,
    subserviceSignal: () => subserviceController?.signal || null,
    setSubservice: (subservice, source = 'api') => setSubservice(currentSection, subservice, source),
    destroy: () => {
      sectionController?.abort('gateway-destroy');
      subserviceController?.abort('gateway-destroy');
      content.removeEventListener('click', handleSubserviceClick);
      window.removeEventListener('ekodi-session-validated', onRole);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('ekodi-feature-installed', canonicalizeInstalledChannels);
      mounted.delete(nav);
    },
  });
  mounted.set(nav, api);
  window.EKODIAdminGateway = api;
  return api;
}
