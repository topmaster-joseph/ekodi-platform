const VERSION = '2.0.0';
const EXPECTED_GROUPS = Object.freeze(['home', 'operations', 'space', 'services', 'system']);
const ROOT_TOKENS = Object.freeze({
  '--ekodi-ui-bg': '#f6f8fb',
  '--ekodi-ui-surface': '#ffffff',
  '--ekodi-ui-surface-raised': '#f8fafc',
  '--ekodi-ui-border': '#d9e2ec',
  '--ekodi-ui-text': '#172033',
  '--ekodi-ui-muted': '#66768a',
  '--ekodi-ui-accent': '#155eef',
  '--ekodi-ui-radius': '12px',
});

let queued = false;

function ensureStylesheet() {
  const existing = document.querySelector('link[data-ekodi-admin-design-engine],link[data-ekodi-postauth-style="admin-design-engine.css"]');
  if (existing) { existing.dataset.ekodiAdminDesignEngine = VERSION; return; }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./admin-design-engine.css', import.meta.url).href;
  link.dataset.ekodiAdminDesignEngine = VERSION;
  document.head.append(link);
}

function applyRootTokens() {
  const root = document.documentElement;
  root.dataset.ekodiDesignEngine = VERSION;
  root.dataset.ekodiDesignSurface = 'admin';
  for (const [name, value] of Object.entries(ROOT_TOKENS)) root.style.setProperty(name, value);
}

function lockSidebarToViewport() {
  const body = document.body;
  const sidebar = document.querySelector('.sidebar');
  const nav = sidebar?.querySelector('nav');
  if (!body || !sidebar || !nav) return;

  body.classList.add('ekodi-admin-design-engine');
  sidebar.dataset.ekodiDesignEngineRegion = 'primary-navigation';
  nav.dataset.ekodiIndependentScroll = 'false';
  nav.dataset.ekodiPrimaryAxes = EXPECTED_GROUPS.join(',');
  nav.style.setProperty('overflow-y', 'hidden', 'important');
  nav.style.setProperty('overflow-x', 'hidden', 'important');
  nav.style.setProperty('overscroll-behavior', 'none', 'important');
}

function guardCharacterLayer() {
  for (const node of document.querySelectorAll('[data-ekodian-character]')) {
    node.dataset.ekodianGuarded = 'true';
    const role = String(node.dataset.ekodianRole || 'guide').trim().toLowerCase();
    if (!['guide', 'empty-state', 'error', 'onboarding', 'completion', 'assistant'].includes(role)) {
      node.dataset.ekodianRole = 'guide';
    }
    if (node.dataset.ekodianInteractive !== 'true') node.style.pointerEvents = 'none';
  }
}

function audit() {
  const nav = document.querySelector('.sidebar nav');
  if (!nav) return { ok: true, skipped: true, violations: [] };

  const violations = [];
  const actualGroups = [...nav.querySelectorAll('[data-admin-global-group]')]
    .map(node => node.dataset.adminGlobalGroup)
    .filter(Boolean);

  if (actualGroups.length && actualGroups.join('|') !== EXPECTED_GROUPS.join('|')) {
    violations.push(`primary axes must be ${EXPECTED_GROUPS.join(' · ')}; received ${actualGroups.join(' · ')}`);
  }

  const overflowY = getComputedStyle(nav).overflowY;
  if (overflowY === 'auto' || overflowY === 'scroll') violations.push(`primary sidebar must not scroll vertically; overflow-y=${overflowY}`);
  if (nav.dataset.ekodiIndependentScroll === 'true') violations.push('primary sidebar must never declare itself as an independent scroll owner');

  const topOffset = parseFloat(getComputedStyle(document.body).paddingTop || '0');
  if (matchMedia('(min-width:761px)').matches && topOffset > 0.5) violations.push(`admin shell top offset must be zero; padding-top=${topOffset}px`);

  if (document.documentElement.dataset.ekodiAdminReady === 'true') {
    const app = document.querySelector('#app');
    const workspace = app?.querySelector('main');
    const contextTabs = workspace?.querySelector(':scope>.admin-context-tabs-shell');
    const bodyOverflowY = getComputedStyle(document.body).overflowY;
    const appOverflowY = app ? getComputedStyle(app).overflowY : '';
    const workspaceOverflowY = workspace ? getComputedStyle(workspace).overflowY : '';
    if (bodyOverflowY !== 'hidden') violations.push(`body must not own admin scrolling; overflow-y=${bodyOverflowY}`);
    if (app && appOverflowY !== 'hidden') violations.push(`admin app frame must not own scrolling; overflow-y=${appOverflowY}`);
    if (workspace && !['auto','scroll'].includes(workspaceOverflowY)) violations.push(`workspace must own vertical scrolling; overflow-y=${workspaceOverflowY}`);
    if (workspace?.dataset.ekodiScrollOwner !== 'workspace') violations.push('workspace scroll owner marker is missing');
    if (!contextTabs) violations.push('contextual top tabs must exist between primary navigation and workspace content');
  }

  const detail = Object.freeze({
    version: VERSION,
    ok: violations.length === 0,
    groups: actualGroups,
    violations: Object.freeze([...violations]),
  });
  document.documentElement.dataset.ekodiDesignAudit = detail.ok ? 'pass' : 'fail';
  window.dispatchEvent(new CustomEvent('ekodi:design-engine-audit', { detail }));
  if (!detail.ok) console.warn('[EKODI Design Engine] runtime guardrail violations', violations);
  return detail;
}

function apply() {
  queued = false;
  ensureStylesheet();
  applyRootTokens();
  lockSidebarToViewport();
  guardCharacterLayer();
  queueMicrotask(audit);
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(apply);
}

for (const event of ['ekodi-admin-ready', 'ekodi-nav-changed', 'ekodi-feature-installed', 'ekodi-admin-section-changed']) {
  window.addEventListener(event, schedule);
}
window.addEventListener('resize', schedule, { passive: true });

window.EKODIDesignEngine = Object.freeze({
  version: VERSION,
  surface: 'admin',
  primaryAxes: EXPECTED_GROUPS,
  apply: schedule,
  audit,
  guardCharacters: guardCharacterLayer,
});

schedule();
