import { chromium } from 'playwright';

const ADMIN_URL = process.env.ADMIN_URL || 'https://admin.ekodi.kr/';
const SYNTHETIC_TOKEN = 'ekodi-production-ui-e2e';
const SYNTHETIC_EMAIL = 'production-ui-e2e@local.invalid';
const menus = [
  ['campus','home'],['public-site-controls','home'],['work','operations'],['communication','operations'],
  ['workspace','people'],['organization','people'],['clients','people'],['admins','people'],
  ['life-ai','services'],['common-services','services'],['community','services'],['books','services'],['social','services'],
  ['aiops','ai'],['marketing-ai','ai'],['ai-module-spec','ai'],['ai-membership','ai'],
  ['finance','business'],['tax','business'],['affiliates','business'],
  ['storage','data'],['api-cost','data'],
  ['health','system'],['security','system'],['devices','system'],['architecture','system'],
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(({ token, email }) => {
  sessionStorage.setItem('ekodi-auth-token', token);
  sessionStorage.setItem('ekodi-admin-email', email);
}, { token: SYNTHETIC_TOKEN, email: SYNTHETIC_EMAIL });

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/cloudflareinsights\.com\/beacon/i.test(message.text())) console.log(`[browser console] ${message.text()}`);
});

await page.route('https://api.ekodi.kr/api/session', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      ok: true,
      email: SYNTHETIC_EMAIL,
      role: 'super_admin',
      roles: ['super_admin'],
      isSuperAdmin: true,
      permissions: ['*'],
    }),
  });
});

async function waitForAdminShell() {
  await page.waitForFunction(() => document.documentElement.dataset.ekodiAdminReady === 'true', null, { timeout: 30000 });
  await page.waitForFunction(() => window.EKODIAdminPanels && window.EKODIAdminSidebar, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('button[data-admin-global-group]').length >= 8, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('.admin-context-source .nav').length >= 1, null, { timeout: 30000 });
}

const response = await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
if (!response || response.status() !== 200) throw new Error(`Admin entry returned ${response?.status() ?? 'no response'}`);
await waitForAdminShell();

const shellState = await page.evaluate(() => {
  const app = document.querySelector('#app');
  if (!app) return null;
  const style = getComputedStyle(app);
  const rect = app.getBoundingClientRect();
  return {
    hidden: app.hidden,
    display: style.display,
    visibility: style.visibility,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    shell: app.dataset.ekodiAdminShell || '',
  };
});
if (!shellState) throw new Error('Admin app element is missing');
if (shellState.hidden || shellState.display === 'none' || shellState.visibility === 'hidden' || shellState.width < 1 || shellState.height < 1) {
  throw new Error(`Admin shell is not rendered: ${JSON.stringify(shellState)}`);
}
if (shellState.shell !== 'shared-v2') throw new Error(`Admin shared shell did not install: ${JSON.stringify(shellState)}`);

const assetVersion = await page.locator('script[src*="admin-authenticated-shell.js?v="]').getAttribute('src').then(src => new URL(src, ADMIN_URL).searchParams.get('v'));
if (!assetVersion) throw new Error('Production Admin fingerprint is missing');
for (const asset of ['ekodi-message-ui.js', 'google-admin-auth.js']) {
  const assetResponse = await context.request.get(new URL(`${asset}?v=${encodeURIComponent(assetVersion)}`, ADMIN_URL).href, { timeout: 20000 });
  if (assetResponse.status() !== 200) throw new Error(`${asset} returned ${assetResponse.status()} for fingerprint ${assetVersion}`);
  const contentType = assetResponse.headers()['content-type'] || '';
  if (!/javascript|ecmascript|text\/plain/i.test(contentType)) throw new Error(`${asset} has non-script content type: ${contentType || '(missing)'}`);
}

const sourceIds = await page.locator('.admin-context-source .nav').evaluateAll(nodes => nodes.map(node => node.dataset.section || node.dataset.lazySection || '').filter(Boolean));
const missingSources = menus.map(([id]) => id).filter(id => !sourceIds.includes(id));
if (missingSources.length) throw new Error(`Missing production menu source(s): ${missingSources.join(', ')}`);

