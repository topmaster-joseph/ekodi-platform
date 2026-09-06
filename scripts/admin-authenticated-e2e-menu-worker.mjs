import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { adminMenuOrder, getAdminMenuGroupForSection } from '../admin-menu-registry.js';

const token = String(process.env.E2E_ADMIN_TOKEN || '').trim();
const menuId = String(process.env.E2E_MENU_ID || '').trim();
if (!token) throw new Error('E2E_ADMIN_TOKEN is required');
if (!menuId) throw new Error('E2E_MENU_ID is required');

const menuIds = adminMenuOrder();
if (!menuIds.includes(menuId)) throw new Error(`Unknown Admin menu: ${menuId}`);
const group = getAdminMenuGroupForSection(menuId);
const baseUrl = 'https://admin.ekodi.kr/';
const authenticatedEntryUrl = `${baseUrl}?route=finance#ekodi_admin_token=${token}`;
const artifactsDir = path.resolve('artifacts/admin-authenticated-e2e');
const reportPath = path.join(artifactsDir, `menu-${menuId.replace(/[^a-z0-9_-]/gi, '_')}.json`);
await fs.mkdir(artifactsDir, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const failedAdminAssets = [];
const results = [];
let browser;
let page;
let fatal = null;
let currentStage = 'bootstrap';
const stage = value => { currentStage = value; console.log(`[E2E:${menuId}] stage=${value}`); };

async function clickFast(locator) {
  await locator.waitFor({ state: 'visible', timeout: 5_000 });
  await locator.click({ force: true, noWaitAfter: true, timeout: 5_000 });
}

async function waitForReady() {
  stage('ready-token');
  await page.waitForFunction(() => sessionStorage.getItem('ekodi-auth-token'), null, { timeout: 15_000 });
  stage('ready-app');
  await page.waitForSelector('#app:not([hidden])', { timeout: 15_000 });
  stage('ready-runtime');
  await page.waitForFunction(() => window.EKODIAdminPanels && window.EKODIAdminSidebar, null, { timeout: 15_000 });
  stage('ready-session');
  await page.waitForFunction(() => document.querySelector('#apiState')?.textContent?.includes('정상'), null, { timeout: 15_000 });
}

async function selectWorkArea() {
  stage('global');
  const global = page.locator(`button.admin-global-nav[data-admin-global-group="${group}"]`);
  await global.waitFor({ state: 'visible', timeout: 5_000 });
  const aria = await global.getAttribute('aria-current');
  const classes = String(await global.getAttribute('class') || '');
  if (aria !== 'page' && !classes.split(/\s+/).includes('active')) await clickFast(global);
  await page.waitForFunction(target => [...document.querySelectorAll('button[data-admin-global-group]')].some(node => node.dataset.adminGlobalGroup === target && (node.getAttribute('aria-current') === 'page' || node.classList.contains('active'))), group, { timeout: 5_000 });
}

async function visiblePanelState() {
  return page.evaluate(section => {
    const panel = [...document.querySelectorAll('[data-panel]')].find(node => {
      const ids = String(node.dataset.panel || '').split(/\s+/).filter(Boolean);
      const style = getComputedStyle(node);
      return ids.includes(section) && !node.hidden && !node.classList.contains('hidden-panel') && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const tab = document.querySelector(`button.admin-context-tab[data-admin-context-section="${section}"]`);
    const text = String(panel?.innerText || '').replace(/\s+/g, ' ').trim();
    const busy = panel ? [panel, ...panel.querySelectorAll('[aria-busy="true"],.loading,.spinner')].filter(node => {
      if (!node.matches('[aria-busy="true"],.loading,.spinner')) return false;
      const style = getComputedStyle(node);
      return node.getAttribute('aria-hidden') !== 'true' && !node.hidden && style.display !== 'none' && style.visibility !== 'hidden';
    }).length : 0;
    return {
      panelFound: Boolean(panel), textLength: text.length, busy,
      selected: tab?.getAttribute('aria-selected') === 'true' || tab?.classList.contains('active') || false,
      pageTitle: document.querySelector('#pageTitle')?.textContent?.trim() || '',
      currentSection: window.EKODIAdminPanels?.current?.() || '', hash: location.hash,
    };
  }, menuId);
}

async function waitForSettledPanel(timeout = 8_000) {
  await page.waitForFunction(section => {
    const panel = [...document.querySelectorAll('[data-panel]')].find(node => {
      const ids = String(node.dataset.panel || '').split(/\s+/).filter(Boolean);
      const style = getComputedStyle(node);
      return ids.includes(section) && !node.hidden && !node.classList.contains('hidden-panel') && style.display !== 'none' && style.visibility !== 'hidden';
    });
    if (!panel) return false;
    const text = String(panel.innerText || '').replace(/\s+/g, ' ').trim();
    const busy = [panel, ...panel.querySelectorAll('[aria-busy="true"],.loading,.spinner')].some(node => {
      if (!node.matches('[aria-busy="true"],.loading,.spinner')) return false;
      const style = getComputedStyle(node);
      return node.getAttribute('aria-hidden') !== 'true' && !node.hidden && style.display !== 'none' && style.visibility !== 'hidden';
    });
    return text.length >= 4 && !busy;
  }, menuId, { timeout });
}

function externalStorageNavigation() {
  return page.waitForRequest(request => {
    try {
      const url = new URL(request.url());
      return request.isNavigationRequest() && request.frame() === page.mainFrame() && url.hostname !== 'admin.ekodi.kr';
    } catch { return false; }
  }, { timeout: 10_000 }).then(request => request.url()).catch(() => null);
}

async function verifyStorage(tab, alreadyActive, started) {
  const navigation = externalStorageNavigation();
  if (!alreadyActive) await clickFast(tab);
  stage('storage-outcome');
  const panel = page.waitForFunction(section => {
    const node = [...document.querySelectorAll('[data-panel]')].find(el => String(el.dataset.panel || '').split(/\s+/).includes(section));
    if (!node || node.hidden || node.classList.contains('hidden-panel')) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const text = String(node.innerText || '').replace(/\s+/g, ' ').trim();
    const busy = [...node.querySelectorAll('[aria-busy="true"],.loading,.spinner')].some(el => {
      const s = getComputedStyle(el); return el.getAttribute('aria-hidden') !== 'true' && !el.hidden && s.display !== 'none' && s.visibility !== 'hidden';
    });
    return text.length >= 4 && !busy;
  }, menuId, { timeout: 8_000 }).then(() => ({ kind: 'panel' })).catch(error => ({ kind: 'panel-error', error }));
  const first = await Promise.race([panel, navigation.then(url => url ? { kind: 'handoff', url } : { kind: 'handoff-timeout' })]);
  if (first.kind === 'handoff') {
    const destination = new URL(first.url);
    if (destination.hostname !== 'accounts.google.com') throw new Error(`storage: unexpected external handoff ${destination.hostname}`);
    results.push({ id: menuId, group, ok: true, durationMs: Date.now() - started, reauthHandoff: true, destinationHost: destination.hostname });
    return;
  }
  if (first.kind === 'panel-error') throw first.error;
  const state = await visiblePanelState();
  if (!state.panelFound || !state.selected || state.textLength < 4 || state.busy) throw new Error(`storage panel invalid: ${JSON.stringify(state)}`);
  results.push({ id: menuId, group, ok: true, durationMs: Date.now() - started, ...state });
}

async function verifyTax(tab, alreadyActive, started) {
  stage('tax-handoff');
  const navigation = page.waitForRequest(request => {
    try {
      const destination = new URL(request.url());
      return request.isNavigationRequest() && request.frame() === page.mainFrame() && destination.hostname === 'tax.ekodi.kr';
    } catch { return false; }
  }, { timeout: 10_000 });
  await clickFast(tab);
  const request = await navigation;
  const destination = new URL(request.url());
  if (destination.hostname !== 'tax.ekodi.kr') throw new Error(`tax: wrong handoff destination ${destination.hostname}`);
  const probe = await fetch(destination.origin + '/', { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  if (probe.status < 200 || probe.status >= 400) throw new Error(`tax: destination health probe returned HTTP ${probe.status}`);
  results.push({ id: menuId, group, ok: true, durationMs: Date.now() - started, destination: destination.origin + '/', destinationStatus: probe.status });
}

async function verifyNormal(tab, alreadyActive, started) {
  if (!alreadyActive) await clickFast(tab);
  stage('panel');
  await page.waitForFunction(section => {
    return [...document.querySelectorAll('[data-panel]')].some(node => {
      const ids = String(node.dataset.panel || '').split(/\s+/).filter(Boolean);
      const style = getComputedStyle(node);
      const text = String(node.innerText || '').replace(/\s+/g, ' ').trim();
      return ids.includes(section) && !node.hidden && !node.classList.contains('hidden-panel') && style.display !== 'none' && style.visibility !== 'hidden' && text.length >= 4;
    });
  }, menuId, { timeout: 5_000 });
  let state = await visiblePanelState();
  if (!state.panelFound || !state.selected || state.textLength < 4) throw new Error(`panel invalid: ${JSON.stringify(state)}`);
  if (state.busy) {
    await waitForSettledPanel();
    state = await visiblePanelState();
    if (state.busy) throw new Error(`loading indicator remained active: ${JSON.stringify(state)}`);
  }
  results.push({ id: menuId, group, ok: true, durationMs: Date.now() - started, ...state });
}

try {
  stage('browser');
  browser = await chromium.launch({ headless: true, timeout: 20_000 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  context.setDefaultTimeout(5_000);
  context.setDefaultNavigationTimeout(15_000);
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => {
    try { const url = new URL(request.url()); if (url.hostname === 'admin.ekodi.kr' && /\.(?:js|css)(?:$|\?)/.test(url.pathname + url.search)) failedAdminAssets.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`); } catch {}
  });

  stage('navigation');
  await page.goto(authenticatedEntryUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await waitForReady();
  stage('registry');
  const productionOrder = await page.evaluate(() => window.EKODIAdminPanels?.visibleMenuOrder || []);
  if (productionOrder.length !== menuIds.length) throw new Error(`Expected ${menuIds.length} visible menus, got ${productionOrder.length}`);
  for (const id of menuIds) if (!productionOrder.includes(id)) throw new Error(`Production menu registry missing ${id}`);

  const started = Date.now();
  await selectWorkArea();
  stage('tab');
  const tab = page.locator(`button.admin-context-tab[data-admin-context-section="${menuId}"]`);
  await tab.waitFor({ state: 'visible', timeout: 5_000 });
  const aria = await tab.getAttribute('aria-selected');
  const classes = String(await tab.getAttribute('class') || '');
  const alreadyActive = aria === 'true' || classes.split(/\s+/).includes('active');
  if (menuId === 'storage') await verifyStorage(tab, alreadyActive, started);
  else if (menuId === 'tax') await verifyTax(tab, alreadyActive, started);
  else await verifyNormal(tab, alreadyActive, started);

  stage('diagnostics');
  if (failedAdminAssets.length) throw new Error(`Admin JS/CSS request failures: ${failedAdminAssets.join(' | ')}`);
  if (pageErrors.length) throw new Error(`Uncaught page errors: ${pageErrors.join(' | ')}`);
  const serious = consoleErrors.filter(text => /(?:TypeError|ReferenceError|SyntaxError|uncaught|failed to load module|blocked untrusted admin handoff)/i.test(text));
  if (serious.length) throw new Error(`Serious console errors: ${serious.join(' | ')}`);
} catch (error) {
  fatal = error;
  console.error(`[E2E:${menuId}] fatal stage=${currentStage} ${error?.stack || error}`);
} finally {
  const report = {
    generatedAt: new Date().toISOString(), baseUrl, menuId, expectedMenuCount: 1,
    checkedMenuCount: results.length, passed: !fatal, lastStage: currentStage, results,
    diagnostics: { pageErrors, consoleErrors: consoleErrors.slice(-40), failedAdminAssets },
    error: fatal ? String(fatal?.stack || fatal?.message || fatal) : null,
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  if (browser) await browser.close().catch(() => {});
}

if (fatal) throw fatal;
console.log(`[E2E:${menuId}] passed`);
