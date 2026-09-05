import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { adminMenuOrder, getAdminMenuGroupForSection } from '../admin-menu-registry.js';

const token = String(process.env.E2E_ADMIN_TOKEN || '').trim();
if (!token) throw new Error('E2E_ADMIN_TOKEN is required');

let currentStage = 'bootstrap';
function stage(value) {
  currentStage = value;
  console.log(`[E2E] stage=${value}`);
}
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const heartbeat = setInterval(() => {
  console.log(`[E2E] heartbeat stage=${currentStage}`);
}, 15_000);
heartbeat.unref?.();

const hardStop = setTimeout(() => {
  console.error(`[E2E] hard timeout: authenticated admin browser verification exceeded 4 minutes; stage=${currentStage}`);
  process.exit(124);
}, 240_000);
hardStop.unref?.();

const baseUrl = 'https://admin.ekodi.kr/';
const authenticatedEntryUrl = `${baseUrl}?route=finance#ekodi_admin_token=${token}`;
const artifactsDir = path.resolve('artifacts/admin-authenticated-e2e');
await fs.mkdir(artifactsDir, { recursive: true });

const menuIds = adminMenuOrder();
const groups = Object.fromEntries(menuIds.map(id => [id, getAdminMenuGroupForSection(id)]));
const expectedMenuCount = menuIds.length;
const internalMenuIds = menuIds.filter(id => id !== 'tax');
const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedAdminAssets = [];

stage('browser-launch');
const browser = await withTimeout(chromium.launch({ headless: true, timeout: 20_000 }), 25_000, 'Chromium launch');
stage('browser-context');
const context = await withTimeout(browser.newContext({ viewport: { width: 1440, height: 1100 } }), 10_000, 'browser context');
context.setDefaultTimeout(5_000);
context.setDefaultNavigationTimeout(15_000);
const page = await withTimeout(context.newPage(), 10_000, 'browser page');
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

async function safePageState(label = 'page-state') {
  return withTimeout(page.evaluate(() => ({
    url: location.href,
    tokenPresent: Boolean(sessionStorage.getItem('ekodi-auth-token')),
    appFound: Boolean(document.querySelector('#app')),
    appHidden: document.querySelector('#app')?.hidden ?? null,
    loginHidden: document.querySelector('#loginScreen')?.hidden ?? null,
    apiState: document.querySelector('#apiState')?.textContent?.trim() || '',
    adminReady: document.documentElement.dataset.ekodiAdminReady || '',
    corePresent: Boolean(window.EKODIAdminCore),
    panelsPresent: Boolean(window.EKODIAdminPanels),
    sidebarPresent: Boolean(window.EKODIAdminSidebar),
  })), 5_000, label).catch(error => ({ diagnosticError: String(error?.message || error) }));
}

async function waitForAdminReady() {
  stage('ready-token');
  await page.waitForFunction(() => sessionStorage.getItem('ekodi-auth-token'), null, { timeout: 15_000 });
  stage('ready-app-visible');
  await page.waitForSelector('#app:not([hidden])', { timeout: 15_000 });
  stage('ready-runtime');
  await page.waitForFunction(() => window.EKODIAdminPanels && window.EKODIAdminSidebar, null, { timeout: 15_000 });
  stage('ready-session-normal');
  await page.waitForFunction(() => document.querySelector('#apiState')?.textContent?.includes('정상'), null, { timeout: 15_000 });
  const state = await safePageState('ready-state');
  console.log(`[E2E] admin-ready ${JSON.stringify(state)}`);
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
      const text = String(panel.innerText || '').replace(/\s+/g, ' ').trim();
      return !panel.hidden && !panel.classList.contains('hidden-panel') && style.display !== 'none' && style.visibility !== 'hidden' && text.length >= 4;
    });
  }, id, { timeout: 5_000 });
}

async function menuDiagnostics(id) {
  return withTimeout(page.evaluate(section => {
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
      return node.getAttribute('aria-hidden') !== 'true'
        && !node.hidden
        && style.display !== 'none'
        && style.visibility !== 'hidden';
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
  }, id), 5_000, `${id} diagnostics`);
}

