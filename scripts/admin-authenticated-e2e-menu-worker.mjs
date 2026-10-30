import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { adminMenuOrder, getAdminMenuForSection, getAdminMenuGroupForSection, getAdminMenuItem } from '../admin-menu-registry.js';
import { AI_ROUTER_SCORE_POLICY } from '../ai-router-score.js';
import { verifyPublicationVisualProof } from './lib/admin-public-site-visual-proof.mjs';

const token = String(process.env.E2E_ADMIN_TOKEN || '').trim();
const menuId = String(process.env.E2E_MENU_ID || '').trim();
if (!token) throw new Error('E2E_ADMIN_TOKEN is required');
if (!menuId) throw new Error('E2E_MENU_ID is required');

const menuIds = adminMenuOrder();
if (!menuIds.includes(menuId)) throw new Error(`Unknown Admin menu: ${menuId}`);
const group = getAdminMenuGroupForSection(menuId);
const adminOrigin = 'https://ekodi.kr';
const baseUrl = `${adminOrigin}/admin/`;
const authenticatedEntryUrl = `${baseUrl}?route=finance`;
const isCanonicalAdminUrl = url => url.hostname === 'ekodi.kr' && (url.pathname === '/admin' || url.pathname.startsWith('/admin/'));
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
let adminEntryTransport = null;
let currentStage = 'bootstrap';
const stage = value => { currentStage = value; console.log(`[E2E:${menuId}] stage=${value}`); };
const interactionReadyTimeoutMs = 15_000;

async function clickFast(locator) {
  await locator.waitFor({ state: 'visible', timeout: interactionReadyTimeoutMs });
  await locator.click({ force: true, noWaitAfter: true, timeout: interactionReadyTimeoutMs });
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

async function prepareTargetDemand() {
  stage('target-demand');
  const selector = `.sidebar nav [data-demand-feature][data-section="${menuId}"], .sidebar nav [data-demand-feature][data-lazy-section="${menuId}"]`;
  const placeholder = page.locator(selector).first();
  if (!await placeholder.count()) return;
  const demandKey = String(await placeholder.getAttribute('data-demand-feature') || '').trim();
  if (!demandKey) throw new Error(`${menuId}: demand placeholder is missing its loader key`);
  await page.evaluate(async key => {
    if (!window.EKODIAdminDemand?.activate) throw new Error('Admin demand runtime unavailable');
    await window.EKODIAdminDemand.activate(key);
  }, demandKey);
  await page.waitForFunction(section => {
    const nodes = [...document.querySelectorAll('.sidebar nav [data-section], .sidebar nav [data-lazy-section]')];
    const target = nodes.find(node => node.dataset.section === section || node.dataset.lazySection === section);
    return Boolean(target && !target.hasAttribute('data-demand-feature') && target.getAttribute('aria-busy') !== 'true' && !target.classList.contains('is-loading'));
  }, menuId, { timeout: interactionReadyTimeoutMs });
}

async function waitForAdminNavigationIdle() {
  stage('pre-handoff-idle');
  let previous = '';
  let stableSamples = 0;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForLoadState('domcontentloaded', { timeout: 3_000 }).catch(() => {});
    const current = page.url();
    if (!isCanonicalAdminUrl(new URL(current))) throw new Error(`Admin navigation left the canonical surface before Tax handoff: ${current}`);
    stableSamples = current === previous ? stableSamples + 1 : 0;
    previous = current;
    if (stableSamples >= 2) return current;
    await page.waitForTimeout(250);
  }
  throw new Error(`Admin navigation did not settle before Tax handoff: ${page.url()}`);
}

async function selectWorkArea() {
  stage('global');
  const global = page.locator(`button.admin-global-nav[data-admin-global-group="${group}"]`);
  // ADMIN-LEFT-FLAT-MENU-001: area captions are hidden; activate the area control directly.
  await global.waitFor({ state: 'attached', timeout: interactionReadyTimeoutMs });
  const aria = await global.getAttribute('aria-current');
  const classes = String(await global.getAttribute('class') || '');
  if (aria !== 'page' && !classes.split(/\s+/).includes('active')) await global.evaluate(node => { node.click(); return true; });
  await page.waitForFunction(target => [...document.querySelectorAll('button[data-admin-global-group]')].some(node => node.dataset.adminGlobalGroup === target && (node.getAttribute('aria-current') === 'page' || node.classList.contains('active'))), group, { timeout: interactionReadyTimeoutMs });
}

async function resolveMenuTrigger() {
  // ADMIN-IA-V3: menu entries are .admin-detail-item; detail routes nested
  // under the open menu are .admin-detail-tab.
  const detailSelector = `button:is(.admin-detail-item,.admin-detail-tab)[data-admin-detail-section="${menuId}"]`;
  const detail = page.locator(detailSelector).first();
  if (await detail.count() && await detail.isVisible().catch(() => false)) return detail;

  const owner = getAdminMenuForSection(menuId)?.id || '';
  const menuButton = owner ? page.locator(`button.admin-detail-item[data-admin-detail-menu="${owner}"]`).first() : null;
  if (menuButton && await menuButton.count() && await menuButton.isVisible().catch(() => false)) {
    await clickFast(menuButton);
    await detail.waitFor({ state: 'visible', timeout: interactionReadyTimeoutMs });
    return detail;
  }

  const more = page.locator(`button[data-admin-detail-more="${group}"]`).first();
  if (await more.count() && await more.isVisible().catch(() => false)) {
    await clickFast(more);
    await detail.waitFor({ state: 'visible', timeout: interactionReadyTimeoutMs });
    return detail;
  }

  throw new Error(`${menuId}: no visible left-navigation trigger after selecting work area ${group}`);
}

