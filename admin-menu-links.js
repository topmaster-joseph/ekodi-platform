(() => {
'use strict';
let registryPromise = null;
let scheduled = false;
let observer = null;

function registry() {
  registryPromise ||= import('./admin-menu-registry.js');
  return registryPromise;
}

function ensureLink(node, href, kind) {
  if (!node || !href) return node;
  let link = node;
  if (node.tagName !== 'A') {
    link = document.createElement('a');
    for (const { name, value } of [...node.attributes]) {
      if (name === 'type') continue;
      link.setAttribute(name, value);
    }
    while (node.firstChild) link.append(node.firstChild);
    node.replaceWith(link);
  }
  link.setAttribute('href', href);
  link.dataset.adminCanonicalHref = href;
  link.dataset.adminLinkContract = kind;
  if (/^https?:\/\//i.test(href)) {
    link.target = '_blank';
    link.rel = 'noopener';
  } else {
    link.removeAttribute('target');
    link.removeAttribute('rel');
  }
  return link;
}

function ensureLinkStyle() {
  if (document.querySelector('#ekodi-admin-link-contract-style')) return;
  const style = document.createElement('style');
  style.id = 'ekodi-admin-link-contract-style';
  style.textContent = '.admin-global-nav,.admin-context-tab{text-decoration:none}';
  document.head.append(style);
}

function bindObserver() {
  if (observer) return;
  const app = document.querySelector('#app');
  if (!app) return;
  observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length))) schedule();
  });
  observer.observe(app, { childList: true, subtree: true });
}

async function sync() {
  scheduled = false;
  const menu = await registry();
  ensureLinkStyle();
  bindObserver();

  for (const node of document.querySelectorAll('[data-admin-global-group]')) {
    const href = menu.getAdminMenuGroupRoute(node.dataset.adminGlobalGroup);
    ensureLink(node, href, 'group');
  }

  for (const node of document.querySelectorAll('[data-admin-context-section]')) {
    const section = node.dataset.adminContextSection;
    const href = menu.getAdminMenuRoute(section);
    ensureLink(node, href, 'section');
  }

  const nav = document.querySelector('.sidebar nav');
  if (nav) nav.dataset.adminLinkGovernance = 'canonical-v1';
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => void sync());
}

for (const eventName of ['ekodi-admin-ready', 'ekodi-nav-changed', 'ekodi-feature-installed', 'ekodi-admin-section-changed']) {
  window.addEventListener(eventName, schedule);
}

schedule();
})();