const results = [];
for (const [id, group] of menus) {
  console.log(`[PROD-E2E] ${id}: begin`);
  const global = page.locator(`button[data-admin-global-group="${group}"]`);
  await global.waitFor({ state: 'visible', timeout: 10000 });
  const globalActive = await global.evaluate(node => node.getAttribute('aria-current') === 'page' || node.classList.contains('active'));
  if (!globalActive) await global.evaluate(node => node.click());

  const tab = page.locator(`[data-admin-context-section="${id}"]`);
  await tab.waitFor({ state: 'visible', timeout: 10000 });

  if (id === 'tax') {
    const source = page.locator('.admin-context-source .nav[data-section="tax"]');
    const href = await source.getAttribute('href');
    if (!href?.startsWith('https://tax.ekodi.kr/')) throw new Error(`Tax handoff href is invalid: ${href}`);
    await Promise.all([
      page.waitForURL(url => url.hostname === 'tax.ekodi.kr', { timeout: 15000 }),
      tab.evaluate(node => node.click()),
    ]);
    const taxResponse = await context.request.get('https://tax.ekodi.kr/', { maxRedirects: 5, timeout: 20000 });
    if (taxResponse.status() < 200 || taxResponse.status() >= 400) throw new Error(`Tax handoff endpoint returned ${taxResponse.status()}`);
    const taxUrl = page.url();
    if (!taxUrl.startsWith('https://tax.ekodi.kr/')) throw new Error(`Tax click navigated to unexpected URL: ${taxUrl}`);
    results.push({ id, kind: 'handoff', ok: true, detail: taxUrl });
    console.log(`[PROD-E2E] ${id}: ok current-tab ${taxUrl}`);
    await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForAdminShell();
    continue;
  }

  await tab.evaluate(node => node.click());
  await page.waitForFunction(section => window.EKODIAdminPanels?.current?.() === section, id, { timeout: 12000 });
  await page.waitForFunction(section => {
    const panels = [...document.querySelectorAll('.content [data-panel]')].filter(panel => String(panel.dataset.panel || '').split(/\s+/).includes(section));
    return panels.some(panel => !panel.hidden && !panel.classList.contains('hidden-panel'));
  }, id, { timeout: 12000 });

  const visiblePanel = await page.evaluate(section => {
    const panel = [...document.querySelectorAll('.content [data-panel]')].find(node => String(node.dataset.panel || '').split(/\s+/).includes(section) && !node.hidden && !node.classList.contains('hidden-panel'));
    if (!panel) return null;
    const style = getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    const text = String(panel.innerText || panel.textContent || '').replace(/\s+/g, ' ').trim();
    return { tag: panel.tagName, id: panel.id || '', textLength: text.length, display: style.display, visibility: style.visibility, width: rect.width, height: rect.height };
  }, id);
  if (!visiblePanel || visiblePanel.textLength < 1 || visiblePanel.display === 'none' || visiblePanel.visibility === 'hidden' || visiblePanel.width < 1 || visiblePanel.height < 1) {
    throw new Error(`${id} did not render a visible non-empty panel: ${JSON.stringify(visiblePanel)}`);
  }
  if (id === 'campus' && visiblePanel.id !== 'campusPanel') throw new Error(`Campus rendered unexpected panel: ${visiblePanel.id || '(no id)'}`);
  results.push({ id, kind: 'panel', ok: true, detail: `${visiblePanel.id || visiblePanel.tag}:${visiblePanel.textLength}` });
  console.log(`[PROD-E2E] ${id}: ok ${visiblePanel.id || visiblePanel.tag}:${visiblePanel.textLength}`);
}

const activeCount = results.filter(result => result.ok).length;
console.log(`ADMIN_PRODUCTION_UI_E2E=${activeCount}/${menus.length}`);
console.log(`ADMIN_FINGERPRINT=${assetVersion}`);
for (const result of results) console.log(`PASS ${result.id} ${result.kind} ${result.detail}`);

const fatalErrors = pageErrors.filter(message => !/ResizeObserver loop/i.test(message));
if (fatalErrors.length) {
  console.log(`Observed page errors (${fatalErrors.length}):`);
  for (const error of fatalErrors) console.log(`PAGEERROR ${error}`);
  throw new Error('Production Admin emitted page errors during menu E2E');
}
if (activeCount !== menus.length) throw new Error(`Expected ${menus.length} verified menus, received ${activeCount}`);

await browser.close();