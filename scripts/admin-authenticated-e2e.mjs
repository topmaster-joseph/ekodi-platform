import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const token = String(process.env.E2E_ADMIN_TOKEN || '').trim();
if (!token) throw new Error('E2E_ADMIN_TOKEN is required');

const hardStop = setTimeout(() => {
  console.error('[E2E] hard timeout: authenticated admin browser verification exceeded 4 minutes');
  process.exit(124);
}, 240_000);
hardStop.unref?.();

const baseUrl = 'https://admin.ekodi.kr/';
const artifactsDir = path.resolve('artifacts/admin-authenticated-e2e');
await fs.mkdir(artifactsDir, { recursive: true });

const groups = {
  campus: 'home',
  work: 'operations', communication: 'operations',
  workspace: 'people', organization: 'people', clients: 'people', admins: 'people',
  'life-ai': 'services', community: 'services', books: 'services', social: 'services',
  aiops: 'ai', 'marketing-ai': 'ai', 'ai-module-spec': 'ai', 'ai-membership': 'ai',
  finance: 'business', tax: 'business', affiliates: 'business',
  storage: 'data', 'api-cost': 'data',
  health: 'system', security: 'system', devices: 'system', architecture: 'system',
};
const menuIds = Object.keys(groups);
const internalMenuIds = menuIds.filter(id => id !== 'tax');
const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedAdminAssets = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
context.setDefaultTimeout(5_000);
context.setDefaultNavigationTimeout(15_000);
const page = await context.newPage();
page.setDefaultTimeout(5_000);
page.setDefaultNavigationTimeout(15_000);