async function clickMenu(id) {
  const started = Date.now();
  const group = groups[id];
  stage(`menu-${id}-global`);
  console.log(`[E2E] ${id}: begin`);
  try {
    const global = globalButton(group);
    await global.waitFor({ state: 'visible', timeout: 5_000 });
    await global.click({ timeout: 5_000 });

    stage(`menu-${id}-tab`);
    const tab = page.locator(`button.admin-context-tab[data-admin-context-section="${id}"]`);
    await tab.waitFor({ state: 'visible', timeout: 5_000 });
    await tab.click({ timeout: 5_000 });
    stage(`menu-${id}-panel`);
    await waitForVisiblePanel(id);

    let state = await menuDiagnostics(id);
    if (!state.panelFound) throw new Error('visible panel not found');
    if (!state.selected) throw new Error('context tab did not become active');
    if (state.textLength < 4) throw new Error('rendered panel is effectively empty');

    if (state.busy) {
      stage(`menu-${id}-loading`);
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
  stage('menu-tax-global');
  console.log('[E2E] tax: begin');
  const global = globalButton('business');
  await global.waitFor({ state: 'visible', timeout: 5_000 });
  await global.click({ timeout: 5_000 });
  stage('menu-tax-tab');
  const taxTab = page.locator('button.admin-context-tab[data-admin-context-section="tax"]');
  await taxTab.waitFor({ state: 'visible', timeout: 5_000 });
  stage('menu-tax-navigation');
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
  stage('tax-return-admin');
  await page.goto(authenticatedEntryUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await waitForAdminReady();
}

let fatal = null;
try {
  stage('initial-navigation');
  await page.goto(authenticatedEntryUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  console.log(`[E2E] domcontentloaded url=${page.url()}`);
  await waitForAdminReady();

  stage('menu-registry');
  const productionOrder = await withTimeout(page.evaluate(() => window.EKODIAdminPanels?.visibleMenuOrder || []), 5_000, 'production menu order');
  console.log(`[E2E] production-menu-order ${JSON.stringify(productionOrder)}`);
  if (productionOrder.length !== expectedMenuCount) throw new Error(`Expected ${expectedMenuCount} visible admin menus, got ${productionOrder.length}`);
  for (const id of menuIds) if (!productionOrder.includes(id)) throw new Error(`Production menu registry missing ${id}`);

  for (const id of internalMenuIds) await clickMenu(id);
  await clickTaxHandoff();

  stage('final-diagnostics');
  if (failedAdminAssets.length) throw new Error(`Admin JS/CSS request failures: ${failedAdminAssets.join(' | ')}`);
  if (pageErrors.length) throw new Error(`Uncaught page errors: ${pageErrors.join(' | ')}`);
  const seriousConsole = consoleErrors.filter(text => /(?:TypeError|ReferenceError|SyntaxError|uncaught|failed to load module|blocked untrusted admin handoff)/i.test(text));
  if (seriousConsole.length) throw new Error(`Serious console errors: ${seriousConsole.join(' | ')}`);
} catch (error) {
  fatal = error;
  const state = await safePageState('fatal-state');
  console.error(`[E2E] fatal stage=${currentStage} error=${error?.message || error} state=${JSON.stringify(state)}`);
  await withTimeout(page.screenshot({ path: path.join(artifactsDir, 'failure.png'), fullPage: true }), 5_000, 'failure screenshot').catch(() => {});
} finally {
  stage('write-report');
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    expectedMenuCount,
    checkedMenuCount: results.length,
    passed: !fatal,
    lastStage: currentStage,
    results,
    diagnostics: {
      pageErrors,
      consoleErrors: consoleErrors.slice(-40),
      failedAdminAssets,
    },
    error: fatal ? String(fatal?.stack || fatal?.message || fatal) : null,
  };
  await fs.writeFile(path.join(artifactsDir, 'report.json'), JSON.stringify(report, null, 2));
  stage('browser-close');
  await withTimeout(browser.close(), 5_000, 'browser close').catch(error => console.warn(`[E2E] browser close warning: ${error?.message || error}`));
}

clearInterval(heartbeat);
clearTimeout(hardStop);
if (fatal) throw fatal;
stage('complete');
console.log(`Authenticated admin E2E passed: ${results.length}/${expectedMenuCount} menus clicked and rendered.`);