async function visiblePanelState() {
  return page.evaluate(section => {
    const panel = [...document.querySelectorAll('[data-panel]')].find(node => {
      const ids = String(node.dataset.panel || '').split(/\s+/).filter(Boolean);
      const style = getComputedStyle(node);
      return ids.includes(section) && !node.hidden && !node.classList.contains('hidden-panel') && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const detail = document.querySelector(`button:is(.admin-detail-item,.admin-detail-tab)[data-admin-detail-section="${section}"]`);
    const text = String(panel?.innerText || '').replace(/\s+/g, ' ').trim();
    const busy = panel ? [panel, ...panel.querySelectorAll('[aria-busy="true"],.loading,.spinner')].filter(node => {
      if (!node.matches('[aria-busy="true"],.loading,.spinner')) return false;
      const style = getComputedStyle(node);
      return node.getAttribute('aria-hidden') !== 'true' && !node.hidden && style.display !== 'none' && style.visibility !== 'hidden';
    }).length : 0;
    return {
      panelFound: Boolean(panel), textLength: text.length, busy,
      selected: window.EKODIAdminPanels?.current?.() === section || detail?.getAttribute('aria-current') === 'page' || detail?.classList.contains('active') || false,
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
      return request.isNavigationRequest() && request.frame() === page.mainFrame() && !isCanonicalAdminUrl(url);
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

async function verifyAdminHandoff(trigger, started) {
  const definition = getAdminMenuItem(menuId);
  if (!definition?.href || definition.adminHandoff !== true) throw new Error(`${menuId}: admin handoff contract missing`);
  const expected = new URL(definition.href, baseUrl);
  const source = page.locator(`.sidebar nav .nav[data-section="${menuId}"]`).first();
  await source.waitFor({ state:'attached', timeout:5_000 });
  const sourceHref = await source.getAttribute('href');
  const sourceTarget = await source.getAttribute('target');
  if (!sourceHref || new URL(sourceHref, baseUrl).href !== expected.href) throw new Error(`${menuId}: admin handoff href drifted: ${sourceHref || '(missing)'}`);
  if (sourceTarget === '_blank') throw new Error(`${menuId}: admin handoff must not open a separate browser context`);

  stage('admin-handoff');
  const responsePromise = page.waitForResponse(response => {
    try {
      const url = new URL(response.url());
      return response.request().resourceType() === 'document'
        && url.origin === expected.origin
        && url.pathname.replace(/\/+$/, '') === expected.pathname.replace(/\/+$/, '');
    } catch { return false; }
  }, { timeout:12_000 }).catch(() => null);

  await clickFast(trigger);
  try {
    await page.waitForURL(url => url.origin === expected.origin
      && url.pathname.replace(/\/+$/, '') === expected.pathname.replace(/\/+$/, ''), { waitUntil:'commit', timeout:12_000 });
  } catch (error) {
    const actual = new URL(page.url());
    if (actual.origin !== expected.origin || actual.pathname.replace(/\/+$/, '') !== expected.pathname.replace(/\/+$/, '')) throw error;
  }
  const response = await responsePromise;
  if (response && (response.status() < 200 || response.status() >= 400)) throw new Error(`${menuId}: admin handoff destination returned HTTP ${response.status()}`);
  const destination = new URL(page.url());
  results.push({
    id:menuId, group, ok:true, durationMs:Date.now()-started,
    adminHandoff:true, destination:destination.href,
    status:response?.status() ?? null,
  });
}

async function verifyTax(tab, alreadyActive, started) {
  stage('tax-handoff');
  const writeVerification = process.env.E2E_TAX_WRITE_VERIFY === '1';
  const navigation = page.waitForRequest(request => {
    try {
      const destination = new URL(request.url());
      return request.isNavigationRequest() && request.frame() === page.mainFrame() && destination.origin === 'https://ekodi.kr' && destination.pathname === '/tax';
    } catch { return false; }
  }, { timeout: 10_000 });
  await clickFast(tab);
  const request = await navigation;
  const destination = new URL(request.url());
  if (destination.origin !== 'https://ekodi.kr' || destination.pathname !== '/tax') throw new Error(`tax: wrong handoff destination ${destination.hostname}`);
  try {
    await page.waitForURL(url => url.origin === 'https://ekodi.kr' && url.pathname === '/tax', { waitUntil:'commit', timeout:15_000 });
  } catch (error) {
    if (new URL(page.url()).origin !== 'https://ekodi.kr' || new URL(page.url()).pathname !== '/tax') throw error;
  }
  stage('tax-session-handoff');
  await page.waitForFunction(() => Boolean(sessionStorage.getItem('ekodi-auth-token')) && location.hash === '', null, { timeout:15_000 });
  await page.waitForFunction(() => document.querySelector('#notice')?.classList.contains('good'), null, { timeout:15_000 });

  async function readProfile(profileId) {
    return page.evaluate(async id => {
      const auth = sessionStorage.getItem('ekodi-auth-token') || '';
      const response = await fetch('/api/finance/tax-profiles?organizationId=EKODIBIZ', {
        headers:{ accept:'application/json', authorization:`Bearer ${auth}` }, cache:'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      const profile = Array.isArray(payload.profiles) ? payload.profiles.find(item => Number(item.id) === Number(id)) : null;
      return { status:response.status, profile };
    }, profileId);
  }
  if (writeVerification) {
    const suppliersTab = page.locator('button[data-tab="suppliers"]');
    await clickFast(suppliersTab);
    await page.waitForFunction(() => {
      const view = document.querySelector('[data-view="suppliers"]');
      return Boolean(view && !view.classList.contains('hidden'));
    }, null, { timeout:5_000 });
  }
  const edit = page.locator('button[data-edit-supplier]').first();
  await edit.waitFor({ state:writeVerification ? 'visible' : 'attached', timeout:10_000 });
  const profileId = Number(await edit.getAttribute('data-edit-supplier'));
  if (!Number.isInteger(profileId) || profileId <= 0) throw new Error('tax: invalid supplier profile id');
  const before = await readProfile(profileId);
  if (before.status !== 200 || !before.profile) throw new Error(`tax: authenticated supplier read failed HTTP ${before.status}`);

  if (!writeVerification) {
    results.push({
      id:menuId, group, ok:true, durationMs:Date.now()-started,
      destination:'https://ekodi.kr/tax', tokenHandoffVerified:true,
      authenticatedReadStatus:before.status, supplierProfileId:profileId,
      supplierSaveVerification:'not-requested'
    });
    return;
  }

  stage('tax-supplier-edit');
  await clickFast(edit);
  const modal = page.locator('#modal');
  await modal.waitFor({ state:'visible', timeout:8_000 });
  const modalTitle = String(await page.locator('#modalTitle').textContent() || '').trim();
  if (modalTitle !== '공급자 수정') throw new Error(`tax: supplier edit modal mismatch: ${modalTitle}`);
  const save = page.locator('#supplierSave');
  await save.waitFor({ state:'visible', timeout:5_000 });
  const writeResponse = page.waitForResponse(response => {
    try {
      const url = new URL(response.url());
      return response.request().method() === 'PUT' && url.pathname === `/api/finance/tax-profiles/${profileId}`;
    } catch { return false; }
  }, { timeout:12_000 });
  await save.click({ noWaitAfter:true, timeout:5_000 });
  const response = await writeResponse;
  if (response.status() !== 200) {
    const payload = await response.text().catch(() => '');
    throw new Error(`tax: supplier UI save returned HTTP ${response.status()} ${payload.slice(0,180)}`);
  }
  await modal.waitFor({ state:'hidden', timeout:10_000 });
  await page.waitForFunction(() => document.querySelector('#notice')?.classList.contains('good'), null, { timeout:10_000 });

  stage('tax-supplier-readback');
  const after = await readProfile(profileId);
  if (after.status !== 200 || !after.profile) throw new Error(`tax: supplier readback failed HTTP ${after.status}`);
  const fields = ['profileName','corpNum','taxRegId','corpName','ceoName','addr','bizType','bizClass','contactName','tel','email','isDefault','active'];
  const changed = fields.filter(key => JSON.stringify(before.profile[key] ?? null) !== JSON.stringify(after.profile[key] ?? null));
  if (changed.length) throw new Error(`tax: value-preserving save changed fields: ${changed.join(',')}`);

  results.push({
    id:menuId, group, ok:true, durationMs:Date.now()-started,
    destination:'https://ekodi.kr/tax', tokenHandoffVerified:true,
    authenticatedReadStatus:before.status, supplierProfileId:profileId,
    supplierSaveVerification:'passed', writeStatus:response.status(),
    persistenceReadbackStatus:after.status, persistenceVerified:true,
    comparedFieldCount:fields.length
  });
}

async function verifyPublicSiteControls(tab, alreadyActive, started) {
  stage('public-site-controls-ready');
  if (!alreadyActive) await clickFast(tab);
  await page.waitForFunction(() => typeof window.EKODIPublicSiteControls?.load === 'function', null, { timeout: 10_000 });

  stage('public-site-controls-api');
  const response = await fetch('https://ekodi.kr/api/control/public-sites', {
    headers: { accept: 'application/json', authorization: `Bearer ${token}`, origin: adminOrigin },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) throw new Error(`public-site-controls: API returned HTTP ${response.status}`);
  const corsOrigin = response.headers.get('access-control-allow-origin') || '';
  if (corsOrigin !== adminOrigin) throw new Error(`public-site-controls: production CORS origin mismatch: ${corsOrigin || 'missing'}`);
  const payload = await response.json().catch(() => ({}));
  if (!Array.isArray(payload.sites)) throw new Error('public-site-controls: API payload missing sites array');

  stage('public-site-controls-render');
  await page.evaluate(() => window.EKODIPublicSiteControls.load());
  const siteChoice = page.locator('#publicSiteControlsPanel [data-psc-select="cgma"]');
  await siteChoice.waitFor({ state: 'visible', timeout: 8_000 });
  await siteChoice.click();
  const form = page.locator('#publicSiteControlsPanel form[data-psc-form][data-public-site-id="cgma"]');
  await form.waitFor({ state: 'visible', timeout: 8_000 });
  const state = await visiblePanelState();
  const domainText = String(await form.locator('.psc-subtext').first().textContent() || '');
  const publicStatus = await form.locator('select[name="publicStatus"]').inputValue();
  const maintenanceDisplayType = await form.locator('select[name="maintenanceDisplayType"]').inputValue();
  const redirectMode = await form.locator('select[name="redirectMode"]').inputValue();
  const badge = String(await form.locator('[data-psc-badge]').textContent() || '').trim();
  const message = String(await page.locator('#publicSiteControlsPanel [data-psc-message]').textContent() || '').replace(/\s+/g, ' ').trim();
  if (!state.panelFound || !state.selected || state.busy) throw new Error(`public-site-controls panel invalid: ${JSON.stringify(state)}`);
  if (!domainText.includes('ekodi.kr/cgma')) throw new Error(`public-site-controls: CGMA canonical path missing: ${domainText}`);
  if (!['public', 'maintenance'].includes(publicStatus)) throw new Error(`public-site-controls: invalid publicStatus ${publicStatus}`);
  if (!['default', 'url'].includes(maintenanceDisplayType)) throw new Error(`public-site-controls: invalid maintenanceDisplayType ${maintenanceDisplayType}`);
  if (!['button', 'auto'].includes(redirectMode)) throw new Error(`public-site-controls: invalid redirectMode ${redirectMode}`);
  if (!badge) throw new Error('public-site-controls: empty status badge');
  if (!message.includes('상태를 확인했습니다')) throw new Error(`public-site-controls: load confirmation missing: ${message}`);
  stage('public-site-controls-five-viewports');
  const visualProof = await verifyPublicationVisualProof(page, artifactsDir);
  results.push({ id: menuId, group, ok: true, durationMs: Date.now() - started, ...state, apiStatus: response.status, corsOrigin, domain: 'cgma.or.kr', publicStatus, maintenanceDisplayType, redirectMode, badge, visualProof:{readOnly:visualProof.readOnly,productionMutation:false,widths:visualProof.widths,screenshotCount:visualProof.screenshotCount,searchVerified:true,filterVerified:true,resetVerified:true} });
  console.log('[PROD-E2E] public-site-controls: authenticated five viewport visual proof, read-only search/filter/reset and redacted screenshots PASS');
}

async function verifyAiSettings(tab, alreadyActive, started) {
  stage('ai-settings-ready');
  if (!alreadyActive) await clickFast(tab);
  await page.waitForFunction(() => typeof window.EKODIAIManagement?.load === 'function', null, { timeout: 10_000 });
  stage('ai-settings-api');
  const response = await fetch('https://ekodi.kr/api/control/ai/v8/collaboration-settings', {
    headers: { accept:'application/json', authorization:`Bearer ${token}`, origin:adminOrigin },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) throw new Error(`ai-settings: API returned HTTP ${response.status}`);
  const corsOrigin = response.headers.get('access-control-allow-origin') || '';
  if (corsOrigin !== adminOrigin) throw new Error(`ai-settings: production CORS origin mismatch: ${corsOrigin || 'missing'}`);
  const payload = await response.json().catch(() => ({}));
  const policy = payload.policy || {};
  const weights = policy.router?.weights || {};
  const weightSum = Object.values(weights).reduce((sum,value) => sum + Number(value || 0), 0);
  if (payload.ok !== true) throw new Error('ai-settings: API payload not ok');
  if (policy.collaborationByDefault !== true) throw new Error('ai-settings: collaborationByDefault unlocked');
  if (policy.execution?.cloudFirst !== true || JSON.stringify(policy.execution?.order) !== JSON.stringify(['cloud','remote','local'])) throw new Error('ai-settings: Cloud First contract drift');
  if (policy.governance?.requireHumanApprovalForDestructiveAction !== true) throw new Error('ai-settings: destructive human gate drift');
  if (policy.openai?.secretStorage !== 'server_secret_only') throw new Error('ai-settings: secret storage contract drift');
  if (policy.resources?.strategy !== 'personal-first') throw new Error('ai-settings: personal-first strategy drift');
  if (Math.abs(weightSum - 1) > 0.00001) throw new Error(`ai-settings: Router Score weights sum to ${weightSum}`);
  if (payload.routerScore?.algorithmVersion !== AI_ROUTER_SCORE_POLICY.version) throw new Error(`ai-settings: Router Score version mismatch ${payload.routerScore?.algorithmVersion || 'missing'}`);
  stage('ai-settings-render');
  await page.evaluate(() => window.EKODIAIManagement.load());
  await page.locator('#aiManagementBody .ai-mgmt-hero').waitFor({ state:'visible', timeout:8_000 });
  const state = await visiblePanelState();
  const panel = page.locator('#aiManagementPanel');
  const providerWeights = await panel.locator('[data-provider-weight]').count();
  const guards = (await panel.locator('.ai-mgmt-guards').allTextContents()).join(' ').replace(/\s+/g,' ').trim();
  const saveVisible = await panel.locator('#aiMgmtSave').isVisible();
  if (!state.panelFound || !state.selected || state.busy) throw new Error(`ai-settings panel invalid: ${JSON.stringify(state)}`);
  if (providerWeights !== Object.keys(AI_ROUTER_SCORE_POLICY.weights).length) throw new Error(`ai-settings: expected ${Object.keys(AI_ROUTER_SCORE_POLICY.weights).length} provider weights, got ${providerWeights}`);
  for (const label of ['Collaboration ON · LOCK','Cloud First · LOCK','Origin AI · LOCK','Destructive Human Gate · LOCK','Secret Server Only · LOCK']) if (!guards.includes(label)) throw new Error(`ai-settings: guard missing: ${label}`);
  if (!saveVisible) throw new Error('ai-settings: save control missing');
  results.push({ id:menuId, group, ok:true, durationMs:Date.now()-started, ...state, apiStatus:response.status, corsOrigin, routerScoreVersion:payload.routerScore.algorithmVersion, routerWeightCount:providerWeights, revision:Number(payload.revision)||0, source:payload.source||'unknown', productionMutation:false });
}

async function verifyLanguageStatus(tab, alreadyActive, started) {
  stage('language-status-ready');
  if (!alreadyActive) await clickFast(tab);
  await page.waitForFunction(() => typeof window.EKODILanguageStatus?.load === 'function', null, { timeout: 10_000 });
  stage('language-status-api');
  const response = await fetch('https://ekodi.kr/api/control/language-status', {
    headers: { accept:'application/json', authorization:`Bearer ${token}`, origin:adminOrigin },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) throw new Error(`language-status: API returned HTTP ${response.status}`);
  const payload = await response.json().catch(() => ({}));
  if (!Array.isArray(payload.sites) || !Array.isArray(payload.languages)) throw new Error('language-status: invalid payload');
  if (!payload.sites.some(site => site.id === 'ekodi')) throw new Error('language-status: root site missing');
  if (payload.sites.some(site => !Array.isArray(site.languages))) throw new Error('language-status: site languages missing');
  stage('language-status-render');
  await page.evaluate(() => window.EKODILanguageStatus.load());
  const panel = page.locator('#languageStatusPanel');
  await panel.locator('[data-language-site="ekodi"]').waitFor({ state:'visible', timeout:8_000 });
  await page.waitForFunction(() => document.querySelector('#languageStatusPanel')?.dataset.languageStatusReady === 'true', null, { timeout:8_000 });
  const state = await visiblePanelState();
  const controls = await panel.locator('form,input[type="checkbox"],button[type="submit"]').count();
  const siteCards = await panel.locator('[data-language-site]').count();
  const languageRows = await panel.locator('[data-language-locale]').count();
  const ready = await panel.getAttribute('data-language-status-ready');
  if (!state.panelFound || !state.selected || state.busy) throw new Error(`language-status panel invalid: ${JSON.stringify(state)}`);
  if (controls !== 0) throw new Error('language-status: mutation control exposed');
  if (ready !== 'true' || siteCards < 1 || languageRows < 1) throw new Error(`language-status: semantic readiness contract failed ready=${ready} sites=${siteCards} languages=${languageRows}`);
  results.push({ id:menuId, group, ok:true, durationMs:Date.now()-started, ...state, apiStatus:response.status, sites:payload.sites.length, languages:payload.languages.length, semanticReady:true });
}

async function verifyMaturity(tab, alreadyActive, started) {
  stage('maturity-api');
  const endpoint='https://ekodi.kr/api/control/platform-maturity';
  const response=await fetch(endpoint,{headers:{accept:'application/json',authorization:`Bearer ${token}`,origin:adminOrigin},signal:AbortSignal.timeout(10_000)});
  if(response.status!==200)throw new Error(`maturity: API returned HTTP ${response.status}`);
  const payload=await response.json().catch(()=>({}));
  if(payload.certificationStatus!=='not-claimed'||payload.current?.certificationStatus!=='not-claimed')throw new Error('maturity: certification boundary drift');
  if(!Array.isArray(payload.model?.domains)||payload.model.domains.length<1)throw new Error('maturity: model domains missing');
  if(!Array.isArray(payload.history)||payload.history.length<1)throw new Error('maturity: history summary missing');
  if(!payload.serviceScopes?.summary?.totalScopes||!Array.isArray(payload.serviceScopes.services)||!Array.isArray(payload.serviceScopes.workspaceSites)||!Array.isArray(payload.serviceScopes.systemFunctions))throw new Error('maturity: subordinate service/site/function coverage missing');
  if([...payload.serviceScopes.services,...payload.serviceScopes.workspaceSites,...payload.serviceScopes.systemFunctions].some(item=>item.localMaturityScore!==null))throw new Error('maturity: unevidenced subordinate score exposed');
  if(payload.serviceScopes.summary.systemFunctions!==payload.serviceScopes.systemFunctions.length)throw new Error('maturity: system function summary mismatch');
  if(!alreadyActive)await clickFast(tab);
  stage('maturity-render');
  await page.waitForFunction(()=>{
    const panel=document.querySelector('[data-panel~="maturity"]');
    const view=panel?.querySelector('[data-maturity-view]');
    const status=panel?.querySelector('[data-maturity-status]');
    const text=String(view?.innerText||'').replace(/\s+/g,' ').trim();
    return Boolean(panel&&view&&!view.hidden&&status?.hidden&&text.includes('종합 내부 성숙도')&&text.includes('/ 5.00'));
  },null,{timeout:10_000});
  const state=await visiblePanelState();
  const text=String(await page.locator('[data-panel~="maturity"] [data-maturity-view]').textContent()||'').replace(/\s+/g,' ').trim();
  if(!state.panelFound||!state.selected||state.busy)throw new Error(`maturity panel invalid: ${JSON.stringify(state)}`);
  if(!text.includes('외부 인증 주장 안 함'))throw new Error('maturity: certification status not rendered');
  const scopeRows=await page.locator('[data-panel~=\"maturity\"] [data-maturity-scope-row]').count();
  if(scopeRows!==payload.serviceScopes.summary.totalScopes)throw new Error(`maturity: subordinate scope render mismatch expected=${payload.serviceScopes.summary.totalScopes} actual=${scopeRows}`);
  if(text.includes('불러오지 못했습니다'))throw new Error('maturity: data load error rendered');
  results.push({id:menuId,group,ok:true,durationMs:Date.now()-started,...state,apiStatus:response.status,assessmentDate:payload.assessmentDate,historyCount:payload.history.length,subordinateScopeCount:payload.serviceScopes.summary.totalScopes,systemFunctionCount:payload.serviceScopes.summary.systemFunctions});
}

async function verifyRegistryHref(trigger, started) {
  const definition = getAdminMenuItem(menuId);
  if (!definition?.href || definition.adminHandoff) throw new Error(`${menuId}: direct registry href contract missing`);
  const expected = new URL(definition.href);
  const source = page.locator(`.sidebar nav .nav[data-section="${menuId}"]`);
  await source.waitFor({ state:'attached', timeout:5_000 });
  const sourceHref = await source.getAttribute('href');
  const sourceTarget = await source.getAttribute('target');
  if (!sourceHref || new URL(sourceHref, baseUrl).href !== expected.href) throw new Error(`${menuId}: production registry href does not match canonical destination`);
  if (sourceTarget !== '_blank') throw new Error(`${menuId}: direct registry href must open as an isolated external admin surface`);
  stage('registry-handoff');
  const popupPromise = page.waitForEvent('popup', { timeout:10_000 });
  await clickFast(trigger);
  const popup = await popupPromise;
  try {
    await popup.waitForURL(url => url.origin === expected.origin && url.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, ''), { waitUntil:'commit', timeout:10_000 });
    const destination = new URL(popup.url());
    const probe = await fetch(expected.href, { redirect:'manual', signal:AbortSignal.timeout(10_000) });
    if (probe.status < 200 || probe.status >= 400) throw new Error(`${menuId}: destination returned HTTP ${probe.status}`);
    const html = await probe.text();
    if (html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length < 4) throw new Error(`${menuId}: destination did not render meaningful content`);
    if (menuId === 'cmpmyi' && (probe.headers.get('x-ekodi-route') !== 'cmpmyi-store-portfolio-admin' || !html.includes('통합 매장 운영'))) throw new Error('cmpmyi: dedicated portfolio admin contract missing');
    results.push({ id:menuId, group, ok:true, durationMs:Date.now()-started, destination:destination.href, destinationStatus:probe.status, route:probe.headers.get('x-ekodi-route')||'' });
  } finally {
    await popup.close().catch(() => {});
  }
}

async function verifyCommandWorkbench(started) {
  stage('command-workbench');
  await page.waitForFunction(() => {
    const body=document.body;
    const frame=document.querySelector('#ekodiControlHomeFrame');
    return window.EKODIAdminPanels?.current?.()==='command-home'
      && body.classList.contains('admin-control-home')
      && Boolean(frame&&frame.getBoundingClientRect().height>100);
  },null,{timeout:15000});
  const frame=page.frameLocator('#ekodiControlHomeFrame');
  await frame.locator('#commandInput').waitFor({state:'visible',timeout:15000});
  await frame.locator('#controlEmbeddedToolbar').waitFor({state:'visible',timeout:15000});
  const state=await page.evaluate(()=>{
    const frame=document.querySelector('#ekodiControlHomeFrame');
    const parentSidebar=document.querySelector('.sidebar');
    const box=frame?.getBoundingClientRect(),left=parentSidebar?.getBoundingClientRect().right||0;
    return {
      commandWorkbench:Boolean(frame),
      selected:window.EKODIAdminPanels?.current?.()==='command-home',
      currentSection:window.EKODIAdminPanels?.current?.()||'',
      pathname:location.pathname,
      frameWidth:box?.width||0,frameHeight:box?.height||0,
      frameRightOfSidebar:Boolean(box&&box.left>=left-2),
    };
  });
  if(!state.commandWorkbench||!state.selected||state.currentSection!=='command-home'||state.pathname!=='/admin/'||state.frameWidth<300||state.frameHeight<300||!state.frameRightOfSidebar)throw new Error('Native Control command workbench invalid: '+JSON.stringify(state));
  results.push({id:menuId,group,ok:true,durationMs:Date.now()-started,...state});
}

async function verifyPersonalFinance(tab, alreadyActive, started) {
  stage('personal-finance-control');
  if (!alreadyActive) await clickFast(tab);

  stage('personal-finance-api');
  const response = await fetch('https://ekodi.kr/api/control/personal-finance', {
    headers: { accept:'application/json', authorization:`Bearer ${token}`, origin:adminOrigin },
    signal:AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== 200) throw new Error(`personal-finance: apex control proxy returned HTTP ${response.status} ${payload.code || payload.error || ''}`.trim());
  const corsOrigin = response.headers.get('access-control-allow-origin') || '';
  const proxyMode = response.headers.get('x-ekodi-personal-finance-proxy') || '';
  if (corsOrigin !== adminOrigin) throw new Error(`personal-finance: CORS origin mismatch: ${corsOrigin || 'missing'}`);
  if (proxyMode !== 'service-binding-v1') throw new Error(`personal-finance: service binding proxy evidence missing: ${proxyMode || 'missing'}`);
  if (payload.service?.canonicalPath !== '/api/control/personal-finance' || payload.service?.serviceBinding !== 'PERSONAL_FINANCE') throw new Error('personal-finance: canonical service-binding metadata drift');
  if (payload.service?.dataBoundary !== 'dedicated-d1') throw new Error('personal-finance: dedicated D1 boundary missing');
  if (payload.safety?.actionCeiling !== 'L2' || payload.safety?.financialExecution !== false || payload.safety?.aiWriteEnabled !== false || payload.safety?.personalDataAdminReadable !== false) throw new Error('personal-finance: immutable safety boundary drift');

  stage('personal-finance-render');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#personalFinanceAdminPanel');
    if (!panel || panel.hidden || panel.classList.contains('hidden-panel')) return false;
    if (panel.getAttribute('aria-busy') === 'true') return false;
    return Boolean(panel.querySelector('.pf-admin-summary') || panel.querySelector('.pf-admin-error'));
  }, null, { timeout: 12_000 });
  const state = await page.evaluate(() => {
    const panel = document.querySelector('#personalFinanceAdminPanel');
    const summary = panel?.querySelector('.pf-admin-summary');
    const error = panel?.querySelector('.pf-admin-error');
    const text = String(panel?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      loaded: Boolean(summary),
      error: String(error?.innerText || '').replace(/\s+/g, ' ').trim(),
      text,
      textLength: text.length,
      proxyRequestSeen: performance.getEntriesByType('resource').some(entry => {
        try { return new URL(entry.name, location.href).pathname === '/api/control/personal-finance'; } catch { return false; }
      }),
    };
  });
  if (!state.loaded || state.error || !state.proxyRequestSeen) throw new Error(`personal-finance control failed: ${JSON.stringify(state)}`);
  for (const marker of ['개인재무 운영 설정','관리자 원장 열람','차단']) if (!state.text.includes(marker)) throw new Error(`personal-finance semantic marker missing: ${marker}`);
  results.push({ id:menuId, group, ok:true, durationMs:Date.now()-started, personalFinanceControl:true, apiStatus:response.status, corsOrigin, proxyMode, canonicalPath:payload.service.canonicalPath, productionMutation:false, ...state });
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
  }, menuId, { timeout: 8_000 });
  let state = await visiblePanelState();
  if (!state.panelFound || !state.selected || state.textLength < 4) throw new Error(`panel invalid: ${JSON.stringify(state)}`);
  if (state.busy) {
    await waitForSettledPanel();
    state = await visiblePanelState();
    if (state.busy) throw new Error(`loading indicator remained active: ${JSON.stringify(state)}`);
  }
  results.push({ id: menuId, group, ok: true, durationMs: Date.now() - started, ...state });
}


// ADMIN-ARCH-ISOLATED-PROOF-20261029 — independent actual authenticated
// production viewport measurement, no Social Hub dependency and no mutation.
// Screenshots crop the read-only architecture layers, not account/identity UI.
async function verifyArchitectureResponsive(tab, alreadyActive, started) {
  await verifyNormal(tab, alreadyActive, started);
  stage('architecture-viewport-proof');
  await page.waitForFunction(() => {
    const panel = document.querySelector('.content > .architecture[data-panel~="architecture"]');
    return Boolean(panel && !panel.hidden && !panel.classList.contains('hidden-panel')
      && getComputedStyle(panel).display!=='none'
      && panel.querySelectorAll('#structureLayers > article').length>=9);
  }, null, {timeout:15000});

  const expected = [[1440,3],[1366,3],[768,2],[390,1],[320,1]];
  const measurements=[];
  try {
    for (const [width, columns] of expected) {
      await page.setViewportSize({width,height:width<=390?844:1000});
      const sample = await page.evaluate(() => {
        const panel=document.querySelector('.content > .architecture[data-panel~="architecture"]');
        const layers=panel?.querySelector('#structureLayers');
        const registry=panel?.querySelector('#structureServiceRegistry .structure-service-grid');
        const platforms=panel?.querySelector('#ekodiArchitectureMap .system-map-platform-grid');
        const flow=panel?.querySelector('#structureFlow');
        const colCount=node => node?getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length:null;
        const arrows=flow?[...flow.children].filter(x=>x.tagName==='B'):[];
        return {
          width:innerWidth,
          panelVisible:Boolean(panel&&!panel.hidden&&!panel.classList.contains('hidden-panel')&&getComputedStyle(panel).display!=='none'),
          layers:colCount(layers),registry:colCount(registry),platforms:colCount(platforms),
          cards:layers?.querySelectorAll(':scope > article').length||0,
          flowCards:flow?.querySelectorAll(':scope > div').length||0,
          arrowsVisible:arrows.filter(x=>getComputedStyle(x).display!=='none').length,
          arrowWidths:arrows.map(x=>Math.round(x.getBoundingClientRect().width)),
          overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
          layerOverflow:layers?Math.max(0,layers.scrollWidth-layers.clientWidth):0,
        };
      });
      if (!sample.panelVisible || sample.width!==width || sample.layers!==columns
          || (sample.registry!==null&&sample.registry!==columns)
          || (sample.platforms!==null&&sample.platforms!==columns)
          || sample.cards<9 || sample.flowCards!==4
          || sample.overflow>2 || sample.layerOverflow>2
          || (width>=1366&&(sample.arrowsVisible!==3||sample.arrowWidths.some(w=>w>30)))
          || (width<=390&&sample.arrowsVisible!==0)) {
        throw new Error('ADMIN_ARCHITECTURE_FOCUSED_LIVE_E2E: '+JSON.stringify({expectedColumns:columns,...sample}));
      }
      measurements.push({width,columns:sample.layers,overflow:sample.overflow});
      if ([768,390,320].includes(width)) {
        await page.locator('#structureLayers').screenshot({
          path:path.join(artifactsDir,'architecture-'+width+'.png'),
          timeout:12000,
        });
      }
    }
  } finally {
    await page.setViewportSize({width:1440,height:1100});
  }
  // ADMIN-ARCH-PROOF-ARTIFACT-001: persist only anonymized grid geometry before
  // unrelated later menu/Assist checks. Cropped screenshots contain structure
  // cards only, never the identity, account or admin header/sidebar.
  await fs.writeFile(path.join(artifactsDir,'architecture-geometry.json'),JSON.stringify({
    schemaVersion:1,
    check:'authenticated-architecture-responsive',
    passed:true,
    measurements,
    screenshotCount:3,
  },null,2));
  const record=results.find(x=>x.id===menuId);
  if(record)Object.assign(record,{readOnly:true,isolatedArchitecture:true,measurements,screenshotCount:3});
  console.log('[E2E:architecture] authenticated independent five-width geometry PASS '+JSON.stringify(measurements));
}


async function verifySocialInventory(tab, alreadyActive, started) {
  // SOCIAL-ID-001: read-only live verification. Never create test social identities.
  await verifyNormal(tab, alreadyActive, started);
  stage('social-inventory-readonly');
  await page.waitForFunction(() => {
    const status = document.querySelector('#ekodiSocialAccountRegistry [data-social-message]');
    return Boolean(status && (status.textContent.trim().startsWith('조회 시각:') || status.classList.contains('ekodi-social-error')));
  }, null, { timeout: 12000 });
  const evidence = await page.evaluate(async () => {
    const token = sessionStorage.getItem('ekodi-auth-token') || '';
    const url = '/api/control/external-accounts/social-identities?scope=all';
    const response = await fetch(url, {method:'GET',headers:{authorization:'Bearer '+token},credentials:'omit',cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    const guest = await fetch(url, {method:'GET',credentials:'omit',cache:'no-store'});
    const panel = document.querySelector('#ekodiSocialAccountRegistry');
    const message = panel?.querySelector('[data-social-message]');
    // Only aggregate/safe policy evidence; never log account rows, user IDs or credentials.
    return {
      authenticatedStatus:response.status,guestStatus:guest.status,
      noStoreCache: /(?:^|,)\s*no-store(?:,|$)/i.test(response.headers.get('cache-control')||'') &&
        /(?:^|,)\s*no-store(?:,|$)/i.test(guest.headers.get('cache-control')||''),
      scope:data.ownerScope || '',storageReady:data.storageReady === true,
      providerCount:Array.isArray(data.providers) ? data.providers.length : 0,
      identityCount:Array.isArray(data.accounts) ? data.accounts.length : 0,
      existingCount:Array.isArray(data.existingServiceConnections) ? data.existingServiceConnections.length : 0,
      recordsTruncated:data.recordsTruncated === true,
      uiProviderCount:panel?.querySelectorAll('.ekodi-social-card').length || 0,
      registrationEnabled:data.policy?.registrationEnabled,
      oauthLinkingEnabled:data.policy?.oauthLinkingEnabled,
      socialLoginEnabled:data.policy?.socialLoginEnabled,
      autoPublishingEnabled:data.policy?.autoPublishingEnabled,
      uiSuccess:Boolean(message?.textContent?.trim().startsWith('조회 시각:')),
      uiError:Boolean(message?.classList.contains('ekodi-social-error'))
    };
  });
  if(evidence.authenticatedStatus!==200 || evidence.guestStatus!==401 ||
     evidence.noStoreCache!==true ||
     evidence.scope!=='platform'||!evidence.storageReady||
     evidence.providerCount!==13||evidence.uiProviderCount!==13||
     !evidence.uiSuccess||evidence.uiError||
     evidence.registrationEnabled!==false || evidence.oauthLinkingEnabled!==false ||
     evidence.socialLoginEnabled!==false || evidence.autoPublishingEnabled!==false){
    throw new Error('Social account live inventory or dormant policy failed: '+JSON.stringify(evidence));
  }
  // Exercise only the live, already-rendered DOM. Never write a social record,
  // create an identity, send a search query to a server, or log actual IDs.
  stage('social-search-filter-counts');
  const ui=await page.evaluate(expected => {
    const panel=document.querySelector('#ekodiSocialAccountRegistry');
    if(!panel)return {ok:false,failures:['missing panel']};
    const cards=[...panel.querySelectorAll('[data-social-provider-card]')];
    const rows=[...panel.querySelectorAll('[data-social-record]')];
    const failures=[];
    let checks=0;
    const assert=(name,passed)=>{checks++;if(!passed)failures.push(name)};
    const control=(selector,value,eventName)=>{
      const input=panel.querySelector(selector);
      if(!input){failures.push('control missing: '+selector);return false}
      input.value=value;
      input.dispatchEvent(new Event(eventName,{bubbles:true}));
      return true;
    };
    const visible=nodes=>nodes.filter(node=>!node.hidden).length;
    const countLabel=(selector,count)=>String(panel.querySelector(selector)?.textContent||'').includes('표시 '+count+' /');
    const metricValue=label=>{
      const entry=[...panel.querySelectorAll('[data-social-metrics] article')].find(node=>node.querySelector('small')?.textContent===label);
      return Number(entry?.querySelector('strong')?.textContent);
    };
    assert('providers metric equals API count',metricValue('연결 대상 서비스')===expected.providers);
    assert('EKODI identity metric equals API count',metricValue('조회된 신규 등록 기록')===expected.identities);
    assert('existing connections metric equals API count',metricValue('조회된 기존 서비스 기록')===expected.existing);
    assert('provider DOM equals API count',cards.length===expected.providers);
    assert('account DOM equals API rows',rows.length===expected.identities+expected.existing);
    assert('bounded preview disclosure',!expected.truncated||String(panel.querySelector('[data-social-account-count]')?.textContent||'').includes('최근 '));

    const providerSearch='[data-social-search]',providerFilter='[data-social-filter]';
    for(const filter of ['all','existing','registered','unregistered']){
      if(!control(providerFilter,filter,'change'))break;
      const expectedCount=cards.filter(card=>{
        const registered=Number(card.dataset.registered)>0;
        const existing=Number(card.dataset.existing)>0;
        return filter==='all'||(filter==='existing'&&existing)||(filter==='registered'&&registered)||(filter==='unregistered'&&!registered&&!existing);
      }).length;
      assert('provider filter '+filter,visible(cards)===expectedCount&&countLabel('[data-social-result-count]',expectedCount));
    }
    control(providerFilter,'all','change');
    if(cards.length){
      // Name is used only inside the browser; never copy provider or identity
      // names into the persisted evidence payload.
      const term=String(cards[0].dataset.searchText||'').trim();
      control(providerSearch,term,'input');
      const expectedCount=cards.filter(card=>String(card.dataset.searchText||'').includes(term)).length;
      assert('live provider name search',term.length>0&&visible(cards)===expectedCount&&countLabel('[data-social-result-count]',expectedCount));
    }
    control(providerSearch,'__ekodi_no_matching_provider_e2e__','input');
    assert('no-match provider empty state',visible(cards)===0&&panel.querySelector('[data-social-empty]')?.hidden===false);
    control(providerSearch,'','input');

    const accountSearch='[data-social-account-search]',accountSource='[data-social-account-source]',accountFilter='[data-social-account-filter]';
    const rowMatches=(source,status,query)=>rows.filter(row=>
      (source==='all'||row.dataset.socialRecord===source)&&
      (status==='all'||row.dataset.status===status)&&
      String(row.dataset.searchText||'').includes(query)
    ).length;
    for(const source of ['all','identity','existing']){
      if(!control(accountSource,source,'change'))break;
      const matching=rowMatches(source,'all','');
      assert('account source '+source,visible(rows)===matching&&countLabel('[data-social-account-count]',matching));
    }
    control(accountSource,'all','change');
    const select=panel.querySelector(accountFilter);
    for(const status of [...(select?.options||[])].map(option=>option.value)){
      if(!control(accountFilter,status,'change'))break;
      const matching=rowMatches('all',status,'');
      assert('account status '+status,visible(rows)===matching&&countLabel('[data-social-account-count]',matching));
    }
    control(accountFilter,'all','change');
    let liveIdMatch=false;
    const firstIdentity=rows.find(row=>row.dataset.socialRecord==='identity');
    if(firstIdentity){
      const id=String(firstIdentity.querySelector('small')?.textContent||'').replace(/^EKODI ID:\s*/,'').trim();
      if(id&&id!=='확인 필요'){
        control(accountSearch,id,'input');
        const matching=rowMatches('all','all',id.toLocaleLowerCase());
        assert('existing EKODI ID live lookup',matching>0&&visible(rows)===matching&&countLabel('[data-social-account-count]',matching));
        liveIdMatch=true;
      }
    }
    control(accountSearch,'__ekodi_no_matching_account_e2e__','input');
    assert('no-match account search',visible(rows)===0&&countLabel('[data-social-account-count]',0));
    assert('account empty state is honest',panel.querySelector('[data-social-account-empty]')?.hidden===(rows.length===0));
    control(accountSearch,'','input');
    assert('account filters reset',visible(rows)===rows.length&&countLabel('[data-social-account-count]',rows.length));
    assert('provider filters reset',visible(cards)===cards.length&&countLabel('[data-social-result-count]',cards.length));
    return {ok:failures.length===0,failures,checks,providerCards:cards.length,accountRows:rows.length,liveIdMatch,
      statusFilterOptions:select?.options.length||0,sourceFilterOptions:panel.querySelector(accountSource)?.options.length||0};
  }, {providers:evidence.providerCount,identities:evidence.identityCount,existing:evidence.existingCount,truncated:evidence.recordsTruncated});
  if(!ui.ok)throw new Error('Social account live DOM search/filter/count assertion failed: '+JSON.stringify(ui));

  // A screenshot is a private CI artifact and must never expose names, EKODI
  // IDs or provider account IDs from registered records. Retain only 7 days.
  stage('social-five-responsive-viewports');
  const viewports=[];
  const widths=[320,390,768,1366,1440];
  for(const width of widths){
    await page.setViewportSize({width,height:980});
    if(width<=390){
      // Mobile navigation must not obscure the account workspace. Close it
      // through the real keyboard handler rather than mutating DOM classes.
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>{
        const sidebar=document.querySelector('.sidebar');
        const rect=sidebar?.getBoundingClientRect();
        return Boolean(sidebar&&!sidebar.classList.contains('open')&&
          !document.body.classList.contains('admin-mobile-drawer-open')&&rect&&rect.right<=2);
      },null,{timeout:5000});
    }
    // A tall panel screenshot at 320/390 can leave the document scrolled when
    // the viewport grows to 768. Restore a real user-visible heading position
    // before measuring hit-testing; never bypass an actual overlay.
    await page.locator('#ekodiSocialAccountRegistry .ekodi-social-heading h2').evaluate(
      heading=>heading.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})
    );
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    const state=await page.evaluate(()=>{
      const panel=document.querySelector('#ekodiSocialAccountRegistry');
      const rect=panel?.getBoundingClientRect();
      const style=panel?getComputedStyle(panel):null;
      const architectureVisible=[...document.querySelectorAll('.content [data-panel]')].some(node=>{
        const ids=String(node.dataset.panel||'').split(/\s+/);
        const computed=getComputedStyle(node);
        return ids.includes('architecture')&&!node.hidden&&!node.classList.contains('hidden-panel')&&computed.display!=='none'&&computed.visibility!=='hidden';
      });
      const heading=panel?.querySelector('.ekodi-social-heading h2');
      const headingRect=heading?.getBoundingClientRect();
      const point=headingRect?document.elementFromPoint(
        Math.min(innerWidth-4,Math.max(4,headingRect.left+12)),
        Math.min(innerHeight-4,Math.max(4,headingRect.top+12))):null;
      const headingAccessible=Boolean(headingRect&&headingRect.width>0&&headingRect.height>0&&
        headingRect.left>=0&&headingRect.top>=0&&headingRect.top<innerHeight&&
        point&&(point===heading||heading.contains(point)));
      return {width:innerWidth,headingAccessible,panelVisible:Boolean(rect&&rect.width>0&&rect.height>0&&style?.display!=='none'&&style?.visibility!=='hidden'),
        panelFitsViewport:Boolean(rect&&rect.left>=-2&&rect.right<=innerWidth+2),
        documentScrollWidth:document.documentElement.scrollWidth,
        horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,
        architectureHidden:!architectureVisible,
        selected:window.EKODIAdminPanels?.current?.()==='social-accounts'};
    });
    if(state.width!==width||!state.headingAccessible||!state.panelVisible||!state.panelFitsViewport||state.horizontalOverflow||!state.architectureHidden||!state.selected)
      throw new Error('Social account viewport verification failed: '+JSON.stringify(state));
    // Crop to the account workspace itself: a full-page screenshot can expose
    // the signed-in account identifier in the Admin sidebar outside the record mask.
    // Keep the per-record mask as a second, independent privacy boundary.
    await page.locator('#ekodiSocialAccountRegistry').screenshot({
      path:path.join(artifactsDir,'social-accounts-'+width+'.png'),
      mask:[page.locator('#ekodiSocialAccountRegistry [data-social-record]')],maskColor:'#d1d5db'
    });
    viewports.push(state);
  }
  const outcome=results.find(x=>x.id===menuId);
  if(outcome)Object.assign(outcome,{
    inventoryVerified:true,policyDisabled:true,authenticatedRead:true,anonymousDenied:true,providerCount:13,
    identityCount:evidence.identityCount,existingCount:evidence.existingCount,recordsTruncated:evidence.recordsTruncated,
    liveSearchFiltersVerified:true,uiChecks:ui.checks,accountIdLiveMatchExercised:ui.liveIdMatch,
    responsiveViewports:viewports.map(item=>item.width),redactedScreenshots:viewports.length
  });
  console.log('[PROD-E2E] social-accounts: API 200/guest 401, 13 providers, safe policy, '+ui.checks+' live UI checks, 5 responsive viewports, redacted screenshots PASS');
}

try {
  stage('browser');
  browser = await chromium.launch({ headless: true, timeout: 20_000 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(value => {
    sessionStorage.setItem('ekodi-auth-token', value);
  }, token);
  context.setDefaultTimeout(5_000);
  context.setDefaultNavigationTimeout(15_000);
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => {
    try { const url = new URL(request.url()); if (url.hostname === 'ekodi.kr' && /\.(?:js|css)(?:$|\?)/.test(url.pathname + url.search)) failedAdminAssets.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`); } catch {}
  });

  stage('navigation');
  const entryResponse = await page.goto(authenticatedEntryUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  const entryHeaders = entryResponse?.headers() || {};
  // Only bounded transport metadata. Never record the URL, query, token, headers or HTML body.
  adminEntryTransport = {
    status: entryResponse?.status() ?? null,
    contentType: String(entryHeaders['content-type'] || '').split(';')[0].slice(0, 80),
    cfCacheStatus: String(entryHeaders['cf-cache-status'] || '').slice(0, 40),
  };
  if (adminEntryTransport.status === 429) {
    throw new Error('CF-QUOTA-001 circuit open: HTTP 429 at canonical Admin entry; no retry');
  }
  if ([401, 403].includes(adminEntryTransport.status)) {
    throw new Error('Admin entry rejected by production authentication boundary');
  }
  await waitForReady();
  stage('registry');
  const productionOrder = await page.evaluate(() => window.EKODIAdminPanels?.visibleMenuOrder || []);
  if (productionOrder.length !== menuIds.length) throw new Error(`Expected ${menuIds.length} visible menus, got ${productionOrder.length}`);
  for (const id of menuIds) if (!productionOrder.includes(id)) throw new Error(`Production menu registry missing ${id}`);

  const started = Date.now();
  await prepareTargetDemand();
  await selectWorkArea();
  if (menuId === 'tax') await waitForAdminNavigationIdle();
  const directDefinition = getAdminMenuItem(menuId);
  if (menuId === 'command-home') {
    stage('command-home');
    await page.waitForFunction(() => window.EKODIAdminPanels?.current?.() === 'command-home', null, { timeout: interactionReadyTimeoutMs });
    await verifyCommandWorkbench(started);
  } else {
    stage('sidebar-trigger');
    const trigger = await resolveMenuTrigger();
    if (directDefinition?.href && !directDefinition.adminHandoff) {
      stage('registry-link');
      await verifyRegistryHref(trigger, started);
    } else if (directDefinition?.href && directDefinition.adminHandoff === true && menuId !== 'tax') {
      await verifyAdminHandoff(trigger, started);
    } else {
      let alreadyActive = await page.evaluate(section => window.EKODIAdminPanels?.current?.() === section, menuId);
      if (alreadyActive) {
        stage('active-panel-check');
        const activeState = await visiblePanelState();
        alreadyActive = Boolean(activeState.panelFound && activeState.selected && activeState.textLength >= 4);
      }
      if (menuId === 'storage') await verifyStorage(trigger, alreadyActive, started);
      else if (menuId === 'tax') await verifyTax(trigger, alreadyActive, started);
      else if (menuId === 'public-site-controls') await verifyPublicSiteControls(trigger, alreadyActive, started);
      else if (menuId === 'language-status') await verifyLanguageStatus(trigger, alreadyActive, started);
      else if (menuId === 'maturity') await verifyMaturity(trigger, alreadyActive, started);
      else if (menuId === 'ai-settings') await verifyAiSettings(trigger, alreadyActive, started);
      else if (menuId === 'personal-finance') await verifyPersonalFinance(trigger, alreadyActive, started);
      else if (menuId === 'social-accounts') await verifySocialInventory(trigger, alreadyActive, started);
      else if (menuId === 'architecture') await verifyArchitectureResponsive(trigger, alreadyActive, started);
      else await verifyNormal(trigger, alreadyActive, started);
    }
  }

  stage('diagnostics');
  if (failedAdminAssets.length) throw new Error(`Admin JS/CSS request failures: ${failedAdminAssets.join(' | ')}`);
  if (pageErrors.length) throw new Error(`Uncaught page errors: ${pageErrors.join(' | ')}`);
  const serious = consoleErrors.filter(text => /(?:TypeError|ReferenceError|SyntaxError|uncaught|failed to load module|blocked untrusted admin handoff)/i.test(text));
  if (serious.length) throw new Error(`Serious console errors: ${serious.join(' | ')}`);
} catch (error) {
  fatal = error;
  if (currentStage.startsWith('ready-') && page) {
    const state = await page.evaluate(() => ({
      route: location.pathname,
      hasSessionToken: Boolean(sessionStorage.getItem('ekodi-auth-token')),
      appHidden: document.querySelector('#app')?.hidden ?? null,
      loginHidden: document.querySelector('#loginScreen')?.hidden ?? null,
      adminReady: document.documentElement.dataset.ekodiAdminReady === 'true',
      sessionVerified: Boolean(document.querySelector('#apiState')?.textContent?.includes('정상')),
      coreLoaded: Boolean(window.EKODIAdminCore),
    })).catch(() => ({unavailable:true}));
    console.error(`[E2E:${menuId}] safe readiness state ${JSON.stringify({...state, transport:adminEntryTransport})}`);
  }
  console.error(`[E2E:${menuId}] fatal stage=${currentStage} ${error?.stack || error}`);
} finally {
  const report = {
    generatedAt: new Date().toISOString(), baseUrl, menuId, expectedMenuCount: 1,
    checkedMenuCount: results.length, passed: !fatal, lastStage: currentStage, results,
    diagnostics: { pageErrors, consoleErrors: consoleErrors.slice(-40), failedAdminAssets, adminEntryTransport },
    error: fatal ? String(fatal?.stack || fatal?.message || fatal) : null,
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  if (browser) await browser.close().catch(() => {});
}

if (fatal) throw fatal;
console.log(`[E2E:${menuId}] passed`);