page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('requestfailed', request => {
  try {
    const url = new URL(request.url());
    if (url.hostname === 'admin.ekodi.kr' && /\.(?:js|css)(?:$|\?)/.test(url.pathname + url.search)) {
      failedAdminAssets.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`);
    }
  } catch {}
});

async function waitForAdminReady() {
  await page.waitForFunction(() => sessionStorage.getItem('ekodi-auth-token'), null, { timeout: 15_000 });
  await page.waitForSelector('#app:not([hidden])', { timeout: 15_000 });
  await page.waitForFunction(() => window.EKODIAdminPanels && window.EKODIAdminSidebar, null, { timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector('#apiState')?.textContent?.includes('정상'), null, { timeout: 15_000 });
}

function globalButton(group) {
  return page.locator(`button.admin-global-nav[data-admin-global-group="${group}"]`);
}

async function waitForVisiblePanel(id) {
  await page.waitForFunction(section => {
    return [...document.querySelectorAll('[data-panel]')].some(panel => {
      const ids = String(panel.dataset.panel || '').split(/\s+/).filter(Boolean);
      if (!ids.includes(section)) return false;
      const style = getComputedStyle(panel);
      return !panel.hidden && !panel.classList.contains('hidden-panel') && style.display !== 'none' && style.visibility !== 'hidden';
    });
  }, id, { timeout: 5_000 });
}

async function menuDiagnostics(id) {
  return page.evaluate(section => {
    const panels = [...document.querySelectorAll('[data-panel]')];
    const panel = panels.find(node => {
      const ids = String(node.dataset.panel || '').split(/\s+/).filter(Boolean);
      if (!ids.includes(section)) return false;
      const style = getComputedStyle(node);
      return !node.hidden && !node.classList.contains('hidden-panel') && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const selected = document.querySelector(`button.admin-context-tab[data-admin-context-section="${section}"]`);
    const text = String(panel?.innerText || '').replace(/\s+/g, ' ').trim();
    const busy = panel ? [...panel.querySelectorAll('[aria-busy="true"],.loading,.spinner')].filter(node => {
      const style = getComputedStyle(node);
      return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden';
    }).length : 0;
    return {
      panelFound: Boolean(panel),
      textLength: text.length,
      selected: selected?.getAttribute('aria-selected') === 'true' || selected?.classList.contains('active') || false,
      pageTitle: document.querySelector('#pageTitle')?.textContent?.trim() || '',
      currentSection: window.EKODIAdminPanels?.current?.() || '',
      hash: location.hash,
      busy,
    };
  }, id);
}

async function clickMenu(id) {
  const started = Date.now();
  const group = groups[id];
  console.log(`[E2E] ${id}: begin`);
  try {
    const global = globalButton(group);
    await global.waitFor({ state: 'visible', timeout: 5_000 });
    await global.click({ timeout: 5_000 });

    const tab = page.locator(`button.admin-context-tab[data-admin-context-section="${id}"]`);
    await tab.waitFor({ state: 'visible', timeout: 5_000 });
    await tab.click({ timeout: 5_000 });
    await waitForVisiblePanel(id);

    let state = await menuDiagnostics(id);
    if (!state.panelFound) throw new Error('visible panel not found');
    if (!state.selected) throw new Error('context tab did not become active');
    if (state.textLength < 4) throw new Error('rendered panel is effectively empty');

    if (state.busy) {
      await page.waitForTimeout(2_000);
      state = await menuDiagnostics(id);
      if (state.busy) throw new Error('loading indicator remained active');
    }

    const result = { id, group, ok: true, durationMs: Date.now() - started, ...state };
    results.push(result);
    console.log(`[E2E] ${id}: ok ${result.durationMs}ms`);
  } catch (error) {
    const state = await menuDiagnostics(id).catch(() => ({}));
    throw new Error(`${id}: ${error?.message || error}; diagnostics=${JSON.stringify(state)}`);
  }
}

async function clickTaxHandoff() {
  const started = Date.now();
  console.log('[E2E] tax: begin');
  const global = globalButton('business');
  await global.waitFor({ state: 'visible', timeout: 5_000 });
  await global.click({ timeout: 5_000 });
  const taxTab = page.locator('button.admin-context-tab[data-admin-context-section="tax"]');
  await taxTab.waitFor({ state: 'visible', timeout: 5_000 });
  const [response] = await Promise.all([
    page.waitForResponse(response => response.request().resourceType() === 'document' && response.url().startsWith('https://tax.ekodi.kr/'), { timeout: 10_000 }).catch(() => null),
    page.waitForURL(url => url.hostname === 'tax.ekodi.kr', { timeout: 10_000 }),
    taxTab.click({ timeout: 5_000 }),
  ]);
  if (response && !(response.status() >= 200 && response.status() < 400)) throw new Error(`tax: destination returned HTTP ${response.status()}`);
  if (new URL(page.url()).hostname !== 'tax.ekodi.kr') throw new Error(`tax: wrong handoff destination ${page.url()}`);
  const result = { id: 'tax', group: 'business', ok: true, durationMs: Date.now() - started, destination: 'https://tax.ekodi.kr/' };
  results.push(result);
  console.log(`[E2E] tax: ok ${result.durationMs}ms`);
  await page.goto(`${baseUrl}#ekodi_admin_token=${token}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await waitForAdminReady();
}

let fatal = null;
try {
  await page.goto(`${baseUrl}#ekodi_admin_token=${token}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await waitForAdminReady();

  const productionOrder = await page.evaluate(() => window.EKODIAdminPanels?.visibleMenuOrder || []);
  if (productionOrder.length !== 24) throw new Error(`Expected 24 visible admin menus, got ${productionOrder.length}`);
  for (const id of menuIds) if (!productionOrder.includes(id)) throw new Error(`Production menu registry missing ${id}`);

  for (const id of internalMenuIds) await clickMenu(id);
  await clickTaxHandoff();

  if (failedAdminAssets.length) throw new Error(`Admin JS/CSS request failures: ${failedAdminAssets.join(' | ')}`);
  if (pageErrors.length) throw new Error(`Uncaught page errors: ${pageErrors.join(' | ')}`);
  const seriousConsole = consoleErrors.filter(text => /(?:TypeError|ReferenceError|SyntaxError|uncaught|failed to load module|blocked untrusted admin handoff)/i.test(text));
  if (seriousConsole.length) throw new Error(`Serious console errors: ${seriousConsole.join(' | ')}`);
} catch (error) {
  fatal = error;
  await page.screenshot({ path: path.join(artifactsDir, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    expectedMenuCount: 24,
    checkedMenuCount: results.length,
    passed: !fatal,
    results,
    diagnostics: {
      pageErrors,
      consoleErrors: consoleErrors.slice(-40),
      failedAdminAssets,
    },
    error: fatal ? String(fatal?.stack || fatal?.message || fatal) : null,
  };
  await fs.writeFile(path.join(artifactsDir, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

clearTimeout(hardStop);
if (fatal) throw fatal;
console.log(`Authenticated admin E2E passed: ${results.length}/24 menus clicked and rendered.`);